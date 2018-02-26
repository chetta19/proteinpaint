import * as client from './client'
import {select as d3select,event as d3event} from 'd3-selection'
import {rgb as d3rgb} from 'd3-color'
import {axisTop, axisLeft, axisRight} from 'd3-axis'
import {scaleLinear} from 'd3-scale'
import * as common from './common'
import * as expressionstat from './block.mds.expressionstat'
import {
	tooltip_singleitem,
	click_multi_singleitem,
	tooltip_multi_vcfdense,
	click_multi_vcfdense,
	tooltip_multi_svdense,
	click_multi_svdense,
	tooltip_samplegroup,
	click_samplegroup_showtable,
	click_samplegroup_showmenu
	} from './block.mds.svcnv.clickitem'
import {
	makeTk_legend,
	may_legend_mclass,
	may_legend_mutationAttribute,
	may_legend_svchr,
	may_legend_samplegroup
	} from './block.mds.svcnv.legend'
import {render_singlesample} from './block.mds.svcnv.single'
import {createbutton_addfeature, may_show_samplematrix_button} from './block.mds.svcnv.samplematrix'
import {vcfparsemeta} from './vcf'

/*
JUMP __multi __maketk __sm

makeTk()
render_samplegroups
	prep_samplegroups
	render_multi_vcfdense
	render_multi_svdense
	render_multi_cnvloh
		** focus_singlesample
	render_multi_genebar
		genebar_config
render_singlesample
	render_singlesample_sv
	render_singlesample_stack
configPanel()
createbutton_focusvcf





sv-cnv-vcf-fpkm ranking, two modes
	multi-sample:
		one row per sample
		two forms:
			dense
				sv breakpoint density in separate track
				cnv shown densily
			full
				cnv & sv shown together at sample-level
	single-sample:
		show cnv & sv data from a single sample
		indicated by tk.singlesample {name:"samplename"}
		spawn from sample group, mode won't mutate
		fpkm ranking shown as independent track

sv/cnv/loh data mixed in same file, sv has _chr and _pos which are indexing fields, along with chrA/posA/chrB/posB
fpkm data in one file, fpkm may contain Yu's results on ASE/outlier
*/




const labyspace = 5
export const intrasvcolor = '#858585' // inter-chr sv color is defined on the fly
const cnvhighlightcolor = '#E8FFFF'
const minlabfontsize=7
const minsvradius=5
const svdensitynogroupcolor='#40859C'
//const fpkmbarcolor='#40859C'
const fpkmbarcolor_bg='#222'
const leftlabelticksize=5

const hardcode_cellline='CELLLINE'
const novalue_max_cnvloh=0 // for max scale of log2ratio and segmean, if there is no cnv or loh data in view range


// x space between label and box/circle
export const labelspace = 5 // when label is shown outside of box, the space between them

const stackheightscale = scaleLinear()
	.domain([ 1, 3, 5, 10 ])
	.range([  8, 4, 2, 1 ])




export function loadTk( tk, block ) {

	block.tkcloakon(tk)
	block.block_setheight()

	if(tk.uninitialized) {
		makeTk(tk,block)
		delete tk.uninitialized
	}

	Promise.resolve()
	.then( ()=>{

		if(tk.iscustom && tk.checkvcf && !tk.checkvcf.info) {
			// load vcf meta keep on client for parsing vcf data
			const arg = {
				file: tk.checkvcf.file,
				url: tk.checkvcf.url,
				indexURL: tk.checkvcf.indexURL
			}
			return fetch( new Request( block.hostURL+'/vcfheader', {
				method:'POST',
				body:JSON.stringify(arg)
			}))
			.then(data=>{return data.json()})
			.then( data => {

				const [info,format,samples,errs]=vcfparsemeta(data.metastr.split('\n'))
				if(errs) throw({message:'Error parsing VCF meta lines: '+errs.join('; ')})
				tk.checkvcf.info = info
				tk.checkvcf.format = format
				tk.checkvcf.samples = samples
				tk.checkvcf.nochr = common.contigNameNoChr(block.genome,data.chrstr.split('\n'))

			})
		}
	})
	.then(()=>{

		/*
		if error, throw error
		if no data, throw {message:"no data"}
		else, set tk height and quiet
		*/
		return loadTk_do( tk, block )
	})
	.catch( err=>{
		tk.height_main = 50

		if(err.nodata) {
			// no data to render
			trackclear( tk )
			return {error:tk.name+': no data in view range'}
		}
		if(err.stack) console.error( err.stack )
		return {error: err.message}
	})
	.then( _final=>{
		block.tkcloakoff( tk, {error: _final.error})
		block.block_setheight()
		block.setllabel()
	})
}






function loadTk_do( tk, block ) {

	const par={
		jwt:block.jwt,
		genome:block.genome.name,
		rglst: block.tkarg_maygm(tk),
	}

	if(block.subpanels.length == tk.subpanels.length) {
		/*
		must wait when subpanels are added to tk
		this is only done when block finishes loading data for main tk
		*/
		for(const [idx,r] of block.subpanels.entries()) {
			par.rglst.push({
				chr: r.chr,
				start: r.start,
				stop: r.stop,
				width: r.width,
				exonsf: r.exonsf,
				subpanelidx:idx,
			})
		}
	}

	addLoadParameter( par, tk )

	return fetch( new Request(block.hostURL+'/mdssvcnv', {
		method:'POST',
		body:JSON.stringify(par)
	}))
	.then(data=>{return data.json()})
	.then(data=>{

		// throw errors

		if(data.error) throw({message:data.error})

		/*
		must keep the loaded "raw" data in _data_vcf, so it can later apply class filter without having to reload from server
		on serverside, the "class" won't be parsed out from csq, without gmmode/isoform info of the client
		*/
		tk._data_vcf = data.data_vcf

		tk.vcfrangelimit = data.vcfrangelimit // range too big
		vcfdata_prepmclass(tk, block) // data for display is now in tk.data_vcf[]
		applyfilter_vcfdata(tk)

		tk.tklabel.each(function(){
			tk.leftLabelMaxwidth = this.getBBox().width
		})


		if(tk.singlesample) {


			if(!data.lst || data.lst.length==0) {
				// no cnv/sv
				if(!tk.data_vcf || tk.data_vcf.length==0) {
					// no vcf, nothing to show
					throw({nodata:1})
				}
			}
			tk.data = data.lst

		} else {


			if(!data.samplegroups || data.samplegroups.length==0) {
				// server has merged vcf samples into samplegroups
				throw({nodata:1})
			}
			tk._data = data.samplegroups
			tk.gene2coord = data.gene2coord
			tk.expressionrangelimit = data.expressionrangelimit
		}

		// preps common to both single and multi sample
		tk.legend_svchrcolor.interchrs.clear()
		tk.legend_svchrcolor.row.style('display','none')

		may_map_vcf(tk, block)

		if(tk.singlesample) {
			render_singlesample( tk, block )
		} else {
			render_samplegroups( tk, block )
		}
		return {}
	})
}





export function trackclear(tk) {
	if(tk.singlesample) {
		tk.svvcf_g.selectAll('*').remove()
		tk.cnv_g.selectAll('*').remove()
		tk.cnvcolor.cnvlegend.row.style('display','none')
		tk.cnvcolor.lohlegend.row.style('display','none')
		return
	}
	tk.cnvleftg.selectAll('*').remove()
	tk.vcfdensitylabelg.selectAll('*').remove()
	tk.vcfdensityg.selectAll('*').remove()
	tk.svdensitylabelg.selectAll('*').remove()
	tk.svdensityg.selectAll('*').remove()
	tk.cnvmidg.selectAll('*').remove()
	tk.cnvrightg.selectAll('*').remove()
}






function addLoadParameter( par, tk ) {

	if(tk.iscustom) {
		par.iscustom=1
		par.file=tk.file
		par.url=tk.url
		par.indexURL=tk.indexURL
		if(tk.checkexpressionrank) {
			par.checkexpressionrank={}
			for(const k in tk.checkexpressionrank) {
				par.checkexpressionrank[k]=tk.checkexpressionrank[k]
			}
		}
		if(tk.checkvcf) {
			par.checkvcf = {
				file: tk.checkvcf.file,
				url: tk.checkvcf.url,
				indexURL: tk.checkvcf.indexURL,
				nochr: tk.checkvcf.nochr
			}
		}
	} else {
		par.dslabel=tk.mds.label
		par.querykey=tk.querykey
	}

	// cnv
	if(tk.valueCutoff) par.valueCutoff=tk.valueCutoff
	if(tk.bplengthUpperLimit) par.bplengthUpperLimit=tk.bplengthUpperLimit
	if(tk.showonlycnvwithsv) par.showonlycnvwithsv=1

	// loh
	if(tk.segmeanValueCutoff) par.segmeanValueCutoff=tk.segmeanValueCutoff
	if(tk.lohLengthUpperLimit) par.lohLengthUpperLimit=tk.lohLengthUpperLimit

	if(tk.singlesample) {

		par.singlesample = tk.singlesample.name

	} else {

		if(tk.legend_samplegroup && tk.legend_samplegroup.hidden.size) {
			par.hiddensgnames = [ ...tk.legend_samplegroup.hidden ]
		}
	}

	if(tk.mutationAttribute) {
		// mutation attribute applicable to all data types
		const key2value={}
		let hashidden=false
		for(const key in tk.mutationAttribute.attributes) {
			const attr = tk.mutationAttribute.attributes[key]
			if(attr.hidden && attr.hidden.size) {
				key2value[key] = [...attr.hidden]
				hashidden=true
			}
		}
		if(hashidden) {
			par.mutationAttributeHidden = key2value
		}
	}

	{
		// from mclass.hidden, only dt are used for filtering, vcf class currently filter on client
		const hiddendt = []
		for(const k of tk.legend_mclass.hidden) {
			if(Number.isInteger(k)) hiddendt.push(k)
		}
		if(hiddendt.length) {
			par.hiddendt = hiddendt
		}
	}
}













/////////////////////// __multi





