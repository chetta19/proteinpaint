/*
find both exon-skipping and alternative exon usage
one skipping junction can be involved in multiple events


NOTE
* any group of junctions looked at here are supposed to come from the same sample


********************** EXPORTED 


findexonskipping( multisample, junctions, gmdata )

	### multisample

	boolean, if true, expect junction.data[] to contain more than 1 samples


	### junctions [ j ]

	required
	j.start
	j.stop
	j.data [{}]
		read count in each sample
		.v
		.tkid


	*** following are generated by mapjunctiontoexons() and attached to junction
	j.exonleft []
	j.exonright []
	j.matchisoform []



	### gmdata [{}] required

	gm.name
	gm.isoform
	gm.exon [ [start, stop] ]
	gm.intron [ [] ]
	gm.strand


output is list of impacted exon sets [ exonset ]
each exon set:

	.exonlst[ exon ]
		.chr
		.start
		.stop
	.eventlst [ event ]
		.isskipexon
		.gm
		.isaltexon
		.gmA, .gmB
		.junctionB
		.junctionAlst []
		.percentage
		.skippedexon[ exonidx ]
		.frame
		.color
		.down1junction
		.up1junction
	.toplabelsays
	.middlelabelsays
	.bottomlabelsays
	.color




findjunctionbystartstop()
	from a list of junctions, find ones matching given start & stop, no look at chr

findjunctionAlst()
	from a list of junctions, find ones that fill in any intron between designated exons
	(the A junctions that are canonical, as opposed to B junctions that skip exons)


FIXME

for alternative exon, find the case where it is 100% included, means no B junction. possible??






********************** INTERNAL

findjunctionbystartstop()

checkexoncodingutr()

*/

const exonskipcolor = '#99004d'
const exonaltcolor = '#004d99'

