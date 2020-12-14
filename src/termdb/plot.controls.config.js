import * as rx from '../common/rx.core'
import { overlayInit } from './plot.controls.overlay'
import { term1uiInit } from './plot.controls.term1'
import { divideInit } from './plot.controls.divide'
import { initRadioInputs } from '../common/dom'

class TdbConfigUiInit {
	constructor(app, opts) {
		this.type = 'controlsConfig'
		this.opts = opts
		this.id = opts.id
		this.app = app
		setInteractivity(this)

		const dispatch = app.dispatch
		const table = this.setDom()
		const debug = opts.debug
		this.inputs = {
			view: setViewOpts({ holder: this.dom.viewTr, dispatch, id: this.id, debug }),
			orientation: setOrientationOpts({ holder: this.dom.orientationTr, dispatch, id: this.id, debug }),
			scale: setScaleOpts({ holder: this.dom.scaleTr, dispatch, id: this.id, debug })
		}
		this.components = {
			term1: term1uiInit(app, { holder: this.dom.term1Tr, id: this.id, debug }),
			overlay: overlayInit(app, { holder: this.dom.overlayTr, id: this.id, debug }),
			divideBy: divideInit(app, { holder: this.dom.divideTr, id: this.id, debug })
		}

		this.api = rx.getComponentApi(this)
		this.eventTypes = ['postInit', 'postRender']
	}

	setDom() {
		this.dom = {
			holder: this.opts.holder
				.style('max-width', '50px')
				.style('height', 0)
				.style('vertical-align', 'top')
				.style('transition', '0.2s ease-in-out')
				.style('overflow', 'hidden')
				.style('visibility', 'hidden')
				.style('transition', '0.2s')
		}

		this.dom.table = this.dom.holder
			.append('table')
			.attr('cellpadding', 0)
			.attr('cellspacing', 0)
			.style('white-space', 'nowrap')
		// specify input row order
		this.dom.term1Tr = this.dom.table.append('tr')
		this.dom.overlayTr = this.dom.table.append('tr')
		this.dom.viewTr = this.dom.table.append('tr')
		this.dom.orientationTr = this.dom.table.append('tr')
		this.dom.scaleTr = this.dom.table.append('tr')
		this.dom.divideTr = this.dom.table.append('tr')

		return this.dom.table
	}

	getState(appState) {
		return {
			genome: appState.genome,
			dslabel: appState.dslabel,
			activeCohort: appState.activeCohort,
			termfilter: appState.termfilter,
			config: appState.tree.plots[this.id]
		}
	}

	main() {
		const plot = this.state.config
		const isOpen = plot.settings.controls.isOpen

		this.render(isOpen)
		for (const name in this.inputs) {
			const o = this.inputs[name]
			o.main(o.usestate ? this.state : plot)
		}
	}

	render(isOpen) {
		this.dom.holder
			.style('visibility', isOpen ? 'visible' : 'hidden')
			.style('max-width', isOpen ? '660px' : '50px')
			.style('height', isOpen ? '' : 0)

		this.dom.table
			.selectAll('tr')
			.filter(this.rowIsVisible)
			.selectAll('td')
			.style('border-top', '2px solid #FFECDD')
			.style('padding', '5px 10px')
	}
}

export const configUiInit = rx.getInitFxn(TdbConfigUiInit)

function setInteractivity(self) {
	self.rowIsVisible = function() {
		return this.style.display != 'none'
	}
}

