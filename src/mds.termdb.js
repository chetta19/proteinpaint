import * as client from './client'
import * as common from './common'
//import {axisTop} from 'd3-axis'
//import {scaleLinear,scaleOrdinal,schemeCategory10} from 'd3-scale'
import {select as d3select,selectAll as d3selectAll,event as d3event} from 'd3-selection'
import {barchart_make} from './mds.termdb.barchart'

/*

init() accepts following triggers:
- show term tree starting with default terms, at terms show graph buttons
- show term tree, for selecting a term (what are selectable?), no graph buttons

init accepts obj{}
obj has modifiers for modifying the behavior/display of the term tree




********************** EXPORTED
init()
********************** INTERNAL
show_default_rootterm
print_one_term
may_make_term_foldbutton
may_make_term_graphbuttons
may_make_term_crosstabulatebutton
term_addbutton_barchart


Notes:
* as it is called "termdb", use "term" rather than "node", to increase consistency


server returns json objects as terms, which are from the termjson table



planned features:
* launch this vocabulary tree on a variant; limit patients to those carrying alt alleles of this variant


*/






export async function init ( obj  ) {
/*
obj{}:
.genome {}
.mds{}
.div
*/
window.obj = obj

	obj.errdiv = obj.div.append('div')
	obj.treediv = obj.div.append('div')
	obj.tip = new client.Menu({padding:'5px'})

	try {

		if(!obj.genome) throw '.genome{} missing'
		if(!obj.mds) throw '.mds{} missing'

		// handle triggers

		if( obj.default_rootterm ) {
			await show_default_rootterm( obj )
			return
		}

		// to allow other triggers


	} catch(e) {
		obj.errdiv.text('Error: '+ (e.message||e) )
		if(e.stack) console.log(e.stack)
		return
	}
}



async function show_default_rootterm ( obj ) {
/* for showing default terms, as defined by ds config

also for showing term tree, allowing to select certain terms

obj has modifiers to modify how to print the terms

*/
	const arg = {
		genome: obj.genome.name,
		dslabel: obj.mds.label,
		default_rootterm: 1
	}
	const data = await client.dofetch( 'termdb', arg )
	if(data.error) throw 'error getting default root terms: '+data.error
	if(!data.lst) throw 'no default root term: .lst missing'

	// show root nodes

	for(const i of data.lst) {
		const arg = {
			row: obj.treediv.append('div'),
			term: i,
			isroot: 1,
		}
		print_one_term( arg, obj )
	}
}




function print_one_term ( arg, obj ) {
/* print a term
for non-leaf term, show the expand/fold button
upon clicking button, to retrieve children and make recursive call to render children

arg{}
.row <DIV>
.term{}
	.name
	.isleaf
	...
.isroot
*/

	const term = arg.term

	/* a row to show this term
	if the term is parent, will also contain the expand/fold button
	children to be shown in a separate row
	*/
	const row = arg.row.append('div')

	may_make_term_foldbutton( term, row, arg.row, obj )

	// term name
	row.append('div')
		.style('display','inline-block')
		.style('padding','5px 3px 5px 1px')
		.html( term.name )

	// term function buttons

	may_make_term_graphbuttons( term, row, obj )

	may_make_term_crosstabulatebutton( term, row, obj )
}



function may_make_term_crosstabulatebutton ( term, row, obj ) {
/*
add button for cross-tabulating
currently defaults this to barchart-equipped terms
later may define a specific rule for enabling cross-tabulating
*/
	if(!term.graph || !term.graph.barchart ) return

	const button = row.append('div')
		.style('display','inline-block')
		.style('margin-left','20px')
		.style('padding','3px 5px')
		.style('font-size','.8em')
		.attr('class','sja_menuoption')
		.text('CROSSTAB')

	// click button to show term tree
	// generate a temp obj for running init()

	button.on('click',()=>{

		obj.tip.clear()
			.showunder( button.node() )

		const obj2 = {
			genome: obj.genome,
			mds: obj.mds,
			default_rootterm: {
				// add modifier
				allow_select_term:1
			},
			div: obj.tip.d
		}

		init( obj2 )
	})
}



