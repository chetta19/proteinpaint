import { event } from 'd3-selection'
import { Menu, newpane, get_one_genome } from '../client'
import { filterJoin, getFilterItemByTag, getNormalRoot } from '../common/filter'

export default function getHandlers(self) {
	const tip = new Menu({ padding: '5px' })
	const s = self.settings

	function barLabelClickHandler() {
		// same handler for row label click in horziontal orientation
		// or col label click in vertical orientation, since
		// row/column labels only apply to bars
		const d = event.target.__data__
		if (d === undefined) return
		const termNum = d.type == 'col' ? 'term' : 'term2'
		const term = self.config.term
		self.app.dispatch({
			type: 'plot_edit',
			id: term.id,
			config: {
				term: {
					id: term.id,
					term: term.term,
					q: getUpdatedQfromClick(d, term, true)
				}
			}
		})
	}

	return {
		chart: {
			title(chart) {
				if (!self.config.term0) return chart.chartId
				return self.config.term0.values && chart.chartId in self.config.term0.values
					? self.config.term0.values[chart.chartId].label
					: chart.chartId
			}
		},
		svg: {
			mouseout: () => {
				tip.hide()
			}
		},
		series: {
			mouseover(d) {
				event.stopPropagation()
				//console.log(26, tip.d.node() instanceof Node, tip, tip.d.node())
				//if (!(tip.d.node() instanceof Node)) return
				const t1 = self.config.term.term
				const t2 = self.config.term2 && self.config.term2.term
				const term1unit = t1.unit
				const seriesLabel =
					(t1.values && d.seriesId in t1.values ? t1.values[d.seriesId].label : d.seriesId) +
					(t1.unit ? ' ' + t1.unit : '')
				const dataLabel =
					(t2 && t2.values && d.dataId in t2.values ? t2.values[d.dataId].label : d.dataId) +
					(t2 && t2.unit ? ' ' + t2.unit : '')
				const icon = !t2
					? ''
					: "<div style='display:inline-block; width:14px; height:14px; margin: 2px 3px; vertical-align:top; background:" +
					  d.color +
					  "'>&nbsp;</div>"
				const rows = [`<tr><td colspan=2 style='padding:3px; text-align:center'>${seriesLabel}</td></tr>`]
				if (t2)
					rows.push(
						`<tr><td colspan=2 style='padding:3px; text-align:center'>${icon} <span>${dataLabel}</span></td></tr>`
					)
				rows.push(
					`<tr><td style='padding:3px; color:#aaa'>#Individuals</td><td style='padding:3px; text-align:center'>n=${d.total}</td></tr>`
				)
				if (!t1.type == 'condition' && (!t2 || !t2.type == 'condition')) {
					rows.push(
						`<tr><td style='padding:3px; color:#aaa'>Percentage</td><td style='padding:3px; text-align:center'>${(
							(100 * d.total) /
							(t2 ? d.seriesTotal : d.chartTotal)
						).toFixed(1)}%</td></tr>`
					)
				}
				tip.show(event.clientX, event.clientY).d.html(`<table class='sja_simpletable'>${rows.join('\n')}</table>`)
			},
			mouseout: () => {
				tip.hide()
			},
			rectFill(d) {
				return d.color
			},
			click: self.opts.bar_click_override
				? d => self.opts.bar_click_override(getTermValues(d, self))
				: d => handle_click(self, d)
		},
		colLabel: {
			text: d => {
				return self.config.term.values && 'id' in d && d.id in self.config.term.values
					? self.config.term.values[d.id].label
					: 'label' in d
					? d.label
					: d
			},
			click: barLabelClickHandler,
			mouseover: () => {
				event.stopPropagation()
				tip.show(event.clientX, event.clientY).d.html('Click to hide bar')
			},
			mouseout: () => {
				tip.hide()
			}
		},
		rowLabel: {
			text: d => {
				return self.config.term.values && 'id' in d && d.id in self.config.term.values
					? self.config.term.values[d.id].label
					: 'label' in d
					? d.label
					: d
			},
			click: barLabelClickHandler,
			mouseover: () => {
				event.stopPropagation()
				tip.show(event.clientX, event.clientY).d.html('Click to hide bar')
			},
			mouseout: () => {
				tip.hide()
			}
		},
		legend: {
			click: () => {
				event.stopPropagation()
				const d = event.target.__data__
				if (d === undefined) return
				const termNum = d.type == 'col' ? 'term' : 'term2'
				const term = self.config[termNum]
				self.app.dispatch({
					type: 'plot_edit',
					id: self.config.term.id,
					config: {
						[termNum]: {
							id: term.id,
							term: term.term,
							q: getUpdatedQfromClick(d, term, false)
						}
					}
				})
			},
			mouseover: () => {
				event.stopPropagation()
				const d = event.target.__data__
				if (d === undefined) return
				if (d.isHidden) tip.show(event.clientX, event.clientY).d.html('Click to unhide bar')
			},
			mouseout: () => {
				tip.hide()
			}
		},
		yAxis: {
			text: () => {
				if (s.orientation == 'vertical') {
					return s.unit == 'pct' ? '% of patients' : '# of patients'
				} else {
					const term = self.config.term
					return term.type == 'condition' && self.config.term.q.value_by_max_grade
						? 'Maximum grade'
						: term.type == 'condition' && self.config.term.q.value_by_most_recent
						? 'Most recent grade'
						: term.type == 'categorical' || !term.unit
						? ''
						: term.unit //term.name[0].toUpperCase() + term.name.slice(1)
				}
			}
		},
		xAxis: {
			text: () => {
				if (s.orientation == 'vertical') {
					const term = self.config.term
					const q1 = term.q
					return term.type == 'condition' && q1.bar_by_grade && q1.value_by_max_grade
						? 'Maximum grade'
						: term.type == 'condition' && q1.bar_by_grade && q1.value_by_most_recent
						? 'Most recent grades'
						: term.type == 'categorical' || !term.unit
						? ''
						: term.unit // term.name[0].toUpperCase() + term.name.slice(1)
				} else {
					return s.unit == 'pct' ? '% of patients' : '# of patients'
				}
			}
		}
	}
}