function setOrientationOpts(opts) {
	const self = {
		dom: {
			row: opts.holder,
			labelTdb: opts.holder
				.append('td')
				.html('Orientation')
				.attr('class', 'sja-termdb-config-row-label'),
			inputTd: opts.holder.append('td')
		}
	}

	self.radio = initRadioInputs({
		name: 'pp-termdb-condition-unit',
		holder: self.dom.inputTd,
		options: [
			{ label: 'Vertical', value: 'vertical' },
			{ label: 'Horizontal', value: 'horizontal' }
		],
		listeners: {
			input(d) {
				opts.dispatch({
					type: 'plot_edit',
					id: opts.id,
					config: {
						settings: {
							barchart: {
								orientation: d.value
							}
						}
					}
				})
			}
		}
	})

	const api = {
		main(plot) {
			self.dom.row.style('display', plot.settings.currViews.includes('barchart') ? 'table-row' : 'none')
			self.radio.main(plot.settings.barchart.orientation)
		}
	}

	if (opts.debug) api.Inner = self
	return Object.freeze(api)
}

function setScaleOpts(opts) {
	const self = {
		dom: {
			row: opts.holder,
			labelTd: opts.holder
				.append('td')
				.html('Scale')
				.attr('class', 'sja-termdb-config-row-label'),
			inputTd: opts.holder.append('td')
		}
	}

	self.radio = initRadioInputs({
		name: 'pp-termdb-scale-unit',
		holder: self.dom.inputTd,
		options: [
			{ label: 'Linear', value: 'abs' },
			{ label: 'Log', value: 'log' },
			{ label: 'Proportion', value: 'pct' }
		],
		listeners: {
			input(d) {
				opts.dispatch({
					type: 'plot_edit',
					id: opts.id,
					config: {
						settings: {
							barchart: {
								unit: d.value
							}
						}
					}
				})
			}
		}
	})

	const api = {
		main(plot) {
			self.dom.row.style('display', plot.settings.currViews.includes('barchart') ? 'table-row' : 'none')
			self.radio.main(plot.settings.barchart.unit)
			self.radio.dom.divs.style('display', d => {
				if (d.value == 'log') {
					return plot.term2 ? 'none' : 'inline-block'
				} else if (d.value == 'pct') {
					return plot.term2 ? 'inline-block' : 'none'
				} else {
					return 'inline-block'
				}
			})
		}
	}

	if (opts.debug) api.Inner = self
	return Object.freeze(api)
}

function setViewOpts(opts) {
	const self = {
		dom: {
			row: opts.holder,
			labelTd: opts.holder
				.append('td')
				.html('Display mode')
				.attr('class', 'sja-termdb-config-row-label'),
			inputTd: opts.holder.append('td')
		}
	}

	self.radio = initRadioInputs({
		name: 'pp-termdb-display-mode', // elemName
		holder: self.dom.inputTd,
		options: [
			{ label: 'Barchart', value: 'barchart' },
			{ label: 'Table', value: 'table' },
			{ label: 'Boxplot', value: 'boxplot' },
			{ label: 'Scatter', value: 'scatter' }
		],
		listeners: {
			input(d) {
				const currViews = d.value == 'barchart' ? ['barchart', 'stattable'] : [d.value]
				opts.dispatch({
					type: 'plot_edit',
					id: opts.id,
					config: {
						settings: { currViews }
					}
				})
			}
		}
	})

	const api = {
		main(plot) {
			self.dom.row.style('display', plot.term2 ? 'table-row' : 'none')
			const currValue = plot.settings.currViews.includes('table')
				? 'table'
				: plot.settings.currViews.includes('boxplot')
				? 'boxplot'
				: plot.settings.currViews.includes('scatter')
				? 'scatter'
				: 'barchart'

			const numericTypes = ['integer', 'float']

			self.radio.main(currValue)
			self.radio.dom.divs.style('display', d =>
				d.value == 'barchart'
					? 'inline-block'
					: d.value == 'table' && plot.term2
					? 'inline-block'
					: d.value == 'boxplot' && plot.term2 && numericTypes.includes(plot.term2.term.type)
					? 'inline-block'
					: d.value == 'scatter' &&
					  numericTypes.includes(plot.term.term.type) &&
					  plot.term2 &&
					  numericTypes.includes(plot.term2.term.type)
					? 'inline-block'
					: 'none'
			)
		}
	}

	if (opts.debug) api.Inner = self
	return Object.freeze(api)
}
