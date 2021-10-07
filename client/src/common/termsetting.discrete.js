import { keyupEnter } from '../client'
import { select, event } from 'd3-selection'
import { format } from 'd3-format'
import { setDensityPlot } from './termsetting.density'
import { get_bin_label } from '../../shared/termdb.bins'
import { init_tabs, update_tabs } from '../dom/toggleButtons'

/*
Arguments
self: a termsetting instance
*/

const tsInstanceTracker = new WeakMap()
let i = 0

export async function setNumericMethods(self, closureType = 'closured') {
	if (!tsInstanceTracker.has(self)) {
		tsInstanceTracker.set(self, i++)
	}

	if (closureType == 'non-closured') {
		// TODO: always use this non-closured version later
		return {
			get_term_name,
			get_status_msg,
			showEditMenu
		}
	} else {
		// this version maintains a closured reference to 'self'
		// so the 'self' argument does not need to be passed
		//
		// TODO: may convert all other termsetting.*.js methods to
		// just use the non-closured version to simplify
		//
		self.get_term_name = d => get_term_name(self, d)
		self.get_status_msg = get_status_msg
		self.showEditMenu = async div => await showEditMenu(self, div)
	}
}

function get_term_name(self, d) {
	if (!self.opts.abbrCutoff) return d.name
	return d.name.length <= self.opts.abbrCutoff + 2
		? d.name
		: '<label title="' + d.name + '">' + d.name.substring(0, self.opts.abbrCutoff) + '...' + '</label>'
}

function get_status_msg() {
	return ''
}

async function showEditMenu(self, div) {
	if (!self.numqByTermIdType) self.numqByTermIdType = {}
	self.num_obj = {}

	self.num_obj.plot_size = {
		width: 500,
		height: 100,
		xpad: 10,
		ypad: 20
	}
	try {
		// check if termsettingInit() was called outside of termdb/app
		// in which case it will not have an opts.vocabApi
		if (!self.opts.vocabApi) {
			const vocabulary = await import('../termdb/vocabulary')
			self.opts.vocabApi = vocabulary.vocabInit({ state: { vocab: self.opts.vocab } })
		}
		self.num_obj.density_data = await self.opts.vocabApi.getDensityPlotData(self.term.id, self.num_obj, self.filter)
	} catch (err) {
		console.log(err)
	}

	div.selectAll('*').remove()
	self.dom.num_holder = div
	self.dom.bins_div = div.append('div').style('padding', '5px')

	setqDefaults(self)
	setDensityPlot(self)
	renderBoundaryInclusionInput(self)
	renderTypeInputs(self)
	renderButtons(self)
}

function applyEdits(self) {
	if (self.q.type == 'regular') {
		self.q.first_bin.startunbounded = true
		self.q.first_bin.stop = +self.dom.first_stop_input.property('value')
		self.q.startinclusive = self.dom.boundaryInput.property('value') == 'startinclusive'
		self.q.stopinclusive = self.dom.boundaryInput.property('value') == 'stopinclusive'
		const bin_size = self.dom.bin_size_input.property('value')
		self.q.bin_size = Number(bin_size)
		if (bin_size.includes('.') && !bin_size.endsWith('.')) {
			self.q.rounding = '.' + bin_size.split('.')[1].length + 'f'
		} else {
			self.q.rounding = '.0f'
		}

		if (self.dom.last_radio_auto.property('checked')) {
			delete self.q.last_bin
		} else {
			if (!self.q.last_bin) self.q.last_bin = {}
			self.q.last_bin.start = +self.dom.last_start_input.property('value')
			self.q.last_bin.stopunbounded = true
		}
		self.numqByTermIdType[self.term.id].regular = JSON.parse(JSON.stringify(self.q))
	} else {
		delete self.q.startinclusive
		delete self.q.stopinclusive
		delete self.q.bin_size
		delete self.q.first_bin
		delete self.q.last_bin
		self.q.lst = processCustomBinInputs(self)
		self.numqByTermIdType[self.term.id].custom = JSON.parse(JSON.stringify(self.q))
	}
	self.q.mode = 'discrete'
	delete self.q.scale
	self.dom.tip.hide()
	self.opts.callback({
		term: self.term,
		q: self.q
	})
}

