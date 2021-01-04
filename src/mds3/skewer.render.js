import { select as d3select, event as d3event } from 'd3-selection'
import { arc as d3arc } from 'd3-shape'
import { axisTop, axisLeft, axisRight } from 'd3-axis'
import { scaleLinear } from 'd3-scale'
import { makeTk } from './makeTk'
import { update as update_legend } from './legend'
import { itemtable, mlst2samplesummary } from './itemtable'
import * as common from '../common'
import * as client from '../client'

const modefold = 0
const modeshow = 1
const middlealignshift = 0.3
const disclabelspacing = 1 // px spacing between disc and label
const minoccur4sunburst = 5 // minimum occurrence for showing skewer, maybe ds specific

/*
sets tk.skewer.maxheight
*/
export function skewer_make(tk, block) {
	const color4disc = m => {
		if (tk.vcfinfofilter && tk.vcfinfofilter.setidx4mclass != undefined) {
			const mcset = tk.vcfinfofilter.lst[tk.vcfinfofilter.setidx4mclass]

			const [err, vlst] = getter_mcset_key(mcset, m)

			if (err || vlst == undefined) return 'black'

			for (const v of vlst) {
				// no choice but simply use first value to ever have a valid color
				if (mcset.categories[v]) {
					return mcset.categories[v].color
				} else {
					return 'black'
				}
			}
		}

		// mclass
		if (common.mclass[m.class]) {
			return common.mclass[m.class].color
		}
		return 'black'
	}

	const ss = tk.skewer

	for (const d of ss.data) {
		d.x0 = d.x
		if (d.xoffset != undefined) {
			d.x = d.x0 + d.xoffset
		}
		// updates x
		// create stack bars
		for (const g of d.groups) {
			g.aa = d // disc reference group
		}
	}

	const dotwidth = Math.max(14, block.width / 110)
	// create skewers for all data (single or multiple) and compute width

	// get max m count for discs, for scaling disc radius
	let mdc = 0
	for (const d of ss.data) {
		for (const g of d.groups) {
			mdc = Math.max(mdc, g.occurrence)
		}
	}
	let mrd = 0 // max disc radius
	const w = Math.pow(dotwidth / 2, 2) * Math.PI // unit area
	if (mdc <= 10) mrd = w * mdc * 0.9
	else if (mdc <= 100) mrd = w * 10
	else if (mdc <= 1000) mrd = w * 14
	else mrd = w * 20
	// scale for disc radius
	const sf_discradius = scaleLinear()
		.domain([1, mdc * 0.5, mdc * 0.6, mdc * 0.7, mdc * 0.8, mdc])
		.range([w, w + (mrd - w) * 0.8, w + (mrd - w) * 0.85, w + (mrd - w) * 0.9, w + (mrd - w) * 0.95, mrd])

	let globalmaxradius = dotwidth / 2
	ss.maxheight = 0
	for (const d of ss.data) {
		// determine dimension for this skewer, do not position or render yet
		// compute radius for each group
		if (d.showmode == undefined) {
			d.showmode = modefold
		} else {
			// has already been set by past data from genomic panning
		}
		d.maxradius = 0
		d.maxrimwidth = 0
		d.width = 0
		d.slabelrotate = false
		d.slabelwidth = 0
		for (const r of d.groups) {
			if (r.occurrence == 1) {
				r.radius = dotwidth / 2
			} else {
				const digc = r.occurrence.toString().length
				r.radius = Math.max(Math.sqrt(sf_discradius(r.occurrence) / Math.PI), digc * 5)
			}
			d.maxradius = Math.max(d.maxradius, r.radius)
			globalmaxradius = Math.max(globalmaxradius, r.radius)

			r.rimwidth = r.rim1count + r.rim2count == 0 ? 0 : Math.max(2, r.radius / 6)
			d.maxrimwidth = Math.max(d.maxrimwidth, r.rimwidth)
		}
		let totalheight = 0
		for (const r of d.groups) {
			r.yoffset = totalheight + r.radius + r.rimwidth // immutable, y shift at expand mode
			totalheight += (r.radius + r.rimwidth) * 2
		}
		ss.maxheight = Math.max(ss.maxheight, totalheight)
	}

	ss.selection = ss.g
		.selectAll()
		.data(ss.data)
		.enter()
		.append('g')
		.attr('class', 'sja_skg')
		.each(function(d) {
			d.skewer = this
		})
	// disc containers
	const discg = ss.selection
		.selectAll()
		.data(d => d.groups)
		.enter()
		.append('g')
		.attr(
			'transform',
			d => 'translate(0,' + (d.aa.showmode == modefold ? 0 : d.yoffset * (tk.aboveprotein ? -1 : 1)) + ')'
		)
		.attr('class', 'sja_aa_discg')
		.each(function(d) {
			d.g = this
		})
	// actual disc
	const discdot = discg.append('circle')
	// full filled
	discdot
		.filter(d => d.dt == common.dtsnvindel || d.dt == common.dtsv || d.dt == common.dtfusionrna)
		.attr('fill', d => color4disc(d.mlst[0]))
		.attr('stroke', 'white')
		.attr('r', d => d.radius - 0.5)
	// masking half
	discg
		.filter(d => d.dt == common.dtfusionrna || d.dt == common.dtsv)
		.append('path')
		.attr('fill', 'white')
		.attr('stroke', 'none')
		.attr('d', d =>
			d3arc()({
				innerRadius: 0,
				outerRadius: d.radius - 2,
				startAngle: d.useNterm ? 0 : Math.PI,
				endAngle: d.useNterm ? Math.PI : Math.PI * 2
			})
		)
	// number in disc
	const textslc = discg
		.filter(d => d.occurrence > 1)
		.append('text')
		.text(d => d.occurrence)
		.attr('font-family', client.font)
		.attr('class', 'sja_aa_discnum')
		.attr('fill-opacity', d => (d.aa.showmode == modefold ? 0 : 1))
		.attr('stroke-opacity', d => (d.aa.showmode == modefold ? 0 : 1))
		.attr('text-anchor', 'middle')
		.each(d => {
			const s = d.radius * 1.5
			d.discnumfontsize = Math.min(s / (d.occurrence.toString().length * client.textlensf), s)
		})
		.attr('font-size', d => d.discnumfontsize)
		.attr('y', d => d.discnumfontsize * middlealignshift)
	textslc.filter(d => d.dt == common.dtsnvindel).attr('fill', 'white')
	textslc
		.filter(d => d.dt == common.dtsv || d.dt == common.dtfusionrna)
		.attr('stroke', d => color4disc(d.mlst[0]))
		.attr('stroke-width', 0.8)
		.attr('font-weight', 'bold')
		.attr('fill', 'white')
	// right-side label
	const textlab = discg
		.append('text')
		.text(d => d.mlst[0].mname)
		.attr('font-size', d => {
			d._labfontsize = Math.max(12, d.radius * 1.2)
			return d._labfontsize
		})
		.each(function(d) {
			// after setting font size, set skewer width by label width
			const lw = this.getBBox().width
			d._label_width = lw
			if (d.aa.groups.length == 1) {
				d.aa.slabelrotate = true
				d.aa.slabelwidth = lw
				// skewer has single disc, label may rotate up, thus should be considerred in skewer maxheight
				ss.maxheight = Math.max(ss.maxheight, (d.radius + d.rimwidth) * 2 + 2 + lw)
			}
		})
		.attr('fill', d => color4disc(d.mlst[0]))
		.attr('x', d => d.radius + d.rimwidth + 1)
		.attr('y', d => d._labfontsize * middlealignshift)
		.attr('font-family', client.font)
		.classed('sja_aa_disclabel', true)
		.attr('fill-opacity', d => (d.aa.showmode == modefold ? 0 : 1))
		.attr('transform', 'scale(1) rotate(0)')
		.on('mousedown', () => {
			d3event.stopPropagation()
		})
		.on('click', d => {
			fold_glyph([d.aa], tk)
			unfold_update(tk, block)
		})

	if (tk.hlaachange) {
		// special effect for highlighted variants
		//const big=1.3
		textlab.filter(d => tk.hlaachange.has(d.mlst[0].mname)).classed('sja_pulse', true)
	}

	// skewer width
	for (const d of ss.data) {
		let leftw = 0,
			rightw = 0
		for (const g of d.groups) {
			leftw = Math.max(leftw, g.radius + g.rimwidth)
			rightw = Math.max(rightw, g.radius + g.rimwidth + disclabelspacing + g._label_width)
		}
		d.width = leftw + rightw
	}

	// invisible kicking disc cover
	discg
		.append('circle')
		.attr('r', d => d.radius - 0.5)
		.attr('stroke', d => color4disc(d.mlst[0]))
		.attr('class', 'sja_aa_disckick')
		.attr('fill', 'white')
		.attr('fill-opacity', 0)
		.attr('stroke-opacity', 0)
		.on('mousedown', () => {
			d3event.stopPropagation()
		})
		.on('mouseover', d => {
			if (tk.disc_mouseover) {
				tk.disc_mouseover(d, d3event.target)
			}
		})
		.on('mouseout', d => {
			if (tk.disc_mouseout) {
				tk.disc_mouseout(d)
			}
		})
		.on('click', async d => {
			click_variants(d, tk, block, d3event.target.getBoundingClientRect())
		})

	// disc rims
	const rimfunc = d3arc()
		.innerRadius(d => d.radius)
		.outerRadius(d => d.radius + d.rimwidth)
		.startAngle(0)
		.endAngle(d => {
			d.rim1_startangle = (Math.PI * 2 * d.rim1count) / d.occurrence
			return d.rim1_startangle
		})
	discg
		.append('path')
		.attr('d', rimfunc)
		.attr('fill', d => color4disc(d.mlst[0]))
		.attr('class', 'sja_aa_discrim')
		.attr('fill-opacity', 0)
	const rimfunc2 = d3arc()
		.innerRadius(d => d.radius + 0.5)
		.outerRadius(d => d.radius + 0.5 + d.rimwidth)
		.startAngle(d => d.rim1_startangle)
		.endAngle(d => d.rim1_startangle + (Math.PI * 2 * d.rim2count) / d.occurrence)
	discg
		.filter(d => d.rim2count > 0)
		.append('path')
		.attr('d', rimfunc2)
		.attr('stroke', d => color4disc(d.mlst[0]))
		.attr('fill', 'none')
		.attr('class', 'sja_aa_discrim')
		.attr('stroke-opacity', 0)
	// set stem lengths
	{
		// stem 1,2
		let lapcount = 0
		let lastx = 0
		for (const d of ss.data) {
			if (d.x - d.maxradius - d.maxrimwidth < lastx) {
				lapcount++
			}
			lastx = Math.max(lastx, d.x + d.width - d.maxradius - d.maxrimwidth)
		}
		// stem1
		ss.stem1 = lapcount == 0 ? 0 : dotwidth
		// stem2
		ss.stem2 = scaleLinear()
			.domain([0, 1, ss.data.length])
			.range([0, dotwidth, dotwidth * 3])(lapcount)
	}
	// stem3
	const hbaseline = dotwidth * 0.7
	// to set stem3, get max group size
	let maxm = 0
	for (const d of ss.data) {
		for (const g of d.groups) {
			maxm = Math.max(maxm, g.occurrence)
		}
	}
	ss.stem3 = Math.max(2, hbaseline + dotwidth * Math.min(5, maxm))
	// invisible kicking skewer cover when folded
	ss.selection
		.append('circle')
		.attr('class', 'sja_aa_skkick')
		.attr('fill', 'white')
		.attr('fill-opacity', 0)
		.attr('stroke', 'none')
		.attr('r', d => d.maxradius + 1)
		.attr('cy', d => (tk.aboveprotein ? -1 : 1) * d.maxradius)
		.attr('transform', d => 'scale(' + (d.showmode == modefold ? 1 : 0) + ')')
		.on('mouseover', d => {
			const abp = tk.aboveprotein
			let cumh = 0
			let boxw = 0
			const hpad = 5
			const tiph = abp ? 7 : 14
			for (const g of d.groups) {
				g.pica_fontsize = Math.max(11, g.radius)
				cumh += g.pica_fontsize + 1
				tk.pica.g
					.append('text')
					.text(g.mlst[0].mname + (g.occurrence > 1 ? ' x' + g.occurrence : ''))
					.attr('font-size', g.pica_fontsize)
					.each(function() {
						boxw = Math.max(boxw, this.getBBox().width)
					})
					.remove()
			}
			boxw += hpad * 2
			const boxh = cumh + 5
			tk.pica.g
				.append('rect')
				.attr('y', abp ? -boxh : 0)
				.attr('width', boxw)
				.attr('height', boxh)
				.attr('fill', 'white')
				.attr('fill-opacity', 0.8)
				.attr('stroke', '#ccc')
				.attr('shape-rendering', 'crispEdges')
			cumh = 0
			const _g = tk.pica.g
				.selectAll()
				.data(d.groups)
				.enter()
				.append('g')
				.attr('transform', (g, i) => {
					cumh += g.pica_fontsize + 1
					return 'translate(' + hpad + ',' + cumh * (abp ? -1 : 1) + ')'
				})
			_g.append('text')
				.text(g => g.mlst[0].mname)
				.attr('font-size', g => g.pica_fontsize)
				.each(function(g) {
					g.pica_mlabelwidth = this.getBBox().width
				})
				.attr('fill', d => color4disc(d.mlst[0]))
				.attr('dominant-baseline', abp ? 'hanging' : 'auto')
			const firstlabw = d.groups[0].pica_mlabelwidth
			tk.pica.x = d.x - hpad - firstlabw / 2
			tk.pica.y = d.y + (abp ? -1 : 1) * (d.maxradius * 2 + tiph + 2)
			tk.pica.g.attr('transform', 'translate(' + tk.pica.x + ',' + tk.pica.y + ')')
			_g.filter(g => g.occurrence > 1)
				.append('text')
				.text(g => 'x' + g.occurrence)
				.attr('x', g => g.pica_mlabelwidth + 5)
				.attr('font-size', g => g.pica_fontsize)
				.attr('dominant-baseline', abp ? 'hanging' : 'auto')
				.attr('fill', '#9e9e9e')
			const handle = tk.pica.g
				.append('g')
				.attr('transform', 'translate(' + (hpad + firstlabw / 2) + ',' + (abp ? 1 : -1) + ')')
			handle
				.append('line')
				.attr('y2', (abp ? 1 : -1) * tiph)
				.attr('stroke', '#858585')
				.attr('shape-rendering', 'crispEdges')
			handle
				.append('line')
				.attr('x1', -1)
				.attr('x2', -1)
				.attr('y2', (abp ? 1 : -1) * tiph)
				.attr('stroke', 'white')
				.attr('shape-rendering', 'crispEdges')
			handle
				.append('line')
				.attr('x1', 1)
				.attr('x2', 1)
				.attr('y2', (abp ? 1 : -1) * tiph)
				.attr('stroke', 'white')
				.attr('shape-rendering', 'crispEdges')
		})
		.on('mouseout', d => {
			tk.pica.g.selectAll('*').remove()
		})
		.on('click', d => {
			tk.pica.g.selectAll('*').remove()
			unfold_glyph([d], tk, block)
		})
	// set fold y offset
	// get max mcount for skewers
	let mm = 0
	for (const d of ss.data) {
		mm = Math.max(mm, d.occurrence)
	}
	const sf_foldyoff = scaleLinear()
		.domain([1, mm])
		.range([hbaseline, ss.stem3 - globalmaxradius])
	ss.selection.attr('transform', d => {
		d.foldyoffset = sf_foldyoff(d.occurrence)
		d.y = skewer_sety(d, tk)
		return 'translate(' + d.x + ',' + d.y + ')'
	})
	// no stackbars
	// stem
	ss.selection
		.append('path')
		.attr('class', 'sja_aa_stem')
		.attr('d', d => skewer_setstem(d, tk))
		.attr('stroke', d => color4disc(d.groups[0].mlst[0]))
		.attr('fill', 'none')
	// ssk: only for skewers with >1 groups
	const mgsk = ss.selection.filter(d => d.groups.length > 1)
	mgsk
		.append('rect')
		.attr('class', 'sja_aa_ssk_bg')
		.attr('shape-rendering', 'crispEdges')
		.attr('fill-opacity', 0)
		.attr('height', ss.stem1)
		.attr('fill', d => color4disc(d.groups[0].mlst[0]))
		.attr('width', d => {
			d.ssk_width = Math.max(d.occurrence.toString().length * 8 + 6, 2 * (d.maxradius + d.maxrimwidth))
			return d.ssk_width
		})
		.attr('x', d => -d.ssk_width / 2)
	mgsk
		.append('text')
		.attr('class', 'sja_aa_ssk_text')
		.attr('fill', 'white')
		.attr('fill-opacity', 0)
		.attr('font-weight', 'bold')
		.attr('text-anchor', 'middle')
		.attr('dominant-baseline', 'central')
		.text(d => d.occurrence)
		.each(d => {
			d.ssk_fontsize = Math.min(ss.stem1, d.ssk_width / (d.occurrence.toString().length * client.textlensf))
		})
		.attr('font-size', d => d.ssk_fontsize)
	// ssk - kick
	mgsk
		.append('rect')
		.attr('class', 'sja_aa_ssk_kick')
		.attr('fill', 'white')
		.attr('fill-opacity', 0)
		.attr('stroke', 'none')
		.attr('height', ss.stem1)
		.attr('x', d => -d.ssk_width / 2)
		.attr('width', d => d.ssk_width)
		.on('mouseover', d => {
			const p = d3select(d3event.target.parentNode)
			p.selectAll('.sja_aa_disckick')
				.transition()
				.attr('stroke-opacity', 1)
			p.select('.sja_aa_ssk_bg')
				.transition()
				.attr('fill-opacity', 1)
				.attr('stroke-opacity', 1)
			p.select('.sja_aa_ssk_text')
				.transition()
				.attr('fill-opacity', 1)
		})
		.on('mouseout', function(d) {
			const p = d3select(d3event.target.parentNode)
			p.selectAll('.sja_aa_disckick')
				.transition()
				.attr('stroke-opacity', 0)
			p.select('.sja_aa_ssk_bg')
				.transition()
				.attr('fill-opacity', 0)
				.attr('stroke-opacity', 0)
			p.select('.sja_aa_ssk_text')
				.transition()
				.attr('fill-opacity', 0)
		})
		.on('click', async d => {
			click_variants(d, tk, block, d3event.target.getBoundingClientRect())
		})
}

