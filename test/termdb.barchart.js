const serverconfig = require("../serverconfig")
const fs = require('fs')
const path = require('path')
const Partjson = require('../modules/partjson')
const load_dataset = require('../utils/sjlife2/load.sjlife').load_dataset
const ds = getDataset()

/*
  migrate modules/termdb.barchart.js data processing here
*/



function getDataset() {
  const ds = load_dataset('sjlife2.hg38.js')
  const tdb = ds.cohort.termdb
  if (!tdb || tdb.precomputed || !tdb.precomputed_file) return
  
  const filename = path.join(serverconfig.tpmasterdir, tdb.precomputed_file)
  try {
    const file = fs.existsSync(filename) ? fs.readFileSync(filename, {encoding:'utf8'}) : ''
    tdb.precomputed = JSON.parse(file.trim())
    console.log("Loaded the precomputed values from "+ filename)
  } catch(e) {
    throw 'Unable to load the precomputed file ' + filename
  }

  return ds
}


function barchart_data ( q, data0 ) {
/*
  q: objectified URL query string
  data0: the response data from /termdb-barsql, needed to reuse computed bins
*/
  // ds is loaded at the start of this file
  if(!ds.cohort) throw 'cohort missing from ds'
  if(!ds.cohort.annorows) throw `cohort.annorows is missing`
  const tdb = ds.cohort.termdb
  if (!tdb) throw 'missing ds.cohort.termdb'
  
  // support legacy query parameter names
  if (q.term1_id) q.term1 = q.term1_id
  if (!q.term1_q) q.term1_q = {}
  if (!q.term0) q.term0 = ''
  if (q.term0_id) q.term0 = q.term0_id 
  if (!q.term0_q) q.term0_q = {}
  if (!q.term2) q.term2 = ''
  if (q.term2_id) q.term2 = q.term2_id
  if (!q.term2_q) q.term2_q = {}

  // request-specific variables
  const startTime = +(new Date())
  const inReqs = [getTrackers(), getTrackers(), getTrackers()]
  inReqs.filterFxn = ()=>1 // default allow all rows, may be replaced via q.termfilter
  setValFxns(q, inReqs, ds, tdb, data0);
  const pj = getPj(q, inReqs, ds.cohort.annorows, tdb, ds)
  if (pj.tree.results) pj.tree.results.pjtime = pj.times
  return pj.tree.results
}

function getTrackers() {
  return {
    joinFxns: {"": () => ""}, // keys are term0, term1, term2 names; ...
    numValFxns: {"": () => {}}, // ... if key == empty string then the term is not specified
    unannotated: "",
    orderedLabels: [],
    unannotatedLabels: [],
    bins: [],
    uncomputable_grades: {}
  }
}

// template for partjson, already stringified so that it does not 
// have to be re-stringified within partjson refresh for every request
const templateBar = JSON.stringify({
  "@errmode": ["","","",""],
  "@before()": "=prep()",
  "@join()": {
    "idVal": "=idVal()"
  },
  results: {
    "_2:maxAcrossCharts": "=maxAcrossCharts()",
    charts: [{
      chartId: "@key",
      total: "+1",
      "_1:maxSeriesTotal": "=maxSeriesTotal()",
      "@done()": "=filterEmptySeries()",
      serieses: [{
        total: "+1",
        seriesId: "@key",
        max: "<&idVal.dataVal", // needed by client-side boxplot renderer 
        "~values": ["&idVal.dataVal",0],
        "~sum": "+&idVal.dataVal",
        "__:boxplot": "=boxplot()",
        "~samples": ["$sjlid", "set"],
        "__:AF": "=getAF()",
        "__:unannotated": "=unannotatedSeries()"
        data: [{
          dataId: "@key",
          total: "+1",
          "__:unannotated": "=unannotatedData()"
        }, "&idVal.dataId[]"],
      }, "&idVal.seriesId[]"],
    }, "&idVal.chartId[]"],
    "~sum": "+&idVal.seriesVal",
    "~values": ["&idVal.seriesVal",0],
    "__:boxplot": "=boxplot()",
    refs: {
      cols: ["&idVal.seriesId[]"],
      colgrps: ["-"], 
      rows: ["&idVal.dataId[]"],
      rowgrps: ["-"],
      col2name: {
        "&idVal.seriesId[]": {
          name: "@branch",
          grp: "-"
        }
      },
      row2name: {
        "&idVal.dataId[]": {
          name: "@branch",
          grp: "-"
        }
      },
      "__:useColOrder": "=useColOrder()",
      "__:useRowOrder": "=useRowOrder()",
      "__:unannotatedLabels": "=unannotatedLabels()",
      "__:bins": "=bins()",
      '__:q': "=q()",
      "__:grade_labels": "=grade_labels()",
      "@done()": "=sortColsRows()"
    },
    "@done()": "=sortCharts()"
  }
})

