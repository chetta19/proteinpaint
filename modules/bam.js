const app = require('../app')
const path = require('path')
const fs = require('fs')
const utils = require('./utils')
const createCanvas = require('canvas').createCanvas
const spawn = require('child_process').spawn
const readline = require('readline')
const interpolateRgb = require('d3-interpolate').interpolateRgb
const match_complexvariant = require('./bam.kmer.indel').match_complexvariant
const bamcommon = require('./bam.common')

/*
XXX quick fix to be removed/disabled later
-- __tempscore 

1. reads are parsed into template/segments
2. mismatch checked if sufficient zoom in
3. divide reads to groups:
   upon first query, will produce all possible groups based on variant type
   - snv/indel yields up to 3 groups
     1. if by snv, will require mismatches
     2. if by complex variant, require read sequence to do k-mer or blast
   - sv yields up to 2 groups
     method to be developed
   - default just 1 group with all the reads
   each group is assigned a hardcoded "type" string
   server returns all groups with non-0 templates
   client may zoom into one dense group, in which the group type will be indicated in server request
   so server should only generate group matching that type
4. stack, trim, and render each read group.
   currently code from here is agnostic to type of group
   but possible to implement type-specific method


when client zooms into one read group, server needs to know which group it is and only generate that group

*********************** new q{}
.grouptype, .partstack{}
.genome
.devicePixelRatio
.asPaired
.stacksegspacing
.canvaswidth
.variant{}
	.chr/pos/ref/alt
.sv{}
	.chrA/posA/chrB/posB
.regions[ r ]
	.chr/start/stop
	.scale()
	.referenceseq     str
	.to_printnt  bool
	.to_qual     bool
	.lines[]
.groups[ {} ]   multi-groups sharing the same set of regions, each with a set of reads
	.type
	.partstack{}  user triggered action
	.regions[]
		.x, .scale, .ntwidth // copied from q.regions
		.to_printnt // group-specific
		.to_qual
		
	.templates[]
	.stacks[]
	.returntemplatebox[]
	.stackheight
	.stackspace
	.overlapRP_multirows -- if to show overlap read pairs at separate rows, otherwise in one row one on top of the other
	.overlapRP_hlline  -- at overlap read pairs on separate rows, if to highlight with horizontal line
	.canvasheight
	.messagerows[ {} ]
.messagerows[ {} ]
	.h int
	.t str

*********************** template - segment - box
template {}
.y // initially stack idx, then replaced to be actual screen y
.x1, x2  // screen px, only for stacking not rendering
.segments[]
.height // screen px, only set when to check overlap read pair, will double row height

segment {}
.qname
.segstart
.segstop  // alignment start/stop, 0-based
.seq
.boxes[]
.forward
.ridx
.x1, x2  // screen px, used for rendering
.shiftdownrow // idx of mini stack
.isfirst
.islast

box {}
.opr
.start // absolute bp
.len   // #bp
.cidx  // start position in sequence/qual string
.s (read sequence)
.qual[]


*********************** function cascade
get_q
do_query
	query_reads
		query_region
	get_templates
		parse_one_segment
	may_checkrefseq4mismatch
		check_mismatch
	divide_reads_togroups
		may_match_snv
			make_type2group
				duplicateRegions
		match_complexvariant
		match_sv
	(for each group...)
		stack_templates
			may_trimstacks
		poststack_adjustq
			getstacksizebystacks
			get_refseq
		finalize_templates
			get_stacky
				overlapRP_setflag
				getrowheight_template_overlapread
		plot_messagerows
		plot_template
			plot_segment
		plot_insertions
*/

// match box color, for single read and normal read pairs
const match_hq = 'rgb(120,120,120)'
const match_lq = 'rgb(230,230,230)'
const qual2match = interpolateRgb(match_lq, match_hq)
// match box color, for ctx read pairs
const ctxpair_hq = '#d48b37'
const ctxpair_lq = '#dbc6ad'
const qual2ctxpair = interpolateRgb(ctxpair_lq, ctxpair_hq)
// mismatch: soft red for background only without printed nt, strong red for printing nt on gray background
const mismatchbg_hq = '#d13232'
const mismatchbg_lq = '#ffdbdd'
const qual2mismatchbg = interpolateRgb(mismatchbg_lq, mismatchbg_hq)
// softclip: soft blue for background only, strong blue for printing nt
const softclipbg_hq = '#4888bf'
const softclipbg_lq = '#c9e6ff'
const qual2softclipbg = interpolateRgb(softclipbg_lq, softclipbg_hq)
// insertion, text color gradient to correlate with the quality
// cyan
const insertion_hq = '#47FFFC' //'#00FFFB'
const insertion_lq = '#B2D7D7' //'#009290'
// red
//const insertion_hq = '#ff1f1f'
//const insertion_lq = '#ffa6a6'
// magenta
//const insertion_hq = '#ff00dd' // '#ff4fe5'
//const insertion_lq = '#ffbff6'
// bright green
//const insertion_hq = '#00ff2a'
//const insertion_lq = '#c4ffce'
// yellow
//const insertion_hq = '#ffff14'
//const insertion_lq = '#ffffa6'
// white
//const insertion_hq = '#ffffff'
//const insertion_lq = '#d4d4d4'

const qual2insertion = interpolateRgb(insertion_lq, insertion_hq)
const insertion_maxfontsize = 12
const insertion_minfontsize = 7

const deletion_linecolor = 'red'
const split_linecolorfaint = '#ededed' // if thin stack (hardcoded cutoff 2), otherwise use match_hq
const overlapreadhlcolor = 'blue'
const insertion_vlinecolor = 'black'

const insertion_minpx = 1 // minimum px width to display an insertion
const minntwidth_toqual = 1 // minimum nt px width to show base quality
const minntwidth_overlapRPmultirows = 0.4 // minimum nt px width to show
const minntwidth_findmismatch = 0.9 // mismatch

const minstackheight2strandarrow = 7
const minstackheight2printbplenDN = 7
const maxfontsize2printbplenDN = 10
const minfontsize2printbplenDN = 7

const maxqual = 40

// tricky: on retina screen the individual nt boxes appear to have slight gaps in between
// adding this increment to the rendering of each nt box appear to fix the issue
// yet to be tested on a low-res screen
const ntboxwidthincrement = 0.5

// space between reads in the same stack, either 5 bp or 5 px, which ever greater
const readspace_px = 2
const readspace_bp = 5

const maxreadcount = 10000 // maximum number of reads to load
const maxcanvasheight = 1500 // ideal max canvas height in pixels

const pileupplotheight = 250 // Height for pileup plot
const pileupplotwidth = 100 // Width for pileup plot

const bases = new Set(['A', 'T', 'C', 'G'])

const serverconfig = utils.serverconfig
const samtools = serverconfig.samtools || 'samtools'
const sambamba = serverconfig.sambamba || 'sambamba'

module.exports = genomes => {
	return async (req, res) => {
		app.log(req)
		try {
			if (!req.query.genome) throw '.genome missing'
			const genome = genomes[req.query.genome]
			if (!genome) throw 'invalid genome'
			if (req.query.getread) {
				res.send(await route_getread(genome, req))
				return
			}

			const q = await get_q(genome, req)
			res.send(await do_query(q, req))
			//console.log("q:",q)
		} catch (e) {
			res.send({ error: e.message || e })
			if (e.stack) console.log(e.stack)
		}
	}
}