function skewer_sety(d, tk) {
	if (tk.aboveprotein) {
		if (d.showmode == modefold) {
			return tk.skewer.maxheight + tk.skewer.stem1 + tk.skewer.stem2 + tk.skewer.stem3 - d.foldyoffset
		}
		return tk.skewer.maxheight
	}
	if (d.showmode == modefold) return d.foldyoffset
	return tk.skewer.stem1 + tk.skewer.stem2 + tk.skewer.stem3
}

function skewer_setstem(d, tk) {
	if (tk.aboveprotein) {
		if (d.showmode == modefold) {
			return 'M0,0v0l0,0v' + d.foldyoffset
		}
		return 'M0,0v' + tk.skewer.stem1 + 'l' + (d.x0 - d.x) + ',' + tk.skewer.stem2 + 'v' + tk.skewer.stem3
	}
	if (d.showmode == modefold) {
		return 'M0,0v0l0,0v-' + d.foldyoffset
	}
	return 'M0,0v-' + tk.skewer.stem1 + 'l' + (d.x0 - d.x) + ',-' + tk.skewer.stem2 + 'v-' + tk.skewer.stem3
}

export function settle_glyph(tk, block) {
	if (tk.skewer.data.length == 0) return
	const x1 = 0
	const x2 = block.width
	// only settle those in view range
	// sum of skewer width, determines whether full or pack
	let sumwidth = 0
	const allinview = []
	const beyondviewitems = []
	for (const d of tk.skewer.data) {
		if (d.x0 < x1 || d.x0 > x2) {
			delete d.xoffset
			beyondviewitems.push(d)
		} else {
			// important: singleton label is rotated by default, must not include label width
			sumwidth += d.slabelrotate ? (d.groups[0].radius + d.groups[0].rimwidth) * 2 : d.width
			allinview.push(d)
		}
	}

	// reset those beyond view range
	fold_glyph(beyondviewitems, tk)
	// TODO may move d.x to +/-1000 out of sight

	let expandlst = []
	const foldlst = []

	if (sumwidth < x2 - x1) {
		// skewers can show in full
		expandlst = allinview
	} else {
		// rank skewers by ...
		allinview.sort((a, b) => {
			if (b.occurrence == a.occurrence) {
				if (b.groups.length == a.groups.length) {
					//return Math.abs(a.aapos*2-aarangestart-aarangestop)-Math.abs(b.aaposition*2-aarangestart-aarangestop);
					return Math.abs(a.x0 * 2 - x1 - x2) - Math.abs(b.x0 * 2 - x1 - x2)
				} else {
					return b.groups.length - a.groups.length
				}
			}
			return b.occurrence - a.occurrence
		})
		// collect top items to expand
		let width = 0
		let allowpx = (x2 - x1) * 0.8
		let stop = false
		for (const d of allinview) {
			if (stop) {
				delete d.xoffset
				foldlst.push(d)
				d.showmode = modefold
			} else {
				if (width + d.width < allowpx) {
					expandlst.push(d)
					width += d.width
				} else {
					stop = true
					delete d.xoffset
					foldlst.push(d)
					d.showmode = modefold
				}
			}
		}
	}
	fold_glyph(foldlst, tk)
	unfold_glyph(expandlst, tk, block)
}