function render_samplegroups( tk, block ) {

	/*
	multi-sample
	dense or full

	a sample should have 1 or more of cnv/sv/loh/itd/snvindel, cannot be empty
	sv that are fully in view range will be shown as 2 circles
	one sample per row, equal row height
	for dense/full

	draw stack items first (cnv/loh/itd); then sv; then vcf

	in dense mode, sv won't involve in tk.samplegroups
	need sv in separate list for dense plot
	*/

	trackclear( tk )

	const [groups, svlst4dense] = prep_samplegroups( tk, block )

	tk.samplegroups = groups


	/*
	if dense, draw vcf density and return height; otherwise variants are dispersed among samplegroup and won't affect tk height
	when view range is too big, won't draw but show a message
	which will take vertical space, the height of which will also be returned
	*/
	const vcfdensityheight = render_multi_vcfdense( tk, block )

	// likewise for sv
	const svdensityheight = render_multi_svdense( svlst4dense, tk, block )

	// draw cnv bars, will draw sv and vcf if in full mode
	const cnvheight = render_multi_cnvloh( tk, block )

	multi_expressionstatus_ase_outlier(tk)

	const genebaraxisheight = render_multi_genebar(tk, block)

	// padding between sv/vcf, if both drawn
	const vcfsvpad = vcfdensityheight && svdensityheight ? 3 : 0

	// track top blank height
	let hpad = Math.max(
		block.labelfontsize,
		vcfdensityheight+svdensityheight + vcfsvpad,
		genebaraxisheight
		)

	// may increase hpad: don't allow tk label to overlap with density plot label
	if(vcfdensityheight) {
		hpad += Math.max( 0, block.labelfontsize*1.5 - (hpad-svdensityheight-vcfsvpad-vcfdensityheight/2) )
	} else if(svdensityheight) {
		hpad += Math.max( 0, block.labelfontsize*1.5 - (hpad-svdensityheight/2) )
	}

	// adjust config handle position by top blank height
	if( hpad > genebaraxisheight+3+block.labelfontsize ) {
		// enough space for label to be in usual place
		tk.config_handle.transition().attr('text-anchor', 'start').attr('x',0)
	} else {
		tk.config_handle.transition().attr('text-anchor', 'end').attr('x', -block.rpad)
	}

	tk.cnvleftg.transition().attr('transform','translate(0,'+hpad+')')
	tk.cnvmidg.transition().attr('transform','translate(0,'+hpad+')')
	tk.vcfdensityg.transition()
		.attr('transform','translate(0,'+(hpad-svdensityheight - vcfsvpad)+')')
	tk.svdensityg.transition().attr('transform','translate(0,'+hpad+')')
	tk.cnvrightg.transition().attr('transform','translate(0,'+hpad+')')

	{
		// if showing density plots, put labels on left of density track
		const color='#858585'
		if(vcfdensityheight && tk.data_vcf) {

			let c_snvindel = 0,
				c_itd = 0

			for(const m of tk.data_vcf) {
				if(m.x==undefined) continue
				if(m.dt==common.dtsnvindel) {
					c_snvindel += m.sampledata.length
				} else if(m.dt==common.dtitd) {
					c_itd++
				}
			}

			const phrases = []
			if(c_snvindel) phrases.push( c_snvindel+' SNV/indel'+(c_snvindel>1?'s':'') )
			if(c_itd) phrases.push( c_itd+' ITD'+(c_itd>1?'s':'') )

			tk.vcfdensitylabelg
				.attr('transform','translate(0,'+(hpad-vcfdensityheight-vcfsvpad-svdensityheight)+')')
				.append('text')
				.text( phrases.join(', ') )
				.attr('text-anchor','end')
				.attr('x',block.tkleftlabel_xshift)
				.attr('y',vcfdensityheight/2)
				.attr('dominant-baseline','central')
				.attr('font-size', Math.min(block.labelfontsize,vcfdensityheight)-1 )
				.attr('font-family',client.font)
				.attr('fill',color)
				.each(function(){
					tk.leftLabelMaxwidth = Math.max(tk.leftLabelMaxwidth,this.getBBox().width)
				})

			tk.vcfdensitylabelg.append('line')
				.attr('stroke',color)
				.attr('y2',vcfdensityheight)
				.attr('shape-rendering','crispEdges')
			tk.vcfdensitylabelg.append('line')
				.attr('stroke',color)
				.attr('shape-rendering','crispEdges')
				.attr('x1', -leftlabelticksize)
				.attr('y1',vcfdensityheight/2)
				.attr('y2',vcfdensityheight/2)
		}

		if(svdensityheight) {
			tk.svdensitylabelg
				.attr('transform','translate(0,'+(hpad-svdensityheight)+')')
				.append('text')
				.text( svlst4dense.length+' SV breakpoint'+(svlst4dense.length>1?'s':'') )
				.attr('text-anchor','end')
				.attr('x',block.tkleftlabel_xshift)
				.attr('y',svdensityheight/2)
				.attr('dominant-baseline','central')
				.attr('font-size', Math.min(block.labelfontsize, svdensityheight)-1 )
				.attr('font-family',client.font)
				.attr('fill',color)
				.each(function(){
					tk.leftLabelMaxwidth = Math.max(tk.leftLabelMaxwidth,this.getBBox().width)
				})
			tk.svdensitylabelg.append('line')
				.attr('stroke',color)
				.attr('y2',svdensityheight)
				.attr('shape-rendering','crispEdges')
			tk.svdensitylabelg.append('line')
				.attr('stroke',color)
				.attr('shape-rendering','crispEdges')
				.attr('x1', -leftlabelticksize)
				.attr('y1',svdensityheight/2)
				.attr('y2',svdensityheight/2)
		}
	}

	tk.height_main = tk.toppad + hpad + cnvheight + tk.bottompad


	/// legend

	if(tk.isfull) {
		may_legend_svchr(tk)
	}

	may_legend_samplegroup(tk, block)

	may_legend_mclass(tk, block)

	may_legend_mutationAttribute(tk, block)
}







function render_multi_vcfdense( tk, block) {
	/*
	multi-sample
	native/custom
	dense
	*/
	if(tk.vcfrangelimit) {
		tk.vcfdensityg.append('text')
			.text('Zoom in under '+common.bplen(tk.vcfrangelimit)+' to show SNV/indel density')
			.attr('font-size',block.labelfontsize)
			.attr('font-family',client.font)
		return block.labelfontsize
	}
	if(!tk.isdense) return 0

	if(!tk.data_vcf || tk.data_vcf.length==0) return 0

	// list of bins
	const binw=10 // pixel
	const bins=[]
	let x=0
	while(x<block.width) {
		bins.push({
			x1:x,
			x2:x+binw,
			lst:[]
		})
		x+=binw
	}
	x=block.width
	for(const p of block.subpanels) {
		x+=p.leftpad
		let b=0
		while(b<p.width) {
			bins.push({
				x1:x+b,
				x2:x+b+binw,
				lst:[]
			})
			b+=binw
		}
		x+=p.width
	}

	// m to bins
	for(const m of tk.data_vcf) {
		if(m.x==undefined) {
			// unmapped
			continue
		}
		for(const b of bins) {
			if(b.x1<=m.x && b.x2>=m.x) {
				b.lst.push(m)
				break
			}
		}
	}

	// group m in each bin by class
	for(const b of bins) {
		if(b.lst.length==0) continue
		const name2group = new Map()
		// k: mclass key
		// v: mlst[]

		for(const m of b.lst) {
			if(!name2group.has(m.class)) {
				name2group.set(m.class, [])
			}
			name2group.get(m.class).push(m)
		}

		const lst=[]
		for(const [ classname, mlst ] of name2group) {

			let samplecount = 0 // total # of samples in this group
			for(const m of mlst) {
				if(m.dt==common.dtsnvindel) {
					samplecount += m.sampledata.length
				} else {
					console.error('unknown dt')
				}
			}

			lst.push({
				name:  common.mclass[classname].label,
				items: mlst,
				color: common.mclass[classname].color,
				samplecount: samplecount
			})
		}
		lst.sort( (i,j) => j.samplecount - i.samplecount )
		b.groups = lst
	}


	let maxcount=0 // per group
	for(const b of bins) {
		if(!b.groups) continue
		for(const g of b.groups) {
			maxcount=Math.max(maxcount, g.samplecount)
		}
	}

	let maxheight=0 // of all bins
	{
		const radius=4
		let mrd=0 // max radius
		const w=Math.pow(radius,2)*Math.PI // unit area
		if(maxcount<=3) {
			mrd=w * maxcount*.9
		} else if(maxcount<=10) {
			mrd=w * 5
		} else if(maxcount<=100) {
			mrd=w * 7
		} else {
			mrd=w * 10
		}
		const sf_discradius=scaleLinear()
			.domain([1,
				maxcount*.5+.1,
				maxcount*.6+.1,
				maxcount*.7+.1,
				maxcount*.8+.1,
				maxcount])
			.range([w,
				w+(mrd-w)*.8,
				w+(mrd-w)*.85,
				w+(mrd-w)*.9,
				w+(mrd-w)*.95,
				mrd])

		// note: must count # of samples in each mutation for radius & offset
		for(const bin of bins) {
			if(!bin.groups) continue

			for(const g of bin.groups) {
				// group dot radius determined by total number of samples in each mutation, not # of mutations

				g.radius = Math.sqrt( sf_discradius( g.samplecount ) / Math.PI )
			}

			// offset of a bin determined by the total number of samples
			// count again for the bin
			const totalnum = bin.groups.reduce((i,j) => j.samplecount+i, 0)

			bin.offset=Math.sqrt( sf_discradius( totalnum ) / Math.PI )

			const sumheight=bin.groups.reduce((i,j)=>i+j.radius*2,0)

			maxheight = Math.max(maxheight, bin.offset + sumheight)
		}
	}


	for(const b of bins) {
		if(!b.groups) continue

		const g=tk.vcfdensityg.append('g').attr('transform','translate('+((b.x1+b.x2)/2)+',0)')

		let y=b.offset

		for(const grp of b.groups) {

			/*
			one dot for each group

			.name
			.items[]
			.radius
			.color
			.samplecount
			*/

			y+=grp.radius
			g.append('circle')
				.attr('cy',-y)
				.attr('r',grp.radius)
				.attr('fill',grp.color)
				.attr('stroke','white')

			if(grp.radius>=8) {
				// big enough dot, show # of items
				const s = grp.radius*1.5
				const text = grp.samplecount.toString()
				const fontsize = Math.min(s/(text.length*client.textlensf), s)

				g.append('text')
					.text(text)
					.attr('y', -y)
					.attr('dominant-baseline','central')
					.attr('text-anchor', 'middle')
					.attr('font-size', fontsize)
					.attr('font-family', client.font)
					.attr('fill','white')
			}


			g.append('circle')
				.attr('cy',-y)
				.attr('r',grp.radius)
				.attr('fill','white')
				.attr('fill-opacity',0)
				.attr('stroke',grp.color)
				.attr('stroke-opacity',0)
				.attr('class','sja_aa_disckick')
				.on('mouseover',()=>{
					tooltip_multi_vcfdense(grp, tk, block)
				})
				.on('mouseout',()=>{
					tk.tktip.hide()
				})
				.on('click',()=>{
					click_multi_vcfdense( grp, tk, block )
				})
			y+=grp.radius
		}
		g.append('line')
			.attr('y2',-b.offset)
			.attr('stroke', b.groups[0].color)
	}
	return maxheight
}






