import * as rx from "../rx.core"
import {select} from "d3-selection"

class ToyTable {
	constructor(app, holder) {
		this.api = rx.getComponentApi(this)
		this.app = app
		this.opts = holder
		this.dom = {
			holder,
			table: holder.append('table')
		}
		this.yesThis()
		this.notThis(this)
	}

	// as a convenience, 
	// instance.reactsTo() will be called before
	// instance.main() in Component api.main()
	// acty = action.type.split("_")
	reactsTo(action, acty) {
		if (acty[0] == "term") return true
	}

	main(action) {
		const divs = this.dom.table.selectAll('.table-wrapper')
			.data(this.app.state().terms, this.getTermId)

		divs.exit().remove()
		divs.each(this._updateDiv)
		divs.enter()
			.append('div')
			.attr('class', 'table-wrapper')
			.each(this._addDiv)
	}
	
	addDiv(term, div) {
		div
			.style('position', 'relative')
			.style('margin', '10px')
			.style('padding', '10px 3px')
			.style('background-color', '#ececec')

		div.append('button')
			.datum(term)
			.html('remove')
			.style('margin', '5px')
			.on('click', this.removeDiv)

		const table = div.append('table')
		const keyVals = Object.keys(term).map(key => [key, term[key]])
		const tr = table.selectAll('tr')
			.data(keyVals, this.trBindKey)

		tr.exit().remove()
		tr.each(this._updateTr)
		tr.enter().append('tr').each(this._addTr)
	}

	updateDiv(term, div) {
		// re-sort rows, etc
		const keyVals = Object.keys(term).map(key => [key, term[key]])
		const tr = div.selectAll('table').selectAll('tr')
			.data(keyVals, this.trBindKey)

		tr.exit().remove()
		tr.each(this._updateTr)
		tr.enter().append('tr').each(this._addTr)
	}

	addTr(keyVal, tr, index) {
		tr.style('background-color', index%2 == 0 ? '#fff' : '')
		tr.append('td').html(keyVal[0]).style('padding', '3px 5px')
		tr.append('td').html(keyVal[1]).style('padding', '3px 5px')
		this.hideShowRaw(tr, keyVal[0])
	}

	updateTr(keyVal, tr, index) {
		// if there are computed labels, can update via .html(label)
		this.hideShowRaw(tr, keyVal[0])
	}

	getTermId(term) {
		return term.id
	}

	trBindKey(d) {
		return d[0]
	}

	hideShowRaw(tr, row_name){
		const rows = this.app.state().controls.rows.map(r=>r.name)
		if(rows.includes(row_name)){
			const row = this.app.state().controls.rows.find(r => r.name == row_name)
			if (row.hide){
				tr.style('visibility','collapse')
					.style('opacity',0)
					.style('transition','visibility .5s ease, opacity .5s ease')
			} 
			else{
				tr.style('visibility','visible')
					.style('opacity',1)
					.style('transition','visibility .5s ease, opacity .5s ease')
			}
		}
	}

	yesThis() {
		this.removeDiv = term => this.app.dispatch({type: 'term_rm', termid: term.id})
	}

	notThis(self) {
		self._addDiv = function(term) {
			self.addDiv(term, select(this))
		}
		self._updateDiv = function(term) {
			self.updateDiv(term, select(this))
		}
		self._addTr = function(keyVal, index) {
			self.addTr(keyVal, select(this), index)
		}
		self._updateTr = function(keyVal, index) {
			self.updateTr(keyVal, select(this), index)
		}
	}
}

export const tableInit = rx.getInitFxn(ToyTable)
