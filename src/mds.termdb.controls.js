import {select as d3select, event as d3event} from 'd3-selection'
import {
  menuoption_add_filter,
  menuoption_select_to_gp, 
  menuoption_select_group_add_to_cart
} from './mds.termdb'
import * as client from './client'
import {make_numeric_bin_btns, display as termui_display, numeric_bin_edit} from './mds.termdb.termsetting.ui'

// used to track unique "instances" of controls by plot object
// to be used to disambiguate between input names
const plots = []


const panel_bg_color = '#fdfaf4'
const panel_border_color = '#D3D3D3'

export function init(arg, plot, main) {
  plot.dom.controls
    .style('margin', '8px')
    .style('vertical-align', 'top')
    .style('transition','0.5s')

  plot.dom.controlsTopBar = plot.dom.controls.append('div')
  const hamburger_btn = plot.dom.controlsTopBar.append('div')
    .attr('class','sja_edit_btn')
    .style('margin','10px')
    .style('font-size', '16px')
    .style('transition','0.5s')
    .html('&#8801;')
    .on('click', () => {
      plot.syncControls.forEach(update => update())
      const visibility = tip.style('visibility')
      
      //change visibility of 'config' div
      tip.style('visibility', visibility == 'hidden' ? 'visible' : 'hidden')
        
      plot.config_div
        .style('max-width', visibility == 'hidden' ? '660px' : '50px')
        .style('height', visibility == 'hidden' ? '' : 0)
        
      plot.dom.controls.style('background', visibility == 'hidden' ? panel_bg_color : '')
        // .style('border', display == "none" ? 'solid 1px '+panel_border_color : "")

      hamburger_btn
        .html(visibility == 'hidden' ? '&#215;' : '&#8801;')
    })

  plot.config_div = plot.dom.controls.append('div')
    .style('max-width', '50px')
    .style('height', 0)
    .style('vertical-align','top')
    .style('transition', '0.2s ease-in-out')
    .style('overflow', 'hidden')

  // controlsIndex to be used to assign unique radio input names
  // by config div
  plot.controlsIndex = plots.length
  plots.push(plot)
  

  const tip = plot.config_div.append('div')
    .style('visibility','hidden')
    .style('transition','0.2s')
  
  // will be used to track control element related 
  // functions to synchronize an input to the relevant plot.term or setting
  // !!! important since changes to a plot.term or setting
  // !!! may be triggered by more than one input or function
  // !!! the sync functions are called in plot.controls_update below
  plot.syncControls = []
  
  const table = tip.append('table').attr('cellpadding',0).attr('cellspacing',0)
  setBarsAsOpts(plot, main, table, 'term', 'Bars as', 1)
  setOverlayOpts(plot, main, table, arg)
  setViewOpts(plot, main, table)
  setOrientationOpts(plot, main, table)
  setScaleOpts(plot, main, table)
  setBinOpts(plot, main, table, 'term1', 'Primary Bins')
  // setBinOpts(plot, main, table, 'term2', 'Overlay Bins') // will be handled from term2 blue-pill
  setDivideByOpts(plot, main, table, arg)


  function rowIsVisible() {
    return d3select(this).style('display') != 'none'
  }

  function rowStyle(){
    d3select(this).selectAll('td')
    .style('border-top','2px solid #FFECDD')
    .style('padding','5px 10px')
  }

  return {
    main(plot, data) {
      plot.config_div.style('display', data.charts && data.charts.length ? 'inline-block' : 'none')
      plot.syncControls.forEach(update => update()) // match input values to current
      table.selectAll('tr')
      .filter(rowIsVisible)
      .each(rowStyle)
    }
  }
}

function renderRadioInput(inputName, elem, opts, inputHandler) {
  const divs = elem.selectAll('div')
    .style('display', 'block')
    .data(opts, d => d.value)
  
  divs.exit().each(function(d){
    d3select(this)
    .on('input', null)
    .on('click', null)
    .remove()
  })
  
  const labels = divs.enter().append('div')
    .style('display', 'block')
    .style('padding', '5px')
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
    labels: elem.selectAll('label').select('span'),
    inputs: labels.selectAll('input'),
  }
}

