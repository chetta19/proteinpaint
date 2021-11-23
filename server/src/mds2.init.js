const app = require('./app')
const path = require('path')
const fs = require('fs')
const spawn = require('child_process').spawn
const utils = require('./utils')
const server_init_db_queries = require('./termdb.sql').server_init_db_queries
const validate_single_numericrange = require('../shared/mds.termdb.termvaluesetting').validate_single_numericrange

/*
********************** EXPORTED
init_db
init_track
client_copy
server_updateAttr
********************** INTERNAL
validate_termdbconfig
may_validate_info_fields
may_validate_population
may_init_vcf
may_init_ld
may_init_svcnv
may_sum_samples
*/

const serverconfig = require('./serverconfig')

export async function init_db(ds, app = null, basepath = null) {
	/* db should be required
	must initiate db first, then process other things
	as db may be needed (e.g. getting json of a term)
	*/
	if (!ds.cohort.termdb) throw 'cohort.termdb missing when cohort.db is used'
	validate_termdbconfig(ds.cohort.termdb)
	server_init_db_queries(ds)
	// the "refresh" attribute on ds.cohort.db should be set in serverconfig.json
	// for a genome dataset, using "updateAttr: [[...]]
	if (ds.cohort.db.refresh && app) setDbRefreshRoute(ds, app, basepath)
}
export async function init_track(ds, genome) {
	/* initiate the mds2 track upon launching server
	 */

	if (!ds.track) throw 'no mds2 track; missing ds.track{}'
	const tk = ds.track
	if (!tk.name) tk.name = ds.label

	may_validate_info_fields(tk)
	may_validate_population(tk)
	await may_init_vcf(tk.vcf, genome, ds)
	await may_init_ld(tk.ld, genome, ds)
	await may_init_svcnv(tk.svcnv, genome, ds)
	may_sum_samples(tk)
	if (tk.samples) console.log(ds.label + ': mds2: ' + tk.samples.length + ' samples')
}

export function client_copy(ds) {
	/* make client copy of the track
the client copy stays at .mds.track{}
*/
	const t0 = ds.track
	const tk = {
		name: t0.name,
		info_fields: t0.info_fields,
		sample_termfilter: t0.sample_termfilter
	}
	if (t0.vcf) {
		tk.vcf = {
			numerical_axis: t0.vcf.numerical_axis,
			format: t0.vcf.format,
			info: t0.vcf.info,
			check_pecanpie: t0.vcf.check_pecanpie
		}
		if (t0.vcf.plot_mafcov) {
			tk.vcf.plot_mafcov = {}
			if (ds.cohort && ds.cohort.termdb) {
				tk.vcf.plot_mafcov.overlay_term = t0.vcf.plot_mafcov.overlay_term || {}
			}
		}
		if (t0.vcf.termdb_bygenotype) {
			tk.vcf.termdb_bygenotype = true
		}
		if (t0.populations) {
			tk.populations = t0.populations
		}
	}
	if (t0.ld) {
		tk.ld = {
			tracks: t0.ld.tracks.map(i => {
				return { name: i.name, shown: i.shown }
			}),
			overlay: t0.ld.overlay
		}
	}
	return tk
}

function validate_termdbconfig(tdb) {
	if (tdb.phewas) {
		// phewas supported
		if (tdb.phewas.samplefilter4termtype) {
			// optional
			if (tdb.phewas.samplefilter4termtype.condition) {
				// filter for condition terms
				if (!tdb.phewas.samplefilter4termtype.condition.filter)
					throw 'filter{} missing from tdb.phewas.samplefilter4termtype.condition'
				// todo: validate filter
			}
		}
		if (tdb.phewas.comparison_groups) {
			// optional, only for precompute
			if (!Array.isArray(tdb.phewas.comparison_groups)) throw 'tdb.phewas.comparison_groups is not array'
			if (tdb.phewas.comparison_groups.length == 0) throw 'tdb.phewas.comparison_groups[] cannot be empty'
		}
	}
	if (tdb.selectCohort) {
		// cohort selection supported
		if (!tdb.selectCohort.term) throw 'term{} missing from termdb.selectCohort'
		if (!tdb.selectCohort.term.id) throw 'id missing from termdb.selectCohort.term'
		if (typeof tdb.selectCohort.term.id != 'string') throw 'termdb.selectCohort.term.id is not string'
		if (tdb.selectCohort.term.type != 'categorical')
			throw 'type is not hardcoded "categorical" from termdb.selectCohort.term'
		if (!tdb.selectCohort.values) throw 'values[] missing from termdb.selectCohort'
		if (!Array.isArray(tdb.selectCohort.values)) throw 'termdb.selectCohort.values is not array'
		if (tdb.selectCohort.values.length == 0) throw 'termdb.selectCohort.values[] cannot be empty'
		for (const v of tdb.selectCohort.values) {
			if (!v.keys) throw 'keys[] missing from one of selectCohort.values[]'
			if (!Array.isArray(v.keys)) throw 'keys[] is not array from one of selectCohort.values[]'
			if (v.keys.length == 0) throw 'keys[] is empty from one of selectCohort.values[]'
		}
	}
}