function render_multi_svdense( svlst, tk,block) {
	/*
	multi-sample
	native/custom
	dense
	list of sv provided
	TODO change disc color to sv type
	*/
	if(!tk.isdense || svlst.length==0) return 0

	// list of bins
	const binw=10 // pixel
	const tmpbins=[]
	let x=0
	while(x<block.width) {
		tmpbins.push({
			x1:x,
			x2:x+binw,
			lst:[]
		})
		x+=binw
	}

	x=block.width
	for(const p of block.subpanels) {
		x+=p.leftpad
		let b=0
		while(b<p.width) {
			tmpbins.push({
				x1:x+b,
				x2:x+b+binw,
				lst:[]
			})
			b+=binw
		}
		x+=p.width
	}

	// sv to bins
	for(const sv of svlst) {
		for(const b of tmpbins) {
			if(b.x1<=sv.x && b.x2>=sv.x) {
				b.lst.push(sv)
				break
			}
		}
	}

	// since sv are breakends, one sv with both ends may be in the same bin, so much dedup
	const bins = []
	for(const b of tmpbins) {
		if(b.lst.length==0) continue
		const b2 = {}
		for(const k in b) {
			b2[k] = b[k]
		}

		b2.lst = dedup_sv( b.lst )

		bins.push(b2)
	}

	// group items in each bin
	for(const b of bins) {
		const name2group = new Map()
		const nonamelst=[]
		for(const i of b.lst) {
			if(i._samplegroup.name) {
				if(!name2group.has(i._samplegroup.name)) {
					name2group.set(i._samplegroup.name, [])
				}
				name2group.get(i._samplegroup.name).push(i)
			} else {
				nonamelst.push(i)
			}
		}
		const lst=[]
		if(nonamelst.length) {
			lst.push({ 
				items:nonamelst,
				color:svdensitynogroupcolor
				})
		}
		for(const [name,items] of name2group) {
			lst.push({
				name:  name,
				items: items,
				color: ( tk.legend_samplegroup ? tk.legend_samplegroup.color(name) : '#aaa')
			})
		}
		lst.sort((i,j)=>j.items.length-i.items.length)
		b.groups = lst
	}


	let maxcount=0 // per group
	for(const b of bins) {
		for(const g of b.groups) {
			maxcount=Math.max(maxcount, g.items.length)
		}
	}

	let maxheight=0 // of all bins
	{
		const radius=4
		let mrd=0 // max radius
		const w=Math.pow(radius,2)*Math.PI // unit area
		if(maxcount<=3) {
			mrd=w * maxcount*.9
		} else if(maxcount<=10) {
			mrd=w * 5
		} else if(maxcount<=100) {
			mrd=w * 7
		} else {
			mrd=w * 10
		}
		const sf_discradius=scaleLinear()
			.domain([1,
				maxcount*.5+.1,
				maxcount*.6+.1,
				maxcount*.7+.1,
				maxcount*.8+.1,
				maxcount])
			.range([w,
				w+(mrd-w)*.8,
				w+(mrd-w)*.85,
				w+(mrd-w)*.9,
				w+(mrd-w)*.95,
				mrd])
		for(const b of bins) {
			if(!b.groups) continue
			for(const g of b.groups) {
				g.radius=Math.sqrt( sf_discradius( g.items.length )/Math.PI )
			}
			// offset of a bin determined by the total number of items
			b.offset=Math.sqrt( sf_discradius( b.lst.length )/Math.PI )
			const h = b.groups.reduce((i,j)=>i+j.radius*2,0)
			maxheight = Math.max( maxheight, b.offset + h )
		}
	}


	for(const b of bins) {

		const g=tk.svdensityg.append('g').attr('transform','translate('+((b.x1+b.x2)/2)+',0)')

		let y=b.offset

		for(const grp of b.groups) {
			// one dot for each group

			y+=grp.radius
			g.append('circle')
				.attr('cy',-y)
				.attr('r',grp.radius)
				.attr('fill',grp.color)
				.attr('stroke','white')

			if(grp.radius>=8) {
				// big enough dot, show # of items
				const s = grp.radius*1.5
				const text = grp.items.length.toString()
				const fontsize=Math.min(s/(text.length*client.textlensf),s)

				g.append('text')
					.text(text)
					.attr('y', -y)
					.attr('dominant-baseline','central')
					.attr('text-anchor', 'middle')
					.attr('font-size', fontsize)
					.attr('font-family', client.font)
					.attr('fill','white')
			}

			// cover
			g.append('circle')
				.attr('cy',-y)
				.attr('r',grp.radius)
				.attr('fill','white')
				.attr('fill-opacity',0)
				.attr('stroke',grp.color)
				.attr('stroke-opacity',0)
				.attr('class','sja_aa_disckick')
				.on('mouseover',()=>{
					tooltip_multi_svdense(grp, tk, block)
				})
				.on('mouseout',()=>{
					tk.tktip.hide()
				})
				.on('click',()=>{
					click_multi_svdense(grp, tk, block)
				})
			y+=grp.radius
		}
		g.append('line')
			.attr('y2',-b.offset)
			.attr('stroke', b.groups[0].color)
	}
	return maxheight
}





