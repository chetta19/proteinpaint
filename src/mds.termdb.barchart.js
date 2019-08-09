import rendererSettings from "./bars.settings"
import barsRenderer from "./bars.renderer"
import { select, event } from "d3-selection"
import { scaleOrdinal, schemeCategory10, schemeCategory20 } from 'd3-scale'
import { rgb } from 'd3-color'
import getHandlers from './mds.termdb.barchart.events'

const colors = {
  c10: scaleOrdinal( schemeCategory10 ),
  c20: scaleOrdinal( schemeCategory20 )
} 

export class TermdbBarchart{
  constructor(opts={settings:{}}) {
    this.opts = opts
    this.dom = {
      holder: opts.holder,
      barDiv: opts.holder.append('div')
        .style('white-space', 'normal'),
      legendDiv: opts.holder.append('div')
        .style('margin', '5px 5px 15px 5px')
    }
    this.defaults = Object.assign(
      JSON.parse(rendererSettings),
      {
        isVisible: false,
        term0: '',
        term1: 'sex',
        term2: ''
      }
    ) 
    this.settings = Object.assign(this.defaults, opts.settings)
    this.renderers = {}
    this.serverData = {}
    this.terms = {
      term0: null,
      term1: this.opts.term1,
      term2: null
    }
    this.handlers = getHandlers(this)
    this.controls = {}
    this.currChartsData = null
    this.term2toColor = {}
  }

  main(plot=null, data=null, isVisible=true, obj=null) {
    if (!this.currServerData) this.dom.barDiv.style('max-width', window.innerWidth + 'px')
    if (data) this.currServerData = data
    if (!this.setVisibility(isVisible)) return
    if (obj) this.obj = obj
    if (plot) this.plot = plot
    this.updateSettings(plot)
    this.processData(this.currServerData)
  }

  updateSettings(plot) {
    if (!plot) return
    // translate relevant plot keys to barchart settings keys
    const obj = plot.obj
    const settings = {
      genome: obj.genome.name,
      dslabel: obj.dslabel ? obj.dslabel : obj.mds.label,
      term0: plot.term0 ? plot.term0.id : '',
      term1: plot.term.id,
      term2: obj.modifier_ssid_barchart ? 'genotype' 
        : plot.term2 ? plot.term2.id
        : '',
      ssid: obj.modifier_ssid_barchart ? obj.modifier_ssid_barchart.ssid : '',
      mname: obj.modifier_ssid_barchart ? obj.modifier_ssid_barchart.mutation_name : '',
      groups: obj.modifier_ssid_barchart ? obj.modifier_ssid_barchart.groups : null,
      unit: plot.settings.bar.unit,
      custom_bins: plot.custom_bins,
      orientation: plot.settings.bar.orientation,
      // normalize bar thickness regardless of orientation
      colw: plot.settings.common.barwidth,
      rowh: plot.settings.common.barwidth,
      colspace: plot.settings.common.barspace,
      rowspace: plot.settings.common.barspace
    }
    Object.assign(this.settings, settings, this.currServerData.refs ? this.currServerData.refs : {})
    this.settings.numCharts = this.currServerData.charts ? this.currServerData.charts.length : 0
    if (this.settings.term2 == "" && this.settings.unit == "pct") {
      this.settings.unit = "abs"
    }
    if (this.settings.term2 == "genotype") {
      this.terms.term2 = {name: this.settings.mname}
    } else if ('term2' in this.settings && plot.term2) {
      this.terms.term2 = plot.term2 
    } else {
      this.terms.term2 = null
    }
    this.terms.term0 = settings.term0 && plot.term0 ? plot.term0 : null
  }

  setVisibility(isVisible) {
    const display = isVisible ? 'block' : 'none'
    this.dom.barDiv.style('display', display)
    this.dom.legendDiv.style('display', display)
    return isVisible
  }

