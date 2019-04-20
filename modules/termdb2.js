const app = require('../app')
const Partjson = require('./partjson')
const settings = {}
const pj = getPj(settings)
const joinFxns = {
  "": () => ""
}

/*
********************** EXPORTED
handle_request_closure
********************** 
*/

exports.handle_request_closure = ( genomes ) => {
  return async (req, res) => {
    //if( app.reqbodyisinvalidjson(req,res) ) return
    const q = req.query

    try {
      const genome = genomes[ q.genome ]
      if(!genome) throw 'invalid genome'
      const ds = genome.datasets[ q.dslabel ]
      if(!ds) throw 'invalid dslabel'
      if(!ds.cohort) throw 'ds.cohort missing'
      const tdb = ds.cohort.termdb
      if(!tdb) throw 'no termdb for this dataset'

      //const ds_filtered = may_filter_samples( q, tdb, ds )

      // process triggers
      await barchart_data( q, ds, res, tdb )
    } catch(e) {
      res.send({error: (e.message || e)})
      if(e.stack) console.log(e.stack)
    }
  }
}

async function barchart_data ( q, ds, res, tdb ) {
/*
summarize numbers to create barchar based on server config

if is a numeric term, also get distribution

*/
  // validate
  //if(!q.barchart.id) throw 'barchart.id missing'
  //const term = tdb.termjson.map.get( q.barchart.id )
  //if(!term) throw 'barchart.id is invalid'
  //if(!term.graph) throw 'graph is not available for said term'
  //if(!term.graph.barchart) throw 'graph.barchart is not available for said term'
  if(!ds.cohort) throw 'cohort missing from ds'
  const filename = 'files/hg38/sjlife/clinical/matrix'
  if(!ds.cohort['parsed-'+filename]) throw `the parsed cohort matrix=${filename} is missing`
  setValFxns(q, tdb, ds) 
  Object.assign(settings, q)
  pj.refresh({data: ds.cohort['parsed-' + filename]})
  res.send(pj.tree.results)
}

function getPj(settings) {
  return new Partjson({
    template: {
      "@join()": {
        vals: "=vals()"
      },
      results: {
        "_5:maxAcrossCharts": "=maxAcrossCharts()",
        "_4:charts": "@root.byTerm0.@values",
        refs: {
          //chartkey: "&vals.term0",
          "__:cols": "@root.term1vals",
          colgrps: ["-"], 
          rows: ["&vals.dataId"],
          rowgrps: ["-"],
          col2name: {
            "&vals.seriesId": {
              name: "&vals.seriesId",
              grp: "-"
            }
          },
          row2name: {
            "&vals.dataId": {
              name: "&vals.dataId",
              grp: "-"
            }
          }
        }
      },
      term1vals: ["&vals.seriesId"],
      byTerm0: {
        "&vals.chartId": {
          chartId: "&vals.chartId",
          total: "+1",
          "_3:maxGroupTotal": "=maxGroupTotal()",
          "_2:seriesgrps": "=seriesgrps()",
          byTerm1: {
            "&vals.seriesId": {
              total: "+1",
              "_1:serieses": "@.byTerm2.@values",
              byTerm2: {
                "&vals.dataId": {
                  chartId: "&vals.chartId",
                  seriesId: "&vals.seriesId",
                  dataId: "&vals.dataId",
                  total: "+1",
                  "__:groupTotal": "@parent.@parent.total"
                }
              }
            },
          },
          "@done()": "=cleanChartData()"
        }
      }
    },
    "=": {
      vals(row) {
        return {
          chartId: joinFxns[settings.term0](row),
          seriesId: joinFxns[settings.term1](row),
          dataId: joinFxns[settings.term2](row)
        }
      },
      seriesgrps(row, context) {
        const grps = Object.values(context.self.byTerm1).map(d=>d.serieses)
        // stacking of serieses will be sorted on the client side
        const orderedGrps = [];
        context.root.term1vals.forEach(seriesId => {
          const grp = grps.find(d => d[0].seriesId == seriesId); 
          orderedGrps.push(grp ? grp : [])
        })
        return orderedGrps
      },
      maxGroupTotal(row, context) {
        let maxGroupTotal = 0
        for(const grp of context.self.seriesgrps) {
          if (grp[0] && grp[0].groupTotal > maxGroupTotal) {
            maxGroupTotal = grp[0].groupTotal
          }
        }
        return maxGroupTotal
      },
      maxAcrossCharts(row, context) {
        let maxAcrossCharts = 0
        for(const chart of context.self.charts) {
          if (chart.maxGroupTotal > maxAcrossCharts) {
            maxAcrossCharts = chart.maxGroupTotal
          }
        }
        return maxAcrossCharts
      },
      cleanChartData(result) {
        // byTerm1 values will be stored in seriesgrps
        delete result.byTerm1
      }
    }
  })
}