function may_validate_info_fields(tk) {
	if (!tk.info_fields) return
	if (!Array.isArray(tk.info_fields)) throw 'tk.info_fields is not array'
	for (const i of tk.info_fields) {
		if (!i.key) throw '.key missing from one of tk.info_fields[]'
		if (!i.label) i.label = i.key
		if (i.iscategorical) {
			if (!Array.isArray(i.values)) throw '.values[] not an array of categorical INFO field: ' + i.key
			for (const v of i.values) {
				if (!v.key) throw 'key missing from a value of categorical INFO: ' + i.key
				if (!v.label) v.label = v.key
			}
		} else if (i.isfloat || i.isinteger) {
			if (!i.range) throw '.range{} missing from a numerical INFO: ' + i.key
			validate_single_numericrange(i.range, 'tk.info_fields[]')
		} else if (i.isflag) {
		} else {
			throw 'tk.info_fields unknown type: ' + i.key
		}
	}
}

function may_validate_population(tk) {
	if (!tk.populations) return
	if (!Array.isArray(tk.populations)) throw 'populations should be array'
	for (const p of tk.populations) {
		if (!p.key) throw 'key missing from a population'
		if (!p.label) p.label = p.key
		if (!Array.isArray(p.sets)) throw '.sets is not an array in population: ' + p.key
		for (const s of p.sets) {
			if (!s.infokey_AC) throw 'infokey_AC missing from a set of population: ' + p.key
			if (!s.infokey_AN) throw 'infokey_AN missing from a set of population: ' + p.key
			if (p.termfilter) {
				if (!s.termfilter_value)
					throw 'termfilter_value missing from a set of population where termfilter is set: ' + p.key
			}
		}
	}
}

async function may_init_ld(ld, genome, ds) {
	if (!ld) return
	if (!Array.isArray(ld.tracks)) throw 'ld.tracks[] not an array'
	if (ld.tracks.length == 0) throw 'ld.tracks[] is empty array'
	for (const tk of ld.tracks) {
		if (!tk.name) throw '.name missing from a ld track'
		if (!Number.isInteger(tk.viewrangelimit)) throw 'viewrangelimit missing from ld track "' + tk.name + '"'
		if (tk.file) {
			if (!tk.file.startsWith(serverconfig.tpmasterdir)) {
				tk.file = path.join(serverconfig.tpmasterdir, tk.file)
			}
			await utils.validate_tabixfile(tk.file)
			tk.nochr = await utils.tabix_is_nochr(tk.file, null, genome)
			console.log(tk.file + ': ' + (tk.nochr ? 'no chr' : 'has chr'))
		} else if (tk.chr2file) {
		} else {
			throw 'ld tk has no file or chr2file'
		}
	}
	// for testing, may remove
	//if( ld.tracks.length==1 ) ld.tracks[0].shown=true
}

