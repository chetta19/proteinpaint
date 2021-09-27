import { getStoreInit } from '../common/rx.core'
import { root_ID } from '../termdb/tree'
import { plotConfig, fillTermWrapper } from './plot'
import { getTermSelectionSequence } from './charts'
import { dofetch3 } from '../client'
import { filterJoin, getFilterItemByTag, findItem, findParent } from '../common/filter'

// state definition: https://docs.google.com/document/d/1gTPKS9aDoYi4h_KlMBXgrMxZeA_P4GXhWcQdNQs3Yp8/edit#

const defaultState = {
	nav: {
		header_mode: 'with_tabs',
		activeTab: 0
	},
	// will be ignored if there is no dataset termdb.selectCohort
	// or value will be set to match a filter node that has been tagged
	// as 'cohortfilter' in state.termfilter.filter
	activeCohort: 0,
	tree: {
		exclude_types: [],
		expandedTermIds: [],
		visiblePlotIds: []
	},
	plots: [],
	termfilter: {
		filter: {
			type: 'tvslst',
			in: true,
			join: '',
			lst: []
		}
	},
	autoSave: true
}

// one store for the whole MASS app
class TdbStore {
	constructor(opts) {
		this.type = 'store'
		this.defaultState = defaultState
		// use for assigning unique IDs where needed
		// may be used later to simplify getting component state by type and id
		this.prevGeneratedId = 0
		// when using rx.copyMerge, replace the object values
		// for these keys instead of extending them
		this.replaceKeyVals = ['term', 'term2', 'term0', 'q']
	}

	validateOpts(opts) {
		const s = opts.state
		// assume that any vocabulary with a route
		// will require genome + dslabel
		if (s.vocab.route) {
			if (!s.vocab.genome) throw '.state[.vocab].genome missing'
			if (!s.vocab.dslabel) throw '.state[.vocab].dslabel missing'
		} else {
			if (!Array.isArray(s.vocab.terms)) throw 'vocab.terms must be an array of objects'
		}
	}

	validateState() {
		const s = this.state
		if (s.tree.expandedTermIds.length == 0) {
			s.tree.expandedTermIds.push(root_ID)
		} else {
			if (s.tree.expandedTermIds[0] != root_ID) {
				s.tree.expandedTermIds.unshift(root_ID)
			}
		}
	}

	async init() {
		try {
			this.state.termdbConfig = await this.app.vocabApi.getTermdbConfig()

			// support any legacy examples and tests that use the deprecated state.tree.plots object,
			// by converting to a state.plots array
			if (this.state.tree.plots) {
				for (const plotId in this.state.tree.plots) {
					const plot = this.state.tree.plots[plotId]
					const plotCopy = this.state.plots.find(p => p.id === plotId)
					if (plotCopy && plotCopy != plot) {
						throw `Plot ID conflict in deprecated state.tree.plots`
					}
					plot.id = plotId
					this.state.plots.push(plot)
				}
				delete this.state.tree.plots
			}

			for (const savedPlot of this.state.plots) {
				// .term{} is required, if missing, add with plotId
				if (!savedPlot.term) savedPlot.term = {}
				if (!savedPlot.term.id) savedPlot.term.id = plotId
				// .term2 and term0 are optional, but .id is required as that's a different term than plotId
				if (savedPlot.term2 && !savedPlot.term2.id) delete savedPlot.term2
				if (savedPlot.term0 && !savedPlot.term0.id) delete savedPlot.term0
				for (const t of ['term', 'term2', 'term0']) {
					if (!savedPlot[t]) continue
					savedPlot[t].term = await this.app.vocabApi.getterm(savedPlot[t].id)
				}
				if (!savedPlot.settings) savedPlot.settings = {}
				if (!savedPlot.settings.currViews) savedPlot.settings.currViews = [savedPlot.chartType]
				const plot = plotConfig(savedPlot, await this.api.copyState())
				const i = this.state.plots.indexOf(savedPlot)
				this.state.plots[i] = plot
				if (!('id' in plot)) plot.id = '_AUTOID_' + i
				if (plot.independent) {
					plot.independent = await Promise.all(
						plot.independent.map(async term => {
							if (!term.term) term.term = await this.app.vocabApi.getterm(term.id)
							return term.term ? fillTermWrapper(term) : fillTermWrapper({ term })
						})
					)
				}
				this.adjustPlotCurrViews(plot)
			}

			// maybe no need to provide term filter at this query
			let filterUiRoot = getFilterItemByTag(this.state.termfilter.filter, 'filterUiRoot')
			if (!filterUiRoot) {
				this.state.termfilter.filter.tag = 'filterUiRoot'
				filterUiRoot = this.state.termfilter.filter
			}

			if (this.state.termdbConfig.selectCohort) {
				let cohortFilter = getFilterItemByTag(this.state.termfilter.filter, 'cohortFilter')
				if (!cohortFilter) {
					// support legacy state.termfilter and test scripts that
					// that does not specify a cohort when required;
					// will use state.activeCohort if not -1
					cohortFilter = {
						tag: 'cohortFilter',
						type: 'tvs',
						tvs: {
							term: JSON.parse(JSON.stringify(this.state.termdbConfig.selectCohort.term)),
							values:
								this.state.activeCohort == -1
									? []
									: this.state.termdbConfig.selectCohort.values[this.state.activeCohort].keys.map(key => {
											return { key, label: key }
									  })
						}
					}
					this.state.termfilter.filter = {
						type: 'tvslst',
						in: true,
						join: 'and',
						lst: [cohortFilter, filterUiRoot]
					}
				} else {
					const sorter = (a, b) => (a < b ? -1 : 1)
					cohortFilter.tvs.values.sort((a, b) => (a.key < b.key ? -1 : 1))
					const keysStr = JSON.stringify(cohortFilter.tvs.values.map(v => v.key).sort(sorter))
					const i = this.state.termdbConfig.selectCohort.values.findIndex(
						v => keysStr == JSON.stringify(v.keys.sort(sorter))
					)
					if (this.state.activeCohort !== -1 && this.state.activeCohort !== 0 && i !== this.state.activeCohort) {
						console.log('Warning: cohortFilter will override the state.activeCohort due to mismatch')
					}
					this.state.activeCohort = i
				}
			} else {
				this.state.activeCohort = -1
				// since the cohort tab will be hidden, default to making the filter tab active
				if (this.state.activeTab === 0) this.state.activeTab = 1
				if (this.state.nav.header_mode === 'with_cohortHtmlSelect') {
					console.warn(`no termdbConfig.selectCohort to use for nav.header_mode = 'with_cohortHtmlSelect'`)
					this.state.nav.header_mode = 'search_only'
				}
			}
		} catch (e) {
			throw e
		}
	}