function setValFxns(q, tdb, ds) {
  for(const term of ['term0', 'term1', 'term2']) {
    const key = q[term]
    if (key in joinFxns) continue
    const t = tdb.termjson.map.get(key)
    if (!t) throw `Unknown ${term}="${q[term]}"`
    if (!t.graph) throw `${term}.graph missing`
    if (!t.graph.barchart) throw `${term}.graph.barchart missing`
    if (t.iscategorical) {
      /*** TODO: handle unannotated categorical values?  ***/
      joinFxns[key] = row => row[key] 
    }
    else {
      const [ binconfig, values ] = termdb_get_numericbins( key, t, ds )
      //console.log(key, binconfig, t)
      joinFxns[key] = row => {
        const v = row[key]
        if( binconfig.unannotated && v == binconfig.unannotated._value ) {
          /*** 
            TODO: how are unannotated values
            filtered on server and/or client-side?  
          ***/
          return binconfig.unannotated.label
        }

        for(const b of binconfig.bins) {
          if( b.startunbound ) {
            if( b.stopinclusive && v <= b.stop  ) {
              return b.label
            }
            if( !b.stopinclusive && v < b.stop ) {
              return b.label
            }
          }
          if( b.stopunbound ) {
            if( b.startinclusive && v >= b.start  ) {
              return b.label
            }
            if( !b.stopinclusive && v > b.start ) {
              return b.label
            }
          }
          if( b.startinclusive  && v <  b.start ) continue
          if( !b.startinclusive && v <= b.start ) continue
          if( b.stopinclusive   && v >  b.stop  ) continue
          if( !b.stopinclusive  && v >= b.stop  ) continue
          return b.label
        }
      }
    }
  }
}

function termdb_get_numericbins ( id, term, ds ) {
/*
must return values from all samples, not to exclude unannotated values

do not count sample for any bin here, including annotated/unannotated
only initiate the bins without count
barchart or crosstab will do the counting in different ways

return an object for binning setting {}
rather than a list of bins
this is to accommondate settings where a valid value e.g. 0 is used for unannotated samples, and need to collect this count

.bins[]
  each element is one bin
  .start
  .stop
  etc
.unannotated{}
  .value
  .samplecount
  for counting unannotated samples if unannotated{} is set on server
*/

  // step 1, get values from all samples
  const values = []
  for(const s in ds.cohort.annotation) {
    const v = ds.cohort.annotation[ s ][ id ]

    if( Number.isFinite( v ) ) {
      values.push(v)
    }
  }
  if(values.length==0) {
    throw 'No numeric values found for any sample'
  }

  // step 2, decide bins
  const nb = term.graph.barchart.numeric_bin

  const bins = []

  if( nb.fixed_bins ) {
    // server predefined
    // return copy of the bin, not direct obj, as bins will be modified later

    for(const i of nb.fixed_bins) {
      const copy = {
        value: 0 // v2s
      }
      for(const k in i) {
        copy[ k ] = i[ k ]
      }
      bins.push( copy )
    }

  } else if( nb.auto_bins ) {

    /* auto bins
    given start and bin size, use max from value to decide how many bins there are

    if bin size is integer,
    to make nicer labels
    */

    const max = Math.max( ...values )
    let v = nb.auto_bins.start_value
    while( v < max ) {
      const v2 = v + nb.auto_bins.bin_size

      const bin = {
        start: v,
        stop: v2,
        value: 0, // v2s
        startinclusive:1,
      }

      if( Number.isInteger( nb.auto_bins.bin_size ) ) {
        // bin size is integer, make nicer label

        if( nb.auto_bins.bin_size == 1 ) {
          // bin size is 1; use just start value as label, not a range
          bin.label = v
        } else {
          // bin size bigger than 1, reduce right bound by 1, in label only!
          bin.label = v + ' to ' + (v2-1)
        }
      } else {
        
        // bin size is not integer
        bin.label = v+' to '+v2
      }

      bins.push( bin )

      v += nb.auto_bins.bin_size
    }
  } else {
    throw 'unknown ways to decide bins'
  }

  const binconfig = {
    bins: bins
  }

  if( nb.unannotated ) {
    // in case of using this numeric term as term2 in crosstab, this object can also work as a bin, to be put into the bins array
    binconfig.unannotated = {
      _value: nb.unannotated.value,
      label: nb.unannotated.label,
      label_annotated: nb.unannotated.label_annotated,
      // for unannotated samples
      value: 0, // v2s
      // for annotated samples
      value_annotated: 0, // v2s
    }
  }

  return [ binconfig, values ]
}
