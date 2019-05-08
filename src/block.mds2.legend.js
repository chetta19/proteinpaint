import {scaleOrdinal,schemeCategory20} from 'd3-scale'
import {event as d3event} from 'd3-selection'
import * as client from './client'
import {legend_newrow} from './block.legend'
import * as common from './common'
import {may_create_vcflegend_numericalaxis} from './block.mds2.vcf.numericaxis.legend'
import { toUnicode } from 'punycode';



/*
********************** EXPORTED
init
update
********************** INTERNAL
create_mclass
may_create_variantfilter
update_mclass
display_active_variantfilter_infofields
update_categorical_filter
update_flag_filter
update_numeric_filter
list_inactive_variantfilter
configure_one_infofield
*/


export function init ( tk, block ) {

	if(!tk.legend) tk.legend = {}
	tk.legend.tip = new client.Menu({padding:'0px'})

	const [tr,td] = legend_newrow(block,tk.name)

	tk.tr_legend = tr // to be compatible with block.tk_remove()

	const table = td.append('table')
		.style('border-spacing','5px')
		.style('border-collapse','separate')

	tk.legend.table = table

	may_create_vcflegend_numericalaxis( tk, block )
	may_create_variantfilter( tk, block )
	create_mclass( tk )
}





function create_mclass(tk) {
/*
list all mutation classes
attribute may have already been created with customization
legend.mclass{}
	.hiddenvalues
	.row
	.holder
*/
	if(!tk.legend.mclass) tk.legend.mclass = {}
	if(!tk.legend.mclass.hiddenvalues) tk.legend.mclass.hiddenvalues = new Set()

	tk.legend.mclass.row = tk.legend.table.append('tr')

	tk.legend.mclass.row
		.append('td')
		.style('text-align','right')
		.style('opacity',.3)
		.text('Mutation')

	tk.legend.mclass.holder = tk.legend.mclass.row.append('td')
}






export function update ( data, tk, block ) {
/*
data is returned by xhr
*/
	if( data.mclass2count ) {
		update_mclass( data.mclass2count, tk )
	}
	if( data.info_fields) {
		update_info_fields( data.info_fields, tk )
	}
}