async function get_pileup(q, req) {
	const pileup_input = JSON.parse(req.query.regions.replace('[', '').replace(']', ''))
	const ref_seq = (await utils.get_fasta(
		q.genome,
		pileup_input.chr + ':' + parseInt(pileup_input.start).toString() + '-' + parseInt(pileup_input.stop).toString()
	))
		.split('\n')
		.slice(1)
		.join('')
		.toUpperCase()

	const pileup_plot_str = await run_sambamba(
		q.file,
		pileup_input.chr.replace('chr', ''),
		pileup_input.start,
		pileup_input.stop
	)
	//console.log('pileup_plot_str:', pileup_plot_str)
	let total_cov = []
	let As_cov = []
	let Cs_cov = []
	let Gs_cov = []
	let Ts_cov = []
	let ref_cov = []
	let first_iter = 1
	let consensus_seq = ''
	let seq_iter = 0
	for (const line of pileup_plot_str.split('\n')) {
		if (first_iter == 1) {
			first_iter = 0
		} else if (line.length == 0) {
			continue
		} else {
			const columns = line.split('\t')
			total_cov.push(parseInt(columns[2]))
			const max_value = Math.max(parseInt(columns[3]), parseInt(columns[4]), parseInt(columns[5]), parseInt(columns[6]))
			if (max_value == parseInt(columns[3])) {
				// Look into this
				consensus_seq += 'A'
			}
			if (max_value == parseInt(columns[4])) {
				consensus_seq += 'C'
			}
			if (max_value == parseInt(columns[5])) {
				consensus_seq += 'G'
			}
			if (max_value == parseInt(columns[6])) {
				consensus_seq += 'T'
			}

			// Determining ref allele and adding nucleotide depth to ref allele and to other alternate allele nucleotides
			if (ref_seq[seq_iter] == 'A') {
				As_cov.push(0)
				ref_cov.push(parseInt(columns[3]))
				Cs_cov.push(parseInt(columns[4]))
				Gs_cov.push(parseInt(columns[5]))
				Ts_cov.push(parseInt(columns[6]))
			}
			if (ref_seq[seq_iter] == 'C') {
				As_cov.push(parseInt(columns[3]))
				ref_cov.push(parseInt(columns[4]))
				Cs_cov.push(0)
				Gs_cov.push(parseInt(columns[5]))
				Ts_cov.push(parseInt(columns[6]))
			}
			if (ref_seq[seq_iter] == 'G') {
				As_cov.push(parseInt(columns[3]))
				Cs_cov.push(parseInt(columns[4]))
				ref_cov.push(parseInt(columns[5]))
				Gs_cov.push(0)
				Ts_cov.push(parseInt(columns[6]))
			}
			if (ref_seq[seq_iter] == 'T') {
				As_cov.push(parseInt(columns[3]))
				Cs_cov.push(parseInt(columns[4]))
				Gs_cov.push(parseInt(columns[5]))
				ref_cov.push(parseInt(columns[6]))
				Ts_cov.push(0)
			}
			seq_iter += 1
		}
	}
	console.log('ref_seq:', ref_seq)
	//console.log('ref_seq length:', ref_seq.length)
	console.log('con_seq:', consensus_seq)
	//console.log('consensus length:', consensus_seq.length)

	const pileup_height = 250
	const pileup_data = {
		total_cov: total_cov,
		As_cov: As_cov,
		Cs_cov: Cs_cov,
		Gs_cov: Gs_cov,
		Ts_cov: Ts_cov,
		ref_cov: ref_cov,
		ref_seq: ref_seq,
		width: q.canvaswidth,
		height: pileup_height,
		src: pileup_plot(q, total_cov, As_cov, Cs_cov, Gs_cov, Ts_cov, ref_cov, pileup_height, req.query.nucleotide_length) // Creating image to be seen at the front end
	}
	q.pileup_data = pileup_data
}

function pileup_plot(q, total_cov, As_cov, Cs_cov, Gs_cov, Ts_cov, ref_cov, pileup_height, nucleotide_length) {
	const canvas = createCanvas(q.canvaswidth * q.devicePixelRatio, pileup_height * q.devicePixelRatio)
	const ctx = canvas.getContext('2d')
	//const maxValue = Math.max(...total_cov)
	const maxValue = Math.max(...As_cov, ...Cs_cov, ...Gs_cov, ...Ts_cov) + 2
	console.log('maxValue:', maxValue)
	const padding = 0
	const canvasActualHeight = canvas.height //- padding * 2
	const canvasActualWidth = canvas.width //- padding * 2

	//drawing the grid lines
	let gridValue = 0
	const gridScale = 1
	while (gridValue <= maxValue) {
		var gridY = canvasActualHeight * (1 - gridValue / maxValue) + padding
		//            drawLine(
		//		     ctx,
		//		     0,
		//		     gridY,
		//		     canvas.width,
		//		     gridY,
		//                     'rgb(200, 0, 0)'
		//		     )

		//writing grid markers
		ctx.save()
		ctx.fillStyle = 'rgb(200, 0, 0)'
		ctx.font = 'bold 10px Arial'
		ctx.fillText(gridValue, 10, gridY - 2)
		ctx.restore()

		gridValue += gridScale
	}

	//	let barIndex = 0
	//        const numberOfBars = total_cov.length
	//        const barSize = (canvasActualWidth)/numberOfBars
	//        let val=0
	//	    for (iter in total_cov){
	//                val=total_cov[iter]
	//                console.log("val:",val)
	//                const barHeight = Math.round( canvasActualHeight * val/maxValue)
	//                drawBar(
	//    		    ctx,
	//    		    padding + barIndex * barSize,
	//    		    canvas.height - barHeight - padding,
	//    		    barSize,
	//    		    barHeight,
	//                        'rgb(200, 0, 0)'
	//    		    )
	//                barIndex++
	//            }

	let barIndex = 0
	const numberOfBars = total_cov.length
	const barSize = canvasActualWidth / numberOfBars
	let val = 0
	let barHeight = 0
	let y_start = 0
	let color = ''
	let ref_barHeight = 0
	let ref_y_start = 0
	for (iter in total_cov) {
		for (let i = 0; i < 5; i++) {
			if (i == 0) {
				val = Ts_cov[iter]
				barHeight = Math.round((canvasActualHeight * val) / maxValue)
				y_start = canvas.height - barHeight - padding
				color = 'rgb(0,0,255)' //T-blue
			} else if (i == 1) {
				val = As_cov[iter]
				barHeight = Math.round((canvasActualHeight * val) / maxValue)
				y_start -= barHeight
				color = 'rgb(220,20,60)' //A-red
			} else if (i == 2) {
				val = Cs_cov[iter]
				barHeight = Math.round((canvasActualHeight * val) / maxValue)
				y_start -= barHeight
				color = 'rgb(0,100,0)' //C-green
			} else if (i == 3) {
				val = Gs_cov[iter]
				barHeight = Math.round((canvasActualHeight * val) / maxValue)
				y_start -= barHeight
				color = 'rgb(255,20,147)' //G-pink
			} else if (i == 4) {
				val = ref_cov[iter]
				barHeight = Math.round((canvasActualHeight * val) / maxValue)
				y_start -= barHeight
				color = 'rgb(192,192,192)' //Ref-grey
			}
			//                console.log("val:",val)
			//                console.log("barHeight:",barHeight)
			//                console.log("iter:",iter)
			//                console.log("i:",i)
			//                console.log("y_start:",y_start)

			//                if (i==0) {
			//                   ref_barHeight=barHeight
			//                   ref_y_start=y_start
			//                }
			//                if (val > 0 && i!=0) {
			//                console.log("val:",val)
			//                console.log("i:",i)
			//                console.log("iter:",iter)
			//                console.log("color:",color)
			//                console.log("y_start:",y_start)
			//                console.log("barHeight:",barHeight)
			//                console.log("ref_y_start:",ref_y_start)
			//                console.log("ref_barHeight:",ref_barHeight)
			//                }
			if (val > 0) {
				drawBar(ctx, padding + barIndex * barSize, y_start, barSize, barHeight, color)
				// drawBar(ctx, padding + barIndex * nucleotide_length, y_start, nucleotide_length, barHeight, color)
			}
		}
		barIndex++
	}

	return canvas.toDataURL()
}

function drawLine(ctx, startX, startY, endX, endY, color) {
	ctx.save()
	ctx.strokeStyle = color
	ctx.beginPath()
	ctx.moveTo(startX, startY)
	ctx.lineTo(endX, endY)
	ctx.stroke()
	ctx.restore()
}

function drawBar(ctx, upperLeftCornerX, upperLeftCornerY, width, height, color) {
	ctx.save()
	ctx.fillStyle = color
	ctx.fillRect(upperLeftCornerX, upperLeftCornerY, width, height)
	ctx.restore()
}

