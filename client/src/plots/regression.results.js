import { getNormalRoot } from '../common/filter'
import { sayerror } from '../dom/error'
import { scaleLinear, scaleLog } from 'd3-scale'
import { axisBottom } from 'd3-axis'
import { axisstyle } from '../dom/axisstyle'
import { get_one_genome, first_genetrack_tolist } from '../client'

/*************
can dynamically add following attributes

- this.snplocusBlock:
	for snplocus term
	display in this.dom.snplocusBlockDiv
- this.hasUnsubmittedEdits_nullify_singleuse:
	to negate hasUnsubmittedEdits and keep running analysis
*/

const refGrp_NA = 'NA' // refGrp value is not applicable, hardcoded for R
const forestcolor = '#126e08'

export class RegressionResults {
	constructor(opts) {
		this.opts = opts
		this.app = opts.app
		// reference to the parent component's mutable instance (not its API)
		this.parent = opts.parent
		this.type = 'regression'
		setInteractivity(this)
		setRenderers(this)

		const holder = this.opts.holder
		holder
			.append('div')
			.style('margin-top', '30px')
			.style('font-size', '1.2em')
			.style('opacity', 0.3)
			.html('Results')

		this.dom = {
			holder,
			err_div: holder.append('div'),
			snplocusBlockDiv: holder.append('div').style('margin-left', '20px'),
			// is where newDiv() and displayResult_oneset() writes to
			oneSetResultDiv: holder.append('div').style('margin', '10px')
		}
	}

	async main() {
		try {
			this.parent.inputs.dom.submitBtn.text('Running...')
			// share the writable config copy
			this.config = this.parent.config
			this.state = this.parent.state
			if (
				!this.state.formIsComplete ||
				this.parent.inputs.hasError ||
				(this.config.hasUnsubmittedEdits && !this.hasUnsubmittedEdits_nullify_singleuse)
			) {
				// no result to show
				this.dom.holder.style('display', 'none')
				return
			}
			delete this.hasUnsubmittedEdits_nullify_singleuse // single-use, delete
			// submit server request to run analysis
			const reqOpts = this.getDataRequestOpts()
			const data = await this.app.vocabApi.getRegressionData(reqOpts)
			if (data.error) throw data.error
			this.dom.err_div.style('display', 'none')
			this.dom.oneSetResultDiv.selectAll('*').remove()
			this.dom.holder.style('display', 'block')
			await this.displayResult(data)
		} catch (e) {
			this.hasError = true
			this.dom.holder.style('display', 'block')
			this.dom.err_div.style('display', 'block')
			sayerror(this.dom.err_div, 'Error: ' + (e.error || e))
			this.parent.inputs.dom.submitBtn.property('disabled', true)
			console.error(e)
		}
	}

	// creates an opts object for the vocabApi.getRegressionData()
	getDataRequestOpts() {
		const c = this.config
		const opts = {
			regressionType: c.regressionType,
			outcome: c.outcome,
			independent: c.independent,
			filter: this.state.termfilter.filter
		}
		return opts
	}

	getIndependentInput(tid) {
		/* arg is independent term id
		return input instance
		*/
		for (const i of this.parent.inputs.independent.inputs) {
			if (!i.term) continue
			if (i.term.id == tid) return i
			if (i.term.term && i.term.term.snps) {
				for (const s of i.term.term.snps) {
					if (s.snpid == tid) {
						/* tid matches with a snpid
						FIXME returns blank object! 
						the purpose has been to access orderedLabels
						but this is only set on Input instance, but not on tw
						may assign it to Input.term instead so
						no need for getIndependentInput but just getIndependentTerm
						and avoid returning this ridiculous blank object
						*/
						return {}
					}
				}
			}
		}
		throw 'cannot find Input for a tid: ' + tid
	}
	getIndependentTerm(tid) {
		/*
		arg is independent term id; return term wrapper 

		in order to reliably access tw.refGrp,
		must use termwrapper from this.config but not this.state.config
		due to a specific condition when refGrp is set in self.config, but is missing from state
		when launching from a parameterized url that's missing refgrp for the term
		and the refGrp is dynamically filled by input.updateTerm() but not propagated to state
		*/
		const tw = this.config.independent.find(t => t.id == tid)
		if (tw) return tw
		// not found by tid; check for snps in snplst
		for (const t of this.config.independent) {
			if (t.term.snps) {
				const snp = t.term.snps.find(i => i.snpid == tid)
				if (snp) {
					// tid is a snpid
					// this input is one of the snps from this snplst term
					// {snpid, effectAllele, alleles[], .. }
					// return something looking like a termwrapper and represents this snp
					const tw = {
						id: tid,
						q: {},
						term: {
							id: tid,
							name: snp.mname || tid
						},
						effectAllele: t.q.snp2effAle[tid]
					}
					if (t.q.snp2refGrp) {
						tw.refGrp = t.q.snp2refGrp[tid]
					}
					return tw
				}
			}
		}
		throw 'unknown independent term'
	}
}

