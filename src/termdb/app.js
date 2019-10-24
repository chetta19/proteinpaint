import * as rx from "../rx.core"
import {select} from "d3-selection"
import {treeInit} from "./tree"
import {storeInit} from "./store"
import {filterInit} from "./filter"
import {sayerror} from '../client'

/*
opts{}
.state{}
	required, will fill-in or override store.defaultState
	https://docs.google.com/document/d/1gTPKS9aDoYi4h_KlMBXgrMxZeA_P4GXhWcQdNQs3Yp8/edit
.modifiers{}
	optional
	contains key-fxn() pairs
	a component will consume a specific modifier (addressed by its key) to alter its behavior
	can run the callback supplied with results to other apps (e.g. click a term in tree)
	app and components will refer to the same frozen object of "modifiers{}", in a read-only way
}


******************* modifiers
< no modifier >
tree: display all terms under a parent, just show name;
non-leaf terms will have a +/- button in the front
graphable terms will have a VIEW button at the back

< modifiers.click_term >
tree: display graphable terms as blue buttons for selecting, no VIEW button
as in selecting term2 in barchart
tree.search: display found terms as blue buttons

< modifiers.ssid_barchart >
TODO

< modifiers.tvs_select >
TODO
*/

class TdbApp {
	constructor(opts, holder) {
		this.opts = opts
		this.api = rx.getAppApi(this)

		this.dom = {
			holder: holder.style("margin", "10px").style("border", "1px solid #aaa"),
			errdiv: holder.append('div')
		}

		// catch initialization error
		try {
			this.store = storeInit(this.api)
			this.state = this.store.state()
			const modifiers = validate_modifiers(opts.modifiers)
			this.components = {
				tree: treeInit( this.api, { holder: holder.append('div'), modifiers}),
				terms: filterInit(this.api, {holder: holder.append("div")})
			}
		} catch(e) {
			this.printError(e)
			if (e.stack) console.log(e.stack)
		}

		this.bus = new rx.Bus("app", ["postInit",'postRender'], opts.callbacks, this.api)
		this.bus.emit('postInit')
		// trigger the initial render after initialization
		// no need to supply an action.state{} at this point
		//this.main().catch(this.printError)
		this.api.dispatch({type:'app_refresh'}).catch(e=>this.printError(e))
	}

	async main(state, action) {
		this.state = state
		// catch runtime error from components
		try {
			await rx.notifyComponents(this.components, action)
		} catch(e) {
			this.printError(e)
			if (e.stack) console.log(e.stack)
		}
		this.bus.emit('postRender')
	}

	printError(e) {
		sayerror(this.dom.errdiv, 'Error: '+(e.message||e))
		if (e.stack) console.log(e.stack)
	}
}

/*
	subState: 
	- a collection of action filters and 
	methods grouped by component type. 

	The subStates are defined here since the "app"
	should know about the structure of the store.state
	and the expected arguments to sub-components, so that
	it can reshape the state by component type. 

	[component.type]: {}
	.reactsTo{}
		.prefix
		.type
		.match

		see rx.core getAppApi().state() on how
		these key-values are used as coarse-grained filters 
		to avoid unnecessary state recomputations or 
		component updates

	.get() 
		a method to get coarse-grained partial state
	  that is relevant to a subcomponent type, id
*/
TdbApp.prototype.subState = {
	tree: {
		reactsTo: {
			prefix: ['tree', 'filter', 'plot'],
			type: ['app_refresh']
		},
		get(appState, sub) {
			return {
				genome: appState.genome,
				dslabel: appState.dslabel,
				plots: appState.tree.plots,
				expandedTerms: appState.tree.expandedTerms,
				termfilter: appState.termfilter
			}
		}
	},
	filter: {
		reactsTo: {
			prefix: ['filter'],
			type: ['app_refresh']
		},
		get(appState, sub) {
			return {
				genome: appState.genome,
				dslabel: appState.dslabel,
				termfilter: appState.termfilter
			}
		}
	},
	plot: {
		reactsTo: {
			prefix: ['filter'],
			type: ['plot_add', 'plot_show', 'plot_edit', 'app_refresh', 'plot_rehydrate'],
			match: (action, sub) => {
				if (!action.type.startsWith('plot')) return true
				if (!('id' in action) || action.id == sub.id) return true
			}
		},
		get(appState, sub) {
			if (!(sub.id in appState.tree.plots)) {
				return //throw `No plot with id='${sub.id}' found.`
			}
			return {
				genome: appState.genome,
				dslabel: appState.dslabel,
				termfilter: appState.termfilter,
				config: appState.tree.plots[sub.id]
			}
		}
	},
	search: {
		get(appState, sub) {
			return {
				genome: appState.genome,
				dslabel: appState.dslabel
			}
		}
	}
}

exports.appInit = rx.getInitFxn(TdbApp)



function validate_modifiers(tmp={}){
	for(const k in tmp) {
		if(typeof tmp[k] != 'function') throw 'modifier "'+k+'" not a function'
	}
	return Object.freeze(tmp)
}
