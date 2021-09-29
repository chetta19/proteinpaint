import { getCompInit, copyMerge } from '../common/rx.core'
import { select } from 'd3-selection'
import { termsettingInit } from '../common/termsetting'
import { getTermSelectionSequence } from './charts'
import { dofetch3 } from '../client'
import { getNormalRoot } from '../common/filter'

class MassRegressionUI {
	constructor(opts) {
		this.type = 'regressionUI'
		this.sections = [
			{
				label: 'Outcome variable',
				prompt: 'Select outcome variable',
				configKey: 'term',
				limit: 1,
				selected: [],
				cutoffTermTypes: ['condition', 'integer', 'float'],
				// to track and recover selected term pills, info divs, other dom elements,
				// and avoid unnecessary jerky full rerenders for the same term
				items: {}
			},
			{
				label: 'Independent variable(s)',
				prompt: 'Add independent variable',
				configKey: 'independent',
				limit: 10,
				selected: [],
				items: {}
			}
		]
		// track reference category values or groups by term ID
		this.refGrpByTermId = {}
		setInteractivity(this)
		setRenderers(this)
	}

	async init() {
		const controls = this.opts.holder.append('div').style('display', 'block')

		this.dom = {
			div: this.opts.holder.style('margin', '10px 0px'),
			controls,
			body: controls.append('div'),
			foot: controls.append('div')
		}
		this.totalSampleCount = undefined
	}

	getState(appState) {
		const config = appState.plots.find(p => p.id === this.id)
		if (!config) {
			throw `No plot with id='${this.id}' found. Did you set this.id before this.api = getComponentApi(this)?`
		}
		return {
			isVisible: config.settings && config.settings.currViews.includes('regression'),
			activeCohort: appState.activeCohort,
			vocab: appState.vocab,
			termfilter: appState.termfilter,
			config: {
				cutoff: config.cutoff,
				term: config.term,
				regressionType: config.regressionType,
				independent: config.independent,
				settings: {
					table: config.settings && config.settings.regression
				}
			}
		}
	}

	reactsTo(action) {
		if (action.type.startsWith('plot_')) {
			return action.id === this.id
		}
		if (action.type.startsWith('filter')) return true
		if (action.type.startsWith('cohort')) return true
		if (action.type == 'app_refresh') return true
	}

	main() {
		// create a writable config copy, that would not
		// mutate the actual state until the form is submitted
		this.config = copyMerge('{}', this.state.config)
		if (!this.dom.submitBtn) this.initUI()
		this.render()
	}

	setDisableTerms() {
		this.disable_terms = []
		if (this.config.term) this.disable_terms.push(this.config.term.id)
		if (this.config.independent) for (const term of this.config.independent) this.disable_terms.push(term.id)
	}

	async updateValueCount(d) {
		// query backend for total sample count for each value of categorical or condition terms
		// and included and excluded sample count for nuemric term
		const q = JSON.parse(JSON.stringify(d.term.q))
		delete q.values
		const lst = [
			'/termdb?getcategories=1',
			'tid=' + d.term.id,
			'term1_q=' + encodeURIComponent(JSON.stringify(q)),
			'filter=' + encodeURIComponent(JSON.stringify(getNormalRoot(this.state.termfilter.filter))),
			'genome=' + this.state.vocab.genome,
			'dslabel=' + this.state.vocab.dslabel
		]
		if (q.bar_by_grade) lst.push('bar_by_grade=1')
		if (q.bar_by_children) lst.push('bar_by_children=1')
		if (q.value_by_max_grade) lst.push('value_by_max_grade=1')
		if (q.value_by_most_recent) lst.push('value_by_most_recent=1')
		if (q.value_by_computable_grade) lst.push('value_by_computable_grade=1')
		const url = lst.join('&')
		const data = await dofetch3(url, {}, this.app.opts.fetchOpts)
		if (data.error) throw data.error
		d.sampleCounts = data.lst
		const totalCount = (d.term.q.totalCount = { included: 0, excluded: 0, total: 0 })
		data.lst.forEach(v => {
			if (v.range && v.range.is_unannotated) totalCount.excluded = totalCount.excluded + v.samplecount
			else totalCount.included = totalCount.included + v.samplecount
		})
		totalCount.total = totalCount.included + totalCount.excluded
		// store total count from numerical/categorical term as global variable totalSampleCount
		if (this.totalSampleCount == undefined && d.term.term.type != 'condition') this.totalSampleCount = totalCount.total
		// for condition term, subtract included count from totalSampleCount to get excluded
		// TODO: it's not reliable approch to get excluded count for
		// 'Most recent grade' / 'any grade' / 'sub-conditions', for example, cardiovascular system
		if (d.term.term.type == 'condition' && this.totalSampleCount) {
			totalCount.excluded = this.totalSampleCount - totalCount.included
		}
	}
}