  processData(chartsData) {
    const self = this
    const cols = chartsData.refs.cols

    self.grade_labels = chartsData.refs.grade_labels 
      ? chartsData.refs.grade_labels
      : null

    self.seriesOrder = !chartsData.charts.length 
      ? [] 
      : chartsData.charts[0].serieses
        .sort(chartsData.refs.useColOrder
          ? (a,b) => cols.indexOf(b.seriesId) - cols.indexOf(a.seriesId)
          : (a,b) => !isNaN(a.seriesId)
            ? +b.seriesId - +a.seriesId
            : a.total - b.total
        )
        .map(d => d.seriesId)

    self.setMaxVisibleTotals(chartsData)

    const term2bins = chartsData.refs.bins 
      ? chartsData.refs.bins[2]
      : self.settings.term2 
        && self.terms.term2.graph 
        && self.terms.term2.graph.barchart
        && self.terms.term2.graph.barchart.numeric_bin
      ? self.terms.term2.graph.barchart.numeric_bin
      : []

    self.term2bins = term2bins
    self.term2binLabels = term2bins.map(d=>d.label).reverse()

    const rows = chartsData.refs.rows;
    self.rowSorter = chartsData.refs.useRowOrder
      ? (a,b) => rows.indexOf(a.dataId) - rows.indexOf(b.dataId)
      : self.term2binLabels
      ? (a,b) => self.term2binLabels.indexOf(b.dataId) - self.term2binLabels.indexOf(a.dataId)
      : (a,b) => this.totalsByDataId[b.dataId] - this.totalsByDataId[a.dataId]

    const charts = this.dom.barDiv.selectAll('.pp-sbar-div')
      .data(chartsData.charts, chart => chart.chartId)

    charts.exit()
    .each(function(chart){
      delete self.renderers[chart.chartId]
      select(this).remove()
    })

    charts.each(function(chart) {
      if (!chartsData.refs.useColOrder) {
        chart.settings.cols.sort((a,b) => self.seriesOrder.indexOf(b) - self.seriesOrder.indexOf(a))
      }
      chart.maxAcrossCharts = chartsData.maxAcrossCharts
      chart.handlers = self.handlers
      chart.maxSeriesLogTotal = 0
      chart.visibleSerieses.forEach(series => self.sortStacking(series, chart, chartsData))
      self.renderers[chart.chartId](chart)
    })

    charts.enter()
    .append('div')
    .attr('class', 'pp-sbar-div')
    .style("display", "inline-block")
    .style("padding", "20px")
    .style('vertical-align', 'top')
    .each(function(chart,i) {
      if (!chartsData.refs.useColOrder) {
        chart.settings.cols.sort((a,b) => self.seriesOrder.indexOf(b) - self.seriesOrder.indexOf(a))
      }
      chart.maxAcrossCharts = chartsData.maxAcrossCharts
      chart.handlers = self.handlers
      chart.maxSeriesLogTotal = 0
      self.renderers[chart.chartId] = barsRenderer(self, select(this))
      chart.visibleSerieses.forEach(series => self.sortStacking(series, chart, chartsData))
      self.renderers[chart.chartId](chart)
    })
  }

  setMaxVisibleTotals(chartsData) {
    this.totalsByDataId = {}
    const term1 = this.settings.term1
    let maxVisibleAcrossCharts = 0
    for(const chart of chartsData.charts) {
      chart.settings = JSON.parse(rendererSettings)
      if (this.currChartsData != chartsData) {
        const unannotatedColLabels = chartsData.refs.unannotatedLabels.term1
        if (unannotatedColLabels) {
          for(const label of unannotatedColLabels) {
            if (!this.settings.exclude.cols.includes(label)) {
              //this.settings.exclude.cols.push(label) // do not automatically hide for now
            }
          }
        }
        const unannotatedRowLabels = chartsData.refs.unannotatedLabels.term2
        if (unannotatedRowLabels) {
          for(const label of unannotatedRowLabels) {
            if (!this.settings.exclude.rows.includes(label)) {
              //this.settings.exclude.rows.push(label) // do not automatically hide for now
            }
          }
        }
      }
    }
    //const settingsCopy = Object.assign({},this.settings)
    //delete settingsCopy.exclude
    for(const chart of chartsData.charts) {
      Object.assign(chart.settings, this.settings, chartsData.refs)
      chart.visibleSerieses = chart.serieses.filter(series=>{
        if (chart.settings.exclude.cols.includes(series.seriesId)) return false
        series.visibleData = series.data.filter(d => !chart.settings.exclude.rows.includes(d.dataId))
        series.visibleTotal = series.visibleData.reduce((sum, a) => sum + a.total, 0)
        if (!series.visibleTotal) return false
        for(const data of series.visibleData) {
          if (!(data.dataId in this.totalsByDataId)) {
            this.totalsByDataId[data.dataId] = 0
          }
          this.totalsByDataId[data.dataId] += data.total
        }
        return true
      })
      chart.settings.colLabels = chart.visibleSerieses.map(series=>{
        const id = series.seriesId
        const grade_label = this.terms.term1.iscondition && this.grade_labels
            ? this.grade_labels.find(c => id == c.grade)
            : null
        const label = grade_label ? grade_label.label : id
        const af = series && 'AF' in series ? ', AF=' + series.AF : ''
        return {
          id,
          label: label + af
        }
      })
      chart.maxVisibleSeriesTotal = chart.visibleSerieses.reduce((max,series) => {
        return series.visibleTotal > max ? series.visibleTotal : max
      }, 0)
      if (chart.maxVisibleSeriesTotal > maxVisibleAcrossCharts) {
        maxVisibleAcrossCharts = chart.maxVisibleSeriesTotal
      }
    }
    for(const chart of chartsData.charts) {
      chart.maxVisibleAcrossCharts = maxVisibleAcrossCharts
    }
    this.currChartsData = chartsData
  }

