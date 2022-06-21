import { mclass, dtsnvindel, dtfusionrna, dtsv } from '../../shared/common'
import { init_sampletable } from './sampletable'
import { get_list_cells } from '../../dom/gridutils'
import { event as d3event } from 'd3-selection'
import { appear } from '../../dom/animation'
import { dofetch3 } from '../../common/dofetch'

/*
********************** EXPORTED
itemtable

for a list of variants of *same type*, print details of both variant and samples
arg{}
.div
.mlst
.tk
.block
.disable_variant2samples:true
	set to true to not to issue variant2samples query for variants

********************** INTERNAL
table_snvindel_svfusion
	table_snvindel_onevariant
add_csqButton
print_snv


.occurrence must be set for each variant
all mlst of one data type
should work for all types of data

TODO
print vcf info about variant attributes

*/

const cutoff_tableview = 10

export async function itemtable(arg) {
	const dt = arg.mlst[0].dt
	if (dt == dtsnvindel || dt==dtfusionrna || dt==dtsv) {
		await table_snvindel_svfusion(arg)
		if (!isElementInViewport(arg.div)) {
			// If div renders outside of viewport, shift left
			const leftpos = determineLeftCoordinate(arg.div)
			appear(arg.div)
			arg.div.style('left', leftpos + 'vw').style('max-width', '90vw')
		}
		return
	}
	throw 'itemtable unknown dt'
}

function determineLeftCoordinate(div) {
	const coords = div.node().getBoundingClientRect()
	// Reset left position to 100% - (arg.div.width % + 3%)
	let leftpos
	if (coords.width / (document.documentElement.clientWidth || window.innerWidth) > 0.4) {
		leftpos = 3
	} else {
		leftpos = 100 - ((coords.width / (document.documentElement.clientWidth || window.innerWidth)) * 100 + 3)
	}
	return leftpos
}

/*
rendering may be altered by tk.mds config
may use separate scripts to code different table styles
*/
async function table_snvindel_svfusion(arg) {
	const grid = arg.div
		.append('div')
		.style('display', 'inline-grid')
		.style('overflow-y', 'scroll')

	const isSnvindel = arg.mlst[0].dt==dtsnvindel

	if (arg.mlst.length == 1) {
		// single variant, use two-column table to show key:value pairs
		grid
			.style('grid-template-columns', 'auto auto')
			.style('max-height', '40vw')
			// in case creating a new table for multiple samples of this variant,
			// add space between grid and the new table
			.style('margin-bottom', '10px')

		if(isSnvindel) {
			table_snvindel_onevariant(arg, grid)
		} else {
			await table_svfusion_one(arg, grid)
		}

		// if the variant has only one sample,
		// allow to append new rows to grid to show sample key:value
		arg.singleSampleDiv = grid
		// if there are multiple samples, this <div> won't be used
		// a new table will be created under arg.div to show sample table

		if (!arg.disable_variant2samples && arg.tk.mds.variant2samples) {
			await init_sampletable(arg)
		}
		return
	}

	// multiple variants
	// show an option for each, click one to run above single-variant code
	grid.append('div')
		.style('grid-template-columns', 'auto')
		.text('Click a variant to see details')
		.style('font-size','.7em')
		.style('opacity',.5)

	for(const m of arg.mlst) {
		const div = grid.append('div')
			.attr('class','sja_menuoption')
			.on('click', ()=>{
				grid.remove()
				const a2 = Object.assign({}, arg)
				a2.mlst = [m]
				table_snvindel_svfusion(a2)
			})
		if(m.dt==dtsnvindel) {
			div.append('span')
				.text(m.mname)
			div.append('span')
				.text(mclass[m.class].label)
				.style('font-size','.8em')
				.style('margin-left','10px')
			div.append('span')
				.text((m.pos+1)+', '+m.ref+'>'+m.alt)
				.style('font-size','.8em')
				.style('margin-left','10px')
			if(m.occurrence) {
				div.append('span').text(m.occurrence+' sample'+(m.occurrence>1?'s':'')).style('margin-left','10px')
			}
		} else if(m.dt==dtsv ||m.dt==dtfusionrna) {
			div.append('span')
				.text(mclass[m.class].label)
				.style('font-size','.7em')
				.style('margin-right','8px')

			printSvPair(m.pairlst[0], div)
			if(m.occurrence) {
				div.append('span').text(m.occurrence+' sample'+(m.occurrence>1?'s':'')).style('margin-left','10px')
			}
		} else {
			div.text('error: unknown m.dt')
		}
	}

	if (!arg.disable_variant2samples && arg.tk.mds.variant2samples) {
		const totalOccurrence = arg.mlst.reduce((i,j)=>i+(j.occurrence || 0),0)
		if(totalOccurrence) {
			grid.append('div')
				.style('margin-top','10px')
				.attr('class','sja_clbtext')
				.text('List all '+totalOccurrence+' samples')
				.on('click',()=>{
					grid.remove()
					init_sampletable(arg)
				})
		}
	}

/*
	{
	// old code
		// make a multi-column table for all variants, one row for each variant
		// set of columns are based on available attributes in mlst
		grid.style('max-height', '30vw').style('gap', '5px')
		// create placeholder for inserting samples for each variant
		if(isSnvindel) {
			arg.multiSampleTable = table_snvindel_multivariant(arg, grid)
		} else {
			arg.multiSampleTable = await table_svfusion_multi(arg, grid)
		}
		arg.grid = grid
	}
	*/
}