export function unfold_glyph(newlst, tk, block) {
	const dur = 1000
	const abp = tk.aboveprotein
	// set up new items
	const expanded = new Set() // d.x as key
	const folded = new Set()
	let hasfolded = false
	for (const d of newlst) {
		if (d.showmode == modeshow) {
			expanded.add(d.x0)
		} else {
			d.showmode = modeshow
			folded.add(d.x0)
			hasfolded = true
			d.y = skewer_sety(d, tk)
		}
	}
	if (hasfolded) {
		// vertical extending
		const set = tk.skewer.selection.filter(d => folded.has(d.x0))
		set
			.transition()
			.duration(dur)
			.attr('transform', d => 'translate(' + d.x + ',' + d.y + ')')
		set
			.selectAll('.sja_aa_discg')
			.transition()
			.duration(dur)
			.attr('transform', d => {
				d.y = d.yoffset * (abp ? -1 : 1)
				return 'translate(0,' + d.y + ')'
			})
		setTimeout(function() {
			set.selectAll('.sja_aa_disckick').attr('transform', 'scale(1)')
		}, dur)
		set
			.selectAll('.sja_aa_discnum')
			.transition()
			.duration(dur)
			.attr('fill-opacity', 1)
			.attr('stroke-opacity', 1)
		set
			.filter(d => d.groups.length > 1)
			.selectAll('.sja_aa_disclabel')
			.transition()
			.duration(dur)
			.attr('fill-opacity', 1)
			.attr('transform', 'scale(1)')
		set
			.selectAll('.sja_aa_discrim')
			.transition()
			.duration(dur)
			.attr('fill-opacity', 1)
			.attr('stroke-opacity', 1)
		set
			.selectAll('.sja_aa_ssk_kick')
			.attr('transform', 'scale(1)')
			.attr('y', abp ? 0 : -tk.skewer.stem1)
		set
			.selectAll('.sja_aa_ssk_bg')
			.attr('transform', 'scale(1)')
			.attr('y', abp ? 0 : -tk.skewer.stem1)
		set
			.selectAll('.sja_aa_ssk_text')
			.attr('transform', 'scale(1)')
			.attr('y', ((abp ? 1 : -1) * tk.skewer.stem1) / 2)
		set.selectAll('.sja_aa_skkick').attr('transform', 'scale(0)')
		let counter = 0
		set
			.selectAll('.sja_aa_stem')
			.transition()
			.duration(dur)
			.attr('d', d => skewer_setstem(d, tk))
			.each(() => ++counter)
			.on('end', () => {
				if (!--counter) {
					unfold_update(tk, block)
				}
			})
	} else {
		unfold_update(tk, block)
	}
}

