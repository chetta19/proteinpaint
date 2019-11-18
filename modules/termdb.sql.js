const app = require('../app')
const binsmodule = require('./termdb.bins')
const connect_db = require('./utils').connect_db

/*

********************** EXPORTED
get_samples
get_summary
get_numericsummary
get_rows
get_rows_by_one_key
get_rows_by_two_keys
server_init_db_queries
********************** INTERNAL
makesql_by_tvsfilter
	add_categorical
	add_numerical
	add_condition
get_term_cte
	makesql_oneterm
		makesql_oneterm_condition
		makesql_numericBinCTE
uncomputablegrades_clause
grade_age_select_clause
get_label4key

*/

function makesql_by_tvsfilter(tvslst, ds) {
	/*
.tvslst[{}]
	optional
	each element is a term-value setting object
	must have already been validated by src/mds.termdb.termvaluesetting.js/validate_termvaluesetting()

_opts{}
	options for minor tweaks to the generated statement to serve other purposes,
	such as to help with getting min, max, percentiles for numeric terms 
	.columnas    "", or set t ", value" to get values
	.endclause   "GROUP BY sample",
							 or "ORDER BY value ASC" if columnas == ", value" and getting min, max, percentile


returns:
	.filters:
		one string of all filter statement intersects, with question marks
	.values[]:
		array of *bind parameters*
	.CTEname:
		the name of CTE, to be used in task-specific runner
*/
	if (!tvslst || !tvslst.length) return null
	const filters = []
	const values = []

	for (const tvs of tvslst) {
		if (tvs.term.iscategorical) {
			add_categorical(tvs)
		} else if (tvs.term.isinteger || tvs.term.isfloat) {
			add_numerical(tvs)
		} else if (tvs.term.iscondition) {
			add_condition(tvs)
		} else {
			throw 'unknown term type'
		}
	}

	const CTEname = 'filtered'
	return {
		filters: `${CTEname} AS (\n ${filters.join('\nINTERSECT\n')})\n`,
		values,
		CTEname
	}

	// helpers
	function add_categorical(tvs) {
		filters.push(
			`SELECT sample
			FROM annotations
			WHERE term_id = ?
			AND value ${tvs.isnot ? 'NOT' : ''} IN (${tvs.values.map(i => '?').join(', ')})`
		)
		values.push(tvs.term.id, ...tvs.values.map(i => i.key))
	}

	function add_numerical(tvs) {
		if (!tvs.ranges) throw '.ranges{} missing'
		values.push(tvs.term.id)
		// get term object, in case isinteger flag is missing from tvs.term
		const term = ds.cohort.termdb.q.termjsonByOneid(tvs.term.id)
		const cast = 'CAST(value AS ' + (term.isinteger ? 'INT' : 'REAL') + ')'

		const rangeclauses = []
		let hasactualrange = false // if true, will exclude special categories

		for (const range of tvs.ranges) {
			if (range.value != undefined) {
				// special category
				rangeclauses.push(cast + '=?')
				values.push(range.value)
			} else {
				// actual range
				hasactualrange = true
				const lst = []
				if (!range.startunbounded) {
					if (range.startinclusive) {
						lst.push(cast + ' >= ?')
					} else {
						lst.push(cast + ' > ? ')
					}
					values.push(range.start)
				}
				if (!range.stopunbounded) {
					if (range.stopinclusive) {
						lst.push(cast + ' <= ?')
					} else {
						lst.push(cast + ' < ? ')
					}
					values.push(range.stop)
				}
				rangeclauses.push('(' + lst.join(' AND ') + ')')
			}
		}

		let excludevalues
		if (hasactualrange && term.values) {
			excludevalues = Object.keys(term.values)
				.filter(key => term.values[key].uncomputable)
				.map(Number)
				.filter(key => tvs.isnot || !tvs.ranges.find(range => 'value' in range && range.value === key))
			if (excludevalues.length) values.push(...excludevalues)
		}

		filters.push(
			`SELECT sample
			FROM annotations
			WHERE term_id = ?
			AND ( ${rangeclauses.join(' OR ')} )
			${excludevalues && excludevalues.length ? `AND ${cast} NOT IN (${excludevalues.map(d => '?').join(',')})` : ''}`
		)
	}

	function add_condition(tvs) {
		let value_for
		if (tvs.bar_by_children) value_for = 'child'
		else if (tvs.bar_by_grade) value_for = 'grade'
		else throw 'must set the bar_by_grade or bar_by_children query parameter'

		let restriction
		if (tvs.value_by_max_grade) restriction = 'max_grade'
		else if (tvs.value_by_most_recent) restriction = 'most_recent'
		else if (tvs.value_by_computable_grade) restriction = 'computable_grade'
		else throw 'unknown setting of value_by_?'

		if (tvs.values) {
			values.push(tvs.term.id, value_for, ...tvs.values.map(i => '' + i.key))
			filters.push(
				`SELECT sample
				FROM precomputed
				WHERE term_id = ? 
				AND value_for = ? 
				AND ${restriction} = 1
				AND value IN (${tvs.values.map(i => '?').join(', ')})`
			)
		} else if (tvs.grade_and_child) {
			//grade_and_child: [{grade, child_id}]
			for (const gc of tvs.grade_and_child) {
				values.push(tvs.term.id, '' + gc.grade)
				filters.push(
					`SELECT sample
					FROM precomputed
					WHERE term_id = ? 
					AND value_for = 'grade'
					AND ${restriction} = 1
					AND value IN (?)`
				)

				values.push(tvs.term.id, gc.child_id)
				filters.push(
					`SELECT sample
					FROM precomputed
					WHERE term_id = ? 
					AND value_for = 'child'
					AND ${restriction} = 1
					AND value IN (?)`
				)
			}
		} else {
			throw 'unknown condition term filter type: expecting term-value "values" or "grade_and_child" key'
		}
	}
}