async function get_q(genome, req) {
	const [e, _file, isurl] = app.fileurl(req)
	if (e) throw e
	// a query object to collect all the bits
	const q = {
		genome,
		file: _file, // may change if is url
		asPaired: req.query.asPaired,
		getcolorscale: req.query.getcolorscale,
		_numofreads: 0, // temp, to count num of reads while loading and detect above limit
		messagerows: [],
		devicePixelRatio: req.query.devicePixelRatio ? Number(req.query.devicePixelRatio) : 1
	}
	if (isurl) {
		q.dir = await utils.cache_index(_file, req.query.indexURL || _file + '.bai')
	}
	if (req.query.variant) {
		const t = req.query.variant.split('.')
		if (t.length != 4) throw 'invalid variant, not chr.pos.ref.alt'
		q.variant = {
			chr: t[0],
			pos: Number(t[1]),
			ref: t[2].toUpperCase(),
			alt: t[3].toUpperCase()
		}
		if (Number.isNaN(q.variant.pos)) throw 'variant pos not integer'
	} else if (req.query.sv) {
		const t = req.query.sv.split('.')
		if (t.length != 4) throw 'invalid sv, not chrA.posA.chrB.posB'
		q.sv = {
			chrA: t[0],
			posA: Number(t[1]),
			chrB: t[2],
			posB: Number(t[3])
		}
		if (Number.isNaN(q.sv.posA)) throw 'sv.posA not integer'
		if (Number.isNaN(q.sv.posB)) throw 'sv.posB not integer'
	}

	if (req.query.stackstart) {
		// to be assigned to the read group being modified
		if (!req.query.stackstop) throw '.stackstop missing'
		q.partstack = {
			start: Number(req.query.stackstart),
			stop: Number(req.query.stackstop)
		}
		if (Number.isNaN(q.partstack.start)) throw '.stackstart not integer'
		if (Number.isNaN(q.partstack.stop)) throw '.stackstop not integer'
		if (!req.query.grouptype) throw '.grouptype required for partstack'
		q.grouptype = req.query.grouptype
	}

	if (req.query.nochr) {
		q.nochr = JSON.parse(req.query.nochr) // parse "true" into json true
	} else {
		// info not provided
		q.nochr = await app.bam_ifnochr(q.file, genome, q.dir)
	}
	if (!req.query.regions) throw '.regions[] missing'
	q.regions = JSON.parse(req.query.regions)

	let maxntwidth = 0
	for (const r of q.regions) {
		if (!r.chr) throw '.chr missing from a region'
		if (!Number.isInteger(r.start)) throw '.start not integer of a region'
		if (!Number.isInteger(r.stop)) throw '.stop not integer of a region'
		r.scale = p => Math.ceil((r.width * (p - r.start)) / (r.stop - r.start))
		r.ntwidth = r.width / (r.stop - r.start)
		maxntwidth = Math.max(maxntwidth, r.ntwidth)
	}

	// max ntwidth determines segment spacing in a stack, across all regions
	q.stacksegspacing = Math.max(readspace_px, readspace_bp * maxntwidth)

	return q
}

async function do_query(q, req) {
	await query_reads(q)
	delete q._numofreads // read counter no longer needed after loading
	q.totalnumreads = q.regions.reduce((i, j) => i + j.lines.length, 0)

	// parse reads and cigar
	const templates = get_templates(q)
	// if zoomed in, will check reference for mismatch, so that templates can be divided by snv
	// read quality is not parsed yet
	await may_checkrefseq4mismatch(templates, q)

	const result = {
		nochr: q.nochr,
		count: {
			r: q.totalnumreads
		},
		groups: []
	}

	q.canvaswidth = q.regions[q.regions.length - 1].x + q.regions[q.regions.length - 1].width

	{
		const out = await divide_reads_togroups(templates, q)
		q.groups = out.groups
		if (out.refalleleerror) result.refalleleerror = out.refalleleerror
	}

	if (result.count.r == 0) {
		q.groups[0].messagerows.push({
			h: 30,
			t: 'No reads in view range.'
		})
	}
	for (const group of q.groups) {
		// do stacking for each group separately
		// attach temp attributes directly to "group", rendering result push to results.groups[]
		stack_templates(group, q) // add .stacks[], .returntemplatebox[]
		await poststack_adjustq(group, q) // add .allowpartstack
		finalize_templates(group, q) // set .canvasheight

		// result obj of this group
		const gr = {
			type: group.type,
			width: q.canvaswidth,
			height: group.canvasheight,
			stackheight: group.stackheight,
			stackcount: group.stacks.length,
			allowpartstack: group.allowpartstack,
			templatebox: group.returntemplatebox,
			count: { r: group.templates.reduce((i, j) => i + j.segments.length, 0) }
		}

		const canvas = createCanvas(q.canvaswidth * q.devicePixelRatio, group.canvasheight * q.devicePixelRatio)
		const ctx = canvas.getContext('2d')
		if (q.devicePixelRatio > 1) {
			ctx.scale(q.devicePixelRatio, q.devicePixelRatio)
		}
		ctx.textAlign = 'center'
		ctx.textBaseline = 'middle'

		gr.messagerowheights = plot_messagerows(ctx, group, q)

		for (const template of group.templates) {
			plot_template(ctx, template, group, q)
		}
		plot_insertions(ctx, group, q, gr.messagerowheights)

		if (q.asPaired) gr.count.t = group.templates.length
		gr.src = canvas.toDataURL()
		result.groups.push(gr)
	}
	if (q.getcolorscale) result.colorscale = getcolorscale()
	//if (app.features.bamScoreJsPlot) result.kmer_diff_scores_asc = q.kmer_diff_scores_asc
	if (q.kmer_diff_scores_asc) {
		result.kmer_diff_scores_asc = q.kmer_diff_scores_asc
	}
	await get_pileup(q, req) // Run this function to get pilup plot data
	result.pileup_data = q.pileup_data
	//console.log("result:",result)
	return result
}

async function query_reads(q) {
	/*
	if variant, query just the region at the variant position
	then, assign the reads to q.regions[0]
	assume just one region

	if sv, query at the two breakends, and assign reads to two regions one for each breakend
	assume two regions

	otherwise, query for every region in q.regions
	*/
	if (q.variant) {
		const r = {
			chr: q.variant.chr,
			start: q.variant.pos,
			stop: q.variant.pos + q.variant.ref.length
		}
		await query_region(r, q)
		q.regions[0].lines = r.lines
		return
	}
	if (q.sv) {
		return
	}
	for (const r of q.regions) {
		await query_region(r, q) // add r.lines[]
	}
}

function query_region(r, q) {
	// for each region, query its data
	// if too many reads, collapse to coverage
	r.lines = []
	return new Promise((resolve, reject) => {
		const ps = spawn(
			samtools,
			['view', q.file, (q.nochr ? r.chr.replace('chr', '') : r.chr) + ':' + r.start + '-' + r.stop],
			{ cwd: q.dir }
		)
		const rl = readline.createInterface({ input: ps.stdout })
		rl.on('line', line => {
			r.lines.push(line)
			q._numofreads++
			if (q._numofreads >= maxreadcount) {
				ps.kill()
				q.messagerows.push({
					h: 13,
					t: 'Too many reads in view range. Try zooming into a smaller region.'
				})
			}
		})
		rl.on('close', () => {
			resolve()
		})
	})
}

function run_sambamba(bam_file, chr, start, stop) {
	// function for creating the
	return new Promise((resolve, reject) => {
		console.log('sambamba depth base ' + bam_file + ' -L ' + chr + ':' + start + '-' + stop)

		const ls = spawn(sambamba, ['depth', 'base', bam_file, '-L', chr + ':' + start + '-' + stop])

		ls.stdout.on('data', function(data) {
			//Here is where the output goes
			data = data.toString()
			//console.log('stdout: ' + data)
			resolve(data)
		})

		ls.stderr.on('data', data => {
			console.log(`stderr: ${data}`)
		})

		ls.on('close', code => {
			console.log(`child process exited with code ${code}`)
			resolve('')
		})
	})
}

