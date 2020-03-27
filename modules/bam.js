const app = require('../app')
const path = require('path')
const fs = require('fs')
const utils = require('./utils')
const createCanvas = require('canvas').createCanvas
const spawn = require('child_process').spawn
const readline = require('readline')
const interpolateRgb = require('d3-interpolate').interpolateRgb

/*
TODO
* highlight reads with mate in a different chr: BBBBBBBB->chr3, in paired mode
* server pass read region data to client, click on tk img to fetch full info of that read
* what to do when cigar is *
* error rendering, N junction overlaps with another read in stacking

************* data structure
template {}
  .x1, x2
  .ridx2 // region idx of the stop position
  .segments[]

segment {}
  .qname
  .boxes[]
  .forward
  .ridx
  .x2  // screen px

box {}
  .opr
  .start // absolute bp
  .len   // #bp
  .cidx  // start position in sequence/qual string
  .s (read sequence)
  .qual[]


*********** function cascade
get_q
do_query
	query_region
	get_templates
		parse_one_segment
	do_stack
	poststack_adjustq
		get_refseq
	finalize_templates
		check_mismatch
	plot_template
		plot_segment
	plot_insertions
*/

// match box color
const match_hq = 'rgb(120,120,120)'
const match_lq = 'rgb(230,230,230)'
const qual2fcolor = interpolateRgb(match_lq, match_hq)
// mismatch: soft red for background only without printed nt, strong red for printing nt on gray background
const mismatchbg_hq = '#df5c61'
const mismatchbg_lq = '#ffdbdd'
const qual2mismatchbg = interpolateRgb(mismatchbg_lq, mismatchbg_hq)
// softclip: soft blue for background only, strong blue for printing nt
const softclipbg_hq = '#4888bf'
const softclipbg_lq = '#c9e6ff'
const qual2softclipbg = interpolateRgb(softclipbg_lq, softclipbg_hq)
// insertion, text color gradient to correlate with the quality
const insertion_hq = '#47FFFC' //'#00FFFB'
const insertion_lq = '#B2D7D7' //'#009290'
const qual2insertion = interpolateRgb(insertion_lq, insertion_hq)

const deletion_linecolor = 'red'
const split_linecolorfaint = '#ededed' // if thin stack (hardcoded cutoff 2), otherwise use match_hq

// minimum px width to display an insertion
const insertion_minpx = 1

const maxqual = 40

// tricky: on retina screen the individual nt boxes appear to have slight gaps in between
// adding this increment to the rendering of each nt box appear to fix the issue
// yet to be tested on a low-res screen
const ntboxwidthincrement = 0.5

// space between reads in the same stack, either 5 bp or 5 px, which ever greater
const readspace_px = 2
const readspace_bp = 5

// maximum number of reads to load
const maxreadcount = 10000

const serverconfig = __non_webpack_require__('./serverconfig.json')
const samtools = serverconfig.samtools || 'samtools'

module.exports = genomes => {
	return async (req, res) => {
		app.log(req)
		try {
			if (!req.query.genome) throw '.genome missing'
			const genome = genomes[req.query.genome]
			if (!genome) throw 'invalid genome'
			const q = await get_q(genome, req)
			const result = await do_query(q)
			res.send(result)
		} catch (e) {
			res.send({ error: e.message || e })
			if (e.stack) console.log(e.stack)
		}
	}
}

async function get_q(genome, req) {
	const [e, _file, isurl] = app.fileurl(req)
	if (e) throw e
	// a query object to collect all the bits
	const q = {
		genome,
		file: _file, // may change if is url
		//collapse_density: false,
		asPaired: req.query.asPaired,
		getcolorscale: req.query.getcolorscale,
		numofreads: 0,
		messagerows: []
	}
	if (isurl) {
		q.dir = await cache_index_promise(req.query.indexURL || _file + '.bai')
	}

	if (req.query.nochr) {
		q.nochr = JSON.parse(req.query.nochr) // parse "true" into json true
	} else {
		// info not provided
		q.nochr = await app.bam_ifnochr(q.file, genome, q.dir)
	}
	if (!req.query.regions) throw '.regions[] missing'
	q.regions = JSON.parse(req.query.regions)
	for (const r of q.regions) {
		r.scale = p => Math.ceil((r.width * (p - r.start)) / (r.stop - r.start))
		r.ntwidth = r.width / (r.stop - r.start)
	}
	return q
}