export function get_samples(tvslst, ds) {
	/*
must have tvslst[]
as the actual query is embedded in tvslst
return an array of sample names passing through the filter
*/
	const filter = makesql_by_tvsfilter(tvslst, ds)
	const string = `WITH ${filter.filters}
		SELECT sample FROM ${filter.CTEname}`

	// may cache statement
	const re = ds.cohort.db.connection.prepare(string).all(filter.values)
	return re.map(i => i.sample)
}

export function get_rows_by_one_key(q) {
	/*
get all sample and value by one key
no filter or cte
works for all attributes, including non-termdb ones

q{}
	.ds
	.key
*/
	const sql = 'SELECT sample,value FROM annotations WHERE term_id=?'
	return q.ds.cohort.db.connection.prepare(sql).all(q.key)
}

export function get_rows_by_two_keys(q, t1, t2) {
	/*
XXX only works for two numeric terms, not for any other types

get all sample and value by one key
no filter or cte
works for all attributes, including non-termdb ones

q{}
  .ds
  .key
*/
	const filter = makesql_by_tvsfilter(q.tvslst, q.ds)
	const values = filter ? filter.values.slice() : []
	const CTE0 = get_term_cte(q, values, 0)
	values.push(q.term1_id, q.term2_id)

	const t1excluded = t1.values
		? Object.keys(t1.values)
				.filter(i => t1.values[i].uncomputable)
				.map(Number)
		: []
	const t1unannovals = t1excluded.length ? `AND value NOT IN (${t1excluded.join(',')})` : ''

	const t2excluded = t2.values
		? Object.keys(t2.values)
				.filter(i => t2.values[i].uncomputable)
				.map(Number)
		: []
	const t2unannovals = t2excluded.length ? `AND value NOT IN (${t2excluded.join(',')})` : ''

	const sql = `WITH
    ${filter ? filter.filters + ',' : ''}
    ${CTE0.sql},
    t1 AS (
      SELECT sample, CAST(value AS real) as value
      FROM annotations
      WHERE term_id=? ${t1unannovals}
    ),
    t2 AS (
      SELECT sample, CAST(value AS real) as value
      FROM annotations
      WHERE term_id=? ${t2unannovals}
    )
    SELECT
      t0.value AS val0,
      t1.value AS val1, 
      t2.value AS val2
    FROM t1
    JOIN ${CTE0.tablename} t0 ${CTE0.join_on_clause}
    JOIN t2 ON t2.sample = t1.sample
    ${filter ? 'WHERE t1.sample in ' + filter.CTEname : ''}`

	return q.ds.cohort.db.connection.prepare(sql).all(values)
}

