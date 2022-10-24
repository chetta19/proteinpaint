import { getCompInit } from '../rx'
import { controlsInit } from './controls'
import { select } from 'd3-selection'
import { axisLeft, axisBottom } from 'd3-axis'
import { scaleLinear, scaleBand } from 'd3-scale'
import { extent } from 'd3-array'
import { area, curveBumpY } from 'd3-shape'

class ViolinPlot {
	constructor(opts) {
		this.type = 'violin'
		setRenderers(this)
		// getLegendGrps(this)
	}

	async init() {
		this.dom = {
			controls: this.opts.holder
				.append('div')
				.attr('class', 'sjpp-plot-controls')
				.style('display', 'inline-block'),

			holder: this.opts.holder
				.append('div')
				.style('display', 'inline-block')
				.style('padding', '10px')
				.style('overflow-x', 'auto')
				.style('max-width', '70vw')
				.style('scrollbar-width', 'none')
		}

		this.components = {
			controls: await controlsInit({
				app: this.app,
				id: this.id,
				holder: this.dom.controls,
				inputs: [
					{
						type: 'term1',
						// TODO: when used under the summary chart, this.opts.usecase may replace the usecase here
						usecase: { target: 'violin', detail: 'term' }
					},
					{
						type: 'overlay',
						// TODO: when used under the summary chart, this.opts.usecase may replace the usecase here
						usecase: { target: 'violin', detail: 'term2' }
					},
					{
						label: 'Orientation',
						type: 'radio',
						chartType: 'violin',
						settingsKey: 'orientation',
						options: [{ label: 'Vertical', value: 'vertical' }, { label: 'Horizontal', value: 'horizontal' }]
					}
				]
			})
		}
	}

	reactsTo(action) {
		if (action.type.startsWith('plot_')) {
			return action.id === this.id && (!action.config.childType || action.config.childType == this.type)
		}
		return true
	}

	getState(appState) {
		const config = appState.plots.find(p => p.id === this.id)
		if (!config) {
			throw `No plot with id='${this.id}' found. Did you set this.id before this.api = getComponentApi(this)?`
		}

		return {
			genome: appState.vocab.genome,
			dslabel: appState.vocab.dslabel,
			nav: appState.nav,
			termfilter: appState.termfilter,
			config,
			bar_click_menu: appState.bar_click_menu || {},
			// optional
			activeCohort: appState.activeCohort,
			termdbConfig: appState.termdbConfig
		}
	}

	async main() {
		this.config = this.state.config
		if (this.dom.header)
			this.dom.header.html(
				this.config.term.term.name + ` <span style="opacity:.6;font-size:1em;margin-left:10px;">Violin Plot</span>`
			)

		this.data = await this.app.vocabApi.getViolinPlotData({
			termid: this.config.term.term.id,
			term2: this.config.term2
		})
		this.render()
	}
}

export const violinInit = getCompInit(ViolinPlot)
export const componentInit = violinInit