function getUpdatedQfromClick(d, term, isHidden = false) {
	const label = 'id' in d ? d.id : d.type == 'col' ? d.seriesId : d.dataId
	const valueId = term.term.values && Object.keys(term.term.values).find(id => term.term.values[id].label === label)
	const id = !valueId ? label : valueId
	const q = JSON.parse(JSON.stringify(term.q))
	if (!q.hiddenValues) q.hiddenValues = {}
	if (isHidden) q.hiddenValues[id] = 1
	else delete q.hiddenValues[id]
	return q
}

function handle_click(self) {
	const d = event.target.__data__ || event.target.parentNode.__data__
	// bar label data only has {id,label},
	// while bar data has all required data including seriesId
	const term1 = self.config.term.term
	const term2 = self.config.term2 ? self.config.term2.term : null
	const uncomp_term1 = term1.values ? Object.values(term1.values).map(v => v.label) : []
	const uncomp_term2 = term2 && term2.values ? Object.values(term2.values).map(v => v.label) : []
	const term1unit = term1.unit && !uncomp_term1.includes(d.seriesId || d.id) ? ' ' + term1.unit : ''
	const term2unit = term2 && term2.unit && !uncomp_term2.includes(d.dataId || d.id) ? ' ' + term2.unit : ''
	const seriesLabel =
		(term1.values && d.seriesId in term1.values ? term1.values[d.seriesId].label : d.seriesId ? d.seriesId : d.id) +
		term1unit
	const dataLabel =
		(term2 && term2.values && d.dataId in term2.values ? term2.values[d.dataId].label : d.dataId ? d.dataId : d.id) +
		term2unit
	const icon = !term2
		? ''
		: "<div style='display:inline-block; width:14px; height:14px; margin: 2px 3px; vertical-align:top; background:" +
		  d.color +
		  "'>&nbsp;</div>"
	const header =
		`<div style='padding:2px'><b>${term1.name}</b>: ${seriesLabel}</div>` +
		(d.seriesId && term2 ? `<div style='padding:2px'><b>${term2.name}</b>: ${dataLabel} ${icon}</div>` : '')

	const data = d.seriesId || d.seriesId === 0 ? d : { seriesId: d.id, dataId: d.dataId }

	const options = []
	if (self.opts.bar_click_opts.includes('hide_bar')) {
		options.push({
			label: d.seriesId ? 'Hide "' + seriesLabel + '"' : 'Hide',
			callback: () => {
				const term = self.config.term
				self.app.dispatch({
					type: 'plot_edit',
					id: term.id,
					config: {
						term: {
							id: term.id,
							term: term.term,
							q: getUpdatedQfromClick({ id: d.seriesId, type: 'col' }, term, true)
						}
					}
				})
			}
		})

		if (d.dataId || d.dataId === 0) {
			options.push({
				label: 'Hide "' + dataLabel + '" ' + icon,
				callback: () => {
					const term2 = self.config.term2
					self.app.dispatch({
						type: 'plot_edit',
						id: self.config.term.id,
						config: {
							term2: {
								id: term2.id,
								term: term2.term,
								q: getUpdatedQfromClick({ id: d.dataId, type: 'row' }, term2, true)
							}
						}
					})
				}
			})
		}
	}

	if (self.opts.bar_click_opts.includes('add_filter') && (!term2 || !term2.isgenotype)) {
		options.push({
			label: 'Add as filter',
			callback: menuoption_add_filter
		})
	}

	if (self.opts.bar_click_opts.includes('select_to_gp')) {
		options.push({
			label: 'Select to GenomePaint',
			callback: menuoption_select_to_gp
		})
	}
	// TODO: add to cart
	//
	// if (self.opts.bar_click_opts.includes('add_to_cart')) {
	// 	options.push({
	// 		label: 'Add group to cart',
	// 		callback: menuoption_select_group_add_to_cart
	// 	})
	// }

	if (!options.length) return
	self.app.tip.clear()
	if (header) {
		self.app.tip.d.append('div').html(header)
	}
	const tvslst = getTermValues(data, self)
	self.app.tip.d
		.append('div')
		.selectAll('div')
		.data(options)
		.enter()
		.append('div')
		.attr('class', 'sja_menuoption')
		.html(d => d.label)
		.on('click', d => {
			self.app.tip.hide()
			d.callback(self, tvslst)
		})
	self.app.tip.show(event.clientX, event.clientY)
}

