import {scaleOrdinal,schemeCategory20} from 'd3-scale'
import * as client from './client'
import {legend_newrow} from './block.legend'
import * as common from './common'
import {loadTk} from './block.mds.svcnv'
import {event as d3event} from 'd3-selection'

/*
*********** exported:

makeTk_legend
update_legend
updateLegend_singleSample
updateLegend_multiSample


*********** internal:
may_legend_svchr
may_legend_mclass
may_legend_attribute
*/


const fontsize = 14
const xpad = 15
const barh = 20




export function makeTk_legend(block, tk) {
	/*
	only run once, to initialize legend
	for all cases:
		single- and multi-sample
		official and custom track
	*/

	const [tr,td] = legend_newrow(block,tk.name)
	tk.tr_legend = tr
	tk.td_legend = td

	const table = td.append('table')
		.style('border-spacing','5px')

	tk.legend_table = table
	// track hideable rows that are non-mutation attr 
	tk.legend_hideable = []


	create_mclass( tk )

	create_cnv( tk )

	create_loh( tk )

	create_svchrcolor( tk )

	create_sampleAttribute( tk )

	create_mutationAttribute(tk)

	create_alleleAttribute(tk, block)


	tk.legend_more_row = table.append('tr')
	tk.legend_more_label = tk.legend_more_row.append('td')
							.style('text-align','right')
							.append('span')
	// blank cell for now since hidden legend items
	// are displayed in pop-down menu, not in this row
	tk.legend_more_row.append('td')
}






export function update_legend(tk, block) {
	/*
	for all cases
	*/
	may_legend_svchr(tk)
	may_legend_mclass(tk, block)
	if(tk.singlesample) {
		// only do above for single sample case
		return
	}
	// is multi-sample: also do following
	may_legend_attribute(tk, block)
}








// helpers





function create_mclass(tk) {
	/*
	list all mutation classes
	*/
	const row = tk.legend_table.append('tr')
	tk.legend_mclass = {
		row:row,
		hiddenvalues: new Set(), // !!!!
		hidden: false,
	}
	row.append('td')
		.style('text-align','right')
		.style('opacity',.5)
		.text('Mutation')
	tk.legend_mclass.holder = row.append('td')
	tk.legend_hideable.push(tk.legend_mclass)
}