function unfold_update(tk, block) {
	const dur = 1000
	const abp = tk.aboveprotein
	const alllst = [] // already expanded
	const hash = new Set() // d.x0 as key
	const x1 = 0
	const x2 = block.width
	for (const d of tk.skewer.data) {
		if (d.x0 < x1 || d.x0 > x2) continue
		if (d.showmode == modeshow) {
			d.x = d.x0
			alllst.push(d)
			hash.add(d.x0)
		}
	}
	if (alllst.length == 0) {
		return
	}
	horiplace(alllst, tk, block)
	for (const d of alllst) {
		d.xoffset = d.x - d.x0
	}
	for (let i = 0; i < alllst.length; i++) {
		const d = alllst[i]
		if (d.groups.length > 1) continue
		// single
		const disc = d.groups[0]
		if (tk.slabel_forcerotate) {
			d.slabelrotate = true
		} else {
			const next = alllst[i + 1]
			const rightx = next ? next.x - next.maxradius - next.maxrimwidth : x2
			d.slabelrotate = rightx - d.x - disc.radius - disc.rimwidth - 1 < d.slabelwidth
		}
		d.width = (disc.radius + disc.rimwidth) * 2 + (d.slabelrotate ? 0 : 2 + d.slabelwidth)
	}
	// horizontal shifting
	const set = tk.skewer.selection.filter(d => hash.has(d.x0))
	set
		.transition()
		.duration(dur)
		.attr('transform', d => 'translate(' + d.x + ',' + d.y + ')')
	set
		.selectAll('.sja_aa_stem')
		.transition()
		.duration(dur)
		.attr('d', d => skewer_setstem(d, tk))
	set
		.filter(d => d.groups.length == 1)
		.selectAll('.sja_aa_disclabel')
		.transition()
		.duration(dur)
		.attr('fill-opacity', 1)
		.attr('transform', d => 'scale(1) rotate(' + (d.aa.slabelrotate ? (abp ? '-' : '') + '90' : '0') + ')')
	tk.slabel_forcerotate = false
}

