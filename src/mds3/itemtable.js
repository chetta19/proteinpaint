import * as common from '../common'

/*
********************** EXPORTED
itemtable
mlst2samplesummary
********************** INTERNAL
table_snvindel
table_fusionsv

.occurrence must be set for each variant
all mlst of one data type
should work for all types of data

TODO
similar to vcf, variant annotation should be kept in .info{}, e.g. consequence
describe these attributes in tk.mds.variantInfo
print each info as table row/column

*/

/*
for a list of variants of *same type*, print details of both variant and samples
arg{}
.div
.mlst
.tk
.block
.tid2value{}
*/
export async function itemtable(arg) {
	if (arg.mlst[0].dt == common.dtsnvindel) {
		await table_snvindel(arg)
		return
	}
	if (arg.mlst[0].dt == common.dtfusionrna || arg.mlst[0].dt == common.dtsv) {
		await table_fusionsv(arg)
		return
	}
	throw 'itemtable unknown dt'
}

/*
using variant2samples
mlst can be mixture of data types, doesn't matter
if the total occurrence is 1, will print details for that sample
otherwise, will print summaries for each sample attribute from all samples
arg{}
.mlst
.tk
.block
.div
.tid2value
*/
export async function mlst2samplesummary(arg) {
	const table = arg.div.append('table') // 2 columns: 1. field name, 2. field content
	const [tdtemp1, tdtemp2, trtemp] = row_headervalue(table)
	tdtemp1.text('Loading...')
	try {
		if (arg.mlst.reduce((i, j) => i + j.occurrence, 0) == 1) {
			// one single sample, print details
			arg.querytype = arg.tk.mds.variant2samples.type_samples
			const data = await arg.tk.mds.variant2samples.get(arg)
			trtemp.remove()
			for (const termid of arg.tk.mds.variant2samples.termidlst) {
				const term = arg.tk.mds.termdb.getTermById(termid)
				if (!term) throw 'unknown term id: ' + termid
				const [td1, td2] = row_headervalue(table)
				td1.text(term.name)
				td2.text(data[0][termid])
			}
			return
		}
		// multiple samples
		arg.querytype = arg.tk.mds.variant2samples.type_summary
		const data = await arg.tk.mds.variant2samples.get(arg)
		trtemp.remove()
		for (const entry of data) {
			const [td1, td2] = row_headervalue(table)
			td1.text(entry.name)
			if (entry.numbycategory) {
				const t2 = td2.append('table')
				for (const [category, count] of entry.numbycategory) {
					const tr = t2.append('tr')
					tr.append('td')
						.text(count)
						.style('text-align', 'right')
						.style('padding-right', '10px')
					tr.append('td').text(category)
				}
			}
		}
	} catch (e) {
		tdtemp1.text(e.message || e)
		if (e.stack) console.log(e.stack)
	}
}

/*
rendering may be altered by tk.mds config
may use separate scripts to code different table styles
*/
async function table_snvindel(arg) {
	arg.table = arg.div.append('table')
	if (arg.mlst.length == 1) {
		// single variant, use two-column table to show key:value pairs
		arg.m = arg.mlst[0]
		table_snvindel_onevariant(arg)
	} else {
		// make a multi-column table for all variants, one row for each variant
		table_snvindel_multivariant(arg)
	}
	if (arg.tk.mds.variant2samples) {
		// to show sample info (occurrence=1) or summary (occurrence>1)
		const heading = arg.div
			.append('div')
			.style('margin-top', '20px')
			.style('opacity', 0.4)
			.style('font-size', '1.2em')
		{
			const c = arg.mlst.reduce((i, j) => i + j.occurrence, 0)
			heading.text(c == 1 ? 'Information about this case' : 'Summary of ' + c + ' cases')
		}
		await mlst2samplesummary(arg)
	}
}

function table_snvindel_onevariant({ m, tk, block, table }) {
	{
		const [td1, td2] = row_headervalue(table)
		td1.text('Consequence')
		add_csqButton(m, tk, td2, table)
	}
	{
		const [td1, td2] = row_headervalue(table)
		td1.text('Mutation')
		print_snv(td2, m, tk)
	}
	{
		const [td1, td2] = row_headervalue(table)
		td1.text('Occurrence')
		td2.text(m.occurrence)
	}
}

