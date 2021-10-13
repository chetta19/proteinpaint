const app = require('./app')
const fs = require('fs')
const path = require('path')
const utils = require('./utils')
const termdbsql = require('./termdb.sql')
const phewas = require('./termdb.phewas')
const density_plot = require('./termdb.densityPlot')
const cuminc = require('./termdb.cuminc')
const survival = require('./termdb.survival')
const regression = require('./termdb.regression')

/*
********************** EXPORTED
handle_request_closure
copy_term
********************** INTERNAL
trigger_*
*/

export function handle_request_closure(genomes) {
	/*
	 */

	return async (req, res) => {
		app.log(req)

		const q = req.query

		try {
			const genome = genomes[q.genome]
			if (!genome) throw 'invalid genome'
			const ds = genome.datasets[q.dslabel]
			if (!ds) throw 'invalid dslabel'
			if (!ds.cohort) throw 'ds.cohort missing'
			const tdb = ds.cohort.termdb
			if (!tdb) throw 'no termdb for this dataset'

			// process triggers
			if (q.gettermbyid) return trigger_gettermbyid(q, res, tdb)
			if (q.getcategories) return trigger_getcategories(q, res, tdb, ds)
			if (q.getmedian) return trigger_getmedianbins(q, res, ds)
			if (q.getpercentile) return trigger_getpercentile(q, res, ds)
			if (q.getnumericcategories) return trigger_getnumericcategories(q, res, tdb, ds)
			if (q.default_rootterm) return await trigger_rootterm(q, res, tdb)
			if (q.get_children) return await trigger_children(q, res, tdb)
			if (q.findterm) return await trigger_findterm(q, res, tdb)
			if (q.scatter) return trigger_scatter(q, res, tdb, ds)
			if (q.getterminfo) return trigger_getterminfo(q, res, tdb)
			if (q.phewas) {
				if (q.update) return await phewas.update_image(q, res)
				if (q.getgroup) return await phewas.getgroup(q, res)
				return await phewas.trigger(q, res, ds)
			}
			if (q.density) return await density_plot(q, res, ds)
			if (q.gettermdbconfig) return trigger_gettermdbconfig(res, tdb)
			if (q.getcohortsamplecount) return trigger_getcohortsamplecount(q, res, ds)
			if (q.getsamplecount) return trigger_getsamplecount(q, res, ds)
			if (q.getsamples) return trigger_getsamples(q, res, ds)
			if (q.getcuminc) return await trigger_getincidence(q, res, ds)
			if (q.getsurvival) return await trigger_getsurvival(q, res, ds)
			if (q.getregression) return await trigger_getregression(q, res, ds)

			throw "termdb: don't know what to do"
		} catch (e) {
			res.send({ error: e.message || e })
			if (e.stack) console.log(e.stack)
		}
	}
}

function trigger_getsamples(q, res, ds) {
	// this may be potentially limited?
	// ds may allow it as a whole
	// individual term may allow getting from it
	const lst = termdbsql.get_samples(JSON.parse(decodeURIComponent(q.filter)), ds)
	let samples = lst
	if (ds.sampleidmap) {
		samples = lst.map(i => ds.sampleidmap.get(i))
	}
	res.send({ samples })
}

function trigger_gettermdbconfig(res, tdb) {
	res.send({
		termdbConfig: {
			// add attributes here to reveal to client
			selectCohort: tdb.selectCohort, // optional
			cumincplot4condition: tdb.cumincplot4condition, // optional
			survivalplot: tdb.survivalplot, // optional
			supportedChartTypes: tdb.q.getSupportedChartTypes()
		}
	})
}

function trigger_gettermbyid(q, res, tdb) {
	const t = tdb.q.termjsonByOneid(q.gettermbyid)
	res.send({
		term: t ? copy_term(t) : undefined
	})
}

function trigger_getcohortsamplecount(q, res, ds) {
	res.send(termdbsql.get_cohortsamplecount(q, ds))
}