function render_multi_cnvloh(tk,block) {

	/*
	draws sample rows, each contain cnv & loh segments
	in full mode, include vcf data as well

	multi-sample
	official or custom
	full or dense

	in full mode:
		sample/group height determined on the fly
		for each sample, gather all stackable items: cnv/loh/itd
		then do stacking, generate item.stack_y and obtain height for this sample
		then commense rendering

	in dense mode:
		all samples have equal height, 1 pixel hardcoded
	*/

	{
		// get value cutoff for varying color of cnv or loh segments

		const gain=[], // log2ratio values
			loss=[],
			segmean=[] // segmean values

		for(const g of tk.samplegroups) {
			for(const s of g.samples) {
				for(const i of s.items) {
					if(i.dt==common.dtloh) {
						segmean.push(i.segmean)
						continue
					}
					if(i.dt==common.dtcnv) {
						if(i.value>0) gain.push(i.value)
						else loss.push(-i.value)
					}
				}
			}
		}
		const gainmaxvalue = common.getMax_byiqr(gain, novalue_max_cnvloh)
		const lossmaxvalue = -common.getMax_byiqr(loss, novalue_max_cnvloh)
		tk.cnvcolor.cnvmax = Math.max( gainmaxvalue, -lossmaxvalue )

		if(segmean.length) {
			tk.cnvcolor.segmeanmax= Math.max(...segmean)
		} else {
			tk.cnvcolor.segmeanmax=novalue_max_cnvloh
		}
	}



	let groupspace // vertical spacing between groups
	if(tk.isdense) {

		tk.rowspace=0
		groupspace=4

	} else if(tk.isfull) {

		tk.rowspace=1
		groupspace=10
	}


	render_multi_cnvloh_stackeachsample( tk, block ) // in each sample, process stackable items

	// sample height are set, but it doesn't set group height, because group height needs rowspace which is set above
	for(const g of tk.samplegroups) {
		g.height = tk.rowspace * (g.samples.length-1) + g.samples.reduce( (i,j)=>j.height+i, 0 )
	}

	const grouplabelfontsize = block.labelfontsize - (tk.isfull ? 0 : 1)

	let yoff=groupspace

	for(const [groupidx, samplegroup] of tk.samplegroups.entries() ) {

		/*
		for each group (custom track has just 1)
		*/

		// a group may have just 1 sample so height is smaller than label font size, need to have a ypad
		let thisgroupypad = 0
		if(samplegroup.height < grouplabelfontsize) {
			thisgroupypad = ( grouplabelfontsize - samplegroup.height ) / 2
		}

		if(samplegroup.name) {

			// the group's got a name, show name and border lines
			const color = tk.legend_samplegroup ? tk.legend_samplegroup.color(samplegroup.name) : '#0A7FA6'

			tk.cnvleftg.append('text')
				.attr('font-size', grouplabelfontsize)
				.attr('font-family', client.font)
				.attr('y', yoff + thisgroupypad + samplegroup.height/2)
				.attr('text-anchor','end')
				.attr('dominant-baseline','central')
				.attr('fill',color)
				.attr('x',block.tkleftlabel_xshift)
				.text(
					samplegroup.name
					+' ('+samplegroup.samples.length
					+( samplegroup.sampletotalnum ? ', '+Math.ceil(100*samplegroup.samples.length/samplegroup.sampletotalnum)+'%' : '')
					+')'
					)
				.each(function(){
					tk.leftLabelMaxwidth = Math.max( tk.leftLabelMaxwidth, this.getBBox().width )
				})
				.on('mouseover',()=>{
					tooltip_samplegroup( samplegroup, tk )
				})
				.on('mouseout',()=>{
					tk.tktip.hide()
				})
				.on('click',()=>{
					tk.tip2.showunder(d3event.target)
						.clear()
					click_samplegroup_showmenu( samplegroup, tk, block )
				})

			// v span
			tk.cnvleftg.append('line')
				.attr('y1', yoff + thisgroupypad)
				.attr('y2', yoff + thisgroupypad + samplegroup.height )
				.attr('stroke',color)
				.attr('shape-rendering','crispEdges')
			// tick
			tk.cnvleftg.append('line')
				.attr('y1', yoff + thisgroupypad + samplegroup.height/2)
				.attr('y2', yoff + thisgroupypad + samplegroup.height/2)
				.attr('x2', -leftlabelticksize)
				.attr('stroke',color)
				.attr('shape-rendering','crispEdges')
		}


		let yoff1 = yoff + thisgroupypad
		samplegroup.y = yoff1

		for( const sample of samplegroup.samples ) {

			/*
			for each sample from this group
			*/

			if(sample.samplename && tk.iscustom && sample.height >= minlabfontsize) {
				// for custom track, show sample name since all of them are in one nameless group
				tk.cnvleftg.append('text')
					.text(sample.samplename)
					.attr('text-anchor','end')
					.attr('dominant-baseline','central')
					.attr('x',-5)
					.attr('y', yoff1 + sample.height/2 )
					.attr('font-family',client.font)
					.attr('font-size',Math.min(15, Math.max(minlabfontsize, sample.height)))
					.each(function(){
						tk.leftLabelMaxwidth=Math.max(tk.leftLabelMaxwidth,this.getBBox().width)
					})
			}

			// container for all the browser track elements
			const g = tk.cnvmidg.append('g')
				.attr('transform','translate(0,'+yoff1+')')

			/*
			jinghui nbl cell line mixed into st/nbl
			*/
			if(tk.isfull && sample.sampletype==hardcode_cellline) {
				g.append('rect')
					.attr('x',-5)
					.attr('y',0)
					.attr('width',5)
					.attr('height', sample.height )
					.attr('fill','black')
					.attr('shape-rendering','crispEdges')
			}


			/*
			draw cnv/loh/itd bars, before all others
			*/
			for( const item of sample.items ) {

				if( item.dt!=common.dtcnv && item.dt!=common.dtloh && item.dt!=common.dtitd ) continue

				// segment color set by numeric value against a cutoff
				let color
				if(item.dt==common.dtloh) {
					if(item.segmean >= tk.cnvcolor.segmeanmax) {
						color=tk.cnvcolor.loh.str
					} else {
						color = 'rgba('+tk.cnvcolor.loh.r+','+tk.cnvcolor.loh.g+','+tk.cnvcolor.loh.b+','+(item.segmean/tk.cnvcolor.segmeanmax).toFixed(2)+')'
					}
				} else if(item.dt == common.dtcnv) {
					// cnv
					if(item.value>0) {
						if(item.value >= tk.cnvcolor.cnvmax) {
							color = tk.cnvcolor.gain.str
						} else {
							color = 'rgba('+tk.cnvcolor.gain.r+','+tk.cnvcolor.gain.g+','+tk.cnvcolor.gain.b+','+(item.value/tk.cnvcolor.cnvmax).toFixed(2)+')'
						}
					} else {
						if(item.value <= -tk.cnvcolor.cnvmax) {
							color = tk.cnvcolor.loss.str
						} else {
							color = 'rgba('+tk.cnvcolor.loss.r+','+tk.cnvcolor.loss.g+','+tk.cnvcolor.loss.b+','+(-item.value/tk.cnvcolor.cnvmax).toFixed(2)+')'
						}
					}
				} else if(item.dt == common.dtitd) {
					color = common.mclass[common.mclassitd].color
				}

				g.append('rect')
					.attr('x', Math.min(item.x1, item.x2) )
					.attr('y', item.stack_y )
					.attr('width', Math.max( 1, Math.abs( item.x1-item.x2 ) ) )
					.attr('height', item.stack_h )
					.attr('shape-rendering','crispEdges')
					.attr('stroke','none')
					.attr('class','sja_aa_skkick')
					.attr('fill', color)
					.on('mouseover',()=>{
						tooltip_singleitem( {
							item:item,
							sample:sample,
							samplegroup:samplegroup,
							tk:tk,
							})
					})
					.on('mouseout',()=>{
						tk.tktip.hide()
					})
					.on('click',()=>{
						// FIXME prevent click while dragging
						click_multi_singleitem( {
							item:item,
							sample:sample,
							samplegroup:samplegroup,
							tk:tk,
							block:block
						})
					})

			}


			/*
			draw sv/fusion circles, appears here in full mode, not in dense
			*/
			for(const item of sample.items) {
				if(item.dt!=common.dtsv && item.dt!=common.dtfusionrna) continue

				const otherchr = item.chrA==item._chr ? item.chrB : item.chrA

				const color = otherchr==item._chr ? intrasvcolor : tk.legend_svchrcolor.colorfunc(otherchr)

				// may show label

				g.append('circle')
					.attr('cx', item.x)
					.attr('cy', sample.height/2 )
					.attr('r',  Math.min( 5, Math.max( minsvradius, 1 + sample.height / 2 ) ) )
					.attr('fill',color)
					.attr('fill-opacity',0)
					.attr('stroke', color)
					.on('mouseover', ()=> {
						d3event.target.setAttribute('fill-opacity',1)
						tooltip_singleitem({
							item: item,
							sample: sample,
							samplegroup: samplegroup,
							tk:tk,
						})
					})
					.on('mouseout',()=>{
						d3event.target.setAttribute('fill-opacity',0)
						tk.tktip.hide()
					})
					.on('click',()=>{
						click_multi_singleitem( {
							item:item,
							sample:sample,
							samplegroup:samplegroup,
							tk:tk,
							block:block
						})
					})
			}

			/*
			if in full mode (not dense), draw crosses for snv/indel
			*/
			if(tk.isfull && tk.data_vcf) {

				for(const m of tk.data_vcf) {
					if(m.dt != common.dtsnvindel) continue
					if(m.x == undefined) continue
					if(!m.sampledata) continue

					const w = sample.crossboxw

					const color = common.mclass[m.class].color

					for(const ms of m.sampledata) {
						if(ms.sampleobj.name != sample.samplename) continue

						// a variant from this sample

						const m_g = g.append('g')
							.attr('transform','translate('+m.x+','+(sample.height/2)+')')

						const bgbox = m_g.append('rect')
							.attr('x', -w/2-1)
							.attr('y', -w/2-1)
							.attr('width', w+2)
							.attr('height', w+2)
							.attr('fill',color)
							.attr('fill-opacity', 0)
						const bgline1 = m_g.append('line')
							.attr('stroke', 'white')
							.attr('stroke-width',3)
							.attr('x1', -w/2)
							.attr('x2', w/2)
							.attr('y1', -w/2)
							.attr('y2', w/2)
						const bgline2 = m_g.append('line')
							.attr('stroke', 'white')
							.attr('stroke-width',3)
							.attr('x1', -w/2)
							.attr('x2', w/2)
							.attr('y1', w/2)
							.attr('y2', -w/2)
						const fgline1 = m_g.append('line')
							.attr('stroke', color)
							.attr('stroke-width',1.5)
							.attr('x1', -w/2)
							.attr('x2', w/2)
							.attr('y1', -w/2)
							.attr('y2', w/2)
						const fgline2 = m_g.append('line')
							.attr('stroke', color)
							.attr('stroke-width',1.5)
							.attr('x1', -w/2)
							.attr('x2', w/2)
							.attr('y1', w/2)
							.attr('y2', -w/2)

						let coverstart = -w/2,
							coverwidth = w

						if(ms.sampleobj.labonleft) {

							m_g.append('text')
								.text( m.mname )
								.attr('text-anchor','end')
								.attr('dominant-baseline','central')
								.attr('font-family',client.font)
								.attr('font-size', sample.crossboxw+2)
								.attr('fill', color)
								.attr('x', -w/2-labelspace)
							coverstart = -w/2 - labelspace - ms.sampleobj.labelwidth
							coverwidth = w + labelspace + ms.sampleobj.labelwidth

						} else if(ms.sampleobj.labonright) {

							m_g.append('text')
								.text( m.mname )
								.attr('dominant-baseline','central')
								.attr('font-family',client.font)
								.attr('font-size', sample.crossboxw+2)
								.attr('fill', color)
								.attr('x', w/2+labelspace)
							coverwidth = w + labelspace + ms.sampleobj.labelwidth
						}

						// mouseover cover
						m_g.append('rect')
							.attr('x', coverstart)
							.attr('y', -w/2)
							.attr('width', coverwidth)
							.attr('height', w)
							.attr('fill','white')
							.attr('fill-opacity', 0)
							.on('mouseover',()=>{
								bgbox.attr('fill-opacity',1)
								bgline1.attr('stroke-opacity',0)
								bgline2.attr('stroke-opacity',0)
								fgline1.attr('stroke','white')
								fgline2.attr('stroke','white')

								tooltip_singleitem({
									item:m,
									m_sample: ms,
									sample: sample,
									samplegroup: samplegroup,
									tk:tk,
								})
							})
							.on('mouseout',()=>{
								tk.tktip.hide()
								bgbox.attr('fill-opacity',0)
								bgline1.attr('stroke-opacity',1)
								bgline2.attr('stroke-opacity',1)
								fgline1.attr('stroke',color)
								fgline2.attr('stroke',color)
							})
							.on('click',()=>{
								click_multi_singleitem({
									item: m,
									m_sample: ms,
									sample: sample,
									samplegroup: samplegroup,
									tk:tk,
									block:block
								})
							})
					}
				}
			}

			/*** done all items for this sample ***/
			yoff1 += sample.height + tk.rowspace
		}

		/*** done a group ***/
		yoff += samplegroup.height + thisgroupypad*2 + groupspace
	}

	if(tk.cnvcolor.cnvmax==novalue_max_cnvloh) {
		tk.cnvcolor.cnvlegend.row.style('display','none')
	} else {
		draw_colorscale_cnv(tk)
	}

	if(tk.cnvcolor.segmeanmax==novalue_max_cnvloh) {
		tk.cnvcolor.lohlegend.row.style('display','none')
	} else {
		draw_colorscale_loh(tk)
	}

	return yoff
}



function multi_snvindel_mayshowlabel( m, m_g, cnvsvlst ) {
	return 0
}