function update_mclass ( mclass2count, tk ) {

	tk.legend.mclass.holder.selectAll('*').remove()

	const showlst = [],
		hiddenlst = []
	for(const k in mclass2count) {
		const v = { k: k, count: mclass2count[k] }
		if( tk.legend.mclass.hiddenvalues.has( k ) ) {
			hiddenlst.push(v)
		} else {
			showlst.push(v)
		}
	}
	showlst.sort((i,j)=>j.count-i.count)
	hiddenlst.sort((i,j)=>j.count-i.count)
	//tk.legend.mclass.total_count = classlst.reduce((a,b)=>a+b.count,0);

	for(const c of showlst) {
	/*
	k
	count
	*/

		let label,
			desc,
			color = '#858585'

		if( Number.isInteger( c.k ) ) {
			label = common.dt2label[ c.k ]
			if(c.dt==common.dtcnv) {
				desc = 'Copy number variation.'
			} else if(c.dt==common.dtloh) {
				desc = 'Loss of heterozygosity.'
			} else if(c.dt==common.dtitd) {
				color = common.mclass[ common.mclassitd ].color
				desc = 'Internal tandem duplication.'
			} else if(c.dt==common.dtsv) {
				desc = 'Structural variation of DNA.'
			} else if(c.dt==common.dtfusionrna) {
				desc = 'Fusion gene from RNA-seq.'
			}
		} else {
			label = common.mclass[ c.k ].label
			color = common.mclass[ c.k ].color
			desc = common.mclass[ c.k ].desc
		}

		const cell = tk.legend.mclass.holder.append('div')
			.attr('class', 'sja_clb')
			.style('display','inline-block')
			.on('click',()=>{

				tk.legend.tip.clear()
					.d.append('div')
					.attr('class','sja_menuoption')
					.text('Hide')
					.on('click',()=>{
						tk.legend.mclass.hiddenvalues.add( c.k )
						tk.legend.tip.hide()
						tk.load()
					})

				tk.legend.tip.d
					.append('div')
					.attr('class','sja_menuoption')
					.text('Show only')
					.on('click',()=>{
						for(const c2 of showlst) {
							tk.legend.mclass.hiddenvalues.add( c2.k )
						}
						tk.legend.mclass.hiddenvalues.delete( c.k )
						tk.legend.tip.hide()
						tk.load()
					})

				if(hiddenlst.length) {
					tk.legend.tip.d
						.append('div')
						.attr('class','sja_menuoption')
						.text('Show all')
						.on('click',()=>{
							tk.legend.mclass.hiddenvalues.clear()
							tk.legend.tip.hide()
							tk.load()
						})
				}

				tk.legend.tip.d
					.append('div')
					.style('padding','10px')
					.style('font-size','.8em')
					.style('width','150px')
					.text(desc)

				tk.legend.tip.showunder(cell.node())
			})

		cell.append('div')
			.style('display','inline-block')
			.attr('class','sja_mcdot')
			.style('background', color)
			.html( c.count>1 ? c.count : '&nbsp;')
		cell.append('div')
			.style('display','inline-block')
			.style('color',color)
			.html('&nbsp;'+label)
	}

	// hidden ones
	for(const c of hiddenlst) {

		let loading = false

		tk.legend.mclass.holder.append('div')
			.style('display','inline-block')
			.attr('class','sja_clb')
			.style('text-decoration','line-through')
			.style('opacity',.3)
			.text( 
				'('+c.count+') '
				+(Number.isInteger(c.k) ? common.dt2label[c.k] : common.mclass[c.k].label )
			)
			.on('click', async ()=>{

				if(loading) return
				loading = true
				tk.legend.mclass.hiddenvalues.delete( c.k )
				d3event.target.innerHTML = 'Updating...'
				await tk.load()
			})
	}
}








function may_create_variantfilter ( tk, block ) {
/*
called upon initiating the track
variant filters by both info fields and variantcase_fields
*/
	if(!tk.info_fields && !tk.variantcase_fields) return
	tk.legend.variantfilter = {}

	const tr = tk.legend.table.append('tr')
	tr.append('td')
		.style('text-align','right')
		.style('opacity',.3)
		.text('Variant Filters')

	const tr2 = tr.append('td')
		.style('padding-left','5px')
		.append('table')
		.append('tr')

	// button to list inactive filters
	tk.legend.variantfilter.button = tr2
		.append('td')
		.append('div')
		.style('display','inline-block')
		.attr('class','sja_menuoption')
		.text('+')
		.style('border-radius','3px')
		.style('border','solid 1px #ddd')
		.on('click',()=>{
			list_inactive_variantfilter( tk, block )
		})

	tk.legend.variantfilter.holder = tr2.append('td').style('padding-left','10px')

	// display filters active by default
	if( tk.info_fields ) {
		for(const i of tk.info_fields) {
			if(!i.isfilter) continue
			if(i.isactivefilter) {
				display_active_variantfilter_infofields( tk, i, block )
			}
		}
	}
	if( tk.variantcase_fields ) {
		console.log('to list active variantcase fields')
	}
}