	setId(item) {
		item.$id = this.prevGeneratedId++
		if (item.$lst) {
			for (const subitem of item.$lst) {
				this.setId(subitem)
			}
		}
	}

	adjustPlotCurrViews(plotConfig) {
		if (!plotConfig) return
		const currViews = plotConfig.settings.currViews || []
		if (plotConfig.chartType == 'regression') {
			plotConfig.settings.currViews = ['regression']
		}
		if (currViews.includes('table') && !plotConfig.term2) {
			plotConfig.settings.currViews = ['barchart']
		}
		if (
			currViews.includes('boxplot') &&
			(!plotConfig.term2 || (plotConfig.term2.term.type !== 'integer' && plotConfig.term2.term.type !== 'float'))
		) {
			plotConfig.settings.currViews = ['barchart']
		}
	}
}

/*
	To clearly indicate the allowed store actions,
	supply a literal "actions" object on the 
	constructor prototype
*/
TdbStore.prototype.actions = {
	app_refresh(action = {}) {
		// optional action.state{} may be full or partial overrides
		// to the current state
		//
		// when constructing an app, app_refresh() is called
		// without action.state as the current state at the
		// initial render is not meant to be modified yet
		//
		this.state = this.copyMerge(this.toJson(this.state), action.state ? action.state : {}, this.replaceKeyVals)
		for (const plot of this.state.plots) {
			this.adjustPlotCurrViews(plot)
		}
	},
	tab_set(action) {
		this.state.nav.activeTab = action.activeTab
	},
	cohort_set(action) {
		this.state.activeCohort = action.activeCohort
		const cohort = this.state.termdbConfig.selectCohort.values[action.activeCohort]
		const cohortFilter = getFilterItemByTag(this.state.termfilter.filter, 'cohortFilter')
		if (!cohortFilter) throw `No item tagged with 'cohortFilter'`
		cohortFilter.tvs.values = cohort.keys.map(key => {
			return { key, label: key }
		})
	},
	tree_expand(action) {
		if (this.state.tree.expandedTermIds.includes(action.termId)) return
		this.state.tree.expandedTermIds.push(action.termId)
	},

	tree_collapse(action) {
		const i = this.state.tree.expandedTermIds.indexOf(action.termId)
		if (i == -1) return
		this.state.tree.expandedTermIds.splice(i, 1)
	},

	async plot_show(action) {
		const plot = plotConfig(
			{
				id: action.id,
				term: action.config.term.term ? action.config.term : { term: action.config.term },
				chartType: action.config.chartType,
				settings: { currViews: [action.config.chartType] }
			},
			await this.api.copyState()
		)
		if (action.config.independent) {
			plot.independent = action.config.independent.map(term => {
				return term.term ? fillTermWrapper(term) : fillTermWrapper({ term })
			})
		}
		if (!action.config.termSequence) {
			action.config.termSequence = getTermSelectionSequence(action.config.chartType)
		}
		if ('cutoff' in action.config) {
			plot.cutoff = action.config.cutoff
		} else {
			delete plot.cutoff
		}
		if (action.config.regressionType) {
			plot.regressionType = action.config.regressionType
		}
		this.state.plots.push(plot)
		this.state.tree.visiblePlotIds.push(action.id)
	},

	async plot_prep(action) {
		const plot = {
			id: action.id,
			chartType: 'regression',
			regressionType: action.regressionType,
			independent: []
		}
		this.state.plots.push(plot)
	},

	plot_hide(action) {
		const i = this.state.tree.visiblePlotIds.indexOf(action.id)
		if (i != -1) {
			this.state.tree.visiblePlotIds.splice(i, 1)
		}
	},

	plot_edit(action) {
		const plot = this.state.plots.find(p => p.id === action.id)
		if (plot) {
			this.copyMerge(plot, action.config, action.opts ? action.opts : {}, this.replaceKeyVals)
			validatePlot(plot, this.app.vocabApi)
		}
		if ('cutoff' in action.config) {
			plot.cutoff = action.config.cutoff
		} else {
			delete plot.cutoff
		}
		this.adjustPlotCurrViews(plot)
	},

	plot_delete(action) {
		const i = this.state.plots.findIndex(p => p.id === action.id)
		if (i !== -1) this.state.plots.splice(i, 1)
	},

	filter_replace(action) {
		const replacementFilter = action.filter ? action.filter : { type: 'tvslst', join: '', in: 1, lst: [] }
		if (!action.filter.tag) {
			this.state.termfilter.filter = replacementFilter
		} else {
			const filter = getFilterItemByTag(this.state.termfilter.filter, action.filter.tag)
			if (!filter) throw `cannot replace missing filter with tag '${action.filter.tag}'`
			const parent = findParent(this.state.termfilter.filter, filter.$id)
			if (parent == filter) {
				this.state.termfilter.filter = replacementFilter
			} else {
				const i = parent.lst.indexOf(filter)
				parent.lst[i] = replacementFilter
			}
		}
	}
}