exports.barchart_data = barchart_data


function getPj(q, inReqs, data, tdb, ds) {
/*
  q: objectified URL query string
  inReq: request-specific closured functions and variables
  data: rows of annotation data
*/ 
  const kvs = [
    {i: 0, term: 'term0', key: 'chartId', val: 'chartVal', q: q.term0_q},
    {i: 1, term: 'term1', key: 'seriesId', val: 'seriesVal', q: q.term1_q},
    {i: 2, term: 'term2', key: 'dataId', val: 'dataVal', q: q.term2_q}
  ]

  inReqs[0].q = q.term0_q
  inReqs[1].q = q.term1_q
  inReqs[2].q = q.term2_q

  return new Partjson({
    data,
    seed: `{"values": []}`, // result seed 
    template: templateBar,
    "=": {
      prep(row) {
        // a falsy filter return value for a data row will cause the
        // exclusion of that row from farther processing
        return inReqs.filterFxn(row)
      },
      idVal(row, context, joinAlias) {
        // chart, series, data
        const csd = Object.create(null)
        for(const kv of kvs) {
          const termid = q[kv.term]
          const id = inReqs[kv.i].joinFxns[termid](row, context, joinAlias)
          if (id===undefined || (Array.isArray(id) && !id.length)) return
          csd[kv.key] = Array.isArray(id) ? id : [id]
          const value = typeof inReqs[kv.i].numValFxns[termid] == 'function'
            ? inReqs[kv.i].numValFxns[termid](row)
            : undefined
          csd[kv.val] = 0 && inReqs[kv.i].unannotatedLabels.includes(value)
            ? undefined
            : value 
        };
        return csd
      },
      maxSeriesTotal(row, context) {
        let maxSeriesTotal = 0
        for(const grp of context.self.serieses) {
          if (grp && grp.total > maxSeriesTotal) {
            maxSeriesTotal = grp.total
          }
        }
        return maxSeriesTotal
      },
      maxAcrossCharts(row, context) {
        let maxAcrossCharts = 0
        for(const chart of context.self.charts) {
          if (chart.maxSeriesTotal > maxAcrossCharts) {
            maxAcrossCharts = chart.maxSeriesTotal
          }
        }
        return maxAcrossCharts
      },
      boxplot(row, context) {
        if (!context.self.values || !context.self.values.length) return
        const values = context.self.values.filter(d => d !== null)
        if (!values.length) return
        values.sort((i,j)=> i - j ); //console.log(values.slice(0,5), values.slice(-5), context.self.values.sort((i,j)=> i - j ).slice(0,5))
        const stat = boxplot_getvalue( values.map(v => {return {value: v}}) )
        stat.mean = context.self.sum / values.length
        let s = 0
        for(const v of values) {
          s += Math.pow( v - stat.mean, 2 )
        }
        stat.sd = Math.sqrt( s / (values.length-1) )
        if (isNaN(stat.sd)) stat.sd = null
        return stat
      },
      numSamples(row, context) {
        return context.self.samples.size
      },
      getAF(row, context) {
        // only get AF when termdb_bygenotype.getAF is true
        if ( !ds.track
          || !ds.track.vcf
          || !ds.track.vcf.termdb_bygenotype
          || !ds.track.vcf.termdb_bygenotype.getAF
        ) return
        if (!q.term2_is_genotype) return
        if (!q.chr) throw 'chr missing for getting AF'
        if (!q.pos) throw 'pos missing for getting AF'
        
        return get_AF(
          context.self.samples ? [...context.self.samples] : [],
          q.chr,
          Number(q.pos),
          inReqs.genotype2sample,
          ds
        )
      },
      filterEmptySeries(result) {
        const nonempty = result.serieses.filter(series=>series.total)
        result.serieses.splice(0, result.serieses.length, ...nonempty)
      },
      unannotated(row, context) {
        const series = context.joins.get('series')
        if (!series) return
        let total = 0
        for(const s of idVal.seriesId) {
          if (inReqs[1].unannotatedLabels.includes(s)) {
            total += 1
          }
        }
        return total
      },
      unannotatedSeries(row, context) {
        if (!terms[1].unannotatedLabels.length) return
        const i = terms[1].unannotatedLabels.indexOf(context.self.seriesId)
        if (i == -1) return
        return {value: terms[1].unannotatedValues[i]}
      },
      unannotatedData(row, context) {
        if (!terms[2].unannotatedLabels.length) return
        const i = terms[2].unannotatedLabels.indexOf(context.self.seriesId)
        if (i == -1) return
        return {value: terms[2].unannotatedValues[i]}
      },
      annotated(row, context) {
        const series = context.joins.get('series')
        if (!series) return
        let total = 0
        for(const s of idVal.seriesId) {
          if (!inReqs[1].unannotatedLabels.includes(s)) {
            total += 1
          }
        }
        return total
      },
      sortColsRows(result) {
        if (inReqs[1].orderedLabels.length) {
          const labels = inReqs[1].orderedLabels
          result.cols.sort((a,b) => labels.indexOf(a) - labels.indexOf(b))
        }
        if (inReqs[2].orderedLabels.length) {
          const labels = inReqs[2].orderedLabels
          result.rows.sort((a,b) => labels.indexOf(a) - labels.indexOf(b))
        }
      },
      sortCharts(result) {
        for(const kv of kvs) {
          const termid = q[kv.term]
        }
      },
      useColOrder() {
        return inReqs[1].orderedLabels.length > 0
      },
      useRowOrder() {
        return inReqs[2].orderedLabels.length > 0
      },
      unannotatedLabels() {
        return {
          term0: inReqs[0].unannotatedLabels,
          term1: inReqs[1].unannotatedLabels, 
          term2: inReqs[2].unannotatedLabels
        }
      },
      bins() {
        return inReqs.map(d=>d.bins)
      },
      q() {
        return inReqs.map(d=>{
          const q = {}
          for(const key in d.q) {
            if (key != "index") q[key] = d.q[key]
          } 
          if (d.binconfig) q.binconfig = d.binconfig
          return q
        })
      },
      grade_labels() {
        let has_condition_term = false
        for(const kv of kvs) {
          if (kv.q.bar_by_grade || kv.q.bar_by_children) {
            has_condition_term = true
            break
          }
        }
        return tdb.patient_condition && has_condition_term
          ? tdb.patient_condition.grade_labels.sort((a,b)=>a.grade - b.grade)
          : undefined
      }
    }
  })
}