function table_snvindel_onevariant({ mlst, tk, block }, grid) {
	const m = mlst[0]
	{
		const [td1, td2] = get_list_cells(grid)
		td1.text(block.mclassOverride ? block.mclassOverride.className : 'Consequence')
		print_mname(td2, m)
		//add_csqButton(m, tk, td2, table)
	}
	{
		const [td1, td2] = get_list_cells(grid)
		// do not pretend m is mutation if ref/alt is missing
		td1.text(m.ref && m.alt ? 'Mutation' : 'Position')
		print_snv(td2, m, tk)
	}
	if ('occurrence' in m) {
		const [td1, td2] = get_list_cells(grid)
		td1.text('Occurrence')
		td2.text(m.occurrence)
	}
	const currentMode = tk.skewer.viewModes.find(i => i.inuse)
	if (currentMode.type == 'numeric' && currentMode.byAttribute != 'occurrence') {
		// show a numeric value that is not occurrence
		const [td1, td2] = get_list_cells(grid)
		td1.text(currentMode.label)
		td2.text(m.__value_missing ? 'NA' : m.__value_use)
	}
}

function print_mname(div, m) {
	div.append('span').text(m.mname)
	div
		.append('span')
		.style('margin-left', '5px')
		.style('color', mclass[m.class].color)
		.style('font-size', '.8em')
		.text(mclass[m.class].label.toUpperCase())
}

function print_snv(holder, m, tk) {
	let printto = holder
	if (tk.mds.queries && tk.mds.queries.snvindel.url && tk.mds.queries.snvindel.url.key in m) {
		const a = holder.append('a')
		a.attr('href', tk.mds.queries.snvindel.url.base + m[tk.mds.queries.snvindel.url.key])
		a.attr('target', '_blank')
		printto = a
	}
	printto.html(`${m.chr}:${m.pos + 1} ${m.ref && m.alt ? m.ref + '>' + m.alt : ''}`)
}