function render_multi_cnvloh_stackeachsample( tk, block ) {
	/*
	called by render_multi_cnvloh()
	for each sample, set .height
	for each stackable item (cnv/loh/itd), set .stack_y, .stack_h

	check to see if vcf/sv can show label
	*/
	if(!tk.samplegroups || tk.samplegroups.length==0) return

	if(tk.isdense) {
		// no stacking in dense mode, itd won't go into .items[]
		for(const g of tk.samplegroups) {
			for(const s of g.samples) {
				s.height = 1 // hardcoded
				for(const i of s.items) {
					if(i.dt==common.dtcnv || i.dt==common.dtloh || i.dt==common.dtitd) {
						i.stack_y = 0
						i.stack_h = 1
					}
				}
			}
		}
		return
	}

	// full width
	const blockwidth = block.width + block.subpanels.reduce( (i,j)=>i+j.leftpad+j.width, 0 )

	// full mode
	for(const g of tk.samplegroups) {
		for(const s of g.samples) {

			// for this sample, gather stackable items
			const items = []
			for(const i of s.items) {
				if(i.dt==common.dtcnv || i.dt==common.dtloh || i.dt==common.dtitd) {
					if(i.x1!=undefined && i.x2!=undefined) {
						i._boxstart = Math.min(i.x1, i.x2)
						i._boxwidth = Math.abs(i.x2-i.x1)
						items.push( i )
					}
				}
			}

			dostack( s, items )

			s.crossboxw = Math.min( 8, s.height ) // determines label font size

			// decide if to draw label for sv/fusion


			if(tk.data_vcf) {

				// collect vcf items for this sample
				const mlst = []
				for(const m of tk.data_vcf) {
					if(m.dt!=common.dtsnvindel || m.x==undefined || !m.sampledata) continue
					const m_sample = m.sampledata.find( i=> i.sampleobj.name==s.samplename)
					if(m_sample) {
						mlst.push( [ m, m_sample ] )
					}
				}

				// for each variant, decide if/where to show label
				for( const [ m, m_sample ]  of mlst ) {

					let labw
					tk.g.append('text')
						.text( m.mname )
						.attr('font-size', s.crossboxw+2)
						.attr('font-family', client.font)
						.each(function(){
							labw = this.getBBox().width
						})
						.remove()

					labw += s.crossboxw/2 + labelspace

					let nleft=false,
						nright=false

					if( labw > m.x ) {
						// no space on left
						nleft=true
					} else if(labw > blockwidth-m.x) {
						// no space on right
						nright=true
					}

					// test cases where label cannot go
					for(const i of s.items) {

						if(nleft && nright) break

						if( i.dt==common.dtcnv || i.dt==common.dtloh || i.dt==common.dtitd ) {
							// segment
							if(i.x1==undefined || i.x2==undefined) continue
							const x1 = Math.min(i.x1, i.x2)
							const x2 = Math.max(i.x1, i.x2)

							if( x1 < m.x ) {
								if(x2 < m.x) {
									if( labw > m.x - x2 ) {
										nleft=true
									}
								} else {
									nleft=true
									nright=true
								}
							} else {
								if( labw > x1 - m.x ) {
									nright=true
								}
							}

						} else if(i.dt==common.dtsv || i.dt==common.dtfusionrna) {
							if(i.x==undefined) continue
							if( i.x < m.x ) {
								if( labw > m.x-i.x ) {
									nleft=true
								}
							} else {
								if( labw > i.x-m.x ) {
									nright=true
								}
							}
						}
					}

					if(nleft && nright) {
						// this is blocked
						continue
					}

					// then, test snvindels in case there are multiple for this sample
					for( const [m2, m2s] of mlst) {
						if(nleft && nright) break
						if(m2.dt!=common.dtsnvindel) continue
						if(m2.x==undefined) continue
						if(m2.pos==m.pos && m2.alt==m.alt) {
							// same variant
							continue
						}
						if( m2.x < m.x ) {
							if( labw > m.x-m2.x ) {
								nleft=true
							}
						} else if(m2.x == m.x) {
							// possible, avoid label overlap
							if(m2s.sampleobj.labonleft) {
								nleft=true
							} else if(m2s.sampleobj.labonright) {
								nright=true
							}
						} else {
							if( labw > m2.x-m.x ) {
								nright=true
							}
						}
					}



					if(nleft) {
						if(!nright) {
							m_sample.sampleobj.labonright=true
						}
					} else {
						if(nright) {
							m_sample.sampleobj.labonleft=true
						} else {
							m_sample.sampleobj.labonright=true // on right first
						}
					}

					if(m_sample.sampleobj.labonleft || m_sample.sampleobj.labonright) {
						m_sample.sampleobj.labelwidth = labw
					}
				}
			}
		}
	}
}



function dostack( sample, items ) {
	// set sample.height

	if(items.length == 0) {
		// this sample has no stackable item, but it must have other pointy items
		// still set height
		sample.height = 8
		return
	}

	// stack

	items.sort( (i,j)=> i._boxstart - j._boxstart )

	const stacks = []
	for(const m of items) {
		for(let i=0; i<stacks.length; i++) {
			if(stacks[i] < m._boxstart) {
				m._stacki = i
				stacks[i] = m._boxstart + m._boxwidth
				break
			}
		}
		if(m._stacki==undefined) {
			m._stacki = stacks.length
			stacks.push( m._boxstart + m._boxwidth )
		}
	}

	let stackheight = stackheightscale( stacks.length )
	if(stackheight < 1 ) {
		// simpleminded scaling can make it negative
		stackheight = 1
	}

	// no spacing between stacks!!

	for(const i of items) {
		i.stack_y = i._stacki * stackheight
		i.stack_h = stackheight
		delete i._stacki
		delete i._boxstart
		delete i._boxwidth
	}

	sample.height = stackheight * stacks.length
}





function multi_expressionstatus_ase_outlier(tk) {
	/*
	multi-sample
	for all genes
	calculate expression status including ase and outlier, using Yu's data & method
	only do this when getting new data, or changing cutoffs

	should process _data, since in dense mode, .samplegroups[] will not contain sv-only samples
	*/
	//if(!tk.samplegroups) return
	if(!tk._data) return
	for(const g of tk._data) {
		if(!g.samples) continue
		for(const s of g.samples) {
			if(!s.expressionrank) continue
			for(const gene in s.expressionrank) {
				const v=s.expressionrank[gene]
				expressionstat.measure(v, tk.gecfg)
			}
		}
	}
}












function render_multi_genebar( tk, block) {
	/*
	multi-sample
	native or custom
	dense or full
	*/
	if(tk.expressionrangelimit) {
		// too big to do it
		const g=tk.cnvrightg
		const h=15
		let y=12
		g.append('text').text('Zoom in').attr('y',y).attr('font-size',12)
		y+=h
		g.append('text').text('under').attr('y',y).attr('font-size',12)
		y+=h
		g.append('text').text(common.bplen(tk.expressionrangelimit)).attr('y',y).attr('font-size',12)
		y+=h
		g.append('text').text('for').attr('y',y).attr('font-size',12)
		y+=h
		g.append('text').text('expression').attr('y',y).attr('font-size',12)
		y+=h
		g.append('text').text('ranking').attr('y',y).attr('font-size',12)
		return 0
	}

	const genes = new Set()
	for(const g of tk.samplegroups) {
		for(const s of g.samples) {
			if(s.expressionrank) {
				for(const gene in s.expressionrank) {
					genes.add(gene)
				}
			}
		}
	}
	if(genes.size==0) {
		return 0
	}

	// TODO multiple genes

	let usegene
	if(tk.selectedgene && genes.has(tk.selectedgene)) {
		usegene=tk.selectedgene
	} else {
		usegene = [...genes][0]
	}

	let minvalue=0
	let maxvalue=100

	const barwidth=80

	// any gene has ase info? if so, tooltip will show 'no info' for those missing
	// otherwise won't indicate ase status
	let anygenehasase=false
	for(const g of tk.samplegroups) {
		for(const s of g.samples) {
			if(s.expressionrank) {
				for(const n in s.expressionrank) {
					if(s.expressionrank[n].ase) {
						anygenehasase=true
					}
				}
			}
		}
	}


	for(const g of tk.samplegroups) {

		let y = g.y

		for(const s of g.samples) {

			if(s.expressionrank) {

				const v = s.expressionrank[usegene]
				if(v!=undefined) {

					const row = tk.cnvrightg.append('g').attr('transform','translate(0,'+y+')')

					const bar=row.append('rect')
						.attr('fill',  expressionstat.ase_color( v, tk.gecfg ) ) // bar color set by ase status
						.attr('width', barwidth * v.rank / maxvalue )
						.attr('height', s.height)
						.attr('shape-rendering','crispEdges')

					if(tk.isfull) {
						// only show dots for outlier status in full, not dense
						if(v.estat.outlier) {
							row.append('circle')
								.attr('cx',barwidth)
								.attr('cy', s.height/2)
								.attr('r', s.height/2)
								.attr('fill', tk.gecfg.outlier.color_outlier)
						} else if(v.estat.outlier_asehigh) {
							row.append('circle')
								.attr('cx',barwidth)
								.attr('cy', s.height/2)
								.attr('r',  s.height/2)
								.attr('fill', tk.gecfg.outlier.color_outlier_asehigh)
						}
					}

					const barbg=row.append('rect')
						.attr('fill',  fpkmbarcolor_bg)
						.attr('fill-opacity',.1)
						.attr('width',barwidth)
						.attr('height', s.height)
						.attr('shape-rendering','crispEdges')
						.on('mouseover',()=>{
							tk.tktip
								.clear()
								.show(d3event.clientX, d3event.clientY)
							const lst=[{k:'sample',v:s.samplename}]
							if(g.name) {
								lst.push({k:'group',v:g.name})
							}
							lst.push({k:'rank',  v:client.ranksays(v.rank)})
							lst.push({k:tk.gecfg.datatype,  v:v.value})

							const table = client.make_table_2col(tk.tktip.d,lst)

							expressionstat.showsingleitem_table( v, tk.gecfg, table )

							barbg.attr('fill','orange')
						})
						.on('mouseout',()=>{
							tk.tktip.hide()
							barbg.attr('fill',fpkmbarcolor_bg)
						})
						.on('click',()=>{
							const pane=client.newpane({x:window.innerWidth/2,y:100})
							pane.header.text( usegene+' '+tk.gecfg.datatype+' from '+tk.name )
							const c=tk.gene2coord[usegene]
							if(!c) {
								pane.body.text('No coordinate for '+usegene)
								return
							}

							const p={
								gene:usegene,
								chr:c.chr,
								start:c.start,
								stop:c.stop,
								holder:pane.body,
								block:block,
								genome:block.genome,
								jwt:block.jwt,
								hostURL:block.hostURL,
								sample:{name:s.samplename,value:v.value}
							}

							// expression
							if(tk.iscustom) {
								for(const k in tk.checkexpressionrank) {
									p[k]=tk.checkexpressionrank[k]
								}
							} else {
								p.dslabel=tk.mds.label
								p.querykey=tk.mds.queries[tk.querykey].checkexpressionrank.querykey
							}
							// svcnv
							p.color={
								cnvgain:tk.cnvcolor.gain.str,
								cnvloss:tk.cnvcolor.loss.str,
								sv:'black'
							}
							if(tk.iscustom) {
								p.svcnv={
									iscustom:1,
									file: tk.file,
									url: tk.url,
									indexURL: tk.indexURL
								}
							} else {
								p.svcnv={
									dslabel:tk.mds.label,
									querykey:tk.querykey
								}
							}
							p.svcnv.valueCutoff=tk.valueCutoff
							p.svcnv.bplengthUpperLimit=tk.bplengthUpperLimit

							p.clicksample = (thissample, group, plot) => {
								// click outlier sample to launch browser and show sv/cnv+expression rank for single sample
								const sample={
									samplename:thissample.sample
								}
								const samplegroup={
									attributes: group.attributes
								}
								const tk={} // svcnv track
								if(plot.svcnv.iscustom) {
								} else {
									for(const k in plot.svcnv) {
										tk[k] = plot.svcnv[k]
									}
									tk.mds = plot.block.genome.datasets[ plot.svcnv.dslabel ]
								}
								focus_singlesample({
									m: {
										dt: common.dtcnv,
										chr:plot.chr,
										start:plot.start,
										stop:plot.stop
									},
									sample: sample,
									samplegroup: samplegroup,
									tk: tk,
									block: plot.block
								})
							}
							import('./block.mds.geneboxplot').then(_=>{
								_.init(p)
							})
						})
				}
			}

			// done this sample
			y += s.height + tk.rowspace
		}

		// done this group
	}
	// axis label
	const axispad = 0
	const labelpad=3
	const ticksize = 5
	const fontsize=12
	const headg = tk.cnvrightg.append('g')
		.attr('transform','translate(0,-'+axispad+')')
	client.axisstyle({
		axis: headg.append('g').call( axisTop().scale(
			scaleLinear().domain([minvalue,maxvalue]).range([0,barwidth])
			)
			.tickValues([0,50,100])
			.tickSize(ticksize)
			),
		fontsize:fontsize,
		showline:1
	})

	const text = headg.append('text')
		.attr('text-anchor','middle')
		.attr('x',barwidth/2)
		.attr('y',-(fontsize+labelpad+ticksize+axispad))
		.attr('font-family',client.font)
		.attr('font-size',fontsize)
		.text(usegene+' rank')

	text.attr('class','sja_clbtext')
	.on('click',()=>{

		tk.tkconfigtip.clear()
			.showunder(d3event.target)

		genebar_config( tk.tkconfigtip.d, genes, tk, block )
	})

	return fontsize+fontsize+labelpad+ticksize+axispad
}