export function get_rows(q, _opts = {}) {
	/*
works for only termdb terms; non-termdb attributes will not work

gets data for barchart
returns all relevant rows of 
	{
		sample, key[0,1,2], val[0,1,2], count AS opts.countas
		CTE[0,1,2]} if opts.withCTEs == true
	}

q{}
	.tvslst
	.ds
	.term[0,1,2]_id
	.term[0,1,2]_q

opts{} options to tweak the query, see const default_opts = below
	
	.withCTEs		  true: return {lst,CTE0,CTE1,CTE2}, 
							  false: return lst 
	
	.columnas		  default to return all rows when 't1.sample AS sample',
							  or set to "count(distinct t1.sample) as samplecount" to aggregate
	
	.endclause:   default to '',
							  or "GROUP BY key0, key1, key2" when aggregating by samplecount
							  or +" ORDER BY ..." + " LIMIT ..."

*/
	if (typeof q.tvslst == 'string') q.tvslst = JSON.parse(decodeURIComponent(q.tvslst))

	// do not break code that still uses the opts.groupby key-value
	// can take this out once all calling code has been migrated
	if (_opts.groupby) {
		_opts.endclause = _opts.groupby
		delete _opts.groupby
	}
	const default_opts = {
		withCTEs: true,
		columnas: 't1.sample AS sample',
		endclause: ''
	}
	const opts = Object.assign(default_opts, _opts)
	const filter = makesql_by_tvsfilter(q.tvslst, q.ds)
	const values = filter ? filter.values.slice() : []
	const CTE0 = get_term_cte(q, values, 0)
	const CTE1 = get_term_cte(q, values, 1)
	const CTE2 = get_term_cte(q, values, 2)

	const statement = `WITH
		${filter ? filter.filters + ',' : ''}
		${CTE0.sql},
		${CTE1.sql},
		${CTE2.sql}
		SELECT
      t0.key AS key0,
      t0.value AS val0,
      t1.key AS key1,
      t1.value AS val1,
      t2.key AS key2,
      t2.value AS val2,
      ${opts.columnas}
		FROM ${CTE1.tablename} t1
		JOIN ${CTE0.tablename} t0 ${CTE0.join_on_clause}
		JOIN ${CTE2.tablename} t2 ${CTE2.join_on_clause}
		${filter ? 'WHERE t1.sample in ' + filter.CTEname : ''}
		${opts.endclause}`
	const lst = q.ds.cohort.db.connection.prepare(statement).all(values)

	return !opts.withCTEs ? lst : { lst, CTE0, CTE1, CTE2, filter }
}

function get_term_cte(q, values, index) {
	/*
Generates one or more CTEs by term

q{}
	.tvslst
	.ds
	.term[0,1,2]_id
	.term[0,1,2]_q
values[] string/numeric to replace ? in CTEs
index    0 for term0, 1 for term1, 2 for term2
*/
	const termid = q['term' + index + '_id']
	const term_is_genotype = q['term' + index + '_is_genotype']
	if (index == 1 && !term_is_genotype) {
		// only term1 is required
		if (!termid) throw 'missing term id'
	} else if (!termid || term_is_genotype) {
		// term2 and term0 are optional
		// no table to query
		const tablename = 'samplekey_' + index
		return {
			tablename,
			sql: `${tablename} AS (\nSELECT null AS sample, '' as key, '' as value\n)`,
			join_on_clause: ''
		}
	}

	// otherwise, must be a valid term
	const term = q.ds.cohort.termdb.q.termjsonByOneid(termid)
	if (!term) throw 'no term found by id'
	let termq = q['term' + index + '_q'] || {}
	if (typeof termq == 'string') {
		termq = JSON.parse(decodeURIComponent(termq))
	}
	const CTE = makesql_oneterm(term, q.ds, termq, values, index)
	if (index != 1) {
		CTE.join_on_clause = `ON t${index}.sample = t1.sample`
	}
	return CTE
}