// must use the await keyword when using this storeInit()
export const storeInit = getStoreInit(TdbStore)

function validatePlot(p, vocabApi) {
	/*
	only work for hydrated plot object already in the state
	not for the saved state
	*/
	if (!('id' in p)) throw 'plot error: plot.id missing'
	if (!p.term) throw 'plot error: plot.term{} not an object'
	try {
		validatePlotTerm(p.term, vocabApi)
	} catch (e) {
		throw 'plot.term error: ' + e
	}
	if (p.term2) {
		try {
			validatePlotTerm(p.term2, vocabApi)
		} catch (e) {
			throw 'plot.term2 error: ' + e
		}
		if (p.term.term.type == 'condition' && p.term.id == p.term2.id) {
			// term and term2 are the same CHC, potentially allows grade-subcondition overlay
			if (p.term.q.bar_by_grade && p.term2.q.bar_by_grade)
				throw 'plot error: term2 is the same CHC, but both cannot be using bar_by_grade'
			if (p.term.q.bar_by_children && p.term2.q.bar_by_children)
				throw 'plot error: term2 is the same CHC, but both cannot be using bar_by_children'
		}
	}
	if (p.term0) {
		try {
			validatePlotTerm(p.term0, vocabApi)
		} catch (e) {
			throw 'plot.term0 error: ' + e
		}
	}
}

function validatePlotTerm(t, vocabApi) {
	/*
	for p.term, p.term2, p.term0
	{ id, term, q }
	*/

	// somehow plots are missing this
	if (!t.term) throw '.term{} missing'
	if (!vocabApi.graphable(t.term)) throw '.term is not graphable (not a valid type)'
	if (!t.term.name) throw '.term.name missing'
	t.id = t.term.id

	if (!t.q) throw '.q{} missing'
	// term-type specific validation of q
	switch (t.term.type) {
		case 'integer':
		case 'float':
		case 'survival':
			// t.q is binning scheme, it is validated on server
			break
		case 'categorical':
			if (t.q.groupsetting && !t.q.groupsetting.disabled) {
				// groupsetting allowed on this term
				if (!t.term.values) throw '.values{} missing when groupsetting is allowed'
				// groupsetting is validated on server
			}
			// term may not have .values{} when groupsetting is disabled
			break
		case 'condition':
			if (!t.term.values) throw '.values{} missing'
			if (!t.q.bar_by_grade && !t.q.bar_by_children) throw 'neither q.bar_by_grade or q.bar_by_children is set to true'
			if (!t.q.value_by_max_grade && !t.q.value_by_most_recent && !t.q.value_by_computable_grade)
				throw 'neither q.value_by_max_grade or q.value_by_most_recent or q.value_by_computable_grade is true'
			break
		default:
			if (t.term.isgenotype) {
				// don't do anything for now
				console.log('to add in type:"genotype"')
				break
			}
			throw 'unknown term type'
	}
}
