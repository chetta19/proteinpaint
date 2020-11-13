import * as client from './client'
import { bplen } from './common'
import { event as d3event } from 'd3-selection'
import { legend_newrow } from './block.legend'

export function bedjfromtemplate(tk, template) {
	tk.stackheight = template.stackheight || 12
	tk.stackspace = template.stackspace || 1
	tk.color = tk.color || '#6188FF'

	if (template.usevalue) {
		if (!template.usevalue.key) {
			return '.usevalue.key missing'
		}
		tk.usevalue = {}
		for (const k in template.usevalue) {
			tk.usevalue[k] = template.usevalue[k]
		}
	}
	/*
	since bedj tk is always loaded via ajax from server
	won't break if set it busy here
	this is important for junction tracks
	since somehow some junction tk will finish loading so fast (e.g. with built-in data)
	and the gene bedj track hasn't been loaded yet...
	the splice event finder won't run since no gene data loaded!!!
	*** this is legacy!! remove once new junction track replaced old TODO
	*/
	tk.busy = true
	return null
}

export function bedjmaketk(tk, block) {
	tk.img = tk.glider.append('image')
	tk.tklabel.text(tk.name).each(function() {
		tk.leftLabelMaxwidth = this.getBBox().width
	})

	if (tk.categories && block.legend && block.legend.holder) {
		// has categories, block supports legend, show entry
		const [tr, td] = legend_newrow(block, tk.name)
		tk.tr_legend = tr
		client.category2legend(tk.categories, td)
		tr.style('display', 'none')
		client.appear(tr, 'table-row')
	}

	tk.config_handle = block.maketkconfighandle(tk).on('click', () => {
		configpanel(tk, block)
	})
}

function arg2lst(a) {
	// TODO tkarg_bedj to stringify json objects
	const lst = []
	for (const k in a) {
		const v = a[k]
		lst.push(k + '=' + encodeURIComponent(typeof v == 'object' ? JSON.stringify(v) : v))
	}
	return lst.join('&')
}

export function bedjload(tk, block) {
	if (block.viewrangeabovelimit(tk.viewrangeupperlimit)) {
		block.tkcloakoff(tk, { error: tk.name + ': zoom in under ' + bplen(tk.viewrangeupperlimit) + ' to view data' })
		tk.height_main = 30
		tk.img.attr('width', 1).attr('height', 1)
		block.block_setheight()
		return
	}

	block.tkcloakon(tk)
	const arg = block.tkarg_bedj(tk)
	if (tk.__isgene) {
		// is native gene track
		if (!block.gmmode || block.gmmode == client.gmmode.genomic) {
			/*
			not in gene-view
			will provide the flag to server to request gene model data for client use:
			- junction
			*/
			arg.__isgene = true
		}
	}

	client
		.dofetch2('tkbedj?' + arg2lst(arg)) // to add serverdata
		.then(data => {
			if (tk.__isgene) {
				/*
			may receive gene data
			!! gene data must be appended prior to tkcloakoff()
			which calls block.ifbusy(), and will trigger the gene data-based tk-specific actions
			which cannot run if tk.gmdata[] is not updated
			*/
				if (data.returngmdata) {
					tk.gmdata = data.returngmdata
				} else {
					// TODO tell if there is too many genes or no gene
					delete tk.gmdata
				}
			}
			if (data.error) throw { message: data.error }

			tk.img
				.attr('width', block.width)
				.attr('height', data.height)
				.attr('xlink:href', data.src)

			tk.height_main = tk.toppad + data.height + tk.bottompad
			return data
		})
		.catch(err => {
			tk.height_main = 30
			if (err.stack) {
				console.log(err.stack)
			}
			return { error: err.message }
		})
		.then(data => {
			block.tkcloakoff(tk, data)
			block.block_setheight()
			block.bedj_tooltip(tk, data)
		})
}

export function bedjloadsubpanel(tk, block, panel) {
	if (tk.viewrangeupperlimit && tk.viewrangeupperlimit >= panel.stop - panel.start) {
		panel.height = 30
		panel.img.attr('width', 1).attr('height', 1)
		block.block_setheight()
		return
	}

	const arg = block.tkarg_bedj(tk)
	arg.width = panel.width
	arg.rglst = [
		{
			chr: panel.chr,
			start: panel.start,
			stop: panel.stop,
			width: panel.width
		}
	]

	if (tk.__isgene) {
		// is native gene track
		if (!block.gmmode || block.gmmode == client.gmmode.genomic) {
			/*
			not in gene-view
			will provide the flag to server to request gene model data for client use:
			- junction
			*/
			arg.__isgene = true
		}
	}

	block.tkcloakon_subpanel(panel)

	client
		.dofetch2('tkbedj?' + arg2lst(arg))
		.then(data => {
			if (tk.__isgene) {
				/*
			may receive gene data
			!! gene data must be appended prior to tkcloakoff()
			which calls block.ifbusy(), and will trigger the gene data-based tk-specific actions
			which cannot run if tk.gmdata[] is not updated
			*/
				if (data.returngmdata) {
					panel.gmdata = data.returngmdata
				} else {
					delete panel.gmdata
				}
			}
			if (data.error) throw { message: data.error }

			panel.img
				.attr('width', panel.width)
				.attr('height', data.height)
				.attr('xlink:href', data.src)

			panel.height = data.height + tk.toppad + tk.bottompad
			return data
		})
		.catch(err => {
			panel.height = 30
			if (err.stack) {
				console.log(err.stack)
			}
			return { error: err.message }
		})
		.then(data => {
			block.tkcloakoff_subpanel(panel, data)
			block.block_setheight()
			block.bedj_tooltip(tk, data, panel)
		})
}

function configpanel(tk, block) {
	tk.tkconfigtip.clear().showunder(tk.config_handle.node())
	const holder = tk.tkconfigtip.d

	// height
	{
		const row = holder.append('div').style('margin-bottom', '10px')
		row.append('span').html('Item height&nbsp;')
		row
			.append('input')
			.property('value', tk.stackheight)
			.attr('size', 5)
			.on('keyup', () => {
				if (d3event.code != 'Enter' && d3event.code != 'NumpadEnter') return
				const s = d3event.target.value
				if (s == '') return
				const v = Number.parseInt(s)
				if (Number.isNaN(v) || v <= 0) {
					alert('please use positive integer for height')
					return
				}
				tk.stackheight = v
				bedjload(tk, block)
			})
	}
	if (!tk.categories) {
		// color
		const row = holder.append('div')
		row.append('span').html('Color&nbsp;')
		row
			.append('input')
			.property('value', tk.color)
			.attr('type', 'color')
			.on('change', () => {
				tk.color = d3event.target.value
				bedjload(tk, block)
			})
	}
}