function horiplace(items, tk, block) {
	// only arrange those in aa view range
	const xoffset0 = 0
	const x2 = block.width
	let xoffset = xoffset0
	// those out of range are not touched
	// detect if any overlap
	let overlap = false
	for (const i of items) {
		if (i.x0 < xoffset0 || i.x0 > x2) continue
		if (i.groups.length == 1) {
			i.slabelrotate = true
			const disc = i.groups[0]
			i.width = (disc.radius + disc.rimwidth) * 2
		}
		const x = i.x - i.maxradius - i.maxrimwidth
		if (x < xoffset) {
			overlap = true
		}
		if (x + i.width > x2) {
			overlap = true
		}
		xoffset = Math.max(xoffset, x + i.width)
	}
	if (!overlap) {
		// nothing to do
		return false
	}
	// push and pack all to the left
	xoffset = xoffset0
	for (const i of items) {
		if (i.x0 < xoffset0 || i.x0 > x2) continue
		i.x = xoffset + i.maxradius + i.maxrimwidth
		xoffset += i.width
	}

	horiplace0(items, block.width)
}

function horiplace0(items, allwidth) {
	/*
	items[]
	.width
	.x0
	.x
		already set by pushing to left
	*/
	for (let i = 0; i < items.length; i++) {
		if (items[i].x0 < 0) continue
		if (items[i].x0 > allwidth) break

		while (1) {
			let currsum = 0,
				newsum = 0
			for (let j = i; j < items.length; j++) {
				const t = items[j]
				if (t.x0 > allwidth) {
					return
				}
				currsum += Math.abs(t.x - t.x0)
				t.x++
				newsum += Math.abs(t.x - t.x0)
			}
			if (items[i].x >= items[i].x0) {
				// wind back to make sure stem [i] stem is straight
				for (let j = i; j < items.length; j++) {
					items[j].x--
				}
				break
			}
			const z = items[items.length - 1]
			if (z.x + z.width / 2 >= allwidth) {
				return
			}
			if (newsum <= currsum) {
				// accept move
			} else {
				// reject move, procceed to next item
				for (let j = i; j < items.length; j++) {
					if (items[j].x0 > allwidth) {
						break
					}
					// wind back
					items[j].x--
				}
				break
			}
		}
	}
}