async function may_init_vcf(vcftk, genome, ds) {
	if (!vcftk) return

	if (vcftk.chr2bcffile) {
		// one bcf file per chr
		if (typeof vcftk.chr2bcffile != 'object') throw 'chr2bcffile not an object'
		// conver to full path
		for (const c in vcftk.chr2bcffile) {
			vcftk.chr2bcffile[c] = path.join(serverconfig.tpmasterdir, vcftk.chr2bcffile[c])
		}
		// FIXME for now only parse header of the bcf file of default chr
		// TODO validate all files
		const tmptk = { file: vcftk.chr2bcffile[genome.defaultcoord.chr] }
		if (!tmptk.file) throw 'default chr missing from chr2bcffile'
		await utils.init_one_vcf(tmptk, genome, true)
		vcftk.info = tmptk.info
		vcftk.format = tmptk.format
		vcftk.samples = tmptk.samples
		vcftk.nochr = tmptk.nochr
	} else {
		throw 'vcftk.chr2bcffile is missing'
	}

	if (vcftk.AD && vcftk.AD.chr2bcffile) {
		// optional setting
		if (typeof vcftk.AD.chr2bcffile != 'object') throw 'AD.chr2bcffile not an object'
		// conver to full path
		for (const c in vcftk.AD.chr2bcffile) {
			vcftk.AD.chr2bcffile[c] = path.join(serverconfig.tpmasterdir, vcftk.AD.chr2bcffile[c])
		}
		// FIXME for now only parse header of the bcf file of default chr
		// TODO validate all files
		const tmptk = { file: vcftk.AD.chr2bcffile[genome.defaultcoord.chr] }
		if (!tmptk.file) throw 'default chr missing from AD.chr2bcffile'
		await utils.init_one_vcf(tmptk, genome, true)
		vcftk.AD.info = tmptk.info
		vcftk.AD.format = tmptk.format
		vcftk.AD.samples = tmptk.samples
		vcftk.AD.nochr = tmptk.nochr
		console.log(ds.label + ' vcf: AD: ' + vcftk.AD.samples.length + ' samples')
		// convert string names to integer, per termdb design spec
		for (const n of vcftk.AD.samples) {
			const i = Number(n.name)
			if (!Number.isInteger(i)) throw 'non-integer vcf sample: ' + n.name
			n.name = i
		}
	}

	if (vcftk.samples) {
		// convert vcf string names to integer, per termdb design spec
		for (const n of vcftk.samples) {
			const i = Number(n.name)
			if (!Number.isInteger(i)) throw 'non-integer vcf sample: ' + n.name
			n.name = i
		}
		console.log(ds.label + ' vcf: ' + vcftk.samples.length + ' samples')
	} else {
		console.log(ds.label + ' vcf: no samples')
	}

	if (vcftk.numerical_axis) {
		if (vcftk.numerical_axis.info_keys) {
			if (!Array.isArray(vcftk.numerical_axis.info_keys)) throw 'numerical_axis.info_keys should be an array'
			for (const key of vcftk.numerical_axis.info_keys) {
				const a = vcftk.info[key.key]
				if (!a) throw 'INFO field "' + key.key + '" not found for numerical_axis'
				if (a.Type != 'Float' && a.Type != 'Integer')
					throw 'INFO field "' + key.key + '" from numerical_axis not of integer or float type'
				if (a.Number != '1' && a.Number != 'A')
					throw 'for numerical axis, INFO field "' + key.key + '" only allows to be Number=1 or Number=A'
			}
		}
		// TODO allow other type of plot e.g. boxplot
	}

	if (vcftk.plot_mafcov) {
		if (!vcftk.AD) throw '.plot_mafcov enabled but .AD{} missing from vcf'
		if (!vcftk.AD.samples) throw '.plot_mafcov enabled but no samples from vcf'
		if (!vcftk.AD.format) throw '.plot_mafcov enabled but no FORMAT fields from vcf'
		if (!vcftk.AD.format.AD) throw '.plot_mafcov enabled but the AD FORMAT field is missing'
		if (vcftk.AD.format.AD.Number != 'R') throw 'AD FORMAT field Number=R is not true'
		if (vcftk.AD.format.AD.Type != 'Integer') throw 'AD FORMAT field Type=Integer is not true'
		if (vcftk.plot_mafcov.overlay_term) {
			if (!ds.cohort) throw 'ds.cohort missing when plot_mafcov.overlay_term defined'
			if (!ds.cohort.termdb) throw 'ds.cohort.termdb missing when plot_mafcov.overlay_term defined'
			// termdb must have already been initiated
			if (!ds.cohort.termdb.q) throw 'ERR: termdb.q{} missing while trying to access termdb helper functions'
			if (!ds.cohort.termdb.q.termjsonByOneid) throw 'ERR: q.termjsonByOneid missing'
			const t = ds.cohort.termdb.q.termjsonByOneid(vcftk.plot_mafcov.overlay_term)
			if (!t) throw 'unknown term id "' + vcftk.plot_mafcov.overlay_term + '" from vcftk.plot_mafcov.overlay_term'
			vcftk.plot_mafcov.overlay_term = t
		}
	}

	if (vcftk.termdb_bygenotype) {
		if (!vcftk.samples) throw '.termdb_bygenotype enabled but no samples from vcf'
		if (!vcftk.format) throw '.termdb_bygenotype enabled but no FORMAT fields from vcf'
		if (!vcftk.format.GT) throw '.termdb_bygenotype enabled but the GT FORMAT field is missing'
		if (!ds.cohort) throw 'termdb_bygenotype but ds.cohort missing'
		if (!ds.cohort.termdb) throw 'termdb_bygenotype but ds.cohort.termdb missing'
		if (vcftk.termdb_bygenotype.getAF) {
			if (!vcftk.termdb_bygenotype.termid_sex) throw 'termid_sex missing for getAF at termdb_bygenotype'
			if (!vcftk.termdb_bygenotype.value_male) throw 'value_male missing for getAF at termdb_bygenotype'
			const t = ds.cohort.termdb.q.getSample2value(vcftk.termdb_bygenotype.termid_sex)
			vcftk.termdb_bygenotype.male_samples = new Set()
			for (const i of t) {
				if (i.value == vcftk.termdb_bygenotype.value_male) vcftk.termdb_bygenotype.male_samples.add(i.sample)
			}
			if (!vcftk.termdb_bygenotype.sex_chrs) throw 'sex_chrs missing for getAF at termdb_bygenotype'
			if (!Array.isArray(vcftk.termdb_bygenotype.sex_chrs)) throw 'sex_chrs is not array'
			vcftk.termdb_bygenotype.sex_chrs = new Set(vcftk.termdb_bygenotype.sex_chrs)
		}
	}

	if (vcftk.samples) {
		vcftk.sample2arrayidx = new Map()
		for (const [i, n] of vcftk.samples.entries()) {
			vcftk.sample2arrayidx.set(n.name, i)
		}
	}
}