function create_cnv(tk) {
	/*
	cnv log ratio color scale
	*/
	const leftpad = 50

	//// cnv color scale

	tk.cnvcolor.cnvlegend = {
		axistickh:4,
		barw:55
	}

	tk.cnvcolor.cnvlegend.row = tk.legend_table.append('tr')
	tk.cnvcolor.cnvlegend.row.append('td')
		.style('text-align','right')
		.style('opacity',.5)
		.text('CNV log2(ratio)')
	tk.legend_hideable.push(tk.cnvcolor.cnvlegend)

	const svg = tk.cnvcolor.cnvlegend.row
			.append('td')
			.append('svg')
			.attr('width', (leftpad+tk.cnvcolor.cnvlegend.barw)*2)
			.attr('height',fontsize+tk.cnvcolor.cnvlegend.axistickh+barh)

		tk.cnvcolor.cnvlegend.axisg = svg.append('g')
			.attr('transform','translate('+leftpad+','+(fontsize+tk.cnvcolor.cnvlegend.axistickh)+')')

		const gain_id = Math.random().toString()
		const loss_id = Math.random().toString()

		const defs = svg.append('defs')
		{
			// loss
			const grad = defs.append('linearGradient')
				.attr('id', loss_id)
			tk.cnvcolor.cnvlegend.loss_stop = grad.append('stop')
				.attr('offset','0%')
				.attr('stop-color', tk.cnvcolor.loss.str)
			grad.append('stop')
				.attr('offset','100%')
				.attr('stop-color', 'white')
		}
		{
			// gain
			const grad = defs.append('linearGradient')
				.attr('id', gain_id)
			grad.append('stop')
				.attr('offset','0%')
				.attr('stop-color', 'white')
			tk.cnvcolor.cnvlegend.gain_stop = grad.append('stop')
				.attr('offset','100%')
				.attr('stop-color', tk.cnvcolor.gain.str)
		}

		svg.append('rect')
			.attr('x',leftpad)
			.attr('y',fontsize+tk.cnvcolor.cnvlegend.axistickh)
			.attr('width', tk.cnvcolor.cnvlegend.barw)
			.attr('height',barh)
			.attr('fill', 'url(#'+loss_id+')')

		svg.append('rect')
			.attr('x', leftpad+tk.cnvcolor.cnvlegend.barw)
			.attr('y',fontsize+tk.cnvcolor.cnvlegend.axistickh)
			.attr('width', tk.cnvcolor.cnvlegend.barw)
			.attr('height',barh)
			.attr('fill', 'url(#'+gain_id+')')

		svg.append('text')
			.attr('x',leftpad-5)
			.attr('y',fontsize+tk.cnvcolor.cnvlegend.axistickh+barh/2)
			.attr('font-family',client.font)
			.attr('font-size',fontsize)
			.attr('text-anchor','end')
			.attr('dominant-baseline','central')
			.attr('fill','black')
			.text('Loss')
		svg.append('text')
			.attr('x', leftpad+tk.cnvcolor.cnvlegend.barw*2+5)
			.attr('y',fontsize+tk.cnvcolor.cnvlegend.axistickh+barh/2)
			.attr('font-family',client.font)
			.attr('font-size',fontsize)
			.attr('dominant-baseline','central')
			.attr('fill','black')
			.text('Gain')
}




function create_loh(tk) {

	if(tk.mds
		&& tk.mds.queries
		&& tk.mds.queries[tk.querykey]
		&& tk.mds.queries[tk.querykey].no_loh) {
		// quick dirty
		return
	}

	//// loh color legend

	const leftpad=20

	tk.cnvcolor.lohlegend = {
		axistickh:4,
		barw:55
	}

	tk.cnvcolor.lohlegend.row = tk.legend_table.append('tr')
	tk.cnvcolor.lohlegend.row.append('td')
		.style('text-align','right')
		.style('opacity',.5)
		.text('LOH seg.mean')
	tk.legend_hideable.push(tk.cnvcolor.lohlegend)

	const svg = tk.cnvcolor.lohlegend.row
		.append('td')
		.append('svg')
		.attr('width', (leftpad+tk.cnvcolor.lohlegend.barw)*2)
		.attr('height',fontsize+tk.cnvcolor.lohlegend.axistickh+barh)

	tk.cnvcolor.lohlegend.axisg = svg.append('g')
		.attr('transform','translate('+leftpad+','+(fontsize+tk.cnvcolor.lohlegend.axistickh)+')')

	const loh_id = Math.random().toString()

	const defs = svg.append('defs')
	{
		const grad = defs.append('linearGradient')
			.attr('id', loh_id)
		grad.append('stop')
			.attr('offset','0%')
			.attr('stop-color', 'white')
		tk.cnvcolor.lohlegend.loh_stop = grad.append('stop')
			.attr('offset','100%')
			.attr('stop-color', tk.cnvcolor.loh.str)
	}

	svg.append('rect')
		.attr('x', leftpad)
		.attr('y',fontsize+tk.cnvcolor.lohlegend.axistickh)
		.attr('width', tk.cnvcolor.lohlegend.barw)
		.attr('height',barh)
		.attr('fill', 'url(#'+loh_id+')')
}



function create_svchrcolor(tk) {

	const row = tk.legend_table.append('tr')
		.style('display','none') // default hide

	tk.legend_svchrcolor={
		row:row,
		interchrs:new Set(),
		colorfunc: scaleOrdinal(schemeCategory20),
		hidden: true
	}
	row.append('td')
		.style('text-align','right')
		.style('opacity',.5)
		.text('SV chromosome')
	tk.legend_svchrcolor.holder = row.append('td')
	tk.legend_hideable.push(tk.legend_svchrcolor)
}