function menuoption_add_filter(self, tvslst) {
	/*
	self: the tree object
	tvslst: an array of 1 or 2 term-value setting objects
		this is to be added to the obj.termfilter.filter[]
		if barchart is single-term, tvslst will have only one element
		if barchart is two-term overlay, tvslst will have two elements, one for term1, the other for term2
  	*/
	if (!tvslst) return

	if (!self.state.termfilter || !self.state.nav.show_tabs) {
		// do not display ui, and do not collect callbacks
		return
	}
	const filterUiRoot = getFilterItemByTag(self.state.termfilter.filter, 'filterUiRoot')
	const filter = filterJoin([
		filterUiRoot,
		{
			type: 'tvslst',
			in: true,
			join: tvslst.length > 1 ? 'and' : '',
			lst: [...tvslst.map(wrapTvs)]
		}
	])
	filter.tag = 'filterUiRoot'
	self.app.dispatch({
		type: 'filter_replace',
		filter
	})
}

function wrapTvs(tvs) {
	return { type: 'tvs', tvs }
}

/* 			TODO: add to cart and gp          */

function menuoption_select_to_gp(self, tvslst) {
	const lst = []
	for (const t of tvslst) lst.push(wrapTvs(t))

	import('../block').then(async _ => {
		const obj = {
			genome: await get_one_genome(self.state.genome),
			dslabel: self.state.dslabel
		}
		const pane = newpane({ x: 100, y: 100 })
		const filterRoot = getNormalRoot(self.state.termfilter.filter)
		const filterUiRoot = getFilterItemByTag(filterRoot, filterUiRoot)
		if (filterUiRoot && filterUiRoot != filterRoot) delete filterUiRoot.tag
		filterRoot.tag = 'filterUiRoot'
		if (lst.length) {
			filterRoot.join = 'and'
			filterRoot.lst.push(...lst)
		}
		const cohortFilter = getFilterItemByTag(filterRoot, 'cohortFilter')
		if (cohortFilter) {
			cohortFilter.renderAs = 'htmlSelect'
			cohortFilter.selectOptionsFrom = 'selectCohort'
		}
		new _.Block({
			hostURL: localStorage.getItem('hostURL'),
			holder: pane.body,
			genome: obj.genome,
			nobox: true,
			chr: obj.genome.defaultcoord.chr,
			start: obj.genome.defaultcoord.start,
			stop: obj.genome.defaultcoord.stop,
			nativetracks: [obj.genome.tracks.find(i => i.__isgene).name.toLowerCase()],
			tklst: [
				{
					type: 'mds2',
					dslabel: obj.dslabel,
					vcf: {
						numerical_axis: {
							AFtest: {
								groups: [
									{ is_termdb: true, filter:  filterRoot},
									{ is_population: true, key: 'gnomAD', allowto_adjust_race: true, adjust_race: true }
								]
							}
						}
					}
				}
			]
		})
	})
}