function setValFxns(q, inReqs, ds, tdb, data0) {
/*
  sets request-specific value and filter functions
  non-condition unannotated values will be processed but tracked separately
*/
  if(q.tvslst) {
    // for categorical terms, must convert values to valueset
    for(const tv of q.tvslst) {
      if(tv.term.iscategorical) {
        tv.valueset = new Set( tv.values.map(i=>i.key) )
      }
    }
    inReqs.filterFxn = (row) => {
      return sample_match_termvaluesetting( row, q.tvslst, ds )
    }
  }

  for(const i of [0, 1, 2]) {
    const inReq = inReqs[i]
    const termnum = 'term' + i
    const termid = q[termnum]
    const term_q = q[termnum + "_q"]
    inReq.q = term_q
    term_q.index = i
    if (!inReq.orderedLabels) {
      inReq.orderedLabels = []
      inReq.unannotatedLabels = []
    }
    if (q[termnum + '_is_genotype']) {
      if (!q.ssid) throw `missing ssid for genotype`
      const [bySample, genotype2sample] = load_genotype_by_sample(q.ssid)
      inReqs.genotype2sample = genotype2sample
      const skey = ds.cohort.samplenamekey
      inReq.joinFxns[termid] = row => bySample[row[skey]]
      continue
    }
    const term = termid ? tdb.termjson.map.get(termid) : null
    if ((!termid || term.iscategorical) && termid in inReq.joinFxns) continue
    if (!term) throw `Unknown ${termnum}="${q[termnum]}"`
    if (!term.graph) throw `${termnum}.graph missing`
    if (!term.graph.barchart) throw `${termnum}.graph.barchart missing`
    if (term.iscategorical) {
      inReq.joinFxns[termid] = row => row[termid] 
    } else if (term.isinteger || term.isfloat) {
      get_numeric_bin_name(term_q, termid, term, ds, termnum, inReq, data0)
    } else if (term.iscondition) {
      // tdb.patient_condition
      if (!tdb.patient_condition) throw "missing termdb patient_condition"
      if (!tdb.patient_condition.events_key) throw "missing termdb patient_condition.events_key"
      inReq.orderedLabels = term.grades ? term.grades : [0,1,2,3,4,5,9] // hardcoded default order
      set_condition_fxn(termid, term.graph.barchart, tdb, inReq, i)
    } else {
      throw "unable to handle request, unknown term type"
    }
  }
}

