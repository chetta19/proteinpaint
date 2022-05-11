import { getPillNameDefault, set_hiddenvalues } from './termsetting'
import { make_radios } from '../dom/radiobutton'
import { keyupEnter } from '../client'
import { copyMerge } from '../common/rx.core'

// grades that can be used for q.breaks, exclude uncomputable ones and 0, thus have to hardcode
// if needed, can define from termdbConfig
const cutoffGrades = [1, 2, 3, 4, 5]
const not_tested_grade = -1

export function getHandler(self) {
	return {
		getPillName(d) {
			return getPillNameDefault(self, d)
		},

		getPillStatus() {
			return getPillStatus(self)
		},

		showEditMenu(div) {
			if (self.q.mode == 'discrete') {
				// barchart, cuminc term0/2
				return showMenu_discrete(self, div)
			}
			if (self.q.mode == 'binary') {
				// logistic outcome
				return showMenu_binary(self, div)
			}
			if (self.q.mode == 'time2event') {
				// cuminc term1, cox outcome
				return showMenu_time2event(self, div)
			}
			console.error('invalid q.mode:', self.q.mode)
			throw 'invalid q.mode'
		}
	}
}

function getPillStatus(self) {
	if (self.q.mode == 'discrete') {
		if (self.q.breaks.length == 0) {
			if (self.q.bar_by_grade) {
				if (self.q.value_by_max_grade) return { text: 'Max. Grade' }
				if (self.q.value_by_most_recent) return { text: 'Most Recent Grade' }
				if (self.q.value_by_computable_grade) return { text: 'Any Grade' }
				return { text: 'Error: unknown grade setting', bgcolor: 'red' }
			}
			if (self.q.bar_by_children) return { text: 'Sub-condition' }
		} else {
			return { text: self.q.breaks.length + 1 + ' groups' }
		}
	}
	if (self.q.mode == 'binary' || self.q.mode == 'time2event') return { text: 'Grades ' + self.q.breaks[0] + '-5' }
	return { text: 'Error: unknown q.mode', bgcolor: 'red' }
}

function showMenu_discrete(self, div) {
	const value_type_select = div
		.append('select')
		.style('margin', '10px')
		.style('display', 'block')
		.on('change', () => {
			const i = value_type_select.property('selectedIndex')
			self.q.bar_by_grade = i != 3
			self.q.bar_by_children = i == 3
			self.q.value_by_max_grade = i == 0
			self.q.value_by_most_recent = i == 1
			self.q.value_by_computable_grade = i == 2 || i == 3
			self.dom.tip.hide()
			self.runCallback()
		})
	// 0
	value_type_select.append('option').text('Max grade per patient')
	// 1
	value_type_select.append('option').text('Most recent grade per patient')
	// 2
	value_type_select.append('option').text('Any grade per patient')
	// 3
	if (self.term.subconditions) {
		// only show 4th option when subconditions are available
		value_type_select.append('option').text('Sub-conditions')
	}
	value_type_select.property(
		'selectedIndex',
		self.q.bar_by_children ? 3 : self.q.value_by_computable_grade ? 2 : self.q.value_by_most_recent ? 1 : 0
	)

	if (self.q.bar_by_children) {
		// do not show grade cutoff input
		return
	}

	addBreaksSelector(
		self,
		div
			.append('div')
			.style('margin', '15px 10px 10px 15px')
			.style('padding-left', '10px')
			.style('border-left', 'solid 1px #ededed')
	)
}

