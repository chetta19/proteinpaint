import * as client from './client'
import * as common from './common'
import {axisLeft,axisBottom} from 'd3-axis'
import {scaleLinear,scaleOrdinal,schemeCategory10} from 'd3-scale'
import {select as d3select,selectAll as d3selectAll,event as d3event} from 'd3-selection'



/*
obj:
.holder
.legendtable
.genome {}


********************** EXPORTED
init()
********************** INTERNAL
init_dataset_config
init_a_plot
loadPlot
doPlot

*/



const radius=3



export async function init (obj,holder, debugmode) {
/*
obj{}
.genome
.mds

.plotlist[ {} ]
	optional, predefined sample sets, the same from embedding api
	when provided, will show plot rightaway and won't show controls
	.type
	.samplerule{}
		.full{}
			.byattr
		.set{}

when plotlist is missing, following will be used to set up control ui
thus to be made into samplerule.set{}

.geneexpression{}
	.gene{}
		.name/chr/start/stop

.mutation{}
	.anyornone
	.chr/start/stop

	providing following to apply a type of mutation in dividing sample
	.snvindel{}
	.cnv{}
	.loh{}
	.fusion{}
	.sv{}
	.itd{}
*/

	if(debugmode) {
		window.obj = obj
	}

	obj.plots = []

	obj.menu = new client.Menu({padding:'5px'})
	obj.tip = new client.Menu({padding:'5px'})

	obj.errordiv = holder.append('div')
		.style('margin','10px')

	obj.sayerror = e=>{
		client.sayerror(obj.errordiv, typeof(e)=='string' ? e : e.message)
		if(e.stack) console.log(e.stack)
	}

	///////////// following are tests

	obj.uidiv = holder.append('div')
		.style('margin','20px')
	obj.plotdiv = holder.append('div')
		.style('margin','20px')
	obj.legendtable = holder.append('table')
		.style('border-spacing','5px')

	try {

		await init_dataset_config( obj )
		/* got:
		.plottypes[]
		.samplegroupings[ {} ]
		*/

		if(!obj.plotlist) {
			obj.plotlist = []
		}
		if(!Array.isArray(obj.plotlist)) throw '.plotlist should be array'
		if(obj.plotlist.length==0) {
			// init a default plot with just plot type, no other detail
			const p = {
				type: obj.plottypes[0].key
			}
			obj.plotlist.push(p)
		}
		for(const p of obj.plotlist) {
			init_a_plot( p, obj )
		}

	} catch(e) {
		if(e.stack) console.log(e.stack)
		obj.sayerror('Cannot make plot: '+(e.message||e))
	}
}








function init_dataset_config(obj) {
	const par = {
		genome: obj.genome.name,
		dslabel: obj.mds.label,
		init: 1,
	}
	return client.dofetch('mdssurvivalplot', par)
	.then(data=>{
		if(data.error) throw data.error
		if(!data.plottypes) throw 'plottypes[] missing'
		obj.plottypes = data.plottypes
		obj.samplegroupings = data.samplegroupings
	})
}