function setOrientationOpts(plot, main, table) {
  const tr = table.append('tr')
  tr.append('td').html('Orientation').attr('class', 'sja-termdb-config-row-label')
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

  plot.syncControls.push(() => {
    tr.style('display', plot.term2_displaymode == "stacked" ? "table-row" : "none")
  })
}

function setScaleOpts(plot, main, table) {
  const tr = table.append('tr')
  tr.append('td').html('Scale').attr('class', 'sja-termdb-config-row-label')
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

  plot.syncControls.push(() => {
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
  tr.append('td').html('Overlay with').attr('class', 'sja-termdb-config-row-label')
  const td = tr.append('td')
  const radio = renderRadioInput(
    'pp-termdb-overlay-' + plot.controlsIndex, 
    td, 
    [
      {label: 'None', value: 'none'},
      {label: 'Subconditions', value: 'bar_by_children'},
      {label: 'Grade', value: 'bar_by_grade'},
      {label: '', value: 'tree'},
      {label: 'Genotype', value: 'genotype'},
    ]
  )

  const bar_by_children_radio = radio.inputs.filter(d=>d.value=="bar_by_children").node();
  const bar_by_grade_radio = radio.inputs.filter(d=>d.value=="bar_by_grade").node();

  const value_by_params = ['value_by_max_grade', 'value_by_most_recent', 'value_by_computable_grade']
  
  //add blue-pill for term2
  const treeInput = radio.inputs.filter((d)=>{ return d.value == 'tree'}).style('margin-top', '2px')
  const pill_div = d3select(treeInput.node().parentNode.parentNode)
    .append('div')
    .style('white-space','normal')
    .style('display','inline-block')
  
  const termuiObj = {
    mainlabel: 'Another term',
    holder: pill_div,
    genome: plot.obj.genome,
    mds: plot.obj.mds,
    tip: plot.obj.tip,
    currterm: plot.term,
    termsetting: {term:plot.term2, q: plot.term2?plot.term2.q:undefined},
    callback: (term2) => {
      plot.term2 = term2
      if (!term2) {
        plot.settings.bar.overlay = 'none'
      } else {
        plot.settings.bar.overlay = 'tree'
        treeInput.property('checked', true)

        if (term2.isfloat && plot.term2_boxplot) { 
          plot.term2_displaymode = 'boxplot'
        } else {
          if (plot.term2_displaymode == "boxplot") {
            plot.term2_displaymode = "stacked"
          }
          plot.term2_boxplot = 0
        } 
      }
      main( plot )
    }
  }

  plot.termuiObjOverlay = termuiObj
  termui_display(termuiObj)
      
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
      plot.term2 = termuiObj.termsetting.term
      main(plot)
    } else if (d.value == "genotype") {
      // to-do
      console.log('genotype overlay to be handled from term tree portal', d, d3event.target)
    } else if (d.value == "bar_by_children") { 
      if (plot.term.q.bar_by_children){
        console.log('bar_by_children term1 should not allow subcondition overlay')
        return
      }
      plot.term2 = Object.assign({}, plot.term)
      plot.term2.q = Object.assign({}, plot.term.q)
      termuiObj.termsetting.term = undefined
      delete plot.term2.q.bar_by_grade
      plot.term2.q.bar_by_children = 1
      for(const param of value_by_params) {
        delete plot.term2.q[param]
        if (plot.term.q[param]) plot.term2.q[param] = 1
      }
      main(plot)
    } else if (d.value == "bar_by_grade") {
      if (plot.term.q.bar_by_grade){
        console.log('bar_by_grade term1 should not allow grade overlay')
        return
      }
      plot.term2 = Object.assign({}, plot.term)
      plot.term2.q = Object.assign({}, plot.term.q)
      termuiObj.termsetting.term = undefined
      delete plot.term2.q.bar_by_children
      plot.term2.q.bar_by_grade = 1
      for(const param of value_by_params) {
        delete plot.term2.q[param]
        if (plot.term.q[param]) plot.term2.q[param] = 1
      }
      main(plot)
    } else {
      console.log('unhandled click event', d, d3event.target)
    }
  })

  radio.inputs.on('click', d => {
    d3event.stopPropagation()
    if (d.value != 'tree' || d.value != plot.settings.bar.overlay) return
	
    plot.obj.showtree4selectterm(
      [arg.term.id, plot.term2 ? plot.term2.id : null],
	    tr.node(),
      (term2)=>{
  	    plot.obj.tip.hide()
          plot.term2 = term2
          if (plot.term2.isfloat && plot.term2_boxplot) { 
            plot.term2_displaymode = 'boxplot'
          } else {
            if (plot.term2_displaymode == "boxplot") {
              plot.term2_displaymode = "stacked"
            }
            plot.term2_boxplot = 0
          }
          main( plot )
      }
    )
  })

  plot.syncControls.push(() => {
    // hide all options when opened from genome browser view 
    tr.style("display", plot.obj.modifier_ssid_barchart ? "none" : "table-row");
    // do not show genotype overlay option when opened from stand-alone page
    if (!plot.settings.bar.overlay) {
      plot.settings.bar.overlay = plot.obj.modifier_ssid_barchart
        ? 'genotype'
        : plot.term2 && plot.term2.id != plot.term.id
        ? 'tree'
        : 'none'
    }
    radio.inputs.property('checked', d => d.value == plot.settings.bar.overlay)

    radio.labels
      .html(d=>{
        const term1 = plot.term
        if (!term1.iscondition) return '&nbsp;'+ d.label
        if (d.value == "bar_by_children") return '&nbsp;'+ term1.id + " subconditions"
        if (d.value == "bar_by_grade") return '&nbsp;'+ term1.id + " grades"
        return '&nbsp;'+ d.label
      })

    radio.divs
      .style('display', d => { 
        const term1 = plot.term
        if (d.value == "bar_by_children") {
          return term1.iscondition && !term1.isleaf && term1.q && term1.q.bar_by_grade ? 'block' : 'none'
        } else if (d.value == "bar_by_grade") {
          return term1.iscondition && !term1.isleaf && term1.q && term1.q.bar_by_children ? 'block' : 'none'
        } else {
          const block = 'block' //term1.q.iscondition || (plot.term2 && plot.term2.iscondition) ? 'block' : 'inline-block'
          return d.value != 'genotype' || plot.obj.modifier_ssid_barchart ? block : 'none'
        }
      })

    if (plot.term2 && plot.term2.id != plot.term.id && plot.term2 != termuiObj.termsetting.term) {
      termuiObj.termsetting.term = plot.term2
      termuiObj.update_ui()
    }
  })
}

