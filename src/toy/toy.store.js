import * as rx from "../rx.core"
import {dofetch2} from "../client"

const defaultState = {
	dslabel:'SJLife',
	genome:'hg38',
	currViews: ["test"],
	terms: [],
	controls: {
		search: "",
		rows:[]
	}
}

class ToyStore {
	constructor(app) {
		this.api = rx.getStoreApi(this)
		this.copyMerge = rx.copyMerge
		this.deepFreeze = rx.deepFreeze
		// see rx.core comments on when not to reuse rx.fromJson, rx.toJson
		this.fromJson = rx.fromJson // used in store.api.state()
		this.toJson = rx.toJson // used in store.api.state()
		
		this.app = app
		this.state = this.copyMerge(this.toJson(defaultState), app.opts.state)
	}
}

ToyStore.prototype.actions = {
	async term_add(action) {
		if (!action.term && !action.termid) throw 'neither term or termid is given'
		if (this.state.terms.find(d => d.id == (action.term ? action.term.id : action.termid))) {
			alert('The term is already printed.')
			return
		}
		let term = action.term
		if (!term) {
			const lst = ["genome=" + this.state.genome.name + "&dslabel=" + this.state.dslabel]
			const url = "/termdb?genome=hg38&dslabel=SJLife&gettermbyid=" + action.termid
			const init = action.init ? action.init : {}
			const fetchOpts = this.app.opts.fetchOpts ? this.app.opts.fetchOpts : {}
			const data = await dofetch2(url, init, fetchOpts)
			if (!data.term) {
				alert(`Term not found for id=${action.termid}`) 
				return
			}
			term = data.term
		}
		this.state.terms.push(term)
		const rows = this.state.controls.rows.map(a=>a.name)
		const new_rows = Object.keys(term)
		new_rows.forEach(row =>{
			if(!rows.includes(row)) this.state.controls.rows.push({name:row})
		})
		// optional: maybe add a "result" key to action
		// In general, not needed since a component should
		// know where to look for relevant data in 
		// this.app.state, .opts, .serverData
		action.result = this.state.terms
	},

	term_rm(action) {
		const i = this.state.terms.findIndex(d => d.id == action.termid)
		if (i == -1) return
		this.state.terms.splice(i, 1)

		//remove rows for removed term if not present in other terms
		const old_rows = this.state.controls.rows.map(r=>r.name)
		let new_rows = []
		this.state.terms.forEach(term => {
			new_rows = [...new Set(new_rows.concat(Object.keys(term)))]
		})
		old_rows.forEach(row =>{
			if(!new_rows.includes(row)){
				const i = this.state.controls.rows.findIndex(r => r.name == row)
				this.state.controls.rows.splice(i,1)
			}
		})
	},

	term_row_hide(action){
		const i = this.state.controls.rows.findIndex(r => r.name == action.row_name)
		if (i == -1) return
		if(this.state.controls.rows[i].hide)
		this.state.controls.rows[i].hide = false
		else this.state.controls.rows[i].hide = true
	}
}

export const storeInit = rx.getInitFxn(ToyStore)