function genebar_config( holder, genes, tk, block ) {
	/*
	*/

	let usegene
	if(tk.selectedgene && genes.has(tk.selectedgene)) {
		usegene = tk.selectedgene
	} else {
		usegene = [...genes][0]
	}

	createbutton_addfeature({
		m: {
			dt: common.dtgeneexpression,
			genename: usegene,
		},
		holder: holder.append('div').style('margin-bottom','10px'),
		tk: tk,
		block: block
	})

	if(genes.size>1) {
		// more than one gene
		const scrollholder=holder.append('div')
			.style('margin-bottom','15px')
		if(genes.size>8) {
			scrollholder
				.style('height','200px')
				.style('padding','15px')
				.style('overflow-y','scroll')
				.style('resize','vertical')
		}
		const id0=Math.random().toString()
		for(const gene of genes) {
			const row= scrollholder.append('div')
			const id=Math.random().toString()
			const r = row.append('input')
				.attr('type','radio')
				.attr('id',id)
				.attr('name',id0)
				.on('change',()=>{
					tk.tkconfigtip.hide()
					tk.selectedgene = gene
					tk.cnvrightg.selectAll('*').remove()
					render_multi_genebar(tk,block)
				})
			if(gene==usegene) r.attr('checked',1)
			row.append('label')
				.attr('for',id)
				.attr('class','sja_clbtext')
				.html('&nbsp;'+gene)
		}
	}

	expressionstat.ui_config( holder, tk.gecfg, ()=>{
		tk.tkconfigtip.hide()
		tk.cnvrightg.selectAll('*').remove()
		multi_expressionstatus_ase_outlier(tk)
		render_multi_genebar(tk,block)
	})
}




export function draw_colorscale_cnv( tk ) {
	tk.cnvcolor.cnvlegend.row.style('display','table-row')
	client.axisstyle({
		axis: tk.cnvcolor.cnvlegend.axisg.call(
			axisTop().scale(
				scaleLinear().domain([-tk.cnvcolor.cnvmax, 0, tk.cnvcolor.cnvmax])
				.range([0, tk.cnvcolor.cnvlegend.barw, tk.cnvcolor.cnvlegend.barw*2] )
			)
			.tickValues([-tk.cnvcolor.cnvmax, 0, tk.cnvcolor.cnvmax])
			.tickSize( tk.cnvcolor.cnvlegend.axistickh )
		)
	})
}



export function draw_colorscale_loh( tk ) {
	tk.cnvcolor.lohlegend.row.style('display','table-row')
	client.axisstyle({
		axis: tk.cnvcolor.lohlegend.axisg.call(
			axisTop().scale(
				scaleLinear().domain([0, tk.cnvcolor.segmeanmax])
				.range([0, tk.cnvcolor.lohlegend.barw] )
			)
			.tickValues([ 0, tk.cnvcolor.segmeanmax])
			.tickSize( tk.cnvcolor.lohlegend.axistickh )
		)
	})
}











export function focus_singlesample( p ) {
	/*
	multi-sample
	native or custom
	launch a new block instance, show sv-cnv-vcf-expression track in single-sample mode,
	view range determined by cnv or sv
	if vcf, will use block view range

	.m
	.sample
		.samplename
		.sampletype
	.samplegroup
		.attributes[]
	.tk
	.block
	*/

	const { m, sample, samplegroup, tk, block } = p

	let holder

	if(p.holder) {
		
		holder = p.holder

	} else {

		const pane = client.newpane({x:100, y:100})
		holder = pane.body
	}

	// for launching block
	const arg={
		style:{
			margin:'0px'
		},
		hide_mdsHandleHolder:1,
		tklst:[],
		holder: holder,
		subpanels:[]
	}

	client.first_genetrack_tolist( block.genome, arg.tklst )


	// expression rank
	if(tk.iscustom) {
		if(tk.checkexpressionrank) {
			const et = {
				type: client.tkt.mdsexpressionrank,
				name: sample.samplename+' expression rank',
				sample: sample.samplename,
				iscustom:1,
			}
			for(const k in tk.checkexpressionrank) {
				et[k]=tk.checkexpressionrank[k]
			}
			arg.tklst.push(et)
		}
	} else if(tk.mds && tk.mds.queries[tk.querykey].checkexpressionrank) {

		// official mds

		if(samplegroup) {
			const et = {
				type: client.tkt.mdsexpressionrank,
				name: sample.samplename+' expression rank',
				mds:tk.mds,
				querykey: tk.mds.queries[tk.querykey].checkexpressionrank.querykey,
				sample: sample.samplename,
				attributes: samplegroup.attributes
			}
			arg.tklst.push(et)
		} else {
			// in dense mode, vcf samples may not have group
		}
	}

	// add sv-cnv-vcf track in single-sample mode
	const t2 = {
		cnvheight:40,
		midpad:3,
		stem1:10,
		stem2:0,
		stem3:5,
		legheight:40,
		discradius:8,
		bplengthUpperLimit:tk.bplengthUpperLimit,
		valueCutoff:tk.valueCutoff,
		lohLengthUpperLimit:tk.lohLengthUpperLimit,
		segmeanValueCutoff:tk.segmeanValueCutoff,
		singlesample:{
			name:sample.samplename
		}
	}
	if(tk.iscustom) {
		t2.type=client.tkt.mdssvcnv
		t2.file=tk.file
		t2.url=tk.url
		t2.indexURL=tk.indexURL
	} else {
		// official
		t2.mds = tk.mds
		t2.querykey = tk.querykey
		for(const k in tk.mds.queries[tk.querykey]) {
			if(k=='bplengthUpperLimit' || k=='valueCutoff') {
				// do not use default
				continue
			}
			t2[k] = tk.mds.queries[tk.querykey][k]
		}
	}
	arg.tklst.push(t2)

	if(m) {
		if( m.dt==common.dtcnv || m.dt==common.dtloh ) {

			const span = Math.ceil((m.stop-m.start)/2)
			arg.chr = m.chr
			arg.start = Math.max(0, m.start-span)
			arg.stop = Math.min( block.genome.chrlookup[ m.chr.toUpperCase()].len, m.stop+span )

		} else if( m.dt==common.dtsv || m.dt==common.dtfusionrna ) {

			if(m.chrA==m.chrB) {
				const span = Math.ceil(Math.abs(m.posA-m.posB)/4)
				arg.chr = m.chrA
				arg.start = Math.max(0, Math.min(m.posA, m.posB)-span)
				arg.stop = Math.min( block.genome.chrlookup[ m.chrA.toUpperCase()].len, Math.max(m.posA, m.posB)+span )
			} else {
				const span=10000
				arg.chr = m.chrA
				arg.start = Math.max(0, m.posA-span)
				arg.stop = Math.min( block.genome.chrlookup[ m.chrA.toUpperCase()].len, m.posA+span )
				arg.subpanels.push({
					chr: m.chrB,
					start: Math.max(0, m.posB-span),
					stop: Math.min( block.genome.chrlookup[ m.chrB.toUpperCase()].len, m.posB+span),
					width:600,
					leftpad:10,
					leftborder:'rgba(50,50,50,.1)'
				})
			}
		}
	}

	if(!arg.chr) {
		// no view range set
		const r = block.tkarg_maygm(tk)[0]
		arg.chr=r.chr
		arg.start=r.start
		arg.stop=r.stop
	}


	Promise.resolve()
	.then(()=>{
		if(tk.iscustom) {
			// custom track, no serverside config
			return
		}

		// get sample-level track from serverside dataset config
		const par={
			jwt:block.jwt,
			genome:block.genome.name,
			dslabel:tk.mds.label,
			querykey:tk.querykey,
			gettrack4singlesample: sample.samplename
		}

		return fetch( new Request(block.hostURL+'/mdssvcnv', {
			method:'POST',
			body:JSON.stringify(par)
		}))
		.then(data=>{return data.json()})
		.then(data=>{

			if(data.error) throw({message:data.error})
			if(data.tracks) {
				for(const t of data.tracks) {
					arg.tklst.push( t )
				}
			}
		})
	})
	.catch(err=>{

		client.sayerror( holder, err.message )
		if(err.stack) console.log(err.stack)

	})
	.then(()=>{

		const bb = block.newblock(arg)

		if(block.debugmode) {
			window.bbb=bb
		}

		if( m ) {
			if( m.dt==common.dtcnv || m.dt==common.dtloh ) {
				bb.addhlregion( m.chr, m.start, m.stop, cnvhighlightcolor )
			}
		}
		// done launching single-sample view from multi-sample
	})
}





