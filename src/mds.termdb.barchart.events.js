import { event } from "d3-selection"
import { Menu } from './client'

const tip = new Menu({padding:'5px'})

export default function getHandlers(self) {
  const s = self.settings

  function barclick(d, callback, obj=null) {
  /*
    d: clicked bar data
    callback
  */

    const termValues = []
    self.terms.term0 = self.plot.term0
    self.terms.term1 = self.plot.term
    self.terms.term2 = self.plot.term2
    for(const index of [0,1,2]) { 
      const termNum = 'term' + index
      const term = self.terms[termNum]
      if (termNum == 'term0' || !term) continue

      const key = termNum=="term1" ? d.seriesId : d.dataId
      const q = term.q
      const label = term.iscondition && self.grade_labels && q.bar_by_grade
        ? self.grade_labels.find(c => c.grade == key).label
        : !term.values 
        ? key
        : termNum=="term1"
          ? term.values[d.seriesId].label
          : term.values[d.dataId].label

      if (term.iscondition) {
        termValues.push(Object.assign({
          term,
          values:[{key,label}]
        }, q));

        if (index == 1 && self.terms.term2 && term.id == self.terms.term2.id) {
          const q2 = self.plot.term2.q
          const term2Label = q.bar_by_children 
            ? self.grade_labels.find(c => c.grade == d.dataId).label
            : self.terms.term2.values
            ? self.terms.term2.values[d.dataId].label
            : d.dataId

          termValues.push(Object.assign({
            term,
            grade_and_child: [{
              grade: q2.bar_by_grade ? d.dataId : key,
              grade_label: q2.bar_by_grade ? term2Label : label ,
              child_id: q2.bar_by_children ? key : d.dataId,
              child_label: q2.bar_by_children ? label : term2Label
            }]
          }, q2))
        }
      } else {
        const bins = self.bins[index]
        if (!bins || !bins.length) {
          // not associated with numeric bins
          termValues.push({term, values: [{key, label}]})
        } else {
          const range = bins.find(d => d.label == label || d.name == label)
          if (range) termValues.push({term, ranges: [range]})
          else if (index==1 && d.unannotatedSeries) {
             termValues.push({term, ranges: [{value: d.unannotatedSeries.value, label}]})
          } else if (index==2 && d.unannotatedData) {
             termValues.push({term, ranges: [{value: d.unannotatedData.value, label}]})
          } else if (term.q && term.q.binconfig && term.q.binconfig.unannotated) {
            for(const id in term.q.binconfig.unannotated._labels) {
              const _label = term.q.binconfig.unannotated._labels[id];
              if (_label == label) termValues.push({term, ranges: [{value: id, label}]});
            }
          }
        }
      }
    }
    if (!obj) {
      callback({terms: termValues})
    } else {
      callback(obj, termValues)
    }
    self.obj.tip.hide()
  }

  return {
    chart: {
      title(chart) {
        if (!self.terms.term0) return chart.chartId
        const grade = self.grade_labels
          ? self.grade_labels.find(c => c.grade == chart.chartId)
          : null
        return self.terms.term0.values
          ? self.terms.term0.values[chart.chartId].label
          : grade
          ? grade.label
          : chart.chartId
      }
    },
    svg: {
      mouseout: ()=>{
        tip.hide()
      },
    },
    series: {
      mouseover(d) {
        const term1 = self.terms.term1
        const term2 = self.terms.term2 ? self.terms.term2 : null
        const seriesGrade = self.grade_labels
          ? self.grade_labels.find(c => c.grade == d.seriesId)
          : null
        const dataGrade = self.grade_labels
          ? self.grade_labels.find(c => c.grade == d.dataId)
          : null
        const term1unit = term1.unit 
        const seriesLabel = (term1.values
          ? term1.values[d.seriesId].label
          : term1.iscondition && seriesGrade
          ? seriesGrade.label
          : d.seriesId) + (term1.unit ? ' '+ term1.unit : '')
        const dataLabel = (term2 && term2.values
          ? term2.values[d.dataId].label
          : term2 && term2.iscondition && dataGrade
          ? dataGrade.label
          : d.dataId) + (term2 && term2.unit ? ' '+ term2.unit : '')
        const icon = !term2
          ? ''
          : "<div style='display:inline-block; width:14px; height:14px; margin: 2px 3px; vertical-align:top; background:"+d.color+"'>&nbsp;</div>"
        const rows = [`<tr><td colspan=2 style='padding:3px; text-align:center'>${seriesLabel}</td></tr>`]
        if (term2) rows.push(`<tr><td colspan=2 style='padding:3px; text-align:center'>${icon} <span>${dataLabel}</span></td></tr>`)
        rows.push(`<tr><td style='padding:3px; color:#aaa'>#Individuals</td><td style='padding:3px'>${d.total}</td></tr>`)
        rows.push(`<tr><td style='padding:3px; color:#aaa'>Percentage</td><td style='padding:3px'>${(100*d.total/d.seriesTotal).toFixed(1)}%</td></tr>`)
        tip.show(event.clientX, event.clientY).d.html(`<table class='sja_simpletable'>${rows.join('\n')}</table>`);
      },
      mouseout: ()=>{
        tip.hide()
      },
      rectFill(d) {
        return d.color
      },
      click(d) {
        if (self.obj.modifier_barchart_selectbar 
          && self.obj.modifier_barchart_selectbar.callback) {
          barclick(d, self.obj.modifier_barchart_selectbar.callback)
        }
        else if (self.obj.bar_click_menu) {
          bar_click_menu(self.obj, barclick, d)
        }
      }
    },
    colLabel: {
      text: d => {
        return self.terms.term1.values
          ? self.terms.term1.values['id' in d ? d.id : d].label
          : 'label' in d
          ? d.label
          : d
      },
      click: () => { 
        const d = event.target.__data__
        if (d === undefined) return; console.log(d.id)
        self.settings.exclude.cols.push(d.id)
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
        return self.terms.term1.values
          ? self.terms.term1.values['id' in d ? d.id : d].label
          : 'label' in d
          ? d.label
          : d
      },
      click: () => { 
        const d = event.target.__data__
        if (d === undefined) return
        self.settings.exclude.cols.push(d.id)
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
        if (d === undefined) return
        if (d.type == 'col') {
          const i = self.settings.exclude.cols.indexOf(d.id)
          if (i == -1) return
          self.settings.exclude.cols.splice(i,1)
          self.main()
        }
        if (d.type == 'row') {
          const i = self.settings.exclude.rows.indexOf(d.dataId)
          if (i == -1) {
            self.settings.exclude.rows.push(d.dataId)
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
          return term.iscondition && self.plot.term.q.value_by_max_grade
            ? 'Maximum grade'
            : term.iscondition && self.plot.term.q.value_by_most_recent
            ? 'Most recent grade'
            : term.iscategorical || !term.unit
            ? ''
            : term.unit //term.name[0].toUpperCase() + term.name.slice(1)
        }
      }
    },
    xAxis: {
      text: () => {
        if (s.orientation == "vertical") {
          const term = self.terms.term1
          const q1 = term.q
          return term.iscondition && q1.bar_by_grade && q1.value_by_max_grade
            ? 'Maximum grade' 
            : term.iscondition && q1.bar_by_grade && q1.value_by_most_recent
            ? 'Most recent grades'
            : term.iscategorical || !term.unit
            ? ''
            : term.unit // term.name[0].toUpperCase() + term.name.slice(1)
        } else {
          return s.unit == "pct" ? "% of patients" : "# of patients"
        }
      }
    }
  }
}

function bar_click_menu(obj, barclick, clickedBar) {
/*
  obj: the term tree obj
  barclick: function to handle option click
  clickedBar: the data associated with the clicked bar
*/
  const menu = obj.bar_click_menu
  const options = []
  if (menu.add_filter) {
    options.push({
      label: "Add as filter", 
      callback: menuoption_add_filter
    })
  }
  if (menu.select_group_add_to_cart) {
    options.push({
      label: "Select to GenomePaint",
      callback: menuoption_select_to_gp
    })
  }
  if (menu.select_to_gp) {
    options.push({
      label: "Add group to cart",
      callback: menuoption_select_group_add_to_cart
    })
  }
  if (options.length) {
    obj.tip.clear().d
      .selectAll('div')
      .data(options)
    .enter().append('div')
      .attr('class', 'sja_menuoption')
      .html(d=>d.label)
      .on('click', d => {
        barclick(clickedBar, d.callback, obj)
      })

    obj.tip.show(d3event.clientX, d3event.clientY)
  }
}