export function get_summary(q) {
	/*
q{}
	.tvslst
	.ds
	.term[0,1,2]_id
	.term[0,1,2]_q
*/
	const result = get_rows(q, {
		withCTEs: true,
		columnas: 'count(distinct t1.sample) as samplecount',
		endclause: 'GROUP BY key0, key1, key2'
	})

	const nums = [0, 1, 2]
	const labeler = {}
	for (const n of nums) {
		labeler[n] = getlabeler(q, n, result)
	}
	for (const row of result.lst) {
		for (const n of nums) {
			labeler[n](row)
		}
	}
	return result.lst
}

function getlabeler(q, i, result) {
	/*
Returns a function to (re)label a data object

q{}
	.tvslst
	.ds
	.term[0,1,2]_id
	.term[0,1,2]_q
i       0,1,2 corresponding to term[i]_[id|q]
result  returned by get_rows(, {withCTEs: 1})
*/
	const key = 'key' + i
	const value = 'val' + i
	const label = 'label' + i
	const default_labeler = row => {
		delete row[key]
		delete row[value]
	}

	const term_id = q['term' + i + '_id']
	if (!term_id) return default_labeler
	const term = q.ds.cohort.termdb.q.termjsonByOneid(term_id)
	if (!term_id) return default_labeler

	// when there is only term1 and no term0/term2 simplify
	// the property names to just "key" and "label" with no index
	// -- consider keeping key1 terminology consistent later?
	const tkey = i != 1 || q.term0_id || q.term2_id ? key : 'key'
	const tlabel = i != 1 || q.term0_id || q.term2_id ? key : 'label'
	if (term.isinteger || term.isfloat) {
		const CTE = result['CTE' + i]
		const range = 'range' + (i != 1 || q.term0_id || q.term2_id ? i : '')
		return row => {
			row[range] = CTE.name2bin.get(row[key])
			row[tlabel] = row[key]
			delete row[value]
			// remove key index as needed
			if (tkey !== key) {
				row[tkey] = row[key]
				delete row[key]
			}
		}
	} else {
		const term_q = q['term' + i + '_q']
		return row => {
			row[tlabel] = get_label4key(row[key], term, term_q, q.ds)
			delete row[value]
			// remove key index as needed
			if (tkey !== key) {
				row[tkey] = row[key]
				delete row[key]
			}
		}
	}
}

function get_label4key(key, term, q, ds) {
	// get label for a key based on term type and setting
	if (term.iscategorical) {
		return term.values && key in term.values ? term.values[key].label : key
	}
	if (term.iscondition) {
		if (!term.values) throw 'missing term.values for condition term'
		if (q.bar_by_grade) {
			if (!(key in term.values)) throw `unknown grade='${key}'`
			return term.values[key].label
		} else {
			return key
		}
	}
	if (term.values) {
		return key in term.values ? term.values[key].label : key
	}
	if (term.isinteger || term.isfloat) throw 'should not work for numeric term'
	throw 'unknown term type'
}

function makesql_oneterm(term, ds, q, values, index) {
	/*
form the query for one of the table in term0-term1-term2 overlaying

CTE for each term resolves to a table of {sample,key}

term{}
q{}
	.binconfig[]
	.value_by_?
	.bar_by_?
values[]: collector of bind parameters

returns { sql, tablename }
*/
	const tablename = 'samplekey_' + index
	if (term.iscategorical) {
		values.push(term.id)
		return {
			sql: `${tablename} AS (
				SELECT sample,value as key, value as value
				FROM annotations
				WHERE term_id=?
			)`,
			tablename
		}
	}
	if (term.isfloat || term.isinteger) {
		values.push(term.id)
		const bins = makesql_numericBinCTE(term, q, ds, index)
		return {
			sql: `${bins.sql},
			${tablename} AS (
				SELECT bname as key, sample, v as value
				FROM ${bins.tablename}
			)`,
			tablename,
			name2bin: bins.name2bin,
			bins: bins.bins
		}
	}
	if (term.iscondition) {
		return makesql_oneterm_condition(term, q, ds, values, index)
	}
	throw 'unknown term type'
}