function create_sampleAttribute(tk) {
	if(tk.singlesample) return
	if(!tk.sampleAttribute) return
	/*
	official only
	sampleAttribute is copied over from mds.queries
	initiate attributes used for filtering & legend display
	*/
	for(const key in tk.sampleAttribute.attributes) {
		const attr = tk.sampleAttribute.attributes[ key ]
		if(!attr.filter) {
			// not a filter
			continue
		}
		attr.hiddenvalues = new Set()
		// k: key in mutationAttribute.attributes{}

		attr.value2count = new Map()
		/*
		k: key
		v: {
			totalitems: INT
			dt2count: Map( dt => count )
		}
		*/

		attr.legendrow = tk.legend_table.append('tr')
		attr.legendcell = attr.legendrow.append('td')
			.style('text-align','right')
			.style('opacity',.5)
			.text(attr.label)

		attr.legendholder = attr.legendrow.append('td')
	}
}



function create_mutationAttribute(tk) {
	if(tk.singlesample) return
	if(!tk.mutationAttribute) return
	/*
	official only
	mutationAttribute is copied over from mds.queries
	initiate attributes used for filtering & legend display
	*/
	for(const key in tk.mutationAttribute.attributes) {
		const attr = tk.mutationAttribute.attributes[ key ];
		if(!attr.filter) {
			// not a filter
			continue
		}
		attr.hiddenvalues = new Set()
		// k: key in mutationAttribute.attributes{}

		attr.value2count = new Map()
		/*
		k: key
		v: {
			totalitems: INT
			dt2count: Map( dt => count )
		}
		*/

		attr.legendrow = tk.legend_table.append('tr')
		attr.legendcell = attr.legendrow.append('td')
			.style('text-align','right')
			.style('opacity',.5)
			.text(attr.label)

		attr.legendholder = attr.legendrow.append('td')
	}
}



function create_alleleAttribute(tk, block) {
	if(!tk.alleleAttribute) return
	/*
	official only
	alleleAttribute is copied over from mds.queries
	initiate attributes used for filtering & legend display
	*/
	for(const key in tk.alleleAttribute.attributes) {
		const attr = tk.alleleAttribute.attributes[ key ];
		if(!attr.filter) {
			// not a filter
			continue
		}

		attr.legendrow = tk.legend_table.append('tr')
		attr.legendcell = attr.legendrow.append('td')
			.style('text-align','right')
			.style('opacity',.5)
			.text(attr.label)

		attr.legendholder = attr.legendrow.append('td')

		if(attr.isnumeric) {

			/*
			numeric cutoff with options:
			<= no greater than
			>= no smaller than
			x  do not use
			*/

			const select = attr.legendholder.append('select')
				.style('margin','0px 10px 0px 10px')
				.on('change',()=>{
					const value = select.property('value')

					if(value=='x') {
						attr.disable=true
					} else {
						delete attr.disable
						attr.keeplowerthan = value=='<'
					}

					loadTk(tk,block)
				})

			const lowerthan = select.append('option')
				.attr('value','<')
				.property('text','≤')

			const higherthan = select.append('option')
				.attr('value','>')
				.property('text','≥')

			const disable = select.append('option')
				.attr('value','x')
				.property('text','X')

			if(attr.disable) {
				disable.property('selected',1)
			} else if(attr.keeplowerthan) {
				lowerthan.property('selected',1)
			} else {
				higherthan.property('selected',1)
			}

			attr.legendholder.append('input')
				.attr('type','number')
				.style('width','50px')
				.property('value',attr.cutoffvalue)
				.on('keyup',()=>{
					if(d3event.key!='Enter') return
					attr.cutoffvalue = d3event.target.valueAsNumber
					loadTk(tk, block)
				})


		} else {
			// categorical
			attr.hiddenvalues = new Set()
			// k: key in mutationAttribute.attributes{}

			attr.value2count = new Map()
		}

	}
}





