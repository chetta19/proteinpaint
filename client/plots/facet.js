import { getCompInit, copyMerge } from '#rx'
import { appInit } from '#plots/plot.app.js'
import { fillTermWrapper } from '#termsetting'
import { controlsInit } from './controls'
import { select2Terms } from '#dom/select2Terms'
import { isNumericTerm } from '../shared/terms'

class Facet {
	constructor(opts) {
		this.type = 'facet'
		const holder = opts.holder
		const controlsHolder = holder.append('div').style('display', 'inline-block')
		const mainDiv = holder.append('div').style('display', 'inline-block')

		this.dom = {
			holder: opts.holder.style('padding', '20px'),
			header: opts.header,
			controlsHolder,
			mainDiv
		}
		if (this.dom.header) this.dom.header.html('Facet')
	}

	async init(appState) {
		await this.setControls()
	}

	getState(appState) {
		const config = appState.plots.find(p => p.id === this.id)

		return {
			config,
			vocab: appState.vocab,
			termfilter: appState.termfilter
		}
	}

	main() {
		this.config = JSON.parse(JSON.stringify(this.state.config))
		this.renderTable()
	}

	async renderTable() {
		const config = this.config
		this.dom.mainDiv.selectAll('*').remove()
		const tbody = this.dom.mainDiv.append('table').style('border-spacing', '5px').append('tbody')

		const tr = tbody.append('tr')
		tr.append('th')

		const result = await this.app.vocabApi.getAnnotatedSampleData({
			terms: [config.term, config.term2]
		})
		const categories = this.getCategories(config.term, result.lst)
		for (const category of categories) {
			tr.append('th').style('background-color', '#FAFAFA').text(category)
		}
		const categories2 = this.getCategories(config.term2, result.lst)
		for (const category2 of categories2) {
			const tr = tbody.append('tr')
			tr.append('td').style('background-color', '#FAFAFA').text(category2)
			for (const category of categories) {
				const samples = result.lst.filter(
					s => s[config.term.$id]?.key == category && s[config.term2.$id]?.key == category2
				)
				const td = tr.append('td').style('background-color', '#FAFAFA')
				if (samples.length > 0)
					td.append('a')
						.text(samples.length)
						.on('click', () => {
							this.app.dispatch({
								type: 'plot_create',
								config: {
									chartType: 'sampleView',
									samples: samples.map(d => ({
										sampleId: d.sample,
										sampleName: result.refs.bySampleId[d.sample].label
									}))
								}
							})
						})
			}
		}
	}

	getCategories(tw, data) {
		const categories = []
		for (const sample of data) {
			const value = sample[tw.$id]
			if (value) categories.push(value.key)
		}
		const set = new Set(categories)
		return Array.from(set).sort()
	}

	async setControls() {
		const inputs = [
			{
				type: 'term',
				configKey: 'term',
				chartType: this.type,
				usecase: { target: this.type },
				title: 'Facet column categories',
				label: 'Columns',
				vocabApi: this.app.vocabApi,
				numericEditMenuVersion: ['discrete']
			},
			{
				type: 'term',
				configKey: 'term2',
				chartType: this.type,
				usecase: { target: this.type },
				title: 'Facet row categories',
				label: 'Rows',
				vocabApi: this.app.vocabApi,
				numericEditMenuVersion: ['discrete']
			}
		]

		this.components = {
			controls: await controlsInit({
				app: this.app,
				id: this.id,
				holder: this.dom.controlsHolder,
				inputs
			})
		}
	}
}

export function makeChartBtnMenu(holder, chartsInstance) {
	const callback = (xterm, yterm) => {
		const config = {
			chartType: 'facet',
			term: { term: xterm },
			term2: { term: yterm }
		}
		if (isNumericTerm(xterm)) config.term.q = { mode: 'discrete' }
		if (isNumericTerm(yterm)) config.term2.q = { mode: 'discrete' }
		chartsInstance.app.dispatch({
			type: 'plot_create',
			config
		})
	}
	select2Terms(chartsInstance.dom.tip, chartsInstance.app, 'facet', '', callback)
}

export const facetInit = getCompInit(Facet)
// this alias will allow abstracted dynamic imports
export const componentInit = facetInit

export async function getPlotConfig(opts, app) {
	const config = { settings: {} }
	await fillTermWrapper(opts.term, app.vocabApi)
	await fillTermWrapper(opts.term2, app.vocabApi)
	const result = copyMerge(config, opts)
	return result
}