function init_a_plot( p, obj ) {
/*
init ui for plot maker
each time it runs it create a plot object along with control options
currently it only run once
user need to press button to actually render the plot

options for making sample rules
must push button to re-render
*/


	// necessary init
	if(!p.samplerule) {
		p.samplerule = {}
	}
	if(!p.samplerule.full) {
		p.samplerule.full = {}
	}


	// contains all pieces of this plot
	const div = obj.uidiv.append('div')
		.style('margin','20px')

	if(obj.plottypes.length>1) {
		// multiple plot types, select one
		const s = div
			.append('div')
			.style('margin-bottom','10px')
			.append('select')
			.on('change',()=>{
				p.type = d3event.target.options[ d3event.target.selectedIndex].value
			})
		for(const t of obj.plottypes) {
			s.append('option')
				.text(t.name)
				.property('value', t.key)
		}
	}


	if(obj.samplegroupings) {
		/*
		sample groupings is for setting samplerule.full

		[ {} ]
		.key
		.label
		.values[ {} ]
			.value
			.count
		*/

		const row = div.append('div')
			.style('margin-bottom','20px')
		row.append('span')
			.html('Choose samples from&nbsp;')
			.style('opacity',.5)

		// apply default setting if not set
		if(!p.samplerule.full.useall) {
			p.samplerule.full.byattr = 1
			if(!p.samplerule.full.key) {
				p.samplerule.full.key   = obj.samplegroupings[0].key
				p.samplerule.full.value = obj.samplegroupings[0].values[0].value
			}
		}

		// generate controls and set <select> according to what's defined in samplerule.full{}

		const attr2select = {}

		const s = row.append('select')
			.style('margin-right','5px')
			.on('change',()=>{
				for(const k in attr2select) {
					attr2select[ k ].style('display','none')
				}
				const o = d3event.target.options[ d3event.target.selectedIndex ]
				if(o.useall) {
					// user selects to use all samples
					p.samplerule.full.useall = 1
					delete p.samplerule.full.byattr
					return
				}
				delete p.samplerule.full.useall
				p.samplerule.full.byattr = 1
				p.samplerule.key = o.key
				const s3 = attr2select[ o.key ]
				s3.style('display', 'inline')
				p.samplerule.full.value = s3.node().options[ s3.node().selectedIndex ].value
			})

		for(const [i,attr] of obj.samplegroupings.entries() ) {

			const o = s.append('option')
				.text(attr.label)
				.property('key', attr.key)

			const usingthisattr = p.samplerule.full.byattr && p.samplerule.full.key==attr.key
			if(usingthisattr) {
				// flip
				o.property('selected',1)
			}

			const s2 = row.append('select')
				.on('change',()=>{
					p.samplerule.full.value = d3event.target.options[d3event.target.selectedIndex].value
				})

			attr2select[ attr.key ] = s2

			s2.style('display', usingthisattr ? 'inline' : 'none')

			for(const v of attr.values) {
				s2.append('option')
					.text(v.value+' (n='+v.count+')')
					.property('value',v.value)
			}
		}

		// option of using all samples
		const o = s.append('option')
			.text('all samples')
			.property('useall',1)
		if(p.samplerule.full.useall) {
			o.property('selected',1)
		}

	} else {
		p.samplerule.full.useall = 1
	}


	/*
	possible group-dividing rules are now driven by what's in samplerule.set
	*/

	if(p.samplerule.set) {

		const st = p.samplerule.set // shorthand

		if(obj.geneexpression) {
			/*
			divide samples by expression cutoff
			TODO validate or throw
			*/
			p.samplerule.set = {
				genevaluepercentilecutoff:1,
				cutoff: 50,
				gene: obj.geneexpression.gene,
				chr: obj.geneexpression.chr,
				start: obj.geneexpression.start,
				stop: obj.geneexpression.stop
			}
			const row = div.append('div')
				.style('margin-bottom','10px')
			row.append('span')
				.html('Divide samples by '+obj.geneexpression.gene+' expression&nbsp;')

			const s = row.append('select')
				.on('change',()=>{
					const o = d3event.target.options[ d3event.target.selectedIndex]
					if(o.median) {
						p.samplerule.set.genevaluepercentilecutoff=1
						p.samplerule.set.cutoff=50
						delete p.samplerule.set.genevaluequartile
					} else if(o.quartile){
						p.samplerule.set.genevaluequartile=1
						delete p.samplerule.set.genevaluepercentilecutoff
						delete p.samplerule.set.cutoff
					}
				})

			s.append('option')
				.text('median (group=2)')
				.property('median',1)
			s.append('option')
				.text('quartile (group=4)')
				.property('quartile',1)

			// other percentile
		}


		if(st.mutation) {
			/*
			divide samples by mutations
			*/
			if(st.snvindel) {
				const row = div.append('div')
					.style('margin-bottom','20px')

				if(st.snvindel.name) {
					// name is the mutation, allow to choose whether to limit to this specific mutation

					row.append('span').html('SNV/indel&nbsp;')

					const s = row.append('select')
					s.append('option')
						.text(st.snvindel.name)
						.property('named',1)
					s.append('option')
						.text('any mutation at '+st.chr+':'+st.start)

				} else {
					// no mutation name
					row.append('span').text('SNV/indel at '+st.chr+':'+st.start)
				}
			}
			if(st.cnv) {
				const row = div.append('div')
					.style('margin-bottom','20px')
				row.append('span').html('Copy number variation over '+st.chr+':'+st.start+'-'+st.stop+' <span style="font-size:.7em">'+common.bplen(st.stop-st.start)+'</span>&nbsp;')
			}
		}
	}


	div.append('button')
		.text('Make plot')
		.on('click',()=>{
			loadPlot( p, obj)
		})


	if(!p.width) p.width=500
	if(!p.height) p.height=500
	if(!p.toppad) p.toppad=10
	if(!p.rightpad) p.rightpad=10
	if(!p.xaxispad) p.xaxispad=10
	if(!p.yaxispad) p.yaxispad=10
	if(!p.xaxish) p.xaxish=40
	if(!p.yaxisw) p.yaxisw=65
	if(!p.censorticksize) p.censorticksize=6
	if(!p.tickfontsize) p.tickfontsize=14
	if(!p.labfontsize) p.labfontsize=15


	p.d = obj.plotdiv.append('div').style('margin','20px'),

	p.legend = {
		d_samplefull: p.d.append('div').style('margin','10px'),
		d_curves: p.d.append('div').style('margin','10px')
	}

	p.svg = p.d.append('svg')


	if(p.renderplot) {
		loadPlot( p, obj )
	}
}