function may_legend_svchr(tk) {

	tk.legend_svchrcolor.holder.selectAll('*').remove()
	if(tk.legend_svchrcolor.interchrs.size==0) return
	tk.legend_svchrcolor.row.style('display','table-row')
	for(const chr of tk.legend_svchrcolor.interchrs) {
		const color=tk.legend_svchrcolor.colorfunc(chr)
		const d=tk.legend_svchrcolor.holder.append('div')
			.style('display','inline-block')
			.style('margin','3px 10px 3px 0px')
		d.append('div')
			.style('display','inline-block')
			.style('border-radius','10px')
			.style('padding','0px 10px')
			.style('border','solid 1px ' + color )
			.style('color', color )
			.style('font-size','.9em')
			.text(chr)
	}
}




function may_legend_mclass(tk, block) {
	/*
	full or dense
	native or custom
	single or multi-sample
	always shown! both snvindel class & dt included (cnv/loh/sv/fusion/itd)
	*/

	tk.legend_mclass.holder.selectAll('*').remove()

	const classes = new Map()
	/*
	k: class
	v: {cname, count}
	if is snvindel class, key is class code e.g. "M"
	if not, key is dt
	*/

	// vcf classes
	if(tk.data_vcf) {
		for(const m of tk.data_vcf) {
			if(!classes.has( m.class )) {
				classes.set( m.class, {
					isvcf:1,
					cname:m.class,
					count:0
				} )
			}
			classes.get(m.class).count++
		}
	}
	// non-vcf classes
	if(tk.singlesample) {
		if(tk.data) {
			for(const i of tk.data) {
				if(!classes.has(i.dt)) {
					classes.set( i.dt, {
						dt: i.dt,
						count:0
					})
				}
				classes.get(i.dt).count++
			}
		}
	} else if(tk._data) {
		for(const g of tk._data) {
			for(const s of g.samples) {
				for(const i of s.items) {
					if(!classes.has(i.dt)) {
						classes.set( i.dt, {
							dt: i.dt,
							count:0
						})
					}
					classes.get(i.dt).count++
				}
			}
		}
	}

	const classlst = [ ...classes.values() ]
	classlst.sort( (i,j)=>j.count-i.count )
	tk.legend_mclass.total_count = classlst.reduce((a,b)=>a+b.count,0);

	for(const c of classlst) {

		let key,
			label,
			desc,
			color = '#858585'

		if(c.dt) {
			key = c.dt
			label = common.dt2label[ c.dt ]
			if(c.dt==common.dtcnv) desc = 'Copy number variation.'
			else if(c.dt==common.dtloh) desc = 'Loss of heterozygosity.'
			else if(c.dt==common.dtitd) {
				color = common.mclass[ common.mclassitd ].color
				desc = 'Internal tandem duplication.'
			} else if(c.dt==common.dtsv) desc = 'Structural variation of DNA.'
			else if(c.dt==common.dtfusionrna) desc = 'Fusion gene from RNA-seq.'
		} else {
			key = c.cname
			label = common.mclass[ c.cname ].label
			color = common.mclass[ c.cname ].color
			desc = common.mclass[c.cname].desc
		}

		const cell = tk.legend_mclass.holder.append('div')
			.attr('class', 'sja_clb')
			.style('display','inline-block')
			.on('click',()=>{
				tk.tip2.showunder(cell.node())
					.clear()

				tk.tip2.d.append('div')
					.attr('class','sja_menuoption')
					.text('Hide')
					.on('click',()=>{
						tk.legend_mclass.hiddenvalues.add(key)
						applychange()
					})

				tk.tip2.d.append('div')
					.attr('class','sja_menuoption')
					.text('Show only')
					.on('click',()=>{
						for(const c2 of classes.keys()) {
							tk.legend_mclass.hiddenvalues.add(c2)
						}
						tk.legend_mclass.hiddenvalues.delete(key)
						applychange()
					})

				if(tk.legend_mclass.hiddenvalues.size) {
					tk.tip2.d.append('div')
						.attr('class','sja_menuoption')
						.text('Show all')
						.on('click',()=>{
							tk.legend_mclass.hiddenvalues.clear()
							applychange()
						})
				}

				tk.tip2.d.append('div')
					.style('padding','10px')
					.style('font-size','.8em')
					.style('width','150px')
					.text(desc)
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

	// hidden
	for(const key of tk.legend_mclass.hiddenvalues) {
		tk.legend_mclass.holder.append('div')
			.style('display','inline-block')
			.attr('class','sja_clb')
			.style('text-decoration','line-through')
			.text( Number.isInteger(key) ? common.dt2label[key] : common.mclass[key].label )
			.on('click',()=>{
				tk.legend_mclass.hiddenvalues.delete( key )
				applychange()
			})
	}

	if(tk.vcfrangelimit) {
		// range too big for vcf, no vcf data
		tk.legend_mclass.holder.append('div')
			.style('display','inline-block')
			.text('Zoom in under '+common.bplen(tk.vcfrangelimit)+' to view SNV/indel data')
			.style('white-space','nowrap')
			.style('margin','10px')
	}

	const applychange = ()=>{
		tk.tip2.hide()
		loadTk(tk, block)
	}
}



function may_legend_attribute(tk, block) {
	if(tk.singlesample) {
		// multi-sample only
		return
	}

	// collects attributes that are selected to be hidden
	const hiddenAttributes=[]

	/*
	official-only, multi-sample
	filtering by mutation attribute is done on server
	*/
	for(const attrGrp of ['sampleAttribute','mutationAttribute']) {
		if(!tk[attrGrp]) continue

		// clear
		for(const key in tk[attrGrp].attributes) {
			const attr = tk[attrGrp].attributes[key]
			if(!attr.filter) continue;
			attr.value2count.clear()
		}

		// count
		if (attrGrp=='sampleAttribute') {
			for(const key in tk.sampleAttribute.attributes) {
				for(const sample in tk.sampleAttribute.samples) {
					count_sampleAttribute(key, tk.sampleAttribute.attributes[key], tk.sampleAttribute.samples[sample])
				}
			}
		} else {
			if(tk._data) {
				for(const g of tk._data) {
					for(const s of g.samples) {
						for(const i of s.items) {
							// won't count if i.mattr is undefined
							count_mutationAttribute(i.mattr, tk, i.dt )
						}
					}
				}
			}
			if(tk.data_vcf) {
				for(const m of tk.data_vcf) {
					if(m.dt==common.dtsnvindel) {
						if(!m.sampledata) continue
						for(const s of m.sampledata) {
							count_mutationAttribute(s, tk, m.dt )
						}
					} else {
						console.error('unknown dt: '+m.dt)
					}
				}
			}
		}

		// show legend
		for(const key in tk[attrGrp].attributes) {
			const attr = tk[attrGrp].attributes[ key ];
			if(!attr.filter) continue

			attr.legendcell
				.classed('sja_hideable_legend',true)
				.on('click',()=>{
					tk.tip2.hide()
					attr.hidden=1
					tk.legend_more_row.style('display','table-row');
					client.flyindi(attr.legendcell,tk.legend_more_label)
					attr.legendrow.transition().delay(500)
						.style('display','none')
					setTimeout(()=>{
						may_legend_attribute(tk,block)
					},500)
				})

			if(attr.hidden) {
				// this attribute is hidden
				attr.legendrow.style('display','none')
				hiddenAttributes.push(attr)
				continue
			}

			// this attribute is not hidden

			if(attr.value2count.size + attr.hiddenvalues.size == 0 ) {
				// no value after counting, no hidden value either: no data for this attribute
				attr.legendrow.style('display','none')
				continue
			}

			// this attribute is shown
			attr.legendrow.style('display','table-row')

			attr.legendholder.selectAll('*').remove()

			const lst = [ ...attr.value2count ]
			lst.sort( (i,j)=> j[1]-i[1] )

			for(const [valuestr, _o] of lst) {

				const printstr = attr.values[ valuestr ] ? attr.values[valuestr].name : valuestr

				const cell = attr.legendholder.append('div')
					.style('display','inline-block')
					.attr('class','sja_clb')
					.on('click',()=>{
						tk.tip2.showunder(cell.node())
							.clear()

						if(attr.hiddenvalues.has(valuestr)) {
							tk.tip2.d.append('div')
								.attr('class','sja_menuoption')
								.text('Show')
								.on('click',()=>{
									tk.tip2.hide()
									attr.hiddenvalues.delete( valuestr )
									loadTk(tk,block)
								})
						} else {
							tk.tip2.d.append('div')
								.attr('class','sja_menuoption')
								.text('Hide')
								.on('click',()=>{
									tk.tip2.hide()
									attr.hiddenvalues.add( valuestr )
									loadTk(tk,block)
								})
						}
						tk.tip2.d.append('div')
							.attr('class','sja_menuoption')
							.text('Show only')
							.on('click',()=>{
								tk.tip2.hide()
								for(const [vstr,c] of lst) {
									attr.hiddenvalues.add( vstr )
								}
								attr.hiddenvalues.delete( valuestr )
								loadTk(tk,block)
							})
						if(attr.hiddenvalues.size) {
							tk.tip2.d.append('div')
								.attr('class','sja_menuoption')
								.text('Show all')
								.on('click',()=>{
									tk.tip2.hide()
									attr.hiddenvalues.clear()
									loadTk(tk,block)
								})
						}

						// label for this value?
						if(attr.values[ valuestr ] && attr.values[valuestr].label) {
							tk.tip2.d.append('div')
								.text(attr.values[valuestr].label)
								.style('opacity',.5)
								.style('font-size','.7em')
								.style('margin','10px')
						}

						// show by-dt count
						if (_o.dt2count) {
							const lst2 = [ ..._o.dt2count ]
							lst2.sort( (i,j) => j[1]-i[1] )

							const table = tk.tip2.d.append('div')
								.style('margin', '5px')
								.style('font-size', '.7em')
								.style('opacity',.8)
								.style('border-spacing','4px')
							for(const [dt, count] of lst2) {
								const tr = table.append('tr')
								tr.append('td')
									.text( common.dt2label[ dt ])
								tr.append('td')
									.text( count )
							}
						}
					})

				const color = attrGrp=='sampleAttribute' && tk.legend_samplegroups && tk.legend_samplegroups.color(valuestr)
							? tk.legend_samplegroups.color(valuestr) : '#858585'

				cell.append('div')
					.style('display','inline-block')
					.attr('class','sja_mcdot')
					.style('background', color)
					.text( _o.totalitems )
				cell.append('span')
					.html('&nbsp;' + printstr )
			}

			if(attr.hiddenvalues.size) {
				// this attribute has hidden values, show with strike-through
				for(const valuestr of attr.hiddenvalues) {

					const printstr = (attr.values[ valuestr ] && attr.values[valuestr].name) ? attr.values[valuestr].name : valuestr

					attr.legendholder.append('div')
						.style('display','inline-block')
						.attr('class','sja_clb')
						.style('text-decoration','line-through')
						.text(printstr)
						.on('click',()=>{
							attr.hiddenvalues.delete( valuestr )
							loadTk( tk, block )
						})
				}
			}
		}
	}
	may_process_hideable_rows(tk,block,hiddenAttributes)
}


function may_process_hideable_rows(tk,block,hiddenAttributes) {
	// handle non-mutation attribute
	let numHiddenRows=0
	for(const hideable of tk.legend_hideable) {
		hideable.row.select('td')
			.classed('sja_hideable_legend',true)
			.on('click',()=>{
				tk.tip2.hide()
				hideable.hidden=1
				tk.legend_more_row.style('display','table-row');
				client.flyindi(hideable.row.select('td'),tk.legend_more_label)
				hideable.row.transition().delay(500)
					.style('display','none')
				setTimeout(()=>{
					may_legend_attribute(tk,block)
				},500)
			})

		hideable.row.style('display',hideable.hidden ? 'none' : 'table-row')
		if (hideable.hidden) {
			numHiddenRows++
		}
	}

	if (!hiddenAttributes.length && !numHiddenRows) {
		tk.legend_more_row.style('display','none')
	}
	else {
		tk.legend_more_row.style('display','table-row')
		tk.legend_more_label.selectAll('*').remove()
		
		const btn = tk.legend_more_label
			.attr('class','sja_legend_more_btn')
			.html('MORE...')
			.on('click',()=>{
				tk.tip2.showunder(btn.node()).clear()
				
				for(const hideable of tk.legend_hideable) {
					if (!hideable.hidden) continue
					const div = tk.tip2.d.append('div')
						.attr('class','sja_menuoption')
						.on('click',()=>{
							tk.tip2.hide()
							hideable.hidden=0
							may_legend_attribute(tk,block)
						})

					if(hideable.hidden && hideable.total_count) {					
						div.append('div')
							.style('display','inline-block')
							.attr('class','sja_mcdot')
							.style('background', '#858585')
							.text( hideable.total_count )
					}

					div.append('span')
						.html('&nbsp;' + hideable.row.node().firstChild.innerHTML )
				}

				for(const attr of hiddenAttributes) {
					if (!attr.hidden) continue
					const total = [...attr.value2count.values()].reduce((a,b)=>a+b.totalitems,0)
					const div = tk.tip2.d.append('div')
						.attr('class','sja_menuoption')
						.on('click',()=>{
							tk.tip2.hide()
							attr.hidden=0
							may_legend_attribute(tk,block)
						})

					div.append('div')
						.style('display','inline-block')
						.attr('class','sja_mcdot')
						.style('background', '#858585')
						.text( total )
					
					div.append('span')
						.html('&nbsp;' + attr.label )
				}
			})
	}
}


function count_sampleAttribute(key, attr, sample) {
	if (!(key in sample)) return

	if(!attr.filter) return // not a filter

	const value = sample[key]
	if(!attr.value2count.has( value )) {
		attr.value2count.set( value, {
			totalitems: 0
		})
	}
	attr.value2count.get( value ).totalitems++
	if (!attr.values) {
		attr.values = {}
	}
	if (!attr.values[value]) {
		attr.values[value]={
			name: value,
			label: value
		}
	}
}


function count_mutationAttribute(mattr, tk, itemdt ) {
	if(!mattr) {
		// the item does not have mattr, do not count
		return
	}
 
	for(const key in tk.mutationAttribute.attributes) {
		const attr = tk.mutationAttribute.attributes[key]
		if(!attr.filter) continue
 
		const value = mattr[ key ]

		if(value==undefined) {
			// not annotated, do not count
			continue
		}
 
		/*
		no longer acknowledge unannotated values
		if( value==undefined ) {
			// this item is not annotated, change its label to hardcoded
			value = common.not_annotated
		}
		*/

		// even if this value is not cataloged in attr.values{}, still record it for displaying
		if(!attr.value2count.has( value )) {
			attr.value2count.set( value, {
				totalitems: 0,
				dt2count: new Map()
			})
		}
		attr.value2count.get( value ).totalitems++

		if( !attr.value2count.get( value ).dt2count.has( itemdt ) ) {
			attr.value2count.get( value ).dt2count.set( itemdt, 0 )
		}

		attr.value2count.get( value ).dt2count.set( itemdt, attr.value2count.get( value ).dt2count.get( itemdt ) +1 )
	}
}