function prep_samplegroups( tk, block ) {
	/*
	multi-sample
	from tk._data, prepare samplegroups for plotting
	map sv/cnv/loh/itd to view range, exclude unmappable items
	*/

	if(!tk._data) {
		// could be that all dt are hidden
		return [ [], [] ]
	}

	const svlst4dense = []

	let plotgroups = []

	for( const samplegroup of tk._data) {

		const g2={}
		for(const k in samplegroup) g2[k]=samplegroup[k]
		g2.samples=[]

		for( const sample of samplegroup.samples ) {

			const s2={}
			for(const k in sample) s2[k]=sample[k]
			s2.items=[]

			for(const item of sample.items) {

				if(item.dt==common.dtsv || item.dt==common.dtfusionrna) {
					// sv
					map_sv_2(item,block)
					if(item.x==undefined) {
						console.log('unmappable sv: '+item._chr+' '+item._pos)
						continue
					}

					if(item.chrA!=item._chr){
						tk.legend_svchrcolor.interchrs.add(item.chrA)
						tk.legend_svchrcolor.colorfunc(item.chrA)
					}
					if(item.chrB!=item._chr){
						tk.legend_svchrcolor.interchrs.add(item.chrB)
						tk.legend_svchrcolor.colorfunc(item.chrB)
					}

					if(tk.isdense) {
						const i= {
							_samplegroup:samplegroup,
							_sample:sample,
						}
						for(const k in item) {
							i[k]=item[k]
						}
						svlst4dense.push( i )
						continue
					}

					// not dense
					s2.items.push(item)

					continue
				}

				// cnv, loh, itd
				map_cnv( item, tk, block )
				if(item.x1==undefined || item.x2==undefined) {
					console.log('unmappable stack item: ',item)
					continue
				}
				s2.items.push(item)
			}

			if(s2.items.length==0) {
				/*
				no cnv/sv/loh for this sample, may drop it
				however if vcf is in full mode, must check if this sample has vcf data
				since vcf data is not bundled in items[]
				*/
				if(tk.isfull && tk.data_vcf) {
					let samplehasvcf=false

					for(const m of tk.data_vcf) {
						if(samplehasvcf) break
						if(m.x==undefined) continue

						if(m.dt==common.dtsnvindel) {
							if(!m.sampledata) continue
							for(const s of m.sampledata) {
								if(s.sampleobj.name == sample.samplename) {
									samplehasvcf=true
									break
								}
							}
							continue
						}
					}

					if(!samplehasvcf) {
						// this sample has no vcf either, drop
						continue
					}

				} else {
					continue
				}
			}

			g2.samples.push(s2)
		}
		if(g2.samples.length==0) continue

		plotgroups.push(g2)
	}

	if(tk.sortgroupby && tk.sortgroupby.key && tk.sortgroupby.order) {
		// sort groups, may be available for official track
		const lst = []
		for(const value of tk.sortgroupby.order) {
			for(const g of plotgroups) {
				for(const at of g.attributes) {
					if(at.k == tk.sortgroupby.key && at.kvalue==value) {
						// is one
						g._sorted=1
						lst.push(g)
						break
					}
				}
			}
		}
		for(const g of plotgroups) {
			if(!g._sorted) lst.push(g)
		}
		for(const g of lst) delete g._sorted
		plotgroups = lst
	}

	return [ plotgroups, svlst4dense ]
}




////////////////////// __multi ends






















/////////////  __maketk



function makeTk(tk, block) {

	tk.tip2 = new client.Menu({padding:'0px'})

	if(!tk.attrnamespacer) {
		// fill in for custom track
		tk.attrnamespacer=', '
	}

	if(tk.singlesample) {

		tk.tklabel.text( (tk.name? tk.name+', ' : '') + tk.singlesample.name )

		tk.svvcf_g=tk.glider.append('g') // show sv as lollipops
		tk.cnv_g=tk.glider.append('g') // show cnv/loh as bed track

	} else {

		// multi-sample
		tk.tklabel.text( tk.name )
		tk.isdense=true
		tk.isfull=false
		tk.cnvleftg= tk.gleft.append('g')
		tk.vcfdensityg = tk.glider.append('g')
		tk.vcfdensitylabelg = tk.gleft.append('g')
		tk.svdensityg = tk.glider.append('g')
		tk.svdensitylabelg = tk.gleft.append('g')
		tk.cnvmidg = tk.glider.append('g')
		tk.cnvrightg = tk.gright.append('g')
	}

	tk.cnvcolor={}

	{
		const t = d3rgb(tk.gaincolor)
		tk.cnvcolor.gain = {
			str: tk.gaincolor,
			r: t.r,
			g: t.g,
			b: t.b
		}
		delete tk.gaincolor
	}
	{
		const t = d3rgb(tk.losscolor)
		tk.cnvcolor.loss = {
			str: tk.losscolor,
			r: t.r,
			g: t.g,
			b: t.b
		}
		delete tk.losscolor
	}
	{
		const t = d3rgb(tk.lohcolor)
		tk.cnvcolor.loh = {
			str: tk.lohcolor,
			r: t.r,
			g: t.g,
			b: t.b
		}
		delete tk.lohcolor
	}

	if(tk.iscustom) {
		// default value for naive custom track
		if(tk.valueCutoff==undefined) tk.valueCutoff=0.2
		if(tk.bplengthUpperLimit==undefined) tk.bplengthUpperLimit=2000000
		if(tk.segmeanValueCutoff==undefined) tk.segmeanValueCutoff=0.1
		if(tk.lohLengthUpperLimit==undefined) tk.lohLengthUpperLimit=2000000
	}

	// config
	tk.config_handle = block.maketkconfighandle(tk)
		.on('click', ()=>{
			configPanel(tk, block)
		})

	makeTk_legend(block, tk)

	// gene expression config

	let hasexpression = false
	if(tk.iscustom) {
		// custom
		if(tk.checkexpressionrank) {
			hasexpression = true
			tk.gecfg = {
				datatype: tk.checkexpressionrank.datatype
			}
		}
	} else {
		// official
		if(tk.mds.queries[tk.querykey].checkexpressionrank) {
			hasexpression=true
			tk.gecfg = tk.mds.queries[ tk.mds.queries[tk.querykey].checkexpressionrank.querykey ]
		}
	}
	if(hasexpression) {
		/* inherit configs from official tk, if not, rebuild
		this can make sure the same configurations are also available under the dataset.queries.genefpkm
		allowing it to be shared for boxplots etc.
		*/
		if(!tk.gecfg) tk.gecfg={}

		expressionstat.init_config( tk.gecfg )
	}

	// end of makeTk
}












function multi_changemode(tk, block) {
	tk.tkconfigtip.hide()
	if(tk.mode_radio_1.property('checked')) {
		tk.isdense=true
		tk.isfull=false
	} else if(tk.mode_radio_2.property('checked')) {
		tk.isdense=false
		tk.isfull=true
	}
	render_samplegroups(tk,block)
	block.block_setheight()
	block.setllabel()
}





function configPanel(tk, block) {
	tk.tkconfigtip.clear()
		.showunder(tk.config_handle.node())

	const holder=tk.tkconfigtip.d

	may_show_samplematrix_button( tk, block)

	may_allow_modeswitch( tk, block )

	may_allow_samplesearch( tk, block)


	// filter cnv with sv
	{
		const row=holder.append('div').style('margin-bottom','15px')
		const id = Math.random().toString()
		row.append('input')
			.attr('type','checkbox')
			.attr('id', id)
			.property( 'checked', tk.showonlycnvwithsv )
			.on('change',()=>{
				tk.showonlycnvwithsv = d3event.target.checked
				loadTk(tk, block)
			})
		row.append('label')
			.attr('for',id)
			.html('&nbsp;Show only CNV with SV support')
		row.append('div')
			.style('font-size','.7em').style('color','#858585')
			.html('SV breakpoint must be inside a CNV or within its 1 Kb flanking.')
	}

	// cnv log2 ratio
	{
		const row=holder.append('div').style('margin-bottom','15px')
		row.append('span').html('CNV log2(ratio) cutoff&nbsp;')
		row.append('input')
			.property( 'value', tk.valueCutoff || 0 )
			.attr('type','number')
			.style('width','50px')
			.on('keyup',()=>{
				if(d3event.code!='Enter' && d3event.code!='NumpadEnter') return
				let v=Number.parseFloat(d3event.target.value)
				if(!v || v<0) {
					// invalid value, set to 0 to cancel
					v=0
				}
				if(v==0) {
					if(tk.valueCutoff) {
						// cutoff has been set, cancel and refetch data
						tk.valueCutoff=0
						loadTk(tk,block)
					} else {
						// cutoff has not been set, do nothing
					}
					return
				}
				// set cutoff
				if(tk.valueCutoff) {
					// cutoff has been set
					if(tk.valueCutoff==v) {
						// same as current cutoff, do nothing
					} else {
						// set new cutoff
						tk.valueCutoff=v
						loadTk(tk, block)
					}
				} else {
					// cutoff has not been set
					tk.valueCutoff=v
					loadTk(tk, block)
				}
			})
		row.append('div')
			.style('font-size','.7em').style('color','#858585')
			.html('Only show CNV with absolute log2(ratio) no less than cutoff.<br>Set to 0 to cancel.')
	}

	// focal cnv
	{
		const row=holder.append('div').style('margin-bottom','15px')
		row.append('span')
			.html('CNV segment size limit&nbsp;')
		row.append('input')
			.property('value',tk.bplengthUpperLimit || 0)
			.attr('type','number')
			.style('width','80px')
			.on('keyup',()=>{
				if(d3event.code!='Enter' && d3event.code!='NumpadEnter') return
				let v = Number.parseInt(d3event.target.value)
				if(!v || v<0) {
					// invalid value, set to 0 to cancel
					v=0
				}
				if(v==0) {
					if(tk.bplengthUpperLimit) {
						// cutoff has been set, cancel and refetch data
						tk.bplengthUpperLimit=0
						loadTk(tk,block)
					} else {
						// cutoff has not been set, do nothing
					}
					return
				}
				// set cutoff
				if(tk.bplengthUpperLimit) {
					// cutoff has been set
					if(tk.bplengthUpperLimit==v) {
						// same as current cutoff, do nothing
					} else {
						// set new cutoff
						tk.bplengthUpperLimit=v
						loadTk(tk, block)
					}
				} else {
					// cutoff has not been set
					tk.bplengthUpperLimit=v
					loadTk(tk, block)
				}
			})
		row.append('span').text('bp')
		row.append('div')
			.style('font-size','.7em').style('color','#858585')
			.html('Limit the CNV segment length to show only focal events.<br>Set to 0 to cancel.')
	}

	// cnv color
	{
		const row=holder.append('div')
		row.append('span')
			.html('Copy number gain&nbsp;')
		row.append('input')
			.attr('type','color')
			.property('value',tk.cnvcolor.gain.str)
			.on('change',()=>{
				tk.cnvcolor.gain.str=d3event.target.value
				const c = d3rgb(tk.cnvcolor.gain.str)
				tk.cnvcolor.gain.r = c.r
				tk.cnvcolor.gain.g = c.g
				tk.cnvcolor.gain.b = c.b
				tk.cnvcolor.cnvlegend.gain_stop.attr('stop-color', tk.cnvcolor.gain.str)
				if(tk.singlesample) {
					render_singlesample(tk,block)
				} else {
					render_samplegroups(tk, block)
				}
			})
		row.append('span').html('&nbsp;&nbsp;loss&nbsp;')
		row.append('input')
			.attr('type','color')
			.property('value',tk.cnvcolor.loss.str)
			.on('change',()=>{
				tk.cnvcolor.loss.str=d3event.target.value
				const c = d3rgb(tk.cnvcolor.loss.str)
				tk.cnvcolor.loss.r = c.r
				tk.cnvcolor.loss.g = c.g
				tk.cnvcolor.loss.b = c.b
				tk.cnvcolor.cnvlegend.loss_stop.attr('stop-color', tk.cnvcolor.loss.str)
				if(tk.singlesample) {
					render_singlesample(tk,block)
				} else {
					render_samplegroups(tk, block)
				}
			})
	}

	holder.append('hr').style('margin','20px')


	// loh segmean cutoff
	{
		const row=holder.append('div')
			.style('margin-bottom','15px')
		row.append('span').html('LOH seg.mean cutoff&nbsp;')
		row.append('input')
			.property( 'value', tk.segmeanValueCutoff || 0 )
			.attr('type','number')
			.style('width','50px')
			.on('keyup',()=>{
				if(d3event.code!='Enter' && d3event.code!='NumpadEnter') return
				let v=Number.parseFloat(d3event.target.value)
				if(!v || v<0) {
					// invalid value, set to 0 to cancel
					v=0
				}
				if(v==0) {
					if(tk.segmeanValueCutoff) {
						// cutoff has been set, cancel and refetch data
						tk.segmeanValueCutoff=0
						loadTk(tk,block)
					} else {
						// cutoff has not been set, do nothing
					}
					return
				}
				// set cutoff
				if(tk.segmeanValueCutoff) {
					// cutoff has been set
					if(tk.segmeanValueCutoff==v) {
						// same as current cutoff, do nothing
					} else {
						// set new cutoff
						tk.segmeanValueCutoff=v
						loadTk(tk, block)
					}
				} else {
					// cutoff has not been set
					tk.segmeanValueCutoff=v
					loadTk(tk, block)
				}
			})
		row.append('div')
			.style('font-size','.7em').style('color','#858585')
			.html('Only show LOH with seg.mean no less than cutoff.<br>Set to 0 to cancel.')
	}

	// focal loh
	{
		const row=holder.append('div').style('margin-bottom','15px')
		row.append('span')
			.html('LOH segment size limit&nbsp;')
		row.append('input')
			.property('value',tk.lohLengthUpperLimit || 0)
			.attr('type','number')
			.style('width','80px')
			.on('keyup',()=>{
				if(d3event.code!='Enter' && d3event.code!='NumpadEnter') return
				let v = Number.parseInt(d3event.target.value)
				if(!v || v<0) {
					// invalid value, set to 0 to cancel
					v=0
				}
				if(v==0) {
					if(tk.lohLengthUpperLimit) {
						// cutoff has been set, cancel and refetch data
						tk.lohLengthUpperLimit=0
						loadTk(tk,block)
					} else {
						// cutoff has not been set, do nothing
					}
					return
				}
				// set cutoff
				if(tk.lohLengthUpperLimit) {
					// cutoff has been set
					if(tk.lohLengthUpperLimit==v) {
						// same as current cutoff, do nothing
					} else {
						// set new cutoff
						tk.lohLengthUpperLimit=v
						loadTk(tk, block)
					}
				} else {
					// cutoff has not been set
					tk.lohLengthUpperLimit=v
					loadTk(tk, block)
				}
			})
		row.append('span').text('bp')
		row.append('div')
			.style('font-size','.7em').style('color','#858585')
			.html('Limit the LOH segment length to show only focal events.<br>Set to 0 to cancel.')
	}

	// loh color
	{
		const row=holder.append('div').style('margin-bottom','1px')
		row.append('span')
			.html('LOH color&nbsp;')
		row.append('input')
			.attr('type','color')
			.property('value',tk.cnvcolor.loh.str)
			.on('change',()=>{
				tk.cnvcolor.loh.str=d3event.target.value
				const c = d3rgb(tk.cnvcolor.loh.str)
				tk.cnvcolor.loh.r = c.r
				tk.cnvcolor.loh.g = c.g
				tk.cnvcolor.loh.b = c.b
				tk.cnvcolor.lohlegend.loh_stop.attr('stop-color', tk.cnvcolor.loh.str)
				if(tk.singlesample) {
					render_singlesample(tk,block)
				} else {
					render_samplegroups(tk, block)
				}
			})
	}

	// end of config
}