function processCustomBinInputs(self) {
	const startinclusive = self.dom.boundaryInput.property('value') == 'startinclusive'
	const stopinclusive = self.dom.boundaryInput.property('value') == 'stopinclusive'
	const inputDivs = self.dom.customBinLabelTd.node().querySelectorAll('div')
	let prevBin
	const data = self.dom.customBinBoundaryInput
		.property('value')
		.split('\n')
		.filter(d => d != '')
		.map(d => +d)
		.sort((a, b) => a - b)
		.map((d, i) => {
			const bin = {
				start: +d,
				startinclusive,
				stopinclusive
			}
			if (prevBin) {
				delete prevBin.stopunbounded
				prevBin.stop = bin.start
				const label = inputDivs[i].querySelector('input').value
				prevBin.label = label ? label : get_bin_label(prevBin, self.q)
			}
			prevBin = bin
			return bin
		})

	prevBin.stopunbounded = true
	const label = inputDivs[data.length] && inputDivs[data.length].querySelector('input').value
	prevBin.label = label ? label : get_bin_label(prevBin, self.q)

	data.unshift({
		startunbounded: true,
		stop: data[0].start,
		startinclusive,
		stopinclusive,
		label: inputDivs[0].querySelector('input').value
	})
	if (!data[0].label) data[0].label = get_bin_label(data[0], self.q)
	return data
}

function setqDefaults(self) {
	const dd = self.num_obj.density_data
	if (!(self.term.id in self.numqByTermIdType)) {
		const defaultCustomBoundary =
			dd.maxvalue != dd.minvalue ? dd.minvalue + (dd.maxvalue - dd.minvalue) / 2 : dd.maxvalue

		self.numqByTermIdType[self.term.id] = {
			regular:
				self.q && self.q.type == 'regular'
					? JSON.parse(JSON.stringify(self.q))
					: self.opts.use_bins_less && self.term.bins.less
					? JSON.parse(JSON.stringify(self.term.bins.less))
					: JSON.parse(JSON.stringify(self.term.bins.default)),
			custom:
				self.q && self.q.type == 'custom'
					? self.q
					: {
							type: 'custom',
							lst: [
								{
									startunbounded: true,
									stopinclusive: true,
									stop: +defaultCustomBoundary.toFixed(self.term.type == 'integer' ? 0 : 2)
								},
								{
									stopunbounded: true,
									stopinclusive: true,
									start: +defaultCustomBoundary.toFixed(self.term.type == 'integer' ? 0 : 2)
								}
							]
					  }
		}
		if (!self.numqByTermIdType[self.term.id].regular.type) {
			self.numqByTermIdType[self.term.id].regular.type = 'regular'
		}
	} else if (self.term.q) {
		if (!self.term.q.type) throw `missing numeric term q.type: should be 'regular' or 'custom'`
		self.numqByTermIdType[self.term.id][self.q.type] = self.q
	}

	//if (self.q && self.q.type && Object.keys(self.q).length>1) return
	if (!self.q) self.q = {}
	if (!self.q.type) self.q.type = 'regular'
	self.q = JSON.parse(JSON.stringify(self.numqByTermIdType[self.term.id][self.q.type]))
	const bin_size = 'bin_size' in self.q && self.q.bin_size.toString()
	if (!self.q.rounding && typeof bin_size == 'string' && bin_size.includes('.') && !bin_size.endsWith('.')) {
		const binDecimals = bin_size.split('.')[1].length
		self.q.rounding = '.' + binDecimals + 'f'
	}
	if (self.q.lst) {
		self.q.lst.forEach(bin => {
			if (!('label' in bin)) bin.label = get_bin_label(bin, self.q)
		})
	}
	//*** validate self.q ***//
}