function menuoption_select_group_add_to_cart(self, tvslst) {
	if (!tvslst || !tvslst.length) return

	const new_group = {}
	new_group.is_termdb = true
	new_group.terms = []

	for (const [i, term] of tvslst.entries()) {
		new_group.terms.push(term)
	}

	if (!self.selected_groups) {
		self.selected_groups = []
	}

	self.selected_groups.push(new_group)
	self.components.cart.main()
}

function getTermValues(d, self) {
	/*
    d: clicked bar data
  */

	const termValues = []
	const t1 = self.config.term
	const t1ValKey =
		t1.term.values && Object.keys(t1.term.values).filter(key => t1.term.values[key].label === d.seriesId)[0]
	const t1ValId = t1.term.values && t1ValKey in t1.term.values ? t1ValKey : d.seriesId
	const t2 = self.config.term2
	const t2ValKey =
		t2 && t2.term.values && Object.keys(t2.term.values).filter(key => t2.term.values[key].label === d.dataId)[0]
	const t2ValId = t2 && t2.term.values && t2ValKey in t2.term.values ? t2ValKey : d.dataId

	for (const term of [t1, t2]) {
		if (!term) continue
		const i = term == t1 ? 1 : 2
		const key = term == t1 ? t1ValId : t2ValId
		// const q = term ? term.q : {}
		const q = term.q //self.currServerData.refs.q[i]
		const label = !term || !term.term.values ? key : key in term.term.values ? term.term.values[key].label : key

		if (q.groupsetting && q.groupsetting.inuse) {
			const groupset =
				'predefined_groupset_idx' in q.groupsetting
					? term.term.groupsetting.lst[q.groupsetting.predefined_groupset_idx]
					: q.groupsetting.customset
			const group = groupset.groups.find(g => g.name === key)
			const tvs = { term: term.term, values: group.values, groupset_label: group.name }
			if (term.term.type == 'condition') {
				tvs.bar_by_children = term.q.bar_by_children
				tvs.bar_by_grade = term.q.bar_by_grade
				tvs.value_by_most_recent = term.q.value_by_most_recent
				tvs.value_by_max_grade = term.q.value_by_max_grade
			}
			termValues.push(tvs)
		} else if (term.term.type == 'condition') {
			if (!t2 || t1.id != t2.id) {
				termValues.push(
					Object.assign(
						{
							term: term.term,
							values: [{ key, label }]
						},
						q
					)
				)
			}

			if (term == t1 && t2 && term.term.id == t2.id) {
				const q2 = t2.q
				const term2Label =
					t2.term.values && d.dataId in t2.term.values ? self.config.term2.values[d.dataId].label : d.dataId

				termValues.push(
					Object.assign(
						{
							term: term.term,
							grade_and_child: [
								{
									grade: q2.bar_by_grade ? d.dataId : key,
									grade_label: q2.bar_by_grade ? term2Label : label,
									child_id: q2.bar_by_children ? d.dataId : key,
									child_label: q2.bar_by_children ? term2Label : label
								}
							]
						},
						q2
					)
				)
			}
		} else {
			const bins = self.currServerData.refs.bins[i]
			if (!bins || !bins.length) {
				// not associated with numeric bins
				termValues.push({ term: term.term, values: [{ key, label }] })
			} else {
				const range = bins.find(d => d.label == label || d.name == label)
				if (range) termValues.push({ term: term.term, ranges: [range] })
				else if (term == t1) {
					termValues.push({ term: term.term, ranges: [{ value: key }] })
				} else if (term == t2) {
					termValues.push({ term: term.term, ranges: [{ value: key }] })
				} else {
					throw 'should not happen'
				}
			}
		}
	}
	return termValues
}