async function may_checkrefseq4mismatch(templates, q) {
	// requires ntwidth
	// read quality is not parsed yet, so need to set cidx for mismatch box so its quality can be added later
	for (const r of q.regions) {
		if (r.lines.length > 0 && r.ntwidth >= minntwidth_findmismatch) {
			r.to_checkmismatch = true
			r.referenceseq = await get_refseq(q.genome, r.chr + ':' + (r.start + 1) + '-' + r.stop)
		}
	}
	for (const t of templates) {
		for (const segment of t.segments) {
			const r = q.regions[segment.ridx]
			if (!r.to_checkmismatch) continue
			const mismatches = []
			for (const b of segment.boxes) {
				if (b.cidx == undefined) {
					continue
				}
				if (b.opr == 'M') {
					b.s = segment.seq.substr(b.cidx, b.len)
					check_mismatch(mismatches, r, b)
				}
			}
			if (mismatches.length) segment.boxes.push(...mismatches)
		}
	}
	// attr no longer needed
	for (const r of q.regions) {
		delete r.to_checkmismatch
		delete r.referenceseq
	}
}

/*
loaded reads for all regions under q.regions
divide to groups if to match with variant
plot each group into a separate canvas

return {}
  .groups[]
  .refalleleerror
*/
async function divide_reads_togroups(templates, q) {
	if (templates.length == 0) {
		// no reads at all, return empty group
		return {
			groups: [
				{
					type: bamcommon.type_all,
					regions: bamcommon.duplicateRegions(q.regions),
					templates,
					messagerows: [],
					partstack: q.partstack
				}
			]
		}
	}

	if (q.variant) {
		// if snv, simple match; otherwise complex match
		const lst = may_match_snv(templates, q)
		if (lst) return { groups: lst }
		return await match_complexvariant(templates, q)
	}
	if (q.sv) {
		return match_sv(templates, q)
	}

	// no variant, return single group
	return {
		groups: [
			{
				type: bamcommon.type_all,
				regions: bamcommon.duplicateRegions(q.regions),
				templates,
				messagerows: [],
				partstack: q.partstack
			}
		]
	}
}

function may_match_snv(templates, q) {
	const refallele = q.variant.ref.toUpperCase()
	const altallele = q.variant.alt.toUpperCase()
	if (!bases.has(refallele) || !bases.has(altallele)) return
	const type2group = bamcommon.make_type2group(q)
	for (const t of templates) {
		let used = false
		for (const s of t.segments) {
			for (const b of s.boxes) {
				if (b.opr == 'X' && b.start == q.variant.pos) {
					// mismatch on this pos
					if (b.s == altallele) {
						if (type2group[bamcommon.type_supportalt]) type2group[bamcommon.type_supportalt].templates.push(t)
					} else {
						if (type2group[bamcommon.type_supportno]) type2group[bamcommon.type_supportno].templates.push(t)
					}
					used = true
					break
				}
			}
			if (used) break
		}
		if (!used) {
			if (type2group[bamcommon.type_supportref]) type2group[bamcommon.type_supportref].templates.push(t)
		}
	}
	const groups = []
	for (const k in type2group) {
		const g = type2group[k]
		if (g.templates.length == 0) continue // empty group, do not include
		g.messagerows.push({
			h: 15,
			t:
				g.templates.length +
				' reads supporting ' +
				(k == bamcommon.type_supportref
					? 'reference allele'
					: k == bamcommon.type_supportalt
					? 'mutant allele'
					: 'neither reference or mutant alleles')
		})
		groups.push(g)
	}
	return groups
}

function match_sv(templates, q) {
	// TODO templates may not be all in one array?
}

function get_templates(q) {
	// parse reads from all regions
	// returns an array of templates, no matter if paired or not
	if (!q.asPaired) {
		// pretends single reads as templates
		const lst = []
		// to account for reads spanning between multiple regions, may use qname2read = new Map()
		for (let i = 0; i < q.regions.length; i++) {
			const r = q.regions[i]
			for (const line of r.lines) {
				const segment = parse_one_segment(line, r, i)
				if (!segment) continue
				lst.push({
					x1: segment.x1,
					x2: segment.x2,
					segments: [segment]
				})
			}
		}
		return lst
	}
	// paired segments are joined together; a template with segments possibly from multiple regions
	const qname2template = new Map()
	// key: qname
	// value: template, a list of segments
	for (let i = 0; i < q.regions.length; i++) {
		const r = q.regions[i]
		for (const line of r.lines) {
			const segment = parse_one_segment(line, r, i)
			if (!segment || !segment.qname) continue
			const temp = qname2template.get(segment.qname)
			if (temp) {
				// add this segment to existing template
				temp.segments.push(segment)
				temp.x2 = Math.max(temp.x2, segment.x2)
			} else {
				qname2template.set(segment.qname, {
					x1: segment.x1,
					x2: segment.x2,
					segments: [segment]
				})
			}
		}
	}
	return [...qname2template.values()]
}

function parse_one_segment(line, r, ridx, keepallboxes) {
	/*
do not do:
  parse seq
  parse qual
  assign seq & qual to each box
  checking mismatch

only gather boxes in view range, with sequence start (cidx) for finalizing later

may skip insertion if on screen width shorter than minimum width
*/
	const l = line.trim().split('\t')
	if (l.length < 11) {
		// truncated line possible if the reading process is killed
		return
	}
	const qname = l[0],
		flag = l[2 - 1],
		segstart_1based = Number.parseInt(l[4 - 1]),
		cigarstr = l[6 - 1],
		// use rnext to tell if mate is on a different chr
		rnext = l[7 - 1],
		pnext = l[8 - 1],
		tlen = Number.parseInt(l[9 - 1]),
		seq = l[10 - 1],
		qual = l[11 - 1]

	if (flag & 0x4) {
		//console.log('unmapped')
		return
	}
	if (Number.isNaN(segstart_1based) || segstart_1based <= 0) {
		// invalid
		return
	}
	const segstart = segstart_1based - 1

	if (cigarstr == '*') {
		return
	}

	const boxes = [] // collect plottable segments
	// as the absolute coord start of each box, will be incremented after parsing a box
	let pos = segstart
	// prev/cum are sequence/qual character offset
	let prev = 0,
		cum = 0

	for (let i = 0; i < cigarstr.length; i++) {
		const cigar = cigarstr[i]
		if (cigar.match(/[0-9]/)) continue
		if (cigar == 'H') {
			// ignore
			continue
		}
		// read bp length of this part
		const len = Number.parseInt(cigarstr.substring(prev, i))
		if (cigar == 'N') {
			// no seq
		} else if (cigar == 'P' || cigar == 'D') {
			// padding or del, no sequence in read
		} else {
			// will consume read seq
			cum += len
		}
		prev = i + 1
		if (cigar == '=' || cigar == 'M') {
			if (keepallboxes || Math.max(pos, r.start) < Math.min(pos + len - 1, r.stop)) {
				// visible
				boxes.push({
					opr: cigar,
					start: pos,
					len,
					cidx: cum - len
				})
				// need cidx for = / M, for quality and sequence mismatch
			}
			pos += len
			continue
		}
		if (cigar == 'I') {
			if (keepallboxes || (pos > r.start && pos < r.stop)) {
				if (len * r.ntwidth >= insertion_minpx) {
					boxes.push({
						opr: 'I',
						start: pos,
						len,
						cidx: cum - len
					})
				}
			}
			continue
		}
		if (cigar == 'N' || cigar == 'D') {
			// deletion or skipped region, must have at least one end within region
			// cannot use max(starts)<min(stops)
			// if both ends are outside of region e.g. intron-spanning rna read, will not include
			if ((pos >= r.start && pos <= r.stop) || (pos + len - 1 >= r.start && pos + len - 1 <= r.stop)) {
				boxes.push({
					opr: cigar,
					start: pos,
					len
				})
				// no box seq, don't add cidx
			}
			pos += len
			continue
		}
		if (cigar == 'X') {
			if (keepallboxes || Math.max(pos, r.start) < Math.min(pos + len - 1, r.stop)) {
				const b = {
					opr: cigar,
					start: pos,
					len,
					cidx: cum - len
				}
				boxes.push(b)
			}
			pos += len
			continue
		}
		if (cigar == 'S') {
			const b = {
				opr: cigar,
				start: pos,
				len,
				cidx: cum - len
			}
			if (boxes.length == 0) {
				// this is the first box, will not consume ref
				// shift softclip start to left, so its end will be pos, will not increment pos
				b.start -= len
				if (keepallboxes || Math.max(pos, r.start) < Math.min(pos + len - 1, r.stop)) {
					boxes.push(b)
				}
			} else {
				// not the first box, so should be the last box
				// do not shift start
				boxes.push(b)
			}
			continue
		}
		if (cigar == 'P') {
			if (keepallboxes || (pos > r.start && pos < r.stop)) {
				const b = {
					opr: 'P',
					start: pos,
					len,
					cidx: cum - len
				}
				boxes.push(b)
			}
			continue
		}
		console.log('unknown cigar: ' + cigar)
	}
	if (boxes.length == 0) {
		// no visible boxes, do not show this segment
		return
	}
	const segment = {
		qname,
		segstart,
		segstop: pos,
		boxes,
		forward: !(flag & 0x10),
		ridx,
		x1: r.x + r.scale(boxes[0].start),
		x2: r.x + r.scale(segmentstop(boxes)), // x stop position, for drawing connect line
		seq,
		qual,
		cigarstr,
		tlen,
		flag
	}
	if (flag & 0x40) {
		segment.isfirst = true
	} else if (flag & 0x80) {
		segment.islast = true
	}
	if (rnext != '=' && rnext != '*' && rnext != r.chr) {
		segment.rnext = rnext
		segment.pnext = pnext
	}
	return segment
}

