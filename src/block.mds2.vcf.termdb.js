import * as common from './common'
import * as client from './client'
import {scaleOrdinal,schemeCategory10, scaleLinear} from 'd3-scale'
import {axisLeft} from 'd3-axis'
import {event as d3event} from 'd3-selection'
import {display as tvs_display} from './mds.termdb.termvaluesetting.ui'
import {init as termdbinit} from './mds.termdb'
//import { may_get_param_AFtest_termfilter } from './block.mds2.vcf.numericaxis'


/*
obj{}
.mds{label}
.genome{}
.tip
.termfilter[]
.dom{}
	.row_filter
	.row_message
	.row_control
	.row_details
	.svg
.svg{}
	.ymax
	.axis_g
	.yscale
	.hoverdots
	.image
.ssid
.tmpfile


********************** EXPORTED
termdb_bygenotype
make_phewas
********************** INTERNAL
get_ssid_by_onevcfm
make_phewas_ui
run_phewas
phewas_svg
update_axis

*/







export async function make_phewas ( plotdiv, m, tk, block ) {
/*
phewas and also precompute
official track only
*/

	// sample session id
	const {ssid, groups} = await get_ssid_by_onevcfm( m, tk.mds.label, block.genome.name )

	const h = client.may_get_locationsearch()
	const div = plotdiv.append('div')
	const wait = div.append('div')

	try {
		if( h && h.has('precompute')) {
			const arg = [
				'genome='+block.genome.name,
				'dslabel='+tk.mds.label,
				'phewas=1&precompute=1'
			]
			const data = await client.dofetch2('/termdb?'+arg.join('&'))
			if(data.error) throw data.error
			wait.text( data.filename )
			return
		}

		// the run object
		const obj = {
			ssid,
			tip: tk.legend.tip,
			mds: tk.mds,
			genome: block.genome,
			termfilter:{terms:[]},
			dom:{}
		}

		// may add in termfilter
		if( tk.vcf && tk.vcf.numerical_axis && tk.vcf.numerical_axis.in_use && tk.vcf.numerical_axis.inuse_AFtest ) {
			// using AFtest, find the first termdb group and use
			const af = tk.vcf.numerical_axis.AFtest
			const tdbgrp = af.groups.find(i=> i.is_termdb )
			if( tdbgrp ) {
				obj.termfilter.terms.push( ...JSON.parse(JSON.stringify(tdbgrp.terms)) )
			}
			/*
			disable for the moment
			may_get_param_AFtest_termfilter

			if(af.termfilter && af.termfilter.inuse) {
				// this can only be in use at AFtest
				const k = af.termfilter.values[ af.termfilter.value_index ]
				obj.termfilter.terms.push({
					term:{
						id: af.termfilter.id,
						name: af.termfilter.name,
						iscategorical:true // hardcoded!!!
					},
					values:[ {key: k.key, label:(k.label || k.key)} ]
				})
			}
			*/
		}

		make_phewas_ui( obj, div, tk )

		await run_phewas( obj )
		wait.remove()
	} catch(e) {
		wait.text('Error: '+(e.message||e))
		if(e.stack) console.log(e.stack)
	}
}




function get_args( obj ) {
	const lst = [
		'genome='+obj.genome.name,
		'dslabel='+obj.mds.label,
		'ssid='+obj.ssid,
		'phewas=1',
		'intendwidth='+obj.svg.intendwidth,
		'axisheight='+obj.svg.axisheight,
		'groupnamefontsize='+obj.svg.groupnamefontsize,
		'dotradius='+obj.svg.dotradius,
		'groupxspace='+obj.svg.groupxspace,
		'leftpad='+obj.svg.leftpad,
		'rightpad='+obj.svg.rightpad,
		'toppad='+obj.svg.toppad,
		'bottompad='+obj.svg.bottompad
	]
	if(obj.termfilter.terms.length) lst.push( 'tvslst='+encodeURIComponent(JSON.stringify(obj.termfilter.terms)) )
	return lst
}



async function run_phewas ( obj ) {
	obj.dom.svg.selectAll('*').remove()
	const data = await client.dofetch2('/termdb?' + get_args(obj).join('&'))
	if(data.error) throw data.error
	if(!data.tmpfile) throw 'data.tmpfile missing'
	obj.tmpfile = data.tmpfile
	obj.svg.ymax = data.maxlogp
	obj.dom.filter_says.text('n='+data.numberofsamples)
	phewas_svg( data, obj )
}