function set_condition_fxn(termid, b, tdb, inReq, index) {
  const q = inReq.q
  const precomputedKey = q.bar_by_children && q.value_by_max_grade ? 'childrenAtMaxGrade'
    : q.bar_by_children && q.value_by_most_recent ? 'childrenAtMostRecent'
    : q.bar_by_children ? 'children'
    : q.bar_by_grade && q.value_by_max_grade ? 'maxGrade'
    : q.bar_by_grade && q.value_by_most_recent ? 'mostRecentGrades'
    : ''
  if (!precomputedKey) throw `unknown condition term unit='${unit}'`

  inReq.joinFxns[termid] = row => {
    if (!tdb.precomputed.bySample[row.sjlid]) return []
    const c = tdb.precomputed.bySample[row.sjlid].byCondition
    if (!(termid in c) || !(precomputedKey in c[termid])) return []
    const value = c[termid][precomputedKey]
    return Array.isArray(value) ? value : [value]
  }
}


function get_numeric_bin_name (term_q, termid, term, ds, termnum, inReq, data0 ) {
  if (!data0.refs.bins) throw 'missing bins array in server response of /termdb-barsql'
  const index = +termnum.slice(-1)
  const bins = data0.refs.bins[index]
  const binconfig = data0.refs.q[index].binconfig
  inReq.bins = bins
  inReq.binconfig = binconfig
  inReq.orderedLabels = bins.map(d=>d.label); 
  if (binconfig.unannotated) {
    inReq.unannotatedLabels = Object.values(binconfig.unannotated._labels)
  }

  inReq.joinFxns[termid] = row => {
    const v = row[termid]
    if( binconfig.unannotated && binconfig.unannotated._values.includes(v) ) {
      return binconfig.unannotated._labels[v]
    }

    for(const b of bins) {
      if( b.startunbounded ) {
        if( v < b.stop  ) return b.label
        if( b.stopinclusive && v == b.stop ) return b.label
      }
      if( b.stopunbounded ) {
        if( v > b.start  ) return b.label
        if( b.stopinclusive && v == b.start ) return b.label
      }
      if( b.startinclusive  && v <  b.start ) continue
      if( !b.startinclusive && v <= b.start ) continue
      if( b.stopinclusive   && v >  b.stop  ) continue
      if( !b.stopinclusive  && v >= b.stop  ) continue
      return b.label
    }
  }

  inReq.numValFxns[termid] = row => {
    const v = row[termid]
    if(!binconfig.unannotated || !binconfig.unannotated._values.includes(v) ) {
      return v
    }
  }
}


function load_genotype_by_sample ( id ) {
/* id is the file name under cache/samples-by-genotype/
*/
  const filename = path.join( serverconfig.cachedir, 'ssid', id )
  const text = fs.readFileSync(filename, {encoding:'utf8'})

  const bySample = Object.create(null)
  const genotype2sample = new Map()
  for(const line of text.split('\n')) {
    const [type, samplesStr] = line.split('\t')
    const samples = samplesStr.split(",")
    for(const sample of samples) {
      bySample[sample] = type
    }

    if(!genotype_type_set.has(type)) throw 'unknown hardcoded genotype label: '+type
    genotype2sample.set(type, new Set(samples))
  }
  return [bySample, genotype2sample]
}




const genotype_type_set = new Set(["Homozygous reference","Homozygous alternative","Heterozygous"])
const genotype_types = {
  href: "Homozygous reference",
  halt: "Homozygous alternative",
  het: "Heterozygous"
}




