import * as rx from '../common/rx.core'
import * as client from '../client'
import { event as d3event } from 'd3-selection'
import { scaleLinear, scaleLog, scaleOrdinal, schemeCategory10, schemeCategory20 } from 'd3-scale'
import { format as d3format } from 'd3-format'
import { axisLeft } from 'd3-axis'

class TdbBoxplot {
	constructor(app, opts) {
		this.type = 'boxplot'
		this.id = opts.id
		this.app = app
		this.api = rx.getComponentApi(this)

		const div = opts.holder.style('display', 'none')
		const svg = div
			.append('svg')
			.style('margin-right', '20px')
			.style('display', 'inline-block')
		this.dom = {
			div,
			svg,
			yaxis_g: svg.append('g'), // for y axis
			graph_g: svg.append('g') // for bar and label of each data item
		}

		setRenderers(this)
		this.eventTypes = ['postInit', 'postRender']
	}

	main(data) {
		if (data) this.data = data
		this.config = rx.copyMerge('{}', this.state.config)
		if (!this.state.isVisible) {
			this.dom.div.style('display', 'none')
			return
		}
		const t2 = this.config.term2
		if (!t2 || !t2.term.isfloat) {
			this.dom.div.style('display', 'none')
			throw `${t2 ? 'numeric ' : ''}term2 is required for boxplot view`
		}
		const [lst, binmax] = this.processData(this.data)
		this.dom.div.style('display', 'block')
		this.render(lst.filter(d => d != null), binmax)
	}

	processData(data) {
		const column_keys = data.refs.rows
		let binmax = 0
		const lst = data.refs.cols.map(t1 => {
			const d = data.charts[0].serieses.find(d => d.seriesId == t1)
			if (!d) return null
			if (binmax < d.max) binmax = d.max
			return {
				label: t1,
				vvalue: t1,
				value: d.total,
				boxplot: d.boxplot
			}
		})
		return [lst, binmax]
	}

	download() {
		if (!this.state.isVisible) return
		const svg_name = this.config.term.term.name + ' boxplot'
		client.to_svg(this.dom.svg.node(), svg_name, { apply_dom_styles: true })
	}
}

