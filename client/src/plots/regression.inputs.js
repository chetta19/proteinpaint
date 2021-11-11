import { deepEqual } from '../common/rx.core'
import { select } from 'd3-selection'
import { InputTerm } from './regression.inputs.term'

/*
outcome and independent are two sections sharing same structure
"inputs[]" collect one or multiple variables for each section
"input" tracks attributes from a variable

should be varClass-agnostic "input[input.varClass]"
but not to explicitly access things like "input.term"

**** function cascade ****

constructor
	createSectionConfigs
	initUI
		addSection
		submit (by clicking button)
		editConfig (by termsetting callback)
main
	mayUpdateSandboxHeader
	setDisableTerms
	renderSection
		updateInputs
			mayAddBlankInput
		removeInput
		addInput

FIXME submit button toggling behavior
*/

export class RegressionInputs {
	constructor(opts) {
		this.opts = opts
		this.app = opts.app
		// reference to the parent component's mutable instance (not its API)
		this.parent = opts.parent
		this.regressionType = this.opts.regressionType

		setInteractivity(this)
		setRenderers(this)

		this.createSectionConfigs()
		this.initUI()
	}

	createSectionConfigs() {
		/* Create configuration data for each section of the input UI
		see google doc "Regression UI"
		*/

		// configuration for the outcome variable section
		this.outcome = {
			/*** static configuration ***/
			heading: 'Outcome variable',
			selectPrompt:
				this.opts.regressionType == 'linear'
					? // FIXME use plain text, termsetting should style this with hover effect
					  '<u>Select continuous outcome variable</u>'
					: '<u>Select outcome variable</u>',
			placeholderIcon: '',
			configKey: 'outcome',
			limit: 1,
			exclude_types: this.opts.regressionType == 'linear' ? ['condition', 'categorical', 'survival'] : ['survival'],

			/*** dynamic configuration ***/
			inputs: [],

			/*** tracker for this section's DOM elements ***/
			dom: {}
		}

		// configuration for the independent variable section
		this.independent = {
			/*** static configuration ***/
			heading: 'Independent variable(s)',
			selectPrompt: '<u>Add independent variable</u>',
			placeholderIcon: '',
			configKey: 'independent',
			limit: 10,
			exclude_types: ['condition', 'survival'],

			/*** dynamic configuration ***/
			inputs: [],

			/*** tracker for this section's DOM elements ***/
			dom: {}
		}

		// track sections in an array, for convenience in loops
		// but not for use in `d3.data()`
		this.sections = [this.outcome, this.independent]
	}

	async main() {
		try {
			this.config = this.parent.config
			this.state = this.parent.state
			this.hasError = false
			this.setDisableTerms()
			const updates = []
			for (const section of this.sections) {
				await this.renderSection(section)
				for (const input of section.inputs) {
					input.dom.holder.style('border-left', input[input.varClass] ? '1px solid #bbb' : '')
					if (input.handler) updates.push(input.handler.update(input))
				}
			}
			await Promise.all(updates)
			for (const section of this.sections) {
				for (const input of section.inputs) {
					if ((input[input.varClass] && input[input.varClass].error) || (input.handler && input.handler.hasError)) {
						this.hasError = true
					}
				}
			}
		} catch (e) {
			this.hasError = true
			throw e
		}
	}

	setDisableTerms() {
		this.disable_terms = []
		if (this.config.outcome && this.config.outcome.varClass == 'term') this.disable_terms.push(this.config.outcome.id)
		if (this.config.independent) {
			for (const vb of this.config.independent) {
				if (vb.varClass == 'term') this.disable_terms.push(vb.id)
			}
		}
	}

	handleError() {
		this.hasError = true
		this.dom.submitBtn.property('disabled', true)
	}
}