function makesql_oneterm_condition(term, q, ds, values, index = '') {
	/*
	return {sql, tablename}
*/
	const grade_table = 'grade_table_' + index
	const term_table = 'term_table_' + index
	const out_table = 'out_table_' + index
	const value_for = q.bar_by_children ? 'child' : q.bar_by_grade ? 'grade' : ''
	if (!value_for) throw 'must set the bar_by_grade or bar_by_children query parameter'

	const restriction = q.value_by_max_grade
		? 'max_grade'
		: q.value_by_most_recent
		? 'most_recent'
		: q.value_by_computable_grade
		? 'computable_grade'
		: ''
	if (!restriction) throw 'must set a valid value_by_*'
	values.push(term.id, value_for)

	return {
		sql: `${out_table} AS (
			SELECT 
				sample, 
				${value_for == 'grade' ? 'CAST(value AS integer) as key' : 'value as key'}, 
				${value_for == 'grade' ? 'CAST(value AS integer) as value' : 'value'}
			FROM precomputed
			WHERE term_id = ? 
				AND value_for = ? 
				AND ${restriction} = 1
		)`,
		tablename: out_table
	}
}

function makesql_numericBinCTE(term, q, ds, index = '') {
	/*
decide bins and produce CTE

q{}
	.binconfig[]   list of custom bins
	.index           0,1,2 corresponding to term*_id           
returns { sql, tablename, name2bin, bins, binconfig }
*/
	const [bins, binconfig] = get_bins(q, term, ds, index)
	const bin_def_lst = []
	const name2bin = new Map() // k: name str, v: bin{}
	const bin_size = binconfig.bin_size
	let has_percentiles = false
	let binid = 0
	for (const b of bins) {
		if (!('name' in b) && b.label) b.name = b.label
		name2bin.set(b.name, b)
		bin_def_lst.push(
			`SELECT '${b.name}' AS name,
			${b.start == undefined ? 0 : b.start} AS start,
			${b.stop == undefined ? 0 : b.stop} AS stop,
			0 AS unannotated,
			${b.startunbounded ? 1 : 0} AS startunbounded,
			${b.stopunbounded ? 1 : 0} AS stopunbounded,
			${b.startinclusive ? 1 : 0} AS startinclusive,
			${b.stopinclusive ? 1 : 0} AS stopinclusive,
			${binid++} AS binorder`
		)
	}
	const excludevalues = []
	if (term.values) {
		for (const key in term.values) {
			if (!term.values[key].uncomputable) continue
			excludevalues.push(key)
			const v = term.values[key]
			bin_def_lst.push(
				`SELECT '${v.label}' AS name,
        ${key} AS start,
        0 AS stop,
        1 AS unannotated,
        0 AS startunbounded,
        0 AS stopunbounded,
        0 AS startinclusive,
        0 AS stopinclusive,
        ${binid++} AS binorder`
			)
			name2bin.set(v.label, {
				is_unannotated: true,
				value: key,
				label: v.label
			})
		}
	}

	const bin_def_table = 'bin_defs_' + index
	const bin_sample_table = 'bin_sample_' + index

	const sql = `${bin_def_table} AS (
			${bin_def_lst.join(' UNION ALL ')}
		),
		${bin_sample_table} AS (
			SELECT
				sample,
				CAST(value AS ${term.isinteger ? 'INT' : 'REAL'}) AS v,
				CAST(value AS ${term.isinteger ? 'INT' : 'REAL'}) AS value,
				b.name AS bname,
				b.binorder AS binorder
			FROM
				annotations a
			JOIN ${bin_def_table} b ON
				( b.unannotated=1 AND v=b.start )
				OR
				(
					${excludevalues.length ? 'v NOT IN (' + excludevalues.join(',') + ') AND' : ''}
					(
						b.startunbounded=1
						OR v>b.start
						OR (b.startinclusive=1 AND v=b.start)
					)
					AND
					(
						b.stopunbounded
						OR v<b.stop
						OR (b.stopinclusive=1 AND v=b.stop)
					)
				)
			WHERE
			term_id=?
		)`
	return {
		sql,
		tablename: bin_sample_table,
		name2bin,
		bins,
		binconfig
	}
}