async function setRenderers(self) {
	self.render = function() {
		const t2 = self.config.term2
		const termName = self.config.term.term.name

		if (self.data.length == 0) {
			self.dom.holder.html(
				` <span style="opacity:.6;font-size:1em;margin-left:90px;">No data to render Violin Plot</span>`
			)
			return
		}

		const groups = [],
			yScaleValues = []

		for (const key of self.data) {
			let label =
				t2 != null && t2.term.values != undefined && Object.keys(t2.term.values).length > 0
					? t2.term.values[key.label]?.label
					: key.label

			if (key.yScaleValues) {
				label = `${label} (${key.yScaleValues.length})`
			}
			groups.push(label)

			yScaleValues.push(...key.yScaleValues)
		}

		// Render the violin plot
		const margin = { top: 50, right: 100, bottom: 50, left: 110 },
			height = 700 - margin.top - margin.bottom,
			width =
				(groups.length < 2
					? groups.length * 600
					: groups.length >= 2 && groups.length < 4
					? groups.length * 400
					: groups.length * 300) -
				margin.left -
				margin.right

		// append the svg object to the body of the page
		select('.sjpp-violin-plot').remove()
		self.dom.holder.text('')

		let svg = self.dom.holder
			.append('svg')
			.attr('width', width + margin.left + margin.right)
			.attr('height', height)
			.classed('sjpp-violin-plot', true)
			.append('g')
			.attr('transform', 'translate(' + margin.left + ',' + margin.top + ')')

		const boundsWidth = width - margin.right - margin.left,
			boundsHeight = height - margin.top - margin.bottom

		const xScale = scaleBand()
			.range([0, boundsWidth])
			.domain(groups)
			.padding(0.3)

		svg
			.append('g')
			.attr('transform', 'translate(0,' + 520 + ')')
			.call(axisBottom(xScale))

		svg.select('.domain').remove()
		svg.selectAll('line').remove()

		const yScale = scaleLinear()
			.domain(extent([...yScaleValues]))
			.range([boundsHeight, 0])

		svg.append('g').call(axisLeft(yScale))

		svg.selectAll('text').style('font-size', '15px')

		//create y axis label
		svg
			.append('text')
			.attr('transform', 'rotate(-90)')
			.attr('y', 0 - margin.left)
			.attr('x', 0 - height / 2.2)
			.attr('dy', '1em')
			.style('text-anchor', 'middle')
			.text(termName)

		// // Add x axis label
		// if(t2 != null && t2.term.name != null && t2.term.name != undefined) {
		// 	svg.append("text")
		// 	.attr("class", "x label")
		// 	.attr("text-anchor", "front")
		// 	.attr('dy', '1em')
		// 	.attr("x", -110)
		// 	.attr("y", boundsHeight + 20)
		// 	.text(`${t2.term.name}`);
		// }

		for (const key of self.data) {
			let label =
				t2 != null && t2.term.values != undefined && Object.keys(t2.term.values).length > 0
					? t2.term.values[key.label]?.label
					: key.label

			if (key.yScaleValues) {
				label = `${label} (${key.yScaleValues.length})`
			}

			const wScale = scaleLinear()
				.domain([-key.biggestBin, key.biggestBin])
				.range([0, xScale.bandwidth()])

			const areaBuilder = area()
				.x0(d => wScale(-d.lst.length))
				.x1(d => wScale(d.lst.length))
				.y(d => yScale(d.x0))
				.curve(curveBumpY)

			svg
				.selectAll('myViolin')
				.data(self.data)
				.enter() // So now we are working group per group
				.append('g')
				.attr('transform', function(d) {
					return 'translate(' + xScale(label) + ' ,0)'
				}) // Translation on the right to be at the group position
				.append('path')
				// .style("fill",function() {
				// 	return "hsl(" + Math.random() * 360 + ",100%,90%)";
				// 	})
				.datum(function(d) {
					return d.lst
				}) // So now we are working bin per bin
				.style('stroke', 'navy')
				.style('fill', '#dfdef0')
				.style('padding', 5)
				.style('opacity', 0.7)
				.attr('d', areaBuilder(key.bins))
		}
	}
}

async function getLegendGrps(self) {
	self.opts.dom.legendDiv.style('display', 'block')
	const t2 = self.config.term2
	// const headingStyle = 'color: #aaa; font-weight: 400'

	//add header to the legend div
	if (t2 != null && t2 != undefined) {
		const legendTitle = self.config.term2.term.name

		const holder = self.opts.dom.legendDiv
			.append('div')
			.classed('sjpp-legend-div', true)
			.style('display', 'block')

		holder
			.append('span')
			.style('color', '#aaa')
			.style('font-weight', '400')
			.text(legendTitle)

		for (const key of self.data) {
			let label =
				t2 != null && t2.term.values != undefined && Object.keys(t2.term.values).length > 0
					? t2.term.values[key.label].label
					: key.label

			if (key.yScaleValues) {
				label = `${label}, n = ${key.yScaleValues.length}`
			}

			holder
				.append('div')
				.style('display', 'block')
				.append('span')
				.text(label)
		}
	} else {
		self.opts.dom.violinLegendDiv.selectAll('*').remove()
	}
	return
}

export async function getPlotConfig(opts, app) {
	if (!opts.term) throw 'violin getPlotConfig: opts.term{} missing'
	try {
		await fillTermWrapper(opts.term, app.vocabApi)
		if (opts.term2) await fillTermWrapper(opts.term2, app.vocabApi)
		if (opts.term0) await fillTermWrapper(opts.term0, app.vocabApi)
	} catch (e) {
		throw `${e} [violin getPlotConfig()]`
	}

	const config = {
		id: opts.term.term.id,
		settings: {
			controls: {
				isOpen: false, // control panel is hidden by default
				term2: null, // the previous overlay value may be displayed as a convenience for toggling
				term0: null
			},
			// common: {
			// 	use_logscale: false, // flag for y-axis scale type, 0=linear, 1=log
			// 	use_percentage: false,
			// 	barheight: 300, // maximum bar length
			// 	barwidth: 20, // bar thickness
			// 	barspace: 2 // space between two bars
			// },
			violin: {
				orientation: 'horizontal',
				// unit: 'abs',
				// overlay: 'none',
				// divideBy: 'none',
				rowlabelw: 250
			}
		}
	}

	// may apply term-specific changes to the default object
	return copyMerge(config, opts)
}