function setRenderers(self) {
	self.initUI = () => {
		self.dom.submitBtn = self.dom.foot
			.style('margin', '3px 15px')
			.style('padding', '3px 5px')
			.append('button')
			.html('Run analysis')
			.on('click', self.submit)

		self.updateBtns()
	}

	self.render = () => {
		self.setDisableTerms()
		const grps = self.dom.body.selectAll(':scope > div').data(self.sections || [])

		grps.exit().remove()
		grps.each(renderSection)
		grps
			.enter()
			.append('div')
			.style('margin', '3px 5px')
			.style('padding', '3px 5px')
			.each(renderSection)

		self.updateBtns()
	}

	// initialize the ui sections
	function renderSection(section) {
		const div = select(this)

		// in case of an empty div
		if (!this.lastChild) {
			// firstChild
			div
				.append('div')
				.style('margin', '3px 5px')
				.style('padding', '3px 5px')
				.style('font-size', '17px')
				.style('color', '#bbb')
				.text(section.label)

			// this.lastChild
			div.append('div')
		}

		const v = self.config[section.configKey]
		section.selected = Array.isArray(v) ? v : v ? [v] : []
		const itemRefs = section.selected.map(term => {
			if (!(term.id in section.items)) {
				section.items[term.id] = { section, term }
			}
			return section.items[term.id]
		})

		if (itemRefs.length < section.limit && !itemRefs.find(d => !d.term)) {
			// create or reuse a blank pill to prompt a new term selection
			if (!section.items.undefined) section.items.undefined = { section }
			itemRefs.push(section.items.undefined)
		}

		const pillDivs = select(this.lastChild)
			.selectAll(':scope > div')
			.data(itemRefs, d => d.term && d.term.id)
		pillDivs.exit().each(removePill)
		pillDivs.each(updatePill)
		pillDivs
			.enter()
			.append('div')
			.each(addPill)
	}

	function setActiveValues(d) {
		const gs = d.term.q.groupsetting || {}
		const i = gs.inuse && gs.predefined_groupset_idx
		d.values = gs.inuse
			? i !== undefined
				? d.term.term.groupsetting.lst[i].groups
				: gs.customset.groups
			: d.term.term.values
		d.label_key = gs.inuse ? 'name' : 'label'
	}

	async function addPill(d) {
		const config = self.config
		const div = select(this)
			.style('width', 'fit-content')
			.style('margin', '5px 15px 5px 45px')
			.style('padding', '3px 5px')
			.style('border-left', d.term ? '1px solid #bbb' : '')

		d.pill = termsettingInit({
			placeholder: d.section.prompt,
			holder: div.append('div'),
			vocabApi: self.app.vocabApi,
			vocab: self.state.vocab,
			activeCohort: self.state.activeCohort,
			use_bins_less: true,
			debug: self.opts.debug,
			showFullMenu: true, // to show edit/replace/remove menu upon clicking pill
			usecase: { target: config.chartType, detail: d.section.configKey },
			disable_terms: self.disable_terms,
			abbrCutoff: 50,
			callback: term => {
				self.editConfig(d, term)
			}
		})
		d.dom = {
			infoDiv: div.append('div')
		}
		d.dom.cutoffDiv = d.dom.infoDiv.append('div')
		d.dom.term_summmary_div = d.dom.infoDiv.append('div')
		d.dom.term_values_div = d.dom.infoDiv.append('div')
		d.dom.values_table = d.dom.term_values_div.append('table')
		d.dom.ref_click_prompt = d.dom.term_values_div.append('div')
		updatePill.call(this, d)
	}

	function updatePill(d) {
		select(this).style('border-left', d.term ? '1px solid #bbb' : '')
		d.pill.main(
			Object.assign(
				{
					disable_terms: self.disable_terms
				},
				d.term
			)
		)
		d.dom.infoDiv.style('display', d.term ? 'block' : 'none')
		if (d.section.configKey == 'term') renderCuttoff(d)
		// renderInfo() is required for both outcome and independent variables
		if (d.term) renderInfo(d)
	}

	function removePill(d) {
		delete d.section.items[d.term.id]
		const div = select(this)
		div
			.transition()
			.duration(500)
			.style('opacity', 0)
			.remove()
	}

	function renderCuttoff(d) {
		if (!d.term || self.config.regressionType != 'logistic') return
		d.dom.infoDiv
			.style('display', d.term && d.cutoffTermTypes && d.cutoffTermTypes.includes(d.term.term.type) ? 'block' : 'none')
			.style('margin', '3px 5px')
			.style('padding', '3px 5px')

		d.dom.cutoffDiv.selectAll('*').remove()
		const cutoffLabel = d.dom.cutoffDiv.append('span').html('Use cutoff of ')
		const useCutoffInput = d.dom.cutoffDiv
			.append('input')
			.attr('type', 'number')
			.style('width', '50px')
			.style('text-align', 'center')
			.property('value', d.cutoff)
			.on('change', () => {
				const value = useCutoffInput.property('value')
				if (value === '') delete d.cutoff
				else d.cutoff = Number(value)
			})
	}

	async function renderInfo(d) {
		d.dom.infoDiv
			.style('display', 'block')
			.style('margin', '10px')
			.style('font-size', '.8em')
			.style('text-align', 'left')
			.style('color', '#999')

		if (d.term) await self.updateValueCount(d)
		updateTermInfoDiv(d)
	}

	function updateTermInfoDiv(d) {
		setActiveValues(d)
		const q = (d.term && d.term.q) || {}
		if (!q.totalCount) q.totalCount = { included: 0, excluded: 0, total: 0 }
		if (d.section.configKey == 'independent') {
			if (d.term.term.type == 'float' || d.term.term.type == 'integer') {
				d.dom.term_summmary_div.html(
					`Use as ${q.use_as || 'continuous'} variable. </br>
					${q.totalCount.included} sample included.` +
						(q.totalCount.excluded ? ` ${q.totalCount.excluded} samples excluded.` : '')
				)
			} else if (d.term.term.type == 'categorical' || d.term.term.type == 'condition') {
				const gs = d.term.q.groupsetting || {}
				let text
				// d.values is already set by self.setActiveValues() above
				if (gs.inuse) {
					text = Object.keys(d.values).length + ' groups.'
					make_values_table(d)
				} else {
					text = Object.keys(d.values).length + (d.term.term.type == 'categorical' ? ' categories.' : ' grades.')
					make_values_table(d)
				}
				text =
					text +
					` ${q.totalCount.included} sample included.` +
					(q.totalCount.excluded ? ` ${q.totalCount.excluded} samples excluded.` : '')
				d.dom.ref_click_prompt
					.style('padding', '5px 10px')
					.style('color', '#999')
					.text('Click on a row to mark it as reference.')
				d.dom.term_summmary_div.text(text)
			}
		} else if (d.section.configKey == 'term') {
			if (d.term.term.type == 'float' || d.term.term.type == 'integer')
				d.dom.term_summmary_div.text(
					`${q.totalCount.included} sample included.` +
						(q.totalCount.excluded ? ` ${q.totalCount.excluded} samples excluded.` : '')
				)
		}
	}

	function make_values_table(d) {
		// TODO: is it ok to sort grade by sample count or it should be by grades 0-5?
		// and what should be reference group, '0: no condition' seems good choice.
		const tr_data = d.sampleCounts.sort((a, b) => b.samplecount - a.samplecount)
		if (!('refGrp' in d) && d.term.q && 'refGrp' in d.term.q) d.refGrp = d.term.q.refGrp

		if (!('refGrp' in d) || !tr_data.find(c => c.key === d.refGrp)) {
			if (d.term.id in self.refGrpByTermId && tr_data.find(c => c.key === self.refGrpByTermId[d.term.id])) {
				d.refGrp = self.refGrpByTermId[d.term.id]
			} else {
				d.refGrp = tr_data[0].key
				self.refGrpByTermId[d.term.id] = tr_data[0].key
			}
		}

		const trs = d.dom.values_table
			.style('margin', '10px 5px')
			.style('border-spacing', '3px')
			.style('border-collapse', 'collapse')
			.selectAll('tr')
			.data(tr_data, d => d.key)

		trs
			.exit()
			.transition()
			.duration(500)
			.remove()
		trs.each(trUpdate)
		trs
			.enter()
			.append('tr')
			.each(trEnter)
		//d.values_table.selectAll('tr').sort((a,b) => d.sampleCounts[b.key] - d.sampleCounts[a.key])
	}

	function trEnter(item) {
		const tr = select(this)
		const d = this.parentNode.__data__

		tr.style('padding', '5px 5px')
			.style('text-align', 'left')
			.style('border-bottom', 'solid 1px #ddd')
			.style('cursor', 'pointer')
			.on('mouseover', () => {
				if (d.refGrp !== item.key) {
					tr.style('background', '#fff6dc')
					ref_text
						.style('display', 'inline-block')
						.style('border', '')
						.text('Select as Reference')
				} else tr.style('background', 'white')
			})
			.on('mouseout', () => {
				tr.style('background', 'white')
				if (d.refGrp !== item.key) ref_text.style('display', 'none')
			})
			.on('click', () => {
				d.refGrp = item.key
				self.refGrpByTermId[d.term.id] = item.key
				//d.term.q.refGrp = item.key
				ref_text.style('border', '1px solid #bbb').text('REFERENCE')
				make_values_table(d)
			})

		tr.append('td')
			.style('padding', '3px 5px')
			.style('text-align', 'left')
			.style('color', 'black')
			.html(
				(item.samplecount !== undefined
					? `<span style='display: inline-block;width: 70px;'>n= ${item.samplecount} </span>`
					: '') + item.label
			)

		const reference_td = tr
			.append('td')
			.style('padding', '3px 5px')
			.style('text-align', 'left')

		const ref_text = reference_td
			.append('div')
			.style('display', item.key === d.refGrp ? 'inline-block' : 'none')
			.style('padding', '2px 10px')
			.style('border', item.key === d.refGrp ? '1px solid #bbb' : '')
			.style('border-radius', '10px')
			.style('color', '#999')
			.style('font-size', '.7em')
			.text('REFERENCE')
	}

	function trUpdate(item) {
		const pillData = this.parentNode.__data__
		select(this.firstChild).html(
			(item.samplecount !== undefined
				? `<span style='display: inline-block;width: 70px;'>n= ${item.samplecount} </span>`
				: '') + item.label
		)
		select(this)
			.select('div')
			.style('display', item.key === pillData.refGrp ? 'inline-block' : 'none')
		self.dom.submitBtn.property('disabled', false)
	}

	self.updateBtns = () => {
		const hasMissingTerms = self.sections.filter(t => !t.selected || (t.limit > 1 && !t.selected.length)).length > 0
		self.dom.submitBtn.property('disabled', hasMissingTerms)
	}
}