async function poststack_adjustq(group, q) {
	/*
call after stacking
control canvas height based on number of reads and stacks
set rendering parameters in q{}
based on stack height, to know if to render base quality and print letters
return number of stacks for setting canvas height

super high number of stacks will result in fractional row height and blurry rendering, no way to fix it now
*/
	const [a, b] = getstacksizebystacks(group.stacks.length, q)
	group.stackheight = a
	group.stackspace = b
	for (const r of group.regions) {
		r.to_printnt = group.stackheight > 7 && r.ntwidth >= 7
		r.to_qual = r.ntwidth >= minntwidth_toqual
	}
	if (group.stacks.length) {
		// has reads/templates for rendering, support below
		if (group.stackheight >= 7 && q.totalnumreads < 3000) {
			group.returntemplatebox = []
		} else {
			if (!group.partstack) {
				group.allowpartstack = true // to inform client
			}
		}
	}
}

function getstacksizebystacks(numofstacks, q) {
	/* with hardcoded cutoffs
	with 1 or more groups, reduce the max canvas height by half
	 */
	let a = (q.groups.length > 1 ? maxcanvasheight / 2 : maxcanvasheight) / numofstacks
	if (a > 10) return [Math.min(15, Math.floor(a)), 1]
	if (a > 7) return [Math.floor(a), 1]
	if (a > 3) return [Math.ceil(a), 0]
	if (a > 1) return [Math.floor(a), 0]
	return [a, 0]
}

function stack_templates(group, q) {
	// stack by on screen x1 x2 position of each template, only set stack idx to each template
	// actual y position will be set later after stackheight is determined
	// adds q.stacks[]
	// stacking code not reusable for the special spacing calculation
	group.templates.sort((i, j) => i.x1 - j.x1)
	group.stacks = [] // each value is screen pixel pos of each stack
	for (const template of group.templates) {
		let stackidx = null
		for (let i = 0; i < group.stacks.length; i++) {
			if (group.stacks[i] + q.stacksegspacing < template.x1) {
				stackidx = i
				group.stacks[i] = template.x2
				break
			}
		}
		if (stackidx == null) {
			stackidx = group.stacks.length
			group.stacks[stackidx] = template.x2
		}
		template.y = stackidx
	}
	may_trimstacks(group, q)
}

function may_trimstacks(group, q) {
	if (!group.partstack) return
	// should be a positive integer
	const lst = group.templates.filter(i => i.y >= group.partstack.start && i.y <= group.partstack.stop)
	lst.forEach(i => (i.y -= group.partstack.start))
	group.templates = lst
	group.stacks = []
	for (let i = group.partstack.start; i <= group.partstack.stop; i++) {
		group.stacks.push(0)
	}
	group.returntemplatebox = [] // always set this
}

async function get_refseq(g, coord) {
	const tmp = await utils.get_fasta(g, coord)
	const l = tmp.split('\n')
	l.shift()
	return l.join('').toUpperCase()
}

function finalize_templates(group, q) {
	/*
for each template:
	for each box:
	  the box alreay has raw strings for .seq and .qual
	  may do below:
		add sequence
		add quality
at the end, set q.canvasheight
*/
	const stacky = get_stacky(group, q)
	for (const template of group.templates) {
		template.y = stacky[template.y]
		for (const segment of template.segments) {
			const r = group.regions[segment.ridx]
			const quallst = r.to_qual ? qual2int(segment.qual) : null
			for (const b of segment.boxes) {
				if (b.cidx == undefined) {
					continue
				}
				if (quallst) {
					b.qual = quallst.slice(b.cidx, b.cidx + b.len)
				}
				if (b.opr == 'I') {
					// insertion has been decided to be visible so always get seq
					b.s = segment.seq.substr(b.cidx, b.len)
				} else if (b.opr == 'X' || b.opr == 'S') {
					if (r.to_printnt) {
						b.s = segment.seq.substr(b.cidx, b.len)
					}
				}
				delete b.cidx
			}
			delete segment.seq
			delete segment.qual
		}
	}
}

function qual2int(s) {
	if (s == '*') return null
	const lst = []
	for (let i = 0; i < s.length; i++) {
		const v = s[i].charCodeAt(0) - 33
		lst.push(v)
	}
	return lst
}

function plot_messagerows(ctx, group, q) {
	let y = 0
	for (const row of group.messagerows) {
		ctx.font = Math.min(12, row.h - 2) + 'pt Arial'
		ctx.fillStyle = 'black'
		ctx.fillText(row.t, q.canvaswidth / 2, y + row.h / 2)
		y += row.h
	}
	return y
}

function get_stacky(group, q) {
	// get y off for each stack, may account for fat rows created by overlapping read pairs
	const stackrowheight = []
	for (let i = 0; i < group.stacks.length; i++) stackrowheight.push(group.stackheight)
	overlapRP_setflag(group, q)
	if (group.overlapRP_multirows) {
		// expand row height for stacks with overlapping read pairs
		for (const template of group.templates) {
			if (template.segments.length <= 1) continue
			template.height = getrowheight_template_overlapread(template, group.stackheight)
			stackrowheight[template.y] = Math.max(stackrowheight[template.y], template.height)
		}
	}
	const stacky = []
	let y = group.messagerows.reduce((i, j) => i + j.h, 0) + group.stackspace
	for (const h of stackrowheight) {
		stacky.push(y)
		y += h + group.stackspace
	}
	group.canvasheight = y
	return stacky
}

function overlapRP_setflag(group, q) {
	if (!q.asPaired) return
	for (const r of group.regions) {
		if (r.ntwidth <= minntwidth_overlapRPmultirows) return
	}
	group.overlapRP_multirows = true
	group.overlapRP_hlline = group.stackspace > 0
}