async function do_query(q) {
	for (const r of q.regions) {
		await query_region(r, q)
	}

	const result = {
		nochr: q.nochr,
		count: {
			r: q.regions.reduce((i, j) => i + j.lines.length, 0)
		}
	}
	if (result.count.r == 0) {
		q.messagerows.push({
			h: 30,
			t: 'No reads in view range.'
		})
	}

	const templates = get_templates(q)

	const numofstacks = do_stack(q, templates)
	await poststack_adjustq(q, numofstacks)

	finalize_templates(templates, q)

	const canvaswidth = q.regions[q.regions.length - 1].x + q.regions[q.regions.length - 1].width
	const canvasheight = q.messagerows.reduce((i, j) => i + j.h, 0) + numofstacks * (q.stackheight + q.stackspace)
	const canvas = createCanvas(canvaswidth, canvasheight)
	const ctx = canvas.getContext('2d')
	ctx.textAlign = 'center'
	ctx.textBaseline = 'middle'
	let y = 0
	for (const row of q.messagerows) {
		ctx.font = Math.min(12, row.h - 2) + 'pt Arial'
		//ctx.fillStyle = '#f1f1f1'
		//ctx.fillRect(0,y,canvaswidth,row.h)
		ctx.fillStyle = 'black'
		ctx.fillText(row.t, canvaswidth / 2, y + row.h / 2)
		y += row.h
	}
	for (const template of templates) {
		plot_template(ctx, template, q)
	}
	plot_insertions(ctx, templates, q)

	if (q.asPaired) result.count.t = templates.length
	result.src = canvas.toDataURL()
	result.width = canvaswidth
	result.height = canvasheight
	if (q.getcolorscale) result.colorscale = getcolorscale()
	return result
}

function query_region(r, q) {
	// for each region, query its data
	// if too many reads, collapse to coverage
	if (!r.chr) throw '.chr missing'
	if (!Number.isInteger(r.start)) throw '.start not integer'
	if (!Number.isInteger(r.stop)) throw '.stop not integer'
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
			q.numofreads++
			if (q.numofreads == maxreadcount) {
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
					x1: r.scale(segment.boxes[0].start),
					x2: r.scale(segmentstop(segment.boxes)),
					ridx2: i, // r idx of stop
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
				temp.x2 = Math.max(temp.x2, r.scale(segmentstop(segment.boxes)))
				temp.ridx2 = i
			} else {
				qname2template.set(segment.qname, {
					x1: r.scale(segment.boxes[0].start),
					x2: r.scale(segmentstop(segment.boxes)),
					ridx2: i,
					segments: [segment]
				})
			}
		}
	}
	return [...qname2template.values()]
}