function setInteractivity(self) {}

function setRenderers(self) {
	self.displayResult = async result => {
		/* result{
			lst:[ 
				{ data: { err, splinePlots, residuals, ... }, id:'snp1' },
				{ data: { err, splinePlots, residuals, ... }, id:'snp2' },
				...
			]
		}
		*/
		if (self.config.independent.find(i => i.term.type == 'snplocus')) {
			// has a snploucs term: create genome browser to display that locus
			// in result.lst[], there's one set of result for each variant, identified by id
			// clicking on a dot in browser tk will call displayResult_oneset() to display its results
			await self.show_genomebrowser_snplocus(result)
			return
		}
		// no snplocus, clear things if previous analysis had it
		delete self.snplocusBlock
		self.dom.snplocusBlockDiv.selectAll('*').remove()
		// result.lst[] has only one set of result, from analyzing one model
		if (!result.lst[0] || !result.lst[0].data) throw 'result is not {lst:[ {data:{}} ]}'
		// quick fix; backend should reassign result.err to a specific set
		result.lst[0].data.err = result.err
		self.displayResult_oneset(result.lst[0].data)
	}

	self.displayResult_oneset = result => {
		self.dom.oneSetResultDiv.selectAll('*').remove()
		self.mayshow_err(result)
		self.newDiv('Sample size: ' + result.sampleSize)
		self.mayshow_splinePlots(result)
		self.mayshow_residuals(result)
		self.mayshow_coefficients(result)
		self.mayshow_type3(result)
		self.mayshow_other(result)
	}

	self.newDiv = label => {
		// create div to show a section of the result
		const div = self.dom.oneSetResultDiv.append('div').style('margin', '20px 0px 10px 0px')
		div
			.append('div')
			.style('text-decoration', 'underline')
			.text(label)
		return div.append('div').style('margin-left', '20px')
	}

	self.mayshow_err = result => {
		if (!result.err) return
		const div = self.newDiv('Errors/warnings')
		for (const line of result.err) {
			div
				.append('p')
				.style('margin', '5px')
				.text(line)
		}
	}

	self.mayshow_splinePlots = result => {
		if (!result.splinePlots) return
		const div = self.newDiv('Cubic spline plots')
		for (const plot of result.splinePlots) {
			div
				.append('img')
				.attr('src', plot.src)
				.style('width', plot.size.width)
				.style('height', plot.size.height)
		}
	}

	self.mayshow_residuals = result => {
		if (!result.residuals) return
		const div = self.newDiv(result.residuals.label)
		const table = div.append('table').style('border-spacing', '8px')
		const tr1 = table.append('tr').style('opacity', 0.4)
		const tr2 = table.append('tr')
		for (let i = 0; i < result.residuals.header.length; i++) {
			tr1.append('td').text(result.residuals.header[i])
			tr2.append('td').text(result.residuals.rows[i])
		}
	}

	self.mayshow_coefficients = result => {
		if (!result.coefficients) return
		const div = self.newDiv(result.coefficients.label)
		const table = div.append('table').style('border-spacing', '0px')

		// padding is set on every <td>. need a better solution

		// header row
		{
			const tr = table.append('tr').style('opacity', 0.4)
			result.coefficients.header.forEach((v, i) => {
				tr.append('td')
					.text(v)
					.style('padding', '8px')
				if (i === 1) tr.append('td') // column 3 will be for forest plot
			})
		}

		// intercept row
		{
			const tr = table.append('tr').style('background', '#eee')
			result.coefficients.intercept.forEach((v, i) => {
				tr.append('td')
					.text(v)
					.style('padding', '8px')
				if (i === 1) tr.append('td') // column 3 will be for forest plot
			})
		}

		/* term rows:
		for each independent terms, show 1 or multiple rows
		these rows do not cover interactions, which are rendered afterwards
		*/

		// forest plot is shown for both interacting and non-interacting rows
		// a plot is added to 3rd column of each row
		const forestPlotter = self.getForestPlotter(result.coefficients.terms, result.coefficients.interactions)
		let rowcount = 0
		for (const tid in result.coefficients.terms) {
			const termdata = result.coefficients.terms[tid]
			const tw = self.getIndependentTerm(tid)
			let tr = table.append('tr').style('background', rowcount++ % 2 ? '#eee' : 'none')

			// col 1: term name
			const termNameTd = tr.append('td').style('padding', '8px')
			fillTdName(termNameTd, tw.term ? tw.term.name : tid) // can tw ever be missing??

			if (tw.q && tw.q.mode != 'spline' && 'refGrp' in tw && tw.refGrp != refGrp_NA) {
				// do not display ref for spline variable
				termNameTd
					.append('div')
					.style('font-size', '.8em')
					.style('opacity', 0.6)
					.html(
						'<span style="padding:1px 5px;border:1px solid #aaa;border-radius:10px;font-size:.7em">REF</span> ' +
							(tw.term.values && tw.term.values[tw.refGrp] ? tw.term.values[tw.refGrp].label : tw.refGrp) +
							'</span>'
					)
			}

			if (tw.effectAllele) {
				// only for snplst term
				termNameTd
					.append('div')
					.style('font-size', '.8em')
					.style('opacity', 0.6)
					.html(
						'<span style="padding:1px 5px;border:1px solid #aaa;border-radius:10px;font-size:.7em">EFFECT ALLELE</span> ' +
							tw.effectAllele +
							'</span>'
					)
			}

			if (termdata.fields) {
				// only 1 row for this term, no categories

				// col 2: no category
				tr.append('td')
				// col 3
				forestPlotter(tr.append('td'), termdata.fields)
				// rest of columns
				for (const v of termdata.fields) {
					tr.append('td')
						.text(v)
						.style('padding', '8px')
				}
			} else if (termdata.categories) {
				// term has categories, one sub-row for each category

				const orderedCategories = []
				const input = self.getIndependentInput(tid)
				if (input.orderedLabels) {
					// reorder rows by predefined order
					for (const k of input.orderedLabels) {
						if (termdata.categories[k]) orderedCategories.push(k)
					}
				}
				for (const k in termdata.categories) {
					if (!orderedCategories.includes(k)) orderedCategories.push(k)
				}

				// multiple categories
				// show first category as full row, with first cell spanning rest of categories
				termNameTd.attr('rowspan', orderedCategories.length).style('vertical-align', 'top')

				let isfirst = true
				for (const k of orderedCategories) {
					if (isfirst) {
						isfirst = false
					} else {
						// create new row starting from 2nd category
						tr = table.append('tr').style('background', rowcount++ % 2 ? '#eee' : 'none')
					}
					// col 2
					tr.append('td')
						.text(tw && tw.term.values && tw.term.values[k] ? tw.term.values[k].label : k)
						.style('padding', '8px')
					// col 3
					forestPlotter(tr.append('td'), termdata.categories[k])
					// rest of columns
					for (const v of termdata.categories[k]) {
						tr.append('td')
							.text(v)
							.style('padding', '8px')
					}
				}
			} else {
				tr.append('td').text('ERROR: no .fields[] or .categories{}')
			}
		}
		// interactions
		for (const row of result.coefficients.interactions) {
			const tr = table.append('tr').style('background', rowcount++ % 2 ? '#eee' : 'none')

			const term1 = self.state.config.independent.find(t => t.id == row.term1)
			const term2 = self.state.config.independent.find(t => t.id == row.term2)

			// col 1: variable
			{
				const td = tr.append('td').style('padding', '8px')
				fillTdName(td.append('div'), term1 ? term1.term.name : row.term1)
				fillTdName(td.append('div'), term2 ? term2.term.name : row.term2)
			}
			// col 2: category
			{
				const td = tr.append('td').style('padding', '8px')
				const d1 = td.append('div')
				if (row.category1) {
					d1.text(
						term1 && term1.term.values && term1.term.values[row.category1]
							? term1.term.values[row.category1].label
							: row.category1
					)
				}
				const d2 = td.append('div')
				if (row.category2) {
					d2.text(
						term2 && term2.term.values && term2.term.values[row.category2]
							? term2.term.values[row.category2].label
							: row.category2
					)
				}
			}
			// col 3
			forestPlotter(tr.append('td'), row.lst)
			// rest of columns
			for (const v of row.lst) {
				tr.append('td')
					.text(v)
					.style('padding', '8px')
			}
		}

		// last row to show forest plot axis (call function without data)
		const tr = table.append('tr')
		tr.append('td') // col 1
		tr.append('td') // col 2
		forestPlotter(tr.append('td')) // col 3, axis
		for (const v of result.coefficients.header) tr.append('td')
	}

	self.mayshow_type3 = result => {
		if (!result.type3) return
		const div = self.newDiv(result.type3.label)
		const table = div.append('table').style('border-spacing', '0px')

		// header row
		{
			const tr = table.append('tr').style('opacity', 0.4)
			for (const v of result.type3.header) {
				tr.append('td')
					.text(v)
					.style('padding', '8px')
			}
		}

		// intercept row
		{
			const tr = table.append('tr').style('background', '#eee')
			for (const v of result.type3.intercept) {
				tr.append('td')
					.text(v)
					.style('padding', '8px')
			}
		}

		// term rows
		// independent terms (no interaction)
		let rowcount = 0
		for (const tid in result.type3.terms) {
			const termdata = result.type3.terms[tid]
			const term = self.state.config.independent.find(t => t.id == tid)
			let tr = table.append('tr').style('background', rowcount++ % 2 ? '#eee' : 'none')
			// col 1: variable
			const termNameTd = tr.append('td').style('padding', '8px')
			fillTdName(termNameTd, term ? term.term.name : tid)
			// rest of columns
			for (const v of termdata) {
				tr.append('td')
					.text(v)
					.style('padding', '8px')
			}
		}
		// interactions
		for (const row of result.type3.interactions) {
			const tr = table.append('tr').style('background', rowcount++ % 2 ? '#eee' : 'none')
			const term1 = self.state.config.independent.find(t => t.id == row.term1)
			const term2 = self.state.config.independent.find(t => t.id == row.term2)
			// col 1: variable
			const td = tr.append('td').style('padding', '8px')
			fillTdName(td.append('div'), term1 ? term1.term.name : row.term1)
			fillTdName(td.append('div'), term2 ? term2.term.name : row.term2)
			// rest of columns
			for (const v of row.lst) {
				tr.append('td')
					.text(v)
					.style('padding', '8px')
			}
		}
	}

	self.mayshow_other = result => {
		if (!result.other) return
		const div = self.newDiv(result.other.label)
		const table = div.append('table').style('border-spacing', '8px')
		for (let i = 0; i < result.other.header.length; i++) {
			const tr = table.append('tr')
			tr.append('td')
				.style('opacity', 0.4)
				.text(result.other.header[i])
			tr.append('td').text(result.other.rows[i])
		}
	}

	/*
	the function takes all data rows (except intercept) from coefficients table, and return a callback
	the callback closures the axis range of all data
	run callback on each coefficient table row to plot the forest plot

	collect all numeric data points from terms/interactons
	to derive forest plot axis range
	sort numbers in an array
	in logistic, if array[i]=0 then cannot use log(0) as axis min,
	in that case should use array[i+1] or next to find the smallest real number as axis min
	an arbitary cap is used to guard against extreme estimate values
	*/
	self.getForestPlotter = (terms, interactions) => {
		// array indices are the same for both non-interacting and interacting rows
		let midIdx, // array index of the beta/odds ratio
			CIlow, // array(column) index of low end of confidence interval of midIdx
			CIhigh, // array index of high end of confidence interval
			axislab, // data type to show as axis label
			baselineValue, // baseline value to show a vertical line
			// min/max value capping the axis, to guard against extreme estimates
			// only used for logistic odds ratio
			// for linear, will use actual range from estimates and confidence interval
			capMin,
			capMax
		if (self.config.regressionType == 'linear') {
			midIdx = 0
			CIlow = 1
			CIhigh = 2
			axislab = 'Beta value'
			baselineValue = 0
			capMin = null
			capMax = null
		} else if (self.config.regressionType == 'logistic') {
			midIdx = 0
			CIlow = 1
			CIhigh = 2
			axislab = 'Odds ratio'
			baselineValue = 1
			capMin = 0.1
			capMax = 10
		} else {
			throw 'unknown regressionType'
		}

		// collect mid/CIlow/CIhigh numeric values into a flat array
		const values = []
		for (const tid in terms) {
			const d = terms[tid]
			if (d.fields) {
				numbers2array(d.fields)
			} else {
				for (const k in d.categories) {
					numbers2array(d.categories[k])
				}
			}
		}
		for (const i of interactions) {
			numbers2array(i.lst)
		}
		// all valid numbers are collected into values[]
		values.sort((a, b) => a - b) // ascending

		if (capMin == null) {
			// use actual range as cap; all values are valid numbers
			capMin = values[0]
			capMax = values[values.length - 1]
		}

		// graph dimension
		const width = 150 // plottable dimension
		const height = 20
		const xleftpad = 10,
			xrightpad = 10 // leave space for axis

		const scale = get_scale(values)

		// todo: logistic, add center line; linear: 0 value
		return (td, lst) => {
			if (!scale) {
				// scale is not built, do not plot
				return
			}

			// lst is data from a row from either terms or interactions

			const svg = td
				.append('svg')
				.attr('width', width + xleftpad + xrightpad)
				.attr('height', height)
			const g = svg.append('g').attr('transform', 'translate(' + xleftpad + ',0)')

			if (!lst) {
				//////////////////////////////
				// no data; render axis instead

				// do not apply this format for linear regression,
				// had encountered a bug that '.1r' will print "20" at the tick of "15"
				const tickFormat = self.config.regressionType == 'logistic' ? '.1r' : undefined

				const axis = axisBottom()
					.ticks(4, tickFormat)
					.scale(scale)
				axisstyle({
					axis: g.call(axis),
					color: forestcolor,
					showline: true
				})
				const fontsize = 12
				g.append('text')
					.attr('fill', forestcolor)
					.text(axislab)
					.attr('x', width / 2)
					.attr('y', height + fontsize)
				svg.attr('height', height + fontsize)
				return
			}

			{
				// vertical baseline
				const x = scale(baselineValue)
				g.append('line')
					.attr('x1', x)
					.attr('y1', 0)
					.attr('x2', x)
					.attr('y2', height)
					.attr('stroke', '#ccc')
			}

			const mid = Number(lst[midIdx]),
				cilow = Number(lst[CIlow]),
				cihigh = Number(lst[CIhigh])
			if (Number.isNaN(mid)) {
				// not plottable
				return
			}

			g.append('circle')
				.attr('cx', scale(Math.min(Math.max(mid, capMin), capMax)))
				.attr('cy', height / 2)
				.attr('r', 3)
				.attr('fill', forestcolor)

			if (Number.isNaN(cilow) || Number.isNaN(cihigh)) {
				// cannot plot confidence interval
				return
			}

			// confidence interval
			g.append('line')
				.attr('x1', scale(Math.min(Math.max(cilow, capMin), capMax)))
				.attr('y1', height / 2)
				.attr('x2', scale(Math.min(Math.max(cihigh, capMin), capMax)))
				.attr('y2', height / 2)
				.attr('stroke', forestcolor)
		}
		///////// helpers
		function numbers2array(lst) {
			const m = Number(lst[midIdx])
			if (!Number.isNaN(m)) values.push(m)
			const l = Number(lst[CIlow]),
				h = Number(lst[CIhigh])
			if (!Number.isNaN(l) && !Number.isNaN(h)) {
				// if either low/high is NA, do not use
				// this prevent the case of low=NA, high=3e+41 (somehow high is extremely large value)
				values.push(l)
				values.push(h)
			}
		}
		function get_scale(values) {
			if (self.config.regressionType == 'logistic') {
				// apply log to odds ratio
				// iterate to find a non-0 value
				let i = 0
				while (values[i] <= 0) {
					i++
				}
				if (i >= values.length || values[i] <= 0) {
					// no valid value, won't build scale
					return
				}
				const min = values[i]
				const max = values[values.length - 1]
				return scaleLog()
					.domain([Math.max(min, capMin), Math.min(max, capMax)])
					.range([0, width])
					.nice()
			}
			if (self.config.regressionType == 'linear') {
				return scaleLinear()
					.domain([Math.max(values[0], capMin), Math.min(values[values.length - 1], capMax)])
					.range([0, width])
			}
			throw 'unknown type'
		}
	}

	self.show_genomebrowser_snplocus = async result => {
		// show genome browser when there's a snplocus term in independent
		const input = self.parent.inputs.independent.inputs.find(i => i.term && i.term.term.type == 'snplocus')
		if (!self.snplocusBlock) {
			// doesn't have a block, create one
			const arg = {
				holder: self.dom.snplocusBlockDiv,
				genome: await get_one_genome(self.state.vocab.genome),
				chr: input.term.q.chr,
				start: input.term.q.start,
				stop: input.term.q.stop,
				nobox: true,
				tklst: [],
				onCoordinateChange: async rglst => {
					const { chr, start, stop } = rglst[0]
					const tw = {
						term: {
							id: input.term.term.id,
							name: 'Variants in a locus',
							type: 'snplocus'
						},
						q: JSON.parse(JSON.stringify(input.term.q))
					}
					tw.q.chr = chr
					tw.q.start = start
					tw.q.stop = stop
					await input.pill.main(tw)
					/* 
					pill.main() will update following things in termsetting instance:
					- q{ chr/start/stop }
					- term{ snps } list of variants retrieved from updated locus
					for q/term to be synced into regression state, must do runCallback()
					which will call editConfig() and dispatch action with hasUnsubmittedEdits=true,
					set this single-use flag to nullify it
					to be able to continue run analysis
					*/
					self.hasUnsubmittedEdits_nullify_singleuse = true
					/*
					reason of not directly calling self.parent.inputs.editConfig(input, tw)
					is that we're having incomplete info in tw
					mostly tw.term.snps[] is missing, and that can only be made in pill main/postMain/validateSnps
					*/
					input.pill.runCallback()
				}
			}

			// add mds3 tk
			arg.tklst.push({
				type: 'mds3', // tkt.mds3
				name: 'Variants',
				numericmode: {
					inuse: true,
					type: '__value',
					label: '-log10 p-value',
					tooltipPrintValue: m => 'p-value=' + m.regressionPvalue
				},
				custom_variants: make_mds3_variants(input.term.term.snps, result),
				click_snvindel: m => {
					self.displayResult_oneset(m.regressionResult)
				}
			})

			first_genetrack_tolist(arg.genome, arg.tklst)
			const _ = await import('../block')
			self.snplocusBlock = new _.Block(arg)
			window.bb = self.snplocusBlock // testing, delete before prod release
		} else {
			// browser is already created
			// find the mds3 track
			const tk = self.snplocusBlock.tklst.find(i => i.type == 'mds3')
			// assign result to each variant
			tk.custom_variants = make_mds3_variants(input.term.term.snps, result)
			// render
			tk.load()
		}
	}
}