function renderBoundaryInclusionInput(self) {
	self.dom.boundaryInclusionDiv = self.dom.bins_div.append('div').style('margin-left', '5px')

	self.dom.boundaryInclusionDiv
		.append('span')
		.style('padding', '5px')
		.style('color', 'rgb(136, 136, 136)')
		.html('Boundary Inclusion')

	const x = '<span style="font-family:Times;font-style:italic">x</span>'

	self.dom.boundaryInput = self.dom.boundaryInclusionDiv
		.append('select')
		.style('margin-left', '10px')
		.on('change', function() {
			self.numqByTermIdType[self.term.id].startinclusive = self.dom.boundaryInput.node().selectedIndex == 1
			self.numqByTermIdType[self.term.id].stopinclusive = self.dom.boundaryInput.node().selectedIndex == 0
		})

	self.dom.boundaryInput
		.selectAll('option')
		.data([
			{ value: 'stopinclusive', html: 'start &lt; ' + x + ' &le; end' },
			{ value: 'startinclusive', html: 'start &le; ' + x + ' &lt; end' }
		])
		.enter()
		.append('option')
		.property('value', d => d.value)
		.property('selected', d => self.q[d.value] == true)
		.html(d => d.html)
}

function renderTypeInputs(self) {
	// toggle switch
	const div = self.dom.bins_div.append('div').style('margin', '10px')
	const tabs = [
		{
			active: self.q.type == 'regular' ? true : false,
			label: 'Same bin size',
			callback: async div => {
				self.q.type = 'regular'
				renderFixedBinsInputs(self, div)
			},
			repeatedCallback: async () => {
				self.q.type = 'regular'
				setqDefaults(self)
				setDensityPlot(self)
			}
		},
		{
			active: self.q.type == 'custom' ? true : false,
			label: 'Varying bin sizes',
			callback: async div => {
				self.q.type = 'custom'
				setqDefaults(self)
				setDensityPlot(self)
				renderCustomBinInputs(self, div)
			},
			repeatedCallback: async () => {
				self.q.type = 'custom'
				setqDefaults(self)
				setDensityPlot(self)
			}
		}
	]
	init_tabs({ holder: div, tabs })
}

/******************* Functions for Numerical Fixed size bins *******************/
function renderFixedBinsInputs(self, tablediv) {
	self.dom.bins_table = tablediv.append('table')
	renderBinSizeInput(self, self.dom.bins_table.append('tr'))
	renderFirstBinInput(self, self.dom.bins_table.append('tr'))
	renderLastBinInputs(self, self.dom.bins_table.append('tr'))
}

function renderBinSizeInput(self, tr) {
	tr.append('td')
		.style('margin', '5px')
		.style('color', 'rgb(136, 136, 136)')
		.html('Bin Size')

	const dd = self.num_obj.density_data
	const origBinSize = self.q.bin_size

	self.dom.bin_size_input = tr
		.append('td')
		.append('input')
		.attr('type', 'number')
		.attr('value', 'rounding' in self.q ? format(self.q.rounding)(self.q.bin_size) : self.q.bin_size)
		.style('margin-left', '15px')
		.style('width', '100px')
		.style('color', d => (self.q.bin_size > Math.abs(dd.maxvalue - dd.minvalue) ? 'red' : ''))
		.on('change', handleChange)
		.on('keyup', function() {
			if (!keyupEnter()) return
			handleChange.call(this)
		})

	function handleChange() {
		self.q.bin_size = +this.value
		select(this).style(
			'color',
			self.q.bin_size > Math.abs(dd.maxvalue - dd.minvalue) ? 'red' : +this.value != origBinSize ? 'green' : ''
		)
		setDensityPlot(self)
	}

	tr.append('td')
		.append('div')
		.style('font-size', '.6em')
		.style('margin-left', '1px')
		.style('color', '#858585')
		.style('display', self.num_obj.no_density_data ? 'none' : 'block')
		.text('Green text indicates an edited value, red indicates size larger than the current term value range')
}