function display_active_variantfilter_infofields ( tk, i, block ) {
/*
i is an element from tk.info_fields[]
add it as a new element to the holder
allow interacting with it, to update settings of i, and update track
*/
	const row = tk.legend.variantfilter.holder
		.append('div')
		.style('margin-top','5px')
	console.log(i)
	row.append('div')
		.style('display','inline-block')
		.style('border-radius','6px 0 0 6px')
		.style('background-color', '#ddd')
		.style('color','#000')
		.style('padding','6px 6px 6px 6px')
		.style('margin-left', '5px')
		.style('margin-right','1px')
		.style('font-size','.7em')
		.style('text-transform','uppercase')
		.text(i.label)

	const active_filter_div = row.append('div')
		.style('display','inline-block')

	if( i.iscategorical ) {

		// categorical category filter
		update_categorical_filter(tk, i, active_filter_div, row)

	} else if( i.isinteger || i.isfloat ) {

		// numerical category filter
		update_numeric_filter(tk, i, active_filter_div, row)

	} else if( i.isflag ) {
		update_flag_filter(tk, i, active_filter_div, row)
	} else {
		throw 'unknown info type'
	}

	// 'x' button to remove filter
	row.append('div')
		.attr('class','sja_filter_tag_btn')
		.style('border-radius','0 6px 6px 0')
		.style('background-color', '#ddd')
		.style('padding','2px 6px 4px 6px')
		.style('margin-right','1px')
		.style('color','#000')
		.html('&#215;')
		.on('click', async ()=>{
			row.remove()
			delete i.isactivefilter
			await tk.load()
		})
}



function list_inactive_variantfilter ( tk, block ) {
/*
from info_fields and variantcase_fields
list inactive filters
*/
	tk.legend.tip.clear()
	if(tk.info_fields) {
		for(const i of tk.info_fields) {
			if(!i.isfilter || i.isactivefilter) continue
			tk.legend.tip.d
			.append('div')
			.text(i.label)
			.attr('class','sja_menuoption')
			.on('click',()=>{
				tk.legend.tip.clear()
				configure_one_infofield( i, tk, block )
			})
		}
	}
	if(tk.variantcase_fields) {
	}
	tk.legend.tip.showunder( tk.legend.variantfilter.button.node() )
}



function configure_one_infofield ( i, tk, block ) {

	// for categorical field, to catch categories selected to be hidden
	let hiddencategories

	const div = tk.legend.tip.d.append('div')
		.style('margin','5px')

	if( i.iscategorical ) {
		// TODO display all categories
		hiddencategories = new Set()
	} else {
		// show range setter
	}

	tk.legend.tip.d.append('div')
		.attr('class','sja_menuoption')
		.text('APPLY')
		.on('click', async ()=>{

			if( hiddencategories ) {
				if(hiddencategories.size==0) return
				for(const v of i.values) {
					if(hiddencategories.has(v.key)) {
						v.ishidden=true
					}
				}
			} else {
			}

			i.isactivefilter = true
			display_active_variantfilter_infofields( tk, i, block )
			tk.legend.tip.hide()
			await tk.load()
		})
}



function update_info_fields ( data, tk ) {
/*
data is data.info_fields{}
*/
	for(const key in data) {
		const i = tk.info_fields.find( i=> i.key == key )
		if(!i) {
			console.log('info field not found by key: '+key)
			continue
		}
		i._data = data[key]
		if( i.isactivefilter ) {
			// an active filter; update stats
			if( i.iscategorical ) {
				// update counts from htmlspan
				if( i.unannotated_htmlspan ) i.unannotated_htmlspan.text('('+(i._data.unannotated_count||0)+') Unannotated')
				for(const v of i.values) {
					if( v.htmlspan ) {
						v.htmlspan.text('('+(i._data.value2count[v.key]||0)+') '+v.label)
					}
				}
			} else if( i.isinteger || i.isfloat ) {
				i.htmlspan.text('('+i._data.filteredcount+' filtered)')
			} else if( i.isflag ) {
				i.htmlspan.text('('+i._data.filteredcount+' filtered)')
			} else {
				throw 'unknown info type'
			}
		}
	}
}

