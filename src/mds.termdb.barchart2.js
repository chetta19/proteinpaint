import settings from "./bars.settings"
import barsRenderer from "./bars.renderer"
import { select, event } from "d3-selection"
import { scaleOrdinal, schemeCategory10, schemeCategory20 } from 'd3-scale'
import { rgb } from 'd3-color'
import { Menu, dofetch2 } from './client'
import {may_makebutton_crosstabulate} from './mds.termdb.crosstab'

const colors = {
  c10: scaleOrdinal( schemeCategory10 ),
  c20: scaleOrdinal( schemeCategory20 )
} 

const tip = new Menu({padding:'5px'})
tip.d.style('text-align', 'center')

export class Barchart{
  constructor(opts={settings:{}}) {
    this.opts = opts
    this.holder = opts.holder
    this.defaults = JSON.parse(settings)
    this.settings = Object.assign({
      term0: '',
      term1: 'sex',
      term2: ''
    }, this.defaults, opts.settings)
    this.renderers = {}
    this.serverData = {}
    this.terms = {
      term0: null,
      term1: this.opts.term1,
      term2: null
    }
    this.handlers = this.getEventHandlers()
    this.controls = {}
    this.currChartsData = null
    //this.setControls()
    this.term2toColor = {}
  }

  main(_settings={}, obj=null) {
    if (obj) {
      this.obj = obj; //console.log(obj, this.obj)
      if (obj.modifier_barchart_selectbar) {
        this.click_callback = obj.modifier_barchart_selectbar.callback
      }
    }
    this.updateSettings(_settings)

    const dataName = this.getDataName()
    if (this.serverData[dataName]) {
      this.render(this.serverData[dataName]) 
    }
    else {
      dofetch2('/termdb-barchart' + dataName)
      .then(chartsData => {
        this.serverData[dataName] = chartsData
        this.render(chartsData)
      })
    }
  }

  getDataName() {
    const s = this.settings
    return '?'
      + 'genome=' + s.genome
      + '&dslabel=' + s.dslabel
      + '&term0=' + s.term0
      + '&term1=' + s.term1
      + '&term2=' + s.term2
      + '&ssid=' + s.ssid
      + '&mname=' + s.mname
      + '&custom_bins=' + (
        !s.custom_bins 
        ? '' 
        : encodeURIComponent(JSON.stringify(s.custom_bins))
      )
  }

  updateSettings(settings) {
    Object.assign(this.settings, settings)
    if (this.settings.term2 == "" && this.settings.unit == "pct") {
      this.settings.unit = "abs"
    }
    if (this.settings.term2 == "genotype") {
      this.terms.term2 = {name: this.settings.mname}
    }
    if ('term2' in settings) {
      this.terms.term2 = settings.term2Obj 
    }
    //this.updateControls()
  }