// function is not used
function add_csqButton(m, tk, td, table) {
	// m:
	// tk:
	// td: the <td> to show current csq label
	// table: 2-col
	if (tk.mds.queries && tk.mds.queries.snvindel.m2csq && m.csqcount > 1) {
		const a = td.append('a')
		a.html(m.mname + ' <span style="font-size:.8em">' + mclass[m.class].label.toUpperCase() + '</span> &#9660;')
		// click link to query for csq list
		const tr = table.append('tr').style('display', 'none')
		const td2 = tr.append('td').attr('colspan', 2) // to show result of additional csq
		let first = true
		a.on('click', async () => {
			if (tr.style('display') == 'none') {
				tr.style('display', 'table-row')
				a.html(m.mname + ' <span style="font-size:.8em">' + mclass[m.class].label.toUpperCase() + '</span> &#9650;')
			} else {
				tr.style('display', 'none')
				a.html(m.mname + ' <span style="font-size:.8em">' + mclass[m.class].label.toUpperCase() + '</span> &#9660;')
			}
			if (!first) return
			first = false
			const wait = td2.append('div').text('Loading...')
			try {
				const data = await tk.mds.queries.snvindel.m2csq.get(m)
				if (data.error) throw data.error
				wait.remove()
				const table = td2.append('table').style('margin-bottom', '10px')
				const tr = table
					.append('tr')
					.style('font-size', '.7em')
					.style('opacity', 0.5)
				tr.append('td').text('AA change')
				tr.append('td').text('Isoform')
				tr.append('td').text('Consequence')
				for (const d of data.csq) {
					const tr = table.append('tr')
					tr.append('td').text(d.aa_change)
					tr.append('td').text(d.transcript_id)
					tr.append('td').text(d.consequence_type)
				}
			} catch (e) {
				wait.text(e.message || e)
			}
		})
	} else {
		// no showing additional csq
		print_mname(td, m)
	}
}

function isElementInViewport(el) {
	const rect = el.node().getBoundingClientRect()
	return (
		// Fix for div appearing still appearing within viewport but without a border,
		// causing content to render bunched.
		rect.top >= 5 &&
		rect.left >= 5 &&
		rect.bottom < (document.documentElement.clientHeight || window.innerHeight) - 5 &&
		rect.right < (document.documentElement.clientWidth || window.innerWidth) - 5
	)
}

async function table_svfusion_one(arg,grid) {
	// display one svfusion event

	// svgraph in 1st row
	grid.append('div')
	await makeSvgraph( arg.mlst[0], grid.append('div').style('margin-bottom','10px'), arg.block)

	// rows
	{
		const [c1, c2] = get_list_cells(grid)
		c1.text('Data type')
		c2.text(mclass[arg.mlst[0].class].label)
	}
	{
		// todo: support chimeric read fraction on each break end
		const [c1, c2] = get_list_cells(grid)
		c1.text('Break points')
		for(const pair of arg.mlst[0].pairlst) {
			printSvPair(pair, c2.append('div'))
		}
	}
}

function printSvPair(pair, div) {
	if(pair.a.name) div.append('span').text(pair.a.name).style('font-weight','bold').style('margin-right','5px')
	div.append('span').text(`${pair.a.chr}:${pair.a.pos} ${pair.a.strand=='+'?'forward':'reverse'} > ${pair.b.chr}:${pair.b.pos} ${pair.b.strand=='+'?'forward':'reverse'}`)
	if(pair.b.name) div.append('span').text(pair.b.name).style('font-weight','bold').style('margin-left','5px')
}

async function makeSvgraph(m, div, block) {
	const wait = div.append('div').text('Loading...')
	try {
		if(!m.pairlst) throw '.pairlst[] missing'
		const svpair = {
			a: {
				chr: m.pairlst[0].a.chr,
				position: m.pairlst[0].a.pos,
				strand: m.pairlst[0].a.strand,
			},
			b: {
				chr: m.pairlst[0].b.chr,
				position: m.pairlst[0].b.pos,
				strand: m.pairlst[0].b.strand,
			}
		}


		await getGm(svpair.a, block)
		await getGm(svpair.b, block)

		wait.remove()

		const _ = await import('../svgraph')
		_.default( {
			pairlst: [svpair],
			genome: block.genome,
			holder: div
		})
	}catch(e) {
		wait.text( e.message ||e)
	}
}
async function getGm(p, block) {
	// p={chr, position}
	const d = await dofetch3(`isoformbycoord?genome=${block.genome.name}&chr=${p.chr}&pos=${p.position}`)
	if(d.error) throw d.error
	const u = d.lst.find(i => i.isdefault) || d.lst[0]
	if (u) {
		p.name = u.name
		p.gm = { isoform: u.isoform }
	}
}
