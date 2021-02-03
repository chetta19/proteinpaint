#!/bin/bash

set -e

# 
# This will create a package from a clean work space to ensure that
# all built artifacts are traceable to a git commit.
#


usage() {
	echo "Usage:

	./build/publish.sh [-b] [-f] [ \"\" | dry | registry | dry | tgz ]

	-b packs backend code
	-f packs frontend code
	- defaults to packing both backend and frontend

	- no argument defaults to dry
	- dry: equivalent to 'npm publish --dry-run'
	- registry: equivalent to 'npm publish'
	- tgz: equivalent to 'npm pack'
	"
}


###############
# ARGUMENTS
###############

while getopts "bfh" opt; do
	case "${opt}" in
	b)
		PACK_BACKEND=1
		;;
	f)
		PACK_FRONTEND=1
		;;
	h)
		usage
		exit 1
		;;
	esac
done

shift $((OPTIND - 1))


# default to packing both backend and frontend unless either is specified
if [[ "$PACK_BACKEND" != 1 && "$PACK_FRONTEND" != 1 ]]; then
	PACK_BACKEND=1
	PACK_FRONTEND=1
fi


# default to deploying to ppdev
if (($# == 0)); then
	DEST="dry"
elif (($# == 1)); then
	DEST=$1
fi

if [[ "$DEST" != "dry" && "$DEST" != "registry" && "$DEST" != "tgz"  ]]; then
	usage
	exit 1
fi


#############################
# EXTRACT FROM COMMIT
# 
# ensure recoverability
#############################

# get commit sha1
REV=$(git rev-parse --short HEAD)
rm -Rf tmppack 
mkdir tmppack # temporary empty workspace for checkedout commit
git archive HEAD | tar -x -C tmppack/
#
# to-do?
# - option to use a customer-specific package that customizes files: [ dataset/*.js ]
# - or apply a hardcoded dataset filter after packing with the tgz option
# 
cp package.json tmppack/
cd tmppack
echo "$REV $(date)" > ./public/rev.txt

# save some time by reusing parent folder's node_modules
# but making sure to update to the committed package.json
ln -s ../node_modules node_modules
# npm update

########
# BUILD
########

# create bundles

if [[ "$PACK_BACKEND" == 1 ]]; then
	echo -e "\nBundling the server bin ...\n"
	npm run build-server
fi

if [[ "$PACK_FRONTEND" == 1 ]]; then
	echo -e "\nBundling the client bin ...\n"
	npx webpack --config=build/webpack.config.build.js --env.url="__PP_URL__"
	echo -e "\nPacking the client main ...\n"
	npx rollup -c ../build/rollup.config.js
fi

##########
# PACK
##########

npm pack
# delete everything in temp folder except the tar gz file
find . -type f ! -name '*.tgz' -delete
rm -rf node_modules public scripts
find . -type d -delete

# get the current tag
TAG="$(node -p "require('../package.json').version")"
# we will look for the tarball of the current package version
PKGVER="stjude-proteinpaint-$TAG.tgz"
tar -xzf "$PKGVER"
cd ../..