function make_phewas_ui ( obj, div, tk ) {
	// vertical layers
	obj.dom.row_filter = div.append('div').style('margin-bottom','5px')
	obj.dom.row_message = div.append('div')
	obj.dom.row_control = div.append('div').style('margin','10px 0px')
	obj.dom.svg = div.append('svg')
	obj.dom.row_details = div.append('div')
	obj.svg = {
		intendwidth: 800,
		axisheight: 300,
		groupnamefontsize: 16,
		dotradius: 2,
		groupxspace: 3,
		leftpad: 2,
		rightpad: 2,
		toppad: 20,
		bottompad: 10,
	}

	{
		// filter
		obj.dom.row_filter.append('div')
			.style('display','inline-block')
			.text('FILTER')
			.style('font-size','.7em')
			.style('opacity',.5)

		const tvsuiObj = {
			group_div : obj.dom.row_filter.append('div').style('display','inline-block').style('margin','0px 10px'),
			group: obj.termfilter,
			mds: obj.mds,
			genome: obj.genome,
			tvslst_filter: tk.sample_termfilter,
			callback: async ()=>{
				tvsuiObj.update_terms()
				await run_phewas(obj)
			}  
		}
			
		tvs_display(tvsuiObj)

		obj.dom.filter_says = obj.dom.row_filter
			.append('div')
			.style('display','inline-block')
			.attr('class','sja_clbtext')
			.style('opacity',.6)
			.on('click',()=>{
				obj.tip.clear()
					.showunder(d3event.target)
				const lst = JSON.parse(JSON.stringify(obj.termfilter.terms))
				if( tk.sample_termfilter) {
					lst.push( ...JSON.parse(JSON.stringify(tk.sample_termfilter)) )
				}
				termdbinit({
					genome: obj.genome,
					mds: obj.mds,
					div: obj.tip.d,
					default_rootterm: {},
					termfilter:{ terms: lst }
				})
			})
	}

	// controls
	{
		const input = obj.dom.row_control
			.append('input')
			.attr('type','number')
			.style('width', '150px')
			.attr('placeholder','Set Y axis max')
			.on('keyup', async ()=>{
				if(!client.keyupEnter()) return
				const s = input.property('value')
				if(!s) return
				const v = Number(s)
				if(v<=0) {
					window.alert('Max value must be above 0')
					return
				}
				obj.svg.ymax = v
				input
					.property('value','')
					.property('disabled',true)
					.attr('placeholder','Loading...')
				const lst = get_args(obj)
				lst.push('update=1')
				lst.push('file='+obj.tmpfile)
				lst.push('max='+obj.svg.ymax)
				const data = await client.dofetch2('/termdb?'+lst.join('&'))
				obj.svg.image.attr('xlink:href', data.src )
				update_axis( data, obj )
				input
					.property('disabled',false)
					.attr('placeholder','Set Y axis max')
			})
	}
}






function phewas_svg ( data, obj ) {

	////////////// message
	obj.dom.row_message.text(
		data.testcount+' attributes tested, '
		+data.hoverdots.length+' attributes with FDR p-value <= 0.05, '
		+'Max -log10(FDR pvalue) is '+obj.svg.ymax
	)


	////////////// message


	////////////// svg
	const axiswidth = 80
	const xpad = 5
	obj.dom.svg.attr('width', axiswidth + xpad + data.canvaswidth )

	{
		// group labels define svg height
		let maxgrouplabheight=0
		for(const g of data.grouplabels) {
			obj.dom.svg.append('g')
				.attr('transform','translate('+( axiswidth+xpad+g.x)+','+g.y+')')
				.append('text')
				.attr('font-size',data.groupnamefontsize)
				.text(g.name)
				.attr('dominant-baseline','central')
				.attr('transform','rotate(90)')
				.each(function(){
					maxgrouplabheight = Math.max(maxgrouplabheight, this.getBBox().width)
				})
				.attr('class','sja_svgtext2')
				.on('click',()=>{
					get_group( g.name )
				})
		}
		obj.dom.svg.attr('height', data.canvasheight + maxgrouplabheight)
	}

	const g0 = obj.dom.svg.append('g')

	// axis
	obj.svg.yscale = scaleLinear()
	obj.svg.axis_g = g0.append('g')
		.attr('transform','translate('+axiswidth+','+obj.svg.toppad+')')

	// axis label
	g0.append('g')
		.attr('transform','translate(10,'+(obj.svg.toppad+obj.svg.axisheight/2)+')')
		.append('text')
		.text('-Log10(FDR p-value)')
		.attr('text-anchor','middle')
		.attr('dominant-baseline','central')
		.attr('transform','rotate(-90)')


	// plot
	const g = g0.append('g')
		.attr('transform','translate('+(axiswidth+xpad)+',0)')
	obj.svg.image = g.append('image')
		.attr('width', data.canvaswidth)
		.attr('height', data.canvasheight)
		.attr('xlink:href', data.src)

	obj.svg.hoverdots = g.append('g')
		.attr('transform','translate(0,'+obj.svg.toppad+')')
		.selectAll()
		.data( data.hoverdots )
		.enter()
		.append('g')
	obj.svg.hoverdots.append('circle')
		.attr('r', obj.svg.dotradius)
		.attr('fill', 'red')
		.on('mouseover', d=>{
			obj.tip.clear()
			const div = obj.tip.d.append('div')
				.style('margin','10px')
			div.append('div').text(d.term.name)
			if( d.parent_name ) {
				div.append('div')
					.style('font-size','.7em')
					.style('opacity','.5')
					.text('of '+d.parent_name)
			}
			const table = div.append('table')
				.style('margin','10px 0px')
			{
				const tr = table.append('tr')
				tr.append('td').text(d.group1label)
				const sum = d.table[0]+d.table[1]
				const barsvg = client.fillbar(null, { f: sum > 0 ? d.table[0]/sum : 0 })
				tr.append('td').html( barsvg + ' <span style="font-size:.7em;opacity:.5">ALT/REF</span> '+d.table[0]+' / '+d.table[1] )
			}
			{
				const tr = table.append('tr')
				tr.append('td').text(d.group2label)
				const sum = d.table[2]+d.table[3]
				const barsvg = client.fillbar(null, { f: sum > 0 ? d.table[2]/sum : 0 })
				tr.append('td').html( barsvg + ' <span style="font-size:.7em;opacity:.5">ALT/REF</span> '+d.table[2]+' / '+d.table[3] )
			}
			div.append('div').html( '<span style="opacity:.5;font-size:.8em">FDR P-value:</span> '+d.pvalue )
			obj.tip.show( d3event.clientX, d3event.clientY )
		})
		.on('mouseout',()=>{
			obj.tip.hide()
		})

	update_axis( data, obj )


	async function get_group ( name ) {
		// get list of categories for a group by clicking on label
		obj.dom.row_details.selectAll('*').remove()
		const wait = obj.dom.row_details.append('div').text('Loading...')
		const arg = [
			'genome='+obj.genome.name,
			'dslabel='+obj.mds.label,
			'file='+obj.tmpfile,
			'phewas=1',
			'getgroup='+name
		]
		const data2 = await client.dofetch2('/termdb?'+arg.join('&'))
		wait.remove()
		const table = obj.dom.row_details.append('table')
		const tr = table.append('tr')
		tr.append('th').text('Term')
		tr.append('th').text('Case')
		tr.append('th').text('Control')
		tr.append('th').text('FDR p-value')
		for(const i of data2.categories) {
			const tr = table.append('tr')
			tr.append('td').text(i.term.name)
			{
				const sum = i.table[0]+i.table[1]
				const barsvg = client.fillbar(null, { f: sum > 0 ? i.table[0]/sum : 0 })
				tr.append('td').html( i.group1label+' '+barsvg + ' <span style="font-size:.7em;opacity:.5">ALT/REF</span> '+i.table[0]+' / '+i.table[1] )
			}
			{
				const sum = i.table[2]+i.table[3]
				const barsvg = client.fillbar(null, { f: sum > 0 ? i.table[2]/sum : 0 })
				tr.append('td').html( i.group2label+' '+barsvg + ' <span style="font-size:.7em;opacity:.5">ALT/REF</span> '+i.table[2]+' / '+i.table[3] )
			}
			const td = tr.append('td').text(i.pvalue)
			if( i.pvalue<=0.05) td.style('color','red')
		}
	}
}




