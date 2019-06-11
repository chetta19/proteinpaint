import {select as d3select, event as d3event} from 'd3-selection'
import {may_trigger_crosstabulate} from './mds.termdb.crosstab'

// used to track controls unique "instances" by plot object
// to be used to disambiguate between input names
const plots = []

export function controls(arg, plot, main) {
  plot.config_div = arg.holder.append('div')
    .style('display','inline-block')
    .style('vertical-align','top')
    .style('margin', '8px')
    .style('padding', '5px')

  // controlsIndex to be used to assign unique radio input names
  // by config div
  plot.controlsIndex = plots.length
  plots.push(plot)

  plot.controls_update = () => {
    plot.controls.forEach(update => update())
  }

  // label
  plot.config_div.append('div')
    .style('color', '#777')
    .style('font-size', '12px')
    .style('cursor', 'pointer')
    .html('CONFIG')
    .on('click', () => {
      plot.controls.forEach(update => update())
      const display = tip.style('display')
      tip.style('display', display == "none" ? "inline-block" : "none")
      plot.config_div.style('background', display == "none" ? '#ececec' : "")
    })

  const tip = plot.config_div.append('div').style("display","none")
  // will be used to track control elements
  // for contextual updates
  plot.controls = []
  const table = tip.append('table')
  if (window.location.search.includes("conditionBy=")) setConditionsByOpts(plot, main, table)
  setConditionUnitOpts(plot, main, table, 'term', 'Bin unit', 1)
  setOverlayOpts(plot, main, table, arg)
  setConditionUnitOpts(plot, main, table, 'term2', 'Overlay unit', 2)
  setViewOpts(plot, main, table)
  setOrientationOpts(plot, main, table)
  setScaleOpts(plot, main, table)
  setBinOpts(plot, main, table, 'term1', 'Primary Bins')
  setBinOpts(plot, main, table, 'term2', 'Overlay Bins')
  setDivideByOpts(plot, main, table, arg)
  setConditionUnitOpts(plot, main, table, 'term0', 'Divide unit', 0)
}

function renderRadioInput(inputName, elem, opts, inputHandler) {
  const divs = elem.selectAll('div')
    .style('display', 'inline-block')
    .data(opts, d => d.value)
  
  divs.exit().each(function(d){
    d3select(this)
    .on('input', null)
    .on('click', null)
    .remove()
  })
  
  const labels = divs.enter().append('div')
    .style('display', 'inline-block')
    .style('padding', '3px 5px')
    .append('label')
  
  const inputs = labels.append('input')
    .attr('type', 'radio')
    .attr('name', inputName)
    .attr('value', d=>d.value)
    .style('vertical-align','top')
    .on('input', inputHandler)
  
  labels.append('span')
    .style('vertical-align','top')
    .html(d=>'&nbsp;'+d.label)

  return {
    divs: elem.selectAll('div'), 
    labels: elem.selectAll('label'),
    inputs: labels.selectAll('input'),
  }
}

function setOrientationOpts(plot, main, table) {
  const tr = table.append('tr')
  tr.append('td').html('Orientation')
  const td = tr.append('td')
  const radio = renderRadioInput(
    'pp-termdb-condition-unit-' + plot.controlsIndex, 
    td, 
    [
      {label: 'Vertical', value: 'vertical'},
      {label: 'Horizontal', value: 'horizontal'}
    ]
  )

  radio.inputs
  .property('checked', d => d.value == plot.settings.bar.orientation)
  .on('input', d => {
    plot.settings.bar.orientation = d.value
    main(plot)
  })

  plot.controls.push(() => {
    tr.style('display', plot.term2_displaymode == "stacked" ? "table-row" : "none")
  })
}

function setScaleOpts(plot, main, table) {
  const tr = table.append('tr')
  tr.append('td').html('Scale')
  const td = tr.append('td')
  const radio = renderRadioInput(
    'pp-termdb-scale-unit-' + plot.controlsIndex, 
    td, 
    [
      {label: 'Linear', value: 'abs'},
      {label: 'Log', value: 'log'},
      {label: 'Percentage', value: 'pct'}
    ]
  )

  radio.inputs
  .property('checked', d => d.value == plot.settings.bar.unit)
  .on('input', d => {
    plot.settings.bar.unit = d.value
    main(plot)
  })

  plot.controls.push(() => {
    tr.style('display', plot.term2_displaymode == "stacked" ? "table-row" : "none")
    radio.divs.style('display', d => {
      if (d.value == 'log') {
        return plot.term2 ? 'none' : 'inline-block' 
      } else if (d.value == 'pct') {
        return plot.term2 ? 'inline-block' : 'none'
      } else {
        return 'inline-block'
      }
    })
  })
}