async function may_init_svcnv(sctk, genome) {
	if (!sctk) return
}

function may_sum_samples(tk) {
	/* sum up samples from individual track types
	 */
	const samples = new Set() // union of sample names
	if (tk.vcf && tk.vcf.samples) {
		for (const s of tk.vcf.samples) {
			// just keep sample name
			samples.add(s.name)
		}
	}
	if (tk.svcnv) {
	}
	if (samples.size) {
		tk.samples = [...samples]
	}
}

/* TODO: may move this function elsewhere so that it
	can be used for mds3 or other datasets besides mds2 */
export function server_updateAttr(db, sdb) {
	/*
sdb:
	bootstrap objects, that are elements of the "datasets" array from serverconfig, may contain .updateAttr[]
*/
	if (!sdb.updateAttr) return
	for (const row of sdb.updateAttr) {
		let pointer = db
		for (const field of row) {
			if (typeof field == 'object') {
				for (const k in field) {
					pointer[k] = field[k]
				}
			} else {
				pointer = pointer[field]
			}
		}
	}
}

/* 
	Set server routes to trigger the refresh the ds database from the web browser,
	without having to restart the server.
	
	Requires the following entry in the serverconfig.json under a genome.dataset:
	dataset = {"updateAttr": ["cohort", 'db', {"refresh": {route, files, cmd}}]}
	where
		.route STRING
			- the server route that exposes the db refresh feature
			- should contain a random substring for weak security,
			  for example 'pnet-refresh-r4Nd0m-5tr1n8', which will then be used as
			  http://sub.domain.ext:port/termdb-refresh.html?route=pnet-refresh-r4Nd0m-5tr1n8
		
		.files{}
			- key: a short string alias to a data file that may be updated,
					such as 'annotations', 'survival', etc 
			- value: the absolute path to the data file that will be updated 
		
		.cmd STRING
			- the command to run after updates are written to the data files
			- for example, "cmd": "/abs/path/to/tp/files/hg19/pnet/clinical/update.sh",
			  where the update file can have commands like this:
				
				// content of update.sh 
			  #!/bin/bash
				cd "/abs/path/to/tp/files/hg19/pnet/clinical"
				/abs/path/to/proteinpaint/utils/pnet/do.sh
*/

function setDbRefreshRoute(ds, app, basepath) {
	const r = ds.cohort.db.refresh
	// delete the optional 'refresh' attribute
	// so that the routes below will not be reset again
	// when mds2_init.init_db() is called after a
	// data file has been updated
	delete ds.cohort.db.refresh

	// return the file aliases that may be updated
	// no need to expose the target absolute paths on this server
	app.get(`${basepath}/${r.route}`, async (req, res) => {
		res.send({ label: ds.label, files: Object.keys(r.files) })
	})

	/*
		req.body{}
		- has one or more key-values, where
		- key: short string alias of the data file to update
		- value: tab-delimited string data to write to the data file
	*/
	app.post(`${basepath}/${r.route}`, async (req, res) => {
		try {
			// save file to text
			const q = req.body
			for (const name in q) {
				console.log(`Updating ${r.files[name]}`)
				fs.writeFileSync(r.files[name], q[name], { encoding: 'utf8' })
			}
			if (r.cmd) {
				const ps = spawn(...r.cmd)
				const stderr = []
				ps.stdout.on('data', data => {
					console.log(`stdout: ${data}`)
				})
				ps.stderr.on('data', data => {
					stderr.push(data)
				})
				ps.on('close', code => {
					if (code !== 0) throw `child process exited with code ${code}`
				})

				if (stderr.length) throw stderr.join('')
			}
			await init_db(ds)
			res.send({ status: 'ok' })
		} catch (e) {
			console.log(e)
			res.send({ error: e.error || e })
		}
	})
}