function renderFirstBinInput(self, tr) {
	//const brush = self.num_obj.brushes[0]
	if (!self.q.first_bin) self.q.first_bin = {}
	tr.append('td')
		.style('margin', '5px')
		.style('color', 'rgb(136, 136, 136)')
		.html('First Bin Stop')

	self.dom.first_stop_input = tr
		.append('td')
		.append('input')
		.attr('type', 'number')
		.property('value', 'stop' in self.q.first_bin ? self.q.first_bin.stop : '')
		.style('width', '100px')
		.style('margin-left', '15px')
		.style('color', self.q.first_bin && self.q.first_bin.stop < self.num_obj.density_data.minvalue ? 'red' : '')
		.on('change', handleChange)
		.on('keyup', function() {
			if (!keyupEnter()) return
			handleChange.call(this)
		})

	tr.append('td')
		.append('div')
		.style('font-size', '.6em')
		.style('margin-left', '1px')
		.style('color', '#858585')
		.style('display', self.num_obj.no_density_data ? 'none' : 'block')
		.html('<b>Left most</b>red line indicates the first bin stop. <br> Drag that line to edit this value.')

	function handleChange() {
		self.q.first_bin.stop = +self.dom.first_stop_input.property('value')
		self.dom.first_stop_input.restyle()
		self.renderBinLines(self, self.q)
	}

	const origFirstStop = self.q.first_bin.stop
	self.dom.first_stop_input.restyle = () => {
		self.dom.first_stop_input.style(
			'color',
			self.q.first_bin.stop < self.num_obj.density_data.minvalue
				? 'red'
				: self.q.first_bin.stop != origFirstStop
				? 'green'
				: ''
		)
	}
}

function renderLastBinInputs(self, tr) {
	const id = tsInstanceTracker.get(self)
	const isAuto = !self.q.last_bin || Object.keys(self.q.last_bin).length === 0

	tr.append('td')
		.style('margin', '5px')
		.style('color', 'rgb(136, 136, 136)')
		.html('Last Bin Start')

	const td1 = tr
		.append('td')
		.style('padding-left', '15px')
		.style('vertical-align', 'top')
	const radio_div = td1.append('div')
	const label0 = radio_div
		.append('label')
		.style('padding-left', '10px')
		.style('padding-right', '10px')

	self.dom.last_radio_auto = label0
		.append('input')
		.attr('type', 'radio')
		.attr('name', 'last_bin_opt_' + id)
		.attr('value', 'auto')
		.style('margin-right', '3px')
		.style('color', self.q.last_bin && self.q.last_bin.start > self.num_obj.density_data.maxvalue ? 'red' : '')
		.property('checked', isAuto)
		.on('change', handleChange)
		.on('keyup', function() {
			if (!keyupEnter()) return
			handleChange.call(this)
		})

	label0
		.append('span')
		.style('color', 'rgb(136, 136, 136)')
		.html('Automatic<br>')

	const label1 = radio_div
		.append('label')
		.style('padding-left', '10px')
		.style('padding-right', '10px')

	label1
		.append('input')
		.attr('type', 'radio')
		.attr('name', 'last_bin_opt_' + id)
		.attr('value', 'fixed')
		.style('margin-right', '3px')
		.property('checked', !isAuto)
		.on('change', function() {
			if (!this.checked) {
				delete self.q.last_bin.start
				edit_div.style('display', 'none')
			} else {
				if (!self.q.last_bin) self.q.last_bin = {}
				if (!('start' in self.q.last_bin)) {
					// default to setting the last bin start to max value,
					// so that it will be dragged to the left by default
					self.q.last_bin.start = self.num_obj.density_data.maxvalue
				}
				self.dom.last_start_input.property('value', self.q.last_bin.start)
				const value = +self.dom.last_start_input.property('value')
				self.q.last_bin.start = value
				edit_div.style('display', 'inline-block')
			}
			setDensityPlot(self)
		})

	label1
		.append('span')
		.style('color', 'rgb(136, 136, 136)')
		.html('Fixed')

	const edit_div = tr
		.append('td')
		.append('div')
		.style('display', isAuto ? 'none' : 'inline-block')

	self.dom.last_start_input = edit_div
		.append('input')
		.attr('type', 'number')
		.property('value', self.q.last_bin ? self.q.last_bin.start : '')
		.style('width', '100px')
		.style('margin-left', '15px')
		.on('change', handleChange)
		.on('keyup', function() {
			if (!keyupEnter()) return
			handleChange.call(this)
		})

	// note div
	tr.append('td')
		.style('display', 'none')
		.append('div')
		.style('font-size', '.6em')
		.style('margin-left', '1px')
		.style('padding-top', '30px')
		.style('color', '#858585')
		.style('display', self.num_obj.no_density_data ? 'none' : 'block')
		.html('<b>Right</b>most red line indicates the last bin start. <br> Drag that line to edit this value.')

	function handleChange() {
		self.q.last_bin.start = +self.dom.last_start_input.property('value')
		self.dom.last_start_input.restyle()
		self.renderBinLines(self, self.q)
		if (self.dom.last_radio_auto.property('checked')) {
			delete self.q.last_bin.start
			edit_div.style('display', 'none')
		}
	}

	const origLastStart = self.q.last_bin ? self.q.last_bin.start : null
	self.dom.last_start_input.restyle = () => {
		self.dom.last_start_input.style(
			'color',
			self.q.last_bin.start > self.num_obj.density_data.maxvalue
				? 'red'
				: self.q.last_bin.start != origLastStart
				? 'green'
				: ''
		)
	}
}