function setOverlayOpts(plot, main, table, arg) {
  const tr = table.append('tr')
  tr.append('td').html('Overlay with')
  const td = tr.append('td')
  const radio = renderRadioInput(
    'pp-termdb-overlay-' + plot.controlsIndex, 
    td, 
    [
      {label: 'None', value: 'none'},
      {label: 'Term', value: 'tree'},
      {label: 'Genotype', value: 'genotype'}
    ]
  )

  radio.inputs
  .property('checked', d => d.value == plot.settings.bar.overlay)
  .on('input', d => {
    d3event.stopPropagation()
    plot.settings.bar.overlay = d.value
    if (d.value == "none") {
      plot.term2 = undefined
      plot.term2_displaymode = 'stacked'
      main(plot)
    } else if (d.value == "tree") {
      const obj = Object.assign({},plot.obj)
      delete obj.termfilter
      delete obj.termfilterdiv
      const _arg = {
        term1: arg.term,
        term2: plot.term2,
        obj,
        callback: term2 => {
          obj.tip.hide()

          // adding term2 for the first time
          plot.term2 = term2
          if (plot.term2.isfloat && plot.term2_boxplot) { 
            plot.term2_displaymode = 'boxplot'
            main(plot)
          } else {
            if (plot.term2_displaymode == "boxplot") {
              plot.term2_displaymode = "stacked"
            }
            plot.term2_boxplot = 0
            main( plot )
          }
        }
      }
      may_trigger_crosstabulate( _arg, tr.node() )
    } else if (d.value == "genotype") {
      // to-do
    }
  })

  radio.inputs.on('click', d => {
    d3event.stopPropagation()
    if (d.value != 'tree' || d.value != plot.settings.bar.overlay) return
    const obj = Object.assign({},plot.obj)
    delete obj.termfilter
    delete obj.termfilterdiv
    const _arg = {
      term1: arg.term,
      term2: plot.term2,
      obj,
      callback: term2=>{
        obj.tip.hide()
        plot.term2 = term2
        main(plot)
      }
    }
    may_trigger_crosstabulate( _arg, tr.node() )
  })

  plot.controls.push(() => {
    // hide all options when opened from genome browser view 
    tr.style("display", plot.obj.modifier_ssid_barchart ? "none" : "table-row")
    // do not show genotype overlay option when opened from stand-alone page
    if (!plot.settings.bar.overlay) {
      plot.settings.bar.overlay = plot.obj.modifier_ssid_barchart
        ? 'genotype'
        : plot.term2 
        ? 'tree'
        : 'none'
    }
    radio.inputs.property('checked', d => d.value == plot.settings.bar.overlay)
    radio.divs.style('display', d => d.value != 'genotype' || plot.obj.modifier_ssid_barchart ? 'inline-block' : 'none')
  })
}

function setViewOpts(plot, main, table, arg) {
  const tr = table.append('tr')
  tr.append('td').html('Display mode')
  const td = tr.append('td')
  const radio = renderRadioInput(
    'pp-termdb-display-mode-' + plot.controlsIndex, 
    td, 
    [
      {label: 'Barchart', value: 'stacked'},
      {label: 'Table', value: 'table'},
      {label: 'Boxplot', value: 'boxplot'}
    ]
  )

  radio.inputs
  .property('checked', d => d.value == plot.term2_displaymode)
  .on('input', d => {
    plot.term2_displaymode = d.value
    plot.term2_boxplot = d.value == 'boxplot'
    main(plot)
  })

  plot.controls.push(() => {
    tr.style("display", plot.term2 ? "table-row" : "none")
    radio.inputs.property('checked', d => d.value == plot.term2_displaymode)
    radio.divs.style('display', d => plot.term2 && (d.value != 'boxplot' || plot.term2.isfloat) ? 'inline-block' : 'none')
  })
}