function getrowheight_template_overlapread(template, stackheight) {
	// if to show overlapped read pairs, detect if this template has overlap, if so, double the row height
	if (template.segments.length == 2) {
		const [a, b] = template.segments
		if (a.x2 > b.x1) {
			b.shiftdownrow = 1 // shift down by 1 row
			return stackheight * 2
		}
		return stackheight
	}
	// more than 2 segments, do a mini stack to, may not happen??
	console.log('more than 2 segments', template.segments.length)
	const stacks = []
	for (const b of template.segments) {
		let stackidx = null
		for (let i = 0; i < stacks.length; i++) {
			if (stacks[i] < b.x1) {
				stackidx = i
				stacks[i] = b.x2
				break
			}
		}
		if (stackidx == null) {
			stackidx = stacks.length
			stacks[stackidx] = b.x2
		}
		b.shiftdownrow = stackidx
	}
	return stackheight * stacks.length
}

function segmentstop(boxes) {
	return Math.max(...boxes.map(i => i.start + i.len))
}

function check_mismatch(lst, r, box) {
	for (let i = 0; i < box.s.length; i++) {
		if (box.start + i < r.start || box.start + i > r.stop) {
			// to skip bases beyond view range
			continue
		}
		const readnt = box.s[i]
		const refnt = r.referenceseq[box.start + i - r.start]
		if (refnt != readnt.toUpperCase()) {
			const b = {
				opr: 'X', // mismatch
				start: box.start + i,
				len: 1,
				s: readnt,
				cidx: box.cidx + i
			}
			lst.push(b)
		}
	}
}

function plot_template(ctx, template, group, q) {
	if (group.returntemplatebox) {
		// one box per template
		const box = {
			qname: template.segments[0].qname,
			x1: template.x1,
			x2: template.x2,
			y1: template.y,
			y2: template.y + (template.height || group.stackheight)
		}
		if (!q.asPaired) {
			// single reads are in multiple "templates", tell if its first/last to identify
			if (template.segments[0].isfirst) box.isfirst = true
			if (template.segments[0].islast) box.islast = true
		}
		group.returntemplatebox.push(box)
	}
	for (let i = 0; i < template.segments.length; i++) {
		const seg = template.segments[i]
		if (i == 0) {
			// is the first segment, same rendering method no matter in single or paired mode
			plot_segment(ctx, seg, template.y, group, q)
			continue
		}
		// after the first segment, this only occurs in paired mode
		const prevseg = template.segments[i - 1]
		if (prevseg.x2 <= seg.x1) {
			// two segments are apart; render this segment the same way, draw dashed line connecting with last
			plot_segment(ctx, seg, template.y, group, q)
			const y = Math.floor(template.y + group.stackheight / 2) + 0.5
			ctx.strokeStyle = group.stackheight <= 2 ? split_linecolorfaint : match_hq
			ctx.setLineDash([5, 3]) // dash for read pairs
			ctx.beginPath()
			ctx.moveTo(prevseg.x2, y)
			ctx.lineTo(seg.x1, y)
			ctx.stroke()

			if (group.overlapRP_hlline) {
				// highlight line is showing, this is at zoom in level
				// detect if two segments are next to each other, by coord but not x1/2
				// as at zoom out level, pixel position is imprecise
				const prevlastbox = prevseg.boxes.reduce((i, j) => {
					if (i.start + i.len > j.start + j.len) return i
					return j
				})
				if (prevlastbox.start + prevlastbox.len == seg.boxes[0].start) {
					ctx.strokeStyle = overlapreadhlcolor
					ctx.setLineDash([])
					ctx.beginPath()
					const x = Math.floor(seg.x1) + 0.5
					ctx.moveTo(x, template.y)
					ctx.lineTo(x, template.y + group.stackheight)
					ctx.stroke()
				}
			}
		} else {
			// overlaps with the previous segment
			if (group.overlapRP_multirows) {
				plot_segment(ctx, seg, template.y + group.stackheight, group, q)
				if (group.overlapRP_hlline) {
					const y = Math.floor(template.y + group.stackheight) + 0.5
					ctx.strokeStyle = overlapreadhlcolor
					ctx.setLineDash([])
					ctx.beginPath()
					ctx.moveTo(seg.x1, y)
					ctx.lineTo(prevseg.x2, y)
					ctx.stroke()
				}
			} else {
				plot_segment(ctx, seg, template.y, group, q)
			}
		}
	}

	// for testing, print a stat (numeric or string) per template on the right of each row
	// should not use this in production
	if (template.__tempscore != undefined) {
		ctx.fillStyle = 'blue'
		ctx.font = group.stackheight + 'pt Arial'
		ctx.fillText(template.__tempscore, q.regions[0].width - 100, template.y + group.stackheight / 2)
	}
}

function plot_segment(ctx, segment, y, group, q) {
	const r = group.regions[segment.ridx] // this region where the segment falls into
	// what if segment spans multiple regions
	// a box is always within a region, so get r at box level

	for (const b of segment.boxes) {
		const x = r.x + r.scale(b.start)
		if (b.opr == 'P') continue // do not handle
		if (b.opr == 'I') continue // do it next round
		if (b.opr == 'D' || b.opr == 'N') {
			// a line
			if (b.opr == 'D') {
				ctx.strokeStyle = deletion_linecolor
			} else {
				ctx.strokeStyle = group.stackheight <= 2 ? split_linecolorfaint : match_hq
			}
			ctx.setLineDash([]) // use solid lines
			const y2 = Math.floor(y + group.stackheight / 2) + 0.5
			ctx.beginPath()
			ctx.moveTo(x, y2)
			ctx.lineTo(x + b.len * r.ntwidth, y2)
			ctx.stroke()
			if (group.stackheight > minstackheight2printbplenDN) {
				// b boundaries may be out of range
				const x1 = Math.max(0, x)
				const x2 = Math.min(q.canvaswidth, x + b.len * r.ntwidth)
				if (x2 - x1 >= 50) {
					const fontsize = Math.min(maxfontsize2printbplenDN, Math.max(minfontsize2printbplenDN, group.stackheight - 2))
					ctx.font = fontsize + 'pt Arial'
					const tw = ctx.measureText(b.len + ' bp').width
					if (tw < x2 - x1 - 20) {
						ctx.fillStyle = 'white'
						ctx.fillRect((x2 + x1) / 2 - tw / 2, y, tw, group.stackheight)
						ctx.fillStyle = match_hq
						ctx.fillText(b.len + ' bp', (x2 + x1) / 2, y + group.stackheight / 2)
					}
				}
			}
			continue
		}

		if (b.opr == 'X' || b.opr == 'S') {
			// box with maybe letters
			if (r.to_qual && b.qual) {
				// to show quality and indeed there is quality
				if (r.to_printnt) {
					ctx.font = Math.min(r.ntwidth, group.stackheight - 2) + 'pt Arial'
				}
				let xoff = x
				for (let i = 0; i < b.qual.length; i++) {
					const v = b.qual[i] / maxqual
					ctx.fillStyle = b.opr == 'S' ? qual2softclipbg(v) : qual2mismatchbg(v)
					ctx.fillRect(xoff, y, r.ntwidth + ntboxwidthincrement, group.stackheight)
					if (r.to_printnt) {
						ctx.fillStyle = 'white'
						ctx.fillText(b.s[i], xoff + r.ntwidth / 2, y + group.stackheight / 2)
					}
					xoff += r.ntwidth
				}
			} else {
				// not using quality or there ain't such data
				ctx.fillStyle = b.opr == 'S' ? softclipbg_hq : mismatchbg_hq
				ctx.fillRect(x, y, b.len * r.ntwidth + ntboxwidthincrement, group.stackheight)
			}
			continue
		}
		if (b.opr == 'M' || b.opr == '=') {
			// box
			if (r.to_qual) {
				let xoff = x
				b.qual.forEach(v => {
					ctx.fillStyle = (segment.rnext ? qual2ctxpair : qual2match)(v / maxqual)
					ctx.fillRect(xoff, y, r.ntwidth + ntboxwidthincrement, group.stackheight)
					xoff += r.ntwidth
				})
			} else {
				// not showing qual, one box
				ctx.fillStyle = segment.rnext ? ctxpair_hq : match_hq
				ctx.fillRect(x, y, b.len * r.ntwidth + ntboxwidthincrement, group.stackheight)
			}
			if (r.to_printnt) {
				ctx.font = Math.min(r.ntwidth, group.stackheight - 2) + 'pt Arial'
				ctx.fillStyle = 'white'
				for (let i = 0; i < b.s.length; i++) {
					ctx.fillText(b.s[i], x + r.ntwidth * (i + 0.5), y + group.stackheight / 2)
				}
			}
			continue
		}
		throw 'unknown opr at rendering: ' + b.opr
	}

	if (group.stackheight >= minstackheight2strandarrow) {
		if (segment.forward) {
			const x = Math.ceil(segment.x2 + ntboxwidthincrement)
			if (x <= q.canvaswidth + group.stackheight / 2) {
				ctx.fillStyle = 'white'
				ctx.beginPath()
				ctx.moveTo(x - group.stackheight / 2, y)
				ctx.lineTo(x, y)
				ctx.lineTo(x, y + group.stackheight / 2)
				ctx.lineTo(x - group.stackheight / 2, y)
				ctx.closePath()
				ctx.fill()
				ctx.beginPath()
				ctx.moveTo(x - group.stackheight / 2, y + group.stackheight)
				ctx.lineTo(x, y + group.stackheight)
				ctx.lineTo(x, y + group.stackheight / 2)
				ctx.lineTo(x - group.stackheight / 2, y + group.stackheight)
				ctx.closePath()
				ctx.fill()
			}
		} else {
			const x = segment.x1
			if (x >= 0) {
				ctx.fillStyle = 'white'
				ctx.beginPath()
				ctx.moveTo(x + group.stackheight / 2, y)
				ctx.lineTo(x, y)
				ctx.lineTo(x, y + group.stackheight / 2)
				ctx.lineTo(x + group.stackheight / 2, y)
				ctx.closePath()
				ctx.fill()
				ctx.beginPath()
				ctx.moveTo(x + group.stackheight / 2, y + group.stackheight)
				ctx.lineTo(x, y + group.stackheight)
				ctx.lineTo(x, y + group.stackheight / 2)
				ctx.lineTo(x + group.stackheight / 2, y + group.stackheight)
				ctx.closePath()
				ctx.fill()
			}
		}
	}

	if (segment.rnext) {
		if (!r.to_qual) {
			// no quality and just a solid box, may print name
			if (segment.x2 - segment.x1 >= 20 && group.stackheight >= 7) {
				ctx.font = Math.min(insertion_maxfontsize, Math.max(insertion_minfontsize, group.stackheight - 4)) + 'pt Arial'
				ctx.fillStyle = 'white'
				ctx.fillText(
					(q.nochr ? 'chr' : '') + segment.rnext,
					(segment.x1 + segment.x2) / 2,
					y + group.stackheight / 2,
					segment.x2 - segment.x1
				)
			}
		}
	}
}