export function get_bins(q, term, ds, index) {
	/*

q{}
	.binconfig
	.tvslst
	.index           0,1,2 correponding to term*_id

term
ds 

*/
	const binconfig = q.binconfig
		? q.binconfig
		: term.bins && term.bins.less && index != 1
		? term.bins.less
		: term.bins
		? term.bins.default
		: null
	if (!binconfig) throw 'unable to determine the binning configuration'
	q.binconfig = binconfig

	const bins = binsmodule.compute_bins(binconfig, percentiles => get_numericMinMaxPct(ds, term, q.tvslst, percentiles))
	return [bins, binconfig]
}

export function get_numericsummary(q, term, ds, _tvslst = [], withValues = false) {
	/*
to produce the summary table of mean, median, percentiles
at a numeric barchart
*/
	const tvslst = typeof _tvslst == 'string' ? JSON.parse(decodeURIComponent(_tvslst)) : _tvslst

	if ((term.isinteger || term.isfloat) && !tvslst.find(tv => tv.term.id == term.id && 'ranges' in tv)) {
		const [bins, binconfig] = get_bins(q, term, ds)
		tvslst.push({ term, ranges: bins })
	}
	const filter = makesql_by_tvsfilter(tvslst, ds)
	const values = []
	if (filter) {
		values.push(...filter.values)
	}
	const excludevalues = term.values ? Object.keys(term.values).filter(key => term.values[key].uncomputable) : []
	const string = `${filter ? 'WITH ' + filter.filters + ' ' : ''}
		SELECT CAST(value AS ${term.isinteger ? 'INT' : 'REAL'}) AS value
		FROM annotations
		WHERE
		${filter ? 'sample IN ' + filter.CTEname + ' AND ' : ''}
		term_id=?
		${excludevalues.lenth ? 'AND value NOT IN (' + excludevalues.join(',') + ')' : ''}`
	values.push(term.id)

	const s = ds.cohort.db.connection.prepare(string)
	const result = s.all(values)
	if (!result.length) return null
	result.sort((i, j) => i.value - j.value)

	const stat = app.boxplot_getvalue(result)
	stat.mean = result.length ? result.reduce((s, i) => s + i.value, 0) / result.length : 0

	let sd = 0
	for (const i of result) {
		sd += Math.pow(i.value - stat.mean, 2)
	}
	stat.sd = Math.sqrt(sd / (result.length - 1))
	stat.min = result[0].value
	stat.max = result[result.length - 1].value
	if (withValues) stat.values = result.map(i => i.value)
	return stat
}