function add_csqButton(m, tk, td, table) {
	// m:
	// tk:
	// td: the <td> to show current csq label
	// table: 2-col
	if (tk.mds.queries.snvindel.m2csq && m.csqcount > 1) {
		const a = td.append('a')
		a.html(m.mname + ' <span style="font-size:.8em">' + common.mclass[m.class].label.toUpperCase() + '</span> &#9660;')
		// click link to query for csq list
		const tr = table.append('tr').style('display', 'none')
		const td2 = tr.append('td').attr('colspan', 2) // to show result of additional csq
		let first = true
		a.on('click', async () => {
			if (tr.style('display') == 'none') {
				tr.style('display', 'table-row')
				a.html(
					m.mname + ' <span style="font-size:.8em">' + common.mclass[m.class].label.toUpperCase() + '</span> &#9650;'
				)
			} else {
				tr.style('display', 'none')
				a.html(
					m.mname + ' <span style="font-size:.8em">' + common.mclass[m.class].label.toUpperCase() + '</span> &#9660;'
				)
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
		td.append('span').text(m.mname)
		td.append('span')
			.style('margin-left', '10px')
			.style('color', common.mclass[m.class].color)
			.style('font-size', '.8em')
			.text(common.mclass[m.class].label.toUpperCase())
	}
}

function print_snv(holder, m, tk) {
	let printto = holder
	if (tk.mds.queries.snvindel.url && tk.mds.queries.snvindel.url.key in m) {
		const a = holder.append('a')
		a.attr('href', tk.mds.queries.snvindel.url.base + m[tk.mds.queries.snvindel.url.key])
		a.attr('target', '_blank')
		printto = a
	}
	printto.html(
		m.chr +
			':' +
			(m.pos + 1) +
			' <span style="font-size:.7em;opacity:.5">REF</span> ' +
			m.ref +
			' <span style="font-size:.7em;opacity:.5">ALT</span> ' +
			m.alt
	)
}

/* multiple variants, each with occurrence
one row for each variant
click a button from a row to show the sample summary/detail table for that variant
show a summary table across samples of all variants
*/
function table_snvindel_multivariant({ mlst, tk, block, table }) {
	const columnnum = 2 // get number of columns, dependent on tk.mds setting
	// header row
	const tr = table.append('tr')
	tr.append('td')
		.text('Mutation')
		.style('opacity', 0.5)
		.style('padding-right', '10px')
	tr.append('td')
		.text('Occurrence')
		.style('opacity', 0.5)
	// one row for each variant
	for (const m of mlst) {
		const tr = table.append('tr')
		const td1 = tr.append('td').style('padding-right', '10px')
		add_csqButton(m, tk, td1.append('span').style('margin-right', '10px'), table)
		print_snv(td1, m, tk)
		const td2 = tr.append('td')
		if (tk.mds.variant2samples) {
			let first = true
			td2
				.html(m.occurrence + '\t&#9660;')
				.style('text-align', 'right')
				.attr('class', 'sja_clbtext')
				.on('click', async () => {
					if (tr2.style('display') == 'none') {
						tr2.style('display', 'table-row')
						td2.html(m.occurrence + '\t&#9650;')
					} else {
						tr2.style('display', 'none')
						td2.html(m.occurrence + '\t&#9660;')
					}
					if (!first) return
					// load sample info
					first = false
					await mlst2samplesummary(
						[m],
						tk,
						block,
						tr2
							.append('td')
							.attr('colspan', columnnum)
							.append('table')
							.style('border', 'solid 1px #ccc')
							.style('margin-left', '20px')
					)
				})
			// hidden row to show sample details of this variant
			const tr2 = table.append('tr').style('display', 'none')
		} else {
			td2.text(m.occurrence)
		}
	}
}

async function table_fusionsv(arg) {
	/*
	table view, with svgraph for first ml
	svgraph(mlst[0])

	if(mlst.length==1) {
		// 2-column table view
	} else {
		// one row per sv, click each row to show its svgraph
	}
	*/
	if (arg.tk.mds.variant2samples) {
		// show sample summary
		await mlst2samplesummary(arg)
	}
}

// may move to client.js
function row_headervalue(table) {
	const tr = table.append('tr')
	return [
		tr
			.append('td')
			.style('color', '#bbb')
			.style('border-bottom', 'solid 1px #ededed')
			.style('padding', '5px 20px 5px 0px'),
		tr.append('td').style('border-bottom', 'solid 1px #ededed'),
		tr
	]
}