function update_categorical_filter(tk, i, active_filter_div, row){

	active_filter_div.selectAll('*').remove()
	const tip = tk.legend.tip

	let hidden_term_count = 0,
		visible_term_count = 0

	for(const v of i.values ) {

		if(v.ishidden) {
			
			hidden_term_count = hidden_term_count + 1

			v.htmlspan = active_filter_div.append('div')
				.attr('class','sja_filter_tag_btn')
				.style('background-color', '#ddd')
				.style('padding','3px 6px 5px 6px')
				.style('margin-right','1px')
				.style('font-size','.9em')
				.style('color','#000')
				.text(
					(i._data ? '('+i._data.value2count[v.key]+') ' : '')
					+v.label
				)
				.style('text-decoration','line-through')
				.on('click',async ()=>{
					delete v.ishidden
					update_categorical_filter(tk, i, active_filter_div)
					if(hidden_term_count == 1){
						delete i.isactivefilter
						row.remove()
					}
					await tk.load()
				})
		} else {
			delete v.htmlspan
			visible_term_count = visible_term_count + 1
		}
	}
	if( i.unannotated_ishidden ) {
		i.unannotated_htmlspan = active_filter_div.append('span')
			.style('margin-right','10px')
			.text( (i._data ? '('+i._data.unannotated_count+') ' : '')+'Unannotated' )
			.style('text-decoration','line-through')
	} else {
		delete i.unannotated_htmlspan
	}

	// '+' button to add filter for same category, only if visible terms exist
	if(visible_term_count > 0){
		const add_filter_btn = active_filter_div.append('div')
			.attr('class','sja_filter_tag_btn')
			.style('background-color', '#ddd')
			.style('color','#000')
			.style('padding','2px 6px 4px 6px')
			.style('margin-right','1px')
			.html('&#43;')
			.on('click',()=>{
				tip.clear()
					.showunder( add_filter_btn.node() )

				const list_div = tip.d.append('div')
					.style('display','block')

				for(const v of i.values ) {

					if(!v.ishidden) {
						const row = list_div.append('div')

						row.append('div')
							.attr('class','sja_menuoption')
							.style('display','inline-block')
							.style('padding','1px 5px')
							.text(
								(i._data ? '('+i._data.value2count[v.key]+') ' : '')
								+v.label
							)
							.on('click',async ()=>{
								tip.hide()
								v.ishidden = true
								update_categorical_filter(tk, i, active_filter_div)
								visible_term_count = visible_term_count - 1
								await tk.load()
							})
					}
				}
		})
	}
}

