import { fillbar } from '#dom/fillbar'
import { get_list_cells } from '#dom/gridutils'
import { mclass, dtsnvindel, dtsv, dtfusionrna } from '#shared/common'
import { renderTable } from '#dom/table'

/*
********************** EXPORTED
init_sampletable()
	using mds.variant2samples.get() to map mlst[] to samples
	always return list of samples, does not return summaries
	mlst can be mixture of data types, doesn't matter
displaySampleTable()
	call this function to render one or multiple samples
	calls make_singleSampleTable() or renderTable()

********************** INTERNAL
make_singleSampleTable
samples2columnsRows


********************** arg{}
.mlst[]
	used for v2s.get() query
.tk
	.mds.variant2samples.twLst[]
.block
.div
.tid2value={}
 	sample filters by e.g. clicking on a sunburst ring, for tk.mds.variant2samples.get
.singleSampleDiv
	optional, if just one single sample, can show into this table rather than creating a new one
*/

const cutoff_tableview = 10

export async function init_sampletable(arg) {
	//run variant2samples.get() to map variants to samples
	const wait = arg.div
		.append('div')
		.text('Loading...')
		.style('padding', '10px')
		.style('color', '#8AB1D4')
		.style('font-size', '1.25em')
		.style('font-weight', 'bold')

	// may not be used!
	//terms from sunburst ring
	// Note: in ordered to keep term-values related to sunburst immuatable, these term names are
	// stored as 'tid2value_orig' and not removed from tid2Value when filter changed or removed
	arg.tid2value_orig = new Set()
	if (arg.tid2value) Object.keys(arg.tid2value).forEach(arg.tid2value_orig.add, arg.tid2value_orig)

	try {
		arg.querytype = arg.tk.mds.variant2samples.type_samples
		const samples = await arg.tk.mds.variant2samples.get(arg) // returns list of samples
		await displaySampleTable(samples, arg)
		wait.remove()
	} catch (e) {
		wait.text('Error: ' + (e.message || e))
		if (e.stack) console.log(e.stack)
	}
}

export async function displaySampleTable(samples, args) {
	if (samples.length == 1) {
		return await make_singleSampleTable(samples[0], args)
	}
	const [columns, rows] = await samples2columnsRows(samples, args.tk)
	const params = { rows, columns, div: args.div }
	if (args.max_width) params.max_width = args.max_width
	if (args.max_height) params.max_height = args.max_height
	return renderTable(params)
}

async function make_singleSampleTable(sampledata, arg) {
	const grid_div =
		arg.singleSampleDiv ||
		arg.div
			.append('div')
			.style('display', 'inline-grid')
			.style('grid-template-columns', 'auto auto')
			.style('gap-row-gap', '1px')
			.style('align-items', 'center')
			.style('justify-items', 'left')
			.style('padding', '10px')
			.style('width', '100%')

	if (sampledata.sample_id) {
		// sample_id is hardcoded
		const [cell1, cell2] = get_list_cells(grid_div)
		cell1.text('Sample')
		printSampleName(sampledata, arg.tk, cell2)
	}

	/////////////
	// hardcoded logic to represent if this case is open or controlled-access
	if ('caseIsOpenAccess' in sampledata) {
		const [cell1, cell2] = get_list_cells(grid_div)
		cell1.text('Access')
		cell2.text(sampledata.caseIsOpenAccess ? 'Open' : 'Controlled')
	}

	if (arg.tk.mds.variant2samples.twLst) {
		for (const tw of arg.tk.mds.variant2samples.twLst) {
			const [cell1, cell2] = get_list_cells(grid_div)
			cell1.text(tw.term.name).style('text-overflow', 'ellipsis')
			cell2.style('text-overflow', 'ellipsis')
			if (tw.id in sampledata) {
				if (Array.isArray(sampledata[tw.id])) {
					cell2.html(sampledata[tw.id].join('<br>'))
				} else {
					cell2.text(sampledata[tw.id])
				}
			}
		}
	}

	/////////////
	// hardcoded logic to represent read depth using gdc data
	// allelic read depth only applies to ssm, not to other types of mutations

	if (sampledata.ssm_id_lst) {
		/* ssm_id_lst is array of ssm ids
		it's attached to this sample when samples are queried from the #cases leftlabel
		create a new row in the table and list all ssm items
		in such case there can still be sampledata.ssm_read_depth,
		but since there can be multiple items from ssm_id_lst[] so do not display read depth
		*/
		const [cell1, cell2] = get_list_cells(grid_div)
		cell1.text('Mutations')
		for (const ssm_id of sampledata.ssm_id_lst) {
			const d = cell2.append('div')
			const m = (arg.tk.skewer.rawmlst || arg.tk.custom_variants).find(i => i.ssm_id == ssm_id)
			if (m) {
				// found
				if (arg.tk.mds.queries && arg.tk.mds.queries.snvindel && arg.tk.mds.queries.snvindel.url) {
					d.append('a')
						.text(m.mname)
						.attr('target', '_blank')
						.attr('href', arg.tk.mds.queries.snvindel.url.base + ssm_id)
				} else {
					d.append('span').text(m.mname)
				}
				// class
				d.append('span')
					.style('margin-left', '10px')
					.style('color', mclass[m.class].color)
					.style('font-size', '.7em')
					.text(mclass[m.class].label)
			} else {
				// not found by ssm id
				d.text(ssm_id)
			}
		}
	} else if (sampledata.ssm_read_depth) {
		// to support other configurations of ssm read depth
		const sm = sampledata.ssm_read_depth
		const [cell1, cell2] = get_list_cells(grid_div)
		cell1
			.style('height', '35px')
			.text('Tumor DNA MAF')
			.style('text-overflow', 'ellipsis')
		cell2.style('height', '35px')
		fillbar(cell2, { f: sm.altTumor / sm.totalTumor })
		cell2
			.append('span')
			.text(sm.altTumor + ' / ' + sm.totalTumor)
			.style('margin', '0px 10px')
		cell2
			.append('span')
			.text('ALT / TOTAL IN TUMOR')
			.style('font-size', '.7em')
			.style('opacity', 0.5)
		const d = cell2.append('div') // next row to show normal total
		d.append('span')
			.text(sm.totalNormal || 'N/A')
			.style('margin-right', '10px')
			.style('text-overflow', 'ellipsis')
		d.append('span')
			.text('TOTAL DEPTH IN NORMAL')
			.style('font-size', '.7em')
			.style('opacity', 0.5)
			.style('text-overflow', 'ellipsis')
	}

	/* quick fix for accessing details of a single case
	if (arg.tk.mds.termdb && arg.tk.mds.termdb.allowCaseDetails) {
		// has one single case
		arg.div.append('div').text('Case details')
	}
	*/
}