function doPlot( plot, obj ) {
	/*
	make one plot
	.samplesets[]
		.name
		.steps[]
			.x/y
			.censored[]
	*/
	const colorfunc = scaleOrdinal(schemeCategory10)

	let maxx = 0
	for(const curve of plot.samplesets) {
		curve.color = colorfunc( curve.name )
		for(const s of curve.steps) {
			maxx = Math.max(maxx, s.x)
		}
	}

	plot.svg.selectAll('*').remove()
	// curves
	{
		const g = plot.svg.append('g')
			.attr('transform','translate('+(plot.yaxisw+plot.yaxispad)+','+(plot.toppad)+')')
		for(const curve of plot.samplesets) {
			const ticks = []
			const pathd = ['M 0 0']
			for(const s of curve.steps) {
				pathd.push('H '+(plot.width*s.x/maxx))
				const y = plot.height * (s.y+s.drop)
				pathd.push('V '+ y)
				if(s.censored) {
					const y = plot.height * s.y
					for(const c of s.censored) {
						const x = plot.width*c/maxx
						ticks.push('M '+(x-plot.censorticksize/2)+' '+(y-plot.censorticksize/2)
							+' l '+plot.censorticksize+' '+plot.censorticksize
							+' M '+(x+plot.censorticksize/2)+' '+(y-plot.censorticksize/2)
							+' l -'+plot.censorticksize+' '+plot.censorticksize
							)
					}
				}
			}
			g.append('path')
				.attr('d', pathd.join(' '))
				.attr('stroke',curve.color)
				.attr('fill','none')
			if(ticks.length) {
				g.append('path')
					.attr('d', ticks.join(' '))
					.attr('stroke', curve.color)
					.attr('fill','none')
			}
		}
	}
	// y axis
	{
		const g = plot.svg.append('g')
			.attr('transform','translate('+(plot.yaxisw)+','+(plot.toppad)+')')
		client.axisstyle({
			axis: g.call( axisLeft().scale(
				scaleLinear().domain([0,1]).range([plot.height,0])
				)
			),
			showline:1,
			fontsize:plot.tickfontsize,
		})
		plot.svg.append('g')
			.attr('transform','translate('+(plot.labfontsize)+','+(plot.toppad+plot.height/2)+')')
			.append('text')
			.text('Survival')
			.attr('font-size',plot.labfontsize)
			.attr('transform','rotate(-90)')
	}
	// x axis
	{
		const g = plot.svg.append('g')
			.attr('transform','translate('+(plot.yaxisw+plot.yaxispad)+','+(plot.toppad+plot.height+plot.xaxispad)+')')
		client.axisstyle({
			axis: g.call( axisBottom().scale(
				scaleLinear().domain([0,maxx]).range([0,plot.width])
				)
			),
			showline:1,
			fontsize:plot.tickfontsize
		})
		plot.svg.append('text')
			.attr('font-size', plot.labfontsize)
			.text( obj.plottypes.find(i=>i.key==plot.type).timelabel )
			.attr('x', plot.yaxisw+plot.yaxispad+plot.width/2)
			.attr('y', plot.toppad+plot.height+plot.xaxispad+plot.xaxish-3)
	}
	plot.svg
		.attr('width', plot.yaxisw+plot.yaxispad+plot.width+plot.rightpad)
		.attr('height', plot.toppad+plot.height+plot.xaxispad+plot.xaxish)

	// legend
	plot.legend.d_curves.selectAll('*').remove()
	for(const c of plot.samplesets) {
		plot.legend.d_curves.append('div')
			.style('margin','3px')
			.html('<span style="background:'+c.color+'">&nbsp;&nbsp;</span> '+c.name)
	}
}




function loadPlot (plot, obj) {
	const par = {
		genome: obj.genome.name,
		dslabel: obj.mds.label,
		type: plot.type,
		samplerule: plot.samplerule,
	}
	client.dofetch('mdssurvivalplot', par)
	.then(data=>{
		if(data.error) throw data.error
		if(!data.samplesets) throw 'samplesets[] missing'
		plot.samplesets = data.samplesets
		doPlot( plot, obj )
	})
	.catch(e=>{
		obj.sayerror(e)
	})
}
