export function findexonskipping(multisample, junctions, gmdata) {
	const allevents = []

	// go over each junction
	for (const j0 of junctions) {
		if (!j0.matchisoform || j0.matchisoform.length == 0) {
			// no match to any isoform
			continue
		}
		for (const j0isoform of j0.matchisoform) {
			const j0exonbegin = Math.min(j0isoform.leftexonidx, j0isoform.rightexonidx)
			const j0exonend = Math.max(j0isoform.leftexonidx, j0isoform.rightexonidx)
			if (j0exonend - j0exonbegin <= 1) {
				/*
			j0 does not span more than 1 exon on this isoform
			no look for exon skipping

			TODO since this junction spans a intron, check to find 100% exon inclusion in alternative usage
			1. in this isoform, from current exon (e1), find next 2 exons (e2, e3), and the e2-e3 junction
			2. find another isoform that lacks e2
			3. if can find e1-e3 junction, mark e1-e3 junction as e2 skipping
			4. if no e1-e3 junction, both junctions (e1-e2, e2-e3) are 100% inclusion event
			*/
				continue
			}

			/*
		j0 spans more than 1 exon on this isoform
		j0 is the junctionB here
		shall report this event
		*/
			const jB = j0
			const thisevent = {
				skippedexon: [],
				junctionB: jB,
				junctionAlst: []
			}

			for (let i = j0exonbegin + 1; i < j0exonend; i++) {
				thisevent.skippedexon.push(i)
			}

			// check among all isoforms to see if junction B is represented by any isoform, to tell alternative exon usage from exon skipping
			let gmB = null
			for (const gm of gmdata) {
				if (!gm.intron) continue
				for (const i of gm.intron) {
					// intron start -1 is last base of exon, thus junction start
					if (i[0] - 1 == jB.start && i[1] == jB.stop) {
						gmB = gm
						break
					}
				}
				if (gmB) {
					break
				}
			}
			if (gmB) {
				// junction B match one of the introns of an isoform
				// this event is alternative exon usage
				thisevent.isaltexon = true
				thisevent.color = exonaltcolor
				thisevent.gmA = j0isoform.gm
				thisevent.gmB = gmB
			} else {
				thisevent.isskipexon = true
				thisevent.color = exonskipcolor
				thisevent.gm = j0isoform.gm
				/*
			is exon skipping on a gm
			check if skipped exons are coding or utr
			*/
				const [utr3, utr5, coding] = checkexoncodingutr(thisevent.skippedexon, thisevent.gm)
				if (utr3) thisevent.utr3 = true
				if (utr5) thisevent.utr5 = true
				if (coding) thisevent.coding = true
			}

			{
				const jAlst = findjunctionAlst(junctions, j0isoform.gm, j0exonbegin, j0exonend)
				for (const ja of jAlst) {
					thisevent.junctionAlst.push(ja)
				}
			}

			if (thisevent.isskipexon) {
				// jinghui's idea: show read count of neighbourhood junctions
				// must be based on the same isoform

				findupdown1junction4exonskip(thisevent, j0isoform.gm, junctions)
			}

			if (multisample) {
				/*
			junction tk is a sum of multiple samples
			*/

				if (!jB.data) {
					console.error('exonskip: jB.data missing when it is multi-sample')
					continue
				}
				if (jB.data.length == 0) {
					console.error('exonskip: jB.data.length==0')
					continue
				}
				/*
			all samples in jB.data are samples with this event
			calculate percentage in each sample
			*/
				let percentagesamplesum = 0
				for (const sampleBdata of jB.data) {
					const bcount = sampleBdata.v
					// for this sample, find out junction read count in each A junctions
					let acountsum = 0
					for (const junctionA of thisevent.junctionAlst) {
						if (!junctionA) {
							// this junction does not exist
							continue
						}
						if (!junctionA.data) {
							console.log('exonskip: jA.data missing when multi-sample')
							continue
						}
						for (const sampleAdata of junctionA.data) {
							if (sampleAdata.tkid == sampleBdata.tkid) {
								acountsum += sampleAdata.v
								break
							}
						}
					}
					percentagesamplesum += (100 * bcount) / (bcount + acountsum / thisevent.junctionAlst.length)
				}
				thisevent.percentage = Math.ceil(percentagesamplesum / jB.data.length)
			} else {
				// no sample specified, assumed single-sample
				// get junction B read count percentage
				let asum = 0
				for (const _j of thisevent.junctionAlst) {
					asum += _j ? _j.data[0].v : 0
				}
				thisevent.percentage = Math.ceil(
					(100 * thisevent.junctionB.data[0].v) / (thisevent.junctionB.data[0].v + asum / thisevent.junctionAlst.length)
				)
			}
			allevents.push(thisevent)
		}
	}
	// done scanning junctions and generating events

	/*
junction and exon sets are many-to-many relationship
one junction can cause events with different sets of exons
one exon set can belong to events of different junctions
to reduce clutter
sum events to unique exon-junction sets

k: dot-joined sorted start/stop pos of all exons of an event + | + junction start.stop
v: list of events
*/
	const exoncoords = new Map()
	for (const evt of allevents) {
		// collect start/stop position of all skipped exons
		const positionlst = []
		for (const eid of evt.skippedexon) {
			let thisexon
			if (evt.isskipexon) {
				thisexon = evt.gm.exon[eid]
			} else {
				thisexon = evt.gmA.exon[eid]
			}
			positionlst.push(thisexon[0])
			positionlst.push(thisexon[1])
		}
		if (positionlst.length == 0) {
			console.error('not possible: no skipped exon position for exon-skip')
			console.log(evt)
			continue
		}
		positionlst.sort() // sort exon start/stop positions

		// append junction start/stop position at end!
		const posstr = positionlst.join('.') + '|' + evt.junctionB.start + '.' + evt.junctionB.stop

		if (!exoncoords.has(posstr)) {
			exoncoords.set(posstr, [])
		}
		exoncoords.get(posstr).push(evt)
	}

	// event sets grouped by exons
	const eventsetlst = []
	for (const eventlst of exoncoords.values()) {
		// initialize this event set
		const thisset = {
			eventlst: eventlst,
			exonlst: [] // each exon: {start:, stop:}
		}
		eventsetlst.push(thisset)

		// first event
		const firstevent = eventlst[0]
		// get exon coordinates from first event
		for (const eid of firstevent.skippedexon) {
			const gm = firstevent.isskipexon ? firstevent.gm : firstevent.gmA
			const thisexon = gm.exon[eid]
			thisset.exonlst.push({
				chr: gm.chr,
				start: thisexon[0],
				stop: thisexon[1]
			})
		}

		// count # of skip and alt events associated with this exon
		// for deciding how to label
		let eventcount_skip = 0,
			eventcount_alt = 0
		for (const evt of eventlst) {
			if (evt.isskipexon) {
				eventcount_skip++
			} else {
				eventcount_alt++
			}
		}
		thisset.color = eventcount_skip > 0 ? exonskipcolor : exonaltcolor

		// top label content 1: which exons
		const exonnumberset = new Set()
		for (const evt of eventlst) {
			const thisexonnumbers = []
			for (const eid of evt.skippedexon) {
				thisexonnumbers.push(eid + 1)
			}
			exonnumberset.add(thisexonnumbers.join(','))
		}
		if (exonnumberset.size == 1) {
			// only 1 number of exon
			thisset.toplabelsays = 'exon ' + [...exonnumberset][0] + ' '
		} else {
			// more than 1 type of exon numbers
			// same exons appear at different order in different isoforms
			thisset.toplabelsays = 'exon '
		}

		// top label content 2: event type
		thisset.toplabelsays += eventcount_skip ? 'skip' + (eventcount_alt ? '|alt' : '') : 'alt'

		if (multisample) {
			// using samples, find the maximum sample number among all events
			let samplecount = 0
			for (const evt of eventlst) {
				samplecount = Math.max(samplecount, evt.junctionB.data.length)
			}
			thisset.middlelabelsays = samplecount + ' sample' + (samplecount > 1 ? 's' : '')
		}
		// bottom label: percentage is derived from junctions
		// since events of eventlst[] share junctions, just use the first event
		thisset.bottomlabelsays = firstevent.percentage + '%'
	}
	return eventsetlst
}

