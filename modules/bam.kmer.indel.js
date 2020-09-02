const jStat = require('jStat').jStat
const features = require('../app').features
const utils = require('./utils')
const bamcommon = require('./bam.common')
// const fs = require('fs')

export async function match_complexvariant(templates, q) {
	// TODO
	// get flanking sequence, suppose that segments are of same length, use segment length
	const segbplen = templates[0].segments[0].seq.length
	// need to verify if the retrieved sequence is showing 1bp offset or not
	const leftflankseq = (await utils.get_fasta(
		q.genome,
		q.variant.chr + ':' + (q.variant.pos - segbplen) + '-' + q.variant.pos
	))
		.split('\n')
		.slice(1)
		.join('')
		.toUpperCase()
	const rightflankseq = (await utils.get_fasta(
		q.genome,
		q.variant.chr +
			':' +
			(q.variant.pos + q.variant.ref.length + 1) +
			'-' +
			(q.variant.pos + segbplen + q.variant.ref.length + 1)
	))
		.split('\n')
		.slice(1)
		.join('')
		.toUpperCase()
	console.log(q.variant.chr + '.' + q.variant.pos + '.' + q.variant.ref + '.' + q.variant.alt)
	console.log('refSeq', leftflankseq + q.variant.ref + rightflankseq)
	console.log('mutSeq', leftflankseq + q.variant.alt + rightflankseq)

	const refallele = q.variant.ref.toUpperCase()
	const altallele = q.variant.alt.toUpperCase()

	const refseq = leftflankseq + refallele + rightflankseq
	const altseq = leftflankseq + altallele + rightflankseq

	// console.log(refallele,altallele,refseq,altseq)

	//----------------------------------------------------------------------------

	// IMPORTANT PARAMETERS
	const kmer_length = 6 // length of kmer
	const weight_no_indel = 0.1 // Weight when base not inside the indel
	const weight_indel = 10 // Weight when base is inside the indel
	const threshold_slope = 0.05 // Maximum curvature allowed to recognize perfectly aligned alt/ref sequences
	const maximum_error_tolerance = 0.6 // Maximum error in jaccard similarity allowed to be classifed as ref/alt i.e if (1-error_tolerance) <= jaccard_similarity <= 1 then sequence if ref/alt
	//----------------------------------------------------------------------------

	const indel_start = q.variant.pos
	const ref_indel_stop = q.variant.pos + refallele.length
	const alt_indel_stop = q.variant.pos + altallele.length

	let allele_length = refallele.length
	if (altallele.length > refallele.length) {
		allele_length = altallele.length
	}

	const all_ref_kmers = build_kmers_refalt(
		refseq,
		kmer_length,
		q.variant.pos - segbplen,
		indel_start,
		ref_indel_stop,
		weight_indel,
		weight_no_indel
	)
	//console.log("all_ref_kmers:",all_ref_kmers)
	const all_alt_kmers = build_kmers_refalt(
		altseq,
		kmer_length,
		q.variant.pos - segbplen,
		indel_start,
		alt_indel_stop,
		weight_indel,
		weight_no_indel
	)

	const all_ref_kmers_nodups = new Set(all_ref_kmers)
	const all_ref_kmers_seq_values_nodups = new Set(all_ref_kmers.map(x => x.sequence))

	const all_ref_counts = new Map(
		[...all_ref_kmers_seq_values_nodups].map(x => [x, all_ref_kmers.filter(y => y.sequence === x).length])
	)
	//console.log("all_ref_counts:",all_ref_counts)
	//console.log("all_ref_kmers_seq_values_nodups:",all_ref_kmers_seq_values_nodups)
	let ref_kmers_weight = 0
	for (const item of [...all_ref_kmers_nodups]) {
		const kmer = item.sequence
		const kmer2_freq = all_ref_counts.get(kmer) // Getting frequency of kmer in ref sequence
		const score = item.value
		ref_kmers_weight += score * kmer2_freq
	}
	console.log('ref_kmers_weight:', ref_kmers_weight)

	const all_alt_kmers_nodups = new Set(all_alt_kmers)
	const all_alt_kmers_seq_values_nodups = new Set(all_alt_kmers.map(x => x.sequence))

	const all_alt_counts = new Map(
		[...all_alt_kmers_seq_values_nodups].map(x => [x, all_alt_kmers.filter(y => y.sequence === x).length])
	)
	//console.log("all_alt_counts:",all_alt_counts)
	//console.log("all_alt_kmers_seq_values_nodups:",all_alt_kmers_seq_values_nodups)
	let alt_kmers_weight = 0
	for (const item of [...all_alt_kmers_nodups]) {
		const kmer = item.sequence
		const kmer2_freq = all_alt_counts.get(kmer) // Getting frequency of kmer in alt sequence
		const score = item.value
		alt_kmers_weight += score * kmer2_freq
	}
	console.log('alt_kmers_weight:', alt_kmers_weight)

	const ref_kmers = build_kmers(refseq, kmer_length)
	const alt_kmers = build_kmers(altseq, kmer_length)

	const ref_kmers_nodups = new Set(ref_kmers)
	const alt_kmers_nodups = new Set(alt_kmers)
	//console.log(ref_kmers)
	//console.log(alt_kmers)

	const kmer_diff_scores = []
	let refalt_status = []
	let ref_comparisons = []
	let alt_comparisons = []
	let ref_comparisons2 = []
	let alt_comparisons2 = []
	const ref_scores = []
	const alt_scores = []
	let i = 0
	for (const template of templates) {
		const read_seq = template.segments[0].seq
		// let cigar_seq = template.segments[0].cigarstr
		const read_kmers = build_kmers(read_seq, kmer_length)
		//const ref_comparison = jaccard_similarity(read_kmers, ref_kmers, ref_kmers_nodups)
		const ref_comparison = jaccard_similarity_weights(
			read_kmers,
			all_ref_kmers,
			all_ref_kmers_nodups,
			all_ref_kmers_seq_values_nodups,
			ref_kmers_weight,
			all_ref_counts
		)
		const alt_comparison = jaccard_similarity_weights(
			read_kmers,
			all_alt_kmers,
			all_alt_kmers_nodups,
			all_alt_kmers_seq_values_nodups,
			alt_kmers_weight,
			all_alt_counts
		)
		ref_comparisons.push(ref_comparison)
		alt_comparisons.push(alt_comparison)
		//console.log("ref comparison:",ref_comparison,"alt comparison:",alt_comparison)
		// console.log("Iteration:",k,read_seq,cigar_seq,ref_comparison,alt_comparison,read_seq.length,refseq.length,altseq.length,read_kmers.length,ref_kmers.length,alt_kmers.length)
		const diff_score = alt_comparison - ref_comparison
		kmer_diff_scores.push(diff_score)
		if (diff_score > 0) {
			const item = {
				value: alt_comparison,
				groupID: i
			}
			refalt_status.push('alt')
			alt_comparisons2.push(alt_comparison)
			alt_scores.push(item)
		} else if (diff_score <= 0) {
			const item = {
				value: ref_comparison,
				groupID: i
			}
			refalt_status.push('ref')
			ref_comparisons2.push(ref_comparison)
			ref_scores.push(item)
		}

		i++
	}

	console.log('ref_scores length:', ref_scores.length, 'alt_scores length:', alt_scores.length)
	let ref_cutoff = 0
	if (ref_scores.length > 0) {
		ref_cutoff = determine_maxima_alt(ref_scores, threshold_slope)
		if (1 - maximum_error_tolerance > ref_cutoff) {
			ref_cutoff = 1 - maximum_error_tolerance
		}
	}
	let alt_cutoff = 0
	if (alt_scores.length > 0) {
		alt_cutoff = determine_maxima_alt(alt_scores, threshold_slope)
		if (1 - maximum_error_tolerance > alt_cutoff) {
			alt_cutoff = 1 - maximum_error_tolerance
		}
	}
	console.log('Ref cutoff:', ref_cutoff, 'Alt cutoff:', alt_cutoff)

	let index = 0
	const type2group = bamcommon.make_type2group(q)
	let kmer_diff_scores_input = []
	for (const item of refalt_status) {
		//console.log("Qname:",templates[index].segments[0].qname,"Read start:",templates[index].segments[0].segstart,"Read stop:",templates[index].segments[0].segstop,"Indel start:",indel_start,"Ref indel stop:",ref_indel_stop,"Alt indel stop:",alt_indel_stop,"Allele length:",allele_length)
		if (item == 'ref') {
			if (
				Math.abs(templates[index].segments[0].segstart - indel_start) <= allele_length ||
				Math.abs(templates[index].segments[0].segstop - ref_indel_stop) <= allele_length ||
				(indel_start <= templates[index].segments[0].segstart &&
					templates[index].segments[0].segstart <= ref_indel_stop) ||
				(indel_start <= templates[index].segments[0].segstop && templates[index].segments[0].segstop <= ref_indel_stop)
			) {
				// Checking to see if either end of the read is in close proximity to the indel region
				if (type2group[bamcommon.type_supportno]) {
					templates[index].__tempscore = '-' + ref_comparisons[index].toFixed(4).toString()
					type2group[bamcommon.type_supportno].templates.push(templates[index])
					const input_items = {
						value: kmer_diff_scores[index],
						groupID: 'none'
					}
					kmer_diff_scores_input.push(input_items)
				}
			} else if (ref_cutoff <= ref_comparisons[index] && ref_comparisons[index] <= 1) {
				// Checking if jaccard similarity with reference allele is within the error tolerance threshold

				if (type2group[bamcommon.type_supportref]) {
					templates[index].__tempscore = '-' + ref_comparisons[index].toFixed(4).toString()
					type2group[bamcommon.type_supportref].templates.push(templates[index])
					const input_items = {
						value: kmer_diff_scores[index],
						groupID: 'ref'
					}
					kmer_diff_scores_input.push(input_items)
				}
			} else {
				if (type2group[bamcommon.type_supportno]) {
					templates[index].__tempscore = '-' + ref_comparisons[index].toFixed(4).toString()
					type2group[bamcommon.type_supportno].templates.push(templates[index])
					const input_items = {
						value: kmer_diff_scores[index],
						groupID: 'none'
					}
					kmer_diff_scores_input.push(input_items)
				}
			}
		} else if (item == 'alt') {
			if (
				Math.abs(templates[index].segments[0].segstart - indel_start) <= allele_length ||
				Math.abs(templates[index].segments[0].segstop - alt_indel_stop) <= allele_length ||
				(indel_start <= templates[index].segments[0].segstart &&
					templates[index].segments[0].segstart <= alt_indel_stop) ||
				(indel_start <= templates[index].segments[0].segstop && templates[index].segments[0].segstop <= alt_indel_stop)
			) {
				// Checking to see if either end of the read is in close proximity to the indel region
				if (type2group[bamcommon.type_supportno]) {
					templates[index].__tempscore = '-' + alt_comparisons[index].toFixed(4).toString()
					type2group[bamcommon.type_supportno].templates.push(templates[index])
					const input_items = {
						value: kmer_diff_scores[index],
						groupID: 'none'
					}
					kmer_diff_scores_input.push(input_items)
				}
			} else if (alt_cutoff <= alt_comparisons[index] && alt_comparisons[index] <= 1) {
				// Checking if jaccard similarity with alternate allele is within the error tolerance threshold
				if (type2group[bamcommon.type_supportalt]) {
					templates[index].__tempscore = alt_comparisons[index].toFixed(4).toString()
					type2group[bamcommon.type_supportalt].templates.push(templates[index])
					const input_items = {
						value: kmer_diff_scores[index],
						groupID: 'alt'
					}
					kmer_diff_scores_input.push(input_items)
				}
			} else {
				if (type2group[bamcommon.type_supportno]) {
					templates[index].__tempscore = alt_comparisons[index].toFixed(4).toString()
					type2group[bamcommon.type_supportno].templates.push(templates[index])
					const input_items = {
						value: kmer_diff_scores[index],
						groupID: 'none'
					}
					kmer_diff_scores_input.push(input_items)
				}
			}
		}
		index++
	}
	kmer_diff_scores_input.sort((a, b) => a.value - b.value)
	// console.log('Final array for plotting:', kmer_diff_scores_input)
	// Please use this array for plotting the scatter plot .values contain the numeric value, .groupID contains ref/alt/none status. You can use red for alt, green for ref and blue for none.

	q.kmer_diff_scores_asc = kmer_diff_scores_input
	//	if (features.bamScoreRplot) {
	//		const file = fs.createWriteStream(
	//			q.variant.chr + '.' + q.variant.pos + '.' + q.variant.ref + '.' + q.variant.alt + '.txt'
	//		)
	//		file.on('error', function(err) {
	//			/* error handling */
	//		})
	//		kmer_diff_scores_input.forEach(function(v) {
	//			file.write(v.value + ',' + v.groupID + '\n')
	//		})
	//		file.end()
	//	}

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

function build_kmers(sequence, kmer_length) {
	const num_iterations = sequence.length - kmer_length + 1
	// console.log(sequence)

	let kmers = []
	for (let i = 0; i < num_iterations; i++) {
		const subseq = sequence.substr(i, kmer_length)
		// console.log(i,kmer)
		// console.log(subseq)
		kmers.push(subseq)
	}
	// const kmers_nodups = new Set(kmers)
	return kmers
}

function build_kmers_refalt(
	sequence,
	kmer_length,
	left_most_pos,
	indel_start,
	indel_stop,
	weight_indel,
	weight_no_indel
) {
	const num_iterations = sequence.length - kmer_length + 1
	// console.log(sequence)

	let kmers = []
	let kmer_start = left_most_pos
	let kmer_stop = kmer_start + kmer_length
	for (let i = 0; i < num_iterations; i++) {
		const subseq = sequence.substr(i, kmer_length) // Determining kmer sequence
		let kmer_score = 0
		for (let j = kmer_start; j < kmer_stop; j++) {
			// Calculating score for every nucleotide in the kmer
			if (indel_start <= j && j < indel_stop) {
				// Determining if nucleotide is within indel or not
				kmer_score += weight_indel
			} else {
				kmer_score += weight_no_indel
			}
		}
		const input_items = {
			value: kmer_score,
			sequence: subseq
		}
		kmer_start++
		kmer_stop++

		// console.log(i,kmer)
		// console.log(subseq)
		kmers.push(input_items)
	}

	// Getting unique kmers
	//console.log("kmers length:",kmers.length)
	const kmers_nodup = Array.from(new Set([...kmers.map(x => x.sequence)]))
	//console.log("kmers_nodup length:",kmers_nodup.length)

	let kmers2 = []
	for (const kmer of kmers_nodup) {
		// Calulating mean of scores for each kmer
		const kmer_values = kmers.filter(i => i.sequence == kmer).map(x => x.value)
		//console.log("kmer_values:",kmer, jStat.mean(kmer_values))
		const input_items = {
			value: jStat.mean(kmer_values),
			sequence: kmer
		}
		kmers2.push(input_items)
	}

	let kmers3 = []
	for (const kmer of kmers) {
		const kmer_values = kmers2.filter(i => i.sequence == kmer.sequence).map(x => x.value)
		const kmer_value = kmer_values[0]
		const input_items = {
			value: kmer_value,
			sequence: kmer.sequence
		}
		kmers3.push(input_items)
	}
	return kmers3
}

function jaccard_similarity_weights(
	kmers1,
	kmers2,
	kmers2_nodups,
	kmer2_seq_values_nodups,
	kmers2_weight,
	kmer2_counts
) {
	const kmers1_nodups = new Set(kmers1)
	//const intersection = new Set([...kmers1_nodups].filter(i => [...kmers2_nodups].filter(y => y.sequence === i)))
	const intersection = new Set([...kmers1_nodups].filter(i => kmer2_seq_values_nodups.has(i)))
	//console.log("intersection:", intersection.size)
	let intersection_weight = 0
	const kmer1_counts = new Map([...kmers1_nodups].map(x => [x, kmers1.filter(y => y === x).length]))
	//console.log("kmer1_counts:",kmer1_counts)
	//console.log("kmer2_counts:",kmer2_counts)
	for (const kmer of intersection) {
		const kmer1_freq = kmer1_counts.get(kmer) // Getting frequency of kmer in read sequence
		const scores = [...kmers2_nodups].filter(i => i.sequence == kmer).map(x => x.value) // Determining score of kmer in ref/alt sequence
		let score = 0 // If kmer not found in ref/alt sequence, penalizing kmer to zero (may be due to incorrect base pair call or splicing)
		if (scores.length > 0) {
			// If kmer found in ref/alt sequence, using that score
			score = scores[0]
		}
		let kmer2_freq = 0
		if (score != 0) {
			kmer2_freq = kmer2_counts.get(kmer) // Getting frequency of kmer in ref/alt sequence
		}
		//console.log("score:",score,"kmer:",kmer,"kmer1 freq:",kmer1_freq,"kmer2_freq:",kmer2_freq)
		if (kmer1_freq >= kmer2_freq) {
			intersection_weight += kmer2_freq * score
		} else if (kmer1_freq < kmer2_freq) {
			intersection_weight += kmer1_freq * score
		}
	}
	//console.log("intersection_weight:",intersection_weight)

	let kmers1_weight = 0
	for (const kmer of kmers1_nodups) {
		const kmer1_freq = kmer1_counts.get(kmer) // Getting frequency of kmer in read sequence
		const scores = [...kmers2_nodups].filter(i => i.sequence == kmer).map(x => x.value) // Determining score of kmer in ref/alt sequence
		let score = 0 // If kmer not found in ref/alt sequence, penalizing kmer to zero (may be due to incorrect base pair call or splicing)
		if (scores.length > 0) {
			// If kmer found in ref/alt sequence, using that score
			score = scores[0]
		}
		kmers1_weight += score * kmer1_freq
	}
	//console.log("kmers1_weight:",kmers1_weight," kmers2_weight", kmers2_weight," intersection weight:",intersection_weight)
	return intersection_weight / (kmers1_weight + kmers2_weight - intersection_weight)
}

function determine_maxima_alt(jaccard_similarities, threshold_slope) {
	jaccard_similarities.sort((a, b) => a.value - b.value)
	//console.log(jaccard_similarities)

	let start_point = jaccard_similarities.length - 1
	let final_cutoff = 0
	let slope = 0
	let is_a_line = 1
	if (jaccard_similarities.length > 1) {
		for (let i = jaccard_similarities.length - 1; i > 0; i--) {
			slope = Math.abs(jaccard_similarities[i - 1].value - jaccard_similarities[i].value)
			//console.log('Slope:', slope, jaccard_similarities.length - 1 - i,jaccard_similarities[i - 1].value,jaccard_similarities[i].value)
			if (slope > threshold_slope) {
				start_point = i
				is_a_line = 0
				break
			}
		}
	} else {
		console.log('Number of reads too low to determine curvature of slope')
		final_cutoff = jaccard_similarities[0].value
		return final_cutoff
	}
	if (is_a_line == 1) {
		// The points are in a line
		final_cutoff = jaccard_similarities[0].value
	} else {
		// The points are in the shape of a curve
		//console.log('start point:', start_point)
		let jaccard_similarities_input = []
		for (let i = 0; i <= start_point; i++) {
			jaccard_similarities_input.push([i, jaccard_similarities[i].value])
		}

		const min_value = [0, jaccard_similarities[0].value]
		const max_value = [start_point, jaccard_similarities[start_point].value]
		//console.log('max_value:', max_value)

		const slope_of_line = (max_value[1] - min_value[1]) / (max_value[0] - min_value[0])
		//console.log('Slope of line:', slope_of_line)
		const intercept_of_line = min_value[1] - min_value[0] * slope_of_line

		let distances_from_line = []
		for (let i = 0; i < jaccard_similarities_input.length; i++) {
			distances_from_line.push(
				Math.abs(
					slope_of_line * jaccard_similarities_input[i][0] - jaccard_similarities_input[i][1] + intercept_of_line
				) / Math.sqrt(1 + slope_of_line * slope_of_line)
			) // distance = abs(a*x+b*y+c)/sqrt(a^2+b^2)
		}
		const array_maximum = Math.max(...distances_from_line)
		// console.log("Array maximum:",array_maximum)
		const index_array_maximum = distances_from_line.indexOf(array_maximum)
		// console.log("Max index:",index_array_maximum,"Total length:",jaccard_similarities.length)
		final_cutoff = jaccard_similarities[index_array_maximum].value
	}
	//console.log("indices:",indices)
	return final_cutoff
}
