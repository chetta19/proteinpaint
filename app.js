// JUMP __MDS __util __rank __smat

// cache
const ch_genemcount = {} // genome name - gene name - ds name - mutation class - count
const ch_dbtable = new Map() // k: db path, v: db stuff

const utils = require('./modules/utils')
const serverconfig = utils.serverconfig
exports.features = Object.freeze(serverconfig.features || {})
let examples

const tabixnoterror = s => {
	return s.startsWith('[M::test_and_fetch]')
}

const express = require('express'),
	util = require('util'),
	url = require('url'),
	http = require('http'),
	https = require('https'),
	fs = require('fs'),
	path = require('path'),
	got = require('got'),
	async = require('async'),
	lazy = require('lazy'),
	compression = require('compression'),
	child_process = require('child_process'),
	spawn = child_process.spawn,
	//sqlite3=require('sqlite3').verbose(), // TODO  replace by bettersqlite
	createCanvas = require('canvas').createCanvas,
	d3color = require('d3-color'),
	d3stratify = require('d3-hierarchy').stratify,
	stratinput = require('./src/tree').stratinput,
	bodyParser = require('body-parser'),
	imagesize = require('image-size'),
	readline = require('readline'),
	jsonwebtoken = require('jsonwebtoken'),
	common = require('./src/common'),
	vcf = require('./src/vcf'),
	bulk = require('./src/bulk'),
	bulksnv = require('./src/bulk.snv'),
	bulkcnv = require('./src/bulk.cnv'),
	bulkdel = require('./src/bulk.del'),
	bulkitd = require('./src/bulk.itd'),
	bulksv = require('./src/bulk.sv'),
	bulksvjson = require('./src/bulk.svjson'),
	bulktrunc = require('./src/bulk.trunc'),
	d3scale = require('d3-scale'),
	d3dsv = require('d3-dsv'),
	basicAuth = require('express-basic-auth'),
	termdb = require('./modules/termdb'),
	termdbbarsql = require('./modules/termdb.barsql'),
	bedgraphdot_request_closure = require('./modules/bedgraphdot'),
	bam_request_closure = require('./modules/bam'),
	aicheck_request_closure = require('./modules/aicheck'),
	bampile_request = require('./modules/bampile'),
	junction_request = require('./modules/junction'),
	bedj_request_closure = require('./modules/bedj'),
	blat_request_closure = require('./modules/blat').request_closure,
	mds3_request_closure = require('./modules/mds3.load'),
	mds2_init = require('./modules/mds2.init'),
	mds3_init = require('./modules/mds3.init'),
	mds2_load = require('./modules/mds2.load'),
	singlecell = require('./modules/singlecell'),
	fimo = require('./modules/fimo'),
	draw_partition = require('./modules/partitionmatrix').draw_partition,
	variant2samples_closure = require('./modules/variant2samples'),
	do_hicstat = require('./modules/hicstat').do_hicstat

/*
valuable globals
*/
const genomes = {}
const tabix = serverconfig.tabix || 'tabix'
const samtools = serverconfig.samtools || 'samtools'
const bcftools = serverconfig.bcftools || 'bcftools'
const bigwigsummary = serverconfig.bigwigsummary || 'bigWigSummary'
const hicstraw = serverconfig.hicstraw || 'straw'
let codedate, // date for code files last updated
	launchdate // server launch date
/*
this hardcoded term is kept same with notAnnotatedLabel in block.tk.mdsjunction.render
*/
const infoFilter_unannotated = 'Unannotated'

const app = express()
app.disable('x-powered-by')

if (serverconfig.users) {
	// { user1 : pass1, user2: pass2, ... }
	app.use(basicAuth({ users: serverconfig.users, challenge: true }))
}

app.use(bodyParser.json({}))
app.use(bodyParser.text({ limit: '1mb' }))
app.use(bodyParser.urlencoded({ extended: true }))

app.use((req, res, next) => {
	res.header('Access-Control-Allow-Origin', '*')
	res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization')
	if (req.method == 'GET' && !req.path.includes('.')) {
		// immutable response before expiration, client must revalidate after max-age
		// by convention, any path that has a dot will be treated as
		// a static file and not handled here with cache-control
		res.header('Cache-control', `immutable,max-age=${serverconfig.responseMaxAge || 1}`)
	}
	next()
})

/* when using webpack, should no longer use __dirname, otherwise cannot find the html files!
app.use(express.static(__dirname+'/public'))
*/
app.use(express.static(path.join(process.cwd(), './public')))
app.use(compression())

if (serverconfig.jwt) {
	console.log('JWT is activated')
	app.use((req, res, next) => {
		let j = {}
		if (req.body && req.method == 'POST') {
			if (typeof req.body == 'object') {
				j = req.body
			} else {
				try {
					j = JSON.parse(req.body)
				} catch (err) {
					res.send({ error: 'Invalid JSON for request body' })
					return
				}
			}
		}
		const jwt = j.jwt
			? j.jwt
			: req.headers && req.headers.authorization && req.headers.authorization.startsWith('Bearer ')
			? req.headers.authorization.split(' ')[1]
			: null
		if (!jwt) return res.send({ error: 'json web token missing' })

		jsonwebtoken.verify(jwt, serverconfig.jwt.secret, (err, decode) => {
			if (err) return res.send({ error: 'Invalid token' })

			// FIXME do not hardcode required attribute, replace with a list
			if (!decode[serverconfig.jwt.permissioncheck]) return res.send({ error: 'Not authorized' })

			next()
		})
	})
}

app.post('/examples', handle_examples)
app.post('/mdsjsonform', handle_mdsjsonform)
app.get('/genomes', handle_genomes)
app.post('/genelookup', handle_genelookup)
app.post('/ntseq', handle_ntseq)
app.post('/pdomain', handle_pdomain)
app.get('/tkbedj', bedj_request_closure(genomes))
app.post('/tkbedgraphdot', bedgraphdot_request_closure(genomes))
app.get('/tkbam', bam_request_closure(genomes))
app.get('/tkaicheck', aicheck_request_closure(genomes))
app.get('/blat', blat_request_closure(genomes))
app.get('/mds3', mds3_request_closure(genomes))
app.get('/variant2samples', variant2samples_closure(genomes))
app.get('/dsvariantsummary', handle_dsvariantsummary)
app.get('/tkbampile', bampile_request)
app.post('/snpbyname', handle_snpbyname)
app.post('/dsdata', handle_dsdata) // old official ds, replace by mds

app.post('/tkbigwig', handle_tkbigwig)

app.get('/tabixheader', handle_tabixheader)
app.post('/snp', handle_snpbycoord)
app.post('/clinvarVCF', handle_clinvarVCF)
app.post('/isoformlst', handle_isoformlst)
app.post('/dbdata', handle_dbdata)
app.post('/img', handle_img)
app.post('/svmr', handle_svmr)
app.post('/dsgenestat', handle_dsgenestat)
app.post('/study', handle_study)
app.post('/textfile', handle_textfile)
app.post('/urltextfile', handle_urltextfile)
app.get('/junction', junction_request) // legacy
app.post('/mdsjunction', handle_mdsjunction)
app.post('/mdscnv', handle_mdscnv)
app.post('/mdssvcnv', handle_mdssvcnv)
app.post('/mds2', mds2_load.handle_request(genomes))
app.post('/mdsexpressionrank', handle_mdsexpressionrank) // expression rank as a browser track
app.post('/mdsgeneboxplot', handle_mdsgeneboxplot)
app.post('/mdsgenevalueonesample', handle_mdsgenevalueonesample)

app.post('/vcf', handle_vcf) // for old ds/vcf and old junction

app.get('/vcfheader', handle_vcfheader)

app.post('/translategm', handle_translategm)
app.get('/hicstat', handle_hicstat)
app.post('/hicdata', handle_hicdata)
app.post('/samplematrix', handle_samplematrix)
app.get('/mdssamplescatterplot', handle_mdssamplescatterplot)
app.post('/mdssamplesignature', handle_mdssamplesignature)
app.post('/mdssurvivalplot', handle_mdssurvivalplot)
app.post('/fimo', fimo.handle_closure(genomes))
app.get('/termdb', termdb.handle_request_closure(genomes))
app.get('/termdb-barsql', termdbbarsql.handle_request_closure(genomes))
app.post('/singlecell', singlecell.handle_singlecell_closure(genomes))
app.post('/isoformbycoord', handle_isoformbycoord)
app.post('/ase', handle_ase)
app.post('/bamnochr', handle_bamnochr)

/****
	- validate and start the server
	This enables the coorect monitoring by the forever module. 
	Whereas before 'forever' will endlessly restart the server
	even if it cannot be initialized in a full working state,
	the usage in a bash script should now be: 
	```
	set -e
	node server validate 
	# only proceed to using forever on successful validation
	npx forever -a --minUptime 1000 --spinSleepTime 1000 --uid "pp" -l $logdir/log -o $logdir/out -e $logdir/err start server.js --max-old-space-size=8192
	```
***/

pp_init()
	.then(() => {
		// no error from server initiation
		if (process.argv[2] == 'validate') {
			console.log('\nValidation succeeded. You may now run the server.\n')
			return
		}
		/*
		if(process.argv[2] == 'phewas-precompute') {
		}
		*/

		const port = serverconfig.port || 3000
		const server = app.listen(port)
		console.log('STANDBY AT PORT ' + port)
	})
	.catch(err => {
		/* when the app server is monitored by another process via the command line,
		process.exit(1) is required to stop executiion flow with `set -e`
		and thereby avoid unnecessary endless restarts of an invalid server
		init with bad config, data, and/or code
		*/
		if (err.stack) console.log(err.stack)
		console.error('\n!!!\n' + err + '\n\n')
		process.exit(1)
	})

async function handle_examples(req, res) {
	if (reqbodyisinvalidjson(req, res)) return
	if (!exports.features.examples) return res.send({ error: 'This feature is not enabled on this server.' })
	if (req.query) {
		if (req.query.getexamplejson) {
			res.send({ examples })
		} else {
			res.send({ error: 'examples json file not defined' })
		}
		return
	}
	res.send({ error: 'Invalid request' })
}

async function handle_mdsjsonform(req, res) {
	if (reqbodyisinvalidjson(req, res)) return
	if (!exports.features.mdsjsonform) return res.send({ error: 'This feature is not enabled on this server.' })
	if (req.query.deposit) {
		const id = Math.random().toString()
		const folder = await maymakefolder()
		const file = path.join(folder, id)
		await utils.write_file(file, JSON.stringify(req.query.deposit))
		res.send({ id })
		return
	}
	if (req.query.draw) {
		const file = path.join(serverconfig.cachedir, 'mdsjsonform', req.query.draw)
		const txt = await utils.read_file(file)
		try {
			const json = JSON.parse(txt)
			res.send({ json })
		} catch (e) {
			res.send({ error: 'Invalid JSON' })
		}
		return
	}
	// no other trigger, return empty obj to allow client to test if feature is enabled on server
	res.send({})
}
function maymakefolder() {
	const p = path.join(serverconfig.cachedir, 'mdsjsonform')
	return new Promise((resolve, reject) => {
		fs.stat(p, (e, s) => {
			if (e) {
				if (e.code == 'ENOENT') {
					fs.mkdir(p, e => {
						if (e) reject('error creating dir')
						resolve(p)
					})
					return
				}
				reject('error checking directory')
			} else {
				if (s.isDirectory()) {
					resolve(p)
				} else {
					reject('"mdsjsonform" exists but not directory')
				}
			}
		})
	})
}

async function handle_tabixheader(req, res) {
	log(req)
	try {
		const [e, file, isurl] = fileurl(req)
		if (e) throw e
		const dir = isurl ? await utils.cache_index(file, req.query.indexURL) : null
		const lines = await utils.get_header_tabix(file, dir)
		res.send({ lines })
	} catch (e) {
		if (e.stack) console.log(e.stack)
		res.send({ error: e.message || e })
	}
}

function handle_genomes(req, res) {
	log(req)
	const hash = {}
	if (req.query && req.query.genome) {
		hash[req.query.genome] = clientcopy_genome(req.query.genome)
	} else {
		for (const genomename in genomes) {
			hash[genomename] = clientcopy_genome(genomename)
		}
	}
	let hasblat = false
	for (const n in genomes) {
		if (genomes[n].blat) hasblat = true
	}
	res.send({
		genomes: hash,
		debugmode: serverconfig.debugmode,
		headermessage: serverconfig.headermessage,
		base_zindex: serverconfig.base_zindex,
		codedate: codedate.toDateString(),
		launchdate,
		hasblat,
		features: exports.features
	})
}
function clientcopy_genome(genomename) {
	const g = genomes[genomename]
	const g2 = {
		species: g.species,
		name: genomename,
		hasSNP: g.snp ? true : false,
		hasClinvarVCF: g.clinvarVCF ? true : false,
		fimo_motif: g.fimo_motif ? true : false,
		blat: g.blat ? true : false,
		geneset: g.geneset,
		defaultcoord: g.defaultcoord,
		isdefault: g.isdefault,
		majorchr: g.majorchr,
		majorchrorder: g.majorchrorder,
		minorchr: g.minorchr,
		tracks: g.tracks,
		hicenzymefragment: g.hicenzymefragment,
		datasets: {}
	}
	for (const dsname in g.datasets) {
		const ds = g.datasets[dsname]

		if (ds.isMds3) {
			g2.datasets[ds.label] = mds3_init.client_copy(ds)
			continue
		}

		if (ds.isMds) {
			const _ds = mds_clientcopy(ds)
			if (_ds) {
				g2.datasets[ds.label] = _ds
			}
			continue
		}

		// old official ds
		const ds2 = {
			isofficial: true,
			noHandleOnClient: ds.noHandleOnClient,
			sampleselectable: ds.sampleselectable,
			label: ds.label,
			dsinfo: ds.dsinfo,
			stratify: ds.stratify,
			cohort: ds.cohort,
			vcfinfofilter: ds.vcfinfofilter,
			info2table: ds.info2table,
			info2singletable: ds.info2singletable,
			url4variant: ds.url4variant,
			itemlabelname: ds.itemlabelname
		}

		if (ds.snvindel_attributes) {
			ds2.snvindel_attributes = []
			for (const at of ds.snvindel_attributes) {
				const rep = {}
				for (const k in at) {
					if (k == 'lst') {
						rep.lst = []
						for (const e of at.lst) {
							const rep2 = {}
							for (const k2 in e) rep2[k2] = e[k2]
							rep.lst.push(rep2)
						}
					} else {
						rep[k] = at[k]
					}
				}
				ds2.snvindel_attributes.push(rep)
			}
		}
		if (ds.snvindel_legend) {
			ds2.snvindel_legend = ds.snvindel_legend
		}
		if (ds.variant2samples) {
			ds2.variant2samples = {
				variantkey: ds.variant2samples.variantkey,
				levels: ds.variant2samples.levels
			}
		}
		const vcfinfo = {}
		let hasvcf = false
		for (const q of ds.queries) {
			if (q.vcf) {
				hasvcf = true
				vcfinfo[q.vcf.vcfid] = q.vcf
			}
		}
		if (hasvcf) {
			ds2.id2vcf = vcfinfo
		}
		g2.datasets[dsname] = ds2
	}

	if (g.hicdomain) {
		g2.hicdomain = { groups: {} }
		for (const s1 in g.hicdomain.groups) {
			const tt = g.hicdomain.groups[s1]
			g2.hicdomain.groups[s1] = {
				name: tt.name,
				reference: tt.reference,
				sets: {}
			}
			for (const s2 in tt.sets) {
				g2.hicdomain.groups[s1].sets[s2] = {
					name: tt.sets[s2].name,
					longname: tt.sets[s2].longname
				}
			}
		}
	}
	return g2
}

function mds_clientcopy(ds) {
	// make client-side copy of a mds

	const ds2 = {
		isMds: true,
		noHandleOnClient: ds.noHandleOnClient,
		label: ds.label,
		version: ds.version,
		annotationsampleset2matrix: ds.annotationsampleset2matrix,
		mutationAttribute: ds.mutationAttribute,
		locusAttribute: ds.locusAttribute,
		alleleAttribute: ds.alleleAttribute,
		// these are quick fixes and should be deleted later
		hide_genotypedownload: ds.hide_genotypedownload,
		hide_phewas: ds.hide_phewas,
		sample2bam: ds.sample2bam
	}

	if (ds.queries) {
		ds2.queries = {}
	}

	if (ds.track) {
		ds2.track = mds2_init.client_copy(ds)
	}

	if (ds.singlesamplemutationjson) {
		ds2.singlesamplemutationjson = 1
	}
	if (ds.assayAvailability) {
		ds2.assayAvailability = 1
	}

	if (ds.cohort && ds.cohort.sampleAttribute) {
		// attr may be hidden from client
		const toclient = {}
		for (const k in ds.cohort.sampleAttribute.attributes) {
			const a = ds.cohort.sampleAttribute.attributes[k]
			if (!a.clientnoshow) toclient[k] = a
		}
		ds2.sampleAttribute = { attributes: toclient }
	}

	if (ds.cohort) {
		if (ds.cohort.termdb) {
			// let client know the existance, do not reveal details unless needed
			ds2.termdb = {
				selectCohort: ds.cohort.termdb.selectCohort
			}
		}

		if (ds.cohort.attributes && ds.cohort.attributes.defaulthidden) {
			/*
			.attributes.lst[] are not released to client
			default hidden attributes from sample annotation, tell client
			*/
			ds2.cohortHiddenAttr = ds.cohort.attributes.defaulthidden
		}

		if (ds.cohort.survivalplot) {
			ds2.survivalplot = {
				samplegroupattrlst: ds.cohort.survivalplot.samplegroupattrlst,
				plots: []
			}
			for (const k in ds.cohort.survivalplot.plots) {
				const p = ds.cohort.survivalplot.plots[k]
				ds2.survivalplot.plots.push({
					key: k,
					name: p.name,
					timelabel: p.timelabel
				})
			}
		}

		if (ds.cohort.mutation_signature) {
			const sets = {}
			for (const k in ds.cohort.mutation_signature.sets) {
				const s = ds.cohort.mutation_signature.sets[k]
				sets[k] = {
					name: s.name,
					signatures: s.signatures
				}
			}
			ds2.mutation_signature = { sets: sets }
		}
	}

	for (const k in ds.queries) {
		const q = ds.queries[k]

		const clientquery = {
			// revealed to client
			name: q.name,
			hideforthemoment: q.hideforthemoment // hide track not ready to show on client
		}

		if (q.istrack) {
			clientquery.istrack = true
			clientquery.type = q.type
			clientquery.isfull = q.isfull
			// track attributes, some are common, many are track type-specific
			if (q.nochr != undefined) {
				clientquery.nochr = q.nochr
			}
			if (q.infoFilter) {
				clientquery.infoFilter = q.infoFilter
			}
			// junction attributes
			if (q.readcountCutoff) {
				clientquery.readcountCutoff = q.readcountCutoff
			}
			// cnv attributes
			if (q.valueLabel) {
				clientquery.valueLabel = q.valueLabel
			}
			if (q.valueCutoff) {
				clientquery.valueCutoff = q.valueCutoff
			}
			if (q.bplengthUpperLimit) {
				clientquery.bplengthUpperLimit = q.bplengthUpperLimit
			}
			// loh attributes
			if (q.segmeanValueCutoff) {
				clientquery.segmeanValueCutoff = q.segmeanValueCutoff
			}
			if (q.lohLengthUpperLimit) {
				clientquery.lohLengthUpperLimit = q.lohLengthUpperLimit
			}

			if (q.type == common.tkt.mdssvcnv) {
				if (q.groupsamplebyattr) {
					clientquery.groupsamplebyattr = q.groupsamplebyattr
				}

				// flags
				clientquery.multihidelabel_fusion = q.multihidelabel_fusion
				clientquery.multihidelabel_sv = q.multihidelabel_sv
				clientquery.multihidelabel_vcf = q.multihidelabel_vcf
				clientquery.showfullmode = q.showfullmode
				clientquery.legend_vorigin = q.legend_vorigin
				clientquery.no_loh = q.no_loh // quick dirty fix

				if (q.expressionrank_querykey) {
					// for checking expression rank
					const e = ds.queries[q.expressionrank_querykey]
					clientquery.checkexpressionrank = {
						querykey: q.expressionrank_querykey,
						datatype: e.datatype
					}
					if (e.boxplotbysamplegroup && e.boxplotbysamplegroup.additionals) {
						// quick fix!!
						// array element 0 is boxplotbysamplegroup.attributes
						// rest of array, one ele for each of .additionals
						const lst = []
						if (e.boxplotbysamplegroup.attributes)
							lst.push(e.boxplotbysamplegroup.attributes.map(i => i.label).join(', '))
						for (const i of e.boxplotbysamplegroup.additionals) lst.push(i.label)
						clientquery.checkexpressionrank.boxplotgroupers = lst
					}
				}
				if (q.vcf_querykey) {
					clientquery.checkvcf = {
						querykey: q.vcf_querykey,
						info: ds.queries[q.vcf_querykey].info,
						format: {}
					}
					for (const tk of ds.queries[q.vcf_querykey].tracks) {
						if (tk.format) {
							for (const k in tk.format) {
								clientquery.checkvcf.format[k] = tk.format[k]
							}
						}
					}
				}
			}
		} else if (q.isgenenumeric) {
			clientquery.isgenenumeric = true
			clientquery.datatype = q.datatype
			clientquery.no_ase = q.no_ase
		} else {
			// this query is not to be revealed to client
			continue
		}

		ds2.queries[k] = clientquery
	}
	return ds2
}

function handle_genelookup(req, res) {
	if (reqbodyisinvalidjson(req, res)) return
	const g = genomes[req.query.genome]
	if (!g) return res.send({ error: 'invalid genome name' })
	if (!req.query.input) return res.send({ error: 'no input' })
	if (req.query.deep) {
		///////////// deep

		// isoform query must be converted to symbol first, so as to retrieve all gene models related to this gene

		// see if query string match directly with gene symbol
		let symbol
		{
			const tmp = g.genedb.getnamebynameorisoform.get(req.query.input, req.query.input)
			if (tmp) symbol = tmp.name
		}
		if (!symbol) {
			if (g.genedb.hasalias) {
				const tmp = g.genedb.getnamebyalias.get(req.query.input)
				if (tmp) symbol = tmp.name
			}
		}
		if (!symbol) {
			// no other means of matching it to symbol
			symbol = req.query.input
		}
		const tmp = g.genedb.getjsonbyname.all(symbol)
		res.send({
			gmlst: tmp.map(i => {
				const j = JSON.parse(i.genemodel)
				if (i.isdefault) j.isdefault = true
				return j
			})
		})
		return
	}
	////////////// shallow
	const input = req.query.input.toUpperCase()
	const lst = []
	const s = input.substr(0, 2)
	const tmp = g.genedb.getnameslike.all(input + '%')
	if (tmp.length) {
		tmp.sort()
		res.send({ hits: tmp.map(i => i.name) })
		return
	}
	// no direct name match, try alias
	if (g.genedb.hasalias) {
		const tmp = g.genedb.getnamebyalias.all(input)
		if (tmp.length) {
			res.send({ hits: tmp.map(i => i.name) })
			return
		}
	}
	res.send({ hits: [] })
}

function handle_img(req, res) {
	if (reqbodyisinvalidjson(req, res)) return
	const [e, file, isurl] = fileurl({ query: { file: req.query.file } })
	if (e) {
		res.send({ error: 'invalid image file' })
		return
	}
	fs.readFile(file, (err, data) => {
		if (err) {
			res.send({ error: 'error reading file' })
			return
		}
		const size = imagesize(file)
		const src = 'data:image/jpeg;base64,' + new Buffer(data).toString('base64')
		res.send({ src: src, size: size })
	})
}

function handle_ntseq(req, res) {
	try {
		req.query = JSON.parse(req.body)
	} catch (e) {
		res.send({ error: 'invalid request body' })
		return
	}
	log(req)
	var n = req.query.genome
	if (!n) return res.send({ error: 'no genome' })
	var g = genomes[n]
	if (!g) return res.send({ error: 'invalid genome' })
	if (!g.genomefile) return res.send({ error: 'no sequence file available' })
	var ps = spawn(samtools, ['faidx', g.genomefile, req.query.coord])
	var out = [],
		out2 = []
	ps.stdout.on('data', function(data) {
		out.push(data)
	})
	ps.stderr.on('data', function(data) {
		out2.push(data)
	})
	ps.on('close', function(code) {
		var err = out2.join('').trim()
		if (err.length) {
			res.send({ error: 'Error getting sequence!' })
			console.error(err)
			return
		}
		var lst = out
			.join('')
			.trim()
			.split('\n')
		res.send({ seq: lst.slice(1).join('') })
	})
}

function handle_pdomain(req, res) {
	if (reqbodyisinvalidjson(req, res)) return
	try {
		const gn = req.query.genome
		if (!gn) throw 'no genome'
		const g = genomes[gn]
		if (!g) throw 'invalid genome ' + gn
		if (!g.proteindomain) {
			// no error
			return res.send({ lst: [] })
		}
		if (!req.query.isoforms) throw 'isoforms missing'

		const lst = []
		for (const isoform of req.query.isoforms) {
			const tmp = g.proteindomain.getbyisoform.all(isoform)
			// FIXME returned {data} is text not json
			lst.push({
				name: isoform,
				pdomains: tmp.map(i => {
					const j = JSON.parse(i.data)
					j.refseq = isoform
					return j
				})
			})
		}
		res.send({ lst })
	} catch (e) {
		res.send({ error: e.message || e })
		if (e.stack) console.log(e.stack)
	}
}

function handle_tkbigwig_bedgraph_region(req, r, xoff, minv, maxv, file, bedgraphdir, ctx) {
	const hscale = makeyscale()
		.height(req.query.barheight)
		.min(minv)
		.max(maxv)
	const sf = r.width / (r.stop - r.start)

	return new Promise((resolve, reject) => {
		const ps = spawn(tabix, [file, r.chr + ':' + r.start + '-' + r.stop], { cwd: bedgraphdir })
		const rl = readline.createInterface({ input: ps.stdout })
		rl.on('line', line => {
			const l = line.split('\t')
			const start = Number.parseInt(l[1])
			if (Number.isNaN(start)) return
			const stop = Number.parseInt(l[2])
			if (Number.isNaN(stop)) return
			const v = Number.parseFloat(l[3])
			if (Number.isNaN(v)) return
			ctx.fillStyle = v > 0 ? req.query.pcolor : req.query.ncolor
			const tmp = hscale(v)
			const x1 = xoff + (Math.max(start, r.start) - r.start) * sf
			const x2 = xoff + (Math.min(stop, r.stop) - r.start) * sf
			const w = Math.max(1, x2 - x1)

			ctx.fillRect(x1, tmp.y, w, tmp.h)

			if (v > maxv) {
				ctx.fillStyle = req.query.pcolor2
				ctx.fillRect(x1, 0, w, 2)
			} else if (v < minv) {
				ctx.fillStyle = req.query.ncolor2
				ctx.fillRect(x1, req.query.barheight - 2, w, 2)
			}
		})

		ps.on('close', () => {
			resolve()
		})
	})
}

async function handle_tkbigwig_bedgraph(req, res, minv, maxv, file, bedgraphdir) {
	/*
	 */
	if (minv == undefined || maxv == undefined) throw 'Y axis scale must be defined for bedgraph track'
	const canvas = createCanvas(req.query.width, req.query.barheight)
	const ctx = canvas.getContext('2d')
	let xoff = 0
	for (let r of req.query.rglst) {
		await handle_tkbigwig_bedgraph_region(req, r, xoff, minv, maxv, file, bedgraphdir, ctx)
		xoff += r.width + req.query.regionspace
	}
	res.send({ src: canvas.toDataURL() })
}

async function handle_tkbigwig(req, res) {
	/*
if file/url ends with .gz, it is bedgraph
	- all bedgraph data from view range will be kept in mem, risk of running out of mem
	- not to be used in production!!!
	- bedgraph should render bars while reading data, with predefined y axis; no storing data
*/
	if (reqbodyisinvalidjson(req, res)) return

	let fixminv,
		fixmaxv,
		percentile,
		autoscale = false,
		isbedgraph = false,
		bedgraphdir

	const [e, file, isurl] = fileurl(req)
	if (e) return res.send({ error: e })

	if (file.endsWith('.gz')) {
		// is bedgraph, will cache index if is url
		isbedgraph = true
		if (isurl) {
			try {
				bedgraphdir = await utils.cache_index(file, req.query.indexURL)
			} catch (e) {
				return res.send({ error: 'index caching error' })
			}
		}
	}

	Promise.resolve()
		.then(() => {
			if (req.query.autoscale) {
				autoscale = true
			} else if (req.query.percentile) {
				percentile = req.query.percentile
				if (!Number.isFinite(percentile)) throw 'invalid percentile'
			} else {
				fixminv = req.query.minv
				fixmaxv = req.query.maxv
				if (!Number.isFinite(fixminv)) throw 'invalid minv'
				if (!Number.isFinite(fixmaxv)) throw 'invalid maxv'
			}
			if (!Number.isFinite(req.query.barheight)) throw 'invalid barheight'
			if (!Number.isFinite(req.query.regionspace)) throw 'invalid regionspace'
			if (!Number.isFinite(req.query.width)) throw 'invalid width'
			if (!req.query.rglst) throw 'region list missing'
			if (req.query.dotplotfactor) {
				if (!Number.isInteger(req.query.dotplotfactor)) throw 'dotplotfactor value should be positive integer'
			}

			if (isbedgraph) {
				return handle_tkbigwig_bedgraph(req, res, fixminv, fixmaxv, file, bedgraphdir)
			}

			const tasks = [] // one task per region

			for (const r of req.query.rglst) {
				tasks.push(
					new Promise((resolve, reject) => {
						const ps = spawn(bigwigsummary, [
							'-udcDir=' + serverconfig.cachedir,
							file,
							r.chr,
							r.start,
							r.stop,
							Math.ceil(r.width * (req.query.dotplotfactor || 1))
						])
						const out = []
						const out2 = []
						ps.stdout.on('data', i => out.push(i))
						ps.stderr.on('data', i => out2.push(i))
						ps.on('close', code => {
							const err = out2.join('')
							if (err.length) {
								if (err.startsWith('no data')) {
									r.nodata = true
								} else {
									// in case of invalid file the message is "Couldn't open /path/to/tp/..."
									// must not give away the tp path!!
									reject('Cannot read bigWig file')
								}
							} else {
								r.values = out
									.join('')
									.trim()
									.split('\t')
									.map(Number.parseFloat)
								if (req.query.dividefactor) {
									r.values = r.values.map(i => i / req.query.dividefactor)
								}
							}
							resolve()
						})
					})
				)
			}

			return Promise.all(tasks)
		})
		.then(() => {
			if (isbedgraph) return

			let nodata = true
			for (const r of req.query.rglst) {
				if (r.values) nodata = false
			}
			const canvas = createCanvas(
				req.query.width * req.query.devicePixelRatio,
				req.query.barheight * req.query.devicePixelRatio
			)
			const ctx = canvas.getContext('2d')
			if (req.query.devicePixelRatio > 1) {
				ctx.scale(req.query.devicePixelRatio, req.query.devicePixelRatio)
			}
			if (nodata) {
				// bigwig hard-coded stuff
				ctx.font = '14px Arial'
				ctx.fillStyle = '#858585'
				ctx.textAlign = 'center'
				ctx.textBaseline = 'middle'
				ctx.fillText(req.query.name + ': no data in view range', req.query.width / 2, req.query.barheight / 2)
				res.send({ src: canvas.toDataURL(), nodata: true })
				return
			}

			const pointwidth = 1 // line/dot plot width
			const pointshift = req.query.dotplotfactor ? 1 / req.query.dotplotfactor : 1 // shift distance

			let maxv = 0,
				minv = 0

			const values = []
			const result = {}

			if (autoscale || percentile) {
				const positive = []
				const negative = []
				for (const r of req.query.rglst) {
					if (r.values) {
						for (const v of r.values) {
							if (Number.isNaN(v)) continue
							if (v >= 0) positive.push(v)
							if (v <= 0) negative.push(v)
						}
					}
				}
				if (positive.length) {
					positive.sort((a, b) => a - b)
					if (autoscale) {
						maxv = positive[positive.length - 1]
					} else {
						maxv = positive[Math.floor((positive.length * percentile) / 100)]
					}
				}
				if (negative.length) {
					negative.sort((a, b) => b - a)
					if (autoscale) {
						minv = negative[negative.length - 1]
					} else {
						minv = negative[Math.floor((negative.length * percentile) / 100)]
					}
				}
				result.minv = minv
				result.maxv = maxv
			} else {
				minv = fixminv
				maxv = fixmaxv
			}
			if (req.query.barheight < 10) {
				/*
			heatmap
			*/
				let r = d3color.rgb(req.query.pcolor)
				const rgbp = r.r + ',' + r.g + ',' + r.b
				r = d3color.rgb(req.query.ncolor)
				const rgbn = r.r + ',' + r.g + ',' + r.b
				let x = 0
				for (const r of req.query.rglst) {
					if (r.values) {
						for (let i = 0; i < r.values.length; i++) {
							const v = r.values[i]
							if (Number.isNaN(v)) continue
							ctx.fillStyle =
								v >= maxv
									? req.query.pcolor2
									: v >= 0
									? 'rgba(' + rgbp + ',' + v / maxv + ')'
									: v <= minv
									? req.query.ncolor2
									: 'rgba(' + rgbn + ',' + v / minv + ')'
							const x2 = Math.ceil(x + (r.reverse ? r.width - pointshift * i : pointshift * i))
							ctx.fillRect(x2, 0, pointwidth, req.query.barheight)
						}
					}
					x += r.width + req.query.regionspace
				}
			} else {
				/*
			barplot
			*/
				const hscale = makeyscale()
					.height(req.query.barheight)
					.min(minv)
					.max(maxv)
				let x = 0
				for (const r of req.query.rglst) {
					if (r.values) {
						for (let i = 0; i < r.values.length; i++) {
							const v = r.values[i]
							if (Number.isNaN(v)) continue
							ctx.fillStyle = v > 0 ? req.query.pcolor : req.query.ncolor
							const x2 = Math.ceil(x + (r.reverse ? r.width - pointshift * i : pointshift * i))
							const tmp = hscale(v)

							if (v > 0) {
								ctx.fillRect(x2, tmp.y, pointwidth, req.query.dotplotfactor ? Math.min(2, tmp.h) : tmp.h)
							} else {
								// negative value
								if (req.query.dotplotfactor) {
									const _h = Math.min(2, tmp.h)
									ctx.fillRect(x2, tmp.y + tmp.h - _h, pointwidth, _h)
								} else {
									ctx.fillRect(x2, tmp.y, pointwidth, tmp.h)
								}
							}

							if (v > maxv) {
								ctx.fillStyle = req.query.pcolor2
								ctx.fillRect(x2, 0, pointwidth, 2)
							} else if (v < minv) {
								ctx.fillStyle = req.query.ncolor2
								ctx.fillRect(x2, req.query.barheight - 2, pointwidth, 2)
							}
						}
					}
					x += r.width + req.query.regionspace
				}
			}
			result.src = canvas.toDataURL()
			res.send(result)
		})
		.catch(err => {
			if (err.stack) {
				console.log(err.stack)
			}
			res.send({ error: typeof err == 'string' ? err : err.message })
		})
}

function handle_snpbyname(req, res) {
	if (reqbodyisinvalidjson(req, res)) return
	const n = req.query.genome
	if (!n) return res.send({ error: 'no genome' })
	const g = genomes[n]
	if (!g) return res.send({ error: 'invalid genome' })
	if (!g.snp) return res.send({ error: 'snp is not configured for this genome' })
	const hits = []
	for (const n of req.query.lst) {
		const lst = g.snp.getbyname.all(n)
		for (const i of lst) {
			hits.push(i)
		}
	}
	res.send({ lst: hits })
}

function handle_snpbycoord(req, res) {
	if (reqbodyisinvalidjson(req, res)) return
	const n = req.query.genome
	if (!n) return res.send({ error: 'no genome' })
	const g = genomes[n]
	if (!g) return res.send({ error: 'invalid genome' })
	if (!g.snp) return res.send({ error: 'snp is not configured for this genome' })
	const hits = []
	for (const r of req.query.ranges) {
		const bin = getbin(r.start, r.stop)
		if (bin == null) continue
		const lst = g.snp.getbycoord.all(req.query.chr, bin, r.start, r.stop)
		for (const i of lst) {
			hits.push(i)
		}
	}
	res.send({ results: hits })
}

function handle_clinvarVCF(req, res) {
	if (reqbodyisinvalidjson(req, res)) return
	try {
		const g = genomes[req.query.genome]
		if (!g) throw 'unknown genome'
		if (!g.clinvarVCF) throw 'no clinvar for this genome'

		const ps = spawn(tabix, [
			g.clinvarVCF.file,
			(g.clinvarVCF.nochr ? req.query.chr.replace('chr', '') : req.query.chr) +
				':' +
				req.query.pos +
				'-' +
				(req.query.pos + 1)
		])
		const out = [],
			out2 = []
		ps.stdout.on('data', i => out.push(i))
		ps.on('close', () => {
			const str = out.join('').trim()
			if (!str) {
				res.send({})
				return
			}
			for (const line of str.split('\n')) {
				const [badinfok, mlst, altinvalid] = vcf.vcfparseline(line, g.clinvarVCF)
				for (const m of mlst) {
					if (m.pos == req.query.pos && m.ref == req.query.ref && m.alt == req.query.alt) {
						// match
						const k = m.info[g.clinvarVCF.infokey]
						const v = g.clinvarVCF.categories[k]
						res.send({
							hit: {
								id: m.vcf_ID,
								value: v ? v.label : k,
								bg: v ? v.color : '#858585',
								textcolor: v && v.textcolor ? v.textcolor : 'black'
							}
						})
						return
					}
				}
			}
			res.send({})
		})
	} catch (e) {
		res.send({ error: e.message || e })
	}
}

async function handle_dsvariantsummary(req, res) {
	log(req)
	try {
		const genome = genomes[req.query.genome]
		if (!genome) throw 'invalid genome'
		const ds = genome.datasets[req.query.dsname]
		if (!ds) throw 'dataset not found'
		if (!ds.stratify) throw 'stratify not supported on this dataset'
		const strat = ds.stratify.find(i => i.label == req.query.stratify)
		if (!strat) throw 'unknown stratify method'

		const item2mclass = new Map()
		// k: item name/key
		// v: Map
		//    k: mclass
		//    v: set of case id
		if (ds.queries) {
			await handle_dsvariantsummary_dsqueries(req, ds, strat, item2mclass)
		} else {
			throw 'unknown query method'
		}
		const items = []
		for (const [itemname, m2c] of item2mclass) {
			const item = {
				name: itemname,
				count: 0,
				m2c: []
			}
			for (const [mclass, s] of m2c) {
				item.count += s.size
				item.m2c.push([mclass, s.size])
			}
			item.m2c.sort((a, b) => b[1] - a[1])
			if (ds.onetimequery_projectsize) {
				if (ds.onetimequery_projectsize.results.has(itemname)) {
					item.cohortsize = ds.onetimequery_projectsize.results.get(itemname)
				}
			}
			items.push(item)
		}
		items.sort((a, b) => b.count - a.count)
		res.send({ items })
	} catch (e) {
		res.send({ error: e.message || e })
		if (e.stack) console.log(e.stack)
	}
}

async function handle_dsvariantsummary_dsqueries(req, ds, strat, item2mclass) {
	for (const query of ds.queries) {
		if (query.gdcgraphql_snvindel) {
			// duplicate code with handle_dsdata_gdcgraphql_snvindel_isoform2variants
			const hits = await gdcgraphql_snvindel_byisoform(query, req.query.isoform)
			for (const hit of hits) {
				if (!hit._source) throw '._source{} missing from one of re.hits[]'
				if (!hit._source.consequence) continue
				const ts = hit._source.consequence.find(i => i.transcript.transcript_id == req.query.isoform)
				// get mclass of this variant
				let mclass
				if (ts && ts.transcript.consequence_type) {
					const [dt, _mclass, rank] = common.vepinfo(ts.transcript.consequence_type)
					mclass = _mclass
				}
				if (!mclass) continue
				// for each occurrence, add to counter
				if (!hit._source.occurrence) continue
				if (!Array.isArray(hit._source.occurrence)) throw '.occurrence[] is not array for a hit'
				for (const acase of hit._source.occurrence) {
					if (!acase.case) throw '.case{} missing from a case'
					let stratvalue = acase.case
					for (const key of strat.keys) {
						stratvalue = stratvalue[key]
					}
					if (stratvalue) {
						// has a valid item for this strat category
						if (!item2mclass.has(stratvalue)) item2mclass.set(stratvalue, new Map())
						if (!item2mclass.get(stratvalue).has(mclass)) item2mclass.get(stratvalue).set(mclass, new Set())
						item2mclass
							.get(stratvalue)
							.get(mclass)
							.add(acase.case.case_id)
						//const c = item2mclass.get(stratvalue)
						//c.set(mclass, 1 + (c.get(mclass) || 0))
					}
				}
			}
		}
	}
	return item2mclass
}

async function handle_dsdata(req, res) {
	/*
	poor mechanism, only for old-style official dataset

	to be totally replaced by mds, which can identify queries in a mds by querykeys
	*/

	if (reqbodyisinvalidjson(req, res)) return
	try {
		if (!genomes[req.query.genome]) throw 'invalid genome'
		if (!req.query.dsname) throw '.dsname missing'
		const ds = genomes[req.query.genome].datasets[req.query.dsname]
		if (!ds) throw 'invalid dsname'

		/**** for now, process this query here
		as the /dsdata query will always run before sunburst or stratify queries that rely on project total size
		***/
		await may_onetimequery_projectsize(ds)

		const data = []

		for (const query of ds.queries) {
			if (req.query.expressiononly && !query.isgeneexpression) {
				/*
				expression data only
				TODO mds should know exactly which data type to query, or which vending button to use
				*/
				continue
			}
			if (req.query.noexpression && query.isgeneexpression) {
				// skip expression data
				continue
			}

			if (query.dsblocktracklst) {
				/*
				do not load any tracks here yet
				TODO should allow loading some/all, when epaint is not there
				*/
				continue
			}

			if (query.vcffile) {
				const d = await handle_dsdata_vcf(query, req)
				data.push(d)
				continue
			}

			if (query.makequery) {
				const d = handle_dsdata_makequery(ds, query, req)
				data.push(d)
				continue
			}

			if (query.gdcgraphql_snvindel) {
				const d = await handle_dsdata_gdcgraphql_snvindel_isoform2variants(ds, query, req)
				data.push(d)
				continue
			}
			throw 'unknow type from one of ds.queries[]'
		}

		res.send({ data })
	} catch (e) {
		if (e.stack) console.log(e.stack)
		res.send({ error: e.message || e })
	}
}

async function handle_dsdata_gdcgraphql_snvindel_isoform2variants(ds, query, req) {
	// query variants by isoforms
	try {
		const hits = await gdcgraphql_snvindel_byisoform(query, req.query.isoform)
		const lst = [] // parse snv/indels into this list
		for (const hit of hits) {
			if (!hit._source) throw '._source{} missing from one of re.hits[]'
			if (!hit._source.ssm_id) throw 'hit._source.ssm_id missing'
			if (!Number.isInteger(hit._source.start_position)) throw 'hit._source.start_position is not integer'
			const m = {
				ssm_id: hit._source.ssm_id,
				dt: common.dtsnvindel,
				chr: req.query.range.chr,
				pos: hit._source.start_position - 1,
				ref: hit._source.reference_allele,
				alt: hit._source.tumor_allele,
				isoform: req.query.isoform,
				info: {}
			}

			// sneaky, implies that .occurrence_key is required here
			m.info[query.gdcgraphql_snvindel.occurrence_key] = hit._score

			gdcgraphql_snvindel_addclass(m, hit._source.consequence)
			lst.push(m)
		}
		const data = { lst }
		if (ds.stratify) {
			data.stratifycount = gdcgraphql_snvindel_stratifycount(ds, hits)
		}
		return data
	} catch (e) {
		if (e.stack) console.log(e.stack)
		throw e.message || e
	}
}

async function gdcgraphql_snvindel_byisoform(query, isoform) {
	// used in two placed
	const variables = JSON.parse(JSON.stringify(query.gdcgraphql_snvindel.byisoform.variables))
	variables.filters.content.value = [isoform]
	const response = await got.post('https://api.gdc.cancer.gov/v0/graphql', {
		headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
		body: JSON.stringify({
			query: query.gdcgraphql_snvindel.byisoform.query,
			variables
		})
	})
	let re
	try {
		const tmp = JSON.parse(response.body)
		if (
			!tmp.data ||
			!tmp.data.analysis ||
			!tmp.data.analysis.protein_mutations ||
			!tmp.data.analysis.protein_mutations.data
		)
			throw 'structure is not .data.analysis.protein_mutations.data'
		re = JSON.parse(tmp.data.analysis.protein_mutations.data)
	} catch (e) {
		throw 'invalid JSON returned by GDC'
	}
	if (!re.hits) throw 'data.analysis.protein_mutations.data.hits missing'
	if (!Array.isArray(re.hits)) throw 'data.analysis.protein_mutations.data.hits[] is not array'
	return re.hits
}

function gdcgraphql_snvindel_addclass(m, consequence) {
	if (consequence) {
		// [ { transcript } ]
		const ts = consequence.find(i => i.transcript.transcript_id == m.isoform)
		if (ts && ts.transcript.consequence_type) {
			const [dt, mclass, rank] = common.vepinfo(ts.transcript.consequence_type)
			m.class = mclass
			m.mname = ts.transcript.aa_change // may be null!

			// hardcoded logic: { vep_impact, sift_impact, polyphen_impact, polyphen_score, sift_score}
			if (ts.transcript.annotation) {
				for (const k in ts.transcript.annotation) {
					m.info[k] = ts.transcript.annotation[k]
				}
			}
		}
	}

	if (!m.mname) {
		m.mname = m.ref + '>' + m.alt
	}

	if (!m.class) {
		if (common.basecolor[m.ref] && common.basecolor[m.alt]) {
			m.class = common.mclasssnv
		} else {
			if (m.ref == '-') {
				m.class = common.mclassinsertion
			} else if (m.alt == '-') {
				m.class = common.mclassdeletion
			} else {
				m.class = common.mclassmnv
			}
		}
	}
}

function gdcgraphql_snvindel_stratifycount(ds, hits) {
	/*
variants returned from query should include occurrence
from occurrence count the number of unique project/disease/site,
hardcoded logic only for gdc!!!
*/

	const label2set = new Map()
	// k: stratify label, v: Set() of items from this category
	for (const s of ds.stratify) {
		label2set.set(s.label, new Set())
	}
	for (const hit of hits) {
		if (!hit._source.occurrence) continue
		if (!Array.isArray(hit._source.occurrence)) throw '.occurrence[] is not array for a hit'
		for (const acase of hit._source.occurrence) {
			if (!acase.case) throw '.case{} missing from a case'
			for (const strat of ds.stratify) {
				let stratvalue = acase.case
				for (const key of strat.keys) {
					stratvalue = stratvalue[key]
				}
				if (stratvalue) {
					label2set.get(strat.label).add(stratvalue)
				}
			}
		}
	}
	const labelcount = []
	for (const [lab, s] of label2set) {
		labelcount.push([lab, s.size])
	}
	return labelcount
}

async function may_onetimequery_projectsize(ds) {
	if (!ds.onetimequery_projectsize) return
	if (ds.onetimequery_projectsize.results) {
		// already got result
		return
	}
	// do the one time query
	if (ds.onetimequery_projectsize.gdcgraphql) {
		const response = await got.post('https://api.gdc.cancer.gov/v0/graphql', {
			headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
			body: JSON.stringify(ds.onetimequery_projectsize.gdcgraphql)
		})
		let re
		try {
			re = JSON.parse(response.body)
		} catch (e) {
			throw 'invalid JSON from GDC for onetimequery_projectsize'
		}
		if (
			!re.data ||
			!re.data.viewer ||
			!re.data.viewer.explore ||
			!re.data.viewer.explore.cases ||
			!re.data.viewer.explore.cases.total ||
			!re.data.viewer.explore.cases.total.project__project_id ||
			!re.data.viewer.explore.cases.total.project__project_id.buckets
		)
			throw 'data structure not data.viewer.explore.cases.total.project__project_id.buckets'
		if (!Array.isArray(re.data.viewer.explore.cases.total.project__project_id.buckets))
			throw 'data.viewer.explore.cases.total.project__project_id.buckets not array'

		ds.onetimequery_projectsize.results = new Map()
		for (const t of re.data.viewer.explore.cases.total.project__project_id.buckets) {
			if (!t.key) throw 'key missing from one bucket'
			if (!Number.isInteger(t.doc_count)) throw '.doc_count not integer for bucket: ' + t.key
			ds.onetimequery_projectsize.results.set(t.key, t.doc_count)
		}
		return
	}
	throw 'unknown query method for onetimequery_projectsize'
}

function handle_dsdata_makequery(ds, query, req) {
	// query from ds.newconn
	const sqlstr = query.makequery(req.query)
	if (!sqlstr) {
		// when not using gm, will not query tables such as expression
		return
	}
	const rows = ds.newconn.prepare(sqlstr).all()
	let lst
	if (query.tidy) {
		lst = rows.map(i => query.tidy(i))
	} else {
		lst = rows
	}
	const result = {}
	if (query.isgeneexpression) {
		result.lst = lst
		result.isgeneexpression = true
		result.config = query.config

		/*
			loading of junction track as a dependent of epaint
			attach junction track info in this result, for making the junction button in epaint
			await user to click that button

			replace-by-mds

			*/

		for (const q2 of ds.queries) {
			if (!q2.dsblocktracklst) continue
			for (const tk of q2.dsblocktracklst) {
				if (tk.type == common.tkt.junction) {
					result.config.dsjunctiontk = tk
				}
			}
		}
	} else {
		result.lst = lst
	}
	return result
}

function handle_dsdata_vcf(query, req) {
	const par = [
		path.join(serverconfig.tpmasterdir, query.vcffile),
		(query.vcf.nochr ? req.query.range.chr.replace('chr', '') : req.query.range.chr) +
			':' +
			req.query.range.start +
			'-' +
			req.query.range.stop
	]
	return new Promise((resolve, reject) => {
		const ps = spawn(tabix, par)
		const out = [],
			out2 = []
		ps.stdout.on('data', i => out.push(i))
		ps.stderr.on('data', i => out2.push(i))
		ps.on('close', code => {
			const e = out2.join('').trim()
			if (e != '') reject('error querying vcf file')
			const tmp = out.join('').trim()
			resolve({
				lines: tmp == '' ? [] : tmp.split('\n'),
				vcfid: query.vcf.vcfid
			})
		})
	})
}

function handle_isoformlst(req, res) {
	if (reqbodyisinvalidjson(req, res)) return
	try {
		const g = genomes[req.query.genome]
		if (!g) throw 'invalid genome'
		if (!req.query.lst) return res.send({ lst: [] })
		const lst = []
		for (const isoform of req.query.lst) {
			const tmp = g.genedb.getjsonbyisoform.all(isoform)
			lst.push(
				tmp.map(i => {
					const j = JSON.parse(i.genemodel)
					if (i.isdefault) j.isdefault = true
					return j
				})
			)
		}
		res.send({ lst })
	} catch (e) {
		res.send({ error: e.message || e })
		if (e.stack) console.log(e.stack)
	}
}

function handle_dbdata(req, res) {
	try {
		req.query = JSON.parse(req.body)
	} catch (e) {
		res.send({ error: 'invalid request body' })
		return
	}
	log(req)
	const query = () => {
		const config = ch_dbtable.get(req.query.db)
		let sql
		if (config.makequery) {
			sql = config.makequery(req.query)
			if (!sql) {
				res.send({ error: 'cannot make query' })
				return
			}
		} else {
			if (!req.query.tablename) {
				res.send({ error: 'no db table name' })
				return
			}
			if (!req.query.keyname) {
				res.send({ error: 'no db table key name' })
				return
			}
			if (!req.query.key) {
				res.send({ error: 'no value to query for' })
				return
			}
			sql =
				'select * from ' +
				req.query.tablename +
				' where ' +
				req.query.keyname +
				'="' +
				req.query.key.toLowerCase() +
				'"'
		}
		config.db.all(sql, (err, rows) => {
			if (err) return res.send({ error: 'error querying db: ' + err })
			if (config.tidy) {
				config.tidy(rows)
			}
			res.send({ rows: rows })
		})
	}
	// req.query.db db file path
	if (ch_dbtable.has(req.query.db)) {
		query()
	} else {
		const config = {}
		const [e, file, isurl] = fileurl({ query: { file: req.query.db } })
		if (e) {
			res.send({ error: 'db file error: ' + e })
			return
		}
		config.db = new sqlite3.Database(file, sqlite3.OPEN_READONLY, err => {
			if (err) {
				res.send({ error: 'error connecting db' })
				return
			}
			ch_dbtable.set(req.query.db, config)
			query()
		})
	}
}

function handle_svmr(req, res) {
	try {
		req.query = JSON.parse(req.body)
	} catch (e) {
		res.send({ error: 'invalid request body' })
		return
	}
	if (req.query.file) {
		const [e, file, isurl] = fileurl(req)
		if (e) {
			res.send({ error: 'illegal file name' })
			return
		}
		fs.readFile(file, 'utf8', (err, data) => {
			if (err) {
				res.send({ error: 'cannot read file' })
				return
			}
			res.send({ raw: data })
			return
		})
	} else {
		res.send({ error: 'missing file' })
	}
}

async function handle_hicstat(req, res) {
	log(req)
	try {
		const [e, file, isurl] = fileurl(req)
		if (e) throw 'illegal file name'
		if (!isurl) {
			await utils.file_is_readable(file)
		}
		const out = await do_hicstat(file, isurl)
		res.send({ out })
	} catch (e) {
		res.send({ error: e.message || e })
		if (e.stack) console.log(e.stack)
	}
}

function handle_hicdata(req, res) {
	// juicebox straw
	try {
		req.query = JSON.parse(req.body)
	} catch (e) {
		res.send({ error: 'invalid request body' })
		return
	}
	log(req)
	const [e, file, isurl] = fileurl(req)
	if (e) {
		res.send({ error: 'illegal file name' })
		return
	}
	const par = [
		req.query.nmeth || 'NONE',
		file,
		req.query.pos1,
		req.query.pos2,
		req.query.isfrag ? 'FRAG' : 'BP',
		req.query.resolution
	]

	const ps = spawn(hicstraw, par)
	const rl = readline.createInterface({ input: ps.stdout })

	const items = []
	const erroutput = []
	let linenot3fields = 0
	let fieldnotnumerical = 0

	rl.on('line', line => {
		// straw output: pos1 \t pos2 \t value
		const l = line.split('\t')
		if (l.length != 3) {
			linenot3fields++
			return
		}
		const n1 = Number.parseInt(l[0])
		const n2 = Number.parseInt(l[1])
		const v = Number.parseFloat(l[2])
		if (Number.isNaN(n1) || Number.isNaN(n2) || Number.isNaN(v)) {
			fieldnotnumerical++
			return
		}
		if (req.query.mincutoff != undefined && v <= req.query.mincutoff) {
			return
		}
		items.push([n1, n2, v])
	})

	ps.stderr.on('data', i => erroutput.push(i))
	ps.on('close', () => {
		const err = erroutput.join('')
		if (err) return res.send({ error: err })
		if (linenot3fields) return res.send({ error: linenot3fields + ' lines have other than 3 fields' })
		if (fieldnotnumerical)
			return res.send({ error: fieldnotnumerical + ' lines have non-numerical values in any of the 3 fields' })
		res.send({ items: items })
		return
	})
}

/*
function handle_putfile(req,res) {
	const id=Math.random().toString()
	const file=path.join(serverconfig.tpmasterdir,putfiledir,id)
	fs.writeFile(file,req.body,err=>{
		if(err) {
			res.send({error:'cannot write file'})
			return
		}
		res.send({id:path.join(putfiledir,id)})
	})
}
*/

function handle_dsgenestat(req, res) {
	try {
		req.query = JSON.parse(req.body)
	} catch (e) {
		res.send({ error: 'invalid request body' })
		return
	}
	log(req)
	const gn = req.query.genome
	if (!gn) return res.send({ error: 'genome unspecified' })
	const g = genomes[gn]
	if (!g) return res.send({ error: 'invalid genome: ' + gn })
	if (!g.datasets) return res.send({ error: 'no datasets available for this genome' })
	if (!req.query.dsname) return res.send({ error: 'dataset name unspecified' })
	const dsc = g.datasets[req.query.dsname]
	if (!dsc) return res.send({ error: 'invalid dataset: ' + req.query.dsname })
	if (!dsc.queries) return res.send({ error: '.queries missing for dataset ' + req.query.dsname })
	if (!(gn in ch_genemcount)) {
		ch_genemcount[gn] = {}
	}
	const genemcount = ch_genemcount[gn]
	const usesilent = req.query.silent
	const genedata = {} // to be returned
	const qlst2 = [] // actually queried
	for (const i of req.query.lst) {
		if (i in genemcount && req.query.dsname in genemcount[i]) {
			const rec = genemcount[i][req.query.dsname]
			genedata[i] = {
				sample: rec.sample,
				total: rec.total
			}
			const class2 = {}
			for (const n in rec.class) {
				class2[n] = rec.class[n]
			}
			if (!usesilent) {
				// FIXME hardcoded silent class
				delete class2['S']
			}
			genedata[i].class = class2
			continue
		}
		qlst2.push(i)
		genedata[i] = {
			class: {},
			disease: {},
			sample: {},
			total: 0
		}
	}
	if (qlst2.length == 0) {
		res.send({ result: genedata, totalsample: dsc.samplecount })
		return
	}
	const tasks = []
	for (const q of dsc.queries) {
		if (!q.genemcount) continue
		tasks.push(next => {
			var idx = 0
			function run() {
				if (idx == qlst2.length) {
					next(null)
					return
				}
				const sql = q.genemcount.query(qlst2[idx])
				idx++
				dsc.db.all(sql, (err, results) => {
					if (err) {
						console.error('dsgenestat: ' + err)
						run()
						return
					}
					q.genemcount.summary(results, genedata)
					run()
				})
			}
			run()
		})
	}
	async.series(tasks, err => {
		if (err) {
			res.send({ error: err })
			return
		}
		const result = {} // returned result is a copy of genedata, since silent data may be modified
		for (const i in genedata) {
			result[i] = {
				total: genedata[i].total
			}
			// this genedata is not cached
			let c = 0
			for (const n in genedata[i].sample) {
				c++
			}
			genedata[i].sample = c
			result[i].sample = c
			if (!(i in genemcount)) {
				genemcount[i] = {}
			}
			// cache
			genemcount[i][req.query.dsname] = genedata[i]
			// decide whether to report silent
			const class2 = {}
			for (const n in genedata[i].class) {
				class2[n] = genedata[i].class[n]
			}
			/*
			if(!usesilent) {
				delete class2['S']
			}
			*/
			result[i].class = class2
		}
		res.send({ result: result, totalsample: dsc.samplecount })
		return
	})
}

function handle_study(req, res) {
	if (reqbodyisinvalidjson(req, res)) return
	if (illegalpath(req.query.file)) {
		res.send({ error: 'Illegal file path' })
		return
	}
	const file = path.join(
		serverconfig.tpmasterdir,
		req.query.file.endsWith('.json') ? req.query.file : req.query.file + '.json'
	)
	fs.readFile(file, 'utf8', (err, text) => {
		if (err) {
			res.send({ error: 'Error reading JSON file' })
			return
		}
		let cohort
		try {
			cohort = JSON.parse(text)
		} catch (e) {
			res.send({ error: 'Invalid JSON syntax' })
			return
		}
		if (!cohort.genome) {
			res.send({ error: 'genome missing' })
			return
		}
		if (cohort.dbexpression) {
			const dd = cohort.dbexpression
			if (!dd.dbfile) return res.send({ error: 'dbfile missing for dbexpression' })
			/*
		if(!ch_dbtable.has(dd.dbfile)) {
			const db=new sqlite3.Database(path.join(serverconfig.tpmasterdir,dd.dbfile),sqlite3.OPEN_READONLY,err=>{
				if(err) {
					dd.db=null
					console.error('cannot connect to dbfile: '+dd.dbfile)
				} else {
					console.log('Db opened: '+dd.dbfile)
					ch_dbtable.set(dd.dbfile,{db:db})
				}
			})
		}
		*/
			if (!dd.tablename) return res.send({ error: '.tablename missing from dbexpression' })
			if (!dd.keyname) return res.send({ error: '.keyname missing from dbexpression' })
			if (!dd.config) return res.send({ error: 'config missing from dbexpression' })
			cohort.dbexpression = {
				dbfile: dd.dbfile,
				tablename: dd.tablename,
				keyname: dd.keyname,
				tidy: dd.tidy,
				config: dd.config
			}
		}
		const tasklst = []
		const flagset = {}
		if (cohort.mutationset) {
			let nameless = 0
			for (const mset of cohort.mutationset) {
				const flag = bulk.init_bulk_flag(cohort.genome)
				if (!flag) {
					res.send({ error: 'init_bulk_flag() failed' })
					return
				}
				if (cohort.mutationset.length > 1) {
					flag.tpsetname = mset.name ? mset.name : 'set' + ++nameless
				}
				flagset[Math.random()] = flag
				if (mset.snvindel) {
					tasklst.push(next => {
						fs.readFile(path.join(serverconfig.tpmasterdir, mset.snvindel), 'utf8', (err, text) => {
							if (err) {
								next('file error: ' + mset.snvindel)
								return
							}
							const lines = text.trim().split(/\r?\n/)
							const herr = bulksnv.parseheader(lines[0], flag)
							if (herr) {
								next('snvindel header line error: ' + herr)
								return
							}
							for (let i = 1; i < lines.length; i++) {
								bulksnv.parseline(i, lines[i], flag)
							}
							next(null)
						})
					})
				}
				if (mset.sv) {
					tasklst.push(next => {
						fs.readFile(path.join(serverconfig.tpmasterdir, mset.sv), 'utf8', (err, text) => {
							if (err) {
								next('file error: ' + mset.sv)
								return
							}
							const lines = text.trim().split(/\r?\n/)
							const herr = bulksv.parseheader(lines[0], flag, true)
							if (herr) {
								next('sv header line error: ' + herr)
								return
							}
							for (let i = 1; i < lines.length; i++) {
								bulksv.parseline(i, lines[i], flag, true)
							}
							next(null)
						})
					})
				}
				if (mset.fusion) {
					tasklst.push(next => {
						fs.readFile(path.join(serverconfig.tpmasterdir, mset.fusion), 'utf8', (err, text) => {
							if (err) {
								next('file error: ' + mset.fusion)
								return
							}
							const lines = text.trim().split(/\r?\n/)
							const herr = bulksv.parseheader(lines[0], flag, false)
							if (herr) {
								next('fusion header line error: ' + herr)
								return
							}
							for (let i = 1; i < lines.length; i++) {
								bulksv.parseline(i, lines[i], flag, false)
							}
							next(null)
						})
					})
				}
				if (mset.svjson) {
					tasklst.push(next => {
						fs.readFile(path.join(serverconfig.tpmasterdir, mset.svjson), 'utf8', (err, text) => {
							if (err) {
								next('file error: ' + mset.svjson)
								return
							}
							const lines = text.trim().split(/\r?\n/)
							const [herr, header] = bulksvjson.parseheader(lines[0], flag)
							if (herr) {
								next('svjson header line error: ' + herr)
								return
							}
							for (let i = 1; i < lines.length; i++) {
								bulksvjson.parseline(i, lines[i], flag, header)
							}
							next(null)
						})
					})
				}
				if (mset.cnv) {
					tasklst.push(next => {
						fs.readFile(path.join(serverconfig.tpmasterdir, mset.cnv), 'utf8', function(err, text) {
							if (err) {
								next('file error: ' + mset.cnv)
								return
							}
							const lines = text.trim().split(/\r?\n/)
							const herr = bulkcnv.parseheader(lines[0], flag)
							if (herr) {
								next('cnv header line error: ' + herr)
								return
							}
							for (let i = 1; i < lines.length; i++) {
								bulkcnv.parseline(i, lines[i], flag)
							}
							next(null)
						})
					})
				}
				if (mset.itd) {
					tasklst.push(next => {
						fs.readFile(path.join(serverconfig.tpmasterdir, mset.itd), 'utf8', (err, text) => {
							if (err) {
								next('file error: ' + mset.itd)
								return
							}
							const lines = text.trim().split(/\r?\n/)
							const herr = bulkitd.parseheader(lines[0], flag)
							if (herr) {
								next('itd header line error: ' + herr)
								return
							}
							for (let i = 1; i < lines.length; i++) {
								bulkitd.parseline(i, lines[i], flag)
							}
							next(null)
						})
					})
				}
				if (mset.deletion) {
					tasklst.push(next => {
						fs.readFile(path.join(serverconfig.tpmasterdir, mset.deletion), 'utf8', (err, text) => {
							if (err) {
								next('file error: ' + mset.deletion)
								return
							}
							const lines = text.trim().split(/\r?\n/)
							const herr = bulkdel.parseheader(lines[0], flag)
							if (herr) {
								next('deletion header line error: ' + herr)
								return
							}
							for (let i = 1; i < lines.length; i++) {
								bulkdel.parseline(i, lines[i], flag)
							}
							next(null)
						})
					})
				}
				if (mset.truncation) {
					tasklst.push(next => {
						fs.readFile(path.join(serverconfig.tpmasterdir, mset.truncation), 'utf8', (err, text) => {
							if (err) {
								next('file error: ' + mset.truncation)
								return
							}
							const lines = text.trim().split(/\r?\n/)
							const herr = bulktrunc.parseheader(lines[0], flag)
							if (herr) {
								next('Truncation header line error: ' + herr)
								return
							}
							for (let i = 1; i < lines.length; i++) {
								bulktrunc.parseline(i, lines[i], flag)
							}
							next(null)
						})
					})
				}
				if (mset.variant_gene_assoc) {
					tasklst.push(next => {
						fs.readFile(path.join(serverconfig.tpmasterdir, mset.variant_gene_assoc), 'utf8', (err, text) => {
							if (err) {
								return next('file error: ' + mset.variant_gene_assoc)
							}
							const lines = text.trim().split(/\r?\n/)
							const [err2, header] = parse_header_variantgene(lines[0])
							if (err2) {
								next('variant-gene-association header line error: ' + err)
								return
							}
							const errlst = [],
								mlst = []
							for (let i = 1; i < lines.length; i++) {
								if (lines[i][0] == '#') continue
								const [err3, m] = parse_variantgene(lines[i], header)
								if (err3) {
									errlst.push(err)
									continue
								}
								mlst.push(m)
							}
							flag.variantgene = {
								header: header,
								errlst: errlst,
								mlst: mlst
							}
							next(null)
						})
					})
				}
				// newdt
			}
		}
		if (cohort.hardcodemap) {
			if (!Array.isArray(cohort.hardcodemap)) return res.send({ error: 'hardcodemap value should be an array' })
			for (const hcmap of cohort.hardcodemap) {
				if (!hcmap.file) {
					return res.send({ error: '.file missing for one hard-coded map' })
				}
				if (!hcmap.metadata) {
					return res.send({ error: '.metadata missing for one hard-coded map' })
				}
				tasklst.push(next => {
					fs.readFile(path.join(serverconfig.tpmasterdir, hcmap.file), 'utf8', (err, text) => {
						if (err) {
							return next('cannot read file ' + hcmap.file + ' for hard-coded map')
						}
						hcmap.text = text
						next(null)
					})
				})
			}
		}
		if (cohort.annotations) {
			const idkey = cohort.annotations.idkey ? cohort.annotations.idkey : 'sample'
			cohort.annotations.data = {}
			cohort.annotations.files.forEach(filename => {
				tasklst.push(next => {
					fs.readFile(path.join(serverconfig.tpmasterdir, filename), 'utf8', (err, text) => {
						if (err) {
							return next('file error: ' + filename)
						}
						d3dsv.tsvParse(text).forEach(d => {
							const id = d[idkey].trim()
							if (!cohort.annotations.data[id]) {
								cohort.annotations.data[id] = []
							}
							cohort.annotations.data[id].push(d)
						})
						next(null)
					})
				})
			})
		}
		async.series(tasklst, err => {
			if (err) {
				res.send({ error: err })
				return
			}
			for (const k in flagset) {
				local_end_flag(flagset[k])
			}
			delete cohort.mutationset
			res.send({
				cohort: cohort,
				flagset: flagset
			})
		})
	})
}

function handle_textfile(req, res) {
	/*
	load a server hosted text file
	argument is json object
	.file
		path from <TP>
	.from
	.to
		optional, if present, will get range [from to] 1-based, else will get the entire file
	*/
	if (reqbodyisinvalidjson(req, res)) return
	if (!req.query.file) return res.send({ error: 'no file' })
	if (illegalpath(req.query.file)) return res.send({ error: 'invalid file name' })

	const file = path.join(serverconfig.tpmasterdir, req.query.file)

	if (req.query.from != undefined) {
		// get range [from to]
		if (!Number.isInteger(req.query.from)) {
			res.send({ error: 'invalid value for from' })
			return
		}
		if (!Number.isInteger(req.query.to)) {
			res.send({ error: 'invalid value for to' })
			return
		}
		const lines = []
		// TODO replace by readline
		lazy(fs.createReadStream(file))
			.on('end', () => {
				res.send({ text: lines.join('\n') })
			})
			.lines.map(String)
			.skip(req.query.from - 1)
			.take(req.query.to)
			.forEach(line => {
				lines.push(line)
			})
	} else {
		// get entire file
		fs.readFile(file, { encoding: 'utf8' }, (err, data) => {
			if (err) {
				res.send({ error: 'error reading file' })
				return
			}
			res.send({ text: data })
		})
	}
}

async function handle_urltextfile(req, res) {
	if (reqbodyisinvalidjson(req, res)) return
	const url = req.query.url
	try {
		const response = await got(url)
		switch (response.statusCode) {
			case 200:
				res.send({ text: utils.stripJsScript(response.body) })
				return
			case 404:
				res.send({ error: 'File not found: ' + url })
				return
			default:
				res.send({ error: 'unknown status code: ' + response.status })
		}
	} catch (e) {
		return res.send({ error: 'Error downloading file: ' + url })
	}
}

function mds_query_arg_check(q) {
	if (!q.genome) return ['no genome']
	const g = genomes[q.genome]
	if (!g) return ['invalid genome']
	if (!g.datasets) return ['genome is not equipped with datasets']
	if (!q.dslabel) return ['dslabel missing']
	const ds = g.datasets[q.dslabel]
	if (!ds) return ['invalid dslabel']
	if (!ds.queries) return ['dataset is not equipped with queries']
	if (!q.querykey) return ['querykey missing']
	const query = ds.queries[q.querykey]
	if (!query) return ['invalid querykey']
	return [null, g, ds, query]
}

function handle_mdscnv(req, res) {
	/*
	get all cnv in view range, make stats for:
		- sample annotation


	****** filter attributes (added by addFilterToLoadParam)

	.cohortHiddenAttr (for dropping sample by annotation)
		.key
			.value


	******* routes

	*/

	if (reqbodyisinvalidjson(req, res)) return

	const [err, gn, ds, dsquery] = mds_query_arg_check(req.query)
	if (err) return res.send({ error: err })

	///////////////// getting all cnv from view range

	if (!req.query.rglst) return res.send({ error: 'rglst missing' })
	if (!req.query.gain) return res.send({ error: '.gain missing' })
	if (!req.query.loss) return res.send({ error: '.loss missing' })

	if (dsquery.viewrangeupperlimit) {
		const len = req.query.rglst.reduce((i, j) => i + j.stop - j.start, 0)
		if (len >= dsquery.viewrangeupperlimit) {
			return res.send({ error: 'zoom in under ' + common.bplen(dsquery.viewrangeupperlimit) + ' to view details' })
		}
	}

	if (req.query.permanentHierarchy) {
		const err = mds_tkquery_parse_permanentHierarchy(req.query, ds)
		if (err) return res.send({ error: 'permanentHierarchy error: ' + err })
	}

	const tasks = []

	// cnv event number in view range, and samples, gain/loss separately
	const gain = {
		count: 0, // number of lines
		samples: new Set()
	}
	const loss = {
		count: 0,
		samples: new Set()
	}

	for (const r of req.query.rglst) {
		const task = new Promise((resolve, reject) => {
			const ps = spawn(
				tabix,
				[
					dsquery.file ? path.join(serverconfig.tpmasterdir, dsquery.file) : dsquery.url,
					r.chr + ':' + r.start + '-' + r.stop
				],
				{ cwd: dsquery.usedir }
			)
			const rl = readline.createInterface({
				input: ps.stdout
			})

			/* r.width (# of pixels) is number of bins in this region
			bin resolution is # of bp per bin
			*/
			const binresolution = (r.stop - r.start) / r.width

			// cumulative value per pixel, for this region
			const regioncumv = []
			for (let i = 0; i < r.width; i++) {
				regioncumv.push({ positive: 0, negative: 0 })
			}

			rl.on('line', line => {
				const l = line.split('\t')
				const start0 = Number.parseInt(l[1])
				const stop0 = Number.parseInt(l[2])

				if (req.query.bplengthUpperLimit) {
					if (stop0 - start0 > req.query.bplengthUpperLimit) {
						return
					}
				}

				const j = JSON.parse(l[3])

				if (req.query.valueCutoff) {
					if (Math.abs(j.value) < req.query.valueCutoff) {
						return
					}
				}

				if (j.sample && ds.cohort && ds.cohort.annotation) {
					// may apply sample annotation filtering
					const anno = ds.cohort.annotation[j.sample]
					if (!anno) {
						// this sample has no annotation at all, since it's doing filtering, will drop it
						return
					}

					if (req.query.cohortOnlyAttr && ds.cohort && ds.cohort.annotation) {
						/*
						from subtrack, will only use samples for one attribute (from hierarchies)
						cannot refer ds.cohort.attributes
						*/
						let keep = false // if match with any in cohortOnlyAttr, will keep the sample
						for (const attrkey in req.query.cohortOnlyAttr) {
							const value = anno[attrkey]
							if (value && req.query.cohortOnlyAttr[attrkey][value]) {
								keep = true
								break
							}
						}
						if (!keep) {
							return
						}
					}

					if (req.query.cohortHiddenAttr && ds.cohort.attributes) {
						let hidden = false

						for (const attrkey in req.query.cohortHiddenAttr) {
							// this attribute in registry, so to be able to tell if it's numeric
							const attr = ds.cohort.attributes.lst.find(i => i.key == attrkey)

							if (attr.isNumeric) {
								//continue
							}

							// categorical
							const value = anno[attrkey]
							if (value) {
								// this sample has annotation for this attrkey
								if (req.query.cohortHiddenAttr[attrkey][value]) {
									hidden = true
									break
								}
							} else {
								// this sample has no value for attrkey
								if (req.query.cohortHiddenAttr[attrkey][infoFilter_unannotated]) {
									// to drop unannotated ones
									hidden = true
									break
								}
							}
						}
						if (hidden) {
							// this sample has a hidden value for an attribute, skip
							return
						}
					}
				}
				// this item is acceptable
				if (j.value > 0) {
					gain.count++
					gain.samples.add(j.sample)
				} else if (j.value < 0) {
					loss.count++
					loss.samples.add(j.sample)
				}

				// accumulate
				const start = Math.max(r.start, start0)
				const stop = Math.min(r.stop, stop0)

				let startidx, stopidx
				if (r.reverse) {
					startidx = Math.floor((r.stop - stop) / binresolution)
					stopidx = Math.floor((r.stop - start) / binresolution)
				} else {
					startidx = Math.floor((start - r.start) / binresolution)
					stopidx = Math.floor((stop - r.start) / binresolution)
				}
				for (let i = startidx; i < stopidx; i++) {
					if (j.value > 0) {
						//regioncumv[i].positive += j.value
						regioncumv[i].positive++
					} else if (j.value < 0) {
						//regioncumv[i].negative += -j.value
						regioncumv[i].negative++
					}
				}
			})

			const errout = []
			ps.stderr.on('data', i => errout.push(i))
			ps.on('close', code => {
				const e = errout.join('')
				if (e && !tabixnoterror(e)) {
					reject(e)
					return
				}
				resolve(regioncumv)
			})
		})
		tasks.push(task)
	}

	Promise.all(tasks)
		.then(data => {
			// canvas width
			const width = req.query.rglst.reduce((i, j) => i + j.width + req.query.regionspace, 0) - req.query.regionspace
			const canvas = createCanvas(width, req.query.gain.barheight + req.query.loss.barheight)
			const ctx = canvas.getContext('2d')

			const result = {
				gain: {
					count: gain.count,
					samplenumber: gain.samples.size
				},
				loss: {
					count: loss.count,
					samplenumber: loss.samples.size
				},
				maxvalue: 0 // max cumulative cnv value, shared for both negative & positive
			}

			if (gain.count + loss.count == 0) {
				// no data
				ctx.font = '15px Arial'
				ctx.fillStyle = '#aaa'
				ctx.textAlign = 'center'
				ctx.textBaseline = 'middle'
				ctx.fillText('No data in view range', width / 2, req.query.gain.barheight)
				result.src = canvas.toDataURL()
				res.send(result)
				return
			}

			for (const r of data) {
				for (const c of r) {
					result.maxvalue = Math.max(result.maxvalue, c.positive, c.negative)
				}
			}

			const maxvalue = req.query.maxvalue || result.maxvalue

			// render
			let x = 0
			for (const regioncumv of data) {
				for (const c of regioncumv) {
					if (c.positive) {
						ctx.fillStyle = req.query.gain.color || '#67a9cf'
						const h = Math.ceil((req.query.gain.barheight * Math.min(maxvalue, c.positive)) / maxvalue)
						const y = req.query.gain.barheight - h
						ctx.fillRect(x, y, 1, h)
					}
					if (c.negative) {
						ctx.fillStyle = req.query.loss.color || '#ef8a62'
						const h = Math.ceil((req.query.loss.barheight * Math.min(maxvalue, c.negative)) / maxvalue)
						const y = req.query.gain.barheight
						ctx.fillRect(x, y, 1, h)
					}
					x++
				}
				x += req.query.regionspace
			}

			result.src = canvas.toDataURL()

			/* annotation summary
		must pool gain & loss samples together for annotation summary
		*/
			if (gain.samples.size || loss.samples.size) {
				const allsamples = new Set([...gain.samples, ...loss.samples])
				const [attributeSummary, hierarchySummary] = mds_tkquery_samplesummary(ds, dsquery, [...allsamples])
				if (attributeSummary) {
					for (const attr of attributeSummary) {
						for (const value of attr.values) {
							value.gain = 0
							value.loss = 0
							for (const samplename of value.sampleset) {
								if (gain.samples.has(samplename)) value.gain++
								if (loss.samples.has(samplename)) value.loss++
							}
							delete value.sampleset
						}
					}
					result.attributeSummary = attributeSummary
				}
				if (hierarchySummary) {
					for (const k in hierarchySummary) {
						for (const node of hierarchySummary[k]) {
							if (!node.sampleset) continue
							node.gain = 0
							node.loss = 0
							for (const samplename of node.sampleset) {
								if (gain.samples.has(samplename)) node.gain++
								if (loss.samples.has(samplename)) node.loss++
							}
						}
					}
					result.hierarchySummary = hierarchySummary
				}
			}

			res.send(result)
		})
		.catch(err => {
			res.send({ error: err })
			if (err.stack) {
				// debug
				console.error(err.stack)
			}
		})
}

async function handle_mdssvcnv(req, res) {
	/*
	cnv & vcf & expression rank done in one query
		- get all cnv/loh in view range:
			- filtering
			- group events by sample
			- group samples by hierarchy, for client rendering

		- if to make expression rank:
			- expression file for official or custom
			- calculate expression rank for genes in each sample

	vcf matrix and ase computation

	****** filter attributes (added by addFilterToLoadParam)

	.singlesample
	.showonlycnvwithsv

	*/

	if (reqbodyisinvalidjson(req, res)) return

	let gn, ds, dsquery

	if (req.query.iscustom) {
		// is custom track
		gn = genomes[req.query.genome]
		if (!gn) return res.send({ error: 'invalid genome' })

		// in ase by vcf and rnabam mode, svcnv file is optional
		//if(!req.query.file && !req.query.url) return res.send({error:'no file or url for svcnv track'})

		ds = {}
		dsquery = {
			iscustom: 1,
			file: req.query.file,
			url: req.query.url,
			indexURL: req.query.indexURL,
			allow_getallsamples: true
		}

		if (req.query.checkexpressionrank) {
			if (!req.query.checkexpressionrank.file && !req.query.checkexpressionrank.url)
				return res.send({ error: 'no file or url for checkexpressionrank' })
			dsquery.checkexpressionrank = {
				file: req.query.checkexpressionrank.file,
				url: req.query.checkexpressionrank.url,
				indexURL: req.query.checkexpressionrank.indexURL
			}
		}

		if (req.query.checkvcf) {
			let vcf
			try {
				vcf = JSON.parse(req.query.checkvcf)
			} catch (e) {
				return res.send({ error: 'invalid JSON for VCF object' })
			}
			if (!vcf.file && !vcf.url) return res.send({ error: 'no file or url for custom VCF track' })
			vcf.type = common.mdsvcftype.vcf
			dsquery.checkvcf = {
				info: vcf.info,
				tracks: [vcf]
			}
		}

		if (req.query.checkrnabam) {
			if (!req.query.checkrnabam.samples) return res.send({ error: 'samples{} missing from checkrnabam' })
			let n = 0
			for (const k in req.query.checkrnabam.samples) n++
			if (n > 13) return res.send({ error: 'no more than 13 BAM files allowed' })
			const e = ase_testarg(req.query.checkrnabam)
			if (e) return res.send({ error: e })
			dsquery.checkrnabam = req.query.checkrnabam
		}
	} else {
		// is native track
		const [err, gn1, ds1, dsquery1] = mds_query_arg_check(req.query)
		if (err) return res.send({ error: err })
		gn = gn1
		ds = ds1
		dsquery = dsquery1
	}

	///////////////// exits
	if (req.query.gettrack4singlesample) return mdssvcnv_exit_gettrack4singlesample(req, res, gn, ds, dsquery)
	if (req.query.findsamplename) return mdssvcnv_exit_findsamplename(req, res, gn, ds, dsquery)
	if (req.query.getsample4disco) return mdssvcnv_exit_getsample4disco(req, res, gn, ds, dsquery)
	if (req.query.getexpression4gene) return mdssvcnv_exit_getexpression4gene(req, res, gn, ds, dsquery)
	if (req.query.ifsamplehasvcf) return mdssvcnv_exit_ifsamplehasvcf(req, res, gn, ds, dsquery)
	if (req.query.assaymap) return mdssvcnv_exit_assaymap(req, res, gn, ds, dsquery)

	if (!req.query.rglst) return res.send({ error: 'rglst missing' })

	if (dsquery.viewrangeupperlimit) {
		// hard limit from official dataset
		const len = req.query.rglst.reduce((i, j) => i + j.stop - j.start, 0)
		if (len >= dsquery.viewrangeupperlimit) {
			return res.send({ error: 'zoom in under ' + common.bplen(dsquery.viewrangeupperlimit) + ' to view details' })
		}
	}

	/*******
	TODO rewrite: helper func return {} attached with all possible filters
	***/

	// single or multi: hidden dt, for cnv/loh/sv/fusion/itd, all from one file
	let hiddendt
	if (req.query.hiddendt) {
		hiddendt = new Set(req.query.hiddendt)
	}

	/*
	multi: mutation attributes selected to be hidden from client
	terms defined in ds.mutationAttribute
	*/
	let hiddenmattr
	if (req.query.hiddenmattr) {
		hiddenmattr = {}
		for (const key in req.query.hiddenmattr) {
			hiddenmattr[key] = new Set(req.query.hiddenmattr[key])
		}
	}

	/*
	multi: vcf info field allele-level
	*/
	let filteralleleattr
	if (req.query.filteralleleattr) {
		filteralleleattr = {}
		for (const key in req.query.filteralleleattr) {
			const v = req.query.filteralleleattr[key]
			if (v.cutoffvalue != undefined) {
				// numeric
				filteralleleattr[key] = v
			} else {
				// categorical
			}
		}
	}

	let filter_sampleset
	if (req.query.sampleset) {
		filter_sampleset = {
			set: new Set(),
			sample2group: new Map()
		}
		for (const i of req.query.sampleset) {
			for (const s of i.samples) {
				filter_sampleset.set.add(s)
				filter_sampleset.sample2group.set(s, i.name)
			}
		}
	}

	// TODO terms from locusAttribute

	/*
	multi: sample attributes selected to be hidden from client
	as defined in ds.cohort.sampleAttribute
	*/
	let hiddensampleattr
	if (req.query.hiddensampleattr) {
		hiddensampleattr = {}
		for (const key in req.query.hiddensampleattr) {
			hiddensampleattr[key] = new Set(req.query.hiddensampleattr[key])
		}
	}

	// cache svcnv tk url index
	if (dsquery.url) {
		try {
			dsquery.dir = await utils.cache_index(dsquery.url, dsquery.indexURL)
		} catch (e) {
			return res.send({ error: 'svcnv file index url error' })
		}
	}

	// query svcnv
	const data_cnv = await handle_mdssvcnv_cnv(
		ds,
		dsquery,
		req,
		hiddendt,
		hiddensampleattr,
		hiddenmattr,
		filter_sampleset
	)

	// expression query
	const [expressionrangelimit, gene2sample2obj] = await handle_mdssvcnv_expression(ds, dsquery, req, data_cnv)

	// vcf query
	// for both single- and multi sample
	// each member track has its own data type
	// querying procedure is the same for all types, data parsing will be different
	const [vcfrangelimit, data_vcf] = await handle_mdssvcnv_vcf(
		gn,
		ds,
		dsquery,
		req,
		filteralleleattr,
		hiddendt,
		hiddenmattr,
		hiddensampleattr,
		filter_sampleset
	)

	// group samples by svcnv, calculate expression rank
	const sample2item = mdssvcnv_do_sample2item(data_cnv)

	/*
	if(req.query.showonlycnvwithsv) {
		mdssvcnv_do_showonlycnvwithsv(sample2item)
	}
	*/

	if (req.query.singlesample) {
		/*
		exit
		single sample does not include expression
		but will include vcf
		*/
		const result = {
			lst: sample2item.get(req.query.singlesample)
		}

		if (vcfrangelimit) {
			// out of range
			result.vcfrangelimit = vcfrangelimit
		} else {
			result.data_vcf = data_vcf
		}

		res.send(result)
		return
	}

	const samplegroups = handle_mdssvcnv_groupsample(ds, dsquery, data_cnv, data_vcf, sample2item, filter_sampleset)

	const result = {
		samplegroups: samplegroups,
		vcfrangelimit: vcfrangelimit,
		data_vcf: data_vcf
	}

	// QUICK FIX!!
	if (req.query.getallsamples && dsquery.allow_getallsamples) {
		result.getallsamples = true
	}

	if (dsquery.checkrnabam) {
		// should be only one querying region
		await handle_mdssvcnv_rnabam(req.query.rglst[0], gn, dsquery, result)
		// added result.checkrnabam[{}]
	} else {
		handle_mdssvcnv_addexprank(result, ds, expressionrangelimit, gene2sample2obj)
	}

	handle_mdssvcnv_end(ds, result)

	res.send(result)
}

async function mdssvcnv_exit_assaymap(req, res, gn, ds, dsquery) {
	try {
		if (!ds.assayAvailability) throw 'assay availability not enabled for this dataset'
		const skip_termids = new Set(req.query.skip_termids || [])
		const sample2assay = new Map()
		// k: sample
		// v: Map( assay => 'yes')
		for (const n in ds.cohort.annotation) {
			if (req.query.key) {
				// only keep samples matching with key/value
				const s = ds.cohort.annotation[n]
				if (s[req.query.key] != req.query.value) continue
			}
			sample2assay.set(n, new Map())
		}
		for (const [sample, k2v] of sample2assay) {
			const a = ds.assayAvailability.samples.get(sample)
			if (!a) continue
			for (const t of ds.assayAvailability.assays) {
				if (skip_termids.has(t.id)) continue
				if (a[t.id]) {
					k2v.set(t.id, 'yes')
				}
			}
		}
		for (const sample of sample2assay.keys()) {
			if (sample2assay.get(sample).size == 0) sample2assay.delete(sample)
		}
		const data = {}
		data.totalsample = sample2assay.size
		data.terms = draw_partition({
			sample2term: sample2assay,
			terms: ds.assayAvailability.assays,
			config: {
				termidorder: req.query.termidorder // optional
			}
		})
		res.send(data)
	} catch (e) {
		res.send({ error: e.message || e })
	}
}

async function handle_mdssvcnv_rnabam(region, genome, dsquery, result) {
	/*
	runs on a vcf matrix, and one rna bam file for each sample
	hardcoded to query first region
	irrelevant to samplegroup from svcnv query
	*/

	if (!dsquery.checkvcf) return
	if (region.stop - region.start >= 500000) {
		result.expressionrangelimit = 500000
		return
	}

	const genetk = genome.tracks.find(i => i.__isgene)

	const genes = await handle_ase_getgenes(genome, genetk, region.chr, region.start, region.stop)

	let start = null,
		stop
	for (const o of genes.values()) {
		if (start == null) {
			start = o.start
			stop = o.stop
		} else {
			start = Math.min(start, o.start)
			stop = Math.max(stop, o.stop)
		}
	}

	await handle_mdssvcnv_rnabam_do(genes, region.chr, start, stop, dsquery, result)
}

async function handle_mdssvcnv_rnabam_do(genes, chr, start, stop, dsquery, result) {
	/* actually do
	works for normal query and adding fixed gene in expression column
	*/

	const snps = await handle_mdssvcnv_rnabam_getsnp(dsquery, chr, start, stop)
	const testlines = []

	for (const samplename in dsquery.checkrnabam.samples) {
		// for each gene, record het snp from this sample of this gene
		const sbam = dsquery.checkrnabam.samples[samplename]
		sbam.hetsnps = [] // all het for this sample

		for (const m of snps) {
			const het = handle_ase_hetsnp4sample(m, samplename, dsquery.checkrnabam)
			if (het && het.dnacount.ishet) sbam.hetsnps.push(het)
		}

		if (sbam.url) {
			// even if no het snp still init dir, will calculate fpkm later for all bams
			sbam.dir = await utils.cache_index(sbam.url, sbam.indexURL || sbam.url + '.bai')
		} else if (sbam.file) {
			sbam.file = path.join(serverconfig.tpmasterdir, sbam.file)
		}

		if (sbam.hetsnps.length > 0) {
			// do one pileup for these snp over this bam
			await handle_mdssvcnv_rnabam_pileup(sbam, sbam.hetsnps, chr, dsquery.checkrnabam)
			for (const m of sbam.hetsnps) {
				if (m.rnacount.nocoverage) continue
				if (m.rnacount.ref + m.rnacount.alt < dsquery.checkrnabam.rna_mintotalreads) continue
				testlines.push(
					samplename +
						'.' +
						m.pos +
						'.' +
						m.ref +
						'.' +
						m.alt +
						'\t\t\t\t\t\t\t\t' +
						m.rnacount.ref +
						'\t' +
						m.rnacount.alt
				)
			}
		}
	}

	if (testlines.length > 0) {
		await handle_mdssvcnv_rnabam_binom(testlines, dsquery.checkrnabam.samples)
	}

	result.checkrnabam = []

	for (const samplename in dsquery.checkrnabam.samples) {
		const sbam = dsquery.checkrnabam.samples[samplename]

		const thisgenes = []
		for (const [genename, genepos] of genes) {
			// one obj for each gene
			const outputgene = {
				gene: genename,
				chr: chr,
				start: genepos.start,
				stop: genepos.stop
			}

			// het snps within this gene
			const thishetsnp = sbam.hetsnps.filter(m => m.pos >= genepos.start && m.pos <= genepos.stop)
			// het snps covered in rna
			const rnasnp = thishetsnp.filter(m => !m.rnacount.nocoverage)

			if (rnasnp.length > 0) {
				const deltasum = rnasnp.reduce((i, j) => i + Math.abs(j.rnacount.f - 0.5), 0)

				// geometric mean
				let mean = null
				// number of ase markers by pvalue cutoff
				let ase_markers = 0
				for (const s of rnasnp) {
					// if rna read count below cutoff, then pvalue is undefined
					if (s.rnacount.pvalue != undefined) {
						if (mean == null) mean = s.rnacount.pvalue
						else mean *= s.rnacount.pvalue

						if (s.rnacount.pvalue <= dsquery.checkrnabam.binompvaluecutoff) {
							ase_markers++
						}
					}
				}

				if (mean != null) {
					// has snp with valid pvalue
					outputgene.ase = {
						markers: thishetsnp.filter(i => i.dnacount.ishet).length,
						ase_markers: ase_markers,
						mean_delta: deltasum / rnasnp.length,
						geometricmean: Math.pow(mean, 1 / rnasnp.length)
					}
				}
			}

			let count
			if (sbam.pairedend) {
				count = await handle_mdssvcnv_rnabam_genefragcount(sbam, chr, genepos)
			} else {
				count = await handle_mdssvcnv_rnabam_genereadcount(sbam, chr, genepos)
			}

			outputgene.fpkm = (count * 1000000000) / (sbam.totalreads * genepos.exonlength)
			outputgene.snps = thishetsnp

			thisgenes.push(outputgene)
		}
		if (thisgenes.length) {
			result.checkrnabam.push({
				sample: samplename,
				genes: thisgenes
			})
		}
	}
}

function handle_mdssvcnv_rnabam_genereadcount(bam, chr, gene) {
	/* get # of reads for single-end sequencing over exons
	.exonunion[
		[ start, stop ], e2, ...
	]
	*/
	return new Promise((resolve, reject) => {
		const args = ['view', '-c', '-M', bam.url || bam.file]
		for (const e of gene.exonunion) {
			args.push((bam.nochr ? chr.replace('chr', '') : chr) + ':' + (e[0] + 1) + '-' + (e[1] + 1))
		}
		const sp = spawn(samtools, args, { cwd: bam.dir })
		const out = [],
			out2 = []
		sp.stdout.on('data', i => out.push(i))
		sp.stderr.on('data', i => out2.push(i))
		sp.on('close', () => {
			resolve(Number.parseInt(out.join('')))
		})
	})
}

function handle_mdssvcnv_rnabam_genefragcount(bam, chr, gene) {
	// for paired-end, over exons
	return new Promise((resolve, reject) => {
		const args = ['view', '-M', bam.url || bam.file]
		for (const e of gene.exonunion) {
			args.push((bam.nochr ? chr.replace('chr', '') : chr) + ':' + (e[0] + 1) + '-' + (e[1] + 1))
		}

		const p1 = spawn(samtools, args, { cwd: bam.dir })
		const p2 = spawn('cut', ['-f1'], { cwd: bam.dir })
		const p3 = spawn('sort', ['-u'], { cwd: bam.dir })
		const p4 = spawn('wc', ['-l'], { cwd: bam.dir })
		p1.stdout.pipe(p2.stdin)
		p2.stdout.pipe(p3.stdin)
		p3.stdout.pipe(p4.stdin)
		const out = [],
			out2 = []
		p4.stdout.on('data', i => out.push(i))
		p4.stderr.on('data', i => out2.push(i))
		p4.on('close', () => {
			resolve(Number.parseInt(out.join('')))
		})
	})
}

async function handle_mdssvcnv_rnabam_binom(lines, samples) {
	const infile = await handle_mdssvcnv_rnabam_binom_write(lines)
	const pfile = await handle_ase_binom_test(infile)
	await handle_mdssvcnv_rnabam_binom_result(pfile, samples)
	fs.unlink(infile, () => {})
	fs.unlink(pfile, () => {})
}

function handle_mdssvcnv_rnabam_binom_write(lines) {
	const snpfile = path.join(serverconfig.cachedir, Math.random().toString())
	return new Promise((resolve, reject) => {
		fs.writeFile(snpfile, lines.join('\n') + '\n', err => {
			if (err) reject('cannot write')
			resolve(snpfile)
		})
	})
}

function handle_mdssvcnv_rnabam_binom_result(pfile, samples) {
	return new Promise((resolve, reject) => {
		fs.readFile(pfile, 'utf8', (err, data) => {
			if (err) reject('cannot read binom pvalue')
			if (!data) resolve()
			for (const line of data.trim().split('\n')) {
				const l = line.split('\t')
				const tmp = l[0].split('.')
				const sbam = samples[tmp[0]]
				if (!sbam) {
					// should not happen
					continue
				}
				const m = sbam.hetsnps.find(i => i.pos + '.' + i.ref + '.' + i.alt == tmp[1] + '.' + tmp[2] + '.' + tmp[3])
				if (m) {
					m.rnacount.pvalue = Number.parseFloat(l[10])
				}
			}
			resolve()
		})
	})
}

function handle_mdssvcnv_rnabam_pileup(bam, snps, chr, arg) {
	// only query said snps
	const lst = []
	for (const m of snps) {
		m.rnacount = {
			nocoverage: 1
		}
		lst.push((bam.nochr ? chr.replace('chr', '') : chr) + ':' + (m.pos + 1) + '-' + (m.pos + 1))
	}

	return new Promise((resolve, reject) => {
		const sp = spawn(
			bcftools,
			[
				'mpileup',
				'--no-reference',
				'-a',
				'INFO/AD',
				'-d',
				999999,
				'-r',
				lst.join(','),
				'-q',
				arg.rnapileup_q,
				'-Q',
				arg.rnapileup_Q,
				bam.url || bam.file
			],
			{ cwd: bam.dir }
		)

		const rl = readline.createInterface({ input: sp.stdout })
		rl.on('line', line => {
			if (line[0] == '#') return

			const m0 = mpileup_parsevcf_dp_ad(line)
			if (!m0) return

			const m = snps.find(m => m.pos == m0.pos)
			if (m) {
				// a het snp
				const c1 = m0.allele2count[m.ref] || 0
				const c2 = m0.allele2count[m.alt] || 0

				if (c1 + c2 > 0) {
					// has coverage at this snp
					m.rnacount = {
						ref: c1,
						alt: c2,
						f: c2 / (c1 + c2)
					}
				}
			}
		})

		sp.on('close', () => {
			resolve()
		})
	})
}

async function handle_mdssvcnv_rnabam_getsnp(dsquery, chr, start, stop) {
	/*
	hardcoded to query first vcf track
	*/

	const x = dsquery.checkvcf.tracks[0]
	const vobj = {
		file: x.file,
		url: x.url,
		indexURL: x.indexURL,
		dir: x.dir,
		nochr: x.nochr,
		samples: x.samples,
		info: dsquery.checkvcf.info,
		format: x.format
	}

	const lines = await tabix_getlines(
		vobj.file ? path.join(serverconfig.tpmasterdir, vobj.file) : vobj.url,
		(vobj.nochr ? chr.replace('chr', '') : chr) + ':' + start + '-' + stop,
		vobj.dir
	)

	const allsnps = []

	for (const line of lines || []) {
		const [badinfo, mlst, altinvalid] = vcf.vcfparseline(line, vobj)

		for (const m of mlst) {
			if (!common.basecolor[m.ref] || !common.basecolor[m.alt]) {
				// is not snp
				continue
			}
			if (!m.sampledata) continue
			allsnps.push(m)
		}
	}
	return allsnps
}

function handle_mdssvcnv_groupsample(ds, dsquery, data_cnv, data_vcf, sample2item, filter_sampleset) {
	// multi sample

	mdssvcnv_do_copyneutralloh(sample2item)

	// group sample by available attributes
	const samplegroups = []

	if (filter_sampleset) {
		// custom sample set

		const key2group = new Map()
		// key: group name, v: list of samples from that group

		for (const [n, items] of sample2item) {
			const groupname = filter_sampleset.sample2group.get(n)
			if (!key2group.has(groupname)) key2group.set(groupname, [])
			key2group.get(groupname).push({
				samplename: n, // hardcoded
				items: items
			})
		}

		if (data_vcf) {
			// has vcf data and not custom track
			for (const m of data_vcf) {
				if (m.dt == common.dtsnvindel) {
					for (const s of m.sampledata) {
						let notfound = true
						const groupname = filter_sampleset.sample2group.get(s.sampleobj.name)
						if (!key2group.has(groupname)) key2group.set(groupname, [])
						if (!key2group.get(groupname).find(i => i.samplename == s.sampleobj.name)) {
							key2group.get(groupname).push({
								samplename: s.sampleobj.name,
								items: []
							})
						}
					}
					continue
				}

				console.log('unknown dt when grouping samples from vcf: ' + m.dt)
			}
		}
		for (const [name, samples] of key2group) {
			samplegroups.push({ name, samples })
		}
	} else if (ds.cohort && ds.cohort.annotation && dsquery.groupsamplebyattr) {
		/**** group samples by predefined annotation attributes
		only for official ds

		when vcf data is present, must include them samples in the grouping too, but not the variants

		expression samples don't participate in grouping
		*/

		const key2group = new Map()
		// k: group name string
		// v: [] list of samples

		// head-less samples
		const headlesssamples = []

		//// group the sv-cnv samples
		for (const [samplename, items] of sample2item) {
			mdssvcnv_grouper(samplename, items, key2group, headlesssamples, ds, dsquery)
		}

		if (data_vcf) {
			// group the vcf samples
			for (const m of data_vcf) {
				if (m.dt == common.dtsnvindel) {
					for (const s of m.sampledata) {
						mdssvcnv_grouper(s.sampleobj.name, [], key2group, headlesssamples, ds, dsquery)
					}
					continue
				}

				console.log('unknown dt when grouping samples from vcf data: ' + m.dt)
			}
		}

		// done grouping all samples

		for (const g of key2group.values()) {
			samplegroups.push(g)
			// add precomputed total count for each group
			if (dsquery.groupsamplebyattr.key2group) {
				const o = dsquery.groupsamplebyattr.key2group.get(g.name)
				if (o) g.sampletotalnum = o.samples.length
			}
		}

		if (headlesssamples.length) {
			samplegroups.push({
				name: 'Unannotated',
				samples: headlesssamples
			})
		}

		///////// FIXME jinghui nbl cell line mixed into st/nbl, to identify that this sample is cell line on client
		for (const g of samplegroups) {
			for (const s of g.samples) {
				if (ds.cohort.annotation[s.samplename]) {
					s.sampletype = ds.cohort.annotation[s.samplename].sample_type
				}
			}
		}
	} else {
		// custom track or no annotation, lump all in one group

		// cnv
		const samples = []
		for (const [n, items] of sample2item) {
			samples.push({
				samplename: n, // hardcoded
				items: items
			})
		}

		if (data_vcf) {
			// has vcf data and not custom track
			for (const m of data_vcf) {
				if (m.dt == common.dtsnvindel) {
					for (const s of m.sampledata) {
						let notfound = true
						for (const s2 of samples) {
							if (s2.samplename == s.sampleobj.name) {
								notfound = false
								break
							}
						}
						if (notfound) {
							samples.push({
								samplename: s.sampleobj.name,
								items: []
							})
						}
					}
					continue
				}

				console.log('unknown dt when grouping samples from vcf: ' + m.dt)
			}
		}

		if (samples.length) {
			samplegroups.push({ samples: samples })
		}
	}
	return samplegroups
}

function handle_mdssvcnv_addexprank(result, ds, expressionrangelimit, gene2sample2obj) {
	///////// assign expression rank for all samples listed in samplegroup
	if (expressionrangelimit) {
		// view range too big above limit set by official track, no checking expression
		result.expressionrangelimit = expressionrangelimit
	} else if (gene2sample2obj) {
		// report coordinates for each gene back to client
		result.gene2coord = {}
		for (const [n, g] of gene2sample2obj) {
			result.gene2coord[n] = { chr: g.chr, start: g.start, stop: g.stop }
		}

		if (result.getallsamples) {
			// QUICK FIX - only for custom track
			// merge all fpkm samples into result.samplegroups[0], so all samples will show
			const hassamples = new Set(result.samplegroups[0].samples.map(i => i.samplename))
			const toaddsamples = new Set()
			for (const [n, g] of gene2sample2obj) {
				for (const sample of g.samples.keys()) {
					if (hassamples.has(sample)) continue
					toaddsamples.add(sample)
				}
			}
			for (const sample of toaddsamples) {
				result.samplegroups[0].samples.push({ samplename: sample, items: [] })
			}
		}

		for (const g of result.samplegroups) {
			// expression ranking is within each sample group
			// collect expression data for each gene for all samples of this group
			const gene2allvalues = new Map()
			// k: gene, v: [ obj ]

			for (const [gene, tmp] of gene2sample2obj) {
				gene2allvalues.set(gene, [])

				for (const [sample, obj] of tmp.samples) {
					if (g.attributes && ds.cohort && ds.cohort.annotation) {
						/*
						a group from official track could still be unannotated, skip them
						*/
						const anno = ds.cohort.annotation[sample]
						if (!anno) continue
						let annomatch = true
						for (const attr of g.attributes) {
							if (anno[attr.k] != attr.kvalue) {
								annomatch = false
								break
							}
						}
						if (annomatch) {
							gene2allvalues.get(gene).push(obj)
						}
					} else {
						// custom track, just one group for all samples
						gene2allvalues.get(gene).push(obj)
					}
				}
			}

			// for each gene, sort samples
			for (const [gene, lst] of gene2allvalues) {
				lst.sort((i, j) => i.value - j.value)
			}

			// for each sample, compute rank within its group
			for (const sample of g.samples) {
				sample.expressionrank = {}
				for (const [gene, allvalue] of gene2allvalues) {
					// allvalue is expression of this gene in all samples of this group
					// for this gene
					// expression value of this gene in this sample
					const thisobj = gene2sample2obj.get(gene).samples.get(sample.samplename)
					if (thisobj == undefined) {
						// not expressed
						continue
					}

					const rank = get_rank_from_sortedarray(thisobj.value, allvalue)
					sample.expressionrank[gene] = { rank: rank }

					for (const k in thisobj) {
						sample.expressionrank[gene][k] = thisobj[k]
					}
				}
			}
		}
	}
}

function handle_mdssvcnv_end(ds, result) {
	if (ds.cohort && ds.cohort.sampleAttribute && ds.cohort.sampleAttribute.attributes && ds.cohort.annotation) {
		result.sampleannotation = {}

		const useattrkeys = [] // some attr keys are hidden from client
		for (const key in ds.cohort.sampleAttribute.attributes) {
			const a = ds.cohort.sampleAttribute.attributes[key]
			if (!a.clientnoshow) useattrkeys.push(key)
		}

		for (const g of result.samplegroups) {
			for (const sample of g.samples) {
				const anno = ds.cohort.annotation[sample.samplename]
				if (anno) {
					const toclient = {} // annotations to client
					let hasannotation = false
					for (const key of useattrkeys) {
						const value = anno[key]
						if (value != undefined) {
							hasannotation = true
							toclient[key] = value
						}
					}
					if (hasannotation) {
						// ony pass on if this sample has valid annotation
						result.sampleannotation[sample.samplename] = toclient
					}
				}
			}
		}
	}
}

async function handle_mdssvcnv_vcf(
	genome,
	ds,
	dsquery,
	req,
	filteralleleattr,
	hiddendt,
	hiddenmattr,
	hiddensampleattr,
	filter_sampleset
) {
	let vcfquery
	if (dsquery.iscustom) {
		vcfquery = dsquery.checkvcf
	} else {
		// official
		if (dsquery.vcf_querykey) {
			if (ds.queries[dsquery.vcf_querykey]) {
				vcfquery = ds.queries[dsquery.vcf_querykey]
			}
		}
	}
	if (!vcfquery) {
		// no vcf query
		return [null, null]
	}

	if (req.query.singlesample && vcfquery.singlesamples) {
		const tmp = vcfquery.singlesamples.samples[req.query.singlesample]
		if (tmp) {
			// has a vcf file for this sample, query this instead
			const thisvcf = {
				file: path.join(serverconfig.tpmasterdir, tmp)
			}

			// meta and header
			const mlines = await tabix_getvcfmeta(thisvcf.file)

			const [info, format, samples, err] = vcf.vcfparsemeta(mlines)
			if (err) throw err
			thisvcf.info = info
			thisvcf.format = format
			thisvcf.samples = samples
			thisvcf.nochr = await tabix_ifnochr(thisvcf.file, genome)
			return handle_mdssvcnv_vcf_singlesample(
				req,
				ds,
				thisvcf,
				filteralleleattr,
				hiddendt,
				hiddenmattr,
				hiddensampleattr
			)
		}
	}

	let viewrangeupperlimit = vcfquery.viewrangeupperlimit
	if (!viewrangeupperlimit && dsquery.iscustom) {
		// no limit set for custom track, set a hard limit
		viewrangeupperlimit = 1000000
	}

	if (req.query.singlesample) {
		// still limit in singlesample
		viewrangeupperlimit *= 5
	}

	if (viewrangeupperlimit) {
		const len = req.query.rglst.reduce((i, j) => i + j.stop - j.start, 0)
		if (len >= viewrangeupperlimit) {
			return [viewrangeupperlimit, null]
		}
	}

	const tracktasks = []

	for (const vcftk of vcfquery.tracks) {
		const thistracktask = Promise.resolve()
			.then(() => {
				// for custom url the index has already been cached at initial load
				// still need to get cache dir for loading index
				if (vcftk.file) return ''
				return utils.cache_index(vcftk.url, vcftk.indexURL)
			})
			.then(dir => {
				vcftk.dir = dir // reuse in rnabam

				// get vcf data
				const variants = []

				const tasks = []
				for (const r of req.query.rglst) {
					const task = new Promise((resolve, reject) => {
						const ps = spawn(
							tabix,
							[
								vcftk.file ? path.join(serverconfig.tpmasterdir, vcftk.file) : vcftk.url,
								(vcftk.nochr ? r.chr.replace('chr', '') : r.chr) + ':' + r.start + '-' + r.stop
							],
							{ cwd: dir }
						)
						const rl = readline.createInterface({
							input: ps.stdout
						})
						rl.on('line', line => {
							if (vcftk.type == common.mdsvcftype.vcf) {
								// bgzip vcf file

								const [badinfok, mlst, altinvalid] = vcf.vcfparseline(line, {
									nochr: vcftk.nochr,
									samples: vcftk.samples,
									info: vcfquery.info,
									format: vcftk.format
								})

								for (const m of mlst) {
									if (!m.sampledata) {
										// do not allow
										continue
									}

									if (filteralleleattr) {
										// filter using allele INFO

										let todrop = false

										for (const key in filteralleleattr) {
											const value = m.altinfo[key]
											if (value == undefined) {
												// no value
												todrop = true
												break
											}

											const attr = filteralleleattr[key]
											if (attr.cutoffvalue != undefined) {
												// is a numeric cutoff

												if (!Number.isFinite(value)) {
													// value of this mutation is not a number
													todrop = true
													break
												}

												if (attr.keeplowerthan) {
													if (value > attr.cutoffvalue) {
														todrop = true
														break
													}
												} else {
													if (value < attr.cutoffvalue) {
														todrop = true
														break
													}
												}
											}
										}
										if (todrop) {
											// drop this variant
											continue
										}
									}

									// TODO filter with locus INFO

									{
										// for germline track:
										const lst = []
										for (const s of m.sampledata) {
											if (s.gtallref) {
												// drop ref/ref sample, should only happen for germline vcf
												continue
											}

											if (s.__gtalleles) {
												// germline - m.sampledata[] always have all the samples due to the old vcf processing
												// even if the sample does not carry m's alt allele
												if (s.__gtalleles.indexOf(m.alt) == -1) {
													continue
												}
												delete s.__gtalleles
											}

											lst.push(s)
										}
										if (lst.length == 0) {
											continue
										}
										m.sampledata = lst
									}

									// filters on samples

									if (req.query.singlesample) {
										let thissampleobj = null
										for (const s of m.sampledata) {
											if (s.sampleobj.name == req.query.singlesample) {
												thissampleobj = s
												break
											}
										}
										if (!thissampleobj) {
											// this variant is not in this sample
											continue
										}
										// alter
										m.sampledata = [thissampleobj]
									} else if (filter_sampleset) {
										const lst = m.sampledata.filter(s => filter_sampleset.set.has(s.sampleobj.name))
										if (lst.length) {
											m.sampledata = lst
										} else {
											continue
										}
									}

									if (hiddenmattr) {
										const samplesnothidden = []
										for (const s of m.sampledata) {
											let nothidden = true
											for (const key in hiddenmattr) {
												// attribute keys are FORMAT fields
												let value = s[key]
												if (value == undefined) {
													value = common.not_annotated
												}
												if (hiddenmattr[key].has(value)) {
													nothidden = false
													break
												}
											}
											if (nothidden) {
												samplesnothidden.push(s)
											}
										}
										if (samplesnothidden.length == 0) {
											// skip this variant
											continue
										}
										m.sampledata = samplesnothidden
									}

									if (hiddensampleattr && ds.cohort && ds.cohort.annotation) {
										/*
									drop sample by annotation
									FIXME this is not efficient
									ideally should identify samples from this vcf file to be dropped, the column # of them
									after querying the vcf file, cut these columns away
									*/
										const samplesnothidden = []
										for (const s of m.sampledata) {
											const sanno = ds.cohort.annotation[s.sampleobj.name]
											if (!sanno) {
												// sample has no annotation?
												continue
											}
											let nothidden = true
											for (const key in hiddensampleattr) {
												const value = sanno[key]
												if (hiddensampleattr[key].has(value)) {
													nothidden = false
													break
												}
											}
											if (nothidden) {
												samplesnothidden.push(s)
											}
										}
										if (samplesnothidden.length == 0) {
											// skip this variant
											continue
										}
										m.sampledata = samplesnothidden
									}

									// delete the obsolete attr
									for (const sb of m.sampledata) {
										delete sb.allele2readcount
									}

									delete m._m
									delete m.vcf_ID
									delete m.name

									m.dt = common.dtsnvindel
									variants.push(m)
									// mclass and rest will be determined at client, according to whether in gmmode and such
								}
							} else {
								console.error('unknown "type" from a vcf file')
							}
						})
						const errout = []
						ps.stderr.on('data', i => errout.push(i))
						ps.on('close', code => {
							const e = errout.join('')
							if (e && !tabixnoterror(e)) {
								reject(e)
								return
							}
							resolve()
						})
					})
					tasks.push(task)
				}

				return Promise.all(tasks).then(() => {
					return variants
				})
			})

		tracktasks.push(thistracktask)
	}

	return Promise.all(tracktasks).then(vcffiles => {
		// snv/indel/itd data aggregated from multiple tracks
		const mmerge = []

		for (const eachvcf of vcffiles) {
			for (const m of eachvcf) {
				if (m.dt == common.dtsnvindel) {
					// snv/indel all follows vcf matrix, using sampledata[]

					if (!m.sampledata) {
						// no sample data, won't show
						continue
					}
					let notfound = true
					for (const m2 of mmerge) {
						if (m.chr == m2.chr && m.pos == m2.pos && m.ref == m2.ref && m.alt == m2.alt) {
							for (const s of m.sampledata) {
								m2.sampledata.push(s)
							}
							notfound = false
							break
						}
					}
					if (notfound) {
						mmerge.push(m)
					}
					continue
				}

				console.error('unknown dt: ' + m.dt)
			}
		}

		// variants may come from multiple files, sort again to avoid curious batch effect
		mmerge.sort((i, j) => i.pos - j.pos)

		return [null, mmerge]
	})
}

function handle_mdssvcnv_vcf_singlesample(req, ds, thisvcf, filteralleleattr, hiddendt, hiddenmattr, hiddensampleattr) {
	/*
query variants for a single sample, from a single vcf file

bad repetition
*/
	const variants = []

	const tasks = []
	for (const r of req.query.rglst) {
		const task = new Promise((resolve, reject) => {
			const ps = spawn(tabix, [
				thisvcf.file,
				(thisvcf.nochr ? r.chr.replace('chr', '') : r.chr) + ':' + r.start + '-' + r.stop
			])
			const rl = readline.createInterface({ input: ps.stdout })
			rl.on('line', line => {
				const [badinfok, mlst, altinvalid] = vcf.vcfparseline(line, thisvcf)

				for (const m of mlst) {
					if (!m.sampledata) {
						// do not allow
						continue
					}

					// restrict to queried sample
					const thissampleobj = m.sampledata.find(i => i.sampleobj.name == req.query.singlesample)
					if (!thissampleobj) {
						// this variant is not in this sample
						continue
					}
					// delete the obsolete attr
					delete thissampleobj.allele2readcount
					// alter
					m.sampledata = [thissampleobj]

					if (filteralleleattr) {
						// filter using allele INFO

						let todrop = false

						for (const key in filteralleleattr) {
							const value = m.altinfo[key]
							if (value == undefined) {
								// no value
								todrop = true
								break
							}

							const attr = filteralleleattr[key]
							if (attr.cutoffvalue != undefined) {
								// is a numeric cutoff

								if (!Number.isFinite(value)) {
									// value of this mutation is not a number
									todrop = true
									break
								}

								if (attr.keeplowerthan) {
									if (value > attr.cutoffvalue) {
										todrop = true
										break
									}
								} else {
									if (value < attr.cutoffvalue) {
										todrop = true
										break
									}
								}
							}
						}
						if (todrop) {
							// drop this variant
							continue
						}
					}

					// TODO filter with locus INFO

					// for germline track:
					if (thissampleobj.gtallref) {
						// drop ref/ref sample, should only happen for germline vcf
						continue
					}
					if (thissampleobj.__gtalleles) {
						// germline - m.sampledata[] always have all the samples due to the old vcf processing
						// even if the sample does not carry m's alt allele
						if (thissampleobj.__gtalleles.indexOf(m.alt) == -1) {
							continue
						}
						delete thissampleobj.__gtalleles
					}

					if (hiddenmattr) {
						const samplesnothidden = []
						for (const s of m.sampledata) {
							let nothidden = true
							for (const key in hiddenmattr) {
								// attribute keys are FORMAT fields
								let value = s[key]
								if (value == undefined) {
									value = common.not_annotated
								}
								if (hiddenmattr[key].has(value)) {
									nothidden = false
									break
								}
							}
							if (nothidden) {
								samplesnothidden.push(s)
							}
						}
						if (samplesnothidden.length == 0) {
							// skip this variant
							continue
						}
						m.sampledata = samplesnothidden
					}

					if (hiddensampleattr && ds.cohort && ds.cohort.annotation) {
						/*
						drop sample by annotation
						FIXME this is not efficient
						ideally should identify samples from this vcf file to be dropped, the column # of them
						after querying the vcf file, cut these columns away
						*/
						const samplesnothidden = []
						for (const s of m.sampledata) {
							const sanno = ds.cohort.annotation[s.sampleobj.name]
							if (!sanno) {
								// sample has no annotation?
								continue
							}
							let nothidden = true
							for (const key in hiddensampleattr) {
								const value = sanno[key]
								if (hiddensampleattr[key].has(value)) {
									nothidden = false
									break
								}
							}
							if (nothidden) {
								samplesnothidden.push(s)
							}
						}
						if (samplesnothidden.length == 0) {
							// skip this variant
							continue
						}
						m.sampledata = samplesnothidden
					}

					delete m._m
					delete m.vcf_ID
					delete m.name

					m.dt = common.dtsnvindel
					variants.push(m)
				}
			})
			const errout = []
			ps.stderr.on('data', i => errout.push(i))
			ps.on('close', code => {
				const e = errout.join('')
				if (e && !tabixnoterror(e)) {
					reject(e)
					return
				}
				resolve()
			})
		})
		tasks.push(task)
	}

	return Promise.all(tasks).then(() => {
		return [null, variants]
	})
}

function handle_mdssvcnv_expression(ds, dsquery, req, data_cnv) {
	if (req.query.singlesample) {
		// no expression rank check in single-sample: will be handled in a separate track
		return []
	}

	// multi-sample
	// expression data?
	let expressionquery
	if (dsquery.iscustom) {
		expressionquery = dsquery.checkexpressionrank
	} else {
		// official
		if (dsquery.expressionrank_querykey) {
			if (ds.queries[dsquery.expressionrank_querykey]) {
				expressionquery = ds.queries[dsquery.expressionrank_querykey]
			}
		}
	}
	if (!expressionquery) {
		// no expression query
		return []
	}

	let viewrangeupperlimit = expressionquery.viewrangeupperlimit
	if (!viewrangeupperlimit && dsquery.iscustom) {
		// no limit set for custom track, set a hard limit
		viewrangeupperlimit = 5000000
	}
	if (viewrangeupperlimit) {
		const len = req.query.rglst.reduce((i, j) => i + j.stop - j.start, 0)
		if (len >= viewrangeupperlimit) {
			return [viewrangeupperlimit]
		}
	}

	return Promise.resolve()
		.then(() => {
			// cache expression index

			if (expressionquery.file) return ''
			return utils.cache_index(expressionquery.url, expressionquery.indexURL)
		})
		.then(dir => {
			// get expression data

			const gene2sample2obj = new Map()
			// k: gene
			// v: { chr, start, stop, samples:Map }
			//    sample : { value:V, outlier:{}, ase:{} }

			const tasks = []
			for (const r of req.query.rglst) {
				const task = new Promise((resolve, reject) => {
					const data = []
					const ps = spawn(
						tabix,
						[
							expressionquery.file ? path.join(serverconfig.tpmasterdir, expressionquery.file) : expressionquery.url,
							r.chr + ':' + r.start + '-' + r.stop
						],
						{ cwd: dir }
					)
					const rl = readline.createInterface({
						input: ps.stdout
					})
					rl.on('line', line => {
						const l = line.split('\t')
						let j
						try {
							j = JSON.parse(l[3])
						} catch (e) {
							// invalid json
							return
						}
						if (!j.gene) return
						if (!j.sample) return
						if (!Number.isFinite(j.value)) return

						/* hiddenmattr hiddensampleattr are not applied here
					cnv/vcf data from those samples will be dropped, so their expression won't show
					but their expression will still be used in calculating rank of visible samples
					*/

						if (!gene2sample2obj.has(j.gene)) {
							gene2sample2obj.set(j.gene, {
								chr: l[0],
								start: Number.parseInt(l[1]),
								stop: Number.parseInt(l[2]),
								samples: new Map()
							})
						}
						gene2sample2obj.get(j.gene).samples.set(j.sample, {
							value: j.value,
							ase: j.ase
							// XXX OHE is temporarily disabled!!!
							//outlier: j.outlier
						})
					})
					const errout = []
					ps.stderr.on('data', i => errout.push(i))
					ps.on('close', code => {
						const e = errout.join('')
						if (e && !tabixnoterror(e)) {
							reject(e)
							return
						}
						resolve()
					})
				})
				tasks.push(task)
			}

			return Promise.all(tasks).then(() => {
				return [false, gene2sample2obj]
			})
		})
}

function handle_mdssvcnv_cnv(ds, dsquery, req, hiddendt, hiddensampleattr, hiddenmattr, filter_sampleset) {
	if (!dsquery.file && !dsquery.url) {
		// svcnv file is optional now
		return []
	}

	const tasks = []

	for (const r of req.query.rglst) {
		const task = new Promise((resolve, reject) => {
			const data = []
			const ps = spawn(
				tabix,
				[
					dsquery.file ? path.join(serverconfig.tpmasterdir, dsquery.file) : dsquery.url,
					r.chr + ':' + r.start + '-' + r.stop
				],
				{ cwd: dsquery.dir }
			)
			const rl = readline.createInterface({
				input: ps.stdout
			})

			rl.on('line', line => {
				const l = line.split('\t')
				const start0 = Number.parseInt(l[1])
				const stop0 = Number.parseInt(l[2])

				let j
				try {
					j = JSON.parse(l[3])
				} catch (e) {
					// invalid json, todo: report error
					return
				}

				if (j.dt == undefined) {
					// todo: report bad lines
					return
				}

				if (hiddendt && hiddendt.has(j.dt)) {
					return
				}

				///// data-type specific handling and filtering

				if (j.dt == common.dtloh) {
					// loh
					if (j.segmean && req.query.segmeanValueCutoff && j.segmean < req.query.segmeanValueCutoff) {
						return
					}
					if (req.query.lohLengthUpperLimit) {
						if (stop0 - start0 > req.query.lohLengthUpperLimit) {
							return
						}
					}
					j.chr = l[0]
					j.start = start0
					j.stop = stop0
				} else if (j.dt == common.dtfusionrna || j.dt == common.dtsv) {
					// sv
					j._chr = l[0]
					j._pos = start0
					if (j.chrA) {
						j.chrB = l[0]
						j.posB = start0
					} else {
						j.chrA = l[0]
						j.posA = start0
					}
				} else if (j.dt == common.dtcnv) {
					// cnv
					if (req.query.hide_cnvloss && j.value < 0) return
					if (req.query.hide_cnvgain && j.value > 0) return

					if (req.query.valueCutoff) {
						if (Math.abs(j.value) < req.query.valueCutoff) {
							return
						}
					}
					if (req.query.bplengthUpperLimit) {
						if (stop0 - start0 > req.query.bplengthUpperLimit) {
							return
						}
					}
					j.chr = l[0]
					j.start = start0
					j.stop = stop0
				} else if (j.dt == common.dtitd) {
					j.chr = l[0]
					j.start = start0
					j.stop = stop0
				} else {
					console.error('unknown dt from svcnv file: ' + j.dt)
					return
				}

				if (req.query.singlesample) {
					// in single-sample mode
					if (j.sample != req.query.singlesample) {
						return
					}
				} else if (filter_sampleset) {
					if (!filter_sampleset.set.has(j.sample)) return
				} else if (j.sample && ds.cohort && ds.cohort.annotation) {
					// not single-sample
					// only for official ds

					// may apply sample annotation filtering
					const anno = ds.cohort.annotation[j.sample]
					if (!anno) {
						// this sample has no annotation at all, since it's doing filtering, will drop it
						return
					}

					// only check this here, because it requires sample annotation
					if (hiddensampleattr) {
						for (const key in hiddensampleattr) {
							const samplevalue = anno[key]
							if (hiddensampleattr[key].has(samplevalue)) {
								// this sample has hidden annotation
								return
							}
						}
					}
				}

				if (hiddenmattr) {
					// check mutation-level annotation
					for (const key in hiddenmattr) {
						let itemvalue = j.mattr ? j.mattr[key] : undefined
						if (itemvalue == undefined) {
							itemvalue = common.not_annotated
						}

						if (hiddenmattr[key].has(itemvalue)) {
							// this item has hidden annotation
							return
						}
					}
				}

				// this item is acceptable
				data.push(j)
			})

			const errout = []
			ps.stderr.on('data', i => errout.push(i))
			ps.on('close', code => {
				const e = errout.join('')
				if (e && !tabixnoterror(e)) {
					reject(e)
					return
				}
				resolve(data)
			})
		})
		tasks.push(task)
	}
	return Promise.all(tasks)
}

function mdssvcnv_do_sample2item(data_cnv) {
	/*
	transform data_cnv[] to sample2item

	to dedup, as the same cnv event may be retrieved multiple times by closeby regions, also gets set of samples for summary
	k: sample
	v: list of sv, cnv, loh

	do not include snvindel from vcf
	the current data_vcf is variant-2-sample
	if snvindel is spread across samples, the variant annotation must be duplicated too
	just pass the lot to client, there each variant will sort out annotation, then spread to samples while keeping pointers in sample-m to original m

	yet further complexity due to the need of grouping samples by server-side annotation
	which will require vcf samples all to be included in samplegroups

	expression rank will be assigned to samples in all groups
	for vcf samples to get expression rank, it also require them to be grouped!
	*/
	const sample2item = new Map()

	for (const tmp of data_cnv) {
		for (const item of tmp) {
			if (!item.sample) {
				// must have sample
				continue
			}
			const sn = item.sample
			if (!sample2item.has(sn)) {
				sample2item.set(sn, [])
			}

			if (item._chr) {
				// sv, no checking against coordset
				sample2item.get(sn).push(item)
				continue
			}

			// new event
			delete item.sample
			delete item.sampletype
			sample2item.get(sn).push(item)
		}
	}
	return sample2item
}

function mdssvcnv_do_showonlycnvwithsv(sample2item) {
	/*
!!!do not use!!!!
for a cnv with both ends out of view range, there is no way to query the sv at its boundary regions so no way to know if "sv-supported"

arg is a map of sample to list of items
in each sample, for a cnv to be displayed, its ends must 
*/
	// if a sv breakpoint falls within this distance to a cnv boundary, will say this boundary is "sv-supported"
	//const maxsupportdist = 1000

	for (const [sample, lst] of sample2item) {
		const svchr2pos = {}
		// k: sv chr
		// v: set of sv breakpoint positions
		for (const j of lst) {
			if (j.dt == common.dtsv) {
				if (!svchr2pos[j.chrA]) {
					svchr2pos[j.chrA] = new Set()
				}
				svchr2pos[j.chrA].add(j.posA)
				if (!svchr2pos[j.chrB]) {
					svchr2pos[j.chrB] = new Set()
				}
				svchr2pos[j.chrB].add(j.posB)
			}
		}

		const keepitems = []
		for (const j of lst) {
			if (j._chr || j.loh) {
				keepitems.push(j)
				continue
			}
			if (!svchr2pos[j.chr]) continue

			let match = false
			for (const pos of svchr2pos[j.chr]) {
				if (pos >= j.start - 1000 && pos <= j.stop + 1000) {
					match = true
					break
				}
			}
			if (match) {
				keepitems.push(j)
			}
		}
		if (keepitems.length) {
			sample2item.set(sample, keepitems)
		} else {
			sample2item.delete(sample)
		}
	}
}

function mdssvcnv_do_copyneutralloh(sample2item) {
	/*
decide what's copy neutral loh
only keep loh with no overlap with cnv
*/
	for (const [sample, lst] of sample2item) {
		// put cnv and loh into respective maps, keyed by chr
		const chr2loh = new Map()
		const chr2cnv = new Map()
		const thissampleitems = []
		for (const i of lst) {
			if (i.dt == common.dtloh) {
				if (!chr2loh.has(i.chr)) chr2loh.set(i.chr, [])
				chr2loh.get(i.chr).push(i)
				continue
			}
			if (i.dt == common.dtcnv) {
				if (!chr2cnv.has(i.chr)) chr2cnv.set(i.chr, [])
				chr2cnv.get(i.chr).push(i)
			}
			thissampleitems.push(i)
		}

		if (chr2loh.size == 0) continue

		for (const [chr, lohlst] of chr2loh) {
			const cnvlst = chr2cnv.get(chr)
			if (!cnvlst) {
				// this sample has no cnv in view range, use all loh as copy neutral
				for (const i of lohlst) thissampleitems.push(i)
				continue
			}

			for (const loh of lohlst) {
				// for each loh
				let nocnvmatch = true
				for (const cnv of cnvlst) {
					if (Math.max(loh.start, cnv.start) < Math.min(loh.stop, cnv.stop)) {
						// this loh overlaps with a cnv, then it isn't copy neutral
						nocnvmatch = false
						break
					}
				}
				if (nocnvmatch) thissampleitems.push(loh)
			}
		}

		sample2item.set(sample, thissampleitems)
	}
}

function mdssvcnv_customtk_altersg_server(result, gene2sample2obj) {
	/*
	call this when there is vcf file for custom track
	will add all expression samples to sg
	*/
	const allsamplenames = new Set()
	for (const [gene, tmp] of gene2sample2obj) {
		for (const [sample, o] of tmp.samples) {
			allsamplenames.add(sample)
		}
	}

	if (!result.samplegroups[0]) {
		// not a group, add all
		result.samplegroups[0] = { samples: [] }
		for (const s of allsamplenames) {
			result.samplesgroups[0].samples.push({
				samplename: s,
				items: []
			})
		}
		return
	}

	// add missing
	for (const s of allsamplenames) {
		if (!result.samplegroups[0].samples.find(s2 => s2.samplename == s)) {
			result.samplegroups[0].samples.push({
				samplename: s,
				items: []
			})
		}
	}
}

function mdssvcnv_grouper(samplename, items, key2group, headlesssamples, ds, dsquery) {
	/*
	helper function, used by both cnv and vcf
	to identify which group a sample is from, insert the group, then insert the sample
	*/

	const sanno = ds.cohort.annotation[samplename]
	if (!sanno) {
		// this sample has no annotation
		headlesssamples.push({
			samplename: samplename, // hardcoded attribute name
			items: items
		})
		return
	}

	const headname = sanno[dsquery.groupsamplebyattr.attrlst[0].k]
	if (headname == undefined) {
		// head-less
		headlesssamples.push({
			samplename: samplename, // hardcoded
			items: items
		})
		return
	}

	const attrnames = []
	for (let i = 1; i < dsquery.groupsamplebyattr.attrlst.length; i++) {
		const v = sanno[dsquery.groupsamplebyattr.attrlst[i].k]
		if (v == undefined) {
			break
		}
		attrnames.push(v)
	}

	attrnames.unshift(headname)

	const groupname = attrnames.join(dsquery.groupsamplebyattr.attrnamespacer)

	if (!key2group.has(groupname)) {
		/*
		a new group
		need to get available full name for each attribute value for showing on client
		if attr.full is not available, just use key value
		*/
		const attributes = []
		for (const attr of dsquery.groupsamplebyattr.attrlst) {
			const v = sanno[attr.k]
			if (v == undefined) {
				// ordered list, look no further
				break
			}
			const a = { k: attr.k, kvalue: v }
			if (attr.full) {
				a.full = attr.full
				a.fullvalue = sanno[attr.full]
			}
			attributes.push(a)
		}

		// to be replaced
		const levelnames = []
		for (const attr of dsquery.groupsamplebyattr.attrlst) {
			const v = sanno[attr.k]
			if (v == undefined) {
				break
			}
			const lname = (attr.full ? sanno[attr.full] : null) || v
			levelnames.push(lname)
		}

		key2group.set(groupname, {
			name: groupname,
			samples: [],
			attributes: attributes
		})
	}

	let notfound = true
	for (const s of key2group.get(groupname).samples) {
		if (s.samplename == samplename) {
			// same sample, can happen for vcf samples
			// combine data, actually none for vcf
			for (const m of items) {
				s.items.push(m)
			}
			notfound = false
			break
		}
	}

	if (notfound) {
		key2group.get(groupname).samples.push({
			samplename: samplename, // hardcoded
			items: items
		})
	}
}

function ase_testarg(q) {
	if (!Number.isFinite(q.dna_mintotalreads)) return 'invalid value for dna_mintotalreads'
	if (!Number.isFinite(q.rna_mintotalreads)) return 'invalid value for rna_mintotalreads'
	if (!Number.isFinite(q.hetsnp_minbaf)) return 'invalid value for hetsnp_minbaf'
	if (!Number.isFinite(q.hetsnp_maxbaf)) return 'invalid value for hetsnp_maxbaf'
	if (!Number.isFinite(q.rnapileup_q)) return 'invalid value for rnapileup_q'
	if (!Number.isFinite(q.rnapileup_Q)) return 'invalid value for rnapileup_Q'
}

async function handle_ase(req, res) {
	if (reqbodyisinvalidjson(req, res)) return
	const q = req.query

	const fpkmrangelimit = 3000000
	const covplotrangelimit = 500000

	try {
		const genome = genomes[q.genome]
		if (!genome) throw 'invalid genome'
		if (!q.samplename) throw 'samplename missing'
		if (!q.chr) throw 'no chr'
		if (!q.start || !q.stop) throw 'no start/stop'
		if (!q.rnabarheight) throw 'no rnabarheight'
		if (!q.dnabarheight) throw 'no dnabarheight'
		if (!Number.isInteger(q.barypad)) throw 'invalid barypad'
		if (q.rnamax && !Number.isFinite(q.rnamax)) throw 'invalid value for rnamax'
		if (!q.checkrnabam) throw '.checkrnabam{} missing'
		const e = ase_testarg(q.checkrnabam)
		if (e) throw e

		if (!q.refcolor) q.refcolor = 'blue'
		if (!q.altcolor) q.altcolor = 'red'

		if (!genome.tracks) throw 'genome.tracks[] missing'

		// may designate specific gene track

		const genetk = genome.tracks.find(i => i.__isgene)
		if (!genetk) throw 'no gene track from this genome'

		await handle_ase_prepfiles(q, genome)

		const genes = await handle_ase_getgenes(genome, genetk, q.chr, q.start, q.stop)
		// k: symbol, v: {start,stop,exonlength}

		const result = {}

		if (q.stop - q.start < fpkmrangelimit) {
			for (const [n, g] of genes) {
				const b = {
					file: q.rnabamfile,
					url: q.rnabamurl,
					dir: q.rnabamurl_dir,
					nochr: q.rnabam_nochr
				}
				let count
				if (q.rnabamispairedend) {
					count = await handle_mdssvcnv_rnabam_genefragcount(b, q.chr, g)
				} else {
					count = await handle_mdssvcnv_rnabam_genereadcount(b, q.chr, g)
				}
				g.fpkm = (count * 1000000000) / (q.rnabamtotalreads * g.exonlength)
			}
		} else {
			// range too big for fpkm
			result.fpkmrangelimit = fpkmrangelimit
		}

		const [searchstart, searchstop, renderstart, renderstop] = handle_ase_definerange(q, genes)

		// all
		const snps = await handle_ase_getsnps(q, genome, genes, searchstart, searchstop)

		for (const m of snps) {
			m.rnacount = {
				nocoverage: 1
			}
		}

		let rnamax
		let plotter

		if (renderstop - renderstart >= covplotrangelimit) {
			// range too big for cov plot
			result.covplotrangelimit = covplotrangelimit
		} else {
			if (q.rnamax) {
				// fixed max
				rnamax = q.rnamax
			} else {
				rnamax = await handle_ase_bamcoverage1stpass(q, renderstart, renderstop)
				result.rnamax = rnamax
			}
			// plot coverage
			plotter = await handle_ase_bamcoverage2ndpass(q, renderstart, renderstop, snps, rnamax)
		}

		// check rna bam and plot markers
		result.coveragesrc = await handle_ase_pileup_plotsnp(
			q,
			snps,
			searchstart,
			searchstop,
			renderstart,
			renderstop,
			plotter,
			rnamax
		)

		// binom test
		await handle_ase_binom(snps, q)

		result.genes = handle_ase_generesult(snps, genes, q)

		// find dna max coverage for snps in plot range
		let dnamax = 0
		for (const m of snps) {
			if (m.dnacount && m.pos >= renderstart && m.pos <= renderstop) {
				dnamax = Math.max(dnamax, m.dnacount.ref + m.dnacount.alt)
			}
		}
		result.dnamax = dnamax

		res.send(result)
	} catch (e) {
		if (e.stack) console.log(e.stack)
		res.send({ error: e.message || e })
	}
}

async function handle_ase_binom(snps, q) {
	if (snps.length == 0) return
	const rnasnp = [] // should have suffcient coverage
	for (const m of snps) {
		if (m.rnacount.nocoverage) continue
		if (m.rnacount.ref + m.rnacount.alt < q.checkrnabam.rna_mintotalreads) continue
		rnasnp.push(m)
	}
	if (rnasnp.length == 0) return
	const snpfile = await handle_ase_binom_write(rnasnp)
	const pfile = await handle_ase_binom_test(snpfile)
	await handle_ase_binom_result(snps, pfile)
	fs.unlink(snpfile, () => {})
	fs.unlink(pfile, () => {})
}

function handle_ase_binom_result(snps, pfile) {
	return new Promise((resolve, reject) => {
		fs.readFile(pfile, 'utf8', (err, data) => {
			if (err) reject('cannot read binom pvalue')
			if (!data) resolve()
			for (const line of data.trim().split('\n')) {
				const l = line.split('\t')
				const m = snps.find(i => l[0] == i.pos + '.' + i.ref + '.' + i.alt)
				if (m) {
					m.rnacount.pvalue = Number.parseFloat(l[10])
				}
			}
			resolve()
		})
	})
}

function handle_ase_binom_test(snpfile) {
	const pfile = snpfile + '.pvalue'
	return new Promise((resolve, reject) => {
		const sp = spawn('Rscript', ['utils/binom.R', snpfile, pfile])
		sp.on('close', () => {
			resolve(pfile)
		})
		sp.on('error', e => {
			reject('cannot do binom test')
		})
	})
}

function handle_ase_binom_write(snps) {
	const snpfile = path.join(serverconfig.cachedir, Math.random().toString()) + '.snp'
	const data = []
	for (const s of snps) {
		if (s.rnacount.nocoverage) continue
		if (s.rnacount.ref == undefined || s.rnacount.alt == undefined) continue
		data.push(s.pos + '.' + s.ref + '.' + s.alt + '\t\t\t\t\t\t\t\t' + s.rnacount.ref + '\t' + s.rnacount.alt)
	}
	return new Promise((resolve, reject) => {
		fs.writeFile(snpfile, data.join('\n') + '\n', err => {
			if (err) {
				reject('cannot write')
			}
			resolve(snpfile)
		})
	})
}

function handle_ase_definerange(q, genes) {
	// may alter search start/stop by gene range

	let searchstart = q.start,
		searchstop = q.stop
	for (const [name, g] of genes) {
		searchstart = Math.min(searchstart, g.start)
		searchstop = Math.max(searchstop, g.stop)
	}

	const renderstart = q.start,
		renderstop = q.stop

	return [searchstart, searchstop, renderstart, renderstop]
}

function handle_ase_generesult(snps, genes, q) {
	/*
	snps
	genes
	k: symbol, v: {start,stop}
	*/
	const out = []
	for (const [symbol, gene] of genes) {
		out.push(gene)

		const thissnps = snps.filter(m => m.pos >= gene.start && m.pos <= gene.stop)
		if (thissnps.length == 0) {
			gene.nosnp = 1
			continue
		}

		gene.snps = thissnps

		const rnasnp = thissnps.filter(i => i.rnacount.pvalue != undefined)
		if (rnasnp.length == 0) {
			gene.nornasnp = 1
			continue
		}
		const deltasum = rnasnp.reduce((i, j) => i + Math.abs(j.rnacount.f - 0.5), 0)

		// geometric mean
		let mean = null
		let ase_markers = 0
		for (const s of rnasnp) {
			if (mean == null) mean = s.rnacount.pvalue
			else mean *= s.rnacount.pvalue
			if (s.rnacount.pvalue <= q.checkrnabam.binompvaluecutoff) {
				ase_markers++
			}
		}
		gene.ase = {
			markers: thissnps.filter(i => i.dnacount.ishet).length,
			ase_markers: ase_markers,
			mean_delta: deltasum / rnasnp.length,
			geometricmean: Math.pow(mean, 1 / rnasnp.length)
		}
	}

	return out
}

function handle_ase_bamcoverage1stpass(q, start, stop) {
	/*
	1st pass: get max
	*/
	let m = 0
	return new Promise((resolve, reject) => {
		const sp = spawn(
			samtools,
			[
				'depth',
				'-r',
				(q.rnabam_nochr ? q.chr.replace('chr', '') : q.chr) + ':' + (start + 1) + '-' + (stop + 1),
				q.rnabamurl || q.rnabamfile
			],
			{ cwd: q.rnabamurl_dir }
		)

		const rl = readline.createInterface({ input: sp.stdout })
		rl.on('line', line => {
			const l = line.split('\t')
			if (l.length != 3) return
			const v = Number.parseInt(l[2])
			if (!Number.isInteger(v)) return
			m = Math.max(m, v)
		})

		sp.on('close', () => {
			resolve(m)
		})
	})
}

function handle_ase_bamcoverage2ndpass(q, start, stop, snps, rnamax) {
	/*
	2nd pass: plot coverage bar at each covered bp
	*/

	// snps default to be no coverage in rna
	// for those in viewrange and covered in rna, record bar h
	const pos2snp = new Map()
	for (const m of snps) {
		if (!m.dnacount.ishet) {
			// not het
			continue
		}
		if (m.pos >= start && m.pos <= stop) {
			// in render range
			pos2snp.set(m.pos, m)
		}
	}

	const canvas = createCanvas(
		q.width * q.devicePixelRatio,
		(q.rnabarheight + q.barypad + q.dnabarheight) * q.devicePixelRatio
	)
	const ctx = canvas.getContext('2d')
	if (q.devicePixelRatio > 1) {
		ctx.scale(q.devicePixelRatio, q.devicePixelRatio)
	}

	let isbp = false,
		binbpsize,
		binpxw
	if (stop - start <= q.width) {
		// each bin is one bp
		isbp = true
		binbpsize = 1
		binpxw = q.width / (stop - start)
		ctx.lineWidth = binpxw
	} else {
		// each bin is one px
		binpxw = 1
		binbpsize = (stop - start) / q.width
		// line width is 1 by default
	}

	return new Promise((resolve, reject) => {
		const sp = spawn(
			samtools,
			[
				'depth',
				'-r',
				(q.rnabam_nochr ? q.chr.replace('chr', '') : q.chr) + ':' + (start + 1) + '-' + (stop + 1),
				q.rnabamurl || q.rnabamfile
			],
			{ cwd: q.rnabamurl_dir }
		)

		const rl = readline.createInterface({ input: sp.stdout })
		rl.on('line', line => {
			const l = line.split('\t')
			if (l.length != 3) return

			const pos = Number.parseInt(l[1]) - 1
			if (!Number.isInteger(pos)) return
			const v = Number.parseInt(l[2])
			if (!Number.isInteger(v)) return

			const h = (q.rnabarheight * Math.min(v, rnamax)) / rnamax
			const x = isbp ? (pos - start) * binpxw : (pos - start) / binbpsize
			ctx.strokeStyle = '#ccc'
			ctx.beginPath()
			ctx.moveTo(x + binpxw / 2, q.rnabarheight)
			ctx.lineTo(x + binpxw / 2, q.rnabarheight - h)
			ctx.stroke()
			ctx.closePath()
			if (v > rnamax) {
				ctx.strokeStyle = 'blue'
				ctx.beginPath()
				ctx.moveTo(x + binpxw / 2, 0)
				ctx.lineTo(x + binpxw / 2, 2)
				ctx.stroke()
				ctx.closePath()
			}
			const m = pos2snp.get(pos)
			if (m) {
				// matching a snp, record bar h
				m.rnacount.h = h
			}
		})

		sp.on('close', () => {
			resolve({
				canvas: canvas,
				ctx: ctx,
				isbp: isbp,
				binpxw: binpxw,
				binbpsize: binbpsize
			})
		})
	})
}

function handle_ase_pileup_plotsnp(q, snps, searchstart, searchstop, renderstart, renderstop, plotter, rnamax) {
	/*
q {}
.refcolor  .altcolor
.rnabam_nochr
.checkrnabam{}
*/

	const snpstr = [] // het only
	for (const m of snps) {
		if (!m.dnacount.ishet) {
			// not het
			continue
		}
		snpstr.push((q.rnabam_nochr ? q.chr.replace('chr', '') : q.chr) + ':' + (m.pos + 1) + '-' + (m.pos + 1))
	}

	return new Promise((resolve, reject) => {
		const sp = spawn(
			bcftools,
			[
				'mpileup',
				'-q',
				q.checkrnabam.rnapileup_q,
				'-Q',
				q.checkrnabam.rnapileup_Q,
				'--no-reference',
				'-a',
				'INFO/AD',
				'-d',
				999999,
				'-r',
				snpstr.join(','),
				q.rnabamurl || q.rnabamfile
			],
			{ cwd: q.rnabamurl_dir }
		)

		const rl = readline.createInterface({ input: sp.stdout })
		rl.on('line', line => {
			if (line[0] == '#') return

			const m0 = mpileup_parsevcf_dp_ad(line)
			if (!m0) return

			let renderx // for this nt; if set, means this nt is plotted

			if (m0.pos >= renderstart && m0.pos <= renderstop && m0.DP) {
				// in render range
			}

			const m = snps.find(m => m.pos == m0.pos)
			if (m) {
				// a het snp from query range, but may not in render range
				m.__x = renderx // could be undefined

				const c1 = m0.allele2count[m.ref] || 0
				const c2 = m0.allele2count[m.alt] || 0

				if (c1 + c2 > 0) {
					// has rna coverage at this snp
					delete m.rnacount.nocoverage
					m.rnacount.ref = c1
					m.rnacount.alt = c2
					m.rnacount.f = c2 / (c1 + c2)
				}
			}
		})

		sp.on('close', () => {
			if (!plotter) {
				// won't do plotting, beyond range
				resolve()
				return
			}

			const { canvas, ctx, binpxw } = plotter
			ctx.lineWidth = Math.max(3, binpxw) // temp fix to make snp bar thicker

			// done piling up, plot all snps in view range
			let dnamax = 0
			for (const m of snps) {
				if (!m.dnacount) continue
				if (m.pos < renderstart || m.pos > renderstop) continue
				m.__x = (q.width * (m.pos - renderstart)) / (renderstop - renderstart)
				dnamax = Math.max(dnamax, m.dnacount.ref + m.dnacount.alt)
			}

			for (const m of snps) {
				if (m.__x == undefined) continue

				if (!m.rnacount.nocoverage) {
					// rna
					// h is computed in 1st pass so could be missing...
					if (m.rnacount.h == undefined) {
						m.rnacount.h = (q.rnabarheight * (m.rnacount.ref + m.rnacount.alt)) / rnamax
					}
					ctx.strokeStyle = q.refcolor
					ctx.beginPath()
					ctx.moveTo(m.__x + binpxw / 2, q.rnabarheight)
					ctx.lineTo(m.__x + binpxw / 2, q.rnabarheight - (1 - m.rnacount.f) * m.rnacount.h)
					ctx.stroke()
					ctx.closePath()
					ctx.strokeStyle = q.altcolor
					ctx.beginPath()
					ctx.moveTo(m.__x + binpxw / 2, q.rnabarheight - (1 - m.rnacount.f) * m.rnacount.h)
					ctx.lineTo(m.__x + binpxw / 2, q.rnabarheight - m.rnacount.h)
					ctx.stroke()
					ctx.closePath()
				}

				// dna
				const h = (q.dnabarheight * (m.dnacount.ref + m.dnacount.alt)) / dnamax
				if (m.dnacount.ishet) {
					ctx.strokeStyle = q.refcolor
					ctx.beginPath()
					ctx.moveTo(m.__x + binpxw / 2, q.rnabarheight + q.barypad)
					ctx.lineTo(m.__x + binpxw / 2, q.rnabarheight + q.barypad + (1 - m.dnacount.f) * h)
					ctx.stroke()
					ctx.closePath()
					ctx.strokeStyle = q.altcolor
					ctx.beginPath()
					ctx.moveTo(m.__x + binpxw / 2, q.rnabarheight + q.barypad + (1 - m.dnacount.f) * h)
					ctx.lineTo(m.__x + binpxw / 2, q.rnabarheight + q.barypad + h)
					ctx.stroke()
					ctx.closePath()
				} else {
					/*
					// not het, do not plot for now, should make it optional on UI
					ctx.strokeStyle = '#ccc'
					ctx.beginPath()
					ctx.moveTo(m.__x + binpxw / 2, q.rnabarheight + q.barypad)
					ctx.lineTo(m.__x + binpxw / 2, q.rnabarheight + q.barypad + h)
					ctx.stroke()
					ctx.closePath()
					*/
				}
				delete m.__x
			}

			resolve(canvas.toDataURL())
		})
	})
}

function mpileup_parsevcf_dp_ad(line) {
	// quick dirty, no header
	// hardcoded for AD DP
	// <ID=DP,Number=1,Type=Integer,Description="Raw read depth">
	// <ID=AD,Number=R,Type=Integer,Description="Total allelic depths">
	// 1	47838652	.	N	G,A,<*>	0	.	DP=200;AD=0,97,97,0;I16=0,0,125,69,

	const l = line.split('\t')
	if (l.length < 8) return

	const m = {
		pos: Number.parseInt(l[1]) - 1
	}
	const alleles = [l[3], ...l[4].split(',')]
	const info = {}
	for (const s of l[7].split(';')) {
		const k = s.split('=')
		info[k[0]] = k[1]
	}
	if (info.DP) m.DP = Number.parseInt(info.DP)
	if (info.AD) {
		m.allele2count = {}
		const lst = info.AD.split(',')
		for (const [i, allele] of alleles.entries()) {
			m.allele2count[allele] = Number.parseInt(lst[i])
		}
	}
	return m
}

async function handle_bamnochr(req, res) {
	if (reqbodyisinvalidjson(req, res)) return
	const q = req.query
	try {
		const genome = genomes[q.genome]
		if (!genome) throw 'invalid genome'
		if (q.file) {
			q.file = path.join(serverconfig.tpmasterdir, q.file)
		} else {
			if (!q.url) throw 'no bam file or url'
			q.url_dir = await utils.cache_index(q.url, q.indexURL || q.url + '.bai')
		}

		const nochr = await bam_ifnochr(q.file || q.url, genome, q.url_dir)
		res.send({ nochr: nochr })
	} catch (e) {
		if (e.stack) console.log(e.stack)
		res.send({ error: e.message || e })
	}
}

async function handle_ase_prepfiles(q, genome) {
	if (q.rnabamfile) {
		q.rnabamfile = path.join(serverconfig.tpmasterdir, q.rnabamfile)
	} else {
		if (!q.rnabamurl) throw 'no file or url for rna bam'
		q.rnabamurl_dir = await utils.cache_index(q.rnabamurl, q.rnabamindexURL || q.rnabamurl + '.bai')
	}

	q.rnabam_nochr = await bam_ifnochr(q.rnabamfile || q.rnabamurl, genome, q.rnabamurl_dir)

	if (q.vcffile) {
		q.vcffile = path.join(serverconfig.tpmasterdir, q.vcffile)
	} else {
		if (!q.vcfurl) throw 'no file or url for vcf'
		q.vcfurl_dir = await utils.cache_index(q.vcfurl, q.vcfindexURL)
	}
	q.vcf_nochr = await tabix_ifnochr(q.vcffile || q.vcfurl, genome, q.vcfurl_dir)
}

async function handle_ase_getsnps(q, genome, genes, searchstart, searchstop) {
	/*
	get all for showing in cov plot
	q:
	.checkrnabam{}
	.samplename
	.vcffile
	.vcfurl
	.vcfindexURL
	.chr
	*/
	const mlines = await tabix_getvcfmeta(q.vcffile || q.vcfurl, q.vcfurl_dir)

	const [info, format, samples, err] = vcf.vcfparsemeta(mlines)
	if (err) throw err

	const vcfobj = {
		info: info,
		format: format,
		samples: samples
	}

	const lines = await tabix_getlines(
		q.vcffile || q.vcfurl,
		(q.vcf_nochr ? q.chr.replace('chr', '') : q.chr) + ':' + searchstart + '-' + searchstop,
		q.vcfurl_dir
	)

	const allsnps = []

	for (const line of lines || []) {
		const [badinfo, mlst, altinvalid] = vcf.vcfparseline(line, vcfobj)

		for (const m of mlst) {
			// if is snp
			if (!common.basecolor[m.ref] || !common.basecolor[m.alt]) {
				continue
			}
			// find sample
			if (!m.sampledata) continue

			const m2 = handle_ase_hetsnp4sample(m, q.samplename, q.checkrnabam)
			if (m2) {
				allsnps.push(m2)
			}
		}
	}

	const genesnps = []
	for (const m of allsnps) {
		for (const [g, p] of genes) {
			if (m.pos >= p.start && m.pos <= p.stop) {
				genesnps.push(m)
				break
			}
		}
	}

	return genesnps
}

function handle_ase_hetsnp4sample(m, samplename, arg) {
	/*
	cutoff values in arg{} must have all been validated
	always return a snp
	*/

	const sobj = m.sampledata.find(i => i.sampleobj.name == samplename)
	if (!sobj) return

	if (sobj.AD) {
		const refcount = sobj.AD[m.ref] || 0
		const altcount = sobj.AD[m.alt] || 0
		const m2 = {
			chr: m.chr,
			pos: m.pos,
			ref: m.ref,
			alt: m.alt,
			dnacount: {
				ref: refcount,
				alt: altcount
			}
		}
		if (altcount + refcount == 0) {
			m2.dnacount.f = 0
		} else {
			m2.dnacount.f = altcount / (altcount + refcount)
		}

		if (refcount + altcount >= arg.dna_mintotalreads) {
			if (m2.dnacount.f >= arg.hetsnp_minbaf && m2.dnacount.f <= arg.hetsnp_maxbaf) {
				m2.dnacount.ishet = true
			}
		}
		return m2
	}

	// GT?

	return null
}

async function handle_ase_getgenes(genome, genetk, chr, start, stop) {
	// if not native track, must test chr
	const lines = await tabix_getlines(path.join(serverconfig.tpmasterdir, genetk.file), chr + ':' + start + '-' + stop)

	const symbol2lst = new Map()
	// k: symbol, v: list of isoforms

	if (lines) {
		for (const line of lines) {
			const l = line.split('\t')
			const j = JSON.parse(l[3])
			const start = Number.parseInt(l[1])
			const stop = Number.parseInt(l[2])
			if (symbol2lst.has(j.name)) {
				const s = symbol2lst.get(j.name)
				s.start = Math.min(s.start, start)
				s.stop = Math.max(s.stop, stop)
			} else {
				symbol2lst.set(j.name, {
					gene: j.name,
					start: start,
					stop: stop,
					exonunion: []
				})
			}

			const g = symbol2lst.get(j.name)

			if (j.exon) {
				// exon union
				for (const e of j.exon) {
					const e2 = g.exonunion.find(i => Math.max(i[0], e[0]) < Math.min(i[1], e[1]))
					if (e2) {
						e2[0] = Math.min(e[0], e2[0])
						e2[1] = Math.max(e[1], e2[1])
					} else {
						g.exonunion.push([e[0], e[1]])
					}
				}
			}
		}
	}

	// sum exon total length
	for (const [n, g] of symbol2lst) {
		g.exonlength = g.exonunion.reduce((i, j) => i + j[1] - j[0], 0)
	}

	return symbol2lst
}

async function tabix_getlines(file, coord, dir) {
	return new Promise((resolve, reject) => {
		const sp = spawn(tabix, [file, coord], { cwd: dir })
		const out = [],
			out2 = []
		sp.stdout.on('data', i => out.push(i))
		sp.stderr.on('data', i => out2.push(i))
		sp.on('close', () => {
			const err = out2.join('')
			if (err) reject(err)
			const str = out.join('').trim()
			if (!str) resolve()
			resolve(str.split('\n'))
		})
	})
}

function tabix_getvcfmeta(file, dir) {
	return new Promise((resolve, reject) => {
		const sp = spawn(tabix, ['-H', file], { cwd: dir })
		const out = [],
			out2 = []
		sp.stdout.on('data', i => out.push(i))
		sp.stderr.on('data', i => out2.push(i))
		sp.on('close', () => {
			const err = out2.join('')
			if (err) reject(err)
			const str = out.join('').trim()
			if (!str) reject('cannot list vcf meta lines')
			resolve(str.split('\n'))
		})
	})
}

function tabix_ifnochr(file, genome, dir) {
	return new Promise((resolve, reject) => {
		const sp = spawn(tabix, ['-l', file], { cwd: dir })
		const out = [],
			out2 = []
		sp.stdout.on('data', i => out.push(i))
		sp.stderr.on('data', i => out2.push(i))
		sp.on('close', () => {
			const err = out2.join('')
			if (err) reject(err)
			const str = out.join('').trim()
			if (!str) reject('cannot list chr names')
			resolve(common.contigNameNoChr(genome, str.split('\n')))
		})
	})
}

function bam_ifnochr(file, genome, dir) {
	return new Promise((resolve, reject) => {
		const sp = spawn(samtools, ['view', '-H', file], { cwd: dir })
		const out = [],
			out2 = []
		sp.stdout.on('data', i => out.push(i))
		sp.stderr.on('data', i => out2.push(i))
		sp.on('close', () => {
			const err = out2.join('')
			if (err) reject(err)
			const str = out.join('').trim()
			if (!str) reject('cannot list bam header lines')
			const chrlst = []
			for (const line of str.split('\n')) {
				if (!line.startsWith('@SQ')) continue
				const tmp = line.split('\t')[1]
				if (!tmp) reject('2nd field missing from @SQ line')
				const l = tmp.split(':')
				if (l[0] != 'SN') reject('@SQ line 2nd field is not "SN" but ' + l[0])
				if (!l[1]) reject('@SQ line no value for SN')
				chrlst.push(l[1])
			}

			resolve(common.contigNameNoChr(genome, chrlst))
		})
	})
}
exports.bam_ifnochr = bam_ifnochr

function get_rank_from_sortedarray(v, lst) {
	// [ { value: v } ]
	// lst must be sorted ascending
	const i = lst.findIndex(j => j.value >= v)
	if (i == -1 || i == lst.length - 1) return 100
	if (i == 0) return 0
	return Math.ceil((100 * i) / lst.length)
}

function handle_mdsexpressionrank(req, res) {
	/*
	for a given sample, check expression rank of its gene expression as compared with its cohort
	similar task done in svcnv

	where is the data?
	- custom file
	- official ds, a query of flag isgenenumeric

	sample: req.query.sample
	range: req.query.coord
	cohort: for official, defined by req.query.attributes
	        for custom, will use all available samples other than this one
	*/
	if (reqbodyisinvalidjson(req, res)) return

	let gn,
		ds,
		dsquery,
		samples = new Set() // to record all samples seen and report the total number

	Promise.resolve()
		.then(() => {
			if (!req.query.rglst) throw 'rglst missing'
			if (!req.query.sample) throw 'sample missing'

			if (req.query.iscustom) {
				gn = genomes[req.query.genome]
				if (!gn) throw 'invalid genome'
				if (!req.query.file && !req.query.url) throw 'no file or url for expression data'
				ds = {}
				dsquery = {
					file: req.query.file,
					url: req.query.url,
					indexURL: req.query.indexURL
				}
			} else {
				// official
				const [err, gn1, ds1, dsquery1] = mds_query_arg_check(req.query)
				if (err) throw err
				gn = gn1
				ds = ds1
				dsquery = dsquery1

				if (!dsquery.samples) throw 'total samples missing from server config'
				// check if the said sample exists
				if (dsquery.samples.indexOf(req.query.sample) == -1) throw { nodata: 1 }
			}

			if (dsquery.viewrangeupperlimit) {
				if (req.query.rglst.reduce((i, j) => i + j.stop - j.start, 0) > dsquery.viewrangeupperlimit)
					throw 'zoom in under ' + common.bplen(dsquery.viewrangeupperlimit) + ' to view data'
			}

			if (req.query.levelkey) {
				// only for official ds
				if (!req.query.levelvalue) throw 'levelvalue is required when levelkey is used'
				if (!ds.cohort || !ds.cohort.annotation) throw '.cohort.annotation missing from dataset'
			}

			if (dsquery.file) return
			if (!dsquery.url) throw 'file or url missing'

			return utils.cache_index(dsquery.url, dsquery.indexURL)
		})
		.then(dir => {
			const tasks = []

			for (const r of req.query.rglst) {
				tasks.push(
					new Promise((resolve, reject) => {
						const ps = spawn(
							tabix,
							[
								dsquery.file ? path.join(serverconfig.tpmasterdir, dsquery.file) : dsquery.url,
								r.chr + ':' + r.start + '-' + r.stop
							],
							{ cwd: dir }
						)

						const rl = readline.createInterface({
							input: ps.stdout
						})

						const gene2value = new Map()

						rl.on('line', line => {
							const l = line.split('\t')
							const j = JSON.parse(l[3])

							if (!j.gene) return

							if (!j.sample) return

							if (!Number.isFinite(j.value)) return

							const chr = l[0]
							const start = Number.parseInt(l[1])
							const stop = Number.parseInt(l[2])

							if (j.sample == req.query.sample) {
								// a gene for the current sample
								if (!gene2value.has(j.gene)) {
									gene2value.set(j.gene, {
										chr: chr,
										start: start,
										stop: stop,
										allvalues: []
									})
								}
								gene2value.get(j.gene).thisvalue = j.value

								// additional stats about gene expression
								/* XXX OHE!!
								if (j.outlier) {
									gene2value.get(j.gene).outlier = j.outlier
								}
								*/
								if (j.ase) {
									gene2value.get(j.gene).ase = j.ase
								}
								return
							}

							if (req.query.attributes) {
								// official only,
								// filter for samples of the same cohort
								const sanno = ds.cohort.annotation[j.sample]
								if (!sanno) {
									// sample has no annotation
									return
								}
								for (const attr of req.query.attributes) {
									if (attr.k && attr.kvalue) {
										if (attr.kvalue != sanno[attr.k]) {
											// not a sample for this cohort
											return
										}
									}
								}
							}

							// now it is a sample for the group

							samples.add(j.sample)

							if (!gene2value.has(j.gene)) {
								gene2value.set(j.gene, {
									chr: chr,
									start: start,
									stop: stop,
									allvalues: []
								})
							}
							gene2value.get(j.gene).allvalues.push({
								value: j.value
							})
						})

						const errout = []
						ps.stderr.on('data', i => errout.push(i))
						ps.on('close', code => {
							const e = errout.join('')
							if (e && !tabixnoterror(e)) reject({ message: e })
							resolve(gene2value)
						})
					})
				)
			}

			return Promise.all(tasks)
		})
		.then(results => {
			const lst = []
			for (const gene2value of results) {
				for (const [gene, o] of gene2value) {
					if (o.thisvalue == undefined) continue

					o.allvalues.sort((i, j) => i.value - j.value)
					o.rank = get_rank_from_sortedarray(o.thisvalue, o.allvalues)
					delete o.allvalues

					o.gene = gene
					lst.push(o)
				}
			}
			res.send({
				result: lst,
				samplecount: samples.size
			})
		})
		.catch(err => {
			if (err.stack) console.log(err)
			if (err.nodata) {
				res.send({ nodata: 1 })
			} else {
				res.send({ error: err.message ? err.message : err })
			}
		})
}

function mdssvcnv_exit_gettrack4singlesample(req, res, gn, ds, dsquery) {
	/*
	getting track for single sample from server config
	only for official dataset
	*/
	const samplename = req.query.gettrack4singlesample
	if (req.query.iscustom) {
		// not supported
		return res.send({ error: 'no server-side config available for custom track' })
	}
	if (!ds.sampleAssayTrack) {
		// not available
		return res.send({})
	}
	return res.send({
		tracks: ds.sampleAssayTrack.samples.get(samplename)
	})
}

function mdssvcnv_exit_ifsamplehasvcf(req, res, gn, ds, dsquery) {
	if (req.query.iscustom) return res.send({ no: 1 })
	if (!dsquery.vcf_querykey) {
		// no vcf query, should be speedy and allow
		return res.send({ yes: 1 })
	}
	const vcfq = ds.queries[dsquery.vcf_querykey]
	if (!vcfq) return res.send({ error: 'vcf query missing' })
	res.send(vcfq.singlesamples ? { yes: 1 } : { no: 1 })
}

function mdssvcnv_exit_getsample4disco(req, res, gn, ds, dsquery) {
	/*
	a text file for a single sample
	only for official dataset
	*/
	if (req.query.iscustom) return res.send({ error: 'not for custom track' })
	if (!ds.singlesamplemutationjson)
		return res.send({ error: 'singlesamplemutationjson not available for this dataset' })
	const samplename = req.query.getsample4disco
	const file = path.join(serverconfig.tpmasterdir, ds.singlesamplemutationjson.samples[samplename])
	fs.readFile(file, { encoding: 'utf8' }, (err, data) => {
		if (err) return res.send({ error: 'error getting data for this sample' })
		res.send({ text: data })
	})
}

async function mdssvcnv_exit_getexpression4gene(req, res, gn, ds, dsquery) {
	/*
	get expression data for a gene

	gene name up/lower case confusion here
	- query name
	- gene name in fpkm file
	- in rnabam mode, gene name in gene track
	*/

	try {
		const q = req.query.getexpression4gene
		if (!q.chr) throw 'chr missing'
		if (!Number.isFinite(q.start)) throw 'invalid start pos'
		if (!Number.isFinite(q.stop)) throw 'invalid stop pos'
		if (!q.name) throw 'unknown gene name'

		if (dsquery.checkrnabam) {
			// need to construct the gene obj
			const genome = genomes[req.query.genome]
			const genetk = genome.tracks.find(i => i.__isgene)
			const genes = await handle_ase_getgenes(genome, genetk, q.chr, q.start, q.stop)
			const gene = genes.get(q.name)
			if (!gene) throw 'no gene matching with ' + q.name

			const tmp = {}
			await handle_mdssvcnv_rnabam_do(new Map([[q.name, gene]]), q.chr, q.start, q.stop, dsquery, tmp)
			const sample2rnabam = {}
			for (const s of tmp.checkrnabam) {
				if (s.genes) {
					const g = s.genes.find(i => i.gene == q.name)
					if (g) {
						sample2rnabam[s.sample] = g
					}
				}
			}
			res.send({ sample2rnabam: sample2rnabam })
			return
		}

		let _c
		if (dsquery.iscustom) {
			_c = dsquery.checkexpressionrank
		} else {
			if (dsquery.expressionrank_querykey) {
				_c = ds.queries[dsquery.expressionrank_querykey]
			}
		}
		if (!_c) throw 'missing expression data source'

		const dir = _c.file ? null : await utils.cache_index(_c.url, _c.indexURL)

		const values = []
		await utils.get_lines_tabix(
			[_c.file ? path.join(serverconfig.tpmasterdir, _c.file) : _c.url, q.chr + ':' + q.start + '-' + q.stop],
			dir,
			line => {
				const l = line.split('\t')
				let j
				try {
					j = JSON.parse(l[3])
				} catch (e) {
					reject('invalid json from expression data')
				}
				if (!j.sample) return
				if (!j.gene) return
				if (!Number.isFinite(j.value)) return
				delete j.outlier // XXX OHE
				if (j.gene.toLowerCase() == q.name.toLowerCase()) {
					values.push(j)
				}
			}
		)

		// convert to rank
		const sample2rank = mdssvcnv_exit_getexpression4gene_rank(ds, dsquery, values)

		res.send({ sample2rank: sample2rank })
	} catch (err) {
		if (err.stack) console.error(err.stack)
		res.send({ error: err.message || err })
	}
}

function mdssvcnv_exit_getexpression4gene_rank(ds, dsquery, values) {
	/*
	values: [ {sample, value, ase, outlier } ]
	for each value, convert to rank

	if native, may group samples by attr
	otherwise, use all samples as a group
	*/

	const sample2rank = {}

	if (ds && ds.cohort && ds.cohort.annotation && dsquery.groupsamplebyattr && dsquery.groupsamplebyattr.attrlst) {
		// native, and with required attr

		const groups = new Map()

		for (const vo of values) {
			// vo: {value, ase, outlier, sample}

			const anno = ds.cohort.annotation[vo.sample]
			if (!anno) continue

			const tmp = []
			for (const a of dsquery.groupsamplebyattr.attrlst) {
				tmp.push(anno[a.k])
			}
			const grouplabel = tmp.join(',') // won't be shown on client

			if (!groups.has(grouplabel)) groups.set(grouplabel, [])

			groups.get(grouplabel).push(vo)
		}

		for (const lst of groups.values()) {
			// each group
			lst.sort((a, b) => a.value - b.value)
			for (const vo of lst) {
				vo.rank = get_rank_from_sortedarray(vo.value, lst)
				sample2rank[vo.sample] = vo
			}
		}
	} else {
		// anything else, include all samples into one group
		values.sort((a, b) => a.value - b.value)
		for (const vo of values) {
			vo.rank = get_rank_from_sortedarray(vo.value, values)
			sample2rank[vo.sample] = vo
		}
	}

	return sample2rank
}

function mdssvcnv_exit_findsamplename(req, res, gn, ds, dsquery) {
	/*
	find sample names by matching with input string
	only for official dataset
	*/
	if (req.query.iscustom) {
		// not supported
		return res.send({ error: 'cannot search sample by name in custom track' })
	}
	const str = req.query.findsamplename.toLowerCase()

	// must return grouping attributes for launching expression rank
	const result = []

	if (!ds.cohort.__samplelst) {
		// array of lower case sample names
		// only init once
		ds.cohort.__samplelst = []
		for (const name in ds.cohort.annotation) {
			ds.cohort.__samplelst.push({
				name,
				low: name.toLowerCase()
			})
		}
	}
	findadd(ds.cohort.__samplelst)

	// list of samples ready to be returned to client
	// now append attributes to found samples

	// get the svcnv query for checking stuff
	for (const k in ds.queries) {
		const q = ds.queries[k]
		if (q.type == common.tkt.mdssvcnv) {
			if (q.groupsamplebyattr) {
				for (const s of result) {
					const a = ds.cohort.annotation[s.name]
					if (!a) continue
					const lst = []
					for (const attr of q.groupsamplebyattr.attrlst) {
						const v = a[attr.k]
						if (v) {
							lst.push({
								k: attr.k,
								kvalue: v
							})
						}
					}
					if (lst.length) {
						s.attributes = lst
						s.grouplabel = lst.map(i => i.kvalue).join(q.groupsamplebyattr.attrnamespacer)
					}
				}
			}
		}
	}

	if (ds.cohort && ds.cohort.sampleAttribute && ds.cohort.sampleAttribute.attributes && ds.cohort.annotation) {
		for (const sample of result) {
			const anno = ds.cohort.annotation[sample.name]
			if (!anno) continue
			const toclient = [] // annotations to client
			for (const key in ds.cohort.sampleAttribute.attributes) {
				if (ds.cohort.sampleAttribute.attributes[key].clientnoshow) {
					continue
				}
				const value = anno[key]
				if (value != undefined) {
					toclient.push({ k: key, v: value })
				}
			}
			if (toclient.length) {
				sample.attr = toclient
			}
		}
	}

	if (ds.sampleAssayTrack) {
		for (const sample of result) {
			const a = ds.sampleAssayTrack.samples.get(sample.name)
			if (a) {
				sample.num_assay_tracks = a.length
			}
		}
	}

	if (ds.cohort && ds.cohort.mutation_signature) {
		for (const k in ds.cohort.mutation_signature.sets) {
			const s = ds.cohort.mutation_signature.sets[k]
			if (s.samples) {
				for (const ss of result) {
					if (s.samples.map.has(ss.name)) {
						ss.mutation_signature = 1
					}
				}
			}
		}
	}

	if (ds.singlesamplemutationjson) {
		// if has disco
		for (const s of result) {
			if (ds.singlesamplemutationjson.samples[s.name]) {
				s.disco = 1
			}
		}
	}

	return res.send({ result })

	function findadd(samples) {
		for (const s of samples) {
			if (result.length > 10) return

			if (s.low.indexOf(str) == -1) continue

			if (result.find(i => i.name == s.name)) {
				// already found it
				continue
			}
			result.push(s)
		}
	}
}

async function handle_mdsgenevalueonesample(req, res) {
	/*
.genes[]
.dslabel
.querykey
.iscustom
.file
.url
.sample
*/

	if (reqbodyisinvalidjson(req, res)) return
	const q = req.query

	try {
		if (!q.sample) throw '.sample missing'
		if (!q.genes) throw '.genes[] missing'

		let gn, ds, dsquery

		if (req.query.iscustom) {
			gn = genomes[q.genome]
			if (!gn) throw 'invalid genome'
			if (!q.file && !q.url) throw 'no file or url for expression data'
			ds = {}
			dsquery = {
				file: q.file,
				url: q.url,
				indexURL: q.indexURL
			}
		} else {
			const [err, gn1, ds1, dsquery1] = mds_query_arg_check(q)
			if (err) throw err
			gn = gn1
			ds = ds1
			dsquery = dsquery1
		}
		const dir = dsquery.file ? null : await utils.cache_index(dsquery.url, dsquery.indexURL)

		const gene2value = {}
		let nodata = true
		for (const gene of q.genes) {
			let v
			await utils.get_lines_tabix(
				[
					dsquery.file ? path.join(serverconfig.tpmasterdir, dsquery.file) : dsquery.url,
					gene.chr + ':' + gene.start + '-' + gene.stop
				],
				dir,
				line => {
					const l = line.split('\t')
					if (!l[3]) return
					const j = JSON.parse(l[3])
					if (j.gene == gene.gene && j.sample == q.sample) {
						v = j.value
					}
				}
			)
			if (Number.isFinite(v)) {
				gene2value[gene.gene] = v
				nodata = false
			}
		}
		if (nodata) {
			res.send({ nodata: 1 })
		} else {
			res.send({ result: gene2value })
		}
	} catch (e) {
		if (e.stack) console.log(e.stack)
		res.send({ error: e.message || e })
	}
}

function handle_mdsgeneboxplot(req, res) {
	/*
.gene str
.chr/start/stop
.dslabel
.querykey
.iscustom
.file
.url
.getgroup[ {} ]
	list of attributes
	if provided, will get actual list of samples with gene value based on filter
	.k
	.kvalue

.stillmakeboxplot
	if provided, yield a boxplot for .getgroup


2nd-gen epaint
for one gene, over entire cohort
native or custom
if native, group samples by hierarchy
if custom, all samples in one group


divide into groups by L1/L2 hierarchy levels
	for each group, divid into subgroups by sv/cnv/loh status
		one boxplot for each subgroup
		boxplot will be generated solely on numeric value
		the expression status (ase, outlier) will be ignored

or, export all samples from a group
	returned data on samples will include following for rendering:
		overlapping sv/cnv/loh
		ase, outlier status
*/

	if (reqbodyisinvalidjson(req, res)) return
	if (!req.query.gene) return res.send({ error: 'gene name missing' })
	if (!req.query.chr) return res.send({ error: 'chr missing' })
	if (!Number.isInteger(req.query.start)) return res.send({ error: 'start missing' })
	if (!Number.isInteger(req.query.stop)) return res.send({ error: 'stop missing' })

	let gn, ds, dsquery

	if (req.query.iscustom) {
		gn = genomes[req.query.genome]
		if (!gn) return res.send({ error: 'invalid genome' })
		if (!req.query.file && !req.query.url) return res.send({ error: 'no file or url for expression data' })
		ds = {}
		dsquery = {
			file: req.query.file,
			url: req.query.url,
			indexURL: req.query.indexURL
		}
	} else {
		const [err, gn1, ds1, dsquery1] = mds_query_arg_check(req.query)
		if (err) return res.send({ error: err })
		gn = gn1
		ds = ds1
		dsquery = dsquery1
	}

	let svcnv = null
	if (req.query.svcnv) {
		svcnv = {}
		if (req.query.iscustom) {
			svcnv.dsquery = {
				file: req.query.svcnv.file,
				url: req.query.svcnv.url,
				indexURL: req.query.svcnv.indexURL
			}
		} else {
			req.query.svcnv.genome = req.query.genome
			const [err, gn1, ds1, dsquery1] = mds_query_arg_check(req.query.svcnv)
			if (err) return res.send({ error: err })
			svcnv.ds = ds1
			svcnv.dsquery = dsquery1
		}
	}

	if (req.query.getgroup) {
		// getting sample data for a group, no making boxplot
		if (!ds.cohort || !ds.cohort.annotation) return res.send({ error: 'no sample annotation for getting group' })
		if (req.query.getgroup_unannotated) {
			// find unannotated samples
			if (!dsquery.boxplotbysamplegroup)
				return res.send({ error: 'dsquery.boxplotbysamplegroup{} missing when getgroup_unannotated' })
		} else {
			// find annotated samples
			// getgroup value is same as attributes[]
			if (!Array.isArray(req.query.getgroup)) return res.send({ error: 'getgroup should be array' })
			for (const a of req.query.getgroup) {
				if (!a.k) return res.send({ error: 'k missing from one of getgroup' })
				if (!a.kvalue) return res.send({ error: 'kvalue missing from one of getgroup' })
			}
		}
	}

	if (req.query.getalllst) {
		// to get expression data for all samples but not boxplots
		// server may not allow and deny
	}

	Promise.resolve()
		.then(() => {
			if (dsquery.file) return
			if (!dsquery.url) throw { message: 'file or url missing' }
			return utils.cache_index(dsquery.url, dsquery.indexURL)
		})
		.then(dir => {
			dsquery.dir = dir
			if (!svcnv) return
			if (svcnv.dsquery.file) return
			if (!svcnv.dsquery.url) throw { message: 'svcnv file or url missing' }
			return utils.cache_index(svcnv.dsquery.url, svcnv.dsquery.indexURL)
		})
		.then(dir => {
			if (svcnv) svcnv.dsquery.dir = dir

			return new Promise((resolve, reject) => {
				const ps = spawn(
					tabix,
					[
						dsquery.file ? path.join(serverconfig.tpmasterdir, dsquery.file) : dsquery.url,
						req.query.chr + ':' + req.query.start + '-' + req.query.stop
					],
					{ cwd: dsquery.dir }
				)
				const rl = readline.createInterface({
					input: ps.stdout
				})

				const key2samplegroup = new Map()
				/*
			k: "BT, HGG"
			v: {}
			   levelkey
			   levelvalue
			   samples []
			*/

				/* use following when making boxplot for official dataset
			store those samples without annotation to be shown as separate group
			also as a holder for getalllst
			*/
				const nogroupvalues = []

				/* use following when getting data for a group
				 */
				const getgroupdata = []

				rl.on('line', line => {
					const l = line.split('\t')
					const j = JSON.parse(l[3])
					if (!j.gene) return
					if (j.gene != req.query.gene) return
					if (!Number.isFinite(j.value)) return

					if (req.query.getalllst) {
						nogroupvalues.push({ sample: j.sample, value: j.value }) // hardcoded key
						return
					}

					if (req.query.getgroup) {
						if (!j.sample) return

						const sanno = ds.cohort.annotation[j.sample]

						if (req.query.getgroup_unannotated) {
							/* in case of getting samples without annotation,
						could be that the sample is not in sampletable at all
						or it lacks annotation for the given term
						*/
							if (!sanno) {
								getgroupdata.push(j)
								return
							}
							for (const a of dsquery.boxplotbysamplegroup.attributes) {
								if (sanno[a.k] == undefined) {
									getgroupdata.push(j)
									return
								}
							}
							return
						}

						// find sample matching with specified annotation
						if (!sanno) return
						for (const a of req.query.getgroup) {
							if (a.kvalue != sanno[a.k]) {
								return
							}
						}
						getgroupdata.push(j)
						return
					}

					if (dsquery.boxplotbysamplegroup && ds.cohort && ds.cohort.annotation) {
						if (!j.sample) {
							// missing sample
							return
						}

						// quick fix!!!
						let attributes // which attributes to use
						if (req.query.index_boxplotgroupers == undefined || req.query.index_boxplotgroupers == 0) {
							attributes = dsquery.boxplotbysamplegroup.attributes
						} else {
							// using one of additional
							attributes = dsquery.boxplotbysamplegroup.additionals[req.query.index_boxplotgroupers - 1].attributes
						}

						// same grouping procedure as svcnv

						const sanno = ds.cohort.annotation[j.sample]
						if (!sanno) {
							nogroupvalues.push({ sample: j.sample, value: j.value }) // hardcoded key
							return
						}

						const headname = sanno[attributes[0].k]
						if (headname == undefined) {
							nogroupvalues.push({ sample: j.sample, value: j.value }) // hardcoded key
							return
						}

						const names = []
						for (let i = 1; i < attributes.length; i++) {
							const v = sanno[attributes[i].k]
							if (v == undefined) {
								break
							}
							names.push(v)
						}

						names.unshift(headname)

						const groupkey = names.join(', ') // spacer is for display only

						if (!key2samplegroup.has(groupkey)) {
							const g = {
								samples: [],
								attributes: []
							}
							for (const a of attributes) {
								const v = sanno[a.k]
								if (v == undefined) break
								const a2 = { k: a.k, kvalue: v }
								if (a.full) {
									a2.full = a.full
									a2.fullvalue = sanno[a.full]
								}
								g.attributes.push(a2)
							}

							key2samplegroup.set(groupkey, g)
						}
						key2samplegroup.get(groupkey).samples.push({
							sample: j.sample,
							value: j.value
						})
					} else {
						nogroupvalues.push({
							sample: j.sample,
							value: j.value
						})
					}
				})
				const errout = []
				ps.stderr.on('data', i => errout.push(i))
				ps.on('close', code => {
					const e = errout.join('')
					if (e && !tabixnoterror(e)) throw { message: e }
					const lst = []
					for (const [n, o] of key2samplegroup) {
						lst.push({
							name: n,
							values: o.samples,
							attributes: o.attributes
						})
					}

					if (nogroupvalues.length) {
						lst.push({
							name: 'Unannotated',
							values: nogroupvalues
						})
					}

					if (getgroupdata.length) {
						lst.push({
							values: getgroupdata
						})
					}

					resolve(lst)
				})
			})
		})
		.then(groups => {
			if (req.query.getalllst) {
				return groups[0].values
			}

			// sv/cnv/loh overlaying

			if (!svcnv || (!req.query.svcnv.useloss && !req.query.svcnv.usegain && !req.query.svcnv.usesv)) {
				// TODO loh
				return { groups: groups }
			}

			return new Promise((resolve, reject) => {
				let start = req.query.start
				let stop = req.query.stop

				if (req.query.svcnv.usesv && Number.isInteger(req.query.svcnv.svflank)) {
					start = Math.max(0, start - req.query.svcnv.svflank)
					stop = stop + req.query.svcnv.svflank
				}

				// TODO cnv flanking

				const ps = spawn(
					tabix,
					[
						svcnv.dsquery.file ? path.join(serverconfig.tpmasterdir, svcnv.dsquery.file) : svcnv.dsquery.url,
						req.query.chr + ':' + start + '-' + stop
					],
					{ cwd: svcnv.dsquery.dir }
				)
				const rl = readline.createInterface({
					input: ps.stdout
				})

				const sample2event = new Map()
				rl.on('line', line => {
					const l = line.split('\t')
					const j = JSON.parse(l[3])
					if (!j.sample) return

					if (j.chrA || j.chrB) {
						// sv
						if (!req.query.svcnv.usesv) return

						if (!sample2event.has(j.sample)) sample2event.set(j.sample, {})
						sample2event.get(j.sample).sv = 1
					} else {
						// cnv
						if (!req.query.svcnv.usegain && !req.query.svcnv.useloss) return

						if (req.query.svcnv.usesv && req.query.svcnv.svflank) {
							const start = Number.parseInt(l[1])
							const stop = Number.parseInt(l[2])
							if (Math.max(req.query.start, start) > Math.min(req.query.stop, stop)) return
						}

						if (!Number.isFinite(j.value)) return
						if (!req.query.svcnv.usegain && j.value > 0) return
						if (!req.query.svcnv.useloss && j.value < 0) return
						if (req.query.svcnv.valueCutoff) {
							if (Math.abs(j.value) < req.query.svcnv.valueCutoff) return
						}

						if (req.query.svcnv.bplengthUpperLimit) {
							if (Number.parseInt(l[2]) - Number.parseInt(l[1]) > req.query.svcnv.bplengthUpperLimit) return
						}

						if (!sample2event.has(j.sample)) sample2event.set(j.sample, {})
						if (j.value > 0) {
							sample2event.get(j.sample).gain = 1
						} else if (j.value < 0) {
							sample2event.get(j.sample).loss = 1
						}
					}
				})
				const errout = []
				ps.stderr.on('data', i => errout.push(i))
				ps.on('close', code => {
					const e = errout.join('')
					if (e && !tabixnoterror(e)) throw { message: e }
					resolve({ groups: groups, sample2event: sample2event })
				})
			})
		})
		.then(data => {
			if (req.query.getalllst) {
				return res.send({ lst: data })
			}

			const { groups, sample2event } = data

			// bad logic!!
			// just an exit for both official and custom
			if (req.query.stillmakeboxplot) {
				if (groups[0]) {
					const l = groups[0].values
					l.sort((i, j) => i.value - j.value)
					const { w1, w2, p25, p50, p75, out } = boxplot_getvalue(l)
					return res.send({
						n: l.length,
						min: l[0].value,
						max: l[l.length - 1].value,
						w1: w1,
						w2: w2,
						p25: p25,
						p50: p50,
						p75: p75,
						out: out
					})
				}
				return res.send({ nodata: 1 })
			}

			if (req.query.iscustom || groups.length == 1) {
				// a custom track
				if (groups[0]) {
					const l = groups[0].values
					l.sort((i, j) => j.value - i.value)
					return res.send({ lst: l, max: l[0].value, min: l[l.length - 1].value })
				}
				return res.send({ nodata: 1 })
			}

			if (req.query.getgroup) {
				// return samples for a single group
				if (groups[0]) {
					const lst = groups[0].values
					lst.sort((i, j) => j.value - i.value)

					if (sample2event) {
						for (const i of lst) {
							const o = sample2event.get(i.sample)
							if (o) {
								for (const k in o) {
									i[k] = o[k]
								}
							}
						}
					}
					return res.send({ lst: lst, max: lst[0].value, min: lst[lst.length - 1].value })
				}
				return res.send({ nodata: 1 })
			}

			const grouplst = []
			let min = null,
				max = null
			for (const group of groups) {
				group.values.sort((i, j) => i.value - j.value)
				const l = group.values.length
				if (min == null) {
					min = group.values[0].value
					max = group.values[l - 1].value
				} else {
					min = Math.min(min, group.values[0].value)
					max = Math.max(max, group.values[l - 1].value)
				}

				const { w1, w2, p25, p50, p75, out } = boxplot_getvalue(group.values)

				const boxplots = [{ isall: 1, w1: w1, w2: w2, p25: p25, p50: p50, p75: p75, out: out }]

				if (sample2event) {
					if (req.query.svcnv.usegain) {
						const lst = group.values.filter(i => sample2event.has(i.sample) && sample2event.get(i.sample).gain)
						if (lst.length) {
							const { w1, w2, p25, p50, p75, out } = boxplot_getvalue(lst)
							boxplots.push({
								iscnvgain: 1,
								samplecount: lst.length,
								w1: w1,
								w2: w2,
								p25: p25,
								p50: p50,
								p75: p75,
								out: out
							})
						}
					}
					if (req.query.svcnv.useloss) {
						const lst = group.values.filter(i => sample2event.has(i.sample) && sample2event.get(i.sample).loss)
						if (lst.length) {
							const { w1, w2, p25, p50, p75, out } = boxplot_getvalue(lst)
							boxplots.push({
								iscnvloss: 1,
								samplecount: lst.length,
								w1: w1,
								w2: w2,
								p25: p25,
								p50: p50,
								p75: p75,
								out: out
							})
						}
					}
					if (req.query.svcnv.usesv) {
						const lst = group.values.filter(i => sample2event.has(i.sample) && sample2event.get(i.sample).sv)
						if (lst.length) {
							const { w1, w2, p25, p50, p75, out } = boxplot_getvalue(lst)
							boxplots.push({
								issv: 1,
								samplecount: lst.length,
								w1: w1,
								w2: w2,
								p25: p25,
								p50: p50,
								p75: p75,
								out: out
							})
						}
					}
				}

				grouplst.push({
					name: group.name + ' (' + group.values.length + ')',
					boxplots: boxplots,
					attributes: group.attributes
				})
			}
			grouplst.sort((i, j) => {
				if (i.name < j.name) return -1
				if (i.name > j.name) return 1
				return 0
			})
			res.send({ groups: grouplst, min: min, max: max })
		})
		.catch(err => {
			if (err.stack) console.log(err)
			res.send({ error: err.message })
		})
}

function boxplot_getvalue(lst) {
	/* ascending order
	each element: {value}
	*/
	const l = lst.length
	if (l < 5) {
		// less than 5 items, won't make boxplot
		return { out: lst }
	}
	const p50 = lst[Math.floor(l / 2)].value
	const p25 = lst[Math.floor(l / 4)].value
	const p75 = lst[Math.floor((l * 3) / 4)].value
	const p05 = lst[Math.floor(l * 0.05)].value
	const p95 = lst[Math.floor(l * 0.95)].value
	const p01 = lst[Math.floor(l * 0.01)].value
	const iqr = (p75 - p25) * 1.5

	let w1, w2
	if (iqr == 0) {
		w1 = 0
		w2 = 0
	} else {
		const i = lst.findIndex(i => i.value > p25 - iqr)
		w1 = lst[i == -1 ? 0 : i].value
		const j = lst.findIndex(i => i.value > p75 + iqr)
		w2 = lst[j == -1 ? l - 1 : j - 1].value
	}
	const out = lst.filter(i => i.value < p25 - iqr || i.value > p75 + iqr)
	return { w1, w2, p05, p25, p50, p75, p95, iqr, out }
}
exports.boxplot_getvalue = boxplot_getvalue

async function handle_mdsjunction(req, res) {
	/*
	get all junctions in view range, make stats for:
		- sample annotation

	column 5 type is not used
	splice events are annotated to both junctions and samples



	****** filter attributes (added by addFilterToLoadParam)

	.cohortHiddenAttr (for dropping sample by annotation)
		.key
			.value
	.infoFilter  (for dropping junction by type or event type)
		.type
			contains:
				canonical
				exon skip / alt use
				a5ss, a3ss
				Unannotated
	.spliceEventPercentage (for dropping sample by percentage cutoff of certain splice event types)
		k: event.attrValue (event type code)
		v: cutoff {side,value}

	******* routes
		* get details on specific junction
		* get median read count for A junctions by the same set of samples of junction B (passing filters)

	*/

	try {
		req.query = JSON.parse(req.body)
		log(req)
		const q = req.query
		if (!q.genome) throw 'genome missing'
		const gn = genomes[q.genome]
		if (!gn) throw 'invalid genome'

		let ds = {},
			dsquery = {},
			dir,
			sample2client

		if (q.iscustom) {
			// won't have q.dslabel and q.querykey, but still generate adhoc objects
			if (q.url) {
				dsquery.url = q.url
				dir = await utils.cache_index(q.url, q.indexURL)
			} else {
				if (!q.file) throw 'no file or url given'
				dsquery.file = q.file
			}
		} else {
			// official ds, still the track file would be url? the index already cached in the init()?
			if (!gn.datasets) throw 'genome is not equipped with datasets'
			if (!q.dslabel) throw 'dslabel missing'
			ds = gn.datasets[q.dslabel]
			if (!ds) throw 'invalid dslabel'
			if (!ds.queries) throw 'dataset is not equipped with queries'
			if (!q.querykey) throw 'querykey missing'
			dsquery = ds.queries[q.querykey]
			if (!dsquery) throw 'invalid querykey'
		}

		if (req.query.getsamples) {
			// first time querying a custom track, get list of samples and keep on client, not on server
			const lines = await utils.get_header_tabix(
				dsquery.file ? path.join(serverconfig.tpmasterdir, dsquery.file) : dsquery.url,
				dir
			)
			if (lines[0]) {
				// has header line
				const l = lines[0].split('\t')
				if (l.length > 5) {
					sample2client = l.slice(5)
				}
			}
		}
		handle_mdsjunction_actual({ req, res, gn, ds, dsquery, iscustom: q.iscustom, sample2client })
	} catch (e) {
		if (e.stack) console.log(e.stack)
		res.send({ error: e.message || e })
	}
}

function handle_mdsjunction_actual({ req, res, gn, ds, dsquery, iscustom, sample2client }) {
	/*
	run after URL index cached

	gn: genome object
	ds: dataset object
	dsquery: query object

	*/

	if (req.query.junction) {
		///// route
		// details about a clicked junction
		handle_mdsjunction_singlejunction(req, res, ds, dsquery, iscustom)
		return
	}

	if (req.query.readcountByjBsamples) {
		//// route
		// get median read count for A junctions from the same set of samples as junctionB
		handle_mdsjunction_AreadcountbyB(req.query, res, ds, dsquery, iscustom)
		return
	}

	///////////////// getting all junctions from view range

	if (!req.query.rglst) return res.send({ error: 'rglst missing' })

	if (dsquery.viewrangeupperlimit) {
		const len = req.query.rglst.reduce((i, j) => i + j.stop - j.start, 0)
		if (len >= dsquery.viewrangeupperlimit) {
			return res.send({ error: 'zoom in under ' + common.bplen(dsquery.viewrangeupperlimit) + ' to view details' })
		}
	}

	if (req.query.permanentHierarchy) {
		const err = mds_tkquery_parse_permanentHierarchy(req.query, ds)
		if (err) return res.send({ error: 'permanentHierarchy error: ' + err })
	}

	const tasks = []
	let maxreadcount = 0 // from view range

	let junctiontotalnumber = 0 // total # of junctions from view range

	// collect all samples from view range, passing filters, for making annotation summary
	const allsampleidxset = new Set()

	for (const r of req.query.rglst) {
		const task = new Promise((resolve, reject) => {
			const ps = spawn(
				tabix,
				[
					dsquery.file ? path.join(serverconfig.tpmasterdir, dsquery.file) : dsquery.url,
					r.chr + ':' + r.start + '-' + r.stop
				],
				{ cwd: dsquery.usedir }
			)
			const rl = readline.createInterface({
				input: ps.stdout
			})
			const items = []

			rl.on('line', line => {
				const l = line.split('\t')
				const start = Number.parseInt(l[1])
				const stop = Number.parseInt(l[2])
				const strand = l[3]
				const thistype = l[4] // not used!!

				// only use those with either start/stop in region
				if (!(start >= r.start && start <= r.stop) && !(stop >= r.start && stop <= r.stop)) {
					// both ends not in view range, only use those with either start/stop in view
					return
				}

				junctiontotalnumber++

				/*
				info.type is hardcoded
				*/
				const j = {
					chr: r.chr,
					start: start,
					stop: stop,
					info: {
						type: {
							lst: []
						}
					}
				}

				const jd = JSON.parse(l[5])

				if (jd.sv) {
					// is sv, copy over business end
					j.sv = jd.sv
				}

				if (jd.canonical) {
					// label of canonical is hardcoded
					j.info.type.lst.push({ attrValue: 'canonical' })
				}

				if (jd.events) {
					// this junction has events
					for (const ek in jd.events) {
						const e = jd.events[ek]
						e.__ek = ek
						j.info.type.lst.push(e)
					}
				} else if (!jd.canonical) {
					// no splice events, and not canonical, then it's unannotated
					j.info.type.lst.push({ attrValue: infoFilter_unannotated })
				}

				// info.type is ready for this junction
				if (req.query.infoFilter && req.query.infoFilter.type) {
					// some types will be dropped
					for (const t of j.info.type.lst) {
						if (req.query.infoFilter.type[t.attrValue]) {
							// drop this event
							return
						}
					}
				}

				const passfiltersamples = filtersamples4onejunction(jd, req.query, ds, dsquery, iscustom)

				if (passfiltersamples.length == 0) {
					// this junction has no sample passing filter
					return
				}

				// this junction is acceptable

				if (
					jd.exonleft ||
					jd.exonright ||
					jd.exonleftin ||
					jd.exonrightin ||
					jd.intronleft ||
					jd.intronright ||
					jd.leftout ||
					jd.rightout
				) {
					j.ongene = {}
					if (jd.exonleft) j.ongene.exonleft = jd.exonleft
					if (jd.exonright) j.ongene.exonright = jd.exonright
					if (jd.exonleftin) j.ongene.exonleftin = jd.exonleftin
					if (jd.exonrightin) j.ongene.exonrightin = jd.exonrightin
					if (jd.intronleft) j.ongene.intronleft = jd.intronleft
					if (jd.intronright) j.ongene.intronright = jd.intronright
					if (jd.leftout) j.ongene.leftout = jd.leftout
					if (jd.rightout) j.ongene.rightout = jd.rightout
				}

				passfiltersamples.forEach(sample => {
					allsampleidxset.add(sample.i)
					maxreadcount = Math.max(maxreadcount, sample.readcount)
				})

				// for all samples passing filter
				j.sampleCount = passfiltersamples.length
				if (j.sampleCount == 1) {
					j.medianReadCount = passfiltersamples[0].readcount
				} else {
					const p = get_percentile_readcount(passfiltersamples, 0.05, 0.25, 0.5, 0.75, 0.95)
					j.medianReadCount = p[2]
					j.readcountBoxplot = {
						// for making mouseover boxplot
						percentile: p
					}
				}

				items.push(j)
			})

			const errout = []
			ps.stderr.on('data', i => errout.push(i))
			ps.on('close', code => {
				const e = errout.join('')
				if (e && !tabixnoterror(e)) {
					reject(e)
					return
				}
				resolve(items)
			})
		})
		tasks.push(task)
	}

	return Promise.all(tasks).then(data => {
		const junctions = []
		// junctions from all regions, return to client
		// for .sv, need to remove duplicate
		const svSet = new Set() // key: chr1.pos.chr2.pos, each sv registers two keys
		data.forEach(lst => {
			for (const j of lst) {
				if (j.sv) {
					const key = j.chr + '.' + j.start + '.' + j.sv.mate.chr + '.' + j.sv.mate.start
					if (svSet.has(key)) {
						// a sv with exact same coord has been loaded
						continue
					}
					// register this sv
					svSet.add(key)
					svSet.add(j.sv.mate.chr + '.' + j.sv.mate.start + '.' + j.chr + '.' + j.start)
				}
				junctions.push(j)
			}
		})

		const result = {
			lst: junctions,
			maxreadcount: maxreadcount,
			junctiontotalnumber: junctiontotalnumber,
			sample2client: sample2client
		}
		if (allsampleidxset.size) {
			result.samplecount = allsampleidxset.size
			if (dsquery.samples) {
				const samplenames = []
				for (const i of allsampleidxset) {
					if (dsquery.samples[i]) samplenames.push(dsquery.samples[i])
				}
				const [attributeSummary, hierarchySummary] = mds_tkquery_samplesummary(ds, dsquery, samplenames)
				if (attributeSummary) {
					// for each category, convert sampleset to count
					for (const attr of attributeSummary) {
						for (const v of attr.values) {
							v.count = v.sampleset.size
							delete v.sampleset
						}
					}
					result.attributeSummary = attributeSummary
				}
				if (hierarchySummary) {
					for (const k in hierarchySummary) {
						for (const n of hierarchySummary[k]) {
							if (n.sampleset) {
								n.count = n.sampleset.size
								delete n.sampleset
							} else {
								// root node won't have sampleset
							}
						}
					}
					result.hierarchySummary = hierarchySummary
				}
			}
		}
		res.send(result)
	})
}

function mds_tkquery_parse_permanentHierarchy(query, ds) {
	/*
	only for subtrack of mds
	a permanent restrain using one sample attribute from a hierarchy
		.hierarchyname
		.levelidx
		.valuekey

	will set cohortOnlyAttr{}, all the rest of samples are not used
	note: cohortOnlyAttr supports multiple attribute keys & multi-value for each attribute, for hierarchy-subtrack it's using just one attribute and one value

	*/
	if (!ds.cohort) return '.cohort missing from ds'
	if (!ds.cohort.hierarchies) return '.hierarchies missing from ds.cohort'
	if (!ds.cohort.hierarchies.lst) return '.hierarchies.lst[] missing from ds.cohort'
	const hierarchy = ds.cohort.hierarchies.lst.find(i => i.name == query.permanentHierarchy.hierarchyname)
	if (!hierarchy) return 'unknown hierarchy ' + query.permanentHierarchy.hierarchyname
	if (!hierarchy.levels) return '.levels[] missing in hierarchy ' + hierarchy.name
	const level = hierarchy.levels[query.permanentHierarchy.levelidx]
	if (!level) return 'level not found by array idx ' + query.permanentHierarchy.levelidx
	const key = level.k
	delete query.cohortHiddenAttr
	query.cohortOnlyAttr = {}
	query.cohortOnlyAttr[key] = {}
	query.cohortOnlyAttr[key][query.permanentHierarchy.valuekey] = 1
	// for this to work, level.k and permanentHierarchy.valuekey are now independent of hierarchy, and are annotation attributes directly associated with samples
	return null
}

function mds_tkquery_samplesummary(ds, dsquery, samples) {
	/*
	mds tk query resulted in a bunch of samples showing data in view range
	now to make cohort annotation summary for these samples, pass to client for making legend

	summarizes for:
		ds.cohort.attributes
		ds.cohort.hierarchies

	also incorporates total counts for each category of attributes/hierarchies which was summarized before

	for junction:
		only needs to count # of samples for each category

	for cnv:
		need to report two number of samples: gain & loss
		but the input is the union of gain/loss samples, no identification of gain/loss
		in that case, need to report the actual list of sample names for each category, but rather just the number
		so that later can use that list to get gain/loss number for each category

	thus, will report sample sets for each category

	returned data:
		attributeSummary [ attr ]
			.key
			.label
			.values [ value ]
				.name
				.label, color, desc (depends on ds config)
				.sampleset  Set
				.totalCount

		hierarchySummary {}
			k: hierarchy.name
			v: [ node ]
				.id
				.name
				.label
				.depth
				.isleaf
				.sampleset  Set
				.totalCount
			root node is useless, it's depth=0 and won't have sampleset

	*/

	if (!ds.cohort || !ds.cohort.annotation || samples.length == 0) return [null, null]

	const samplelst = [] // list of sample annotations retrieved from ds.cohort.annotation
	for (const n of samples) {
		const a = ds.cohort.annotation[n]
		if (!a) {
			// the sample is unannotated, don't deal with it for now
			continue
		}
		samplelst.push(a)
	}
	if (samplelst.length == 0) {
		return [null, null]
	}

	let attributeSummary
	let hierarchySummary

	if (ds.cohort.attributes) {
		attributeSummary = []
		for (const attr of ds.cohort.attributes.lst) {
			// to push to result[]
			const attr2 = {
				label: attr.label,
				key: attr.key
			}

			if (attr.isNumeric) {
				attr2.isNumeric = true
				/*
				TODO numeric
				*/
				continue
			}

			const categories = new Map()
			let samplecount_noannotation = 0

			for (const anno of samplelst) {
				const value = anno[attr.key]

				// categorical
				if (value == undefined) {
					samplecount_noannotation++
					continue
				}
				if (!categories.has(value)) {
					categories.set(value, new Set())
				}
				categories.get(value).add(anno[ds.cohort.samplenamekey])
			}
			const lst = [...categories]

			if (samplecount_noannotation) {
				lst.push([infoFilter_unannotated, samplecount_noannotation])
			}

			lst.sort((i, j) => j[1] - i[1])

			attr2.values = []
			for (const [name, sampleset] of lst) {
				const value = {
					name: name,
					sampleset: sampleset
				}
				if (attr.values && attr.values[name]) {
					// pass over attr about this value, from ds object
					for (const k in attr.values[name]) {
						value[k] = attr.values[name][k]
					}
				}
				if (dsquery.attributeSummary) {
					if (dsquery.attributeSummary[attr.key] && dsquery.attributeSummary[attr.key][name]) {
						value.totalCount = dsquery.attributeSummary[attr.key][name]
					}
				}
				attr2.values.push(value)
			}
			attributeSummary.push(attr2)
		}
	}
	if (ds.cohort.hierarchies) {
		hierarchySummary = {}
		for (const hierarchy of ds.cohort.hierarchies.lst) {
			const root = d3stratify()(stratinput(samplelst, hierarchy.levels))
			root.sum(i => i.value)
			const nodes = []
			root.eachBefore(i => {
				const n2 = {
					id: i.data.id,
					name: i.data.name,
					label: i.data.full,
					depth: i.depth
				}
				if (i.data.lst) {
					// graciously provided by stratinput, not available for root node
					n2.sampleset = new Set()
					for (const sample of i.data.lst) {
						n2.sampleset.add(sample[ds.cohort.samplenamekey])
					}
				}
				if (!i.children) {
					n2.isleaf = 1
				}
				if (dsquery.hierarchySummary && dsquery.hierarchySummary[hierarchy.name]) {
					n2.totalCount = dsquery.hierarchySummary[hierarchy.name][i.id]
				}
				nodes.push(n2)
			})
			hierarchySummary[hierarchy.name] = nodes
		}
	}
	return [attributeSummary, hierarchySummary]
}

function filtersamples4onejunction(jd, reqquery, ds, dsquery, iscustom) {
	/*
	jd:
		.events{}
		.samples[]

	for one mds junction, get its samples passing filters
	- sample annotation
	- event percentage cutoff

	for each sample, append .anno if it has annotation
	*/
	const passfiltersamples = [] // for this junction, all samples passing filters

	for (const sample of jd.samples) {
		if (!Number.isFinite(sample.readcount)) {
			// should not happen
			continue
		}

		sample.readcount = Math.floor(sample.readcount) // round

		if (sample.readcount <= 0) {
			continue
		}

		if (reqquery.readcountCutoff && sample.readcount < reqquery.readcountCutoff) {
			continue
		}

		if (dsquery.samples && ds.cohort && ds.cohort.annotation) {
			const samplename = dsquery.samples[sample.i]
			if (!samplename) {
				// has no valid sample name??
				continue
			}
			const anno = ds.cohort.annotation[samplename]
			sample.anno = anno // attach it for use by handle_mdsjunction_singlejunction

			if (reqquery.cohortOnlyAttr && ds.cohort && ds.cohort.annotation) {
				/*
				from subtrack, will only use samples for one attribute (from hierarchies)
				cannot refer ds.cohort.attributes
				*/
				if (!anno) {
					continue
				}
				let keep = false // if match with any in cohortOnlyAttr, will keep the sample
				for (const attrkey in reqquery.cohortOnlyAttr) {
					const value = anno[attrkey]
					if (value && reqquery.cohortOnlyAttr[attrkey][value]) {
						keep = true
						break
					}
				}
				if (!keep) {
					continue
				}
			}

			if (reqquery.cohortHiddenAttr && ds.cohort && ds.cohort.annotation && ds.cohort.attributes) {
				// applying sample annotation filtering

				if (!anno) {
					// this sample has no annotation at all, since it's doing filtering, will drop it
					continue
				}

				let hidden = false

				for (const attrkey in reqquery.cohortHiddenAttr) {
					// this attribute in registry, so to be able to tell if it's numeric
					const attr = ds.cohort.attributes.lst.find(i => i.key == attrkey)

					if (attr.isNumeric) {
						//continue
					}

					// categorical
					const value = anno[attrkey]
					if (value) {
						// this sample has annotation for this attrkey
						if (reqquery.cohortHiddenAttr[attrkey][value]) {
							hidden = true
							break
						}
					} else {
						// this sample has no value for attrkey
						if (reqquery.cohortHiddenAttr[attrkey][infoFilter_unannotated]) {
							// to drop unannotated ones
							hidden = true
							break
						}
					}
				}
				if (hidden) {
					// this sample has a hidden value for an attribute, skip
					continue
				}
			}
		}

		if (sample.events && reqquery.spliceEventPercentage) {
			// this sample has events and told to apply event percentage filter, see if event type matches
			let hidden = false
			for (const ek in sample.events) {
				// use eventkey to check with jd.events
				if (!jd.events[ek]) continue
				const eventtype = jd.events[ek].attrValue
				const cutoff = reqquery.spliceEventPercentage[eventtype]
				if (!cutoff) {
					// this type of event is not under filtering
					continue
				}
				const samplepercentage = sample.events[ek].percentage
				if (samplepercentage == undefined) continue
				if (cutoff.side == '>') {
					if (samplepercentage <= cutoff.value) {
						hidden = true
						break
					}
				} else {
					if (samplepercentage >= cutoff.value) {
						hidden = true
						break
					}
				}
			}
			if (hidden) {
				// this sample has an event not passing percentage cutoff
				continue
			}
		}
		passfiltersamples.push(sample)
	}
	return passfiltersamples
}

function handle_mdsjunction_singlejunction(req, res, ds, dsquery) {
	// get detailed infomation for one junction
	const j = req.query.junction

	new Promise((resolve, reject) => {
		if (!j.chr || !Number.isInteger(j.start) || !Number.isInteger(j.stop)) {
			return reject({ message: 'incomplete/invalid info about querying junction' })
		}
		let usedir = dsquery.usedir || ''
		const ps = spawn(
			tabix,
			[
				dsquery.file ? path.join(serverconfig.tpmasterdir, dsquery.file) : dsquery.url,
				j.chr + ':' + j.start + '-' + j.stop
			],
			{ cwd: usedir }
		)
		const rl = readline.createInterface({
			input: ps.stdout
		})
		let jd
		rl.on('line', line => {
			const l = line.split('\t')
			const start = Number.parseInt(l[1])
			const stop = Number.parseInt(l[2])
			if (start != j.start || stop != j.stop) return
			jd = JSON.parse(l[5])
		})
		ps.on('close', () => {
			if (!jd) return reject({ message: 'junction not found' })
			resolve(jd)
		})
	})
		.then(jd => {
			const samples = filtersamples4onejunction(jd, req.query, ds, dsquery) // TODO iscustom
			if (samples.length == 0) throw { message: 'no sample passing filters' }

			// test test
			for (const s of samples) {
				console.log(dsquery.samples[s.i], s.readcount)
			}

			const report = {}
			if (!dsquery.singlejunctionsummary) throw { message: 'singlejunctionsummary missing' }
			if (dsquery.singlejunctionsummary.readcountboxplotpercohort) {
				report.readcountboxplotpercohort = []

				for (const grp of dsquery.singlejunctionsummary.readcountboxplotpercohort.groups) {
					const value2sample = new Map()
					for (const sample of samples) {
						if (!sample.anno) {
							// no annotation for this sample (appended by filtersamples4onejunction)
							continue
						}
						// categorical attributes only
						const attrvalue = sample.anno[grp.key]
						if (attrvalue == undefined) continue
						if (!value2sample.has(attrvalue)) {
							value2sample.set(attrvalue, [])
						}
						value2sample.get(attrvalue).push(sample)
					}
					if (value2sample.size == 0) {
						// no value for this group
						continue
					}
					const lst = [...value2sample].sort((i, j) => j[1].length - i[1].length)
					const boxplots = []
					for (const [attrvalue, thissamplelst] of lst) {
						let minv = thissamplelst[0].readcount
						let maxv = minv
						thissamplelst.forEach(s => {
							minv = Math.min(minv, s.readcount)
							maxv = Math.max(maxv, s.readcount)
						})

						const p = get_percentile_readcount(thissamplelst, 0.05, 0.25, 0.5, 0.75, 0.95)
						boxplots.push({
							label: attrvalue,
							samplecount: thissamplelst.length,
							percentile: { p05: p[0], p25: p[1], p50: p[2], p75: p[3], p95: p[4] },
							minvalue: minv,
							maxvalue: maxv
						})
					}
					report.readcountboxplotpercohort.push({
						label: grp.label,
						boxplots: boxplots
					})
				}
			}

			res.send(report)
		})
		.catch(err => {
			res.send({ error: err.message })
			if (err.stack) {
				// debug
				console.error(err.stack)
			}
		})
}

function handle_mdsjunction_AreadcountbyB(reqquery, res, ds, dsquery) {
	/* get median read count for A junctions by the same set of samples of junction B

	A & B share chr, get max start/stop range to make 1 single query

	*/
	let start = reqquery.junctionB.start
	let stop = reqquery.junctionB.stop
	reqquery.junctionAposlst.forEach(i => {
		// [start, stop]
		start = Math.min(start, i[0])
		stop = Math.max(stop, i[1])
	})

	new Promise((resolve, reject) => {
		let usedir = dsquery.usedir || ''
		const ps = spawn(
			tabix,
			[
				dsquery.file ? path.join(serverconfig.tpmasterdir, dsquery.file) : dsquery.url,
				reqquery.junctionB.chr + ':' + start + '-' + stop
			],
			{ cwd: usedir }
		)
		const rl = readline.createInterface({
			input: ps.stdout
		})
		let jB
		let jAlst = []
		rl.on('line', line => {
			const l = line.split('\t')
			const start = Number.parseInt(l[1])
			const stop = Number.parseInt(l[2])
			if (start == reqquery.junctionB.start && stop == reqquery.junctionB.stop) {
				jB = JSON.parse(l[5])
			} else {
				for (const [a, b] of reqquery.junctionAposlst) {
					if (a == start && b == stop) {
						const j = JSON.parse(l[5])
						j.start = start
						j.stop = stop
						jAlst.push(j)
						break
					}
				}
			}
		})
		ps.on('close', () => {
			if (!jB) reject({ message: 'jB not found' })
			if (jAlst.length == 0) reject({ message: 'none of jA is found' })
			resolve([jB, jAlst])
		})
	})
		.then(([jB, jAlst]) => {
			const jBsamples = filtersamples4onejunction(jB, reqquery, ds, dsquery) // TODO iscustom
			if (jBsamples.length == 0) throw { message: 'no sample passing filters' }

			const bidxset = new Set()
			jBsamples.forEach(s => bidxset.add(s.i))

			const result = []
			for (const jA of jAlst) {
				/*
			.start
			.stop
			.samples[]
			*/

				const jAsamples = []
				// samples for this A junction passing filter
				// should generally match with jBsamples, but still could be dropped by read count cutoff
				for (const sample of jA.samples) {
					if (!bidxset.has(sample.i)) {
						// this sample from junction A does not show in junction B samples
						continue
					}
					if (reqquery.readcountCutoff && sample.readcount < reqquery.readcountCutoff) {
						continue
					}
					jAsamples.push(sample)
				}
				result.push({
					start: jA.start,
					stop: jA.stop,
					v: Math.floor(get_percentile_readcount(jAsamples, 0.5))
				})
			}

			res.send({ lst: result })
		})
		.catch(err => {
			res.send({ error: err.message })
			if (err.stack) {
				// debug
				console.error(err.stack)
			}
		})
}

async function handle_mdssamplescatterplot(req, res) {
	log(req)
	try {
		const gn = genomes[req.query.genome]
		if (!gn) throw 'invalid genome'
		const ds = gn.datasets[req.query.dslabel]
		if (!ds) throw 'invalid dataset'
		if (!ds.cohort) throw 'no cohort for dataset'
		if (!ds.cohort.annotation) throw 'cohort.annotation missing for dataset'
		const sp = ds.cohort.scatterplot
		if (!sp) throw 'scatterplot not supported for this dataset'

		const dots = []
		for (const sample in ds.cohort.annotation) {
			const anno = ds.cohort.annotation[sample]
			if (req.query.subsetkey) {
				if (anno[req.query.subsetkey] != req.query.subsetvalue) continue
			}
			const x = anno[sp.x.attribute]
			if (!Number.isFinite(x)) continue
			const y = anno[sp.y.attribute]
			if (!Number.isFinite(y)) continue
			dots.push({
				sample,
				x,
				y,
				s: anno
			})
		}
		res.send({
			colorbyattributes: sp.colorbyattributes, // optional
			colorbygeneexpression: sp.colorbygeneexpression, // optional
			querykey: sp.querykey,
			dots: dots,
			// optional, quick fix for showing additional tracks when launching single sample view by clicking a dot
			tracks: sp.tracks
		})
	} catch (e) {
		if (e.stack) console.error(e.stack)
		res.send({ error: e.message || e })
	}
}

function handle_mdssamplesignature(req, res) {
	if (reqbodyisinvalidjson(req, res)) return
	try {
		const q = req.query
		if (!q.sample) throw '.sample missing'
		const gn = genomes[q.genome]
		if (!gn) throw 'invalid genome'
		const ds = gn.datasets[q.dslabel]
		if (!ds) throw 'invalid dataset'
		if (!ds.cohort) throw 'no cohort for dataset'
		if (!ds.cohort.mutation_signature) throw 'no mutation_signature for cohort'
		const lst = []
		for (const k in ds.cohort.mutation_signature.sets) {
			const s = ds.cohort.mutation_signature.sets[k]
			if (!s.samples) continue
			const v = s.samples.map.get(q.sample)
			if (!v) continue
			const l = []
			for (const x in s.signatures) {
				if (v[x]) {
					l.push({ k: x, v: v[x] })
				}
			}
			if (l.length) {
				lst.push({
					key: k,
					valuename: s.samples.valuename,
					annotation: l.sort((i, j) => j.v - i.v)
				})
			}
		}
		res.send({ lst: lst })
	} catch (err) {
		if (err.stack) console.error(err.stack)
		res.send({ error: err.message || err })
	}
}

async function handle_mdssurvivalplot(req, res) {
	if (reqbodyisinvalidjson(req, res)) return
	try {
		const q = req.query
		const gn = genomes[q.genome]
		if (!gn) throw 'invalid genome'
		const ds = gn.datasets[q.dslabel]
		if (!ds) throw 'invalid dataset'
		if (!ds.cohort) throw 'no cohort for dataset'
		if (!ds.cohort.annotation) throw 'cohort.annotation missing for dataset'

		const sp = ds.cohort.survivalplot
		if (!sp) throw 'survivalplot not supported for this dataset'
		if (!sp.plots) throw '.plots{} missing'

		if (req.query.init) {
			res.send(sp.init)
			return
		}

		// make plot

		if (!q.type) throw '.type missing'
		const plottype = sp.plots[q.type]
		if (!plottype) throw 'unknown plot type: ' + q.type

		const samples = handle_mdssurvivalplot_getfullsamples(q, ds, plottype)

		const samplesets = await handle_mdssurvivalplot_dividesamples(samples, q, ds, samples)

		let pvalue
		if (samplesets.length > 1) {
			pvalue = await handle_mdssurvivalplot_pvalue(samplesets)
		}

		await handle_mdssurvivalplot_pvalue_may4eachmutatedset(q, samplesets)
		await handle_mdssurvivalplot_pvalue_may4expquartile(q, samplesets)

		for (const s of samplesets) {
			handle_mdssurvivalplot_plot(s)
			delete s.lst
		}

		const result = { samplesets, pvalue }

		if (q.samplerule.set && q.samplerule.set.mutation) {
			result.count_snvindel = q.samplerule.set.samples_snvindel.size
			result.count_cnv = q.samplerule.set.samples_cnv.size
			result.count_loh = q.samplerule.set.samples_loh.size
			result.count_sv = q.samplerule.set.samples_sv.size
			result.count_fusion = q.samplerule.set.samples_fusion.size
			result.count_itd = q.samplerule.set.samples_itd.size
		}
		res.send(result)
	} catch (err) {
		if (err.stack) console.error(err.stack)
		res.send({ error: err.message || err })
	}
}

async function handle_mdssurvivalplot_pvalue(samplesets) {
	/* [ each_set ]
.lst[]
	.serialtime
	.censored
*/
	const lines = ['futime\tfustat\trx']
	for (const [i, set] of samplesets.entries()) {
		for (const v of set.lst) {
			lines.push(v.serialtime + '\t' + v.censored + '\t' + i)
		}
	}
	const datafile = await handle_mdssurvivalplot_pvalue_write1(lines)
	const { scriptfile, outfile } = await handle_mdssurvivalplot_pvalue_write2(datafile)
	await handle_mdssurvivalplot_pvalue_test(scriptfile)
	const p = handle_mdssurvivalplot_pvalue_read(outfile)
	fs.unlink(datafile, () => {})
	fs.unlink(scriptfile, () => {})
	fs.unlink(outfile, () => {})
	return p
}

async function handle_mdssurvivalplot_pvalue_may4eachmutatedset(q, samplesets) {
	if (!q.samplerule.mutated_sets) return
	const nomut_set = samplesets.find(i => i.is_notmutated)
	if (!nomut_set) return
	for (const s of samplesets) {
		if (s.is_notmutated) continue
		// is a not mutated set
		const pvalue = await handle_mdssurvivalplot_pvalue([s, nomut_set])
		s.pvalue = pvalue
	}
}
async function handle_mdssurvivalplot_pvalue_may4expquartile(q, samplesets) {
	if (!q.samplerule.set) return // possible when using "mutated_sets"
	if (!q.samplerule.set.geneexpression) return // hardcoded for gene exp
	if (!q.samplerule.set.byquartile) return // hardcoded for quartile
	if (samplesets.length != 4) return // should throw
	if (q.samplerule.set.against1st) {
		for (let i = 1; i < 4; i++) {
			samplesets[i].pvalue = await handle_mdssurvivalplot_pvalue([samplesets[0], samplesets[i]])
		}
		return
	}
	if (q.samplerule.set.against4th) {
		for (let i = 0; i < 3; i++) {
			samplesets[i].pvalue = await handle_mdssurvivalplot_pvalue([samplesets[i], samplesets[3]])
		}
		return
	}
}

function handle_mdssurvivalplot_pvalue_read(file) {
	return new Promise((resolve, reject) => {
		fs.readFile(file, { encoding: 'utf8' }, (err, data) => {
			if (err) reject('cannot read result')
			const lst = data.trim().split('\n')
			const v = lst[lst.length - 1].split('p= ')[1]
			resolve(Number.parseFloat(v))
		})
	})
}

function handle_mdssurvivalplot_pvalue_write1(lines) {
	const file = path.join(serverconfig.cachedir, Math.random().toString()) + '.tab'
	return new Promise((resolve, reject) => {
		fs.writeFile(file, lines.join('\n') + '\n', err => {
			if (err) reject('cannot write')
			resolve(file)
		})
	})
}
function handle_mdssurvivalplot_pvalue_write2(datafile) {
	const scriptfile = path.join(serverconfig.cachedir, Math.random().toString()) + '.R'
	const outfile = scriptfile + '.out'
	const lines = [
		'dat<-read.table("' + datafile + '",sep="\t",header=TRUE)',
		'library(survival)',
		'sink("' + outfile + '")',
		'print(survdiff(Surv(futime, fustat) ~ rx,data=dat))',
		'sink()'
	]

	return new Promise((resolve, reject) => {
		fs.writeFile(scriptfile, lines.join('\n') + '\n', err => {
			if (err) reject('cannot write')
			resolve({ scriptfile: scriptfile, outfile: outfile })
		})
	})
}
function handle_mdssurvivalplot_pvalue_test(scriptfile) {
	return new Promise((resolve, reject) => {
		const sp = spawn('Rscript', [scriptfile])
		sp.on('close', () => {
			resolve()
		})
		sp.on('error', e => {
			reject('cannot run survdiff')
		})
	})
}

async function handle_mdssurvivalplot_dividesamples(samples, q, ds, plottype) {
	/*
samples[]
	.name
	.o{}
q{}
ds{}
	.queries{}
plottype{}
*/
	if (q.samplerule.mutated_sets) {
		/*
		each set
		{
			name:STR,
			samplenames:[ name ]
		}
		*/
		const nomutsampleset = new Set(samples.map(i => i.name)) // to remove mutated samples leaving only unmutated ones
		const sets = q.samplerule.mutated_sets.reduce((sets, s) => {
			const thisset = new Set(s.samplenames)
			s.lst = samples.filter(i => thisset.has(i.name))
			for (const n of s.samplenames) nomutsampleset.delete(n)
			delete s.samplenames
			sets.push(s)
			return sets
		}, [])
		sets.push({
			name: 'No mutation (n=' + nomutsampleset.size + ')',
			lst: samples.filter(i => nomutsampleset.has(i.name)),
			// to be compared against by each other mutated sets to get p-value for each set
			is_notmutated: true
		})
		return sets
	}

	const st = q.samplerule.set
	if (!st) {
		// no rule for sets -- make one
		return [{ name: 'All', lst: samples }]
	}
	if (st.geneexpression) {
		if (!st.gene) throw '.gene missing from samplerule.set'
		if (!st.chr) throw '.chr missing from samplerule.set'
		if (!Number.isInteger(st.start)) throw '.start not integer from samplerule.set'
		if (!Number.isInteger(st.stop)) throw '.start not integer from samplerule.set'
		if (st.bymedian) {
			return await handle_mdssurvivalplot_dividesamples_genevaluepercentilecutoff(samples, q, ds, plottype)
		}
		if (st.byquartile) {
			return await handle_mdssurvivalplot_dividesamples_genevaluequartile(samples, q, ds, plottype)
		}
	}
	if (st.mutation) {
		if (!st.chr) throw '.chr missing from samplerule.set'
		if (!Number.isInteger(st.start)) throw '.start not integer from samplerule.set'
		if (!Number.isInteger(st.stop)) throw '.start not integer from samplerule.set'
		return await handle_mdssurvivalplot_dividesamples_mutationanyornone(samples, q, ds, plottype)
	}
	throw 'unknown rule for samplerule.set{}'
}

async function handle_mdssurvivalplot_dividesamples_mutationanyornone(samples, q, ds) {
	const st = q.samplerule.set

	// init sample count for each type of mutation, to be returned to client
	st.samples_snvindel = new Set()
	st.samples_cnv = new Set()
	st.samples_loh = new Set()
	st.samples_sv = new Set()
	st.samples_fusion = new Set()
	st.samples_itd = new Set()

	if (st.cnv && !st.snvindel && !st.loh && !st.sv && !st.fusion && !st.itd) {
		// just cnv, samples will be divided into loss/gain/nochange
		const [gainset, lossset] = await handle_mdssurvivalplot_getmutatedsamples(samples, q, ds, true)
		const samples_gain = []
		const samples_loss = []
		const samples_nomut = []
		for (const s of samples) {
			if (gainset.has(s.name)) {
				samples_gain.push(s)
			} else if (lossset.has(s.name)) {
				samples_loss.push(s)
			} else {
				samples_nomut.push(s)
			}
		}
		const returnsets = []
		if (samples_loss.length) {
			returnsets.push({
				name: 'Copy number loss (n=' + samples_loss.length + ')',
				lst: samples_loss
			})
		}
		if (samples_gain.length) {
			returnsets.push({
				name: 'Copy number gain (n=' + samples_gain.length + ')',
				lst: samples_gain
			})
		}
		if (samples_nomut.length) {
			returnsets.push({
				name: 'No copy number variation (n=' + samples_nomut.length + ')',
				lst: samples_nomut
			})
		}
		return returnsets
	}

	// otherwise, divide to 2 groups: has mut/no mut
	const samples_withmut = await handle_mdssurvivalplot_getmutatedsamples(samples, q, ds)
	const samples_nomut = []
	for (const s of samples) {
		if (!samples_withmut.find(i => i.name == s.name)) {
			samples_nomut.push(s)
		}
	}
	const returnsets = []
	if (samples_withmut.length) {
		returnsets.push({
			name: 'With mutation (n=' + samples_withmut.length + ')',
			lst: samples_withmut
		})
	}
	if (samples_nomut.length) {
		returnsets.push({
			name: 'No mutation (n=' + samples_nomut.length + ')',
			lst: samples_nomut
		})
	}
	return returnsets
}

async function handle_mdssurvivalplot_getmutatedsamples(fullsamples, q, ds, cnvonly) {
	/*
if is cnvonly, will return two groups of samples, gain and loss each
if not, will return all mutated samples
*/
	const fullsamplenameset = new Set(fullsamples.map(i => i.name))

	const st = q.samplerule.set

	let vcfquery
	let svcnvquery
	for (const k in ds.queries) {
		const v = ds.queries[k]
		if (v.type == common.tkt.mdsvcf) {
			vcfquery = v
		} else if (v.type == common.tkt.mdssvcnv) {
			svcnvquery = v
		}
	}

	const mutsamples = new Set()

	if (st.cnv || st.loh || st.sv || st.fusion || st.itd) {
		if (!svcnvquery) throw 'no svcnv found in ds.queries'

		if (cnvonly) {
			// cnv only, returns two groups for gain or loss
			return await handle_mdssurvivalplot_getmutatedsamples_querysvcnv(svcnvquery, fullsamplenameset, q, true)
		}

		// not just cnv
		const names = await handle_mdssurvivalplot_getmutatedsamples_querysvcnv(svcnvquery, fullsamplenameset, q)
		for (const n of names) {
			mutsamples.add(n)
		}
	}

	if (st.snvindel) {
		if (!vcfquery) throw 'no vcf found in ds.queries'
		for (const tk of vcfquery.tracks) {
			await handle_mdssurvivalplot_getmutatedsamples_queryvcf(vcfquery, tk, fullsamplenameset, mutsamples, q)
		}
	}

	return fullsamples.filter(i => mutsamples.has(i.name))
}

async function handle_mdssurvivalplot_getmutatedsamples_querysvcnv(tk, samplenameset, q, cnvonly) {
	/*
if not cnvonly, return set of altered sample names
if cnvonly, return two sets, for gain/loss
tk is from ds.queries{}
*/

	// more configs are here
	const st = q.samplerule.set

	const dir = tk.url ? await utils.cache_index(tk.url, tk.indexURL) : null // does km ever work on custom track?

	return new Promise((resolve, reject) => {
		const gain = new Set() // use if cnvonly
		const loss = new Set()
		const mutsamples = new Set() // use if has other types in addition to cnv

		const ps = spawn(
			tabix,
			[
				tk.file ? path.join(serverconfig.tpmasterdir, tk.file) : tk.url,
				(tk.nochr ? st.chr.replace('chr', '') : st.chr) + ':' + st.start + '-' + (st.stop + 1)
			],
			{ cwd: dir }
		)
		const rl = readline.createInterface({ input: ps.stdout })
		rl.on('line', line => {
			const l = line.split('\t')
			const start = Number.parseInt(l[1])
			const stop = Number.parseInt(l[2])
			const j = JSON.parse(l[3])

			if (!samplenameset.has(j.sample)) {
				// sample not from the full set
				return
			}

			if (j.dt == common.dtcnv) {
				if (!st.cnv) {
					// not look at cnv
					return
				}
				if (st.cnv.focalsizelimit && stop - start >= st.cnv.focalsizelimit) {
					return
				}
				if (st.cnv.valuecutoff && Math.abs(j.value) < st.cnv.valuecutoff) {
					return
				}

				if (cnvonly) {
					if (j.value > 0) {
						gain.add(j.sample)
					} else {
						loss.add(j.sample)
					}
				} else {
					mutsamples.add(j.sample)
				}

				st.samples_cnv.add(j.sample)
				return
			}
			if (j.dt == common.dtloh) {
				if (!st.loh) return
				if (st.loh.focalsizelimit && stop - start >= st.loh.focalsizelimit) return
				if (st.loh.valuecutoff && j.segmean < st.loh.valuecutoff) return
				mutsamples.add(j.sample)
				st.samples_loh.add(j.sample)
				return
			}
			if (j.dt == common.dtsv) {
				if (!st.sv) return
				mutsamples.add(j.sample)
				st.samples_sv.add(j.sample)
				return
			}
			if (j.dt == common.dtfusionrna) {
				if (!st.fusion) return
				mutsamples.add(j.sample)
				st.samples_fusion.add(j.sample)
				return
			}
			if (j.dt == common.dtitd) {
				if (!st.itd) return
				mutsamples.add(j.sample)
				st.samples_itd.add(j.sample)
				return
			}
		})

		const errout = []
		ps.stderr.on('data', i => errout.push(i))
		ps.on('close', code => {
			const e = errout.join('')
			if (e && !tabixnoterror(e)) {
				reject(e)
				return
			}
			if (cnvonly) {
				resolve([gain, loss])
			} else {
				resolve(mutsamples)
			}
		})
	})
}

async function handle_mdssurvivalplot_getmutatedsamples_queryvcf(vcfquery, tk, samplenameset, mutsamples, q) {
	/*
only return the set of mutated sample names
*/

	// more configs are here
	const st = q.samplerule.set

	const dir = tk.url ? await utils.cache_index(tk.url, tk.indexURL) : null
	return new Promise((resolve, reject) => {
		const ps = spawn(
			tabix,
			[
				tk.file ? path.join(serverconfig.tpmasterdir, tk.file) : tk.url,
				(tk.nochr ? st.chr.replace('chr', '') : st.chr) + ':' + st.start + '-' + (st.stop + 1)
			],
			{ cwd: dir }
		)
		const rl = readline.createInterface({ input: ps.stdout })
		rl.on('line', line => {
			if (tk.type == common.mdsvcftype.vcf) {
				// vcf

				const [badinfok, mlst, altinvalid] = vcf.vcfparseline(line, {
					nochr: tk.nochr,
					samples: tk.samples,
					info: vcfquery.info,
					format: tk.format
				})

				for (const m of mlst) {
					if (!m.sampledata) {
						continue
					}

					if (st.snvindel.ref) {
						// client provided specific alleles, to restrict to it
						if (m.ref != st.snvindel.ref || m.alt != st.snvindel.alt) {
							continue
						}
					}

					if (st.snvindel.hiddenclass) {
						// filtering on mclass, must set mclass for the variant
						common.vcfcopymclass(m, {})
						if (st.snvindel.hiddenclass[m.class]) {
							continue
						}
					}

					for (const s of m.sampledata) {
						if (samplenameset.has(s.sampleobj.name)) {
							mutsamples.add(s.sampleobj.name)
							st.samples_snvindel.add(s.sampleobj.name)
						}
					}
				}
			}
		})

		const errout = []
		ps.stderr.on('data', i => errout.push(i))
		ps.on('close', code => {
			const e = errout.join('')
			if (e && !tabixnoterror(e)) {
				reject(e)
				return
			}
			resolve()
		})
	})
}

async function handle_mdssurvivalplot_dividesamples_genevaluequartile(samples, q, ds, plottype) {
	const st = q.samplerule.set
	const [genenumquery, samplewithvalue] = await handle_mdssurvivalplot_dividesamples_genevalue_get(samples, q, ds)
	const i1 = Math.ceil(samplewithvalue.length * 0.25)
	const i2 = Math.ceil(samplewithvalue.length * 0.5)
	const i3 = Math.ceil(samplewithvalue.length * 0.75)
	const v1 = samplewithvalue[i1 - 1].genevalue
	const v2 = samplewithvalue[i2 - 1].genevalue
	const v3 = samplewithvalue[i3 - 1].genevalue
	return [
		{
			name: st.gene + ' ' + genenumquery.datatype + ' from 1st quartile (n=' + i1 + ', value<' + v1 + ')',
			lst: samplewithvalue.slice(0, i1),
			isfirstquartile: true
		},
		{
			name:
				st.gene +
				' ' +
				genenumquery.datatype +
				' from 2nd quartile (n=' +
				(i2 - i1) +
				', ' +
				v1 +
				'<=value<' +
				v2 +
				')',
			lst: samplewithvalue.slice(i1, i2)
		},
		{
			name:
				st.gene +
				' ' +
				genenumquery.datatype +
				' from 3rd quartile (n=' +
				(i3 - i2) +
				', ' +
				v2 +
				'<=value<' +
				v3 +
				')',
			lst: samplewithvalue.slice(i2, i3)
		},
		{
			name:
				st.gene +
				' ' +
				genenumquery.datatype +
				' from 4th quartile (n=' +
				(samplewithvalue.length - i3) +
				', value>=' +
				v3 +
				')',
			lst: samplewithvalue.slice(i3, samplewithvalue.length),
			isfourthquartile: true
		}
	]
}

async function handle_mdssurvivalplot_dividesamples_genevaluepercentilecutoff(samples, q, ds, plottype) {
	// hardcoded median
	const st = q.samplerule.set
	const [genenumquery, samplewithvalue] = await handle_mdssurvivalplot_dividesamples_genevalue_get(samples, q, ds)
	const i = Math.ceil(samplewithvalue.length / 2)
	const v = samplewithvalue[i - 1].genevalue
	return [
		{
			name: st.gene + ' ' + genenumquery.datatype + ' below median (n=' + i + ', value<' + v + ')',
			lst: samplewithvalue.slice(0, i)
		},
		{
			name:
				st.gene +
				' ' +
				genenumquery.datatype +
				' above median (n=' +
				(samplewithvalue.length - i) +
				', value>=' +
				v +
				')',
			lst: samplewithvalue.slice(i, samplewithvalue.length)
		}
	]
}

async function handle_mdssurvivalplot_dividesamples_genevalue_get(samples, q, ds) {
	if (!ds.queries) throw '.queries{} missing from ds'
	let genenumquery // gene numeric value query
	for (const k in ds.queries) {
		if (ds.queries[k].isgenenumeric) {
			genenumquery = ds.queries[k]
		}
	}
	if (!genenumquery) throw 'no gene numeric query from ds'

	const dir = genenumquery.url ? await utils.cache_index(genenumquery.url, genenumquery.indexURL) : null

	const st = q.samplerule.set

	const sample2genevalue = await mds_genenumeric_querygene(genenumquery, dir, st.chr, st.start, st.stop, st.gene)

	const samplewithvalue = []
	for (const s of samples) {
		if (sample2genevalue.has(s.name)) {
			s.genevalue = sample2genevalue.get(s.name)
			samplewithvalue.push(s)
		}
	}
	samplewithvalue.sort((a, b) => a.genevalue - b.genevalue)
	return [genenumquery, samplewithvalue]
}

async function mds_genenumeric_querygene(query, dir, chr, start, stop, gene) {
	return new Promise((resolve, reject) => {
		const ps = spawn(
			tabix,
			[query.file ? path.join(serverconfig.tpmasterdir, query.file) : query.url, chr + ':' + start + '-' + stop],
			{ cwd: dir }
		)

		const sample2genevalue = new Map()
		const rl = readline.createInterface({ input: ps.stdout })
		rl.on('line', line => {
			const j = JSON.parse(line.split('\t')[3])
			if (!j.sample || !Number.isFinite(j.value) || j.gene != gene) return
			sample2genevalue.set(j.sample, j.value)
		})
		ps.on('close', code => {
			resolve(sample2genevalue)
		})
	})
}

function handle_mdssurvivalplot_plot(s) {
	/*
	.name
	.lst[]
		{name, serialtime, censored}

	hardcoded integer 0/1 value for censored
	*/
	s.lst.sort((a, b) => a.serialtime - b.serialtime)

	let thistotal = s.lst.length
	let thiscensored = []
	let y = 0
	s.steps = []
	for (const a of s.lst) {
		if (a.censored == 0) {
			thiscensored.push(a.serialtime)
			continue
		}
		// otherwise a.censored==1 has event
		const drop = ((1 - y) * 1) / (thistotal - thiscensored.length)
		s.steps.push({
			x: a.serialtime,
			y: y,
			drop: drop,
			censored: thiscensored
		})
		y += drop
		thistotal -= thiscensored.length + 1
		thiscensored = []
	}
	if (thiscensored.length > 0) {
		// censored at the end
		s.steps.push({
			x: s.lst[s.lst.length - 1].serialtime, // last time
			y: y,
			drop: 0,
			censored: thiscensored
		})
	}
}

function handle_mdssurvivalplot_getfullsamples(q, ds, plottype) {
	if (!q.samplerule) throw '.samplerule missing'
	if (!q.samplerule.full) throw '.samplerule.full missing'

	const lst1 = []

	if (q.samplerule.full.byattr) {
		const key = q.samplerule.full.key
		if (!key) throw 'key missing from samplerule.full{}'
		const value = q.samplerule.full.value
		if (value == undefined) throw 'value missing from samplerule.full{}'
		for (const sn in ds.cohort.annotation) {
			const o = ds.cohort.annotation[sn]
			if (o[key] == value) {
				lst1.push({
					name: sn,
					o: o
				})
			}
		}
	} else if (q.samplerule.full.useall) {
		for (const sn in ds.cohort.annotation) {
			const o = ds.cohort.annotation[sn]
			lst1.push({
				name: sn,
				o: o
			})
		}
	} else {
		throw 'unknown rule for samplerule.full'
	}

	const lst2 = [] // with valid serialtimekey
	for (const s of lst1) {
		if (Number.isFinite(s.o[plottype.serialtimekey])) {
			s.serialtime = s.o[plottype.serialtimekey]
			s.censored = s.o[plottype.iscensoredkey]
			lst2.push(s)
		}
	}
	if (lst2.length == 0) throw 'no samples found for full set'
	return lst2
}

async function handle_isoformbycoord(req, res) {
	if (reqbodyisinvalidjson(req, res)) return
	try {
		const genome = genomes[req.query.genome]
		if (!genome) throw 'invalid genome'
		if (!req.query.chr) throw 'chr missing'
		if (!Number.isInteger(req.query.pos)) throw 'pos must be positive integer'

		const isoforms = await isoformbycoord_tabix(genome, req.query.chr, req.query.pos)
		for (const i of isoforms) {
			const tmp = genome.genedb.getjsonbyisoform.get(i.isoform)
			if (tmp) {
				i.name = JSON.parse(tmp.genemodel).name
				i.isdefault = tmp.isdefault
			}
		}
		res.send({ lst: isoforms })
	} catch (e) {
		if (e.stack) console.log(e.stack)
		res.send({ error: e.message || e })
	}
}

function isoformbycoord_tabix(genome, chr, pos) {
	return new Promise((resolve, reject) => {
		const genetk = genome.tracks.find(i => i.__isgene)
		if (!genetk) reject('no gene track')
		const ps = spawn('tabix', [path.join(serverconfig.tpmasterdir, genetk.file), chr + ':' + pos + '-' + pos])
		const out = [],
			out2 = []
		ps.stdout.on('data', d => out.push(d))
		ps.stderr.on('data', d => out2.push(d))
		ps.on('close', () => {
			const err = out2.join('')
			if (err && !tabixnoterror(err)) reject(err)
			const str = out.join('').trim()
			if (!str) resolve([])
			const lst = []
			for (const line of str.split('\n')) {
				const js = line.split('\t')[3]
				if (js) {
					const j = JSON.parse(js)
					if (j.isoform) lst.push({ isoform: j.isoform })
				}
			}
			resolve(lst)
		})
	})
}

/***********  __smat ************/

function handle_samplematrix(req, res) {
	/*
	fetch values for a set of features, over a common set of samples
	for singular feature, the datatype & file format is implied
	for feature spanning multiple data types, will need to query multiple data tracks, each track must be identified with "type" e.g. common.tkt.mdsvcf
	*/

	if (reqbodyisinvalidjson(req, res)) return

	Promise.resolve()
		.then(() => {
			const gn = genomes[req.query.genome]
			if (!gn) throw 'invalid genome'

			let ds

			if (req.query.iscustom) {
				if (!req.query.querykey2tracks) throw 'querykey2tracks{} missing for custom dataset'
				ds = { queries: {} }

				for (const key in req.query.querykey2tracks) {
					// the key is arbitrary

					const tk = req.query.querykey2tracks[key]

					if (!tk.type) throw 'missing "type" for a data track'

					if (tk.type == common.tkt.mdsvcf) {
						// special treatment for vcf
						const tk = req.query.querykey2tracks[key]
						tk.type = common.mdsvcftype.vcf

						ds.queries[key] = {
							type: common.tkt.mdsvcf,
							info: tk.info, // comply with multi-vcf track mds
							tracks: [tk]
						}
					} else if (tk.type == common.tkt.mdssvcnv) {
						ds.queries[key] = tk
					} else if (tk.type == common.tkt.mdsexpressionrank) {
						// gene expression is currently not used in custom track...
						ds.queries[key] = tk
					} else {
						throw 'unknown type of data track: ' + tk.type
					}
				}
			} else {
				// from native dataset
				if (!gn.datasets) throw 'genome is not equipped with datasets'
				if (!req.query.dslabel) throw 'dslabel missing'
				ds = gn.datasets[req.query.dslabel]
				if (!ds) throw 'invalid dslabel'
				if (!ds.queries) throw 'dataset is not equipped with queries'
			}

			/*
		impose certain limits to restrict to a set of samples
		merge different logic of limits into one set
		share in different feature processor
		*/
			let usesampleset

			if (req.query.sampleset) {
				usesampleset = new Set(req.query.sampleset)
			} else if (req.query.limitsamplebyeitherannotation) {
				// must be official ds
				if (!ds.cohort) throw 'limitsamplebyeitherannotation but no cohort in ds'
				if (!ds.cohort.annotation) throw 'limitsamplebyeitherannotation but no cohort.annotation in ds'
				usesampleset = new Set()
				for (const n in ds.cohort.annotation) {
					const a = ds.cohort.annotation[n]
					for (const filter of req.query.limitsamplebyeitherannotation) {
						if (a[filter.key] == filter.value) {
							// use this sample
							usesampleset.add(n)
							break
						}
					}
				}
			}

			const tasks = []

			for (const feature of req.query.features) {
				let dsquery
				let dsquerylst = []

				// allow other types of query, e.g. checking sample metadata

				if (feature.querykey) {
					if (!ds.queries) throw 'using querykey for a feature but no ds.queries'
					dsquery = ds.queries[feature.querykey]
					if (!dsquery) throw 'unknown dsquery by key ' + feature.querykey
				} else if (feature.querykeylst) {
					if (!ds.queries) throw 'using querykeylst for a feature but no ds.queries'
					for (const k of feature.querykeylst) {
						const q = ds.queries[k]
						if (!q) throw 'unknown key "' + k + '" from querykeylst'
						dsquerylst.push(q)
					}
					if (dsquerylst.length == 0) throw 'no valid keys in querykeylst'
				} else if (feature.issampleattribute) {
					// no need for dsquery
				} else {
					throw 'unknown way to query a feature'
				}

				// types of feature/query

				if (feature.isgenevalue) {
					const [err, q] = samplematrix_task_isgenevalue(feature, ds, dsquery, usesampleset)
					if (err) throw 'error with isgenevalue: ' + err
					tasks.push(q)
				} else if (feature.iscnv) {
					const [err, q] = samplematrix_task_iscnv(feature, ds, dsquery, usesampleset)
					if (err) throw 'error with iscnv: ' + err
					tasks.push(q)
				} else if (feature.isloh) {
					const [err, q] = samplematrix_task_isloh(feature, ds, dsquery, usesampleset)
					if (err) throw 'error with isloh: ' + err
					tasks.push(q)
				} else if (feature.isvcf) {
					const [err, q] = samplematrix_task_isvcf(feature, ds, dsquery, usesampleset)
					if (err) throw 'error with isvcf: ' + err
					tasks.push(q)
				} else if (feature.isitd) {
					const [err, q] = samplematrix_task_isitd(feature, ds, dsquery, usesampleset)
					if (err) throw 'error with isitd: ' + err
					tasks.push(q)
				} else if (feature.issvfusion) {
					const [err, q] = samplematrix_task_issvfusion(feature, ds, dsquery, usesampleset)
					if (err) throw 'error with issvfusion: ' + err
					tasks.push(q)
				} else if (feature.issvcnv) {
					const [err, q] = samplematrix_task_issvcnv(feature, ds, dsquery, usesampleset)
					if (err) throw 'error with issvcnv: ' + err
					tasks.push(q)
				} else if (feature.ismutation) {
					const [err, q] = samplematrix_task_ismutation(feature, ds, dsquerylst, usesampleset)
					if (err) throw 'error with ismutation: ' + err
					tasks.push(q)
				} else if (feature.issampleattribute) {
					const [err, q] = samplematrix_task_issampleattribute(feature, ds, usesampleset)
					if (err) throw 'error with issampleattribute: ' + err
					tasks.push(q)
				} else {
					throw 'unknown type of feature'
				}
			}

			return Promise.all(tasks)
		})
		.then(results => {
			res.send({ results: results })
		})
		.catch(err => {
			res.send({ error: typeof err == 'string' ? err : err.message })
			if (err.stack) console.error(err.stack)
		})
}

function samplematrix_task_issampleattribute(feature, ds, usesampleset) {
	if (!feature.key) return ['.key missing']
	if (!ds.cohort) return ['ds.cohort missing']
	if (!ds.cohort.annotation) return ['ds.cohort.annotation missing']
	const q = Promise.resolve().then(() => {
		const items = []
		for (const samplename in ds.cohort.annotation) {
			if (usesampleset && !usesampleset.has(samplename)) continue

			const anno = ds.cohort.annotation[samplename]

			const value = anno[feature.key]
			if (value == undefined) continue
			items.push({
				sample: samplename,
				value: value
			})
		}
		return {
			id: feature.id,
			items: items
		}
	})
	return [null, q]
}

function samplematrix_task_isgenevalue(feature, ds, dsquery, usesampleset) {
	if (!feature.genename) return ['genename missing']
	const genename = feature.genename.toLowerCase()
	if (!feature.chr) return ['chr missing']
	if (!Number.isInteger(feature.start) || !Number.isInteger(feature.stop)) return ['invalid start/stop coordinate']
	if (feature.stop - feature.start > 10000000) return ['gene feature too long (> 10Mb)']

	const q = Promise.resolve()
		.then(() => {
			if (dsquery.file) return
			return utils.cache_index(dsquery.url, dsquery.indexURL)
		})
		.then(dir => {
			return new Promise((resolve, reject) => {
				const data = []
				const ps = spawn(
					tabix,
					[
						dsquery.file ? path.join(serverconfig.tpmasterdir, dsquery.file) : dsquery.url,
						feature.chr + ':' + feature.start + '-' + feature.stop
					],
					{ cwd: dir }
				)
				const rl = readline.createInterface({
					input: ps.stdout
				})

				rl.on('line', line => {
					const l = line.split('\t')

					const j = JSON.parse(l[3])

					if (!j.gene) return
					if (j.gene.toLowerCase() != genename) return

					if (!j.sample) return
					if (usesampleset && !usesampleset.has(j.sample)) return

					data.push(j)
				})

				const errout = []
				ps.stderr.on('data', i => errout.push(i))
				ps.on('close', code => {
					const e = errout.join('')
					if (e && !tabixnoterror(e)) {
						reject(e)
						return
					}
					resolve({
						id: feature.id,
						items: data
					})
				})
			})
		})
	return [null, q]
}

function samplematrix_task_iscnv(feature, ds, dsquery, usesampleset) {
	if (!feature.chr) return ['chr missing']
	if (!Number.isInteger(feature.start) || !Number.isInteger(feature.stop)) return ['invalid start/stop coordinate']
	if (feature.stop - feature.start > 10000000) return ['look range too big (>10Mb)']
	if (feature.valuecutoff != undefined) {
		if (!Number.isFinite(feature.valuecutoff)) return ['invalid value for valuecutoff']
	}
	if (feature.focalsizelimit != undefined) {
		if (!Number.isInteger(feature.focalsizelimit)) return ['invalid value for focalsizelimit']
	}

	const q = Promise.resolve()
		.then(() => {
			if (dsquery.file) return
			return utils.cache_index(dsquery.url, dsquery.indexURL)
		})
		.then(dir => {
			return new Promise((resolve, reject) => {
				const data = []
				const ps = spawn(
					tabix,
					[
						dsquery.file ? path.join(serverconfig.tpmasterdir, dsquery.file) : dsquery.url,
						feature.chr + ':' + feature.start + '-' + feature.stop
					],
					{ cwd: dir }
				)
				const rl = readline.createInterface({
					input: ps.stdout
				})
				rl.on('line', line => {
					const l = line.split('\t')

					const j = JSON.parse(l[3])

					// loh and sv data could be present in same file
					if (j.dt != common.dtcnv) return

					if (feature.valuecutoff && Math.abs(j.value) < feature.valuecutoff) return

					j.chr = l[0]
					j.start = Number.parseInt(l[1])
					j.stop = Number.parseInt(l[2])

					if (feature.focalsizelimit && j.stop - j.start >= feature.focalsizelimit) return

					if (!j.sample) return
					if (usesampleset && !usesampleset.has(j.sample)) return

					data.push(j)
				})

				const errout = []
				ps.stderr.on('data', i => errout.push(i))
				ps.on('close', code => {
					const e = errout.join('')
					if (e && !tabixnoterror(e)) {
						reject(e)
						return
					}
					resolve({
						id: feature.id,
						items: data
					})
				})
			})
		})
	return [null, q]
}

function samplematrix_task_isloh(feature, ds, dsquery, usesampleset) {
	if (!feature.chr) return ['chr missing']
	if (!Number.isInteger(feature.start) || !Number.isInteger(feature.stop)) return ['invalid start/stop coordinate']
	if (feature.stop - feature.start > 10000000) return ['look range too big (>10Mb)']
	if (feature.valuecutoff != undefined) {
		if (!Number.isFinite(feature.valuecutoff)) return ['invalid value for valuecutoff']
	}
	if (feature.focalsizelimit != undefined) {
		if (!Number.isInteger(feature.focalsizelimit)) return ['invalid value for focalsizelimit']
	}

	const q = Promise.resolve()
		.then(() => {
			if (dsquery.file) return
			return utils.cache_index(dsquery.url, dsquery.indexURL)
		})
		.then(dir => {
			return new Promise((resolve, reject) => {
				const data = []
				const ps = spawn(
					tabix,
					[
						dsquery.file ? path.join(serverconfig.tpmasterdir, dsquery.file) : dsquery.url,
						feature.chr + ':' + feature.start + '-' + feature.stop
					],
					{ cwd: dir }
				)
				const rl = readline.createInterface({
					input: ps.stdout
				})
				rl.on('line', line => {
					const l = line.split('\t')

					const j = JSON.parse(l[3])

					if (j.dt != common.dtloh) return

					if (feature.valuecutoff && j.segmean < feature.valuecutoff) return

					j.chr = l[0]
					j.start = Number.parseInt(l[1])
					j.stop = Number.parseInt(l[2])

					if (feature.focalsizelimit && j.stop - j.start >= feature.focalsizelimit) return

					if (!j.sample) return
					if (usesampleset && !usesampleset.has(j.sample)) return

					data.push(j)
				})

				const errout = []
				ps.stderr.on('data', i => errout.push(i))
				ps.on('close', code => {
					const e = errout.join('')
					if (e && !tabixnoterror(e)) {
						reject(e)
						return
					}
					resolve({
						id: feature.id,
						items: data
					})
				})
			})
		})
	return [null, q]
}

function samplematrix_task_isitd(feature, ds, dsquery, usesampleset) {
	if (!feature.chr) return ['chr missing']
	if (!Number.isInteger(feature.start) || !Number.isInteger(feature.stop)) return ['invalid start/stop coordinate']
	if (feature.stop - feature.start > 10000000) return ['look range too big (>10Mb)']

	const q = Promise.resolve()
		.then(() => {
			if (dsquery.file) return
			return utils.cache_index(dsquery.url, dsquery.indexURL)
		})
		.then(dir => {
			return new Promise((resolve, reject) => {
				const data = []
				const ps = spawn(
					tabix,
					[
						dsquery.file ? path.join(serverconfig.tpmasterdir, dsquery.file) : dsquery.url,
						feature.chr + ':' + feature.start + '-' + feature.stop
					],
					{ cwd: dir }
				)
				const rl = readline.createInterface({
					input: ps.stdout
				})
				rl.on('line', line => {
					const l = line.split('\t')

					const j = JSON.parse(l[3])

					if (j.dt != common.dtitd) return

					j.chr = l[0]
					j.start = Number.parseInt(l[1])
					j.stop = Number.parseInt(l[2])

					if (!j.sample) return
					if (usesampleset && !usesampleset.has(j.sample)) return

					data.push(j)
				})

				const errout = []
				ps.stderr.on('data', i => errout.push(i))
				ps.on('close', code => {
					const e = errout.join('')
					if (e && !tabixnoterror(e)) {
						reject(e)
						return
					}
					resolve({
						id: feature.id,
						items: data
					})
				})
			})
		})
	return [null, q]
}

function samplematrix_task_issvfusion(feature, ds, dsquery, usesampleset) {
	if (!feature.chr) return ['chr missing']
	if (!Number.isInteger(feature.start) || !Number.isInteger(feature.stop)) return ['invalid start/stop coordinate']
	if (feature.stop - feature.start > 10000000) return ['look range too big (>10Mb)']

	const q = Promise.resolve()
		.then(() => {
			if (dsquery.file) return
			return utils.cache_index(dsquery.url, dsquery.indexURL)
		})
		.then(dir => {
			return new Promise((resolve, reject) => {
				const data = []
				const ps = spawn(
					tabix,
					[
						dsquery.file ? path.join(serverconfig.tpmasterdir, dsquery.file) : dsquery.url,
						feature.chr + ':' + feature.start + '-' + feature.stop
					],
					{ cwd: dir }
				)
				const rl = readline.createInterface({
					input: ps.stdout
				})
				rl.on('line', line => {
					const l = line.split('\t')

					const j = JSON.parse(l[3])

					if (j.dt != common.dtsv && j.dt != common.dtfusionrna) return

					if (!j.sample) return
					if (usesampleset && !usesampleset.has(j.sample)) return

					j._chr = l[0]
					j._pos = Number.parseInt(l[1])
					if (j.chrA) {
						j.chrB = j._chr
						j.posB = j._pos
					} else {
						j.chrA = j._chr
						j.posA = j._pos
					}

					data.push(j)
				})

				const errout = []
				ps.stderr.on('data', i => errout.push(i))
				ps.on('close', code => {
					const e = errout.join('')
					if (e && !tabixnoterror(e)) {
						reject(e)
						return
					}
					resolve({
						id: feature.id,
						items: data
					})
				})
			})
		})
	return [null, q]
}

function samplematrix_task_issvcnv(feature, ds, dsquery, usesampleset) {
	if (!feature.chr) return ['chr missing']
	if (!Number.isInteger(feature.start) || !Number.isInteger(feature.stop)) return ['invalid start/stop coordinate']
	if (feature.stop - feature.start > 10000000) return ['look range too big (>10Mb)']

	const q = Promise.resolve()
		.then(() => {
			if (dsquery.file) return
			return utils.cache_index(dsquery.url, dsquery.indexURL)
		})
		.then(dir => {
			return new Promise((resolve, reject) => {
				const data = []
				const ps = spawn(
					tabix,
					[
						dsquery.file ? path.join(serverconfig.tpmasterdir, dsquery.file) : dsquery.url,
						feature.chr + ':' + feature.start + '-' + feature.stop
					],
					{ cwd: dir }
				)
				const rl = readline.createInterface({
					input: ps.stdout
				})
				rl.on('line', line => {
					const l = line.split('\t')

					const j = JSON.parse(l[3])

					if (!j.sample) return
					if (usesampleset && !usesampleset.has(j.sample)) return

					// keep all data and return

					if (j.dt == common.dtsv || j.dt == common.dtfusionrna) {
						if (j.dt == common.dtsv && feature.sv && feature.sv.hidden) return

						if (j.dt == common.dtfusionrna && feature.fusion && feature.fusion.hidden) return

						j._chr = l[0]
						j._pos = Number.parseInt(l[1])
						if (j.chrA) {
							j.chrB = j._chr
							j.posB = j._pos
						} else {
							j.chrA = j._chr
							j.posA = j._pos
						}
					} else if (j.dt == common.dtcnv) {
						if (feature.cnv && feature.cnv.hidden) return

						if (feature.cnv && feature.cnv.valuecutoff && Math.abs(j.value) < feature.cnv.valuecutoff) return
						j.chr = l[0]
						j.start = Number.parseInt(l[1])
						j.stop = Number.parseInt(l[2])
						if (feature.cnv && feature.cnv.focalsizelimit && j.stop - j.start >= feature.cnv.focalsizelimit) return
					} else if (j.dt == common.dtloh) {
						if (feature.loh && feature.loh.hidden) return

						if (feature.loh && feature.loh.valuecutoff && j.segmean < feature.loh.valuecutoff) return
						j.chr = l[0]
						j.start = Number.parseInt(l[1])
						j.stop = Number.parseInt(l[2])
						if (feature.loh && feature.loh.focalsizelimit && j.stop - j.start >= feature.loh.focalsizelimit) return
					} else if (j.dt == common.dtitd) {
						if (feature.itd && feature.itd.hidden) return

						j.chr = l[0]
						j.start = Number.parseInt(l[1])
						j.stop = Number.parseInt(l[2])
					} else {
						console.error('unknown datatype', j.dt)
						return
					}

					data.push(j)
				})

				const errout = []
				ps.stderr.on('data', i => errout.push(i))
				ps.on('close', code => {
					const e = errout.join('')
					if (e && !tabixnoterror(e)) {
						reject(e)
						return
					}

					const sample2item = new Map()
					for (const i of data) {
						if (!sample2item.has(i.sample)) sample2item.set(i.sample, [])
						sample2item.get(i.sample).push(i)
					}
					mdssvcnv_do_copyneutralloh(sample2item)

					const newlst = []
					for (const [n, lst] of sample2item) {
						for (const i of lst) {
							newlst.push(i)
						}
					}

					resolve({
						id: feature.id,
						items: newlst
					})
				})
			})
		})
	return [null, q]
}

function samplematrix_task_ismutation(feature, ds, dsquerylst, usesampleset) {
	/*
	load mutation of any type:
		snvindel from vcf file
		cnv/loh/sv/fusion/itd from svcnv file

	no expression data here

	*/
	if (!feature.chr) return ['chr missing']
	if (!Number.isInteger(feature.start) || !Number.isInteger(feature.stop)) return ['invalid start/stop coordinate']
	if (feature.stop - feature.start > 10000000) return ['look range too big (>10Mb)']

	const tasks = []

	for (const query of dsquerylst) {
		if (query.type == common.tkt.mdsvcf) {
			const [err, q] = samplematrix_task_isvcf(feature, ds, query, usesampleset)
			if (err) return [err]
			tasks.push(q)
		} else if (query.type == common.tkt.mdssvcnv) {
			const [err, q] = samplematrix_task_issvcnv(feature, ds, query, usesampleset)
			if (err) return [err]
			tasks.push(q)
		} else {
			return ['unsupported track type: ' + query.type]
		}
	}

	return [
		null,
		Promise.all(tasks).then(results => {
			const items = []
			for (const r of results) {
				for (const i of r.items) {
					items.push(i)
				}
			}
			return {
				id: results[0].id,
				items: items
			}
		})
	]
}

function samplematrix_task_isvcf(feature, ds, dsquery, usesampleset) {
	/*
	if is custom, will pass the lines to client for processing
	*/
	if (!dsquery.tracks) return 'tracks[] missing from dsquery'
	if (!feature.chr) return ['chr missing']
	if (!Number.isInteger(feature.start) || !Number.isInteger(feature.stop)) return ['invalid start/stop coordinate']
	if (feature.stop - feature.start > 2000000) return ['look range too big (>2Mb)']

	const tasks = []

	for (const tk of dsquery.tracks) {
		const q = Promise.resolve()
			.then(() => {
				if (tk.file) return
				return utils.cache_index(tk.url, tk.indexURL)
			})
			.then(dir => {
				return new Promise((resolve, reject) => {
					const data = []
					const ps = spawn(
						tabix,
						[
							tk.file ? path.join(serverconfig.tpmasterdir, tk.file) : tk.url,
							(tk.nochr ? feature.chr.replace('chr', '') : feature.chr) + ':' + feature.start + '-' + (feature.stop + 1)
							// must add 1 to stop so to get snv data
						],
						{ cwd: dir }
					)
					const rl = readline.createInterface({
						input: ps.stdout
					})
					rl.on('line', line => {
						if (dsquery.iscustom) {
							// info/format are at client, pass them over
							data.push(line)
							return
						}

						if (tk.type == common.mdsvcftype.vcf) {
							// snv/indel

							const [badinfok, mlst, altinvalid] = vcf.vcfparseline(line, {
								nochr: tk.nochr,
								samples: tk.samples,
								info: dsquery.info,
								format: tk.format
							})

							for (const m of mlst) {
								if (!m.sampledata) {
									// do not allow
									continue
								}

								// extract class/mname from vep csq etc, must be done here but not on client
								common.vcfcopymclass(m, {})

								if (feature.snvindel) {
									if (feature.snvindel.excludeclasses && feature.snvindel.excludeclasses[m.class]) {
										// m class is one of excluded
										continue
									}
								}

								// filters on samples

								if (usesampleset) {
									const samplesnothidden = []
									for (const s of m.sampledata) {
										if (usesampleset.has(s.sampleobj.name)) {
											samplesnothidden.push(s)
										}
									}
									if (samplesnothidden.length == 0) {
										continue
									}
									m.sampledata = samplesnothidden
								}

								// delete the obsolete attr
								for (const sb of m.sampledata) {
									delete sb.allele2readcount
								}

								delete m._m
								delete m.vcf_ID
								delete m.name

								m.dt = common.dtsnvindel

								data.push(m)
							}
						} else {
							console.error('type not one of mdsvcftype: ' + tk.type)
						}
					})

					const errout = []
					ps.stderr.on('data', i => errout.push(i))
					ps.on('close', code => {
						const e = errout.join('')
						if (e && !tabixnoterror(e)) {
							reject(e)
							return
						}
						resolve(data)
					})
				})
			})
		tasks.push(q)
	}

	return [
		null,
		Promise.all(tasks).then(results => {
			const lst = []
			for (const i of results) {
				for (const m of i) {
					lst.push(m)
				}
			}
			return {
				id: feature.id,
				items: lst
			}
		})
	]
}

/***********  __smat ends ************/

async function handle_vcfheader(req, res) {
	// get header for a single custom vcf track
	log(req)
	try {
		if (!req.query.genome) throw 'genome missing'
		const g = genomes[req.query.genome]
		if (!g) throw 'invalid genome'
		const [e, file, isurl] = fileurl(req)
		if (e) throw e
		const dir = isurl ? await utils.cache_index(file, req.query.indexURL) : null
		res.send({
			metastr: (await utils.get_header_tabix(file, dir)).join('\n'),
			nochr: await utils.tabix_is_nochr(file, dir, g)
		})
	} catch (e) {
		if (e.stack) console.error(e.stack)
		res.send({ error: e.message || e })
	}
}

async function handle_vcf(req, res) {
	// single vcf
	if (reqbodyisinvalidjson(req, res)) return
	try {
		const [e, file, isurl] = fileurl(req)
		if (e) throw e
		const dir = isurl ? utils.cache_index(file, req.query.indexURL) : null
		if (!req.query.rglst) throw 'rglst missing'
		const lines = []
		for (const r of req.query.rglst) {
			await utils.get_lines_tabix([file, r.chr + ':' + r.start + '-' + r.stop], dir, line => {
				lines.push(line)
			})
		}
		res.send({ linestr: lines.join('\n') })
	} catch (e) {
		if (e.stack) console.log(e.stack)
		res.send({ error: e.message || e })
	}
}

function handle_translategm(req, res) {
	try {
		req.query = JSON.parse(req.body)
	} catch (e) {
		res.send({ error: 'invalid request body' })
		return
	}
	log(req)
	if (!genomes[req.query.genome]) return res.send({ error: 'invalid genome' })
	if (!req.query.gm) return res.send({ error: 'missing gm object' })
	if (!req.query.gm.chr) return res.send({ error: 'gm.chr missing' })
	if (!req.query.gm.start) return res.send({ error: 'gm.start missing' })
	if (!Number.isInteger(req.query.gm.start)) return res.send({ error: 'gm.start not integer' })
	if (!req.query.gm.stop) return res.send({ error: 'gm.stop missing' })
	if (!Number.isInteger(req.query.gm.stop)) return res.send({ error: 'gm.stop not integer' })

	const genomefile = genomes[req.query.genome].genomefile
	const rawout = []
	const rawerr = []
	const ps = spawn(samtools, [
		'faidx',
		genomefile,
		req.query.gm.chr + ':' + (req.query.gm.start + 1) + '-' + req.query.gm.stop
	])
	ps.stdout.on('data', i => rawout.push(i))
	ps.stderr.on('data', i => rawerr.push(i))
	ps.on('close', code => {
		const err = rawerr.join('')
		if (err) {
			res.send({ error: 'error getting sequence' })
			return
		}
		const fasta = rawout.join('').trim()
		if (fasta == '') {
			res.send({ error: 'no seqeuence retrieved' })
			return
		}

		const thisframe = common.fasta2gmframecheck(req.query.gm, fasta)

		res.send({ frame: thisframe })
	})
}

/****************************************************************************************************/

/* __tp__ */

/***************************   __util   **/

function validate_tabixfile(file) {
	if (!file.endsWith('.gz')) return ['no .gz suffix (file should be compressed by bgzip)']
	const gzfile = path.join(serverconfig.tpmasterdir, file)
	if (!fs.existsSync(gzfile)) return ['.gz file not found']
	if (fs.existsSync(gzfile + '.tbi')) {
		// using tbi
		return [null, gzfile]
	}
	if (fs.existsSync(gzfile + '.csi')) {
		// using csi
		return [null, gzfile]
	}
	return ['.tbi/.csi index missing']
}

var binOffsets = [512 + 64 + 8 + 1, 64 + 8 + 1, 8 + 1, 1, 0]

function getbin(start, stop) {
	var startbin = start >> 17,
		stopbin = stop >> 17,
		bin = null
	for (var i = 0; i < binOffsets.length; i++) {
		if (startbin == stopbin) {
			bin = binOffsets[i] + startbin
			break
		}
		startbin >>= 3
		stopbin >>= 3
	}
	return bin
}

function local_init_bulk_flag() {
	var flag = common.init_bulk_flag()
	return flag
}

function local_end_flag(flag) {
	delete flag.mclasslabel2key
	delete flag.sample2disease
	delete flag.patient2ori2sample
}

function makeyscale() {
	var barheight = 50,
		minv = 0,
		maxv = 100
	function yscale(v) {
		var usebaseline = false
		var baseliney = 0
		if (minv == 0 && maxv == 0) {
			// nothing
		} else if (minv <= 0 && maxv >= 0) {
			usebaseline = true
			baseliney = (barheight * maxv) / (maxv - minv)
		}
		if (usebaseline) {
			if (v >= maxv) return { y: 0, h: baseliney }
			if (v >= 0) {
				var h = (baseliney * v) / maxv
				return { y: baseliney - h, h: h }
			}
			if (v <= minv) return { y: baseliney, h: barheight - baseliney }
			var h = ((barheight - baseliney) * v) / minv
			return { y: baseliney, h: h }
			return
		}
		if (v <= minv) return { y: barheight, h: 0 }
		var h = (barheight * (v - minv)) / (maxv - minv)
		return { y: barheight - h, h: h }
	}
	yscale.height = function(h) {
		barheight = h
		return yscale
	}
	yscale.min = function(v) {
		minv = v
		return yscale
	}
	yscale.max = function(v) {
		maxv = v
		return yscale
	}
	return yscale
}
exports.makeyscale = makeyscale

function parse_header_variantgene(line) {
	var lst = line.toLowerCase().split('\t')
	function htry() {
		for (var i = 0; i < arguments.length; i++) {
			var j = lst.indexOf(arguments[i])
			if (j != -1) return j
		}
		return -1
	}
	var header = []
	var i = htry('chromosome')
	if (i == -1) return ['no chromosome']
	header.push({
		k: 'chr',
		i: i
	})
	var i = htry('position')
	if (i == -1) return ['no position']
	header.push({
		k: 'position',
		i: i
	})
	var i = htry('reference_allele')
	if (i == -1) return ['no reference_allele']
	header.push({
		k: 'reference_allele',
		i: i
	})
	var i = htry('mutant_allele')
	if (i == -1) return ['no mutant_allele']
	header.push({
		k: 'mutant_allele',
		i: i
	})
	var i = htry('patient')
	if (i == -1) return ['no patient']
	header.push({
		k: 'patient',
		i: i
	})
	var i = htry('sampletype')
	if (i == -1) return ['no sampletype']
	header.push({
		k: 'sampletype',
		i: i
	})
	var i = htry('geneset')
	if (i == -1) return ['no geneset']
	header.push({
		k: 'geneset',
		i: i
	})
	return [null, header]
}

function parse_variantgene(line, header) {
	var lst = line.split('\t')
	var m = {}
	header.forEach(h => {
		m[h.k] = lst[h.i]
	})
	if (!m.chr) return ['missing chr']
	if (!m.position) return ['missing position']
	var p = parseInt(m.position)
	if (isNaN(p)) return ['invalid position']
	m.position = p - 1
	if (!m.patient) return ['missing patient']
	if (!m.sampletype) return ['missing sample']
	if (!m.geneset) return ['missing geneset']
	if (!m.reference_allele) {
		m.hgvs = 'g.' + p + 'ins' + m.mutant_allele
	} else if (!m.mutant_allele) {
		m.hgvs = 'g.' + p + 'del' + m.reference_allele
	} else {
		m.hgvs = 'g.' + p + m.reference_allele + '>' + m.mutant_allele
	}
	try {
		var jsg = JSON.parse(m.geneset)
	} catch (e) {
		return ['invalid json for geneset']
	}
	m.geneset = jsg
	return [null, m]
}

function illegalpath(s) {
	if (s[0] == '/') return true // must not be relative to mount root
	if (s.includes('"') || s.includes("'")) return true // must not include quotes, apostrophe
	if (s.includes('|') || s.includes('&')) return true // must not include operator characters
	if (s.indexOf('..') != -1) return true
	if (s.match(/(\<script|script\>)/i)) return true // avoid the potential for parsing injected code in client side error message
	return false
}

function fileurl(req) {
	// must use it to scrutinize every requested file path
	let file = null,
		isurl = false
	if (req.query.file) {
		file = req.query.file
		if (illegalpath(file)) return ['illegal file path']
		file = path.join(serverconfig.tpmasterdir, file)
	} else if (req.query.url) {
		file = req.query.url
		// avoid whitespace in case the url is supplied as an argument
		// to an exec script and thus execute arbitrary space-separated
		// commands within the url
		if (file.includes(' ')) return ['url must not contain whitespace']
		if (file.includes('"') || file.includes("'")) return ['url must not contain single or double quotes']
		isurl = true
	}
	if (!file) return ['file unspecified']
	return [null, file, isurl]
}
exports.fileurl = fileurl

function reqbodyisinvalidjson(req, res) {
	try {
		req.query = JSON.parse(req.body)
	} catch (e) {
		res.send({ error: 'invalid request body' })
		return true
	}
	log(req)
	return false
}
exports.reqbodyisinvalidjson = reqbodyisinvalidjson

function get_percentile_readcount(lst, ...percents) {
	if (lst.length == 0) {
		// no samples
		return 0
	}
	const arr = lst.sort((i, j) => i.readcount - j.readcount)
	const result = []
	percents.forEach(perc => {
		if (!Number.isFinite(perc) || perc < 0 || perc > 1) {
			result.push(null)
			return
		}
		result.push(arr[Math.floor(arr.length * perc)].readcount)
	})
	//console.log(result[0], '::',lst.join(' '))
	return result
}

function log(req) {
	const j = {}
	for (const k in req.query) {
		if (k != 'jwt') j[k] = req.query[k]
	}
	console.log(
		'%s\t%s\t%s\t%s',
		url.parse(req.url).pathname,
		new Date(),
		req.header('x-forwarded-for') || req.connection.remoteAddress,
		JSON.stringify(j)
	)
}

exports.log = log

function downloadFile(url, tofile, cb) {
	const f = fs.createWriteStream(tofile)

	f.on('finish', () => {
		f.close(cb)
	})
	;(url.startsWith('https') ? https : http)
		.get(url, response => {
			response.pipe(f)
		})
		.on('error', err => {
			cb(err.message)
		})
}

function parse_textfilewithheader(text) {
	/*
	for sample annotation file, first line is header, skip lines start with #
	parse each line as an item
	*/
	const lines = text.split(/\r?\n/)
	/*
	if(lines.length<=1) return ['no content']
	if(lines[0] == '') return ['empty header line']
	*/

	// allow empty file
	if (lines.length <= 1 || !lines[0]) return [null, []]

	const header = lines[0].split('\t')
	const items = []
	for (let i = 1; i < lines.length; i++) {
		if (lines[i][0] == '#') continue
		const l = lines[i].split('\t')
		const item = {}
		for (let j = 0; j < header.length; j++) {
			const value = l[j]
			if (value) {
				item[header[j]] = value
			}
		}
		items.push(item)
	}
	return [null, items]
}

/***************************   end of __util   **/

async function pp_init() {
	codedate = get_codedate()
	launchdate = Date(Date.now())
		.toString()
		.split(' ')
		.slice(0, 5)
		.join(' ')
	if (serverconfig.base_zindex != undefined) {
		const v = Number.parseInt(serverconfig.base_zindex)
		if (Number.isNaN(v) || v <= 0) throw 'base_zindex must be positive integer'
		serverconfig.base_zindex = v
	}
	if (serverconfig.jwt) {
		if (!serverconfig.jwt.secret) throw 'jwt.secret missing'
		if (!serverconfig.jwt.permissioncheck) throw 'jwt.permissioncheck missing'
	}
	if (!serverconfig.tpmasterdir) throw '.tpmasterdir missing'
	if (!serverconfig.cachedir) throw '.cachedir missing'

	if (!serverconfig.genomes) throw '.genomes[] missing'
	if (!Array.isArray(serverconfig.genomes)) throw '.genomes[] not array'

	for (const g of serverconfig.genomes) {
		if (!g.name) throw '.name missing from a genome: ' + JSON.stringify(g)
		if (!g.file) throw '.file missing from genome ' + g.name

		const overrideFile = path.join(process.cwd(), g.file)
		const g2 = __non_webpack_require__(fs.existsSync(overrideFile) ? overrideFile : g.file)

		if (!g2.genomefile) throw '.genomefile missing from .js file of genome ' + g.name
		g2.genomefile = path.join(serverconfig.tpmasterdir, g2.genomefile)

		genomes[g.name] = g2

		if (!g2.tracks) {
			g2.tracks = [] // must always have .tracks even if empty
		}
		if (g.tracks) {
			// supplement
			for (const t of g.tracks) {
				g2.tracks.push(t)
			}
		}
		if (g.datasets) {
			g2.rawdslst = g.datasets
		}
		if (g.snp) {
			// replace snp db
			g2.snp = g.snp
		}
		if (g.blat) {
			if (!g.blat.host) throw '.blat.host missing for ' + g.name
			if (!g.blat.port) throw '.blat.port missing for ' + g.name
			// gfServer must start with full path to 2bit file
			g2.blat = g.blat // enable blat
		}
		if (g.nosnp) {
			// no snp
			delete g2.snp
		}
		if (g.nohicenzyme) {
			delete g2.hicenzymefragment
		}
		if (g.nohicdomain) {
			delete g2.hicdomain
		}
	}

	if (serverconfig.defaultgenome) {
		if (genomes[serverconfig.defaultgenome]) {
			genomes[serverconfig.defaultgenome].isdefault = true
		}
	}

	for (const genomename in genomes) {
		/*
	validate each genome
	*/

		const g = genomes[genomename]
		if (!g.majorchr) throw genomename + ': majorchr missing'
		if (!g.defaultcoord) throw genomename + ': defaultcoord missing'
		// test samtools and genomefile
		const cmd =
			samtools +
			' faidx ' +
			g.genomefile +
			' ' +
			g.defaultcoord.chr +
			':' +
			g.defaultcoord.start +
			'-' +
			(g.defaultcoord.start + 1)

		child_process.execSync(cmd)

		if (!g.tracks) {
			g.tracks = []
		}
		if (typeof g.majorchr == 'string') {
			const lst = g.majorchr.trim().split(/[\s\t\n]+/)
			const hash = {}
			const chrorder = []
			for (let i = 0; i < lst.length; i += 2) {
				const chr = lst[i]
				const c = Number.parseInt(lst[i + 1])
				if (Number.isNaN(c)) throw genomename + ' majorchr invalid chr size for ' + chr + ' (' + lst[i + 1] + ')'
				hash[chr] = c
				chrorder.push(chr)
			}
			g.majorchr = hash
			g.majorchrorder = chrorder
		}
		if (g.minorchr) {
			if (typeof g.minorchr == 'string') {
				const lst = g.minorchr.trim().split(/[\s\t\n]+/)
				const hash = {}
				for (let i = 0; i < lst.length; i += 2) {
					const c = Number.parseInt(lst[i + 1])
					if (Number.isNaN(c)) throw genomename + ' minorchr invalid chr size for ' + lst[i] + ' (' + lst[i + 1] + ')'
					hash[lst[i]] = c
				}
				g.minorchr = hash
			}
		}

		if (!g.genedb) throw genomename + ': .genedb{} missing'
		if (!g.genedb.dbfile) throw genomename + ': .genedb.dbfile missing'
		{
			// keep reference of .db so as to add dataset-specific query statements later
			try {
				g.genedb.db = utils.connect_db(g.genedb.dbfile)
			} catch (e) {
				throw 'Error with ' + g.genedb.dbfile + ': ' + e
			}
			g.genedb.getnamebynameorisoform = g.genedb.db.prepare('select name from genes where name=? or isoform=?')
			g.genedb.getnamebyisoform = g.genedb.db.prepare('select distinct name from genes where isoform=?')
			g.genedb.getjsonbyname = g.genedb.db.prepare('select isdefault,genemodel from genes where name=?')
			g.genedb.getjsonbyisoform = g.genedb.db.prepare('select isdefault,genemodel from genes where isoform=?')
			g.genedb.getnameslike = g.genedb.db.prepare('select distinct name from genes where name like ? limit 20')
			if (g.genedb.hasalias) {
				g.genedb.getnamebyalias = g.genedb.db.prepare('select name from genealias where alias=?')
			}
		}

		for (const tk of g.tracks) {
			if (!tk.__isgene) continue
			if (!tk.file) throw 'Tabix file missing for gene track: ' + JSON.stringify(tk)
			try {
				await utils.validate_tabixfile(path.join(serverconfig.tpmasterdir, tk.file))
			} catch (e) {
				throw 'Error with ' + tk.file + ': ' + e
			}
		}

		if (g.proteindomain) {
			if (!g.proteindomain.dbfile) throw genomename + '.proteindomain: missing dbfile for sqlite db'
			if (!g.proteindomain.statement) throw genomename + '.proteindomain: missing statement for sqlite db'
			let db
			try {
				db = utils.connect_db(g.proteindomain.dbfile)
			} catch (e) {
				throw 'Error with ' + g.proteindomain.dbfile + ': ' + e
			}
			g.proteindomain.getbyisoform = db.prepare(g.proteindomain.statement)
		}

		if (g.snp) {
			if (!g.snp.dbfile) throw genomename + '.snp: missing sqlite dbfile'
			if (!g.snp.statement_getbyname) throw genomename + '.snp: missing statement_getbyname'
			if (!g.snp.statement_getbycoord) throw genomename + '.snp: missing statement_getbycoord'

			let db
			try {
				db = utils.connect_db(g.snp.dbfile)
			} catch (e) {
				throw 'Error with ' + g.snp.dbfile + ': ' + e
			}
			g.snp.getbyname = db.prepare(g.snp.statement_getbyname)
			g.snp.getbycoord = db.prepare(g.snp.statement_getbycoord)
		}

		if (g.clinvarVCF) {
			if (!g.clinvarVCF.file) throw genomename + '.clinvarVCF: VCF file missing'
			g.clinvarVCF.file = path.join(serverconfig.tpmasterdir, g.clinvarVCF.file)
			try {
				await utils.validate_tabixfile(g.clinvarVCF.file)
			} catch (e) {
				throw 'Error with ' + g.clinvarVCF.file + ': ' + e
			}

			if (!g.clinvarVCF.infokey) throw genomename + '.clinvarVCF.infokey missing'
			if (!g.clinvarVCF.categories) throw genomename + '.clinvarVCF.categories{} missing'

			{
				const tmp = child_process.execSync(tabix + ' -H ' + g.clinvarVCF.file, { encoding: 'utf8' }).trim()
				if (!tmp) throw genomename + '.clinvarVCF: no meta/header lines'
				const [info, format, samples, errs] = vcf.vcfparsemeta(tmp.split('\n'))
				if (errs) throw genomename + '.clinvarVCF: error parsing vcf meta: ' + errs.join('\n')
				if (!info[g.clinvarVCF.infokey]) throw genomename + '.clinvarVCF: unknown INFO key for ' + g.clinvarVCF.infokey
				g.clinvarVCF.info = info
				g.clinvarVCF.format = format
			}
			{
				const tmp = child_process.execSync(tabix + ' -l ' + g.clinvarVCF.file, { encoding: 'utf8' }).trim()
				if (tmp == '') throw genomename + '.clinvarVCF: no chr listing'
				g.clinvarVCF.nochr = common.contigNameNoChr(g, tmp.split('\n'))
			}
		}

		if (g.fimo_motif) {
			if (!g.fimo_motif.db) throw genomename + '.fimo_motif: db file missing'
			g.fimo_motif.db = path.join(serverconfig.tpmasterdir, g.fimo_motif.db)
			if (g.fimo_motif.annotationfile) {
				const [err, items] = parse_textfilewithheader(
					fs.readFileSync(path.join(serverconfig.tpmasterdir, g.fimo_motif.annotationfile), { encoding: 'utf8' }).trim()
				)
				g.fimo_motif.tf2attr = {}
				for (const i of items) {
					g.fimo_motif.tf2attr[i.Model.split('_')[0]] = i
				}
			}
		}

		if (g.hicenzymefragment) {
			if (!Array.isArray(g.hicenzymefragment)) throw 'hicenzymefragment should be an array'
			for (const frag of g.hicenzymefragment) {
				if (!frag.enzyme) throw '.enzyme missing for one element of hicenzymefragment[]'
				if (!frag.file) throw '.file missing for one element of hicenzymefragment[]'
				try {
					await utils.validate_tabixfile(path.join(serverconfig.tpmasterdir, frag.file))
				} catch (e) {
					throw 'Error with ' + frag.file + ': ' + e
				}
			}
		}

		if (g.hicdomain) {
			if (!g.hicdomain.groups) throw '.groups{} missing from hicdomain'
			for (const groupname in g.hicdomain.groups) {
				const grp = g.hicdomain.groups[groupname]
				if (!grp.name) throw '.name missing from hicdomain ' + groupname
				if (!grp.sets) throw '.set{} missing from hicdomain ' + groupname
				for (const setname in grp.sets) {
					const hs = grp.sets[setname]
					if (!hs.name) throw '.name missing from hicdomain ' + groupname + ' > ' + setname
					if (!hs.file) throw '.file missing from hicdomain ' + groupname + ' > ' + setname
					hs.file = path.join(serverconfig.tpmasterdir, hs.file) // replace with full path, keep on server side
					try {
						await utils.validate_tabixfile(hs.file)
					} catch (e) {
						throw 'Error with ' + hs.file + ': ' + e
					}
				}
			}
		}

		if (!g.rawdslst) {
			// allow to have no ds
			continue
		}

		/*
	done everything except dataset
	*/

		g.datasets = {}
		const promises = []
		for (const d of g.rawdslst) {
			/*
		for each raw dataset
		*/

			if (!d.name) throw 'a nameless dataset from ' + genomename
			if (g.datasets[d.name]) throw genomename + ' has duplicating dataset name: ' + d.name
			if (!d.jsfile) throw 'jsfile not available for dataset ' + d.name + ' of ' + genomename
			const overrideFile = path.join(process.cwd(), d.jsfile)
			const ds = __non_webpack_require__(fs.existsSync(overrideFile) ? overrideFile : d.jsfile)

			ds.noHandleOnClient = d.noHandleOnClient
			ds.label = d.name
			g.datasets[ds.label] = ds

			if (ds.isMds3) {
				try {
					await mds3_init.init(ds, g, d)
				} catch (e) {
					if (e.stack) console.log(e.stack)
					throw 'Error with mds3 dataset ' + ds.label + ': ' + e
				}
				continue
			}
			if (ds.isMds) {
				try {
					await mds_init(ds, g, d)
				} catch (e) {
					throw 'Error with mds dataset ' + ds.label + ': ' + e
				}
				continue
			}

			/* old official dataset */

			if (ds.dbfile) {
				/* this dataset has a db */
				try {
					ds.newconn = utils.connect_db(ds.dbfile)
				} catch (e) {
					throw 'Error with ' + ds.dbfile + ': ' + e
				}
			}

			if (ds.snvindel_attributes) {
				for (const at of ds.snvindel_attributes) {
					if (at.lst) {
						for (const a2 of at.lst) {
							a2.get = a2.get.toString()
						}
					} else {
						at.get = at.get.toString()
					}
				}
			}

			if (ds.cohort) {
				// a dataset with cohort

				if (ds.cohort.levels) {
					if (!Array.isArray(ds.cohort.levels)) throw 'cohort.levels must be array for ' + genomename + '.' + ds.label
					if (ds.cohort.levels.length == 0) throw 'levels is blank array for cohort of ' + genomename + '.' + ds.label
					for (const i of ds.cohort.levels) {
						if (!i.k) throw '.k key missing in one of the levels, .cohort, in ' + genomename + '.' + ds.label
					}
				}

				if (ds.cohort.fromdb) {
					/*
				cohort content to be loaded lazily from db
				*/
					if (!ds.cohort.fromdb.sql) throw '.sql missing from ds.cohort.fromdb in ' + genomename + '.' + ds.label
					const rows = ds.newconn.prepare(ds.cohort.fromdb.sql).all()
					delete ds.cohort.fromdb
					ds.cohort.raw = rows ///// backward compatible
					console.log(rows.length + ' rows retrieved for ' + ds.label + ' sample annotation')
				}

				if (ds.cohort.files) {
					// sample annotation load directly from text files, in sync
					let rows = []
					for (const file of ds.cohort.files) {
						if (!file.file) throw '.file missing from one of cohort.files[] for ' + genomename + '.' + ds.label
						const txt = fs.readFileSync(path.join(serverconfig.tpmasterdir, file.file), 'utf8').trim()
						if (!txt) throw file.file + ' is empty for ' + genomename + '.' + ds.label
						rows = [...rows, ...d3dsv.tsvParse(txt)]
					}
					delete ds.cohort.files
					if (ds.cohort.raw) {
						ds.cohort.raw = [...ds.cohort.raw, ...rows]
					} else {
						ds.cohort.raw = rows
					}
					console.log(rows.length + ' rows retrieved for ' + ds.label + ' sample annotation')
				}
				if (ds.cohort.tosampleannotation) {
					// a directive to tell client to convert cohort.raw[] to cohort.annotation{}, key-value hash
					if (!ds.cohort.tosampleannotation.samplekey)
						throw '.samplekey missing from .cohort.tosampleannotation for ' + genomename + '.' + ds.label
					if (!ds.cohort.key4annotation)
						throw '.cohort.key4annotation missing when .cohort.tosampleannotation is on for ' +
							genomename +
							'.' +
							ds.label
					// in fact, it still requires ds.cohort.raw, but since db querying is async, not checked
				}
			}

			if (!ds.queries) throw '.queries missing from dataset ' + ds.label + ', ' + genomename
			if (!Array.isArray(ds.queries)) throw ds.label + '.queries is not array'
			for (const q of ds.queries) {
				const err = legacyds_init_one_query(q, ds, g)
				if (err) throw 'Error parsing a query in "' + ds.label + '": ' + err
			}

			if (ds.vcfinfofilter) {
				const err = common.validate_vcfinfofilter(ds.vcfinfofilter)
				if (err) throw ds.label + ': vcfinfofilter error: ' + err
			}

			if (ds.url4variant) {
				for (const u of ds.url4variant) {
					if (!u.makelabel) throw 'makelabel() missing for one item of url4variant from ' + ds.label
					if (!u.makeurl) throw 'makeurl() missing for one item of url4variant from ' + ds.label
					u.makelabel = u.makelabel.toString()
					u.makeurl = u.makeurl.toString()
				}
			}
		}

		delete g.rawdslst
	}

	//add reading examples json here
	const txt = await utils.read_file(serverconfig.examplejson)
	const json = JSON.parse(txt)
	examples = json.examples
}

function get_codedate() {
	// detect if proteinpaint was called from outside the
	// project directory that installed it as an npm dependency
	const ppbin = process.argv.find(
		arg => arg.includes('/node_modules/@stjude/proteinpaint/bin.js') || arg.endsWith('/bin.js')
	)
	// if the pp binary did not start the process, assume that the
	// server was called in the same directory as the public dir or symlink
	const dirname = serverconfig.projectdir
		? serverconfig.projectdir
		: ppbin
		? path.dirname(ppbin)
		: fs.existsSync('./node_modules/@stjude/proteinpaint/server.js')
		? './node_modules/@stjude/proteinpaint/'
		: 'public/..'
	const date1 = fs.statSync(dirname + '/server.js').mtime
	const date2 = fs.statSync('public/bin/proteinpaint.js').mtime
	return date1 > date2 ? date1 : date2
}

function legacyds_init_one_query(q, ds, genome) {
	/* parse a query from legacy ds.queries[]
	 */
	if (!q.name) return '.name missing'

	if (q.dsblocktracklst) {
		/*
		not sure if still in use!

		one or more block track available from this query
		quick-fix for cohort junction, replace-by-mds
		*/
		if (!Array.isArray(q.dsblocktracklst)) return 'dsblocktracklst not an array in ' + ds.label
		for (const tk of q.dsblocktracklst) {
			if (!tk.type) return 'missing type for a blocktrack of ' + ds.label
			if (!tk.file && !tk.url) return 'neither file or url given for a blocktrack of ' + ds.label
		}
		return
	}

	if (q.vcffile) {
		// single vcf
		const meta = child_process
			.execSync(tabix + ' -H ' + path.join(serverconfig.tpmasterdir, q.vcffile), { encoding: 'utf8' })
			.trim()
		if (meta == '') return 'no meta lines in VCF file ' + q.vcffile + ' of query ' + q.name
		const [info, format, samples, errs] = vcf.vcfparsemeta(meta.split('\n'))
		if (errs) return 'error parsing VCF meta lines of ' + q.vcffile + ': ' + errs.join('; ')
		q.vcf = {
			vcfid: Math.random().toString(),
			info: info,
			format: format,
			samples: samples
		}
		if (q.hlinfo) {
			q.vcf.hlinfo = q.hlinfo
			delete q.hlinfo
		}
		if (q.infopipejoin) {
			q.vcf.infopipejoin = q.infopipejoin
			delete q.infopipejoin
		}
		const tmp = child_process
			.execSync(tabix + ' -l ' + path.join(serverconfig.tpmasterdir, q.vcffile), { encoding: 'utf8' })
			.trim()
		if (tmp == '') return 'tabix -l found no chromosomes/contigs in ' + q.vcffile + ' of query ' + q.name
		q.vcf.nochr = common.contigNameNoChr(genome, tmp.split('\n'))
		let infoc = 0
		if (info) {
			for (const n in info) infoc++
		}
		console.log(
			'Parsed vcf meta from ' +
				q.vcffile +
				': ' +
				infoc +
				' INFO, ' +
				samples.length +
				' sample, ' +
				(q.vcf.nochr ? 'no "chr"' : 'has "chr"')
		)
		return
	}

	if (q.makequery) {
		if (q.isgeneexpression) {
			if (!q.config) return 'config object missing for gene expression query of ' + q.name
			if (q.config.maf) {
				q.config.maf.get = q.config.maf.get.toString()
			}
		}
		return
	}

	if (q.gdcgraphql_snvindel) {
		// TODO validate when it's settled
		return
	}

	return 'do not know how to parse query: ' + q.name
}

/////////////////// __MDS

async function mds_init(ds, genome, _servconfig) {
	/*
	ds: loaded from datasets/what.js
	genome: obj {}
	_servconfig: the entry in "datasets" array from serverconfig.json
	*/

	mds2_init.server_updateAttr(ds, _servconfig)

	if (ds.assayAvailability) {
		if (!ds.assayAvailability.file) throw '.assayAvailability.file missing'
		if (!ds.assayAvailability.assays) throw '.assayAvailability.assays[] missing'
		Object.freeze(ds.assayAvailability.assays)
		ds.assayAvailability.samples = new Map()
		for (const line of fs
			.readFileSync(path.join(serverconfig.tpmasterdir, ds.assayAvailability.file), { encoding: 'utf8' })
			.trim()
			.split('\n')) {
			const [sample, t] = line.split('\t')
			ds.assayAvailability.samples.set(sample, JSON.parse(t))
		}
		console.log(ds.assayAvailability.samples.size + ' samples with assay availability (' + ds.label + ')')
	}

	if (ds.sampleAssayTrack) {
		if (!ds.sampleAssayTrack.file) throw '.file missing from sampleAssayTrack'
		ds.sampleAssayTrack.samples = new Map()

		let count = 0

		let unannotated = new Set()

		for (const line of fs
			.readFileSync(path.join(serverconfig.tpmasterdir, ds.sampleAssayTrack.file), { encoding: 'utf8' })
			.trim()
			.split('\n')) {
			if (!line) continue
			if (line[0] == '#') continue

			const [sample, assay, jsontext] = line.split('\t')
			if (!assay || !jsontext) continue

			if (!ds.sampleAssayTrack.samples.has(sample)) {
				// new sample
				if (ds.cohort && ds.cohort.annotation) {
					if (!ds.cohort.annotation[sample]) {
						// this sample is unannotated
						unannotated.add(sample)
						continue
					}
				}

				ds.sampleAssayTrack.samples.set(sample, [])
			}

			const tk = JSON.parse(jsontext)
			// TODO validate track
			if (!common.tkt[tk.type]) throw 'invalid type from a sample track: ' + jsontext
			if (!tk.name) {
				tk.name = sample + ' ' + assay
			}

			tk.assayName = assay

			ds.sampleAssayTrack.samples.get(sample).push(tk)
			count++
		}

		console.log(count + ' assay-tracks from ' + ds.sampleAssayTrack.samples.size + ' samples (' + ds.label + ')')
		if (unannotated.size) {
			console.log(
				'Error: ' + unannotated.size + ' samples with assay tracks are unannotated: ' + [...unannotated].join(' ')
			)
		}
	}

	if (ds.singlesamplemutationjson) {
		const m = ds.singlesamplemutationjson
		if (!m.file) throw '.file missing from singlesamplemutationjson'
		m.samples = {}
		let count = 0
		for (const line of fs
			.readFileSync(path.join(serverconfig.tpmasterdir, m.file), { encoding: 'utf8' })
			.trim()
			.split('\n')) {
			if (!line) continue
			if (line[0] == '#') continue
			const [sample, file] = line.split('\t')
			if (sample && file) {
				count++
				m.samples[sample] = file
			}
		}
		console.log(count + ' samples for disco plot')
	}

	if (ds.cohort && ds.cohort.db && ds.cohort.termdb) {
		await mds2_init.init_db(ds, genome)
	}

	if (ds.cohort && ds.cohort.files) {
		/*
		*********** legacy mds *************

		following all loads sample attributes from text files
		and store in ds.cohort.annotation
		*/

		if (!Array.isArray(ds.cohort.files)) throw '.cohort.files is not array'

		if (!ds.cohort.tohash) throw '.tohash() missing from cohort'
		if (typeof ds.cohort.tohash != 'function') throw '.cohort.tohash is not function'
		if (!ds.cohort.samplenamekey) throw '.samplenamekey missing'

		// should allow both sample/individual level as key
		ds.cohort.annotation = {}

		if (ds.cohort.mutation_signature) {
			const s = ds.cohort.mutation_signature
			if (!s.sets) throw '.mutation_signature.sets missing'
			for (const k in s.sets) {
				const ss = s.sets[k]
				if (!ss.name) ss.name = k
				if (!ss.signatures) throw '.signatures{} missing from a signature set'
				if (ss.samples) {
					if (!ss.samples.file) throw '.samples.file missing from a signature set'
					const [err, items] = parse_textfilewithheader(
						fs.readFileSync(path.join(serverconfig.tpmasterdir, ss.samples.file), { encoding: 'utf8' }).trim()
					)
					ss.samples.map = new Map()
					for (const i of items) {
						const sample = i[ds.cohort.samplenamekey]
						if (!sample) throw ds.cohort.samplenamekey + ' missing in file ' + ss.samples.file
						ss.samples.map.set(sample, i)

						// parse to float
						for (const sk in ss.signatures) {
							if (i[sk]) {
								const v = Number.parseFloat(i[sk])
								if (Number.isNaN(v)) throw 'mutation signature value is not float: ' + i[sk] + ' from sample ' + sample
								if (ss.samples.skipzero && v == 0) {
									delete i[sk]
								} else {
									i[sk] = v
								}
							}
						}
					}
				}
			}
		}

		if (ds.cohort.attributes) {
			if (!ds.cohort.attributes.lst) throw '.lst[] missing for cohort.attributes'
			if (!Array.isArray(ds.cohort.attributes.lst)) return '.cohort.attributes.lst is not array'
			for (const attr of ds.cohort.attributes.lst) {
				if (!attr.key) throw '.key missing from one of the .cohort.attributes.lst[]'
				if (!attr.label) throw '.label missing from one of the .cohort.attributes.lst[]'
				if (!attr.values) throw '.values{} missing from ' + attr.label + ' of .cohort.attributes.lst'
				for (const value in attr.values) {
					if (!attr.values[value].label)
						throw '.label missing from one value of ' + attr.label + ' in .cohort.attributes.lst'
				}
			}
			if (ds.cohort.attributes.defaulthidden) {
				// allow attributes hidden by default
				for (const key in ds.cohort.attributes.defaulthidden) {
					const hideattr = ds.cohort.attributes.lst.find(i => i.key == key)
					if (!hideattr) throw 'invalid defaulthidden key: ' + key
					for (const value in ds.cohort.attributes.defaulthidden[key]) {
						if (!hideattr.values[value]) throw 'invalid defaulthidden value ' + value + ' for ' + key
					}
				}
			}
		}

		if (ds.cohort.hierarchies) {
			if (!ds.cohort.hierarchies.lst) throw '.lst[] missing from .cohort.hierarchies'
			if (!Array.isArray(ds.cohort.hierarchies.lst)) throw '.cohort.hierarchies.lst is not array'
			for (const h of ds.cohort.hierarchies.lst) {
				if (!h.name) throw '.name missing from one hierarchy'
				if (!h.levels) throw '.levels[] missing from one hierarchy'
				if (!Array.isArray(h.levels)) throw '.levels is not array from one hierarchy'
				for (const l of h.levels) {
					if (!l.k) throw '.k missing from one level in hierarchy ' + h.name
				}
			}
		}

		if (ds.cohort.sampleAttribute) {
			if (!ds.cohort.sampleAttribute.attributes) throw 'attributes{} missing from cohort.sampleAttribute'
			for (const key in ds.cohort.sampleAttribute.attributes) {
				const a = ds.cohort.sampleAttribute.attributes[key]
				if (!a.label) throw '.label missing for key ' + key + ' from cohort.sampleAttribute.attributes'
				if (a.values) {
					// optional
					for (const v in a.values) {
						const b = a.values[v]
						if (typeof b != 'object') throw 'value "' + v + '" not pointing to {} from sampleAttribute'
						if (!b.name) b.name = v
					}
				}
				if (a.showintrack) {
					if (!a.isinteger && !a.isfloat) throw a.label + ': .showintrack requires .isinteger or .isfloat'
				}
			}
		}

		if (ds.cohort.scatterplot) {
			if (!ds.cohort.sampleAttribute) throw '.sampleAttribute missing but required for .cohort.scatterplot'

			const sp = ds.cohort.scatterplot

			// querykey is required
			if (!sp.querykey) throw '.querykey missing from .cohort.scatterplot'
			{
				if (!ds.queries) throw '.cohort.scatterplot.querykey in use but ds.queries{} missing'
				const tk = ds.queries[sp.querykey]
				if (!tk) throw 'unknown query by .cohort.scatterplot.querykey: ' + sp.querykey
				if (tk.type != common.tkt.mdssvcnv)
					throw 'type is not ' + common.tkt.mdssvcnv + ' of the track pointed to by .cohort.scatterplot.querykey'
			}

			if (sp.colorbygeneexpression) {
				if (!sp.colorbygeneexpression.querykey) throw 'querykey missing from .cohort.scatterplot.colorbygeneexpression'
				if (!ds.queries) throw '.cohort.scatterplot.colorbygeneexpression in use but ds.queries{} missing'
				const tk = ds.queries[sp.colorbygeneexpression.querykey]
				if (!tk)
					throw 'unknown query by .cohort.scatterplot.colorbygeneexpression.querykey: ' +
						sp.colorbygeneexpression.querykey
				if (!tk.isgenenumeric)
					throw 'isgenenumeric missing from the track pointed to by .cohort.scatterplot.colorbygeneexpression.querykey'
			}

			if (sp.tracks) {
				// a common set of tracks to be shown in single sample browser upon clicking a dot
				// must label them as custom otherwise they won't be listed
				// TODO validate the tracks
			}

			// TODO support multiple plots
			if (!sp.x) throw '.x missing from .cohort.scatterplot'
			if (!sp.x.attribute) throw '.attribute missing from .cohort.scatterplot.x'
			const x = ds.cohort.sampleAttribute.attributes[sp.x.attribute]
			if (!x) throw 'scatterplot.x.attribute is not defined in sampleAttribute'
			if (!x.isfloat) throw 'scatterplot.x is not "isfloat"'
			if (!sp.y) throw '.y missing from .cohort.scatterplot'
			if (!sp.y.attribute) throw '.attribute missing from .cohort.scatterplot.y'
			const y = ds.cohort.sampleAttribute.attributes[sp.y.attribute]
			if (!y) throw 'scatterplot.y.attribute is not defined in sampleAttribute'
			if (!y.isfloat) throw 'scatterplot.y is not "isfloat"'
			if (sp.colorbyattributes) {
				for (const attr of sp.colorbyattributes) {
					if (!attr.key) throw '.key missing from one of scatterplot.colorbyattributes'
					const attrreg = ds.cohort.sampleAttribute.attributes[attr.key]
					if (!attrreg) throw 'unknown attribute by key ' + attr.key + ' from scatterplot.colorbyattributes'
					attr.label = attrreg.label
					attr.values = attrreg.values
				}
			}
		}

		for (const file of ds.cohort.files) {
			if (!file.file) throw '.file missing from one of .cohort.files'
			const [err, items] = parse_textfilewithheader(
				fs.readFileSync(path.join(serverconfig.tpmasterdir, file.file), { encoding: 'utf8' }).trim()
			)
			if (err) throw 'cohort annotation file "' + file.file + '": ' + err
			//if(items.length==0) return 'no content from sample annotation file '+file.file
			console.log(ds.label + ': ' + items.length + ' samples loaded from annotation file ' + file.file)
			items.forEach(i => {
				// may need to parse certain values into particular format

				for (const k in i) {
					let attr
					if (ds.cohort.sampleAttribute) {
						attr = ds.cohort.sampleAttribute.attributes[k]
					}
					if (!attr) {
						if (ds.cohort.termdb && ds.cohort.termdb.termjson && ds.cohort.termdb.termjson.map) {
							attr = ds.cohort.termdb.termjson.map.get(k)
						}
					}
					if (attr) {
						if (attr.isfloat) {
							i[k] = Number.parseFloat(i[k])
						} else if (attr.isinteger) {
							i[k] = Number.parseInt(i[k])
						}
					}
				}

				ds.cohort.tohash(i, ds)
			})
		}
		ds.cohort.annorows = Object.values(ds.cohort.annotation)
		console.log(ds.label + ': total samples from sample table: ' + ds.cohort.annorows.length)

		if (ds.cohort.survivalplot) {
			// ds.cohort.annotation needs to be loaded for initing survival
			const sp = ds.cohort.survivalplot
			if (!sp.plots) throw '.plots{} missing from survivalplot'

			// make the object for initiating client
			sp.init = {
				plottypes: []
			}

			for (const k in sp.plots) {
				const p = sp.plots[k]
				if (!p.name) throw '.name missing from survivalplot ' + k
				if (!p.serialtimekey) throw '.serialtimekey missing from survivalplot ' + k
				if (!p.iscensoredkey) throw '.iscensoredkey missing from survivalplot ' + k
				if (!p.timelabel) throw '.timelabel missing from survivalplot ' + k
				p.key = k

				sp.init.plottypes.push({
					key: k,
					name: p.name,
					timelabel: p.timelabel
				})
			}

			if (sp.samplegroupattrlst) {
				sp.init.samplegroupings = []
				for (const a of sp.samplegroupattrlst) {
					if (!a.key) throw '.key missing from an attr of samplegroupattrlst for survival'

					const attr = ds.cohort.sampleAttribute.attributes[a.key]
					if (!attr) throw 'unknown attribute key "' + a.key + '" from survival samplegroupattrlst'

					const value2count = new Map()
					for (const samplename in ds.cohort.annotation) {
						const sobj = ds.cohort.annotation[samplename]
						const v = sobj[a.key]
						if (v == undefined) {
							// sample not annotated by it
							continue
						}

						let hasoutcome = false
						// if the sample has info in any plot, will count it
						for (const k in sp.plots) {
							if (sobj[sp.plots[k].serialtimekey] != undefined) {
								hasoutcome = true
								break
							}
						}

						if (hasoutcome) {
							if (value2count.has(v)) {
								value2count.set(v, value2count.get(v) + 1)
							} else {
								value2count.set(v, 1)
							}
						}
					}
					if (value2count.size == 0) throw 'no value found for "' + a.key + '" from survival samplegroupattrlst'

					const lst = []
					for (const [v, c] of value2count) {
						lst.push({ value: v, count: c })
					}
					sp.init.samplegroupings.push({
						key: a.key,
						label: attr.label,
						values: lst
					})
				}
			}
		}
	}

	if (ds.mutationAttribute) {
		/*
		mutation-level attributes
		for items in svcnv track:
			.mattr{}
		for vcf:
			FORMAT
		*/
		if (!ds.mutationAttribute.attributes) throw 'attributes{} missing from mutationAttribute'
		for (const key in ds.mutationAttribute.attributes) {
			const a = ds.mutationAttribute.attributes[key]
			if (!a.label) throw '.label missing for key ' + key + ' from mutationAttribute.attributes'
			if (a.appendto_link) {
				// this is pmid, no .values{}
				continue
			}
			if (a.values) {
				for (const v in a.values) {
					const b = a.values[v]
					if (!b.name) throw '.name missing for value ' + v + ' of key ' + key + ' from mutationAttribute.attributes'
				}
			} else {
				// allow values{} missing
			}
		}
	}

	if (ds.alleleAttribute) {
		/*
		vcf info field, allele-level
		*/
		if (!ds.alleleAttribute.attributes) throw 'attributes{} missing from alleleAttribute'
		for (const key in ds.alleleAttribute.attributes) {
			const a = ds.alleleAttribute.attributes[key]
			if (!a.label) throw '.label missing for key ' + key + ' from alleleAttribute.attributes'
			if (a.isnumeric) {
				continue
			}
			// not numeric value
			if (!a.values) throw '.values{} missing for non-numeric key ' + key + ' from alleleAttribute.attributes'
			for (const v in a.values) {
				const b = a.values[v]
				if (!b.name) throw '.name missing for value ' + v + ' of key ' + key + ' from alleleAttribute.attributes'
			}
		}
	}

	if (ds.locusAttribute) {
		/*
		vcf info field, locus-level
		*/
		if (!ds.locusAttribute.attributes) throw 'attributes{} missing from locusAttribute'
		for (const key in ds.locusAttribute.attributes) {
			const a = ds.locusAttribute.attributes[key]
			if (!a.label) throw '.label missing for key ' + key + ' from locusAttribute.attributes'
			if (a.isnumeric) {
				continue
			}
			if (a.appendto_link) {
				// no .values{}
				continue
			}
			// not numeric value
			if (!a.values) throw '.values{} missing for non-numeric key ' + key + ' from locusAttribute.attributes'
			for (const v in a.values) {
				const b = a.values[v]
				if (!b.name) throw '.name missing for value ' + v + ' of key ' + key + ' from locusAttribute.attributes'
			}
		}
	}

	if (ds.queries) {
		// ds.queries is the 1st generation track

		for (const querykey in ds.queries) {
			// server may choose to remove it
			if (_servconfig.remove_queries && _servconfig.remove_queries.indexOf(querykey) != -1) {
				delete ds.queries[querykey]
				continue
			}

			const query = ds.queries[querykey]

			// server may choose to hide some queries
			if (_servconfig.hide_queries && _servconfig.hide_queries.indexOf(querykey) != -1) {
				// this query will be hidden on client
				query.hideforthemoment = 1
			}

			if (query.istrack) {
				if (!query.type) throw '.type missing for track query ' + querykey

				if (query.viewrangeupperlimit) {
					if (!Number.isInteger(query.viewrangeupperlimit))
						throw '.viewrangeupperlimit should be integer for track query ' + querykey
				}

				if (query.type == common.tkt.mdsjunction) {
					const err = mds_init_mdsjunction(query, ds, genome)
					if (err) throw querykey + ' (mdsjunction) error: ' + err
				} else if (query.type == common.tkt.mdscnv) {
					// obsolete

					const err = mds_init_mdscnv(query, ds, genome)
					if (err) throw querykey + ' (mdscnv) error: ' + err
				} else if (query.type == common.tkt.mdssvcnv) {
					// replaces mdscnv

					const err = mds_init_mdssvcnv(query, ds, genome)
					if (err) throw querykey + ' (svcnv) error: ' + err
				} else if (query.type == common.tkt.mdsvcf) {
					// snvindel

					const err = mds_init_mdsvcf(query, ds, genome)
					if (err) throw querykey + ' (vcf) error: ' + err
				} else {
					throw 'unknown track type for a query: ' + query.type + ' ' + querykey
				}

				mds_mayPrecompute_grouptotal(query, ds)
			} else if (query.isgenenumeric) {
				const err = mds_init_genenumeric(query, ds, genome)
				if (err) throw querykey + ' (genenumeric) error: ' + err
			} else {
				throw 'unknown type of query from ' + querykey
			}
		}
	}

	if (ds.track) {
		await mds2_init.init_track(ds, genome)
	}

	if (ds.annotationsampleset2matrix) {
		if (!ds.cohort) throw 'ds.cohort misssing when annotationsampleset2matrix is in use'
		if (!ds.cohort.annotation) throw 'ds.cohort.annotation misssing when annotationsampleset2matrix is in use'
		if (!ds.queries) throw 'ds.queries misssing when annotationsampleset2matrix is in use'
		if (!ds.annotationsampleset2matrix.key) throw '.key STR missing in annotationsampleset2matrix'
		if (!ds.annotationsampleset2matrix.groups) throw '.groups{} missing in annotationsampleset2matrix'
		if (typeof ds.annotationsampleset2matrix.groups != 'object')
			throw 'ds.annotationsampleset2matrix.groups{} not an object'
		for (const groupvalue in ds.annotationsampleset2matrix.groups) {
			const thisgroup = ds.annotationsampleset2matrix.groups[groupvalue]
			// a group will have 1 or more smaller groups, each is samples from a study
			if (!thisgroup.groups || !Array.isArray(thisgroup.groups) || thisgroup.groups.length == 0)
				throw '.groups[] must be nonempty array in ' + groupvalue
			for (const group of thisgroup.groups) {
				if (!group.name) throw '.name missing from one of .groups[] in ' + groupvalue
				const smat = group.matrixconfig
				if (!smat) throw '.matrixconfig missing from one of .groups[] of ' + groupvalue
				if (!smat.features) throw '.features[] missing from group ' + groupvalue
				if (!Array.isArray(smat.features)) throw '.features[] should be array from group ' + groupvalue
				if (smat.features.length == 0) throw '.features[] zero length from group ' + groupvalue
				for (const feature of smat.features) {
					if (ds.annotationsampleset2matrix.commonfeatureattributes) {
						// apply common attributes to each feature
						for (const k in ds.annotationsampleset2matrix.commonfeatureattributes) {
							// not to overwrite predefined value
							if (feature[k] == undefined) {
								feature[k] = ds.annotationsampleset2matrix.commonfeatureattributes[k]
							}
						}
					}
					if (feature.ismutation) {
						if (!feature.position)
							throw 'position missing from feature ' + JSON.stringify(feature) + ' from group ' + groupvalue
						if (!feature.querykeylst) throw '.querykeylst[] missing from ismutation feature from group ' + groupvalue
						if (!Array.isArray(feature.querykeylst))
							throw '.querykeylst[] not an array from ismutation feature from group ' + groupvalue
						if (feature.querykeylst.length == 0)
							throw '.querykeylst[] zero length from ismutation feature from group ' + groupvalue
						for (const querykey of feature.querykeylst) {
							if (!ds.queries[querykey])
								throw 'unknown query key "' + querykey + '" from ismutation feature of group ' + groupvalue
						}
						continue
					}
					return 'unknown feature type from group ' + groupvalue
				}
				if (!smat.limitsamplebyeitherannotation)
					throw '.limitsamplebyeitherannotation[] missing from group ' + groupvalue
				if (!Array.isArray(smat.limitsamplebyeitherannotation))
					throw '.limitsamplebyeitherannotation[] should be array from group ' + groupvalue
				if (smat.limitsamplebyeitherannotation.length == 0)
					throw '.limitsamplebyeitherannotation[] zero length from group ' + groupvalue
				for (const lim of smat.limitsamplebyeitherannotation) {
					if (!lim.key) throw 'key missing from one of limitsamplebyeitherannotation from group ' + groupvalue
					if (!lim.value) throw 'value missing from one of limitsamplebyeitherannotation from group ' + groupvalue
				}
			}
		}
		delete ds.annotationsampleset2matrix.commonfeatureattributes
	}
}

function mds_mayPrecompute_grouptotal(query, ds) {
	if (!query.groupsamplebyattr) return
	query.groupsamplebyattr.key2group = new Map()
	for (const samplename in ds.cohort.annotation) {
		mdssvcnv_grouper(samplename, [], query.groupsamplebyattr.key2group, [], ds, query)
	}
}

function mds_init_mdsjunction(query, ds, genome) {
	// mdsjunction only allows single track

	if (query.readcountCutoff) {
		if (!Number.isInteger(query.readcountCutoff) || query.readcountCutoff < 1)
			return 'readcountCutoff must be positive integer'
	}

	let cwd = null
	let _file

	if (query.file) {
		const [err, tmp] = validate_tabixfile(query.file)
		if (err) return 'tabix file error: ' + err
		_file = tmp
	} else if (query.url) {
		// TODO cache_index sync
		// need to set query.usedir to cache path
		_file = query.url
	} else {
		return 'no file or url given for mdsjunction ' + query.name
	}

	const arg = { encoding: 'utf8' }
	if (cwd) {
		arg.cwd = cwd
	}

	const header = child_process.execSync(tabix + ' -H ' + _file, arg).trim()
	if (header) {
		// has header, get samples
		const lines = header.split('\n')
		if (lines.length != 1) return 'mdsjunction file has multiple header lines (begin with #), but should have just 1'
		const lst = lines[0].split('\t')
		// #chr \t start \t stop \t strand \t type \t samples ...
		if (lst[5]) {
			query.samples = lst.slice(5)
			query.attributeSummary = mds_query_attrsum4samples(query.samples, ds)
			query.hierarchySummary = mds_query_hierarchy4samples(query.samples, ds)
			for (const name in query.hierarchySummary) {
				let levelcount = 0
				for (const k in query.hierarchySummary[name]) levelcount++
				console.log(levelcount + ' ' + name + ' hierarchy levels for ' + query.name)
			}
		}
	}

	{
		const tmp = child_process.execSync(tabix + ' -l ' + _file, arg).trim()
		if (!tmp) return 'no chromosomes found'
		query.nochr = common.contigNameNoChr(genome, tmp.split('\n'))
	}

	console.log(
		'(mdsjunction) ' +
			query.name +
			': ' +
			(query.samples ? query.samples.length : 0) +
			' samples, ' +
			(query.nochr ? 'no "chr"' : 'has "chr"')
	)

	if (!query.infoFilter) return '.infoFilter{} missing'
	if (!query.infoFilter.lst) return '.lst[] missing from .infoFilter'
	// currently infoFilter contains Type (column 5) and splice events, both are categorical
	for (const info of query.infoFilter.lst) {
		if (!info.key) return '.key missing from one of infoFilter'
		if (!info.label) return '.label missing from one of infoFilter'
		if (!info.categories) return '.categories missing from one of infoFilter'
		for (const k in info.categories) {
			if (!info.categories[k].label) return '.label missing from one category of ' + info.label
			if (!info.categories[k].color) return '.color missing from on category of ' + info.label
		}
		if (info.hiddenCategories) {
			// allow initially hidden categories
			for (const k in info.hiddenCategories) {
				if (!info.categories[k]) return 'invalid hidden key ' + k + ' of ' + info.label
			}
		} else {
			info.hiddenCategories = {}
		}
	}

	if (!query.singlejunctionsummary) return '.singlejunctionsummary missing but is currently required from ' + query.name
	if (query.singlejunctionsummary.readcountboxplotpercohort) {
		if (!query.singlejunctionsummary.readcountboxplotpercohort.groups)
			return '.groups[] missing from query.singlejunctionsummary.readcountboxplotpercohort for ' + query.name
		for (const g of query.singlejunctionsummary.readcountboxplotpercohort.groups) {
			if (!g.key) return '.key missing from one group of query.singlejunctionsummary.readcountboxplotpercohort.groups'
			if (!g.label)
				return '.label missing from one group of query.singlejunctionsummary.readcountboxplotpercohort.groups'
		}
	}
}

function mds_query_attrsum4samples(samples, ds) {
	/*
	summarizes a group of samples by list of attributes in ds.cohort.attributes.lst[]

	a query from mds has total list of samples, e.g. samples in mdsjunction represent those with RNA-seq
	for these samples, will sum up .totalCount for cohort annotation attributes/values (by ds.cohort.attributes)
	rather than computing .totalCount over all samples of the ds.cohort, so as to limit to relevant assays
	so on cohortFilter legend it will only show totalCount from those samples with RNA-seq etc
	*/
	if (!ds.cohort || !ds.cohort.annotation || !ds.cohort.attributes || !samples) return

	const result = {}
	for (const attr of ds.cohort.attributes.lst) {
		// TODO numeric attribute?

		const v2c = {}
		for (const value in attr.values) {
			v2c[value] = 0
		}
		// go over samples look for this attribute
		for (const sample of samples) {
			const anno = ds.cohort.annotation[sample]
			if (!anno) {
				// this sample has no annotation
				continue
			}
			const thisvalue = anno[attr.key]
			if (thisvalue == undefined) {
				// this sample not annotated by this attribute
				continue
			}
			if (thisvalue in v2c) {
				v2c[thisvalue]++
			}
		}
		result[attr.key] = v2c
	}
	return result
}

function mds_query_hierarchy4samples(samples, ds) {
	/*
	given a list of sample names, generate hierarchy summary

		key: hierarchy path (HM...BALL...ERG)
		value: number of samples

	works for both initializing the sample sets from each ds query, and also for samples in view range in real-time track query
	*/
	if (!ds.cohort || !ds.cohort.annotation || !ds.cohort.hierarchies || samples.length == 0) return
	const lst = []
	for (const n of samples) {
		const a = ds.cohort.annotation[n]
		if (!a) continue
		lst.push(a)
	}

	const results = {}

	for (const hierarchy of ds.cohort.hierarchies.lst) {
		const nodes = stratinput(lst, hierarchy.levels)
		const root = d3stratify()(nodes)
		root.sum(i => i.value)
		const id2count = {}
		root.eachBefore(i => {
			id2count[i.id] = i.value
		})
		results[hierarchy.name] = id2count
	}
	return results
}

function mds_init_mdscnv(query, ds, genome) {
	// mdscnv only allows single track

	let cwd = null
	let _file

	if (query.file) {
		const [err, tmp] = validate_tabixfile(query.file)
		if (err) return 'tabix file error: ' + err
		_file = tmp
	} else if (query.url) {
		// TODO cache_index sync
		// need to set query.usedir to cache path
		_file = query.url
	} else {
		return 'no file or url given for (mdscnv) ' + query.name
	}

	const arg = { encoding: 'utf8' }
	if (cwd) {
		arg.cwd = cwd
	}

	const header = child_process.execSync(tabix + ' -H ' + _file, arg).trim()
	if (header) {
		// has header, get samples
		const lines = header.split('\n')
		if (lines.length != 1) return 'mdscnv file has multiple header lines (begin with #), but should have just 1'
		const lst = lines[0].split('\t')
		query.samples = lst.slice(5)
		query.attributeSummary = mds_query_attrsum4samples(query.samples, ds)
		query.hierarchySummary = mds_query_hierarchy4samples(query.samples, ds)
		for (const name in query.hierarchySummary) {
			let levelcount = 0
			for (const k in query.hierarchySummary[name]) levelcount++
			console.log(levelcount + ' ' + name + ' hierarchy levels for ' + query.name)
		}
	}

	{
		const tmp = child_process.execSync(tabix + ' -l ' + _file, arg).trim()
		if (!tmp) return 'no chromosomes found'
		query.nochr = common.contigNameNoChr(genome, tmp.split('\n'))
	}

	console.log(
		'(' +
			query.type +
			') ' +
			query.name +
			': ' +
			(query.samples ? query.samples.length : 'no') +
			' samples, ' +
			(query.nochr ? 'no "chr"' : 'has "chr"')
	)
}

function mds_init_mdssvcnv(query, ds, genome) {
	// only allows single track, since there is no challenge merging multiple into one

	let cwd = null
	let _file

	if (query.file) {
		const [err, tmp] = validate_tabixfile(query.file)
		if (err) return 'tabix file error: ' + err
		_file = tmp
	} else if (query.url) {
		// TODO cache_index sync
		// need to set query.usedir to cache path
		_file = query.url
	} else {
		return 'no file or url given for (svcnv) ' + query.name
	}

	const arg = { encoding: 'utf8' }
	if (cwd) {
		arg.cwd = cwd
	}

	const header = child_process.execSync(tabix + ' -H ' + _file, arg).trim()
	if (header) {
		// has header, get samples
		const set = new Set()
		for (const line of header.split('\n')) {
			for (const s of line.split(' ').slice(1)) {
				set.add(s)
			}
		}
		if (set.size == 0) return 'no samples from the header line'
		query.samples = [...set]

		if (ds.cohort && ds.cohort.annotation) {
			// find & report unannotated samples
			const unknown = new Set()
			for (const sample of query.samples) {
				if (!ds.cohort.annotation[sample]) {
					unknown.add(sample)
				}
			}
			if (unknown.size) {
				console.log(
					'mdssvcnv unannotated samples: ' + (query.noprintunannotatedsamples ? unknown.size : [...unknown].join(' '))
				)
			}
		}

		/*
		// not used at the moment
		query.attributeSummary = mds_query_attrsum4samples(query.samples, ds)
		query.hierarchySummary = mds_query_hierarchy4samples(query.samples,ds)
		for(const hierarchyname in query.hierarchySummary) {
			let levelcount=0
			for(const k in query.hierarchySummary[ hierarchyname ]) levelcount++
			console.log(levelcount+' '+hierarchyname+' hierarchy levels for '+query.name)
		}
		*/
	}

	{
		const tmp = child_process.execSync(tabix + ' -l ' + _file, arg).trim()
		if (!tmp) return 'no chromosomes found'
		query.nochr = common.contigNameNoChr(genome, tmp.split('\n'))
	}

	if (query.expressionrank_querykey) {
		// check expression rank, data from another query
		const thatquery = ds.queries[query.expressionrank_querykey]
		if (!thatquery) return 'invalid key by expressionrank_querykey'
		if (!thatquery.isgenenumeric) return 'query ' + query.expressionrank_querykey + ' not tagged as isgenenumeric'
	}

	if (query.vcf_querykey) {
		// check expression rank, data from another query
		const thatquery = ds.queries[query.vcf_querykey]
		if (!thatquery) return 'invalid key by vcf_querykey'
		if (thatquery.type != common.tkt.mdsvcf) return 'query ' + query.vcf_querykey + ' not of mdsvcf type'
	}

	if (query.groupsamplebyattr) {
		if (!query.groupsamplebyattr.attrlst) return '.attrlst[] missing from groupsamplebyattr'
		if (query.groupsamplebyattr.attrlst.length == 0) return 'groupsamplebyattr.attrlst[] empty array'
		if (!ds.cohort) return 'groupsamplebyattr in use but ds.cohort missing'
		if (!ds.cohort.annotation) return 'groupsamplebyattr in use but ds.cohort.annotation missing'
		if (!ds.cohort.sampleAttribute) {
			ds.cohort.sampleAttribute = {}
		}
		if (!ds.cohort.sampleAttribute.attributes) {
			ds.cohort.sampleAttribute.attributes = {}
			console.log('cohort.sampleAttribute added when groupsamplebyattr is in use')
		}
		for (const attr of query.groupsamplebyattr.attrlst) {
			if (!attr.k) return 'k missing from one of groupsamplebyattr.attrlst[]'
			if (!ds.cohort.sampleAttribute.attributes[attr.k]) {
				ds.cohort.sampleAttribute.attributes[attr.k] = {
					label: attr.label || attr.k
				}
			}
		}
		if (query.groupsamplebyattr.sortgroupby) {
			if (!query.groupsamplebyattr.sortgroupby.key) return '.key missing from .sortgroupby'
			if (!query.groupsamplebyattr.sortgroupby.order) return '.order[] missing from .sortgroupby'
			if (!Array.isArray(query.groupsamplebyattr.sortgroupby.order)) return '.order must be an array'
			// values of order[] is not validated
		}
		if (!query.groupsamplebyattr.attrnamespacer) query.groupsamplebyattr.attrnamespacer = ', '
	}

	console.log(
		'(' +
			query.type +
			') ' +
			query.name +
			': ' +
			(query.samples ? query.samples.length : 'no') +
			' samples, ' +
			(query.nochr ? 'no "chr"' : 'has "chr"')
	)
}

function mds_init_genenumeric(query, ds, genome) {
	if (!query.datatype) return 'datatype missing'
	if (query.viewrangeupperlimit) {
		if (Number.isNaN(query.viewrangeupperlimit)) return 'invalid value for viewrangeupperlimit'
	}

	let cwd = null
	let _file
	if (query.file) {
		const [err, tmp] = validate_tabixfile(query.file)
		if (err) return 'tabix file error: ' + err
		_file = tmp
	} else {
		// no url support yet
		return 'file missing'
	}

	const arg = { cwd: cwd, encoding: 'utf8' }

	{
		const tmp = child_process.execSync(tabix + ' -H ' + _file, arg).trim()
		if (!tmp) return 'no header line (#sample <sample1> ...)'
		// allow multiple # lines
		const set = new Set()
		for (const line of tmp.split('\n')) {
			const l = line.split(' ')
			for (let i = 1; i < l.length; i++) {
				set.add(l[i])
			}
		}
		if (set.size == 0) return 'no sample names from header line'
		query.samples = [...set]
		console.log('(genenumeric) ' + query.name + ': ' + query.samples.length + ' samples')
	}
	if (query.boxplotbysamplegroup) {
		if (!query.boxplotbysamplegroup.attributes) return 'boxplotbysamplegroup.attributes missing'
		if (!Array.isArray(query.boxplotbysamplegroup.attributes)) return 'boxplotbysamplegroup.attributes should be array'
		for (const a of query.boxplotbysamplegroup.attributes) {
			if (!a.k) return 'k missing from one of boxplotbysamplegroup.attributes[]'
		}
	}
}

function mds_init_mdsvcf(query, ds, genome) {
	/*
	mixture of snv/indel (vcf), ITD, and others
	that are not either cnv or sv
	has member tracks, each track of one type of data
	*/

	if (!query.tracks) return 'tracks[] missing'
	if (!Array.isArray(query.tracks)) return 'tracks should be array'

	/*
	info from all member tracks are merged, this requires the same info shared across multiple tracks must be identical
	*/
	query.info = {}

	for (const tk of query.tracks) {
		if (!tk.file) return 'file missing from a track (url not supported yet)'

		// will set tk.cwd for url

		const [err, _file] = validate_tabixfile(tk.file)
		if (err) return 'tabix file error: ' + err

		if (tk.type == common.mdsvcftype.vcf) {
			const arg = { cwd: tk.cwd, encoding: 'utf8' }

			const tmp = child_process.execSync(tabix + ' -H ' + _file, arg).trim()
			if (!tmp) return 'no meta/header lines for ' + _file
			const [info, format, samples, errs] = vcf.vcfparsemeta(tmp.split('\n'))
			if (errs) return 'error parsing vcf meta for ' + _file + ': ' + errs.join('\n')

			if (samples.length == 0) return 'vcf file has no sample: ' + _file

			for (const k in info) {
				query.info[k] = info[k]
			}

			tk.format = format

			if (tk.samplenameconvert) {
				if (typeof tk.samplenameconvert != 'function') return '.samplenameconvert must be function'
				for (const s of samples) {
					s.name = tk.samplenameconvert(s.name)
				}
			}

			tk.samples = samples
		} else {
			return 'invalid track type: ' + tk.type
		}

		if (ds.cohort && ds.cohort.annotation) {
			/*
			ds.cohort.annotation is sample-level, e.g. tumor
			if vcf encodes germline stuff on person, or need some kind of sample name conversion,
			need to identify such in this track
			*/
			const notannotated = []
			for (const s of tk.samples) {
				if (!ds.cohort.annotation[s.name]) {
					notannotated.push(s.name)
				}
			}
			if (notannotated.length) {
				console.log(ds.label + ': VCF ' + tk.file + ' has unannotated samples: ' + notannotated.join(','))
			}
		}

		{
			const tmp = child_process.execSync(tabix + ' -l ' + _file, { encoding: 'utf8' }).trim()
			if (tmp == '') return 'no chr from ' + _file
			tk.nochr = common.contigNameNoChr(genome, tmp.split('\n'))
		}

		console.log(
			'(' + query.type + ') ' + _file + ': ' + tk.samples.length + ' samples, ' + (tk.nochr ? 'no chr' : 'has chr')
		)
	}

	if (query.singlesamples) {
		if (!query.singlesamples.tablefile) return '.singlesamples.tablefile missing for the VCF query'
		query.singlesamples.samples = {}
		let count = 0
		for (const line of fs
			.readFileSync(path.join(serverconfig.tpmasterdir, query.singlesamples.tablefile), { encoding: 'utf8' })
			.trim()
			.split('\n')) {
			if (!line) continue
			if (line[0] == '#') continue
			const l = line.split('\t')
			if (l[0] && l[1]) {
				query.singlesamples.samples[l[0]] = l[1]
				count++
			}
		}
		console.log(count + ' single-sample VCF files')
	}
}

////////////// end of __MDS