function parse_one_segment(line, r, ridx) {
	/*
do not do:
  parse seq
  parse qual
  assign seq & qual to each box
  checking mismatch

only gather boxes in view range, with sequence start (cidx) for finalizing later

may skip insertion if on screen width shorter than minimum width
*/
	const l = line.split('\t')
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

	if (Number.isNaN(segstart_1based) || segstart_1based <= 0) {
		// invalid
		return
	}
	const segstart = segstart_1based - 1

	if (cigarstr == '*') {
		return
	}

	if (tlen == 0) {
		// invalid
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
			if (Math.max(pos, r.start) < Math.min(pos + len - 1, r.stop)) {
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
			if (pos > r.start && pos < r.stop) {
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
			if (Math.max(pos, r.start) < Math.min(pos + len - 1, r.stop)) {
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
				if (Math.max(pos, r.start) < Math.min(pos + len - 1, r.stop)) {
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
			if (pos > r.start && pos < r.stop) {
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
		boxes,
		forward: !(flag & 0x10),
		ridx,
		x2: r.x + r.scale(segmentstop(boxes)), // x stop position, for drawing connect line
		seq,
		qual
	}
	return segment
}

async function poststack_adjustq(q, numofstacks) {
	/*
call after stacking
control canvas height based on number of reads and stacks
set rendering parameters in q{}
based on stack height, to know if to render base quality and print letters
return number of stacks for setting canvas height
TODO what if there are super high number of stacks
*/
	const [a, b] = getstacksizebystacks(numofstacks)
	q.stackheight = a
	q.stackspace = b
	for (const r of q.regions) {
		// based on resolution, decide if to do following
		if (r.ntwidth >= 0.9) {
			r.to_checkmismatch = true
			r.referenceseq = await get_refseq(q.genome, r.chr + ':' + (r.start + 1) + '-' + r.stop)
		}
		r.to_printnt = q.stackheight > 7 && r.ntwidth >= 7
		r.to_qual = r.ntwidth >= 1
	}
}

function getstacksizebystacks(numofstacks) {
	let a = 1500 / numofstacks // max track height: 1500 pixels
	if (a > 10) return [Math.min(15, Math.floor(a)), 1]
	if (a > 7) return [Math.floor(a), 1]
	if (a > 3) return [Math.ceil(a), 0]
	if (a > 1) return [Math.floor(a), 0]
	console.log('small stack', a)
	return [a, 0]
}

function do_stack(q, templates) {
	// stack by on screen x1 x2 position of each template, only set stack idx to each template
	// actual y position will be set later after stackheight is determined
	templates.sort((i, j) => i.x1 - j.x1)
	const stacks = [] // each value is screen pixel pos of each stack
	for (const template of templates) {
		let stackidx = null
		for (let i = 0; i < stacks.length; i++) {
			if (stacks[i] + Math.max(readspace_px, readspace_bp * q.regions[template.ridx2].ntwidth) < template.x1) {
				stackidx = i
				stacks[i] = template.x2
				break
			}
		}
		if (stackidx == null) {
			stackidx = stacks.length
			stacks[stackidx] = template.x2
		}
		template.y = stackidx
	}
	return stacks.length
}

async function get_refseq(g, coord) {
	const tmp = await utils.get_fasta(g, coord)
	const l = tmp.split('\n')
	l.shift()
	return l.join('').toUpperCase()
}

function finalize_templates(templates, q) {
	/*
for each box, may do below:
  add sequence
  add quality
  check mismatch
*/

	const mrh = q.messagerows.reduce((i, j) => i + j.h, 0)

	for (const template of templates) {
		template.y = mrh + template.y * (q.stackheight + q.stackspace)
		for (const segment of template.segments) {
			const r = q.regions[segment.ridx]
			let quallst // set to [] if to use quality
			if (r.to_qual && segment.qual != '*') {
				quallst = []
				// convert bp quality
				for (let i = 0; i < segment.qual.length; i++) {
					const v = segment.qual[i].charCodeAt(0) - 33
					quallst.push(v)
				}
			}
			const mismatches = []
			for (const b of segment.boxes) {
				if (b.cidx == undefined) {
					continue
				}
				if (quallst) {
					b.qual = quallst.slice(b.cidx, b.cidx + b.len)
				}
				if (b.opr == 'M') {
					if (r.to_checkmismatch) {
						b.s = segment.seq.substr(b.cidx, b.len)
						check_mismatch(mismatches, r, b)
					}
				} else if (b.opr == 'I') {
					// insertion has been decided to be visible so always get seq
					b.s = segment.seq.substr(b.cidx, b.len)
				} else if (b.opr == 'X' || b.opr == 'S') {
					if (r.to_printnt) {
						b.s = segment.seq.substr(b.cidx, b.len)
					}
				}
				delete b.cidx
			}
			if (mismatches.length) segment.boxes.push(...mismatches)
			delete segment.seq
			delete segment.qual
		}
	}
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
				s: readnt
			}
			if (box.qual) b.qual = [box.qual[i]]
			lst.push(b)
		}
	}
}

function plot_template(ctx, template, q) {
	// segments: a list of segments consisting this template, maybe at different regions
	for (let i = 0; i < template.segments.length; i++) {
		const seg = template.segments[i]
		plot_segment(ctx, seg, template.y, q)
		if (i > 0) {
			// make it optional
			// this segment is not the first of the list
			const currentr = q.regions[seg.ridx]
			const currentx = currentr.x + currentr.scale(seg.boxes[0].start)
			const prevseg = template.segments[i - 1]
			if (prevseg.x2 < currentx) {
				const y = Math.floor(template.y + q.stackheight / 2) + 0.5
				ctx.strokeStyle = q.stackheight <= 2 ? split_linecolorfaint : match_hq
				ctx.setLineDash([5, 3]) // dash for read pairs
				ctx.beginPath()
				ctx.moveTo(prevseg.x2, y)
				ctx.lineTo(currentx, y)
				ctx.stroke()
			}
		}
	}
}

function plot_segment(ctx, segment, y, q) {
	const r = q.regions[segment.ridx] // this region where the segment falls into
	// what if segment spans multiple regions
	// a box is always within a region, so get r at box level

	if (r.to_printnt) {
		ctx.font = Math.min(r.ntwidth, q.stackheight - 2) + 'pt Arial'
	}

	segment.boxes.forEach(b => {
		const x = r.x + r.scale(b.start)
		if (b.opr == 'P') return // do not handle
		if (b.opr == 'I') return // do it next round
		if (b.opr == 'D' || b.opr == 'N') {
			// a line
			if (b.opr == 'D') {
				ctx.strokeStyle = deletion_linecolor
			} else {
				ctx.strokeStyle = q.stackheight <= 2 ? split_linecolorfaint : match_hq
			}
			ctx.setLineDash([]) // use solid lines
			const y2 = Math.floor(y + q.stackheight / 2) + 0.5
			ctx.beginPath()
			ctx.moveTo(x, y2)
			ctx.lineTo(x + b.len * r.ntwidth, y2)
			ctx.stroke()
			return
		}

		if (b.opr == 'X' || b.opr == 'S') {
			// box with maybe letters
			if (r.to_qual && b.qual) {
				// to show quality and indeed there is quality
				let xoff = x
				for (let i = 0; i < b.qual.length; i++) {
					const v = b.qual[i] / maxqual
					ctx.fillStyle = b.opr == 'S' ? qual2softclipbg(v) : qual2mismatchbg(v)
					ctx.fillRect(xoff, y, r.ntwidth + ntboxwidthincrement, q.stackheight)
					if (r.to_printnt) {
						ctx.fillStyle = 'white'
						ctx.fillText(b.s[i], xoff + r.ntwidth / 2, y + q.stackheight / 2)
					}
					xoff += r.ntwidth
				}
			} else {
				// not using quality or there ain't such data
				ctx.fillStyle = b.opr == 'S' ? softclipbg_hq : mismatchbg_hq
				ctx.fillRect(x, y, b.len * r.ntwidth + ntboxwidthincrement, q.stackheight)
			}
			return
		}
		if (b.opr == 'M' || b.opr == '=') {
			// box
			if (r.to_qual) {
				let xoff = x
				b.qual.forEach(v => {
					ctx.fillStyle = qual2fcolor(v / maxqual)
					ctx.fillRect(xoff, y, r.ntwidth + ntboxwidthincrement, q.stackheight)
					xoff += r.ntwidth
				})
			} else {
				// not showing qual, one box
				ctx.fillStyle = match_hq
				ctx.fillRect(x, y, b.len * r.ntwidth + ntboxwidthincrement, q.stackheight)
			}
			if (r.to_printnt) {
				ctx.fillStyle = 'white'
				for (let i = 0; i < b.s.length; i++) {
					ctx.fillText(b.s[i], x + r.ntwidth * (i + 0.5), y + q.stackheight / 2)
				}
			}
			return
		}
		throw 'unknown opr at rendering: ' + b.opr
	})
}

function plot_insertions(ctx, templates, q) {
	/*
after all template boxes are drawn, mark out insertions on top of that by cyan text labels
if single basepair, use the nt; else, use # of nt
if b.qual is available, set text color based on it
*/
	for (const template of templates) {
		for (const segment of template.segments) {
			const r = q.regions[segment.ridx]
			const insertions = segment.boxes.filter(i => i.opr == 'I')
			if (!insertions.length) continue
			ctx.font = Math.max(10, q.stackheight - 2) + 'pt Arial'
			insertions.forEach(b => {
				const x = r.x + r.scale(b.start - 1)
				if (b.qual) {
					ctx.fillStyle = qual2insertion(b.qual.reduce((i, j) => i + j, 0) / b.qual.length / maxqual)
				} else {
					ctx.fillStyle = insertion_hq
				}
				const text = b.s.length == 1 ? b.s : b.s.length
				ctx.fillText(text, x, template.y + q.stackheight / 2)
			})
		}
	}
}

/*
puzzling case of HWI-ST988:130:D1TFEACXX:4:1201:10672:53382 from SJBALL021856_D1
{
  start: 5072626,
  stop: 5078394,
  segments: [
    {
      qname: 'HWI-ST988:130:D1TFEACXX:4:2306:16068:71448',
      boxes: [Array],
      forward: false,
      ridx: 0,
      x2: 850,
      cigarstr: '9M1I2M5679N89M',
      segstart: 5072615,
      segstop: 5078394
    },
    {
      qname: 'HWI-ST988:130:D1TFEACXX:4:2306:16068:71448',
      boxes: [Array],
      forward: true,
      ridx: 0,
      x2: 723,
      cigarstr: '53S48M',
      segstart: 5078303,
      segstop: 5078351
    }
  ],
  y: 28
}
*/

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