  render(chartsData) {
    const self = this
    const cols = chartsData.refs.cols
    self.seriesOrder = chartsData.charts[0].serieses
      .sort(chartsData.refs.useColOrder
        ? (a,b) => cols.indexOf(b.seriesId) - cols.indexOf(a.seriesId)
        : (a,b) => !isNaN(a.seriesId)
          ? +b.seriesId - +a.seriesId
          : a.total - b.total
      )
      .map(d => d.seriesId)

    self.setMaxVisibleTotals(chartsData)

    const bins = self.settings.term2 
      && self.terms.term2.graph 
      && self.terms.term2.graph.barchart
      && self.terms.term2.graph.barchart.numeric_bin
      ? self.terms.term2.graph.barchart.numeric_bin
      : null

    self.binLabels = bins && bins.fixed_bins
      ? bins.fixed_bins.map(d=>d.label).reverse()
      : bins && bins.crosstab_fixed_bins 
      ? bins.crosstab_fixed_bins.map(d=>d.label).reverse()
      : null

    self.rowSorter = self.binLabels
      ? (a,b) => self.binLabels.indexOf(b.dataId) - self.binLabels.indexOf(a.dataId)
      : (a,b) => b.total - a.total

    const charts = this.holder.selectAll('.pp-sbar-div')
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
      const refColId = chart.settings.cols.filter(d=>!chart.settings.exclude.cols.includes(d))[0]
      const rows = chart.serieses
        .find(series => !refColId || series.seriesId == refColId)
        .data
        .sort(self.rowSorter)
        .map(d => d.dataId)
      chart.visibleSerieses.forEach(series => self.sortStacking(rows, series, chart, chartsData))
      self.renderers[chart.chartId](chart)
    })

    charts.enter()
    .append('div')
    .attr('class', 'pp-sbar-div')
    .style("display", "inline-block")
    .style("padding", "20px")
    .each(function(chart,i) {
      if (!chartsData.refs.useColOrder) {
        chart.settings.cols.sort((a,b) => self.seriesOrder.indexOf(b) - self.seriesOrder.indexOf(a))
      }
      chart.maxAcrossCharts = chartsData.maxAcrossCharts
      chart.handlers = self.handlers
      chart.maxSeriesLogTotal = 0
      self.renderers[chart.chartId] = barsRenderer(self, select(this))
      const refColId = chart.settings.cols.filter(d=>!chart.settings.exclude.cols.includes(d))[0]
      const rows = chart.serieses
        .find(series => !refColId || series.seriesId == refColId)
        .data
        .sort(self.rowSorter)
        .map(d => d.dataId)
      chart.visibleSerieses.forEach(series => self.sortStacking(rows, series, chart, chartsData))
      self.renderers[chart.chartId](chart)
    })
  }

  setMaxVisibleTotals(chartsData) {
    const term1 = this.settings.term1
    let maxVisibleAcrossCharts = 0
    for(const chart of chartsData.charts) {
      if (this.currChartsData != chartsData) {
        const unannotatedCol = chartsData.refs.unannotatedLabels.term1
        if (unannotatedCol && !this.settings.exclude.cols.includes(unannotatedCol)) {
          this.settings.exclude.cols.push(unannotatedCol)
        }
        const unannotatedRow = chartsData.refs.unannotatedLabels.term2
        if (unannotatedRow && !this.settings.exclude.rows.includes(unannotatedRow)) {
          this.settings.exclude.rows.push(unannotatedRow)
        }
      }
      chart.settings = Object.assign(this.settings, chartsData.refs)
      chart.visibleSerieses = chart.serieses.filter(d=>{
        return !chart.settings.exclude.cols.includes(d.seriesId)
      })
      chart.maxVisibleSeriesTotal = chart.visibleSerieses.reduce((max,b) => {
        b.visibleData = b.data.filter(d => !chart.settings.exclude.rows.includes(d.dataId))
        b.visibleTotal = b.visibleData.reduce((sum, a) => sum + a.total, 0)
        return b.visibleTotal > max ? b.visibleTotal : max
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

  sortStacking(rows, series, chart, chartsData) {
    series.visibleData.sort((a,b) => {
      return rows.indexOf(a.dataId) < rows.indexOf(b.dataId) ? -1 : 1 
    });
    let seriesLogTotal = 0
    for(const result of series.visibleData) {
      result.colgrp = "-"
      result.rowgrp = "-"
      result.chartId = chart.chartId
      result.seriesId = series.seriesId
      result.seriesTotal = series.total
      result.logTotal = Math.log10(result.total)
      seriesLogTotal += result.logTotal;
      if (!(result.dataId in this.term2toColor)) {
        this.term2toColor[result.dataId] = this.settings.term2 === ""
        ? "rgb(144, 23, 57)"
        : rgb(this.settings.rows.length < 11 
          ? colors.c10(result.dataId)
          : colors.c20(result.dataId)
        ).toString() //.replace('rgb(','rgba(').replace(')', ',0.7)')
      } 
      result.color = this.term2toColor[result.dataId]
    }
    if (seriesLogTotal > chart.maxSeriesLogTotal) {
      chart.maxSeriesLogTotal = seriesLogTotal
    }
    // assign color to hidden data
    // for use in legend
    for(const result of series.data) {
      if (!(result.dataId in this.term2toColor)) {
        this.term2toColor[result.dataId] = this.settings.term2 === ""
        ? "rgb(144, 23, 57)"
        : rgb(this.settings.rows.length < 11 
          ? colors.c10(result.dataId)
          : colors.c20(result.dataId)
        ).toString() //.replace('rgb(','rgba(').replace(')', ',0.7)')
      } 
      result.color = this.term2toColor[result.dataId]
    }
  }

  sortSeries(a,b) {
    return a[this.settings.term2] < b[this.settings.term1] 
      ? -1
      : 1 
  }

  getEventHandlers() {
    const self = this
    const s = this.settings
    return {
      svg: {
        mouseout: ()=>{
          tip.hide()
        },
      },
      series: {
        mouseover(d) { 
          const terms = self.terms
          const html = terms.term1.name +': ' + d.seriesId +
            (!terms.term2 ? "" : "<br/>" + terms.term2.name +": "+ d.dataId) + 
            "<br/>Total: " + d.total + 
            (
              !terms.term2 
              ? "" 
              : "<br/>Percentage: " + (100*d.total/d.seriesTotal).toFixed(1) + "% of " + d.seriesId
            );
          tip.show(event.clientX, event.clientY).d.html(html);
        },
        mouseout: ()=>{
          tip.hide()
        },
        rectFill(d) {
          return d.color
        },
        click(d) {
          if (!self.click_callback) return
          const terms = self.terms
          const t = []
          for(const termNum in terms) {
            const term = terms[termNum]
            if (termNum != 'term0' && term) {
              t.push({
                term,
                value: termNum=="term1" ? d.seriesId : d.dataId,
                label: !term.values 
                  ? (termNum=="term1" ? d.seriesId : d.dataId)
                  : termNum=="term1"
                    ? term.values[d.seriesId] 
                    : term.values[d.dataId]
              })
            }
          } //console.log(t, d, terms)
          self.click_callback({terms: t})
        }
      },
      colLabel: {
        text: d => {
          return !self.terms.term1.values ? d
            : self.terms.term1.values[d].label
        },
        click: () => { 
          const d = event.target.__data__
          if (!d) return
          self.settings.exclude.cols.push(d)
          self.main()
        },
        mouseover: () => {
          event.stopPropagation()
          tip.show(event.clientX, event.clientY).d.html("Click to hide bar");
        },
        mouseout: () => {
          tip.hide()
        }
      },
      rowLabel: {
        text: d => {
          return !self.terms.term1.values ? d
            : self.terms.term1.values[d].label
        },
        click: () => { 
          const d = event.target.__data__
          if (!d) return
          self.settings.exclude.cols.push(d)
          self.main()
        },
        mouseover: () => {
          event.stopPropagation()
          tip.show(event.clientX, event.clientY).d.html("Click to hide bar");
        },
        mouseout: () => {
          tip.hide()
        }
      },
      legend: {
        click: () => {
          event.stopPropagation()
          const d = event.target.__data__
          if (!d) return
          if (d.type == 'col') {
            const i = self.settings.exclude.cols.indexOf(d.text)
            if (i == -1) return
            self.settings.exclude.cols.splice(i,1)
            self.main()
          }
          if (d.type == 'row') {
            const i = self.settings.exclude.rows.indexOf(d.text)
            if (i == -1) {
              self.settings.exclude.rows.push(d.text)
            } else {
              self.settings.exclude.rows.splice(i,1)
            }
            self.main()
          }
        },
        mouseover: () => {
          event.stopPropagation()
          tip.show(event.clientX, event.clientY).d.html("Click to unhide bar");
        },
        mouseout: () => {
          tip.hide()
        }
      },
      yAxis: {
        text: () => {
          if (s.orientation == "vertical") { 
            return s.unit == "pct" ? "% of patients" : "# of patients"
          } else {
            const term = self.terms.term1
            return term.name[0].toUpperCase() + term.name.slice(1)
          }
        }
      },
      xAxis: {
        text: () => {
          if (s.orientation == "vertical") { 
            const term = self.terms.term1
            return term.name[0].toUpperCase() + term.name.slice(1)
          } else {
            return s.unit == "pct" ? "% of patients" : "# of patients"
          }
        }
      }
    }
  }

  setControls() {
    this.controlsDiv = this.holder.append('div')
    /*
    this.addSelectOpts('orientation', 'Orientation', [
      {value: 'x', label: 'X axis'},
      {value: 'y', label: 'Y axis'}
    ])
    */
    this.addSelectOpts('unit', 'Y axis', [
      {value: 'abs', label: 'Linear'},
      {value: 'log', label: 'Log'},
      {value: 'pct', label: 'Percent'},
    ])
    
    this.addCrossTabBtn('term0', 'Chart By')
    this.addCrossTabBtn('term2', 'Select Second Term')
  }

  addSelectOpts(key, label, opts) {
    const selectDiv = this.controlsDiv.append('div')
      .style('padding', '3px')
      .style('text-align', 'center')
      .style('display', 'none')
      
    const selectLabel = selectDiv.append('label')
    selectLabel.append('span')
      .html(label + '<br/>')
    
    const selectElem = selectLabel.append('select')
      .on('change', () => {
        this.main({[key]: selectElem.property('value')})
      })

    selectElem.selectAll('options')
      .data(opts)
    .enter().append('option')
      .property('selected', d => d.value == this.settings[key] ? "selected" : "") 
      .attr('value', d => d.value)
      .html(d => d.label)

    this.controls[key] = {
      div: selectDiv,
      elem: selectElem,
      set: () => {
        selectElem.property('value', this.settings[key])
        selectElem
          .selectAll('option')
          .filter(d => d.value == 'pct')
          .property('disabled', () => this.settings.term2 === "")
      }
    }
  }

  addCrossTabBtn(key, label) {
    const btn = may_makebutton_crosstabulate({
      term1: this.terms.term1,
      button_row: this.controlsDiv,
      obj: this.opts.obj,
      callback: result => {
        //console.log(result)
        this.terms[key] = result.term2
        this.main({[key]: result.term2.id})
      }
    })

    btn.style('font-size','1em')
      .text(label)

    const closer = this.controlsDiv.append('div')
      .attr('class', 'sja-menu-option')
      .style('font-size', '1em')
      .style('display', 'none')
      .style('margin-right', '20px')
      .style('padding', '2px')
      .style('cursor', 'pointer')
      .style('background', '#f2f2f2')
      .html('X')
      .on('click', ()=>{
        this.terms[key] = undefined
        this.main({[key]: ''})
      })

    this.controls[key] = {
      div: btn,
      elem: null,
      set: () => {
        btn.text(this.terms[key] ? this.terms[key].name : label)
        closer.style('display', this.settings[key] ? 'inline-block' : 'none')
      }
    }
  }

  updateControls() {
    for(const key in this.controls) {
      if (key == 'unit' && this.settings.term2 && this.settings.unit == 'log') {
        this.settings.unit = 'abs'
      }
      this.controls[key].set()
      this.controls[key].div.style("display", "inline-block")
    }
    this.controls['unit'].elem
      .selectAll('option')
      .filter(d=>d.value=='log')
      .property("disabled", this.settings.term2 != "")
  }

  getLegendGrps(chart) {
    const legendGrps = []; 
    const s = this.settings
    if (s.exclude.cols.length) {
      legendGrps.push({
        name: "Hidden " + this.terms.term1.name + " value",
        items: s.exclude.cols.map(collabel => {
          const total = chart.serieses
            .filter(c => c.seriesId == collabel)
            .reduce((sum, b) => sum + b.total, 0)
          return {
            text: collabel,
            color: "#fff",
            textColor: "#000",
            border: "1px solid #333",
            inset: total ? total : '',
            type: 'col'
          }
        })
      })
    }
    if (!s.hidelegend && this.terms.term2 && this.term2toColor) {
      const colors = {}
      legendGrps.push({
        name: this.terms.term2.name,
        items: s.rows.map(d => {
          return {
            dataId: d,
            text: d,
            color: this.term2toColor[d],
            type: 'row',
            isHidden: s.exclude.rows.includes(d)
          }
        }).sort(
          this.settings.term2 && this.binLabels
          ? this.rowSorter 
          : (a,b) => a.text < b.text ? -1 : 1
        )
      })
    }
    return legendGrps;
  }

  getTableData(_settings={}, obj=null) {
    if (obj) {
      this.obj = obj; //console.log(obj, this.obj)
      if (obj.modifier_barchart_selectbar) {
        this.click_callback = obj.modifier_barchart_selectbar.callback
      }
    }
    this.updateSettings(_settings)

    const dataName = this.getDataName()
    if (this.serverData[dataName]) {
      return Promise.resolve(this.serverData[dataName]) 
    }
    else {
      return dofetch2('/termdb-barchart' + dataName)
      .then(chartsData => {
        this.serverData[dataName] = chartsData
        return chartsData
      })
    }
  }
}

export function may_make_barchart(plot) {
  if (plot.term2_boxplot || plot.default2showtable) {
    plot.bar_div.style('display','none')
    return
  }
  plot.bar_div.style('display','block')
  plot.svg.style('display','none')
  plot.legend_div.style('display','block')
  if(plot.boxplot_div){
    plot.boxplot_div.style('display','none')
  }

  const obj = plot.obj
  if (!plot.barchart) {
    plot.barchart = new Barchart({
      holder: plot.bar_div,
      settings: {},
      term1: plot.term,
      obj,
      legendDiv: plot.legend_div
    })
  }
  plot.barchart.main({
    genome: obj.genome.name,
    dslabel: obj.dslabel ? obj.dslabel : obj.mds.label,
    term1: plot.term.id,
    term2: obj.modifier_ssid_barchart ? 'genotype' 
      : plot.term2 ? plot.term2.id
      : '',
    ssid: obj.modifier_ssid_barchart ? obj.modifier_ssid_barchart.ssid : '',
    mname: obj.modifier_ssid_barchart ? obj.modifier_ssid_barchart.mutation_name : '',
    term2Obj: plot.term2,
    unit: plot.bar_settings.unit,
    custom_bins: plot.custom_bins,
    orientation: plot.bar_settings.orientation
  }, obj)
}

export function custom_table_data(plot) {
  const obj = plot.obj
  if (!plot.barchart) {
    plot.barchart = new Barchart({
      holder: plot.bar_div,
      settings: {},
      term1: plot.term,
      obj,
      legendDiv: plot.legend_div
    })
  }
  return plot.barchart.getTableData({
    genome: obj.genome.name,
    dslabel: obj.dslabel ? obj.dslabel : obj.mds.label,
    term1: plot.term.id,
    term2: obj.modifier_ssid_barchart ? 'genotype' 
      : plot.term2 ? plot.term2.id
      : '',
    ssid: obj.modifier_ssid_barchart ? obj.modifier_ssid_barchart.ssid : '',
    mname: obj.modifier_ssid_barchart ? obj.modifier_ssid_barchart.mutation_name : '',
    term2Obj: plot.term2,
    unit: plot.unit,
    custom_bins: plot.custom_bins
  }, obj)
  .then(chartsData => {
    const column_keys = chartsData.refs.rows
    const rows = chartsData.refs.cols.map(t1 => {
      return {
        label: t1,
        lst: chartsData.charts[0].serieses
            .find(d => d.seriesId == t1)
            .data.slice()
            .sort((a,b) => column_keys.indexOf(a.dataId) - column_keys.indexOf(b.dataId))
            .map(d => {
              return {
                label: d.dataId,
                value: d.total
              }
            })
      }
    })
    return {column_keys, rows}
  })
}