function setViewOpts(plot, main, table, arg) {
  const tr = table.append('tr')
  tr.append('td').html('Display mode').attr('class', 'sja-termdb-config-row-label')
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

  plot.syncControls.push(() => {
    tr.style("display", plot.term2 ? "table-row" : "none")
    radio.inputs.property('checked', d => d.value == plot.term2_displaymode)
    radio.divs.style('display', d => plot.term2 && (d.value != 'boxplot' || plot.term2.isfloat) ? 'inline-block' : 'none')
  })
}

function setDivideByOpts(plot, main, table, arg) {
  const tr = table.append('tr')
  tr.append('td').html('Divide by').attr('class', 'sja-termdb-config-row-label')
  const td = tr.append('td')
  const radio = renderRadioInput(
    'pp-termdb-divide-by-' + plot.controlsIndex, 
    td, 
    [
      {label: 'None', value: 'none'},
      {label: '', value: 'tree'},
      {label: 'Genotype', value: 'genotype'}
    ]
  )
  
  //add blue-pill for term0
  const pill_div = d3select(radio.divs.filter((d)=>{ return d.value == 'tree'}).node())
    .append('div')
    .style('display','inline-block')
  
  const termuiObj = {
    holder: pill_div,
    genome: plot.obj.genome,
    mds: plot.obj.mds,
    tip: plot.obj.tip,
    currterm: plot.term,
    termsetting: {term:plot.term0, q: plot.term0?plot.term0.q:undefined},
    currterm: plot.term,
    callback: (term0) => {
      plot.term0 = term0
      plot.settings.bar.divideBy = term0 ? 'tree' : 'none'
      main( plot )
    }
  }

  plot.termuiObjDivide = termuiObj
  termui_display(termuiObj)

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
      plot.term0 = termuiObj.termsetting.term
      main(plot)
    } else if (d.value == "genotype") {
      // to-do
    }
  })

  plot.syncControls.push(() => {
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
    radio.divs.style('display', d => {
      if (d.value == "max_grade_perperson" || d.value == "most_recent_grade") {
        return plot.term.iscondition || (plot.term0 && plot.term0.iscondition) ? 'block' : 'none'
      } else {
        const block = 'block' //plot.term.iscondition || (plot.term0 && plot.term0.iscondition) ? 'block' : 'inline-block'
        return d.value != 'genotype' || plot.obj.modifier_ssid_barchart ? block : 'none'
      }
    })

    if (plot.term0 && plot.term0 != termuiObj.termsetting.term) {
      termuiObj.termsetting.term = plot.term0
      termuiObj.update_ui()
    }
  })
}