function setRenderers(self) {
	self.render = function(lst, binmax) {
		self.items = lst
		self.config.settings.boxplot.yscale_max = binmax
		const sc = self.config.settings.common
		const s = self.config.settings.boxplot
		const max_label_height = self.get_max_labelheight(s)

		// space for boxplot
		// let box_plot_space = (self.boxplot) ?  30 : 4
		const box_plot_space = 4
		// define svg height and width
		const svg_width = self.items.length * (s.barwidth + s.barspace) + s.yaxis_width
		const svg_height = s.toppad + s.barheight + max_label_height + box_plot_space
		self.y_scale = scaleLinear()
			.domain([s.yscale_max, 0])
			.range([0, s.barheight])

		self.dom.svg
			.transition()
			.attr('width', svg_width)
			.attr('height', svg_height)

		// Y axis
		self.dom.yaxis_g
			.attr('transform', 'translate(' + (s.yaxis_width - 2) + ',' + s.toppad + ')')
			.transition()
			.call(
				axisLeft()
					.scale(self.y_scale)
					// .tickFormat(d3format('d'))
					.ticks(10, d3format('d'))
			)

		client.axisstyle({
			axis: self.dom.yaxis_g,
			showline: true,
			fontsize: s.barwidth * 0.8,
			color: 'black'
		})

		// if is stacked-bar, need to get color mapping for term2 values
		let term2valuecolor
		if (self.items[0].lst) {
			// may need a better way of deciding if it is two-term crosstabulate
			// to get all values for term2
			const term2values = new Set()
			for (const i of self.items) {
				for (const j of i.lst) {
					term2values.add(j.label)
				}
			}
			if (term2values.size > 10) {
				term2valuecolor = scaleOrdinal(schemeCategory20)
			} else {
				term2valuecolor = scaleOrdinal(schemeCategory10)
			}
		}

		// plot each bar
		let x = s.yaxis_width + s.barspace + s.barwidth / 2

		self.dom.graph_g
			.attr('transform', 'translate(' + x + ',' + (s.toppad + s.barheight) + ')')
			.selectAll('*')
			.remove()

		self.items.forEach((item, itemidx) => {
			if (!item.boxplot) return
			const g = self.dom.graph_g
				.append('g')
				.datum(item)
				.attr('transform', 'translate(' + itemidx * (s.barwidth + s.barspace) + ',0)')

			// X axis labels
			const xlabel = g
				.append('text')
				.text(item.label)
				.attr('transform', 'translate(0,' + box_plot_space + ') rotate(-65)')
				.attr('text-anchor', 'end')
				.attr('font-size', s.label_fontsize)
				.attr('font-family', client.font)
				.attr('dominant-baseline', 'central')

			let x_lab_tip = ''

			//this is for boxplot for 2nd numerical term
			if ('w1' in item.boxplot) {
				g.append('line')
					.attr('x1', 0)
					.attr('y1', self.y_scale(item.boxplot.w1) - s.barheight)
					.attr('x2', 0)
					.attr('y2', self.y_scale(item.boxplot.w2) - s.barheight)
					.attr('stroke-width', 2)
					.attr('stroke', 'black')

				g.append('rect')
					.attr('x', -s.barwidth / 2)
					.attr('y', self.y_scale(item.boxplot.p75) - s.barheight)
					.attr('width', s.barwidth)
					.attr(
						'height',
						s.barheight -
							self.y_scale(sc.use_logscale ? item.boxplot.p75 / item.boxplot.p25 : item.boxplot.p75 - item.boxplot.p25)
					)
					.attr('fill', '#901739')
					.on('mouseover', () => {
						self.app.tip
							.clear()
							.show(d3event.clientX, d3event.clientY)
							.d.append('div')
							.html(
								`<table class='sja_simpletable'>
	                <tr>
	                  <td style='padding: 3px; color:#aaa'>${self.config.term.term.name}</td>
	                  <td style='padding: 3px'>${item.label}</td>
	                </tr>
	                <tr>
	                  <td style='padding: 3px; color:#aaa'>Mean</td>
	                  <td style='padding: 3px'>${item.boxplot.mean.toPrecision(4)}</td>
	                </tr>
	                <tr>
	                  <td style='padding: 3px; color:#aaa'>Median</td>
	                  <td style='padding: 3px'>${item.boxplot.p50.toPrecision(4)}</td>
	                </tr>
	                <tr>
	                  <td style='padding: 3px; color:#aaa'>1st to 3rd Quartile</td>
	                  <td style='padding: 3px'>${item.boxplot.p25.toPrecision(4)} to ${item.boxplot.p75.toPrecision(4)}</td>
	                </tr>
	                <tr>
	                  <td style='padding: 3px; color:#aaa'>Std. Deviation</td>
	                  <td style='padding: 3px'>${item.boxplot.sd.toPrecision(4)}</td>
	                </tr>
	              </table>`
							)
					})
					.on('mouseout', () => self.app.tip.hide())

				g.append('line')
					.attr('x1', -s.barwidth / 2.2)
					.attr('y1', self.y_scale(item.boxplot.w1) - s.barheight)
					.attr('x2', s.barwidth / 2.2)
					.attr('y2', self.y_scale(item.boxplot.w1) - s.barheight)
					.attr('stroke-width', 2)
					.attr('stroke', 'black')

				g.append('line')
					.attr('x1', -s.barwidth / 2.2)
					.attr('y1', self.y_scale(item.boxplot.p50) - s.barheight)
					.attr('x2', s.barwidth / 2.2)
					.attr('y2', self.y_scale(item.boxplot.p50) - s.barheight)
					.attr('stroke-width', 1.5)
					.attr('stroke', 'white')

				g.append('line')
					.attr('x1', -s.barwidth / 2.2)
					.attr('y1', self.y_scale(item.boxplot.w2) - s.barheight)
					.attr('x2', s.barwidth / 2.2)
					.attr('y2', self.y_scale(item.boxplot.w2) - s.barheight)
					.attr('stroke-width', 2)
					.attr('stroke', 'black')
			}

			for (const outlier of item.boxplot.out) {
				g.append('circle')
					.attr('cx', 0)
					.attr('cy', self.y_scale(outlier.value) - s.barheight)
					.attr('r', 2)
					.attr('fill', '#901739')
					.on('mouseover', () => {
						self.app.tip
							.clear()
							.show(d3event.clientX, d3event.clientY)
							.d.append('div')
							.html(self.config.term2.term.name + ' ' + outlier.value.toPrecision(4))
					})
					.on('mouseout', () => {
						self.app.tip.hide()
					})
			}
			// x-label tooltip
			if (item.lst) {
				xlabel
					.on('mouseover', () => {
						self.app.tip
							.clear()
							.show(d3event.clientX, d3event.clientY)
							.d.append('div')
							.html(
								self.config.term.term.name +
									': ' +
									item.label +
									'<br>' +
									'# patients: ' +
									item.value +
									'<br>' +
									x_lab_tip
							)
					})
					.on('mouseout', () => {
						self.app.tip.hide()
					})
			} else {
				xlabel
					.on('mouseover', () => {
						self.app.tip
							.clear()
							.show(d3event.clientX, d3event.clientY)
							.d.append('div')
							.html(self.config.term.term.name + ': ' + item.label + '<br>' + '# patients: ' + item.value)
					})
					.on('mouseout', () => {
						self.app.tip.hide()
					})
			}
		})
	}

	self.get_max_labelheight = function(s) {
		let textwidth = 0
		for (const i of self.items) {
			self.dom.svg
				.append('text')
				.text(i.label)
				.attr('font-family', client.font)
				.attr('font-size', s.label_fontsize)
				.each(function() {
					textwidth = Math.max(textwidth, this.getBBox().width)
				})
				.remove()
		}

		return textwidth
	}
}

export const boxplotInit = rx.getInitFxn(TdbBoxplot)