/******************* Functions for Numerical Custom size bins *******************/
function renderCustomBinInputs(self, tablediv) {
	self.dom.bins_table = tablediv.append('table')
	const thead = self.dom.bins_table.append('thead').append('tr')
	thead
		.append('th')
		.style('font-weight', 'normal')
		.style('color', 'rgb(136, 136, 136)')
		.html('Bin Boundaries')
	thead
		.append('th')
		.style('font-weight', 'normal')
		.style('color', 'rgb(136, 136, 136)')
		.html('Bin Labels')
	self.dom.customBintbody = self.dom.bins_table.append('tbody')
	const tr = self.dom.customBintbody.append('tr')

	self.dom.customBinBoundaryInput = tr
		.append('td')
		.append('textarea')
		.style('height', '100px')
		.style('width', '100px')
		.text(
			self.q.lst
				.slice(1)
				.map(d => d.start)
				.join('\n')
		)
		.on('change', handleChange)
		.on('keyup', async () => {
			// enter or backspace/delete
			// i don't think backspace works
			if (!keyupEnter() && event.key != 8) return
			handleChange.call(this)
		})

	function handleChange() {
		self.dom.customBinLabelTd.selectAll('input').property('value', '')
		const data = processCustomBinInputs(self)
		// update self.q.lst and render bin lines only if bin boundry changed
		if (binsChanged(data, self.q.lst)) {
			self.q.lst = data
			self.renderBinLines(self, self.q)
		}
		renderBoundaryInputDivs(self, self.q.lst)
	}

	function binsChanged(data, qlst) {
		if (data.length != qlst.length) return true
		for (const [i, bin] of qlst.entries()) {
			for (const k of Object.keys(bin)) {
				if (bin[k] && bin[k] !== data[i][k]) {
					return true
				}
			}
		}
		return false
	}

	self.dom.customBinLabelTd = tr.append('td')
	renderBoundaryInputDivs(self, self.q.lst)
}

function renderBoundaryInputDivs(self, data) {
	self.dom.customBinLabelTd.selectAll('div').remove('*')
	const inputDivs = self.dom.customBinLabelTd.selectAll('div').data(data)
	inputDivs.exit().remove()
	inputDivs.each(function(d, i) {
		select(this)
			.select('span')
			.html('Bin ' + (i + 1) + '&nbsp;')
		select(this)
			.select('input')
			.property('value', d.label)
	})
	inputDivs
		.enter()
		.append('div')
		.each(function(d, i) {
			select(this)
				.append('span')
				.style('color', 'rgb(136, 136, 136)')
				.html('Bin ' + (i + 1) + '&nbsp;')
			select(this)
				.append('input')
				.attr('type', 'text')
				.property('value', d.label)
				.on('change', function(d, i) {
					self.q.lst[i].label = this.value
				})
		})

	self.dom.customBinLabelInput = self.dom.customBinLabelTd.selectAll('input')
}

function renderButtons(self) {
	const btndiv = self.dom.bins_div.append('div')
	btndiv
		.append('button')
		.style('margin', '5px')
		.html('Apply')
		.on('click', () => applyEdits(self))
	btndiv
		.append('button')
		.style('margin', '5px')
		.html('Reset')
		.on('click', () => {
			delete self.q
			delete self.numqByTermIdType[self.term.id]
			self.showEditMenu(self.dom.num_holder)
		})
}