function printSampleName(sample, tk, div) {
	// print sample name in a div, if applicable, generate a hyper link using the sample name
	if (tk.mds.variant2samples.url) {
		const a = div.append('a')
		a.attr(
			'href',
			tk.mds.variant2samples.url.base +
				(tk.mds.variant2samples.url.namekey ? sample[tk.mds.variant2samples.url.namekey] : sample.sample_id)
		)
		a.attr('target', '_blank')
		a.text(sample.sample_id)
		a.style('word-break', 'break-word')
	} else {
		div.text(sample.sample_id)
	}
}

/***********************************************
converts list of samples into inputs for renderTable()
*/
async function samples2columnsRows(samples, tk) {
	// detect if these columns appear in the samples
	const has_caseAccess = samples.some(i => 'caseIsOpenAccess' in i),
		has_ssm_read_depth = samples.some(i => i.ssm_read_depth),
		has_totalNormal = samples.some(i => i?.ssm_read_depth?.totalNormal),
		has_ssm = samples.some(i => i.ssm_id) || samples.some(i => i.ssm_id_lst)

	const columns = [{ label: 'Sample' }],
		rows = []

	if (has_caseAccess) {
		columns.push({ label: 'Access' })
	}

	if (tk.mds.variant2samples.twLst) {
		for (const tw of tk.mds.variant2samples.twLst) {
			columns.push({ label: tw.term.name })
		}
	}

	if (has_ssm_read_depth) {
		columns.push({ label: 'Tumor DNA MAF' })
	}
	if (has_totalNormal) {
		columns.push({ label: 'Normal depth' })
	}

	if (has_ssm) {
		columns.push({ label: 'Mutations', isSsm: true })
	}

	// done making columns[]

	for (const sample of samples) {
		const row = [{ value: sample.sample_id }]

		if (tk.mds.variant2samples.url) {
			row[0].url = tk.mds.variant2samples.url.base + sample[tk.mds.variant2samples.url.namekey]
		}

		if (has_caseAccess) {
			row.push({ value: sample.caseIsOpenAccess ? 'Open' : 'Controlled' })
		}

		if (tk.mds.variant2samples.twLst) {
			for (const tw of tk.mds.variant2samples.twLst) {
				row.push({ value: sample[tw.id] })
			}
		}

		if (has_ssm_read_depth) {
			const cell = {}
			const sm = sample.ssm_read_depth
			if (sm) {
				cell.html =
					fillbar(null, { f: sm.altTumor / sm.totalTumor }) + '<br/>' + sm.altTumor + '/' + sm.totalTumor + '</span>'
			}
			row.push(cell)
		}

		if (has_totalNormal) {
			row.push({ value: sample?.ssm_read_depth.totalNormal || '' })
		}

		if (has_ssm) {
			const ssmCell = { values: [] }

			let ssm_id_lst = sample.ssm_id_lst
			if (sample.ssm_id) ssm_id_lst = [sample.ssm_id]

			if (ssm_id_lst) {
				for (const ssm_id of ssm_id_lst) {
					const m = (tk.skewer.rawmlst || tk.custom_variants).find(i => i.ssm_id == ssm_id)
					const ssm = {}
					if (m) {
						// found m data point
						if (m.dt == dtsnvindel) {
							ssm.value = m.mname
							if (tk.mds.queries && tk.mds.queries.snvindel && tk.mds.queries.snvindel.url) {
								ssm.html = `<a href=${tk.mds.queries.snvindel.url.base + m.ssm_id} target=_blank>${m.mname}</a>`
							} else {
								ssm.html = m.mname
							}
						} else if (m.dt == dtsv || m.dt == dtfusionrna) {
							const p = m.pairlst[0]
							ssm.html = `${p.a.name || ''} ${p.a.chr}:${p.a.pos} ${p.a.strand == '+' ? 'forward' : 'reverse'} > ${p.b
								.name || ''} ${p.b.chr}:${p.b.pos} ${p.b.strand == '+' ? 'forward' : 'reverse'}`
						} else {
							throw 'unknown dt'
						}
						ssm.html += ` <span style="color:${mclass[m.class].color};font-size:.7em">${mclass[m.class].label}</span>`
					} else {
						// m datapoint not found on client
						ssm.value = ssm_id
					}
					ssmCell.values.push(ssm)
				}
			}

			row.push(ssmCell)
		}

		rows.push(row)
	}
	return [columns, rows]
}