function plot_insertions(ctx, group, q, messagerowheights) {
	/*
after all template boxes are drawn, mark out insertions on top of that by cyan text labels
if single basepair, use the nt; else, use # of nt
if b.qual is available, set text color based on it
*/
	for (const [ridx, r] of group.regions.entries()) {
		if (!r.to_printnt) continue
		// matched nucleotides are shown as white letters in this region
		// before plotting any insertions, to better identify insertions (also white)
		// find out all insertion positions
		const xpos = new Set()
		for (const template of group.templates) {
			for (const segment of template.segments) {
				if (segment.ridx != ridx) continue
				const insertions = segment.boxes.filter(i => i.opr == 'I')
				if (!insertions.length) continue
				for (const b of insertions) {
					xpos.add(r.x + r.scale(b.start))
				}
			}
		}
		// plot a black v line under each position
		ctx.strokeStyle = insertion_vlinecolor
		for (const x of xpos) {
			ctx.beginPath()
			ctx.moveTo(x, messagerowheights)
			ctx.lineTo(x, group.canvasheight)
			ctx.stroke()
		}
	}

	for (const template of group.templates) {
		for (const segment of template.segments) {
			const r = group.regions[segment.ridx]
			const insertions = segment.boxes.filter(i => i.opr == 'I')
			if (!insertions.length) continue
			ctx.font = Math.max(insertion_maxfontsize, group.stackheight - 2) + 'pt Arial'
			for (const b of insertions) {
				const x = r.x + r.scale(b.start)
				if (b.qual) {
					ctx.fillStyle = qual2insertion(b.qual.reduce((i, j) => i + j, 0) / b.qual.length / maxqual)
				} else {
					ctx.fillStyle = insertion_hq
				}
				const text = b.s.length == 1 ? b.s : b.s.length
				// text y position to observe if the read is in an overlapping pair and shifted down
				ctx.fillText(text, x, template.y + group.stackheight * (segment.on2ndrow || 0) + group.stackheight / 2)
			}
		}
	}
}

function getcolorscale() {
	/*
           base quality
           40  30  20  10  0
           |   |   |   |   |
Match      BBBBBBBBBBBBBBBBB
Mismatch   BBBBBBBBBBBBBBBBB
Softclip   BBBBBBBBBBBBBBBBB
Insertion  BBBBBBBBBBBBBBBBB
*/
	const barwidth = 160,
		barheight = 20,
		barspace = 1,
		fontsize = 12,
		labyspace = 5,
		leftpad = 100,
		rightpad = 10,
		ticksize = 4

	const canvas = createCanvas(
		leftpad + barwidth + rightpad,
		fontsize * 2 + labyspace + ticksize + (barheight + barspace) * 4
	)
	const ctx = canvas.getContext('2d')

	ctx.fillStyle = 'black'
	ctx.font = fontsize + 'pt Arial'
	ctx.textAlign = 'center'
	ctx.fillText('Base quality', leftpad + barwidth / 2, fontsize)

	let y = fontsize * 2 + labyspace

	ctx.strokeStyle = 'black'
	ctx.beginPath()
	ctx.moveTo(leftpad, y)
	ctx.lineTo(leftpad, y + ticksize)
	ctx.moveTo(leftpad + barwidth / 4, y)
	ctx.lineTo(leftpad + barwidth / 4, y + ticksize)
	ctx.moveTo(leftpad + barwidth / 2, y)
	ctx.lineTo(leftpad + barwidth / 2, y + ticksize)
	ctx.moveTo(leftpad + (barwidth * 3) / 4, y)
	ctx.lineTo(leftpad + (barwidth * 3) / 4, y + ticksize)
	ctx.moveTo(leftpad + barwidth, y)
	ctx.lineTo(leftpad + barwidth, y + ticksize)
	ctx.closePath()
	ctx.stroke()

	ctx.fillText(40, leftpad, y)
	ctx.fillText(30, leftpad + barwidth / 4, y)
	ctx.fillText(20, leftpad + barwidth / 2, y)
	ctx.fillText(10, leftpad + (barwidth * 3) / 4, y)
	ctx.fillText(0, leftpad + barwidth, y)

	ctx.textAlign = 'left'
	ctx.textBaseline = 'middle'

	y += ticksize

	ctx.fillText('Match', 0, y + barheight / 2)
	fillgradient(match_lq, match_hq, y)
	y += barheight + barspace

	ctx.fillStyle = 'black'
	ctx.fillText('Mismatch', 0, y + barheight / 2)
	fillgradient(mismatchbg_lq, mismatchbg_hq, y)
	y += barheight + barspace

	ctx.fillStyle = 'black'
	ctx.fillText('Softclip', 0, y + barheight / 2)
	fillgradient(softclipbg_lq, softclipbg_hq, y)
	y += barheight + barspace

	ctx.fillStyle = 'black'
	ctx.fillText('Insertion', 0, y + barheight / 2)
	fillgradient(insertion_lq, insertion_hq, y)

	function fillgradient(lowq, highq, y) {
		const x = leftpad
		const gradient = ctx.createLinearGradient(x, y, x + barwidth, y)
		gradient.addColorStop(0, highq)
		gradient.addColorStop(1, lowq)
		ctx.fillStyle = gradient
		ctx.fillRect(x, y, barwidth, barheight)
	}

	return canvas.toDataURL()
}

////////////////////// get one read/template

