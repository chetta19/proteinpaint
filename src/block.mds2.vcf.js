import * as common from './common'
import * as client from './client'
import {vcfparsemeta} from './vcf'
import * as numericaxis from './block.mds2.vcf.numericaxis'
import {show_mafcovplot} from './block.mds2.vcf.mafcovplot'
import {termdb_bygenotype} from './block.mds2.vcf.termdb'


/*
********************** EXPORTED
may_render_vcf
vcf_m_color
vcf_m_click
getvcfheader_customtk
********************** INTERNAL

*/



export function may_render_vcf ( data, tk, block ) {
/* for now, assume always in variant-only mode for vcf
return vcf row height
*/
	if( !tk.vcf ) return 0
	if( !data.vcf ) return 0
	if( !data.vcf.rglst ) return 0

	tk.g_vcfrow.selectAll('*').remove()

	/* current implementation ignore subpanels
	to be fixed in p4
	*/


	let rowheight = 0

	for(const r of data.vcf.rglst) {
		
		const g = tk.g_vcfrow.append('g')
			.attr('transform','translate('+r.xoff+',0)')

		if( r.rangetoobig ) {
			r.text_rangetoobig = g.append('text')
				.text( r.rangetoobig )
				.attr('text-anchor','middle')
				.attr('dominant-baseline','central')
				.attr('x', r.width/2 )
				// set y after row height is decided
			rowheight = Math.max( rowheight, 50 )
			continue
		}

		if( r.imgsrc ) {
			g.append('image')
				.attr('width', r.width)
				.attr('height', r.imgheight)
				.attr('xlink:href', r.imgsrc)
			rowheight = Math.max( rowheight, r.imgheight )
			continue
		}

		if( r.variants ) {
			const height = vcf_render_variants( r, g, tk, block )
			rowheight = Math.max( rowheight, height )
			continue
		}
	}

	// row height set
	for(const r of data.vcf.rglst) {
		if(r.rangetoobig) {
			r.text_rangetoobig.attr('y', rowheight/2 )
		}
	}

	return rowheight
}




function vcf_render_variants ( r, g, tk, block ) {
/*
got the actual list of variants at r.variants[], render them
*/

	if( tk.vcf.numerical_axis && tk.vcf.numerical_axis.in_use ) {
		// numerical axis by info field
		const height = numericaxis.render( r, g, tk, block )
		return height
	}

	// not numerical axis
	// TODO
	return 50
}



export function vcf_m_color ( m, tk ) {
// TODO using categorical attribute
	return common.mclass[m.class].color
}



export function vcf_m_click ( m, p, tk, block ) {
/*
p{}
	.left
	.top
*/
	// if to show sunburst, do it here, no pane

	const pane = client.newpane({x: p.left, y: p.top})

	const buttonrow = pane.body.append('div')
		.style('margin','20px')

	const showholder = pane.body.append('div')

	maymakebutton_vcf_termdbbygenotype( buttonrow, showholder, m, tk, block )
	maymakebutton_vcf_mafcovplot( buttonrow, showholder, m, tk, block )
}








export function getvcfheader_customtk ( tk, genome ) {

	const arg = {
		file: tk.file,
		url: tk.url,
		indexURL: tk.indexURL
	}
	return client.dofetch('vcfheader', arg)
	.then( data => {
		if(data.error) throw data.error

		const [info,format,samples,errs]=vcfparsemeta(data.metastr.split('\n'))
		if(errs) throw 'Error parsing VCF meta lines: '+errs.join('; ')
		tk.info = info
		tk.format = format
		tk.samples = samples
		tk.nochr = common.contigNameNoChr( genome, data.chrstr.split('\n') )
	})
}




function maymakebutton_vcf_mafcovplot ( buttonrow, showholder, m, tk, block ) {
// only for vcf item

	if(!tk.vcf) return
	if(!tk.vcf.plot_mafcov ) return

	let loading = false,
		loaded = false

	const button = buttonrow.append('div')
		.style('display','inline-block')
		.attr('class','sja_menuoption')
		.text('Coverage-maf plot')

	const plotdiv = showholder.append('div')

	button.on('click', async ()=>{

		if( loading ) return
		if( loaded ) {
			if(plotdiv.style('display')=='none') {
				client.appear(plotdiv)
			} else {
				client.disappear(plotdiv)
			}
			return
		}
		loading=true
		button.text('Loading...')
		try {
			await show_mafcovplot( plotdiv, m, tk, block )
		}catch(e){
			plotdiv.text('Error: '+(e.message||e))
		}
		loading=false
		loaded=true
		button.text('Coverage-maf plot')
	})
}




function maymakebutton_vcf_termdbbygenotype ( buttonrow, showholder, m, tk, block ) {
// only for vcf, by variant genotype

	if(!tk.vcf) return
	if(!tk.vcf.termdb_bygenotype) return

	let loading = false,
		loaded = false

	const button = buttonrow.append('div')
		.style('display','inline-block')
		.attr('class','sja_menuoption')
		.text('Clinical info')

	const plotdiv = showholder.append('div')

	button.on('click', async ()=>{

		if( loading ) return
		if( loaded ) {
			if(plotdiv.style('display')=='none') {
				client.appear(plotdiv)
			} else {
				client.disappear(plotdiv)
			}
			return
		}
		loading=true
		button.text('Loading...')
		try {
			await termdb_bygenotype( plotdiv, m, tk, block )
		}catch(e){
			plotdiv.text('Error: '+(e.message||e))
		}
		loading=false
		loaded=true
		button.text('Clinical info')
	})
}