function get_AF ( samples, chr, pos, genotype2sample, ds ) {
/*
as configured by ds.track.vcf.termdb_bygenotype,
at genotype overlay of a barchart,
to show AF=? for each bar, based on the current variant

arguments:
- samples[]
  list of sample names from a bar
- chr
  chromosome of the variant
- genotype2sample Map
    returned by load_genotype_by_sample()
- ds{}
*/
  const afconfig = ds.track.vcf.termdb_bygenotype // location of configurations
  const href = genotype2sample.has(genotype_types.href) ? genotype2sample.get(genotype_types.href) : new Set()
  const halt = genotype2sample.has(genotype_types.halt) ? genotype2sample.get(genotype_types.halt) : new Set()
  const het = genotype2sample.has(genotype_types.het) ? genotype2sample.get(genotype_types.het) : new Set()
  let AC=0, AN=0
  for(const sample of samples) {
    let isdiploid = false
    if( afconfig.sex_chrs.includes( chr ) ) {
      if( afconfig.male_samples.has( sample ) ) {
        if( afconfig.chr2par && afconfig.chr2par[chr] ) {
          for(const par of afconfig.chr2par[chr]) {
            if(pos>=par.start && pos<=par.stop) {
              isdiploid=true
              break
            }
          }
        }
      } else {
        isdiploid=true
      }
    } else {
      isdiploid=true
    }
    if( isdiploid ) {
      AN+=2
      if(halt.has( sample ) ) {
        AC+=2
      } else if(het.has( sample )) {
        AC++
      }
    } else {
      AN++
      if(!href.has(sample)) AC++
    }
  }
  return (AN==0 || AC==0) ? 0 : (AC/AN).toFixed(3)
}


function sample_match_termvaluesetting ( sanno, terms, ds ) {
/* for AND, require all terms to match
ds is for accessing patient_condition
XXX  only used by termdb.barchart.js, to be taken out
*/

  let usingAND = true

  let numberofmatchedterms = 0

  for(const t of terms ) {

    const samplevalue = sanno[ t.term.id ]

    let thistermmatch

    if( t.term.iscategorical ) {

      if(samplevalue==undefined)  continue // this sample has no anno for this term, do not count
      thistermmatch = t.valueset.has( samplevalue )

    } else if( t.term.isinteger || t.term.isfloat ) {

      if(samplevalue==undefined)  continue // this sample has no anno for this term, do not count
      for(const range of t.ranges) {
        let left, right
        if( range.startunbounded ) {
          left = true
        } else {
          if(range.startinclusive) {
            left = samplevalue >= range.start
          } else {
            left = samplevalue > range.start
          }
        }
        if( range.stopunbounded ) {
          right = true
        } else {
          if(range.stopinclusive) {
            right = samplevalue <= range.stop
          } else {
            right = samplevalue < range.stop
          }
        }
        thistermmatch = left && right
        if (thistermmatch) break
      }
    } else if( t.term.iscondition ) {

      thistermmatch = test_sample_conditionterm( sanno, t, ds )

    } else {
      throw 'unknown term type'
    }

    if( t.isnot ) {
      thistermmatch = !thistermmatch
    }
    if( thistermmatch ) numberofmatchedterms++
  }

  if( usingAND ) {
    return numberofmatchedterms == terms.length
  }
  // using OR
  return numberofmatchedterms > 0
}


let testi = 0