function setDivideByOpts(plot, main, table, arg) {
  const tr = table.append('tr')
  tr.append('td').html('Divide by')
  const td = tr.append('td')
  const radio = renderRadioInput(
    'pp-termdb-divide-by-' + plot.controlsIndex, 
    td, 
    [
      {label: 'None', value: 'none'},
      {label: 'Term', value: 'tree'},
      {label: 'Genotype', value: 'genotype'}
    ]
  )

  radio.inputs
  .property('checked', d => d.value == plot.settings.bar.divideBy)
  .on('input', d => {
    d3event.stopPropagation()
    plot.settings.bar.divideBy = d.value
    if (d.value == "none") {
      plot.term0 = undefined
      //plot.term2_displaymode = 'stacked'
      main(plot)
    } else if (d.value == "tree") {
      const obj = Object.assign({},plot.obj)
      delete obj.termfilter
      delete obj.termfilterdiv
      const _arg = {
        term1: arg.term,
        term2: plot.term2,
        obj,
        callback: term2=>{
          obj.tip.hide()
          plot.term0 = term2
          main(plot)
        }
      }
      may_trigger_crosstabulate( _arg, tr.node() )
    } else if (d.value == "genotype") {
      // to-do
    }
  })

  radio.inputs.on('click', d => {
    d3event.stopPropagation()
    if (d.value != 'tree' || d.value != plot.settings.bar.divideBy) return
    const obj = Object.assign({},plot.obj)
    delete obj.termfilter
    delete obj.termfilterdiv
    const _arg = {
      term1: arg.term,
      term2: plot.term0,
      obj,
      callback: term2=>{
        obj.tip.hide()
        plot.term0 = term2
        main(plot)
      }
    }
    may_trigger_crosstabulate( _arg, tr.node() )
  })

  plot.controls.push(() => {
    // hide all options when opened from genome browser view 
    tr.style("display", plot.obj.modifier_ssid_barchart || plot.term2_displaymode != "stacked" ? "none" : "table-row")
    // do not show genotype divideBy option when opened from stand-alone page
    if (!plot.settings.bar.divideBy) {
      plot.settings.bar.divideBy = plot.obj.modifier_ssid_barchart
        ? 'genotype'
        : plot.term0
        ? 'tree'
        : 'none'
    }
    radio.inputs.property('checked', d => d.value == plot.settings.bar.divideBy)
    radio.divs.style('display', d => d.value != 'genotype' || plot.obj.modifier_ssid_barchart ? 'inline-block' : 'none')
  })
}

function setConditionsByOpts(plot, main, table) {
  const tr = table.append('tr')
  const labeltd = tr.append('td').html('Categories By')
  const td = tr.append('td')
  plot.controls.push(() => {
    //console.log(plot.term.iscondition, plot.term.graph, )

    tr.style('display', plot.term.iscondition 
      && plot.term.graph
      && plot.term.graph.barchart
      && plot.term.graph.barchart.bar_choices 
      ? "table-row" 
      : "none"
    )
    if (tr.style('display') == 'none') return
    const radio = renderRadioInput(
      'pp-termdb-conditions-by-' + plot.controlsIndex, 
      td,
      [
        {label: 'Grade', value: 'by_grade'},
        {label: 'Children', value: 'by_children'}
      ]
      /*plot.term.graph.barchart.bar_choices
      .filter(d => d.by_grade || d.by_children)
      .map(d => { console.log(d)
        let value = d.by_grade ? 'by_grade' : 'by_children'
        return {label: d.label, value}
      })*/
    )

    radio.inputs
    .property('checked', d => d.value == plot.settings.common.conditionsBy)
    .on('input', d => {
      plot.settings.common.conditionsBy = d.value
      if (d.value == "by_grade") {
        if (1) { //plot.settings.common.conditionUnits == "none") {
          plot.settings.common.conditionUnits[1] = "max_grade_perperson"
          plot.term2 = null
        }
      } else if (plot.settings.common.conditionUnits[1] == 'by_children') {
        plot.term2 = null
      } else {
        plot.settings.common.conditionUnits[1] = d.value
        plot.settings.common.conditionParent = plot.term.id
        plot.term2 = Object.assign({}, plot.term)
      }
      main(plot)
    })

    radio.divs.style('display', 'block')
    radio.inputs.property('checked', d => plot.settings.common.conditionsBy == d.value)
  })
}