function fillTdName(td, name) {
	if (name.length < 30) {
		td.text(name)
	} else {
		td.text(name.substring(0, 25) + ' ...').attr('title', name)
	}
}

function make_mds3_variants(snps, result) {
	/* assign result to snps
	snps is from input.term.term.snps
	result:{lst[{data,id},{data,id},...]}
	*/
	const mlst = []
	for (const snp of snps) {
		const m = {}
		Object.assign(m, snp)
		const thisresult = result.lst.find(i => i.id == m.snpid)
		if (thisresult) {
			// reg result is found for this snp; can call displayResult_oneset
			const d = thisresult.data
			if (!d) throw '.data{} missing'
			m.regressionResult = d
			// find p-value (last column of coeff table)
			if (!d.coefficients || !d.coefficients.terms) throw '.data{coefficients:{terms}} missing'
			if (!d.coefficients.terms[m.snpid]) throw m.snpid + ' missing in coefficients.terms{}'
			if (!Array.isArray(d.coefficients.terms[m.snpid].fields))
				throw `coefficients.terms[${m.snpid}].fields[] not array`
			const str = d.coefficients.terms[m.snpid].fields[d.coefficients.terms[m.snpid].fields.length - 1]
			// last value of .fields[] should be p-value
			// could be NA
			const v = Number(str)
			if (Number.isNaN(v)) {
				m.regressionPvalue = str
				// setting -log10(p) to 0 allows the dot to show while being able to show pvalue=NA in tooltip
				m.__value = 0
			} else {
				m.regressionPvalue = v
				m.__value = -Math.log10(v)
			}
		} else {
			console.log('no result for ' + m.snpid)
		}
		mlst.push(m)
	}
	return mlst
}