function test_sample_conditionterm ( sample, tvs, ds ) {
/*
sample: ds.cohort.annotation[k]
tvs: a term-value setting object
ds
*/
  const _c = ds.cohort.termdb.patient_condition
  if(!_c) throw 'patient_condition missing'
  const term = ds.cohort.termdb.termjson.map.get( tvs.term.id )
  if(!term) throw 'unknown term id: '+tvs.term.id

  if( term.isleaf ) {
    // leaf, term id directly used for annotation
    const termvalue = sample[ tvs.term.id ]
    if(!termvalue) return false
    const eventlst = termvalue[ _c.events_key ]
    return test_grade( eventlst )
  }

  // non-leaf

  if( tvs.bar_by_grade ) {
    // by grade, irrespective of subcondition
    const eventlst = []
    for(const tid in sample) {
      const t = ds.cohort.termdb.termjson.map.get(tid)
      if(!t || !t.iscondition) continue
      if(t.conditionlineage.includes( tvs.term.id )) {
        // is a child term
        eventlst.push( ...sample[tid][_c.events_key] )
      }
    }
    return test_grade( eventlst )
  }

  if( tvs.bar_by_children ) {
    // event in any given children with computable grade
    for(const tid in sample) {
      const t = ds.cohort.termdb.termjson.map.get(tid)
      if(!t || !t.iscondition) continue
      if( tvs.values.findIndex( i=> t.conditionlineage.indexOf(i.key)!=-1 ) == -1 ) continue
      const events = sample[tid][_c.events_key]
      if(!events || events.length==0) continue
      if( _c.uncomputable_grades ) {
        for(const e of events) {
          if( !_c.uncomputable_grades[e[_c.grade_key]] ) {
            // has a computable grade
            return true
          }
        }
        // all are uncomputable grade
        continue
      }
      // no uncomputable grades to speak of
      return true
    }
    return false
  }

  if( tvs.grade_and_child ) {
    // collect all events from all subconditions, and remember which condition it is
    const eventlst = []
    for(const tid in sample) {
      const t = ds.cohort.termdb.termjson.map.get(tid)
      if(!t || !t.iscondition) continue
      if(t.conditionlineage.indexOf(tvs.term.id)!=-1) {
        for(const e of sample[tid][_c.events_key]) {
          if(_c.uncomputable_grades && _c.uncomputable_grades[e[_c.grade_key]]) continue
          eventlst.push({ e, tid })
        }
      }
    }
    if(eventlst.length==0) return false

    // from all events of any subcondition, find one matching with value_by_
    if(tvs.value_by_most_recent) {
      const most_recent_events = []
      let age = 0
      for(const e of eventlst) {
        const a = e.e[_c.age_key]
        if(age < a) {
          age = a
        }
      }
      for(const e of eventlst) {
        if(e.e[_c.age_key] == age) {
          const g = e.e[_c.grade_key]
          for(const tv of tvs.grade_and_child) {
            if (tv.grade == g && tv.child_id == e.tid) return true
          }
        }
      }
      //console.log('not matched')
      return
    } else if(tvs.value_by_max_grade) {
      let useevent
      let maxg = 0
      for(const e of eventlst) {
        const g = e.e[_c.grade_key]
        if(maxg < g) {
          maxg = g
          useevent = e
        }
      }
      return tvs.grade_and_child.findIndex( i=> i.grade == useevent.e[_c.grade_key] && i.child_id == useevent.tid) != -1
    } else {
      throw 'unknown flag of value_by_'
    }
  }

  throw 'illegal definition of conditional tvs'


  function test_grade ( eventlst ) {
  /* from a list of events, find one matching criteria
  */
    if(!eventlst) return false
    if( tvs.value_by_most_recent ) {
      let mostrecentage
      // get the most recent age in the event list
      for(const e of eventlst) {
        const grade = e[_c.grade_key]
        if(_c.uncomputable_grades && _c.uncomputable_grades[grade]) continue
        const a = e[_c.age_key]
        if(mostrecentage === undefined || mostrecentage < a) {
          mostrecentage = a
        }
      }
      // if an event matches the most recent age, test 
      // if the grade matches at least one of the filter values
      for(const e of eventlst) {
        if(e[_c.age_key] == mostrecentage) {
          const g = e[_c.grade_key]
          for(const tv of tvs.values) {
            if (tv.key == g) {
              //console.log(testi++)
              return true
            }
          }
        }
      }
      return false
    }
    if( tvs.value_by_max_grade ) {
      let maxg = -1
      for(const e of eventlst) {
        const grade = e[_c.grade_key]
        if(_c.uncomputable_grades && _c.uncomputable_grades[grade]) continue
        maxg = Math.max( maxg, grade )
      }
      return tvs.values.findIndex(j=>j.key==maxg) != -1
    }
    throw 'unknown method for value_by'
  }
}

function boxplot_getvalue(lst) {
  /* ascending order
  each element: {value}
  */
  const l=lst.length
  if(l<5) {
    // less than 5 items, won't make boxplot
    return {out:lst}
  }
  const p50=lst[Math.floor(l/2)].value
  const p25=lst[Math.floor(l/4)].value
  const p75=lst[Math.floor(l*3/4)].value
  const p05 = lst[Math.floor(l*0.05)].value
  const p95 = lst[Math.floor(l*0.95)].value
  const p01 = lst[Math.floor(l*0.01)].value
  const iqr=(p75-p25)*1.5

  let w1, w2
  if( iqr == 0 ) {
    w1 = 0
    w2 = 0
  } else {
    const i=lst.findIndex(i=>i.value>p25-iqr)
    w1=lst[i==-1 ? 0 : i].value
    const j=lst.findIndex(i=>i.value>p75+iqr)
    w2=lst[j==-1 ? l-1 : j-1].value
  }
  const out=lst.filter(i=>i.value<p25-iqr || i.value>p75+iqr)
  return { w1, w2, p05, p25, p50, p75, p95, iqr, out }
}