export function get_numericMinMaxPct(ds, term, tvslst = [], percentiles = []) {
	/* 
	similar arguments to get_numericSummary()
	but min, max, percentilex are calculated by sqlite db
	to lessen the burden on the node server 
	(individual values are not returned in this query)

	percentiles[]
		optional array of desired percentile values [X, Y, ...]

	returns {min, max, pX, pY, ...} 
	where 
		pX is the value at the Xth percentile,
		pY is the value at the Yth percentile,
		and so on ...
*/
	const filter = makesql_by_tvsfilter(tvslst, ds)
	const values = []
	if (filter) {
		values.push(...filter.values)
	}
	const excludevalues = term.values ? Object.keys(term.values).filter(key => term.values[key].uncomputable) : []
	values.push(term.id)

	const ctes = []
	const ptablenames = []
	const cols = []
	let tablename
	for (const n of percentiles) {
		tablename = 'pct_' + n
		ctes.push(`
		${tablename} AS (
		  SELECT value
		  FROM vals
		  LIMIT 1
		  OFFSET (
		    SELECT cast ( x as int ) - ( x < cast ( x as int ))
		    FROM (
		      SELECT cast(?*pct as int) as x 
		      FROM p
		    )
		  )
		)`)
		values.push(n)
		ptablenames.push(tablename)
		cols.push(`${tablename}.value AS ${'p' + n}`)
	}

	const sql = `WITH
		${filter ? filter.filters + ', ' : ''} 
		vals AS (
			SELECT CAST(value AS ${term.isinteger ? 'INT' : 'REAL'}) AS value
			FROM annotations
			WHERE
			${filter ? 'sample IN ' + filter.CTEname + ' AND ' : ''}
			term_id=?
			${excludevalues.length ? 'AND value NOT IN (' + excludevalues.join(',') + ')' : ''}
			ORDER BY value ASC
		),
		p AS (
			SELECT count(value)/100 as pct
			FROM vals
		)
		${ctes.length ? ',\n' + ctes.join(',') : ''}
		SELECT 
			min(vals.value) as vmin,
			max(vals.value) as vmax
			${cols.length ? ',\n' + cols.join(',\n') : ''} 
		FROM vals ${ptablenames.length ? ',' + ptablenames.join(',') : ''}`

	const s = ds.cohort.db.connection.prepare(sql)
	const result = s.all(values)

	const summary = !result.length ? {} : result[0]
	summary.max = result[0].vmax
	summary.min = result[0].vmin
	return summary
}