function update_numeric_filter(tk, i, active_filter_div, row){

	active_filter_div.selectAll('*').remove()

	const numeric_div = active_filter_div.append('div')
		.attr('class','sja_filter_tag_btn')
		.style('background-color', '#ddd')
		.style('color','#000')
		.style('padding','3px 6px 4px 6px')
		.style('margin-right','1px')
		.style('font-size','.9em')

	numeric_div.selectAll('*').remove()

	const x = '<span style="font-family:Times;font-style:italic">x</span>'
	if( i.range.startunbounded ) {
		numeric_div.html(x+' '+(i.range.stopinclusive?'&le;':'&lt;')+' '+i.range.stop)
	} else if( i.range.stopunbounded ) {
		numeric_div.html(x+' '+(i.range.startinclusive?'&ge;':'&gt;')+' '+i.range.start)
	} else {
		numeric_div.html(
			i.range.start
			+' '+(i.range.startinclusive?'&le;':'&lt;')
			+' '+x
			+' '+(i.range.stopinclusive?'&le;':'&lt;')
			+' '+i.range.stop
		)
	}

	i.htmlspan = numeric_div.append('div')
		.style('display','inline-block')
		.style('background-color', '#ddd')
		.style('color','#000')
		.style('padding-left','3px')
		.text( i._data ? '('+i._data.filteredcount+' filtered)' : '')

	numeric_div.on('click', ()=>{

		const tip = tk.legend.tip
		tip.clear()

		const equation_div = tip.d.append('div')
			.style('display','block')
			.style('padding','3px 5px')

		const start_input = equation_div.append('input')
			.attr('type','number')
			.attr('value',i.range.start)
			.style('width','60px')
			.on('keyup', async ()=>{
				if(!client.keyupEnter()) return
				start_input.property('disabled',true)
				await apply()
				start_input.property('disabled',false)
			})

		// to replace operator_start_div
		const startselect = equation_div.append('select')
		.style('margin-left','10px')

		startselect.append('option')
			.html('&le;')
		startselect.append('option')
			.html('&lt;')
		startselect.append('option')
			.html('&#8734;')

		if(i.range.startunbounded){
			startselect.node().selectedIndex = 2
		}else if(i.range.startinclusive){
			startselect.node().selectedIndex = 0
		}else{
			startselect.node().selectedIndex = 1
		}

		equation_div.append('div')
			.style('display','inline-block')
			.style('padding','3px 10px')
			.html(x)

		// to replace operator_end_div
		const stopselect = equation_div.append('select')
			.style('margin-right','10px')

		stopselect.append('option')
			.html('&le;')
		stopselect.append('option')
			.html('&lt;')
		stopselect.append('option')
			.html('&#8734;')

		const stop_input = equation_div.append('input')
			.attr('type','number')
			.style('width','60px')
			.attr('value',i.range.stop)
			.on('keyup', async ()=>{
				if(!client.keyupEnter()) return
				stop_input.property('disabled',true)
				await apply()
				stop_input.property('disabled',false)
			})

		tip.d.append('div')
			.attr('class','sja_menuoption')
			.style('text-align','center')
			.text('APPLY')
			.on('click', ()=>{
				tip.hide()
				apply()
			})

		// tricky: only show tip when contents are filled, so that it's able to detect its dimention and auto position itself
		tip.showunder( numeric_div.node() )

		async function apply () {
			try {
				if(startselect.node().selectedIndex==2 && stopselect.node().selectedIndex==2) throw 'Both ends can not be unbounded'

				const start = startselect.node().selectedIndex==2 ? null : Number( start_input.node().value )
				const stop  = stopselect.node().selectedIndex==2  ? null : Number( stop_input.node().value )
				if( start!=null && stop!=null && start>=stop ) throw 'start must be lower than stop'

				if( startselect.node().selectedIndex == 2 ) {
					delete i.range.start
				} else {
					delete i.range.startunbounded
					i.range.start = start
					i.range.startinclusive = startselect.node().selectedIndex == 0
				}
				if( stopselect.node().selectedIndex == 2 ) {
					delete i.range.stop
				} else {
					delete i.range.stopunbounded
					i.range.stop = stop
					i.range.stopinclusive = stopselect.node().selectedIndex == 0
				}
				i.htmlspan.text('Loading...')
				await tk.load()
				update_numeric_filter(tk, i, active_filter_div, row)
			} catch(e) {
				window.alert(e)
			}
		}
	})


}

function update_flag_filter(tk, i, active_filter_div, row){

	active_filter_div.selectAll('*').remove()

	const cell = active_filter_div.append('div')
		.attr('class','sja_filter_tag_btn')
		.style('background-color', '#ddd')
		.style('color','#000')
		.style('padding','3px 6px 5px 6px')
		.style('margin-right','1px')
		.style('font-size','.9em')
		.on('click', async ()=>{
			i.remove_no = !i.remove_no
			i.remove_yes = !i.remove_yes
			i.htmlspan.text('Loading...')
			await tk.load()
			update_flag_filter(tk, i, active_filter_div, row)
		})

	cell.append('div')
		.style('display','inline-block')
		.style('background-color', '#ddd')
		.style('color','#000')
		.style('padding-left','3px')
		.style('text-decoration','line-through')
		.text( i.remove_no ? 'No' : 'Yes' )

	i.htmlspan = cell.append('div')
		.style('display','inline-block')
		.style('background-color', '#ddd')
		.style('color','#000')
		.style('padding-left','3px')
		.text( i._data ? '('+i._data.filteredcount+' filtered)' : '')
}