export function fold_glyph(lst, tk) {
	if (lst.length == 0) return
	const dur = 1000
	const abp = tk.aboveprotein
	// total number of discs, determines if disc details are visible prior to folding
	const hash = new Set()
	for (const d of lst) {
		d.x = d.x0
		hash.add(d.x0)
		d.showmode = modefold
		d.y = skewer_sety(d, tk)
	}
	const set = tk.skewer.selection.filter(d => hash.has(d.x0))
	set
		.transition()
		.duration(dur)
		.attr('transform', d => 'translate(' + d.x + ',' + d.y + ')')
	set
		.selectAll('.sja_aa_stem')
		.transition()
		.duration(dur)
		.attr('d', d => skewer_setstem(d, tk))
	set
		.selectAll('.sja_aa_discg')
		.transition()
		.duration(dur)
		.attr('transform', d => 'translate(0,' + (abp ? '-' : '') + d.aa.maxradius + ')')
	set.selectAll('.sja_aa_disckick').attr('transform', 'scale(0)')
	set
		.selectAll('.sja_aa_discnum')
		.transition()
		.duration(dur)
		.attr('fill-opacity', 0)
		.attr('stroke-opacity', 0)
	set
		.selectAll('.sja_aa_disclabel')
		.transition()
		.duration(dur)
		.attr('fill-opacity', 0)
		.attr('transform', 'scale(0)') // hide this label so it won't be tred
	set
		.selectAll('.sja_aa_discrim')
		.transition()
		.duration(dur)
		.attr('fill-opacity', 0)
		.attr('stroke-opacity', 0)
	set.selectAll('.sja_aa_ssk_kick').attr('transform', 'scale(0)')
	set.selectAll('.sja_aa_ssk_bg').attr('transform', 'scale(0)')
	set.selectAll('.sja_aa_ssk_text').attr('transform', 'scale(0)')
	set
		.selectAll('.sja_aa_skkick')
		.transition()
		.duration(dur) // to prevent showing pica over busy skewer
		.attr('transform', 'scale(1)')
}