function may_make_term_graphbuttons ( term, row, obj ) {
/*
if term.graph{} is there, make a button to trigger it
allow to make multiple buttons
*/
	if(!term.graph) {
		// no graph
		return
	}


	if(term.graph.barchart) {
		// barchart button
		term_addbutton_barchart( term, row, obj )
	}


	// to add other graph types
}




function term_addbutton_barchart ( term, row, obj ) {
/*
click button to launch barchart for a term

there may be other conditions to apply, e.g. patients carrying alt alleles of a variant
such conditions may be carried by obj
*/

	const button = row.append('div')
		.style('display','inline-block')
		.style('margin-left','20px')
		.style('padding','3px 5px')
		.style('font-size','.8em')
		.attr('class','sja_menuoption')
		.text('BARCHART')

	// by clicking button for first time, query server to load data
	// set to true to prevent from loading repeatedly
	let loading = false
	// make one panel per button; no duplicated panels
	let panel

	button.on('click',()=>{

		if( loading ) return

		if( panel ) {
			// panel has been created, toggle its visibility
			if(panel.pane.style('display') == 'none') {
				panel.pane.style('display', 'block')
				client.flyindi( button, panel.pane )
				button.style('border', null)
			} else {
				client.flyindi( panel.pane, button )
				panel.pane.style('display', 'none')
				button.style('border', 'solid 1px black')
			}
			return
		}

		// ask server to make data for barchart

		button.text('Loading')
			.property('disabled',1)

		loading = true

		panel = client.newpane({
			x: d3event.clientX+200,
			y: Math.max( 80, d3event.clientY-100 ),
			close:()=>{
				client.flyindi( panel.pane, button )
				panel.pane.style('display', 'none')
				button.style('border', 'solid 1px black')
			}
		})

		panel.header.text('Barplot for '+term.name)

		const arg = {
			genome: obj.genome.name,
			dslabel: obj.mds.label,
			barchart: {
				id: term.id
			}
		}

		client.dofetch( 'termdb', arg )
		.then(data=>{
			if(data.error) throw data.error
			if(!data.lst) throw 'no data for barchart'

			// make barchart
			const plot = {
				items: data.lst,
				holder: panel.body,
				term: term
			}

			barchart_make( plot )
		})
		.catch(e=>{
			client.sayerror( panel.body, e.message || e)
			if(e.stack) console.log(e.stack)
		})
		.then(()=>{
			loading = false
			button.text('BARCHART')
				.property('disabled',false)
		})
	})
}



function may_make_term_foldbutton ( term, buttonholder, row, obj ) {
/*
may show expand/fold button for a term

buttonholder: div in which to show the button, term label is also in it
row: the parent of buttonholder for creating the div for children terms
*/

	if(term.isleaf) {
		// is leaf term, no button
		return
	}

	let children_loaded = false, // whether this term has children loaded already
		isloading = false

	// row to display children terms
	const childrenrow = row.append('div')
		.style('display','none')
		.style('padding-left', '30px')

	const button = buttonholder.append('div')
		.style('display','inline-block')
		.style('font-family','courier')
		.attr('class','sja_menuoption')
		.text('+')

	button.on('click',()=>{

		if(isloading) return // guard against clicking while loading

		if(children_loaded) {
			// children has been loaded, toggle visibility
			if(childrenrow.style('display') === 'none') {
				client.appear(childrenrow)
				button.text('-')
			} else {
				client.disappear(childrenrow)
				button.text('+')
			}
			return
		}

		// to load children terms
		isloading = true

		const param = {
			genome: obj.genome.name,
			dslabel: obj.mds.label,
			get_children: {
				id: term.id
			}
		}
		client.dofetch('termdb', param)
		.then(data=>{
			if(data.error) throw data.error
			if(!data.lst || data.lst.length===0) throw 'error getting children'
			// got children
			for(const cterm of data.lst) {
				print_one_term(
					{
						term: cterm,
						row: childrenrow,
					},
					obj
				)
			}
		})
		.catch(e=>{
			childrenrow.text( e.message || e)
			if(e.stack) console.log(e.stack)
		})
		.then( ()=>{
			isloading=false
			children_loaded = true
			client.appear( childrenrow )
			button.text('-')
		})
	})
}





