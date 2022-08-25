import { getCompInit } from '#rx'
import { rgb } from 'd3-color'
import { openSandbox } from './adSandbox'
import { event } from 'd3-selection'

class AppDrawerCard {
	// handles types 'card' and 'nestedCard'
	constructor(opts) {
		this.type = 'card'
		this.opts = this.validateOpts(opts)
		this.holder = opts.holder
		this.pageArgs = opts.pageArgs
		setInteractivity(this)
		setRenderers(this)
	}

	validateOpts(opts) {
		if (!opts.element.name) throw `Card .name is missing`
		if (!opts.element.section) throw `.section is missing for card=${opts.element.name}`
		if (opts.element.type == 'card') {
			if (!opts.element.sandboxJson && !opts.element.sandboxHtml)
				throw `Either .sandboxJson or .sandboxHtml is missing for card=${opts.element.name}`
		}
		if (opts.element.type == 'nestedCard') {
			if (!opts.element.children || opts.element.children.length == 0)
				throw `Missing .children for nested card = ${opts.element.name}`
		}
		if (opts.element.ribbon) {
			if (!opts.element.ribbon.text) throw `Missing ribbon .text for ${opts.element.type} = ${opts.element.name}`

			//ProteinPaint app drawer specific validation
			if (
				(opts.element.ribbon.text.toUpperCase() == 'NEW' || opts.element.ribbon.text.toUpperCase() == 'UPDATED') &&
				!opts.element.ribbon.expireDate
			)
				throw `${opts.element.type} = ${
					opts.element.name
				} ribbon is ${opts.element.ribbon.text.toUpperCase()} but .expireDate is missing. Please provide`

			if (opts.element.ribbon.expireDate) {
				if (opts.element.ribbon.expireDate >= 0) {
					throw `Flag for ${opts.element.type} = ${opts.element.name} is not a valid date`
				} //TODO add validation for format?
			}
		}
		return opts
	}

	main() {}
}

export const cardInit = getCompInit(AppDrawerCard)

function setRenderers(self) {
	const card = self.holder.append('li')
	if (self.opts.element.type == 'card') {
		card
			.classed('sjpp-track', true)
			/*TODO: 
			1. optional non image card layout
			2. responsiveness of image on window resize 
				- expand image size on resize
				- non square, take better use of space
				- solve problem of cards 'stretching' when only one is available
			*/
			.html(
				`<div class="sjpp-track-h"><span style="font-size:14.5px;font-weight:500;">${
					self.opts.element.name
				}</span></div>
				${
					self.opts.element.description
						? `<span class="sjpp-track-blurb" style="cursor:default">${self.opts.element.description}</span></div>`
						: ''
				}
				<span class="sjpp-track-image"><img src="${self.opts.element.image}" alt="${
					self.opts.element.description
				}"></img></span>
				</div>`
			)
	} else if (self.opts.element.type == 'nestedCard') {
		card.classed('sjpp-app-drawer-card', true).html(
			`<p style="margin-left: 12px; font-size:14.5px;font-weight:500; display: block;">${self.opts.element.name}</p>
			<p style="display: block; font-size: 13px; font-weight: 300; margin-left: 20px; justify-content: center; font-style:oblique; color: #403f3f;">${self.opts.element.description}</p>`
		)
	}

	self.makeRibbon = function(ribbon) {
		//only relevant for 'card', not 'nestedCard'
		const ribbonDiv = card
			.append('div')
			.classed('sjpp-app-drawer-card-ribbon', true)
			.style('align-items', 'center')
			.style('justify-content', 'center')

		//*********TODO: move from diagonal to straight on right side */
		const text = ribbon.text.toUpperCase()
		//Enfore color palette for proteinpaint homepage ribbons
		const color =
			text == 'BETA'
				? '#418cb5'
				: text == 'NEW'
				? '#1ba176'
				: text == 'UPDATED'
				? 'orange'
				: ribbon.color
				? ribbon.color
				: 'red'

		ribbonDiv
			.append('span')
			.text(text) // Need fn in utils to decide black or white text in utils.js
			.style('color', 'white')
			.style('background-color', rgb(color).darker()) // May remove with contrast fn (??)
			.style('height', 'auto')
			.style('width', '100%')
			.style('top', '15%')
			.style('left', '-30%')
			.style('font-size', '11.5px')
			.style('text-transform', 'uppercase')
			.style('text-align', 'center')
	}

	if (self.opts.element.ribbon) {
		const today = new Date()
		self.opts.element.ribbonExpireDate = new Date(self.opts.element.ribbon.expireDate)
		//Allows ribbons to expire or appear indefinitely
		if (self.opts.element.ribbonExpireDate > today || self.opts.element.ribbon.expireDate == undefined)
			self.makeRibbon(self.opts.element.ribbon)
	}

	card.on('click', async () => {
		event.stopPropagation()
		self.opts.pageArgs.apps_off()
		await openSandbox(self.opts.element, self.opts.pageArgs)
	})
}

function setInteractivity(self) {}