function addBreaksSelector(self, div) {
	div
		.append('div')
		.text('Optionally, select cutoff grades to divide grades to groups:')
		.style('width', '300px')
		.style('opacity', 0.5)

	const holder = div
		.append('div')
		.style('margin-top', '10px')
		.style('display', 'grid')
		.style('grid-template-columns', 'auto auto')
		.style('gap', '10px')

	// TODO replace <textarea> with progressive cutoff selector, may keep using ui components for rangeNameDiv
	const textarea = holder
		.append('div')
		.append('textarea')
		.style('width', '80px')
		.style('height', '80px')
		.property('placeholder', 'Enter grade values')
		.on('keyup', () => {
			if (!keyupEnter()) return
			textarea2gradeUI()
		})

	const rangeNameDiv = holder
		.append('div')
		.style('display', 'grid')
		.style('grid-template-columns', 'auto auto')
		.style('gap', '10px')
	const rangeDiv = rangeNameDiv.append('div')
	const nameDiv = rangeNameDiv.append('div')
	if (self.q.breaks.length) {
		textarea.property('value', self.q.breaks.join('\n'))
	}
	textarea2gradeUI()
	function textarea2gradeUI() {
		rangeDiv.selectAll('*').remove()
		nameDiv.selectAll('*').remove()
		const breaks = textarea2breaks()
		if (breaks.length == 0) return
		for (const [i, b1] of breaks.entries()) {
			// each break creates a group
			const rangeCell = rangeDiv
				.append('div')
				.style('opacity', 0.4)
				.style('margin', '5px')
			const nameCell = nameDiv.append('input').style('display', 'block')
			if (i == 0) {
				rangeCell.text('<' + b1)
				nameCell.property('value', 'Grade <' + b1)
			} else {
				const b0 = breaks[i - 1]
				const str = b1 - b0 == 1 ? b0 : b0 + '-' + (b1 - 1)
				rangeCell.text(str)
				nameCell.property('value', 'Grade ' + str)
			}
		}
		// last group
		const b1 = breaks[breaks.length - 1]
		const rangeCell = rangeDiv.append('div').style('opacity', 0.4)
		const nameCell = nameDiv.append('input').style('display', 'block')
		const str = b1 == 5 ? b1 : b1 + '-5'
		rangeCell.text(str)
		nameCell.property('value', 'Grade ' + str)

		// name <input> for all groups are created under nameDiv
		// if q.groupNames are there, override
		if (self.q.groupNames) {
			const lst = nameDiv.selectAll('input').nodes()
			for (const [i, name] of self.q.groupNames.entries()) {
				if (lst[i]) lst[i].value = name
			}
		}
	}

	function textarea2breaks() {
		const str = textarea.property('value').trim()
		if (!str) return []
		const lst = [
			...new Set(
				str
					.split('\n')
					.map(Number)
					.filter(i => Number.isInteger(i) && i >= 1 && i <= 5)
			)
		]
		if (lst.size == 0) return []
		return lst.sort((i, j) => i - j)
	}

	div
		.append('button')
		.text('Apply')
		.style('margin', '10px')
		.on('click', () => {
			self.q.breaks = textarea2breaks()
			self.q.groupNames = []
			for (const i of nameDiv.selectAll('input').nodes()) {
				self.q.groupNames.push(i.value)
			}
			event.target.disabled = true
			event.target.innerHTML = 'Loading...'
			self.runCallback()
		})
}

function showMenu_binary(self, div) {
	const holder = div
		.append('div')
		.style('margin', '10px')
		.style('display', 'grid')
		.style('grid-template-columns', 'auto auto')
		.style('gap', '10px')

	// row 1
	holder
		.append('div')
		.text('Cutoff grade')
		.style('opacity', 0.4)
	const sd = holder.append('div')
	const gradeSelect = sd.append('select').on('change', changeGradeSelect)
	for (const i of cutoffGrades) {
		gradeSelect.append('option').text(self.term.values[i].label)
	}
	// breaks[0] must have already been set
	gradeSelect.property('selectedIndex', self.q.breaks[0] - 1)
	sd.append('div')
		.text('Using maximum grade for each patient.')
		.style('opacity', 0.4)
		.style('font-size', '.7em')

	// row 2
	holder
		.append('div')
		.text('Group 1 name')
		.style('opacity', 0.4)
	const g1n = holder
		.append('div')
		.append('input')
		.style('width', '130px')

	// row 3
	holder
		.append('div')
		.text('Group 2 name')
		.style('opacity', 0.4)
	const g2n = holder
		.append('div')
		.append('input')
		.style('width', '130px')

	changeGradeSelect()

	function changeGradeSelect() {
		const grade = gradeSelect.property('selectedIndex') + 1
		if (!self.q.groupNames) self.q.groupNames = []
		g1n.property('value', self.q.groupNames[0] || 'Grade <' + grade)
		g2n.property('value', self.q.groupNames[1] || 'Grade >=' + grade)
	}

	div
		.append('button')
		.text('Apply')
		.style('margin', '10px')
		.on('click', () => {
			self.q.breaks[0] = gradeSelect.property('selectedIndex') + 1
			self.q.groupNames[0] = g1n.property('value')
			self.q.groupNames[1] = g2n.property('value')
			event.target.disabled = true
			event.target.innerHTML = 'Loading...'
			self.runCallback()
		})
}