function trigger_getsamplecount(q, res, ds) {
	res.send(termdbsql.get_samplecount(q, ds))
}

async function trigger_rootterm(q, res, tdb) {
	const cohortValues = q.cohortValues ? q.cohortValues : ''
	const treeFilter = q.treeFilter ? q.treeFilter : ''
	res.send({ lst: await tdb.q.getRootTerms(cohortValues, treeFilter) })
}

async function trigger_children(q, res, tdb) {
	/* get children terms
may apply ssid: a premade sample set
*/
	if (!q.tid) throw 'no parent term id'
	const cohortValues = q.cohortValues ? q.cohortValues : ''
	const treeFilter = q.treeFilter ? q.treeFilter : ''
	const terms = await tdb.q.getTermChildren(q.tid, cohortValues, treeFilter)
	res.send({ lst: terms.map(copy_term) })
}

export function copy_term(t) {
	/*
t is jsondata from terms table

do not directly hand over the term object to client; many attr to be kept on server
*/
	const t2 = JSON.parse(JSON.stringify(t))

	// delete things not to be revealed to client

	return t2
}

async function trigger_findterm(q, res, termdb) {
	// TODO also search categories
	if (typeof q.cohortStr !== 'string') q.cohortStr = ''
	if (q.exclude_types) {
		const exclude_types = JSON.parse(decodeURIComponent(q.exclude_types))
		q.exclude_types = exclude_types.map(t => t.toLowerCase())
	}
	const terms_ = await termdb.q.findTermByName(q.findterm, 10, q.cohortStr, q.exclude_types, q.treeFilter)
	const terms = terms_.map(copy_term)
	const id2ancestors = {}
	terms.forEach(term => {
		term.__ancestors = termdb.q.getAncestorIDs(term.id)
	})
	if (q.exclude_types) {
		res.send({ lst: terms.filter(t => true) })
	} else {
		res.send({ lst: terms })
	}
}

function trigger_getcategories(q, res, tdb, ds) {
	// thin wrapper of get_summary
	// works for all types of terms, not just categorical
	if (!q.tid) throw '.tid missing'
	const term = tdb.q.termjsonByOneid(q.tid)
	const arg = {
		ds,
		term1_id: q.tid
	}
	switch (term.type) {
		case 'categorical':
			arg.term1_q = q.term1_q
			break
		case 'integer':
		case 'float':
			arg.term1_q = q.term1_q ? JSON.parse(q.term1_q) : term.bins.default
			break
		case 'condition':
			arg.term1_q = q.term1_q
				? q.term1_q
				: {
						bar_by_grade: q.bar_by_grade,
						bar_by_children: q.bar_by_children,
						value_by_max_grade: q.value_by_max_grade,
						value_by_most_recent: q.value_by_most_recent,
						value_by_computable_grade: q.value_by_computable_grade
				  }
			break
		default:
			throw 'unknown term type'
	}
	if (q.filter) arg.filter = JSON.parse(decodeURIComponent(q.filter))

	const result = termdbsql.get_summary(arg)
	const bins = result.CTE1.bins ? result.CTE1.bins : []
	const orderedLabels =
		term.type == 'condition' && term.grades
			? term.grades.map(grade => term.values[grade].label)
			: term.type == 'condition'
			? [0, 1, 2, 3, 4, 5, 9].map(grade => term.values[grade].label) // hardcoded default order
			: bins.map(bin => (bin.name ? bin.name : bin.label))

	res.send({ lst: result.lst, orderedLabels })
}
function trigger_getnumericcategories(q, res, tdb, ds) {
	if (!q.tid) throw '.tid missing'
	const term = tdb.q.termjsonByOneid(q.tid)
	const arg = {
		ds,
		term_id: q.tid
		//filter
	}
	if (q.filter) arg.filter = JSON.parse(decodeURIComponent(q.filter))
	const lst = termdbsql.get_summary_numericcategories(arg)
	res.send({ lst })
}