function setRenderers(self) {
	self.initUI = () => {
		const controls = self.opts.holder.append('div').style('display', 'block')

		self.dom = {
			div: self.opts.holder, //.style('margin', '10px 0px'),
			controls,
			body: controls.append('div'),
			foot: controls.append('div')
		}

		self.dom.submitBtn = self.dom.foot
			.style('margin', '3px 15px')
			.style('padding', '3px 5px')
			.append('button')
			.style('display', 'none')
			.style('padding', '5px 15px')
			.style('border-radius', '15px')
			.text('Run analysis')
			.on('click', self.submit)

		/*
			not using d3.data() here since each section may only
			be added and re-rendered, but not removed
		*/
		for (const section of self.sections) {
			const div = self.dom.body.append('div')
			self.addSection(section, div)
		}
	}

	self.addSection = function(section, div) {
		div
			.style('display', 'none')
			.style('margin', '3px 5px')
			.style('padding', '3px 5px')

		section.dom = {
			holder: div,
			headingDiv: div
				.append('div')
				.style('margin', '3px 5px')
				.style('padding', '3px 5px')
				.style('font-size', '17px')
				.style('color', '#bbb')
				.text(section.heading),

			inputsDiv: div.append('div')
		}
	}

	/* 
		update each section's visibility,
		remove and add inputs as needed,
		and later may do more section restyling based on
		the state of inputs that are being edited
	*/
	self.renderSection = function(section) {
		// decide to show/hide this section
		// only show when this section is for outcome,
		// or this is independent and only show it when the outcome has been selected
		// effect is to force user to first select outcome, then independent, but not to select independent first
		section.dom.holder.style('display', section.configKey == 'outcome' || self.config.outcome ? 'block' : 'none')

		updateInputs(section)
		// section.inputs[] is now synced with plot config

		const inputs = section.dom.inputsDiv
			.selectAll(':scope > div')
			// key function (2nd arg) uses a function to determine how datum and element are joined by variable id
			.data(section.inputs, input => input.varClass && input[input.varClass] && input[input.varClass].id)

		inputs.exit().each(removeInput)

		inputs
			.enter()
			.append('div')
			.each(addInput)
	}

	function updateInputs(section) {
		// get the input variables from config.outcome or config.independent
		const selected = self.config[section.configKey]

		// force the outcome variable into an array for ease of handling
		// the independent variables array will be used as-is
		const selectedArray = Array.isArray(selected) ? selected : selected ? [selected] : []

		// process each selected variable
		for (const variable of selectedArray) {
			const varClass = variable.varClass
			if (!varClass) throw 'varClass missing on an input from config'

			const input = section.inputs.find(
				input => input.varClass == varClass && input[varClass] && input[varClass].id == variable.id
			)
			if (!input) {
				section.inputs.push({
					section,
					varClass,
					[varClass]: variable
				})
			} else {
				// reassign the variable reference to the mutable variable copy
				// from state.config.outcome | .independent
				input[varClass] = variable
			}
		}

		mayAddBlankInput(section)
	}

	async function addInput(input) {
		const inputDiv = select(this)
			.style('width', 'fit-content')
			.style('margin', '15px 15px 5px 45px')
			.style('padding', '0px 5px')

		input.dom = {
			holder: inputDiv
		}

		if (input.varClass == 'term') {
			input.handler = new InputTerm({
				holder: inputDiv.append('div'),
				input,
				parent: self
			})
		} else {
			throw 'addInput: unknown varClass'
		}
	}

	function removeInput(input) {
		/* NOTE: editConfig deletes this input from the section.inputs array */
		input.handler.remove()
		for (const key in input.dom) {
			//input.dom[key].remove()
			delete input.dom[key]
		}
		const div = select(this)
		div
			.transition()
			.duration(500)
			.style('opacity', 0)
			.remove()
	}

	self.resetSubmitButton = () => {
		// do not disable button upon ui error. only disable after clicking button and analysis is running
		self.dom.submitBtn
			.text('Run analysis')
			.style('display', self.config.outcome && self.config.independent.length ? 'block' : 'none')
			.property('disabled', self.hasError)
	}
}

function setInteractivity(self) {
	self.editConfig = async (input, variable) => {
		if (!variable) {
			// the variable has been deleted from this input; will delete this input from section
			const i = input.section.inputs.findIndex(d => d === input)
			if (i == -1) throw `deleting an unknown input`
			// delete this input
			input.section.inputs.splice(i, 1)
		} else {
			// variable is selected for this input
			variable.varClass = input.varClass

			if (input.varClass == 'term') {
				variable.id = variable.term.id // when switching between continuous/discrete for independent, variable.id missing (termsetting issue?)

				// TODO: maybe the following logic can be generalized outside of this code block,
				// so `const prevVar = input[input.varClass]` but that would assume that
				// there will be an `id` property for all input variable classes
				const prevTerm = input.term

				/*
					For a new term (replacing a blank input), the refGrp will be missing.
					In that case, updateTerm() in regression.inputs.term.js will assign a
					default refGrp based on sample counts. 

					For a replacement term that happens to match the previous term's ID, 
					for example adjusting a group other than the refGrp, the refGrp may be 
					reused if there happen to be sample counts for it.
				*/
				if (prevTerm && variable.id === prevTerm.id) {
					for (const k in prevTerm) {
						// reapply any unedited key-values to the variable, such as refGrp
						if (!(k in variable)) variable[k] = prevTerm[k]
					}
				}
				input.term = variable
			} else {
				throw `unknown input.varClass *** TODO: support non-term input classes ***`
			}
		}

		const selected = input.section.inputs
			// get only non-empty inputs
			.filter(input => input.varClass && input[input.varClass])
			.map(input => input[input.varClass])

		// key could be 'outcome' or 'independent'
		const key = input.section.configKey
		// the target config to fill-in/replace/delete may hold one or more selected input variables
		// config.outcome is not an array (exactly one selected variable)
		// config.independent is an array (0 or more selected variables)
		const configValue = Array.isArray(self.config[key]) ? selected : selected[0]

		self.app.dispatch({
			type: 'plot_edit',
			id: self.parent.id,
			chartType: 'regression',
			config: {
				hasUnsubmittedEdits: true,
				// replace config.outcome or config.independent
				[key]: JSON.parse(JSON.stringify(configValue))
			}
		})
	}

	self.submit = () => {
		// disable button upon clicking to prevent double-clicking
		self.dom.submitBtn.property('disabled', true)
		if (self.hasError) {
			alert('Please fix the input variable errors (highlighted in red background).')
			return
		}

		const config = JSON.parse(JSON.stringify(self.config))
		config.hasUnsubmittedEdits = false

		self.app.dispatch({
			type: 'plot_edit',
			id: self.parent.id,
			chartType: 'regression',
			config
		})
	}
}

function mayAddBlankInput(section) {
	// on this section, detect if a blank input needs to be created
	if (section.inputs.length < section.limit) {
		const hasblankInput = section.inputs.find(input => input.varClass && !input[input.varClass])
		if (!hasblankInput) {
			// FIXME should not set varClass=term on blankinput but will allow to choose a varClass supported by this dataset
			// e.g. termdbConfig should tell if this dataset has genetic data, supports samplelst etc
			section.inputs.push({ section, varClass: 'term' })
		}
	}
}
