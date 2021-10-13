import { controlsInit } from './controls'
import { getCompInit } from '../common/rx.core'
import { select } from 'd3-selection'
import { normalizeFilterData } from '../mass/plot'
import { getNormalRoot } from '../common/filter'

class TdbTable {
	constructor(opts) {
		this.type = 'table'
	}

	async init() {
		const opts = this.opts
		const controls = opts.controls ? null : opts.holder.append('div')
		const holder = opts.controls ? opts.holder : opts.holder.append('div')
		this.dom = {
			header: opts.header,
			controls,
			holder,
			div: holder.style('margin', '10px 0px').style('display', 'none')
		}
		if (this.dom.header) this.dom.header.html('Crosstab')
		setInteractivity(this)
		setRenderers(this)
		await this.setControls()
	}

	async setControls() {
		if (this.opts.controls) {
			this.opts.controls.on('downloadClick.boxplot', this.download)
		} else {
			this.dom.holder
				.attr('class', 'pp-termdb-plot-viz')
				.style('display', 'inline-block')
				.style('min-width', '300px')
				.style('margin-left', '50px')

			this.components = {
				controls: await controlsInit({
					app: this.app,
					id: this.id,
					holder: this.dom.controls.attr('class', 'pp-termdb-plot-controls').style('display', 'inline-block')
				})
			}

			this.components.controls.on('downloadClick.boxplot', this.download)
		}
	}

	getState(appState, sub) {
		const config = appState.plots.find(p => p.id === this.id)
		if (!config) {
			throw `No plot with id='${this.id}' found. Did you set this.id before this.api = getComponentApi(this)?`
		}
		return {
			isVisible: config.settings.currViews.includes('table'),
			activeCohort: appState.activeCohort,
			termfilter: {
				filter: getNormalRoot(appState.termfilter.filter)
			},
			config: {
				term: config.term,
				term2: config.term2,
				settings: {
					common: config.settings.common,
					table: config.settings.table
				}
			}
		}
	}

	async main() {
		try {
			this.config = this.state.config
			if (!this.state.isVisible) {
				this.dom.div.style('display', 'none')
				return
			}
			if (!this.config.term2) {
				this.dom.div.style('display', 'none')
				throw 'term2 is required for table view'
			}
			const dataName = this.getDataName(this.state)
			this.data = await this.app.vocabApi.getPlotData(this.id, dataName)
			const [columns, rows] = this.processData(this.data)
			this.render(columns, rows)
		} catch (e) {
			throw e
		}
	}

	// creates URL search parameter string, that also serves as
	// a unique request identifier to be used for caching server response
	getDataName(state) {
		const params = []
		for (const _key of ['term', 'term2', 'term0']) {
			// "term" on client is "term1" at backend
			const term = this.config[_key]
			if (!term) continue
			const key = _key == 'term' ? 'term1' : _key
			params.push(key + '_id=' + encodeURIComponent(term.term.id))
			if (!term.q) throw 'plot.' + _key + '.q{} missing: ' + term.term.id
			params.push(key + '_q=' + this.app.vocabApi.q_to_param(term.q))
		}

		if (state.termfilter.filter.lst.length) {
			const filterData = normalizeFilterData(state.termfilter.filter)
			params.push('filter=' + encodeURIComponent(JSON.stringify(filterData)))
		}

		return '/termdb-barsql?' + params.join('&')
	}

	processData(data) {
		const t2 = this.config.term2.term
		const columns = data.refs.rows.map(key => {
			const label = t2.values && key in t2.values ? t2.values[key].label : key
			return { key, label }
		})
		const column_keys = data.refs.rows
		const t1 = this.config.term.term
		const rows = data.refs.cols.map(v1 => {
			const series = data.charts[0].serieses.find(d => d.seriesId == v1)
			const label = t1.values && v1 in t1.values ? t1.values[v1].label : v1
			return {
				label,
				lst: !series
					? []
					: series.data
							.slice()
							.sort((a, b) => column_keys.indexOf(a.dataId) - column_keys.indexOf(b.dataId))
							.map(d => {
								return {
									label: d.dataId,
									value: d.total
								}
							})
			}
		})
		return [columns, rows]
	}
}

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
	self.render = function render(columns, rows) {
		self.dom.div
			.style('display', 'inline-block')
			.selectAll('*')
			.remove()

		// show table
		const table = self.dom.div
			.append('table')
			//.style('margin-left','20px')
			.style('margin-right', '20px')
			.style('border-spacing', '3px')
			.style('border-collapse', 'collapse')
			.style('border', '1px solid black')

		// header
		const tr = table
			.append('tr')
			.style('white-space', 'normal')
			.style('background-color', '#ececec')

		tr.append('td') // column 1
		// print term2 values as rest of columns
		for (const value of columns) {
			const label = value.label
			tr.append('th')
				.text(label.length > 20 ? label.slice(0, 16) + '...' : label)
				.attr('title', label)
				.style('border', '1px solid black')
				.style('padding', '3px')
				.style('text-align', 'center')
				.style('min-width', '80px')
				.style('max-width', '150px')
				.style('word-break', label.length > 12 ? 'break-word' : 'normal')
				.style('vertical-align', 'top')
		}

		let i = 0
		for (const t1v of rows) {
			const tr = table.append('tr').style('background-color', i++ % 2 == 0 ? '#fff' : '#ececec')

			// column 1
			tr.append('th')
				.text(t1v.label.length > 20 ? t1v.label.slice(0, 20) + '...' : t1v.label)
				.attr('title', t1v.label)
				.style('border', '1px solid black')
				.style('padding', '3px')
				.style('word-break', t1v.label.length > 12 ? 'break-all' : 'normal')

			// other columns
			const column_keys = columns.map(d => d.key)
			for (const t2label of column_keys) {
				const td = tr
					.append('td')
					.style('border', '1px solid black')
					.style('padding', '3px 5px')
					.style('text-align', 'center') //'right')
				const v = t1v.lst.find(i => i.label == t2label)
				if (v) {
					td //.append('div')
						//.style('display', 'inline-block')
						//.style('text-align', 'right')
						//.style('min-width', '50px')
						.html(v.value)
				}
			}
		}
	}
}

export const tableInit = getCompInit(TdbTable)