function findjunctionbystartstop(lst, p1, p2) {
	const start = Math.min(p1, p2)
	const stop = Math.max(p1, p2)
	for (const j of lst) {
		if (j.start == start && j.stop == stop) return j
	}
	return null
}

exports.findjunctionbystartstop = findjunctionbystartstop

function findjunctionAlst(junctions, gm, exonbegin, exonend) {
	/*
	find canonical junctions skipped by junction B
	by the order of exons
	allow some or all of the canonical junctions to be missing
	*/
	const lst = []
	const exonstart = Math.min(exonbegin, exonend)
	const exonstop = Math.max(exonbegin, exonend)
	if (gm.strand == '+') {
		for (let i = exonstart; i < exonstop; i++) {
			const p1 = gm.exon[i][1] - 1
			const p2 = gm.exon[i + 1][0]
			lst.push(findjunctionbystartstop(junctions, p1, p2))
		}
	} else {
		for (let i = exonstop; i > exonstart; i--) {
			const p1 = gm.exon[i][1] - 1
			const p2 = gm.exon[i - 1][0]
			// must put to head rather than tail!!
			// keep junctionAlst 5-3
			lst.unshift(findjunctionbystartstop(junctions, p1, p2))
		}
	}
	return lst
}

exports.findjunctionAlst = findjunctionAlst

function findupdown1junction4exonskip(evt, gm, junctions) {
	/*
	find up1 and down1 junction for a exon skipping event on the same isoform, for graphing
	*/
	// first skipped exon
	let exonidx = evt.skippedexon[0]
	if (exonidx > 1) {
		// upstream of first skipped exon
		let p1, p2
		if (gm.strand == '+') {
			p1 = gm.exon[exonidx - 2][1] - 1
			p2 = gm.exon[exonidx - 1][0]
		} else {
			p1 = gm.exon[exonidx - 1][1] - 1
			p2 = gm.exon[exonidx - 2][0]
		}
		evt.up1junction = findjunctionbystartstop(junctions, p1, p2)
	}

	// last skipped exon
	exonidx = evt.skippedexon[evt.skippedexon.length - 1]
	if (exonidx < gm.exon.length - 2) {
		// downstream of last skipped exon
		let p1, p2
		if (gm.strand == '+') {
			p1 = gm.exon[exonidx + 1][1] - 1
			p2 = gm.exon[exonidx + 2][0]
		} else {
			p1 = gm.exon[exonidx + 2][1] - 1
			p2 = gm.exon[exonidx + 1][0]
		}
		evt.down1junction = findjunctionbystartstop(junctions, p1, p2)
	}
}
exports.findupdown1junction4exonskip = findupdown1junction4exonskip

function checkexoncodingutr(exonidlst, gm) {
	/*
	list of exon idx
	check against gm.coding
	return [utr3, utr5, coding]
	*/
	if (!gm.coding) {
		return [false, false, false]
	}
	let exonstart = gm.exon[exonidlst[0]][0]
	let exonstop = gm.exon[exonidlst[0]][1]
	for (const idx of exonidlst) {
		exonstart = Math.min(gm.exon[idx][0], exonstart)
		exonstop = Math.max(gm.exon[idx][1], exonstop)
	}

	const forward = gm.strand == '+'
	let utr3 = false,
		utr5 = false,
		coding = false

	if (exonstop <= gm.codingstart) {
		if (forward) {
			utr5 = true
		} else {
			utr3 = true
		}
	} else if (exonstart >= gm.codingstop) {
		if (forward) {
			utr3 = true
		} else {
			utr5 = true
		}
	} else {
		coding = true
	}
	return [utr3, utr5, coding]
}
