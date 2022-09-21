import { getInitFxn } from '#rx'
import * as utils from './utils'
import { event } from 'd3-selection'
import { openSandbox } from './adSandbox'
import { slideDrawer } from './mainBtn'

/*
.opts{
	.app{
		.holder
		.element{}
		.sandboxDiv
	}
}
*/

class AppDrawerButton {
	constructor(opts) {
		this.type = 'button' // works for 'dsButton'. May expand to other button types
		this.opts = this.validateOpts(opts)
		this.holder = opts.holder
		this.dom = opts.dom
		this.sandboxDiv = opts.sandboxDiv
		setRenderers(this)
	}

	validateOpts(opts) {
		if (!opts.element.name) throw `Button name is missing`
		if (!opts.element.section) throw `.section is missing for button=${opts.element.name}`
		if (!opts.element.sandboxJson && !opts.element.sandboxHtml)
			throw `Either .sandboxJson or .sandboxHtml is missing for button=${opts.element.name}`
		return opts
	}

	main() {}
}

export const buttonInit = getInitFxn(AppDrawerButton)

function setRenderers(self) {
	const btn = utils.makeButton({ div: self.holder, text: self.opts.element.name, margin: '20px 20px 0px' })
	btn.attr('class', 'sjpp-appdrawer-dataset-btn').on('click', async () => {
		event.stopPropagation()
		self.app.dispatch({
			type: 'is_apps_btn_active',
			value: false
		})
		// Will not update appropriately without waiting for dispatch
		// Better solution?
		setTimeout(() => {
			slideDrawer(self)
		}, 1)
		await openSandbox(self.opts.element, self.opts)
	})
}