function update_axis ( data, obj ) {
	obj.svg.yscale
		.domain([ obj.svg.ymax, 0 ])
		.range( [ 0, obj.svg.axisheight ])
	client.axisstyle({
		axis: obj.svg.axis_g.call( axisLeft().scale( obj.svg.yscale ) ),
		fontsize: 12,
		showline:true
	})
	obj.svg.hoverdots
		.attr('transform', d=> 'translate('+d.x+','+(d.logp >= obj.svg.ymax ? 0 : obj.svg.yscale(d.logp))+')' )
}





function get_ssid_by_onevcfm ( m, dslabel, genome ) {
/*
using the genotype of one variant from the vcf file
divide samples to groups
record it in a temp file at cache
and get the file name
use the file name as a session in termdb
*/
	const arg = {
		dslabel: dslabel,
		genome: genome,
		m: {
			chr: m.chr,
			pos: m.pos,
			ref: m.ref,
			alt: m.alt
		},
		trigger_ssid_onevcfm:true
	}

	return client.dofetch('mds2', arg )
	.then(data=>{
		if(data.error) throw data.error
		return data
	})
}







export async function termdb_bygenotype( plotdiv, m, tk, block ) {
/*
not in use

launch termdb by the genotype of one vcf variant

official track only
*/

	// sample session id
	const {ssid, groups} = await get_ssid_by_onevcfm( m, tk.mds.label, block.genome.name )

	// assign a color for each group, show color legend
	{
		const row = plotdiv.append('div')
			.style('margin','10px')
		const f = scaleOrdinal(schemeCategory10)
		for(const name in groups) {
			groups[ name ].color = f(name)
			row.append('div')
				.style('font-size','.7em')
				.style('color','white')
				.style('display','inline-block')
				.style('background',groups[name].color)
				.style('padding','2px 4px')
				.text(groups[name].size)
			row.append('div')
				.style('display','inline-block')
				.style('padding','1px 5px')
				.style('margin-right','5px')
				.text(name)
		}
	}
	const par = {
		mds: tk.mds,
		genome: block.genome,
		div: plotdiv,
		default_rootterm: {},
		modifier_ssid_barchart: {
			chr: m.chr, // chr and pos needed for computing AF with respect to sex & par
			pos: m.pos,
			mutation_name: m.mname,
			ssid: ssid,
			groups: groups
		}
	}
	const _ = await import('./mds.termdb')
	_.init( par )
}