function setConditionUnitOpts(plot, main, table, termNum, label, index) {
  if ( !plot[termNum]
    || !plot[termNum].graph 
    || !plot[termNum].graph.barchart 
    || !plot[termNum].graph.barchart.value_choices
  ) return
  const cu = plot.settings.common.conditionUnits
  const tr = table.append('tr')
  const labeltd = tr.append('td').html(label) // delete??
  const td = tr.append('td')
  const optionsSeed = window.location.search.includes("conditionBy=") ? [{label: "None", value: "by_children"}] : [] 
  let prevRadio // delete?? 

  plot.controls.push(() => {
    const radio = renderRadioInput(
      'pp-termdb-condition-unit-'+ index + '-' + plot.controlsIndex, 
      td,
      optionsSeed.concat( 
        plot[termNum].graph.barchart.value_choices
        .filter(d => d.max_grade_perperson || d.most_recent_grade)
        .map(d => {
          let value = d.max_grade_perperson 
            ? 'max_grade_perperson'
            : 'most_recent_grade'

          return {label: d.label, value}
        })
      )
    )

    radio.inputs
    .property('checked', d => d.value == cu[index])
    .on('input', d => {
      cu[index] = d.value
      if (index == 1 && d.value == "by_children" && plot.settings.common.conditionParent) {
        plot.term2 = null
      }
      main(plot)
    })

    tr.style('display', 
      termNum == 'term'
      && plot[termNum] 
      && plot[termNum].iscondition 
      ? "table-row" 
      : "none")
    radio.divs.style('display', 
      d => d.value != 'none' || plot.settings.common.conditionsBy == "by_children" ? 'block' : 'none'
    )
    radio.inputs.property('checked', d => cu[index] == d.value) 
  })
}

function setBinOpts(plot, main, table, termNum, label) {
  const tr = table.append('tr')
  
  tr.append('td').html(label)

  tr.append('td')
    .style('text-decoration', 'underline')
    .style("cursor", "pointer")
    .html('edit ...')
    .on('click', () => {
      custom_bin(plot, main, termNum.slice(-1), tr.node())
    })

  plot.controls.push(() => {
    plot.term1 = plot.term
    tr.style('display', plot[termNum] && plot[termNum].isfloat ? 'table-row' : 'none')
  })
}

