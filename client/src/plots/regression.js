import { regressionUIInit } from './regression.ui'
import { getCompInit } from '../common/rx.core'
import { select } from 'd3-selection'
import { q_to_param } from '../termdb/plot'
import { getNormalRoot } from '../common/filter'

class MassRegression {
	constructor(opts) {
		this.type = 'regression'
		setInteractivity(this)
		setRenderers(this)
	}

	async init() {
		this.opts.holder.style('margin-left', 0)
		const controls = this.opts.holder.append('div')
		const resultsDiv = this.opts.holder.append('div').style('margin-left', '40px')

		this.dom = {
			controls,
			header: this.opts.header,
			banner: this.opts.holder
				.append('div')
				.style('color', '#bbb')
				.style('display', 'none')
				.style('margin-bottom', '10px'),

			resultsHeading: resultsDiv
				.append('div')
				.style('margin', '30px 0 10px 0px')
				.style('font-size', '17px')
				.style('padding', '3px 5px')
				.style('color', '#bbb')
				.html('Results'),

			div: resultsDiv.append('div').style('margin', '10px') //.style('display', 'none')
		}

		this.components = {
			controls: await regressionUIInit({
				app: this.app,
				id: this.id,
				holder: this.dom.controls,
				chart: this.api
				/*callbacks: {
					'downloadClick.regression': this.download
				}*/
			})
		}
	}