function trigger_scatter(q, res, tdb, ds) {
	q.ds = ds
	if (q.tvslst) q.tvslst = JSON.parse(decodeURIComponent(q.tvslst))
	if (q.filter) q.filter = JSON.parse(decodeURIComponent(q.filter))
	const startTime = +new Date()
	const t1 = tdb.q.termjsonByOneid(q.term1_id)
	if (!t1) throw `Invalid term1_id="${q.term1_id}"`
	if (t1.type != 'float' && t1.type != 'integer') throw `term is not integer/float for scatter data`

	const t2 = tdb.q.termjsonByOneid(q.term2_id)
	if (!t2) throw `Invalid term1_id="${q.term2_id}"`
	if (t2.type != 'float' && t2.type != 'integer') throw `term2 is not integer/float for scatter data`

	const rows = termdbsql.get_rows_by_two_keys(q, t1, t2)
	const result = {
		rows
		//time: +(new Date()) - startTime
	}
	res.send(result)
}

function trigger_getterminfo(q, res, tdb) {
	/* get terminfo the the term
rightnow only few conditional terms have grade info
*/
	if (!q.tid) throw 'no term id'
	res.send({ terminfo: tdb.q.getTermInfo(q.tid) })
}

async function trigger_getincidence(q, res, ds) {
	if (!q.grade) throw 'missing grade'
	q.grade = Number(q.grade)
	if (typeof q.filter == 'string') {
		q.filter = JSON.parse(decodeURIComponent(q.filter))
	}
	const data = await cuminc.get_incidence(q, ds)
	res.send(data)
}

async function trigger_getsurvival(q, res, ds) {
	if (typeof q.filter == 'string') {
		q.filter = JSON.parse(decodeURIComponent(q.filter))
	}
	const data = await survival.get_survival(q, ds)
	res.send(data)
}

async function trigger_getregression(q, res, ds) {
	if (typeof q.filter == 'string') {
		q.filter = JSON.parse(decodeURIComponent(q.filter))
	}
	if ('cutoff' in q) q.cutoff = Number(q.cutoff)
	const data = await regression.get_regression(q, ds)
	res.send(data)
}

async function trigger_getpercentile(q, res, ds) {
	const term = ds.cohort.termdb.q.termjsonByOneid(q.tid)
	if (!term) throw 'invalid termid'
	if (term.type != 'float' && term.type != 'integer') throw 'not numerical term'
	const p = Number(q.getpercentile)
	if (!Number.isInteger(p) || p < 1 || p > 99) throw 'percentile is not 1-99 integer'
	const values = []
	const rows = termdbsql.get_rows_by_one_key({
		ds,
		key: q.tid,
		filter: q.filter ? (typeof q.filter == 'string' ? JSON.parse(q.filter) : q.filter) : null
	})
	for (const { value } of rows) {
		if (term.values && term.values[value]) {
			// is a special category
			continue
		}
		values.push(Number(value))
	}
	const sorted_values = [...values].sort((a, b) => a - b)
	const value = sorted_values[Math.floor((values.length * p) / 100)]
	res.send({ value })
}
async function trigger_getmedianbins(q, res, ds) {
	const term = ds.cohort.termdb.q.termjsonByOneid(q.tid)
	if (!term) throw 'invalid termid'
	if (term.type != 'float' && term.type != 'integer') throw 'not numerical term'
	const values = []
	const rows = termdbsql.get_rows_by_one_key({
		ds,
		key: q.tid,
		filter: q.filter ? (typeof q.filter == 'string' ? JSON.parse(q.filter) : q.filter) : null
	})
	for (const { value } of rows) {
		if (term.values && term.values[value]) {
			// is a special category
			continue
		}
		values.push(Number(value))
	}
	const sorted_values = [...values].sort((a, b) => a - b)
	const median = sorted_values[Math.floor(values.length / 2)]
	res.send({ median })
}