export function server_init_db_queries(ds) {
	/*
initiate db queries and produce function wrappers
run only once

as long as the termdb table and logic is universal
probably fine to hardcode such query strings here
and no need to define them in each dataset
thus less things to worry about...
*/
	if (!ds.cohort) throw 'ds.cohort missing'
	if (!ds.cohort.db) throw 'ds.cohort.db missing'

	let cn
	if (ds.cohort.db.file) {
		cn = connect_db(ds.cohort.db.file)
	} else if (ds.cohort.db.file_fullpath) {
		// only on ppr
		cn = connect_db(ds.cohort.db.file_fullpath, true)
	} else {
		throw 'neither .file or .file_fullpath is set on ds.cohort.db'
	}
	console.log(`DB connected for ${ds.label}: ${ds.cohort.db.file || ds.cohort.db.file_fullpath}`)

	ds.cohort.db.connection = cn

	if (!ds.cohort.termdb) throw 'ds.cohor.termdb missing'
	ds.cohort.termdb.q = {}
	const q = ds.cohort.termdb.q

	{
		const s = cn.prepare('SELECT * FROM category2vcfsample')
		// must be cached as there are lots of json parsing
		let cache
		q.getcategory2vcfsample = () => {
			if (cache) return cache
			cache = s.all()
			for (const i of cache) {
				i.q = JSON.parse(i.q)
				i.categories = JSON.parse(i.categories)
			}
			return cache
		}
	}
	{
		const s = cn.prepare('SELECT * FROM alltermsbyorder')
		let cache
		q.getAlltermsbyorder = () => {
			if (cache) return cache
			const tmp = s.all()
			cache = []
			for (const i of tmp) {
				const term = q.termjsonByOneid(i.id)
				if (term) {
					// alltermsbyorder maybe out of sync and some terms may be deleted
					cache.push({
						group_name: i.group_name,
						term
					})
				}
			}
			return cache
		}
	}
	{
		const s = cn.prepare('SELECT jsondata FROM terms WHERE id=?')
		const cache = new Map()
		/* should only cache result for valid term id, not for invalid ids
		as invalid id is arbitrary and indefinite
		an attack using random strings as termid can overwhelm the server memory
		*/
		q.termjsonByOneid = id => {
			if (cache.has(id)) return cache.get(id)
			const t = s.get(id)
			if (t) {
				const j = JSON.parse(t.jsondata)
				j.id = id
				cache.set(id, j)
				return j
			}
			return undefined
		}
	}

	{
		const s = cn.prepare('select id from terms where parent_id=?')
		const cache = new Map()
		q.termIsLeaf = id => {
			if (cache.has(id)) return cache.get(id)
			let re = true
			const t = s.get(id)
			if (t && t.id) re = false
			cache.set(id, re)
			return re
		}
	}

	{
		const s = cn.prepare('SELECT id,jsondata FROM terms WHERE parent_id is null')
		let cache = null
		q.getRootTerms = () => {
			if (cache) return cache
			cache = s.all().map(i => {
				const t = JSON.parse(i.jsondata)
				t.id = i.id
				return t
			})
			return cache
		}
	}
	{
		const s = cn.prepare('SELECT parent_id FROM terms WHERE id=?')
		{
			const cache = new Map()
			q.termHasParent = id => {
				if (cache.has(id)) return cache.get(id)
				let re = false
				const t = s.get(id)
				if (t && t.parent_id) re = true
				cache.set(id, re)
				return re
			}
		}
		{
			const cache = new Map()
			q.getTermParentId = id => {
				if (cache.has(id)) return cache.get(id)
				let re = undefined
				const t = s.get(id)
				if (t && t.parent_id) re = t.parent_id
				cache.set(id, re)
				return re
			}
		}
		{
			const cache = new Map()
			q.getTermParent = id => {
				if (cache.has(id)) return cache.get(id)
				const pid = q.getTermParentId(id)
				let re = undefined
				if (pid) {
					re = q.termjsonByOneid(pid)
				}
				cache.set(id, re)
				return re
			}
		}
	}
	{
		const s = cn.prepare('SELECT id,jsondata FROM terms WHERE id IN (SELECT id FROM terms WHERE parent_id=?)')
		const cache = new Map()
		q.getTermChildren = id => {
			if (cache.has(id)) return cache.get(id)
			const tmp = s.all(id)
			let re = undefined
			if (tmp) {
				re = tmp.map(i => {
					const j = JSON.parse(i.jsondata)
					j.id = i.id
					return j
				})
			}
			cache.set(id, re)
			return re
		}
	}
	{
		// may not cache result of this one as query string may be indefinite
		const s = cn.prepare('SELECT id,jsondata FROM terms WHERE name LIKE ?')
		q.findTermByName = (n, limit) => {
			const tmp = s.all('%' + n + '%')
			if (tmp) {
				const lst = []
				for (const i of tmp) {
					const j = JSON.parse(i.jsondata)
					j.id = i.id
					lst.push(j)
					if (lst.length == 10) break
				}
				return lst
			}
			return undefined
		}
	}
	{
		const s1 = cn.prepare('SELECT MAX(CAST(value AS INT))  AS v FROM annotations WHERE term_id=?')
		const s2 = cn.prepare('SELECT MAX(CAST(value AS REAL)) AS v FROM annotations WHERE term_id=?')
		const cache = new Map()
		q.findTermMaxvalue = (id, isint) => {
			if (cache.has(id)) return cache.get(id)
			const tmp = (isint ? s1 : s2).get(id)
			if (tmp) {
				cache.set(id, tmp.v)
				return tmp.v
			}
			return undefined
		}
	}
	{
		const s = cn.prepare('SELECT ancestor_id FROM ancestry WHERE term_id=?')
		const cache = new Map()
		q.getAncestorIDs = id => {
			if (cache.has(id)) return cache.get(id)
			const tmp = s.all(id).map(i => i.ancestor_id)
			cache.set(id, tmp)
			return tmp
		}
	}
	{
		// select sample and category, only for categorical term
		// right now only for category-overlay on maf-cov plot
		const s = cn.prepare('SELECT sample,value FROM annotations WHERE term_id=?')
		q.getSample2value = id => {
			return s.all(id)
		}
	}
	{
		//get term_info for a term
		//rightnow only few conditional terms have grade info
		const s = cn.prepare('SELECT jsonhtml FROM termhtmldef WHERE id=?')
		const cache = new Map()
		q.getTermInfo = id => {
			if (cache.has(id)) return cache.get(id)
			const t = s.get(id)
			if (t) {
				const j = JSON.parse(t.jsonhtml)
				j.id = id
				cache.set(id, j)
				return j
			}
			return undefined
		}
	}
}