function showMenu_time2event(self, div) {
	const holder = div
		.append('div')
		.style('margin', '10px')
		.style('display', 'grid')
		.style('grid-template-columns', '120px auto')
		.style('gap', '10px')

	// row 1
	holder
		.append('div')
		.text('Minimum grade to have event')
		.style('opacity', 0.4)
	const sd = holder.append('div')
	const gradeSelect = sd.append('select').on('change', changeGradeSelect)
	for (const i of cutoffGrades) {
		gradeSelect.append('option').text(self.term.values[i].label)
	}
	// breaks[0] must have already been set
	gradeSelect.property('selectedIndex', self.q.breaks[0] - 1)

	// row 2
	let minYearsToEventValue = self.q.minYearsToEvent
	holder
		.append('div')
		.text('Minimum years to have event')
		.style('opacity', 0.4)
	const nd = holder.append('div')
	const minYearsToEventInput = nd
		.append('input')
		.attr('type', 'number')
		.style('width', '143px')
		.property('value', minYearsToEventValue)
		.on('change', () => {
			minYearsToEventValue = Number(minYearsToEventInput.property('value'))
		})

	// row 3
	holder
		.append('div')
		.text('No event')
		.style('opacity', 0.4)
	const g1n = holder.append('div').style('opacity', 0.4)

	// row 3
	holder
		.append('div')
		.text('Has event')
		.style('opacity', 0.4)
	const g2n = holder.append('div').style('opacity', 0.4)

	changeGradeSelect()

	function changeGradeSelect() {
		const grade = gradeSelect.property('selectedIndex') + 1
		g1n.selectAll('*').remove()
		g2n.selectAll('*').remove()
		const grades = Object.keys(self.term.values)
			.map(Number)
			.sort((a, b) => a - b)
		for (const i of grades) {
			if (i < grade) {
				g1n.append('div').text(self.term.values[i].label)
			} else {
				g2n.append('div').text(self.term.values[i].label)
			}
		}
	}

	let timeScaleChoice = self.q.timeScale
	if (self.q.showTimeScale) {
		// row 4: time scale toggle
		holder
			.append('div')
			.text('Time scale')
			.style('opacity', 0.4)
		const options = [
			{
				label: 'Time from diagnosis', // may define from ds
				value: 'time'
			},
			{ label: 'Age', value: 'age' }
		]
		if (self.q.timeScale == 'age') {
			options[1].checked = true
		} else {
			options[0].checked = true
		}
		make_radios({
			holder: holder.append('div'),
			options,
			styles: { margin: '' },
			callback: v => (timeScaleChoice = v)
		})
	}

	div
		.append('button')
		.text('Apply')
		.style('margin', '10px')
		.on('click', () => {
			self.q.breaks[0] = gradeSelect.property('selectedIndex') + 1
			self.q.minYearsToEvent = minYearsToEventValue
			self.q.timeScale = timeScaleChoice
			event.target.disabled = true // is 'event' initialized?
			event.target.innerHTML = 'Loading...' // is 'event' initialized?
			self.runCallback()
		})
}

export function fillTW(tw, vocabApi, defaultQ) {
	set_hiddenvalues(tw.q, tw.term)

	if (defaultQ) {
		// apply predefined settings
		copyMerge(tw.q, defaultQ)
	}

	// assign default if missing
	if (!tw.q.mode) tw.q.mode = 'discrete'

	// must set up bar/value flags before quiting for inuse:false
	if (tw.q.value_by_max_grade || tw.q.value_by_most_recent || tw.q.value_by_computable_grade) {
		// need any of the three to be set
	} else {
		// set a default one
		tw.q.value_by_max_grade = true
	}
	if (tw.q.bar_by_grade || tw.q.bar_by_children) {
	} else {
		tw.q.bar_by_grade = true
	}

	if (!tw.q.breaks) tw.q.breaks = []
	if (!tw.q.groupNames) tw.q.groupNames = []
	if (tw.q.mode == 'binary') {
		if (tw.q.breaks.length != 1) {
			tw.q.breaks = [1] // HARDCODED
		}
		if (tw.q.groupNames.length != 2) {
			tw.q.groupNames = ['No event' + (tw.term.values[not_tested_grade] ? ' / not tested' : ''), 'Has event']
		}
	}

	if (tw.q.breaks.length >= cutoffGrades.length) throw 'too many values from tw.q.breaks[]'

	if (tw.q.mode == 'time2event') {
		if (!tw.q.timeScale) tw.q.timeScale = 'time'
		if (!['age', 'time'].includes(tw.q.timeScale)) throw 'invalid q.timeScale'
		if (!tw.q.minYearsToEvent) tw.q.minYearsToEvent = 5
	}
}