function setBarsAsOpts(plot, main, table, termNum, label, index) {
  /**/
  const tr = table.append('tr')
  tr.append('td').html(label).attr('class', 'sja-termdb-config-row-label')
  const td = tr.append('td')
  /*
  const options = [
    {label: "Subconditions, max grade", value: "bar_by_children + value_by_max_grade"},
    {label: "Subconditions, most recent", value: "bar_by_children + value_by_most_recent"},
    {label: "Subconditions, graded", value: "bar_by_children + value_by_computable_grade"},
    {label: "Max grade per patient", value: "bar_by_grade + value_by_max_grade"},
    {label: "Most recent grades per patient", value: "bar_by_grade + value_by_most_recent"}, 
    {label: "Grade per patient", value: "bar_by_grade + value_by_computable_grade"},
  ]
  */
   if (!plot.term.q) plot.term.q = {}

   const termuiObj = {
    holder: td.append('div'),
    genome: plot.obj.genome,
    mds: plot.obj.mds,
    tip: plot.obj.tip,
    currterm: plot.term,
    termsetting: {term: plot.term},
    currterm: plot.term,
    is_term1: true,
    callback: (term) => {
      if (term) plot.term = term
      if (plot.term2 && plot.term.q) {
        if (
          (plot.term2.q.bar_by_children && (!plot.term.q || !plot.term.q.bar_by_grade))
          || (plot.term2.q.bar_by_grade && (!plot.term.q || !plot.term.q.bar_by_children))
        ) plot.term2 = undefined
      }
      main( plot )
    }
  }
  setTimeout(()=> {
    if (!plot.term.q) plot.term.q = {}
    termuiObj.termsetting.q = plot.term.q

    termui_display(termuiObj)
  },0)

  plot.syncControls.push(() => {
    tr.style('display', plot.term && plot.term.iscondition ? 'table-row' : 'none')
    plot.termuiObjOverlay.update_ui()
  })
}


function setBinOpts(plot, main, table, termNum, label) {
  const tr = table.append('tr')

  tr.append('td').html(label).attr('class', 'sja-termdb-config-row-label')

  const bin_edit_td = tr.append('td')

  bin_edit_td.append('div')
    .attr('class','sja_edit_btn')
    .style('margin-left','0px')
    .html('EDIT')
    .on('click',()=>{
      // click to show ui and customize binning
      numeric_bin_edit(plot.tip, plot.term, plot.term.q, true, (result)=>{
        if (!plot.term.q) plot.term.q = {}
        if (result !== plot.term.q) {
          for(const key in plot.term.q) delete plot.term.q[key]
          Object.assign(plot.term.q, result)
        }
        main(plot)
    })
  })

  //TODO: remove following code if not used
  plot.syncControls.push(() => {
    plot.term1 = plot.term
    tr.style('display', plot[termNum] && plot[termNum].isfloat ? 'table-row' : 'none')
  })
}


export function bar_click_menu(obj, barclick, clickedBar) {
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
