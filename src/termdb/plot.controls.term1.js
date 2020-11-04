import * as rx from '../common/rx.core'
import { termsettingInit } from '../common/termsetting'
import { getNormalRoot } from '../common/filter'
import { showTermSrc } from '../termdb/app'

/*
for configuring term1; wraps termsetting

execution flow:

1. constructor builds and returns this.api{} via getInitFxn
2. no state available for constructor so cannot do term-type specific things in constructor
3. upon notified by plot.controls.config.js and api.main() is called, this.state is ready
4. then call this.render() to:
4.1 if plot.term cannot be configured, quit
4.2 initiate this.pill if missing
4.3 call this.pill.main() to send {term,q} to pill

*/

class Term1ui {
	constructor(app, opts) {
		this.type = 'term1Input'
		this.id = opts.id
		this.app = app
		this.validateOpts(opts)
		setRenderers(this)
		this.initUI()
		this.api = rx.getComponentApi(this)
	}
	validateOpts(o) {
		if (!('id' in o)) throw 'opts.id missing'
		if (!o.holder) throw 'opts.holder missing'
		this.opts = o
		this.dom = { tr: o.holder }
	}
	getState(appState) {
		const state = {
			genome: appState.genome,
			dslabel: appState.dslabel,
			activeCohort: appState.activeCohort,
			plot: appState.tree.plots[this.id]
		}
		if (appState.termfilter && appState.termfilter.filter) {
			state.filter = getNormalRoot(appState.termfilter.filter)
		}
		return state
	}
	main() {
		this.render()
	}
	setPill() {
		// can only call after getting this.state
		this.pill = termsettingInit({
			genome: this.state.genome,
			dslabel: this.state.dslabel,
			activeCohort: this.state.activeCohort,
			holder: this.dom.td2.append('div').style('display', 'inline-block'),
			debug: this.opts.debug,
			callback: data => {
				// data is object with only one needed attribute: q, never is null
				if (!data.q) throw 'data.q{} missing from pill callback'
				this.app.dispatch({
					type: 'plot_edit',
					id: this.opts.id,
					config: {
						term: {
							/* though the purpose is only to update plot.term.q,
							must specifiy plot.term as {id, term, q}
							but not just {q}
							which copyMerge( plot, {term:{q:{...}}}, ['term']) won't allow to work
							will replace plot.term with {q}
							*/
							id: this.state.plot.term.term.id,
							term: this.state.plot.term.term,
							q: data.q
						}
					}
				})
			},
			showTermSrc
		})
	}
}

exports.term1uiInit = rx.getInitFxn(Term1ui)

function setRenderers(self) {
	self.initUI = function() {
		// label to be updated later after getting plot state via api.main()
		// <td> left
		self.dom.td1 = self.dom.tr.append('td').attr('class', 'sja-termdb-config-row-label')
		// <td> right
		self.dom.td2 = self.dom.tr.append('td')
	}
	self.render = function() {
		/* state and plot are frozen from app.state
		 */
		const plot = this.state.plot
		if (!plot.term) throw 'state.plot.term{} is missing'
		if (!plot.term.q) throw 'state.plot.term.q{} is missing'

		if (plot.term.q.groupsetting && plot.term.q.groupsetting.disabled) {
			///////////////////////////////////
			//
			// the term is not configurable. as plot term1 cannot be replaced, just quit
			//
			///////////////////////////////////
			this.dom.tr.style('display', 'none')
			return
		}

		switch (plot.term.term.type) {
			case 'categorical':
				self.dom.td1.text('Group categories')
				// may replace generic "categories" with term-specifics, e.g. cancer diagnosis
				break
			case 'condition':
				self.dom.td1.text('Customize')
				break
			case 'integer':
			case 'float':
				self.dom.td1.text('Customize bins')
				break
			default:
				throw 'unknown term type'
		}
		if (!self.pill) self.setPill()
		self.pill.main({
			term: plot.term.term,
			q: plot.term.q,
			activeCohort: this.state.activeCohort,
			filter: this.state.filter
			// no need for disable_terms as pill won't show tree
		})
	}
}