function setInteractivity(self) {
	self.editConfig = async (d, term) => {
		const c = self.config
		const key = d.section.configKey
		if (term && term.term && !('id' in term)) term.id = term.term.id
		// edit section data
		if (Array.isArray(c[key])) {
			if (!d.term) {
				if (term) c[key].push(term)
			} else {
				const i = c[key].findIndex(t => t.id === d.term.id)
				if (term) c[key][i] = term
				else c[key].splice(i, 1)
			}
		} else {
			if (term) c[key] = term
			//else delete c[key]
		}

		// edit pill data and tracker
		if (term) {
			delete d.section.items[d.term && d.term.id]
			d.section.items[term.id] = d
			d.term = term
		} // if (!term), do not delete d.term, so that it'll get handled in pillDiv.exit()

		self.render()
	}

	self.submit = () => {
		const config = JSON.parse(JSON.stringify(self.config))
		//delete config.settings
		for (const term of config.independent) {
			term.q.refGrp = term.id in self.refGrpByTermId ? self.refGrpByTermId[term.id] : ''
		}
		// disable submit button on click, reenable after rendering results
		self.dom.submitBtn.property('disabled', true)
		self.app.dispatch({
			type: config.term ? 'plot_edit' : 'plot_show',
			id: self.id,
			chartType: 'regression',
			config
		})
	}
}

export const regressionUIInit = getCompInit(MassRegressionUI)