async function route_getread(genome, req) {
	// cannot use the point position under cursor to query, as if clicking on softclip
	if (!req.query.chr) throw '.chr missing'
	if (!req.query.qname) throw '.qname missing'
	req.query.qname = decodeURIComponent(req.query.qname) // convert %2B to +
	//if(!req.query.pos) throw '.pos missing'
	if (!req.query.viewstart) throw '.viewstart missing'
	if (!req.query.viewstop) throw '.viewstart missing'
	const r = {
		chr: req.query.chr,
		start: Number(req.query.viewstart),
		stop: Number(req.query.viewstop),
		scale: () => {}, // dummy
		ntwidth: 10 // good to show all insertions
	}
	if (!Number.isInteger(r.start)) throw '.viewstart not integer'
	if (!Number.isInteger(r.stop)) throw '.viewstop not integer'
	const seglst = await query_oneread(req, r)
	if (!seglst) throw 'read not found'
	const lst = []
	for (const s of seglst) {
		lst.push(await convertread(s, genome, req.query))
	}
	return { lst }
}

async function query_oneread(req, r) {
	const [e, _file, isurl] = app.fileurl(req)
	if (e) throw e
	const dir = isurl ? await utils.cache_index(_file, req.query.indexURL || _file + '.bai') : null
	//const pos = Number(req.query.pos)
	//if (!Number.isInteger(pos)) throw '.pos not integer'
	let firstseg, lastseg
	return new Promise((resolve, reject) => {
		const ps = spawn(
			samtools,
			[
				'view',
				_file,
				(req.query.nochr ? req.query.chr.replace('chr', '') : req.query.chr) + ':' + r.start + '-' + r.stop
			],
			{ cwd: dir }
		)
		const rl = readline.createInterface({ input: ps.stdout })
		rl.on('line', line => {
			const s = parse_one_segment(line, r, null, true)
			if (!s) return
			if (s.qname != req.query.qname) return
			if (req.query.getfirst) {
				if (s.isfirst) {
					ps.kill()
					resolve([s])
					return
				}
			} else if (req.query.getlast) {
				if (s.islast) {
					ps.kill()
					resolve([s])
					return
				}
			} else {
				// get both
				if (s.isfirst) firstseg = s
				else if (s.islast) lastseg = s
				if (firstseg && lastseg) {
					ps.kill()
					resolve([firstseg, lastseg])
					return
				}
			}
		})
		rl.on('close', () => {
			// finished reading and still not resolved
			// means it is in paired mode but read is single
			const lst = []
			if (firstseg) lst.push(firstseg)
			if (lastseg) lst.push(lastseg)
			resolve(lst.length ? lst : null)
		})
	})
}
async function convertread(seg, genome, query) {
	// convert a read to html
	const refstart = seg.boxes[0].start // 0 based
	const b = seg.boxes[seg.boxes.length - 1]
	const refstop = b.start + b.len
	const refseq = await get_refseq(genome, query.chr + ':' + (refstart + 1) + '-' + refstop)
	const quallst = qual2int(seg.qual)
	const reflst = ['<td>Reference</td>']
	const querylst = ['<td style="color:black;text-align:left">Read</td>']
	for (const b of seg.boxes) {
		if (b.opr == 'I') {
			for (let i = b.cidx; i < b.cidx + b.len; i++) {
				reflst.push('<td>-</td>')
				querylst.push(
					'<td style="color:' +
						insertion_hq +
						';background:' +
						qual2match(quallst[i] / maxqual) +
						'">' +
						seg.seq[i] +
						'</td>'
				)
			}
			continue
		}
		if (b.opr == 'D' || b.opr == 'N') {
			if (b.len >= 20) {
				reflst.push('<td style="font-size:.8em;opacity:.5;white-space:nowrap">' + b.len + ' bp</td>')
				querylst.push('<td style="color:black;white-space:nowrap">-----------</td>')
			} else {
				for (let i = 0; i < b.len; i++) {
					reflst.push('<td>' + refseq[b.start - refstart + i] + '</td>')
					querylst.push('<td style="color:black">-</td>')
				}
			}
			continue
		}
		if (b.opr == 'S') {
			for (let i = 0; i < b.len; i++) {
				reflst.push('<td>' + refseq[b.start - refstart + i] + '</td>')
				querylst.push(
					'<td style="background:' +
						qual2softclipbg(quallst[b.cidx + i] / maxqual) +
						'">' +
						seg.seq[b.cidx + i] +
						'</td>'
				)
			}
			continue
		}
		if (b.opr == 'M' || b.opr == '=' || b.opr == 'X') {
			for (let i = 0; i < b.len; i++) {
				const nt0 = refseq[b.start - refstart + i]
				const nt1 = seg.seq[b.cidx + i]
				reflst.push('<td>' + nt0 + '</td>')
				querylst.push(
					'<td style="background:' +
						(nt0.toUpperCase() == nt1.toUpperCase() ? qual2match : qual2mismatchbg)(quallst[b.cidx + i] / maxqual) +
						'">' +
						seg.seq[b.cidx + i] +
						'</td>'
				)
			}
			continue
		}
	}

	//console.log("seg.boxes:",seg.boxes)
	// Determining start and stop position of softclips (if any)
	let soft_start = 0
	let soft_stop = 0
	let soft_starts = []
	let soft_stops = []
	let soft_present = 0
	for (const box of seg.boxes) {
		soft_start = soft_stop
		soft_stop += box.len
		if (box.opr == 'S') {
			soft_present = 1
			//console.log("soft_start:",soft_start)
			//console.log("soft_stop:",soft_stop)
			soft_starts.push(soft_start)
			soft_stops.push(soft_stop)
		}
	}

	const lst = []
	if (seg.rnext)
		lst.push(
			'<li>Next segment on <span style="background:' +
				ctxpair_hq +
				'">' +
				(query.nochr ? 'chr' : '') +
				seg.rnext +
				', ' +
				seg.pnext +
				'</span></li>'
		)
	if (seg.flag & 0x1) lst.push('<li>Template has multiple segments</li>')
	if (seg.flag & 0x2) lst.push('<li>Each segment properly aligned</li>')
	if (seg.flag & 0x4) lst.push('<li>Segment unmapped</li>')
	if (seg.flag & 0x8) lst.push('<li>Next segment in the template unmapped</li>')
	if (seg.flag & 0x10) lst.push('<li>Reverse complemented</li>')
	if (seg.flag & 0x20) lst.push('<li>Next segment in the template is reverse complemented</li>')
	if (seg.flag & 0x40) lst.push('<li>This is the first segment in the template</li>')
	if (seg.flag & 0x80) lst.push('<li>This is the last segment in the template</li>')
	if (seg.flag & 0x100) lst.push('<li>Secondary alignment</li>')
	if (seg.flag & 0x200) lst.push('<li>Not passing filters</li>')
	if (seg.flag & 0x400) lst.push('<li>PCR or optical duplicate</li>')
	if (seg.flag & 0x800) lst.push('<li>Supplementary alignment</li>')

	let seq_data = {
		seq: seg.seq,
		alignment: `<table style="border-spacing:0px;border-collapse:separate;text-align:center">
			  <tr style="opacity:.6">${reflst.join('')}</tr>
			  <tr style="color:white">${querylst.join('')}</tr>
			</table>`,
		info: `<div style='margin-top:10px'>
			<span style="opacity:.5;font-size:.7em">START</span>: ${refstart + 1},
			<span style="opacity:.5;font-size:.7em">STOP</span>: ${refstop},
			<span style="opacity:.5;font-size:.7em">THIS READ</span>: ${refstop - refstart} bp,
			<span style="opacity:.5;font-size:.7em">TEMPLATE</span>: ${seg.tlen} bp,
			<span style="opacity:.5;font-size:.7em">CIGAR</span>: ${seg.cigarstr}
			<span style="opacity:.5;font-size:.7em">NAME: ${seg.qname}</span>
		  </div>
		  <ul style='padding-left:15px'>${lst.join('')}</ul>`
	}
	if (soft_present == 1) {
		seq_data.soft_starts = soft_starts
		seq_data.soft_stops = soft_stops
	}
	return seq_data
}