export function getter_mcset_key(mcset, m) {
	/*
	get the key from an item (m) given a mcset

	returns list!!!

	*/
	if (mcset.altalleleinfo) {
		if (!m.altinfo) return ['no .altinfo']

		const value = m.altinfo[mcset.altalleleinfo.key]
		if (value == undefined) {
			// no value

			if (mcset.numericfilter) {
				// for alleles without AF_ExAC e.g. not seem in that population, treat value as 0
				// FIXME: only work for population frequency, assumption won't hold for negative values
				return [null, [0]]
			}

			return [null, undefined]
		}

		let vlst = Array.isArray(value) ? value : [value]

		if (mcset.altalleleinfo.separator) {
			// hardcoded separator for string
			vlst = vlst[0].split(mcset.altalleleinfo.separator)
		}
		return [null, vlst]
	}

	if (mcset.locusinfo) {
		if (!m.info) return ['no .info']

		const value = m.info[mcset.locusinfo.key]
		if (value == undefined) {
			// no value
			if (mcset.numericfilter) {
				// hard fix: for alleles without AF_ExAC e.g. not seem in that population, treat value as 0
				return [null, [0]]
			}
			return [null, undefined]
		}

		let vlst = Array.isArray(value) ? value : [value]

		if (mcset.locusinfo.separator) {
			vlst = vlst[0].split(mcset.locusinfo.separator)
		}
		return [null, vlst]
	}

	return ['no trigger']
}

