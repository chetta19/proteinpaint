#!/bin/bash

set -e

######## 
# NOTES
# - called from project root, e.g., `./build/deploy.sh $ENV`
# - checks out committed code into a subdirectory tmpbuild
# - calls webpack.config.$ENV to bundle *.js code
# - tars only the code that is needed (for examples, scr/* and build/* are not included in the build)
# - reuses serverconfig.json from the previously deployed build 
# - restarts node server
########

###############
# ARGUMENTS
###############

# default to deploying to ppdev
if (($# == 0)); then
	ENV="pp-test"
	REV="HEAD"
	DEPLOYER=$USER
elif (($# == 1)); then
	ENV=$1
	REV="HEAD"
	DEPLOYER=$USER
elif (($# == 2)); then
	ENV=$1
	REV=$2
	DEPLOYER=$USER
else 
	ENV=$1
	REV=$2
	DEPLOYER=$3
fi

########################
# PROCESS COMMIT INFO
########################

# convert $REV to standard numeric notation
if [[ $REV == "HEAD" ]]; then
	if [[ -d ../../.git ]]; then
		REV=$(git rev-parse --short HEAD)
	fi
fi

if [[ "$REV" == "HEAD" || "$REV" == "" ]]; then
	echo "Unable to convert the HEAD revision into a Git commit hash."
	exit 1
fi

#####################
# CONTEXTUAL CONFIG
#####################

APP=pp
WPSERVERMODE=production
WPSERVERDEVTOOL=''
WPCLIENTDEVTOOL=''

if [[ "$ENV" == "pp-irt" || "$ENV" == "pp-int-test" ]]; then
	DEPLOYER=genomeuser
	REMOTEHOST=pp-irt.stjude.org
	USERatREMOTE=$DEPLOYER@$REMOTEHOST
	REMOTEDIR=/opt/app/pp
	HOSTNAME=pp-int-test.stjude.org
	SUBDOMAIN=pp-int-test
	WPSERVERMODE=development
	WPSERVERDEVTOOL='source-map'
	WPCLIENTDEVTOOL='source-map'

elif [[ "$ENV" == "internal-prod" || "$ENV" == "pp-int" || "$ENV" == "pp-irp" || "$ENV" == "ppdev" || "$ENV" == "ppr" ]]; then
	DEPLOYER=genomeuser
	REMOTEHOST=pp-irp.stjude.org
	USERatREMOTE=$DEPLOYER@$REMOTEHOST
	REMOTEDIR=/opt/app/pp
	HOSTNAME=ppr.stjude.org
	SUBDOMAIN=ppr
	WPSERVERMODE=development
	WPSERVERDEVTOOL='source-map'
	WPCLIENTDEVTOOL='source-map'

elif [[ "$ENV" == "public-stage" || "$ENV" == "pp-test" || "$ENV" == "pp-prt" ]]; then
	DEPLOYER=genomeuser
	REMOTEHOST=pp-prt.stjude.org
	USERatREMOTE=$DEPLOYER@$REMOTEHOST
	REMOTEDIR=/opt/app/pp
	HOSTNAME=pp-test.stjude.org
	SUBDOMAIN=pp-test
	WPSERVERDEVTOOL='source-map'
	WPCLIENTDEVTOOL='source-map'

elif [[ "$ENV" == "public-prod" || "$ENV" == "pp-prp" || "$ENV" == "pp-prp1" ]]; then
	DEPLOYER=genomeuser
	REMOTEHOST=pp-prp1.stjude.org
	USERatREMOTE=$DEPLOYER@$REMOTEHOST
	REMOTEDIR=/opt/app/pp
	HOSTNAME=proteinpaint.stjude.org
	SUBDOMAIN=proteinpaint
	WPSERVERDEVTOOL='source-map'
	WPCLIENTDEVTOOL=''

elif [[ "$ENV" == "jump-prod" || "$ENV" == "vpn-prod" || "$ENV" == "prp1" ]]; then
	# 
	# requires these tunnel settings in ~/.ssh/config:
	# 
	# Host prp1
  # User          genomeuser
  # HostName      pp-prp1.stjude.org
  # ProxyCommand  ssh gnomeuser@svldtemp01.stjude.org nc %h %p 2> /dev/null
  #
	USERatREMOTE=prp1 
	REMOTEDIR=/opt/app/pp
	HOSTNAME=proteinpaint.stjude.org
	SUBDOMAIN=proteinpaint
	WPSERVERDEVTOOL='source-map'
	WPCLIENTDEVTOOL=''

elif [[ "$ENV" == "pp-ict" ]]; then
	DEPLOYER=genomeuser
	REMOTEHOST=pp-ict.stjude.org
	USERatREMOTE=$DEPLOYER@$REMOTEHOST
	REMOTEDIR=/opt/app/pp
	HOSTNAME=pp-int-test.stjude.org
	SUBDOMAIN=pp-int-test
	WPSERVERMODE=development
	WPSERVERDEVTOOL='source-map'
	WPCLIENTDEVTOOL='source-map'

elif [[ "$ENV" == "pp-icp" || "$ENV" == "ppc" ]]; then
	DEPLOYER=genomeuser
	REMOTEHOST=ppc.stjude.org
	USERatREMOTE=$DEPLOYER@$REMOTEHOST
	REMOTEDIR=/opt/app/pp
	HOSTNAME=ppc.stjude.org
	SUBDOMAIN=ppc
	WPSERVERDEVTOOL='source-map'
	WPCLIENTDEVTOOL='source-map'

else
	echo "Environment='$ENV' is not supported"
	exit 1
fi

##############################################
# Do NOT redeploy a build that is already
# available in the remote host machine
##############################################

RECENT=$(./help.sh $USERatREMOTE recent)
if [[ $(echo -e "$RECENT" | grep -l $REV) != "" ]]; then
	echo -e "\n"
	echo -e "Build version $REV is already deployed in $REMOTEHOST:$REMOTEDIR/available/."
	echo -e "Re-activating this build in the remote server ..."
	ssh -t $USERatREMOTE "
	cd $REMOTEDIR

	cp -rf active/node_modules available/$APP-$REV
	cp -f active/serverconfig.json available/$APP-$REV/
	cp -Rnf active/public/ available/$APP-$REV/
	cp -Rnf active/dataset/ available/$APP-$REV/

	chmod -R 755 available/$APP-$REV
	
	cd available/$APP-$REV
	# copy previous builds to allow reuse if validated by sccache and cargo
	[[ -d $PPRUSTACTIVEDIR ]] && mkdir -p $PPRUSTMODDIR && cp -rf $PPRUSTACTIVEDIR ./$PPRUSTMODDIR/
	npm install @stjude/proteinpaint-rust

	cd $REMOTEDIR
	ln -sfn /opt/app/pecan/portal/www/sjcharts/public available/$APP-$REV/public/sjcharts
	ln -sfn ./bin available/$APP-$REV/public/no-babel-polyfill
	
	./helpers/record.sh deployed
	./proteinpaint_run_node.sh $APP-$REV
	ln -sfn available/$APP-$REV active
	./helpers/purge.sh \"pp-*\"
	"
	exit 0
fi

#################################
# EXTRACT AND BUILD FROM COMMIT
#################################

if [[ -d tmpbuild && -f tmpbuild/$APP-$REV.tgz && $(grep -l "https://$HOSTNAME/bin" tmpbuild/$APP/public/bin/proteinpaint.js) != "" ]]; then
	echo "Reusing a previous matching build"
	cd tmpbuild
else 
	rm -Rf tmpbuild
	# remote repo not used, use local repo for now
	mkdir tmpbuild  # temporary empty workspace for checkedout commit
	cd ../..
	git archive HEAD | tar -x -C build/sj/tmpbuild/

	cd build/sj/tmpbuild

	# save some time by reusing parent folder's node_modules
	# but making sure to update to committed package.json
	ln -s ../../../node_modules .
	# npm update

	# create webpack bundle
	echo "Packing frontend bundles ..."
	npx webpack --config=client/webpack.config.js --env url=https://$HOSTNAME --env devtool=$WPCLIENTDEVTOOL

	echo "Packing backend bundle ..."
	npx webpack --config=server/webpack.config.js --env NODE_ENV=$WPSERVERMODE --env devtool=$WPSERVERDEVTOOL

	if [[ "$SUBDOMAIN" == "ppr" ]]; then
		# may need to support cohort.db.refresh,
		# as set via serverconfig dataset updateAttr
		npx webpack --config=utils/pnet/webpack.config.js
	fi

	cd rust
	npm pack
	cd ..

	# create dirs to put extracted files
	rm -rf $APP
	mkdir $APP
	mkdir $APP/public
	mkdir $APP/src
	mkdir $APP/rust

	mv rust/*.tgz $APP/rust
	mv server/server.js* $APP/
	mv server/package.json $APP/
	
	# need to modify the tarball name so that the rust build will be triggered via postinstall npm script
	# TODO: use lerna to automate and cache builds
	RUSTPKGVER=$(node -p "require('./rust/package.json').version")
	cd $APP
	npm pkg set dependencies.@stjude/proteinpaint-rust=./rust/stjude-proteinpaint-rust-$RUSTPKGVER.tgz
	cd ..

	mv server/genome $APP/
	mv server/dataset $APP/
	mv server/utils $APP/
	mv server/cards $APP/
	mv server/src/serverconfig.js $APP/src
	mv server/src/mds3.gdc.filter.js $APP/src
	mv server/shared $APP/
	# !!! TODO: old version of cohort.db.refresh will not be supported moving forward
	if [[ "$SUBDOMAIN" == "ppr" ]]; then
		# may need to support cohort.db.refresh,
		# as set via serverconfig dataset updateAttr
		mv utils/termdb $APP/utils/
		mv utils/pnet  $APP/utils/
	fi
	mv public/bin $APP/public/bin
	echo "$ENV $REV $(date)" > $APP/public/rev.txt

	if [[ "$ENV" == "public-stage" || "$ENV" == "public-prod" ||  "$SUBDOMAIN" == "proteinpaint" ]]; then
		cp public/pecan.html $APP/public/index.html
	else
		cp public/index.html $APP/public/index.html
	fi

	tar -czf $APP-$REV.tgz $APP
fi

##########
# DEPLOY
##########
PPRUSTMODDIR=node_modules/@stjude/proteinpaint-rust
PPRUSTACTIVEDIR=$REMOTEDIR/active/$PPRUSTMODDIR/target

echo "Transferring build to $USERatREMOTE"
scp $APP-$REV.tgz $USERatREMOTE:~
ssh -t $USERatREMOTE "
	# should exit on any error
	set -e
	
	tar --warning=no-unknown-keyword -xzf ~/$APP-$REV.tgz -C $REMOTEDIR/available/
	rm ~/$APP-$REV.tgz

	cd $REMOTEDIR
	mv -f available/$APP available/$APP-$REV
	cp -r active/node_modules available/$APP-$REV
	cp active/serverconfig.json available/$APP-$REV/
	cp -Rn active/public/ available/$APP-$REV/
	cp -Rn active/dataset/ available/$APP-$REV/

	chmod -R 755 available/$APP-$REV
	
	cd available/$APP-$REV
	# copy previous builds to allow reuse if validated by sccache and cargo
	[[ -d $PPRUSTACTIVEDIR ]] && mkdir -p $PPRUSTMODDIR && cp -rf $PPRUSTACTIVEDIR ./$PPRUSTMODDIR/
	npm install @stjude/proteinpaint-rust

	cd $REMOTEDIR
	ln -sfn /opt/app/pecan/portal/www/sjcharts/public available/$APP-$REV/public/sjcharts
	ln -sfn ./bin available/$APP-$REV/public/no-babel-polyfill
	
	./helpers/record.sh deployed
	./proteinpaint_run_node.sh $APP-$REV
	ln -sfn available/$APP-$REV active
	./helpers/purge.sh \"pp-*\"
"

#############
# CLEANUP
#############

cd ..
# rm -rf tmpbuild
exit 0