  sortStacking(series, chart, chartsData) {
    series.visibleData.sort(this.rowSorter);
    let seriesLogTotal = 0
    for(const result of series.visibleData) {
      result.colgrp = "-"
      result.rowgrp = "-"
      result.chartId = chart.chartId
      result.seriesId = series.seriesId
      result.seriesTotal = series.total
      result.logTotal = Math.log10(result.total)
      seriesLogTotal += result.logTotal;
      this.setTerm2Color(result)
      result.color = this.term2toColor[result.dataId]
      result.unannotatedSeries = series.unannotated
      result.unannotatedData = result.unannotated
    }
    if (seriesLogTotal > chart.maxSeriesLogTotal) {
      chart.maxSeriesLogTotal = seriesLogTotal
    }
    // assign color to hidden data
    // for use in legend
    for(const result of series.data) {
      this.setTerm2Color(result)
      result.color = this.term2toColor[result.dataId]
    }
  }

  sortSeries(a,b) {
    return a[this.settings.term2] < b[this.settings.term1] 
      ? -1
      : 1 
  }

  setTerm2Color(result) {
    if (this.settings.groups && result.dataId in this.settings.groups) {
      this.term2toColor[result.dataId] = this.settings.groups[result.dataId].color
    }
    if (result.dataId in this.term2toColor) return 
    this.term2toColor[result.dataId] = this.settings.term2 === ""
      ? "rgb(144, 23, 57)"
      : rgb(this.settings.rows && this.settings.rows.length < 11 
        ? colors.c10(result.dataId)
        : colors.c20(result.dataId)
      ).toString() //.replace('rgb(','rgba(').replace(')', ',0.7)')
  }

  getLegendGrps(chart) {
    const legendGrps = []
    const s = this.settings
    if (s.exclude.cols.length) {
      const t = this.terms.term1
      const b = t.graph && t.graph.barchart ? t.graph.barchart : null
      const grade_labels = b && t.iscondition ? this.grade_labels : null

      legendGrps.push({
        name: "Hidden " + this.terms.term1.name + " value",
        items: s.exclude.cols
          .filter(collabel => s.cols.includes(collabel))
          .map(collabel => {
            const total = chart.serieses
              .filter(c => c.seriesId == collabel)
              .reduce((sum, b) => sum + b.total, 0)
            
            const grade = grade_labels ? grade_labels.find(c => c.grade == collabel) : null
            
            return {
              id: collabel,
              text: grade ? grade.label : collabel,
              color: "#fff",
              textColor: "#000",
              border: "1px solid #333",
              inset: total ? total : '',
              type: 'col'
            }
          })
      })
    }
    if (s.rows && s.rows.length > 1 && !s.hidelegend && this.terms.term2 && this.term2toColor) {
      const t = this.terms.term2
      const b = t.graph && t.graph.barchart ? t.graph.barchart : null
      const overlay = !t.iscondition || !b ? '' : b.value_choices.find(d => false /*d[s.conditionUnits[2]]*/)
      const grade_labels = b && t.iscondition ? this.grade_labels : null
      const colors = {}
      legendGrps.push({
        name: t.name + (overlay ? ': '+overlay.label : ''),
        items: s.rows.map(d => {
          const g = grade_labels ? grade_labels.find(c => typeof d == 'object' && 'id' in d ? c.grade == d.id : c.grade == d) : null
          return {
            dataId: d,
            text: g ? g.label : d,
            color: this.term2toColor[d],
            type: 'row',
            isHidden: s.exclude.rows.includes(d)
          }
        }).sort(this.rowSorter)
      })
    }
    return legendGrps;
  }
}