/*
d: 
	if d.aa{}, is a group of skewer.data[0].groups[], and is one or multiple variants sharing the same mname (kras Q61H)
	else, is one of skewer.data[], variants may be of different data type
	both case, use d.mlst[] for full list
tk, block
tippos: suggested itemtip position, if not sunburst
*/
async function click_variants(d, tk, block, tippos) {
	try {
		if (d.occurrence >= minoccur4sunburst && tk.mds.variant2samples) {
			// sunburst
			tk.glider.style('cursor', 'wait')
			const data = await tk.mds.variant2samples.get(tk, d.mlst, tk.mds.variant2samples.type_sunburst)
			tk.glider.style('cursor', 'auto')
			const arg = {
				nodes: data,
				occurrence: d.occurrence,
				boxyoff: tk.yoff,
				boxheight: tk.height,
				boxwidth: block.width,
				svgheight: Number.parseFloat(block.svg.attr('height')),
				g: tk.skewer.g.append('g'),
				pica: tk.pica,
				chartlabel: d.mlst[0].mname + (d.mlst.length > 1 ? ' etc' : ''),
				click_listbutton: (x, y) => {
					variant_details(d.mlst, tk, block, tippos)
				}
			}
			if (d.aa) {
				arg.cx = d.aa.x
				arg.cy = skewer_sety(d, tk) + d.yoffset * (tk.aboveprotein ? -1 : 1)
			} else {
				arg.cx = d.x
				arg.cy = d.y + ((tk.aboveprotein ? 1 : -1) * tk.skewer.stem1) / 2
				// not to show list button in sunburst in case mlst has different data types
			}
			const _ = await import('../sunburst')
			_.default(arg)
			return
		}
		// no sunburst, no matter occurrence, show details
		await variant_details(d.mlst, tk, block, tippos)
	} catch (e) {
		block.error(e.message || e)
		if (e.stack) console.log(e.stack)
	}
}

/*
if items of mlst are of same type, show table view of the variant itself, plus the sample summary table
if of multiple data types, do not show variant table view; only show the sample summary table
should work with skewer and non-skewer data types
*/
async function variant_details(mlst, tk, block, tippos) {
	tk.itemtip.clear().show(tippos.left - 10, tippos.top - 10)
	// count how many dt
	const dtset = new Set()
	for (const m of mlst) dtset.add(m.dt)
	if (dtset.size > 1) {
		// more than 1 data types, won't print detail table for each variant
		if (tk.mds.variant2samples) {
			// show sample summary
			await mlst2samplesummary(mlst, tk, block, tk.itemtip.d)
		} else {
			console.log('no variant2samples, do not know what to show')
		}
		return
	}
	// mlst are of one data type
	await itemtable(mlst, tk, block, tk.itemtip.d)
}