function custom_bin(plot, main, binNum=1, btn){
  plot.tip.clear().showunder(btn)

  const custom_bins = binNum in plot.custom_bins ? plot.custom_bins[binNum] : null
  const controls = plot.bin_controls[binNum]

  const custom_bin_div = plot.tip.d.append('div')
    .style('margin','10px 0px')
    .style('align-items','flex-start')
    .style('display','flex')

  // First Bin
  const first_bin_div = custom_bin_div.append('div')
    .style('display','inline-block')
    .style('margin-left','25px')
    .style('text-align','center')

  first_bin_div.append('div')
    .text('First Bin')
    .style('padding-right','3px')
    .style('text-align','center')

  const first_bin_input_div = first_bin_div.append('div')
    .style('margin-top','10px')
    .style('display','block')
    .style('white-space','nowrap')
  
  controls.first_bin_oper = first_bin_input_div.append('select')
    .property('selected', custom_bins && custom_bins.first_bin_oper == "lteq")
  controls.first_bin_oper.append('option')
    .attr('value', 'lt')
    .html('&lt;')
    .property('selected', custom_bins && custom_bins.first_bin_oper == "lt")
  controls.first_bin_oper.append('option')
    .attr('value', 'lteq')
    .html('&lt;=')

  controls.first_bin_size = first_bin_input_div.append('input')
    .style('display','inline-block')
    .style('margin-left','5px')
    .attr('size','8')
    .attr('placeholder', 'auto')
    .property('value', !custom_bins 
      ? null
      : custom_bins.first_bin_size == "auto"
      ? null
      : custom_bins.first_bin_size)

  controls.first_bin_options = first_bin_div.append('select')
    .style('margin-top','10px')

  controls.first_bin_options.append('option')
    .attr('value','value')
    .text('Value')
    .property('selected', custom_bins && custom_bins.first_bin_option == 'value' ? true : false)

  controls.first_bin_options.append('option')
    .attr('value','percentile')
    .text('Percentile')
    .property('selected', custom_bins && custom_bins.first_bin_option == 'percentile' ? true : false)

  // Bin Size
  const bin_size_div = custom_bin_div.append('div')
    .style('display','inline-block')
    .style('margin-left','25px')
    .style('margin-right','10px')

  bin_size_div.append('div')
    .text('Bin Size')
    .style('padding-right','3px')
    .style('text-align','center')

  controls.custom_bin_size = bin_size_div.append('input')
    .style('margin-top','10px')
    .attr('size','8')
    .style('text-align','center')
    .property('value', custom_bins ? custom_bins.size : null)
    .attr('placeholder', 'auto')

  // Last Bin
  const last_bin_div = custom_bin_div.append('div')
    .style('display','inline-block')
    .style('margin-left','25px')
    .style('margin-right','10px')
    .style('text-align','center')

  last_bin_div.append('div')
    .text('Last Bin')
    .style('padding-right','3px')
    .style('text-align','center')

  const last_bin_input_div = last_bin_div.append('div')
    .style('margin-top','10px')
    .style('display','block')
    .style('white-space','nowrap')
  
  controls.last_bin_oper = last_bin_input_div.append('select')
  controls.last_bin_oper.append('option')
    .attr('value', 'gt')
    .html('&gt;')
    .property('selected', custom_bins && custom_bins.first_bin_oper == "gt")
  controls.last_bin_oper.append('option')
    .attr('value', 'gteq')
    .html('&gt;=')
    .property('selected', custom_bins && custom_bins.first_bin_oper == "gteq")

  controls.last_bin_size = last_bin_input_div.append('input')
    .style('display','inline-block')
    .style('margin-left','5px')
    .attr('size','8')
    .attr('placeholder', 'auto')
    .property('value', !custom_bins 
      ? null
      : custom_bins.last_bin_size == "auto"
      ? null
      : custom_bins.last_bin_size)

  controls.last_bin_options = last_bin_div.append('select')
    .style('margin-top','10px')

  controls.last_bin_options.append('option')
    .attr('value','value')
    .text('Value')
    .property('selected', custom_bins && custom_bins.last_bin_option == 'value' ? true : false)

  controls.last_bin_options.append('option')
    .attr('value','percentile')
    .text('Percentile')
    .property('selected', custom_bins && custom_bins.last_bin_option == 'percentile' ? true : false)

  // submit, reset buttons
  const btndiv = plot.tip.d.append('div')
    .style('text-align','center')
    
  btndiv.append('button')
    .html('Submit')
    .on('click', ()=>{
      const size = controls.custom_bin_size.property('value')
      const first_bin_size = controls.first_bin_size.property('value')
      const first_bin_option = controls.first_bin_options.property('value')
      const first_bin_oper = controls.first_bin_oper.property('value')
      const last_bin_size = controls.last_bin_size.property('value')
      const last_bin_option = controls.last_bin_options.property('value')
      const last_bin_oper = controls.last_bin_oper.property('value')
      if (size !== "" && isNaN(size)) {
        alert('Invalid bin size.' + size)
      } else {
        //if (!first_bin_size || !isNaN(first_bin_size)) errs.push('Invalid first')
        plot.custom_bins[binNum] = {
          size: size ? +size : "auto",
          first_bin_size: first_bin_size != '' && !isNaN(first_bin_size) ? +first_bin_size : 'auto',
          first_bin_option,
          first_bin_oper,
          last_bin_size: last_bin_size != '' && !isNaN(last_bin_size) ? +last_bin_size : 'auto',
          last_bin_option,
          last_bin_oper
        }
        main(plot)
        plot.tip.hide()
      }
    })

  btndiv.append('button')
    .html('Reset')
    .on('click', ()=>{
      plot.custom_bins[binNum] = null
      main(plot)
      plot.tip.hide()
    })

  btndiv.append('button')
    .html('Cancel')
    .on('click', ()=>{
      plot.tip.hide()
    })
}