function may_allow_modeswitch(tk, block) {
	// only for multi-sample
	if(tk.singlesample) return

	const div = tk.tkconfigtip.d.append('div')
		.style('background','#FAF9DE')
		.style('margin-bottom','20px')
		.style('padding','15px')

	const id1=Math.random().toString()
	const id2=Math.random().toString()
	const name=Math.random().toString()
	const row1=div.append('div')
		.style('margin-bottom','5px')
	tk.mode_radio_1=row1.append('input')
		.attr('type','radio')
		.attr('id',id1)
		.attr('name',name)
		.property('checked', tk.isdense)
		.on('change',()=>{
			multi_changemode( tk, block )
		})
	row1.append('label')
		.attr('for',id1)
		.attr('class','sja_clbtext')
		.html('&nbsp;Dense <span style="font-size:.7em;color:#858585;">Showing densities of SV breakpoints and SNV/indels, over all samples</span>')

	const row2=div.append('div')
	tk.mode_radio_2=row2.append('input')
		.attr('type','radio')
		.attr('id',id2)
		.attr('name',name)
		.property('checked', tk.isfull)
		.on('change',()=>{
			multi_changemode( tk, block )
		})
	row2.append('label')
		.attr('for',id2)
		.attr('class','sja_clbtext')
		.html('&nbsp;Expanded <span style="font-size:.7em;color:#858585;">Showing SV/SNV/indel for each sample</span>')
}


function may_allow_samplesearch(tk, block) {
	/*
	for official track, allow search for sample
	single or multi
	*/
	if(tk.iscustom) return

	const row=tk.tkconfigtip.d.append('div')
		.style('margin-bottom','15px')
	row.append('input')
		.attr('size',20)
		.attr('placeholder', 'Find sample')
		.on('keyup',()=>{

			tk.tip2.showunder(d3event.target)
				.clear()
			
			const str = d3event.target.value
			if(!str) return

			const par={
				jwt:block.jwt,
				genome:block.genome.name,
				dslabel:tk.mds.label,
				querykey:tk.querykey,
				findsamplename: str
			}
			return fetch( new Request(block.hostURL+'/mdssvcnv', {
				method:'POST',
				body:JSON.stringify(par)
			}))
			.then(data=>{return data.json()})
			.then(data=>{

				if(data.error) throw({message:data.error})
				if(!data.result) return
				for(const sample of data.result) {

					const cell= tk.tip2.d.append('div')
					cell.append('span')
						.text(sample.name)

					if(sample.attributes) {
						const groupname = sample.attributes.map(i=>i.kvalue).join( tk.attrnamespacer )
						cell.append('div')
							.style('display','inline-block')
							.style('margin-left','10px')
							.style('font-size','.7em')
							.style('color', tk.legend_samplegroup.color( groupname ) )
							.html( groupname )
					}

					cell
						.attr('class','sja_menuoption')
						.on('click',()=>{

							tk.tip2.hide()
							focus_singlesample({
								sample: {samplename: sample.name},
								samplegroup: {attributes: sample.attributes},
								tk: tk,
								block: block
							})
						})
				}
			})
			.catch(err=>{
				client.sayerror( tk.tip2.d, err.message)
				if(err.stack) console.log(err.stack)
			})
		})
}




/////////////  __maketk ENDS















export function map_cnv(item, tk, block) {
	/*
	cnv, loh, itd
	*/
	const main = block.tkarg_maygm( tk )[0]
	if(item.chr==main.chr && Math.max(item.start,main.start)<Math.min(item.stop,main.stop)) {
		item.x1=block.seekcoord(item.chr, Math.max(item.start,main.start))[0].x
		item.x2=block.seekcoord(item.chr, Math.min(item.stop,main.stop))[0].x
	}
	let x=block.width
	for(const p of block.subpanels) {
		x+=p.leftpad
		if(item.chr==p.chr && Math.max(item.start,p.start)<Math.min(item.stop,p.stop)) {
			const x1=x+(Math.max(item.start,p.start)-p.start)*p.exonsf
			const x2=x+(Math.min(item.stop,p.stop)-p.start)*p.exonsf
			if(item.x1==undefined) {
				item.x1=x1
				item.x2=x2
			} else {
				item.x2=x2
			}
		}
		x+=p.width
	}
}



function map_sv_2(item,block) {
	const lst = block.seekcoord(item._chr, item._pos)
	for(const r of lst) {
		if(r.ridx!=undefined) {
			// in main, if outside won't show this end
			if(r.x>0 && r.x<block.width) {
				item.x = r.x
				break
			}
		} else if(r.subpanelidx!=undefined) {
			item.x = r.x
		}
	}
}
















function may_map_vcf(tk, block) {
	// map to view range: snvindel, itd
	if(!tk.data_vcf) return
	for(const m of tk.data_vcf) {

		if(m.dt==common.dtsnvindel) {
			m._chr = m.chr
			m._pos = m.pos
			map_sv_2( m, block )
			if(m.x==undefined) {
				console.log('snvindel unmapped: '+m.chr+':'+m.pos)
			} else {
				delete m._chr
				delete m._pos
			}
		} else {
			console.error('may_map_vcf: unknown dt')
		}
	}
}




function vcfdata_prepmclass(tk, block) {
	/*
	_data_vcf returned by server
	will be filtered to data_vcf for display
	changing mclass filtering option will call this and won't reload data
	because server-side code cannot yet parse out m class from csq
	*/
	if(!tk._data_vcf || tk._data_vcf.length==0) {
		tk.data_vcf=null
		return
	}
	for(const m of tk._data_vcf) {
		if( m.dt == common.dtsnvindel ) {
			common.vcfcopymclass(m, block)
		} else {
			throw('unknown dt '+m.dt)
		}
	}
}




function applyfilter_vcfdata(tk) {
	/*
	drop hidden snvindel from client-side
	must work on the original set, otherwise class filtering won't work
	*/
	if(!tk._data_vcf) return
	tk.data_vcf = []
	for(const m of tk._data_vcf) {
		if( m.class && !tk.legend_mclass.hidden.has( m.class ) ) {
			tk.data_vcf.push(m)
		}
	}
}





export function dedup_sv( lst ) {
	/* sv are breakends
	dedup
	*/
	const key2sv = new Map()
	for(const i of lst) {
		key2sv.set(
			i.sample+'.'+i.chrA+'.'+i.posA+'.'+i.strandA+'.'+i.chrB+'.'+i.posB+'.'+i.strandB,
			i
		)
	}
	return [ ...key2sv.values() ]
}