	getState(appState, sub) {
		const config = appState.plots.find(p => p.id === this.id)
		if (!config) {
			throw `No plot with id='${this.id}' found. Did you set this.id before this.api = getComponentApi(this)?`
		}
		if (!config.regressionType) throw 'regressionType is required'
		return {
			isVisible: config.settings && config.settings.currViews.includes('regression'),
			formIsComplete: config.term && config.independent.length,
			activeCohort: appState.activeCohort,
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

	async main() {
		//if (!this.state.config.term) return
		this.config = JSON.parse(JSON.stringify(this.state.config))
		if (this.dom.header) {
			const regressionType = this.config.regressionType
			const text = regressionType.charAt(0).toUpperCase() + regressionType.slice(1) + ' Regression'
			this.dom.header.html(text)
		}
		if (!this.state.isVisible) {
			this.dom.div.style('display', 'none')
			this.dom.resultsHeading.style('display', 'none')
			return
		}
		if (!this.config.independent.length || !this.config.term) {
			this.dom.div.style('display', 'none')
			this.dom.resultsHeading.style('display', 'none')
			// will only show the regression controls when outcome and/or independent terms are empty
			return
		}
		console.log(88, this.dom)
		this.dom.div.selectAll('*').remove()
		this.dom.banner.style('display', this.state.formIsComplete ? 'block' : 'none')
		const dataName = this.getDataName()
		this.data = await this.app.vocabApi.getPlotData(this.id, dataName)
		const tables = this.processData(this.data)
		this.dom.banner.style('display', 'none')
		this.dom.div.style('display', 'block')
		this.dom.resultsHeading.style('display', 'block')
		for (const name in tables) {
			const [columns, rows] = tables[name]
			this.renderTable(this.dom.div, name, columns, rows)
		}
	}

	// creates URL search parameter string, that also serves as
	// a unique request identifier to be used for caching server response
	getDataName() {
		const c = this.config // the plot object in state
		const params = [
			'getregression=1',
			'term1_id=' + encodeURIComponent(c.term.term.id),
			'term1_q=' + q_to_param(c.term.q),
			'independent=' +
				encodeURIComponent(
					JSON.stringify(
						c.independent.map(t => {
							return { id: t.id, q: t.q, type: t.term.type }
						})
					)
				)
		]
		if (c.regressionType == 'logistic') {
			if (!c.cutoff) throw "Cutoff values in required for 'Outcome variable'"
			params.push('regressionType=logistic')
			params.push('cutoff=' + c.cutoff)
		}

		const filterData = getNormalRoot(this.state.termfilter.filter)
		if (filterData.lst.length) {
			params.push('filter=' + encodeURIComponent(JSON.stringify(filterData))) //encodeNestedFilter(state.termfilter.filter))
		}
		return '/termdb?' + params.join('&')
	}

	processData(multipleData) {
		const tables = {}
		for (const data of multipleData) {
			let columns, rows
			if (data.format === 'matrix') {
				columns = data.keys.map(key => {
					return { key, label: key }
				})
				rows = data.rows.map((row, i) => {
					let config
					return {
						lst: row.map((r, i) => {
							let value = r
							if (columns[i].label === 'Variable') {
								config = this.state.config.independent.find(x => x.id === r)
								if (config) value = config.term.name // get term name to display in table
							}
							if (columns[i].label === 'Category') {
								if (config) {
									if (config.term.values) {
										value = r in config.term.values ? config.term.values[r].label : r
									}
								}
							}
							return { label: columns[i].label, value: value }
						})
					}
				})
			} else if (data.format === 'vector') {
				columns = undefined
				rows = data.rows
			} else {
				throw `data format '${data.format}' is not recognized`
			}
			tables[data.name] = [columns, rows]
		}
		return tables
	}
}

export const regressionInit = getCompInit(MassRegression)
// this alias will allow abstracted dynamic imports
export const componentInit = regressionInit

function setInteractivity(self) {
	self.download = () => {
		if (!self.state || !self.state.isVisible) return
		const data = []
		self.dom.div.selectAll('tr').each(function() {
			const series = []
			select(this)
				.selectAll('th, td')
				.each(function() {
					series.push(select(this).text())
				})
			data.push(series)
		})
		const matrix = data.map(row => row.join('\t')).join('\n')

		const a = document.createElement('a')
		document.body.appendChild(a)
		a.addEventListener(
			'click',
			function() {
				a.download = self.config.term.term.name + ' table.txt'
				a.href = URL.createObjectURL(new Blob([matrix], { type: 'text/tab-separated-values' }))
				document.body.removeChild(a)
			},
			false
		)
		a.click()
	}
}

function setRenderers(self) {
	self.renderTable = function(div, name, columns, rows) {
		// show table title
		const title_div = div
			.append('div')
			.style('text-decoration', 'underline')
			.style('padding-top', '10px')
			.style('padding-bottom', '15px')
			.html(name + ':')
		// show table
		const table = div
			.append('table')
			.style('margin-bottom', '20px')
			.style('border-spacing', '3px')
			.style('border-collapse', 'collapse')

		// header
		const tr = table
			.append('tr')
			.style('white-space', 'normal')
			.style('opacity', 0.6)
			.style('font-size', '.8em')
			.style('padding', '2px 5px')

		// print term2 values as rest of columns
		if (columns) {
			for (const value of columns) {
				const label = value.label
				tr.append('th')
					.text(label.length > 20 ? label.slice(0, 16) + '...' : label)
					.attr('title', label)
					.style('padding', '3px 10px')
					.style('text-align', 'left')
					.style('min-width', '80px')
					.style('max-width', '150px')
					.style('word-break', label.length > 12 ? 'break-word' : 'normal')
					.style('vertical-align', 'top')
					.style('font-weight', 'normal')
					.style('color', '#777')
			}

			let i = 0
			for (const t1v of rows) {
				const tr = table.append('tr').style('background-color', i++ % 2 != 0 ? '#fff' : '#ececec')

				const column_keys = columns.map(d => d.key)
				for (const t2label of column_keys) {
					const td = tr.append('td').style('padding', '3px 10px')
					const v = t1v.lst.find(i => i.label == t2label)
					if (v) {
						td.style('text-align', 'left').html(v.value)
					}
				}
			}
		} else {
			let i = 0
			for (const row of rows) {
				const tr = table
					.append('tr')
					.style('background-color', i++ % 2 != 0 ? '#fff' : '#ececec')
					.style('padding', '3px 5px')
					.style('text-align', 'left')
				for (const [i, cell] of row.entries()) {
					tr.append('td')
						.style('padding', '3px 15px')
						.style('text-align', 'left')
						.style('color', i == 0 ? '#777' : '#000')
						.html(cell)
				}
			}
		}
	}
}
