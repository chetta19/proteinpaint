// Syntax: cd .. && cargo build --release

// echo AATAGCCTTTACATTATGTAATAGTGTAATACAAATAATAATTTATTATAATAATGTGAAATTATTTACAGTACCCTAACCCTAACCCTAACCCCTAATCCTAACCCTAACCCTAACCCCTAACCCTAATCCTAACCCTAACCCTAACCCTAACCCTAACCCCTAACCCTAACCCGAAAACCCTAACCCTAAAACCCTAACATAACCCTTACCCTTACCCTAATCCTAACCCTAATCCTTACCCTTACCCTTACCCTGACCCTAACCCTAATCCTTACCCTTATCCTACCCCTAACCCTTAACCC-AATAGCCTTTACATTATGTAATAGTGTAATACAAATAATAATTTATTATAATAATGTGAAATTATTTACAGTACCCTAACCCTAACCCTAACCCCTAATCCTAACCCTAACCCTAACCCCTAACCCTAATCCTAACCCTAACCCTAACCCTAACCCCTAACCCCTAACCCTAACCCGAAAACCCTAACCCTAAAACCCTAACATAACCCTTACCCTTACCCTAATCCTAACCCTAATCCTTACCCTTACCCTTACCCTGACCCTAACCCTAATCCTTACCCTTATCCTACCCCTAACCCTTAACCC-TAGTAATAATGTGAAATTATTTACAGTACCCTAACCCTAACCCTAACCCCTAATCCTAACCCTAACCCTAACCCCTAACCCTAATCCTAACCCTAACCCTAACCCTAACCCCTAACCCCTAACCCTAACCCTAAAACCCTAACCCTAAAAC-AGTAATAATGTGAAATTATTTACAGTACCCTAACCCTAACCCTAACCCCTAATCCTAACCCTAACCCTAACCCCTAACCCTAATCCTAACCCTAACCCTAACCCAAACCCTAACCCCTAACCCTAACCCAAAAACCCTAACCCTAAAACCC-TAATGTGAAATTATTTACAGTACCCTAACCCTAACCCTAACCCCTAATCCTAACCCTAACCCTAACCCCTAACCCTAATCCTAACCCTAACCCTAACCCTAACCCCTAACCCCTAACCCTAACCCTAAAACCCTAACCCTAAAACCCTAAC-TAATGTGAAATTATTTACAGTACCCTAACCCTAACCCTAACCCCTAATCCTAACCCTAACCCTAACCCCTAACCCTAATCCTAACCCTAACCCTAACCCTAACCCTAACCCCTAACCCTAACCCTAAAACCCTAACCCTAAAACCCTAACC-TAAAGTGAAATTATTGACAGTACCCTAACCCTAACCCTAACCCCTAATCCTAACCCTAACCCTATCCCCTAACCCTAATCCTAACCCTAACCCTAACCCTATCCCCTAACCCCTAACCCTAACCCTAAAACCCTAACCCTAAAACCCTAAC-TAATGTGAAATTATTTACAGTACCCTAACCCTAACCCTAACCCCTAATCCTAACCCTAACCCTAACCCCTAACCCTAATCCTAACCCTAACCCTAACCCTAACCCTAACCCCTAACCCTAACCCTAAAACCCTAACCCTAAAACCCTAACC-CAGTACCCTAACCCTAACCCTAACCCCTAATCCTAACCCTAACCCTAACCCCTAACCCTAATCCTAACCCTAACCCTAACCCTAACCCTAACCCCTAACCCTAACCCTAAAACCCTAACCCTAAAACCCTAACCATAACCCTTACCCTTAC-CTGACCCTTAACCCTAACCCTAACCCCTAACCCTAACCCTTAACCCTTAAACCTTAACCCTCATCCTCACCCTCACCCTCACCCCTAACCCTAACCCCTAACCCAAACCCTCACCCTAAACCCTAACCCTAAACCCAACCCAAACCCTAAC-ACCCCTAATCCTAACCCTAACCCTAACCCCTAACCCTAATCCTAACCCTAGCCCTAACCCTAACCCTAACCCCTAACCCTAACCCTAAAACCCTAACCCTAAAACCCTAACCATAACCCTTACCCTTACCCTAATCCTAACCCTAATCCTT-CTAACCCTAACCCCTAACCCTAATCCTAACCCTAACCCTAACCCTAACCCTAACCCCTAACCCTAACCCTAAAACCCTAACCCTAAAACCCTAACCATAACCCTTACCCTTACCCTAATCCTAACCCTAATCCTTACCCTTACCCTTACCC:16357-16358-16363-16363-16363-16363-16380-16388-16402-16418:108M1I42M-151M-102M1I48M-151M-101M1I49M-151M-132M1I18M-8S31M1I6M1I32M1I30M41S-110M1I40M-94M1I56M:16463:151:A:AC:6:0.1:10:0.1: | ../target/release/rust_indel_cargo

use std::cmp::Ordering;
use std::collections::HashSet;

//use std::env;
//use std::time::{SystemTime};
use std::io;

#[allow(non_camel_case_types)]
#[allow(non_snake_case)]
pub struct read_diff_scores {
    groupID: usize,
    value: f64,
    polyclonal: i64,
    ref_insertion: i64,
}

#[allow(non_camel_case_types)]
struct kmer_input {
    kmer_sequence: String,
    kmer_weight: f64,
}

#[allow(non_camel_case_types)]
struct kmer_data {
    kmer_count: i64,
    kmer_weight: f64,
}

#[allow(non_camel_case_types)]
#[allow(non_snake_case)]
struct read_category {
    category: String,
    groupID: usize,
    diff_score: f64,
    ref_insertion: i64,
}

fn read_diff_scores_owned(item: &mut read_diff_scores) -> read_diff_scores {
    let val = item.value.to_owned();
    #[allow(non_snake_case)]
    let gID = item.groupID.to_owned();
    let poly = item.polyclonal.to_owned();
    let ref_ins = item.ref_insertion.to_owned();

    let read_val = read_diff_scores {
        value: f64::from(val),
        groupID: usize::from(gID),
        polyclonal: i64::from(poly),
        ref_insertion: i64::from(ref_ins),
    };
    read_val
}

fn binary_search(kmers: &Vec<String>, y: &String) -> i64 {
    let kmers_dup = &kmers[..];
    //let kmers_dup = kmers.clone();
    //let x:String = y.to_owned();
    //println!("Search string:{}",&x);
    let mut index: i64 = -1;
    let mut l: usize = 0;
    let mut r: usize = kmers_dup.len() - 1;
    #[allow(unused_assignments)]
    let mut m: usize = 0;
    //let mut n:usize = 0;
    while l <= r {
        m = l + ((r - l) / 2);
        //if (m>=kmers_dup.len()){
        //  n=kmers_dup.len()-1;
        //}
        //else {
        // n=m;
        //}
        //println!("l:{},m:{},r:{}",l,m,r);
        // Check if x is present at mid
        if y == &kmers_dup[m] {
            index = m as i64;
            break;
        }
        //else if m==0 as usize {break;}

        // If x is greater, ignore left half
        else if y > &kmers_dup[m] {
            l = m + 1;
        }
        // If x is smaller, ignore right half
        else {
            if m == 0 as usize {
                break;
            }
            r = m - 1;
        }
        //if r==0 as usize {break;}
    }
    index
}

fn binary_search_repeat(kmers: &Vec<String>, y: &String) -> Vec<usize> {
    let orig_index: i64 = binary_search(kmers, y);
    let mut indexes_vec = Vec::<usize>::new();
    let x: String = y.to_owned();
    let kmers_dup = &kmers[..];
    if orig_index != -1 as i64 {
        indexes_vec.push(orig_index as usize);
        let mut index: usize = orig_index as usize;
        while index > 0 {
            if kmers_dup[index - 1] == x {
                index = index - 1;
                indexes_vec.push(index);
            } else {
                break;
            }
        }
        index = orig_index as usize;
        while index < (kmers_dup.len() - 1) {
            if kmers_dup[index + 1] == x {
                index = index + 1;
                indexes_vec.push(index);
            } else {
                break;
            }
        }
    }
    indexes_vec
}

fn parse_cigar(cigar_seq: &String) -> (Vec<char>, Vec<i64>) {
    let sequence_vector: Vec<_> = cigar_seq.chars().collect();
    let mut subseq = String::new();
    let mut alphabets = Vec::<char>::new();
    let mut numbers = Vec::<i64>::new();
    for i in 0..sequence_vector.len() {
        if sequence_vector[i].is_alphabetic() == true {
            alphabets.push(sequence_vector[i]);
            numbers.push(subseq.parse::<i64>().unwrap());
            subseq = "".to_string();
        } else {
            subseq += &sequence_vector[i].to_string();
        }
    }
    (alphabets, numbers)
}

fn main() {
    let mut input = String::new();
    match io::stdin().read_line(&mut input) {
        #[allow(unused_variables)]
        Ok(n) => {
            //println!("{} bytes read", n);
            //println!("{}", input);
        }
        Err(error) => println!("Piping error: {}", error),
    }
    let args: Vec<&str> = input.split(":").collect();
    //println!("args:{:?}",args);
    //let arg_seq:String = args[0].parse::<String>().unwrap();
    //let arg_list: Vec<&str> = arg_seq.split("\t").collect();
    let sequences: String = args[0].parse::<String>().unwrap();
    let start_positions: String = args[1].parse::<String>().unwrap();
    let cigar_sequences: String = args[2].parse::<String>().unwrap();
    let variant_pos: i64 = args[3].parse::<i64>().unwrap();
    let segbplen: i64 = args[4].parse::<i64>().unwrap();
    let refallele: String = args[5].parse::<String>().unwrap();
    let altallele: String = args[6].parse::<String>().unwrap();
    let kmer_length: i64 = args[7].parse::<i64>().unwrap();
    let weight_no_indel: f64 = args[8].parse::<f64>().unwrap();
    let weight_indel: f64 = args[9].parse::<f64>().unwrap();
    let threshold_slope: f64 = args[10].parse::<f64>().unwrap();
    let ref_nucleotides: Vec<char> = refallele.chars().collect();
    let alt_nucleotides: Vec<char> = altallele.chars().collect();

    //let ref_length: usize = ref_nucleotides.len();
    //let alt_length: usize = alt_nucleotides.len();
    let lines: Vec<&str> = sequences.split("-").collect();
    let start_positions_list: Vec<&str> = start_positions.split("-").collect();
    let cigar_sequences_list: Vec<&str> = cigar_sequences.split("-").collect();

    //println!("lines:{:?}", lines);

    let left_most_pos = variant_pos - segbplen;
    let ref_length: i64 = refallele.len() as i64;
    let alt_length: i64 = altallele.len() as i64;
    let mut indel_length: i64 = alt_length;
    let mut ref_length2 = ref_length + 1;
    let mut alt_length2 = alt_length;
    if ref_length > alt_length {
        indel_length = ref_length;
        alt_length2 = alt_length + 1;
        ref_length2 = ref_length;
    }
    println!("Final ref length:{}", ref_length2);
    println!("Final alt length:{}", alt_length2);

    // Select appropriate kmer length
    let max_kmer_length: i64 = 200;
    let mut kmer_length_iter: i64 = kmer_length;
    let surrounding_region_length: i64 = 25;
    let mut uniq_kmers: usize = 0;
    let mut found_duplicate_kmers: usize = 0;
    //let mut ref_kmers_weight: f64 = 0.0;
    //let mut ref_kmers_nodups = Vec::<String>::new();
    //let mut ref_indel_kmers = Vec::<String>::new();
    //let mut ref_surrounding_kmers = Vec::<String>::new();
    //let mut ref_kmers_data = Vec::<kmer_data>::new();
    //
    //let mut alt_kmers_weight: f64 = 0.0;
    //let mut alt_kmers_nodups = Vec::<String>::new();
    //let mut alt_indel_kmers = Vec::<String>::new();
    //let mut alt_surrounding_kmers = Vec::<String>::new();
    //let mut alt_kmers_data = Vec::<kmer_data>::new();

    while kmer_length_iter <= max_kmer_length && uniq_kmers == 0 {
        //console::log_1(&"Ref kmers:".into());
        #[allow(unused_variables)]
        let (
            ref_kmers_weight,
            ref_kmers_nodups,
            ref_indel_kmers,
            mut ref_surrounding_kmers,
            ref_kmers_data,
        ) = build_kmers_refalt(
            lines[0].to_string(),
            kmer_length_iter,
            left_most_pos,
            variant_pos,
            variant_pos + ref_length,
            weight_indel,
            weight_no_indel,
            ref_length,
            surrounding_region_length,
        );

        //console::log_1(&"Alt kmers:".into());
        #[allow(unused_variables)]
        let (
            alt_kmers_weight,
            alt_kmers_nodups,
            alt_indel_kmers,
            mut alt_surrounding_kmers,
            alt_kmers_data,
        ) = build_kmers_refalt(
            lines[1].to_string(),
            kmer_length_iter,
            left_most_pos,
            variant_pos,
            variant_pos + alt_length,
            weight_indel,
            weight_no_indel,
            alt_length,
            surrounding_region_length,
        );

        // Check if there are any common kmers between indel region and surrounding region (true in case of repetitive regions)
        let matching_ref: usize = ref_surrounding_kmers
            .iter()
            .zip(&ref_indel_kmers)
            .filter(|&(a, b)| a == b)
            .count();
        let matching_alt: usize = alt_surrounding_kmers
            .iter()
            .zip(&alt_indel_kmers)
            .filter(|&(a, b)| a == b)
            .count();
        let old_ref_surrounding_length = ref_surrounding_kmers.len();
        ref_surrounding_kmers.sort();
        ref_surrounding_kmers.dedup();
        let new_ref_surrounding_length = ref_surrounding_kmers.len();

        let old_alt_surrounding_length = alt_surrounding_kmers.len();
        alt_surrounding_kmers.sort();
        alt_surrounding_kmers.dedup();
        let new_alt_surrounding_length = alt_surrounding_kmers.len();

        if matching_ref != 0
            || matching_alt != 0
            || old_ref_surrounding_length != new_ref_surrounding_length
            || old_alt_surrounding_length != new_alt_surrounding_length
        {
            kmer_length_iter += 1;
            found_duplicate_kmers = 1;
        } else {
            uniq_kmers = 1;
        }
    }
    println!("Final kmer length (from Rust):{:?}", kmer_length_iter);
    println!(
        "Found duplicate kmers status (from Rust):{:?}",
        found_duplicate_kmers
    );

    #[allow(unused_variables)]
    let (
        ref_kmers_weight,
        ref_kmers_nodups,
        mut ref_indel_kmers,
        ref_surrounding_kmers,
        ref_kmers_data,
    ) = build_kmers_refalt(
        lines[0].to_string(),
        kmer_length_iter,
        left_most_pos,
        variant_pos,
        variant_pos + ref_length,
        weight_indel,
        weight_no_indel,
        ref_length,
        surrounding_region_length,
    );

    ref_indel_kmers.sort();
    ref_indel_kmers.dedup();
    //for kmer in &ref_indel_kmers {
    //  println!("Indel kmer:{}", kmer);
    //}

    #[allow(unused_variables)]
    let (
        alt_kmers_weight,
        alt_kmers_nodups,
        mut alt_indel_kmers,
        alt_surrounding_kmers,
        alt_kmers_data,
    ) = build_kmers_refalt(
        lines[1].to_string(),
        kmer_length_iter,
        left_most_pos,
        variant_pos,
        variant_pos + alt_length,
        weight_indel,
        weight_no_indel,
        alt_length,
        surrounding_region_length,
    );

    alt_indel_kmers.sort();
    alt_indel_kmers.dedup();
    //for kmer in &alt_indel_kmers {
    //  println!(&"Indel kmer:{}", kmer);
    //}

    let mut kmer_diff_scores = Vec::<f64>::new();
    let mut alt_comparisons = Vec::<f64>::new();
    let mut ref_comparisons = Vec::<f64>::new();
    let mut ref_scores = Vec::<read_diff_scores>::new();
    let mut alt_scores = Vec::<read_diff_scores>::new();
    let mut i: i64 = 0;
    //let num_of_reads: f64 = (lines.len() - 2) as f64;
    let mut ref_polyclonal_status = Vec::<i64>::new();
    let mut ref_read_sequences = Vec::<String>::new();
    let mut alt_read_sequences = Vec::<String>::new();
    let mut all_read_sequences = Vec::<String>::new();
    //let mut ref_polyclonal_read_status: i64 = 0;
    //let mut alt_polyclonal_read_status: i64 = 0;
    let mut alt_polyclonal_status = Vec::<i64>::new();
    println!(
        "{}{}",
        "Number of reads (from Rust):",
        (lines.len() - 2).to_string()
    );
    for read in lines {
        // Will multithread this loop in the future
        if i >= 2 && read.len() > 0 {
            // The first two sequences are reference and alternate allele and therefore skipped. Also checking there are no blank lines in the input file
            let (ref_polyclonal_read_status, alt_polyclonal_read_status, ref_insertion) =
                check_polyclonal(
                    read.to_string(),
                    start_positions_list[i as usize - 2].parse::<i64>().unwrap() - 1,
                    cigar_sequences_list[i as usize - 2].to_string(),
                    variant_pos,
                    &ref_nucleotides,
                    &alt_nucleotides,
                    ref_length as usize,
                    alt_length as usize,
                    indel_length as usize,
                    0,
                );
            //let (kmers,ref_polyclonal_read_status,alt_polyclonal_read_status) = build_kmers_reads(read.to_string(), kmer_length, corrected_start_positions_list[i as usize -2] - 1, variant_pos, &ref_indel_kmers, &alt_indel_kmers, ref_length, alt_length);
            let kmers = build_kmers(read.to_string(), kmer_length_iter);
            //println!("kmers:{}",kmers.len());
            let ref_comparison = jaccard_similarity_weights(
                &kmers,
                &ref_kmers_nodups,
                &ref_kmers_data,
                ref_kmers_weight,
            );
            let alt_comparison = jaccard_similarity_weights(
                &kmers,
                &alt_kmers_nodups,
                &alt_kmers_data,
                alt_kmers_weight,
            );
            let diff_score: f64 = alt_comparison - ref_comparison; // Is the read more similar to reference sequence or alternate sequence
            kmer_diff_scores.push(diff_score);
            ref_comparisons.push(ref_comparison);
            alt_comparisons.push(alt_comparison);

            let item = read_diff_scores {
                value: f64::from(diff_score),
                groupID: usize::from(i as usize - 2), // The -2 has been added since the first two sequences in the file are reference and alternate
                polyclonal: i64::from(ref_polyclonal_read_status + alt_polyclonal_read_status),
                ref_insertion: i64::from(ref_insertion),
            };
            if diff_score > 0.0 {
                alt_scores.push(item);
                alt_polyclonal_status.push(ref_polyclonal_read_status + alt_polyclonal_read_status);
                alt_read_sequences.push(read.to_string());
            } else if diff_score <= 0.0 {
                ref_scores.push(item);
                ref_polyclonal_status.push(ref_polyclonal_read_status + alt_polyclonal_read_status);
                ref_read_sequences.push(read.to_string());
            }
            all_read_sequences.push(read.to_string());
        }
        i += 1;
    }

    let mut ref_indices = Vec::<read_category>::new();
    if ref_scores.len() > 0 {
        //ref_indices = determine_maxima_alt(&mut ref_scores, &(&threshold_slope*num_of_reads));
        ref_indices = determine_maxima_alt(&mut ref_scores, &threshold_slope);
    }

    let mut alt_indices = Vec::<read_category>::new();
    if alt_scores.len() > 0 {
        //alt_indices = determine_maxima_alt(&mut alt_scores, &(&threshold_slope*num_of_reads));
        alt_indices = determine_maxima_alt(&mut alt_scores, &threshold_slope);
    }

    let mut output_cat: String = "".to_string();
    #[allow(non_snake_case)]
    let mut output_gID: String = "".to_string();
    //let mut output_cat = Vec::<String>::new();
    //let mut output_gID = Vec::<usize>::new();
    let mut output_diff_scores: String = "".to_string();
    for item in &ref_indices {
        if item.ref_insertion == 1 {
            //output_cat.push("none".to_string());
            output_cat.push_str("none:");
        } else if item.category == "refalt".to_string() {
            //output_cat.push("ref".to_string());
            output_cat.push_str("ref:");
        } else {
            //output_cat.push("none".to_string());
            output_cat.push_str("none:");
        }
        //output_gID.push(item.groupID);
        output_gID.push_str(&item.groupID.to_string());
        output_gID.push_str(&":".to_string());
        output_diff_scores.push_str(&item.diff_score.to_string());
        output_diff_scores.push_str(&":".to_string());
    }

    for item in &alt_indices {
        if item.category == "refalt".to_string() {
            //output_cat.push("alt".to_string());
            output_cat.push_str("alt:");
        } else {
            //output_cat.push("none".to_string());
            output_cat.push_str("none:");
        }

        output_gID.push_str(&item.groupID.to_string());
        output_gID.push_str(&":".to_string());
        output_diff_scores.push_str(&item.diff_score.to_string());
        output_diff_scores.push_str(&":".to_string());
    }
    output_cat.pop();
    output_gID.pop();
    output_diff_scores.pop();
    println!("output_cat:{:?}", output_cat);
    println!("output_gID:{:?}", output_gID);
    println!("output_diff_scores:{:?}", output_diff_scores);
}

fn build_kmers_refalt(
    sequence: String,
    kmer_length: i64,
    left_most_pos: i64,
    indel_start: i64,
    indel_stop: i64,
    weight_indel: f64,
    weight_no_indel: f64,
    indel_length: i64,
    surrounding_region_length: i64,
) -> (f64, Vec<String>, Vec<String>, Vec<String>, Vec<kmer_data>) {
    let num_iterations = sequence.len() as i64 - kmer_length + 1;
    let sequence_vector: Vec<_> = sequence.chars().collect();
    let mut kmers = Vec::<kmer_input>::new();
    let mut indel_kmers = Vec::<String>::new();
    let mut surrounding_indel_kmers = Vec::<String>::new();
    let mut kmers_nodup = Vec::<String>::new();
    let mut kmer_start = left_most_pos;
    let mut kmer_stop = kmer_start + kmer_length;
    let mut kmer_start_poly = left_most_pos - 1;
    let mut kmer_stop_poly = kmer_start_poly + kmer_length;
    for i in 0..num_iterations {
        let mut subseq = String::new();
        let mut subseq2 = String::new();
        let mut j = i as usize;
        for _k in 0..kmer_length {
            subseq += &sequence_vector[j].to_string();
            subseq2 += &sequence_vector[j].to_string();
            j += 1;
        }

        if (indel_start <= kmer_start_poly && kmer_stop_poly <= indel_start + indel_length)
            || (kmer_start_poly <= indel_start && indel_start + indel_length <= kmer_stop_poly)
        {
            // (indel_start+1 >= kmer_start && kmer_stop >= indel_start + indel_length)
            indel_kmers.push(subseq.to_owned());
        } else if indel_start - surrounding_region_length <= kmer_start_poly
            && kmer_stop_poly <= indel_start + indel_length + surrounding_region_length
        {
            surrounding_indel_kmers.push(subseq.to_owned());
        }

        let mut kmer_score: f64 = 0.0;
        for _k in kmer_start..kmer_stop {
            if indel_start <= (_k as i64) && (_k as i64) < indel_stop {
                // Determining if nucleotide is within indel or not
                kmer_score += weight_indel;
            } else {
                kmer_score += weight_no_indel;
            }
        }
        kmers_nodup.push(subseq.to_owned());
        let kmer_weight = kmer_input {
            kmer_sequence: String::from(subseq.to_owned()),
            kmer_weight: f64::from(kmer_score),
        };
        kmers.push(kmer_weight);
        kmer_start += 1;
        kmer_stop += 1;
        kmer_start_poly += 1;
        kmer_stop_poly += 1;
    }
    //println!("Number of kmers before:{}", kmers_nodup.len());
    // Getting unique kmers
    kmers_nodup.sort();
    kmers_nodup.dedup();
    //println!("Number of kmers after:{}", kmers_nodup.len());

    //println!("Total number of kmers:{}",kmers.len());

    let mut kmers_data = Vec::<kmer_data>::new();
    let mut total_kmers_weight: f64 = 0.0;
    for kmer1 in &kmers_nodup {
        let mut kmer_values = Vec::<f64>::new();
        let mut kmer_count = 0;
        for kmer2 in &kmers {
            if kmer1.to_owned() == kmer2.kmer_sequence {
                kmer_values.push(kmer2.kmer_weight);
                kmer_count += 1;
            }
        }

        let sum: f64 = kmer_values.iter().sum();
        //println!("i:{}", i);
        //println!("kmer:{}", kmer_weight.kmer_sequence);
        total_kmers_weight += (kmer_count as f64) * (sum as f64 / kmer_values.len() as f64);
        let kmer_weight: f64 = sum as f64 / kmer_values.len() as f64; // Calculating mean
        let kmer_data_struct = kmer_data {
            kmer_count: i64::from(kmer_count),
            kmer_weight: f64::from(kmer_weight),
        };
        kmers_data.push(kmer_data_struct);
    }

    //let mut kmers_unique = Vec::<String>::new();
    //let mut kmers_repeat = Vec::<String>::new();
    //for kmer1 in kmers {
    //	for kmer2 in &kmers2 {
    //        if kmer1.kmer_sequence==kmer2.kmer_sequence {
    //	      let kmer_weight = kmer_input{
    //	         kmer_sequence:String::from(kmer1.kmer_sequence),
    //	         kmer_weight:f64::from(kmer2.kmer_weight)
    //	      };
    //
    //	      kmers3.push(kmer_weight);
    //	      break;
    //        }
    //	}
    //}
    (
        total_kmers_weight,
        kmers_nodup,
        indel_kmers,
        surrounding_indel_kmers,
        kmers_data,
    )
}

fn check_polyclonal(
    sequence: String,
    left_most_pos: i64,
    cigar_sequence: String,
    indel_start: i64,
    ref_nucleotides: &Vec<char>,
    alt_nucleotides: &Vec<char>,
    ref_length: usize,
    alt_length: usize,
    indel_length: usize,
    found_duplicate_kmers: usize,
) -> (i64, i64, i64) {
    let sequence_vector: Vec<_> = sequence.chars().collect();
    //let mut kmer_start_poly = left_most_pos+1;
    //let mut kmer_stop_poly = kmer_start_poly + kmer_length;
    let mut ref_polyclonal_status: i64 = 0;
    let mut alt_polyclonal_status: i64 = 0;
    let mut correct_start_position: i64 = left_most_pos;

    let (alphabets, numbers) = parse_cigar(&cigar_sequence.to_string());
    //println!("cigar:{}", &cigar_sequence);
    // Check to see if the first item in cigar is a soft clip
    if &alphabets[0].to_string().as_str() == &"S" {
        correct_start_position =
            correct_start_position - numbers[0].to_string().parse::<i64>().unwrap();
    }
    // Looking for insertions and deletions in cigar sequence
    let mut read_indel_start: usize = (indel_start - correct_start_position) as usize;
    let mut parse_position: usize = 0;
    let mut ref_insertion: i64 = 0; // Keep tab whether there is an insertion within the ref allele
    let mut old_parse_position: usize = 0;
    let mut indel_insertion_starts = Vec::<usize>::new();
    let mut indel_insertion_stops = Vec::<usize>::new();
    for i in 0..alphabets.len() {
        //println!("parse_position:{}",parse_position);
        //println!("read_indel_start:{}", read_indel_start);
        if parse_position < read_indel_start {
            parse_position += numbers[i].to_string().parse::<usize>().unwrap();
            if &alphabets[i].to_string().as_str() == &"I" {
                read_indel_start += numbers[i].to_string().parse::<usize>().unwrap();
                //println!("read_indel_start:{}", read_indel_start);
                //println!("read_indel_start+indel_length:{}", (read_indel_start + indel_length));
                //println!("old_parse_position:{}", old_parse_position);
                //println!("parse_position:{}", parse_position);
                if read_indel_start <= old_parse_position
                    && parse_position <= read_indel_start + indel_length
                {
                    // Making sure the insertion is within the indel region
                    indel_insertion_starts.push(old_parse_position);
                    indel_insertion_stops.push(parse_position);
                    ref_insertion = 1;
                } else if old_parse_position <= read_indel_start
                    && read_indel_start + indel_length <= parse_position
                {
                    // Making sure the insertion is within the indel region
                    indel_insertion_starts.push(old_parse_position);
                    indel_insertion_stops.push(parse_position);
                    ref_insertion = 1;
                } else if old_parse_position <= read_indel_start
                    && parse_position <= read_indel_start + indel_length
                    && found_duplicate_kmers == 0
                {
                    // Making sure part of the insertion is within the indel region
                    //indel_insertion_starts.push(old_parse_position);
                    //indel_insertion_stops.push(parse_position);
                    ref_insertion = 1;
                } else if read_indel_start <= old_parse_position
                    && read_indel_start + indel_length <= parse_position
                    && found_duplicate_kmers == 0
                {
                    // Making sure part of the insertion is within the indel region
                    //indel_insertion_starts.push(old_parse_position);
                    //indel_insertion_stops.push(parse_position);
                    ref_insertion = 1;
                }
            } else if &alphabets[i].to_string().as_str() == &"D" {
                read_indel_start -= numbers[i].to_string().parse::<usize>().unwrap();
                if read_indel_start <= old_parse_position
                    && parse_position <= read_indel_start + indel_length
                {
                    // Making sure the insertion is within the indel region
                    ref_insertion = 1;
                } else if old_parse_position <= read_indel_start
                    && read_indel_start + indel_length <= parse_position
                {
                    // Making sure the insertion is within the indel region
                    ref_insertion = 1;
                } else if old_parse_position <= read_indel_start
                    && parse_position <= read_indel_start + indel_length
                    && found_duplicate_kmers == 0
                {
                    // Making sure part of the insertion is within the indel region
                    ref_insertion = 1;
                } else if read_indel_start <= old_parse_position
                    && read_indel_start + indel_length <= parse_position
                    && found_duplicate_kmers == 0
                {
                    // Making sure part of the insertion is within the indel region
                    ref_insertion = 1;
                }
            }
            old_parse_position = parse_position;
        } else if parse_position >= read_indel_start
            && (&alphabets[i].to_string().as_str() == &"I"
                || &alphabets[i].to_string().as_str() == &"D")
        {
            parse_position += numbers[i].to_string().parse::<usize>().unwrap();
            //if () {
            if read_indel_start <= old_parse_position
                && parse_position <= read_indel_start + indel_length
            {
                // Making sure the insertion is within the indel region
                //indel_insertion_starts.push(old_parse_position);
                //indel_insertion_stops.push(parse_position);
                ref_insertion = 1;
            } else if old_parse_position <= read_indel_start
                && read_indel_start + indel_length <= parse_position
            {
                // Making sure the insertion is within the indel region
                //indel_insertion_starts.push(old_parse_position);
                //indel_insertion_stops.push(parse_position);
                ref_insertion = 1;
            } else if old_parse_position <= read_indel_start
                && parse_position <= read_indel_start + indel_length
                && found_duplicate_kmers == 0
            {
                // Making sure part of the insertion is within the indel region
                //indel_insertion_starts.push(old_parse_position);
                //indel_insertion_stops.push(parse_position);
                ref_insertion = 1;
            } else if read_indel_start <= old_parse_position
                && read_indel_start + indel_length <= parse_position
                && found_duplicate_kmers == 0
            {
                // Making sure part of the insertion is within the indel region
                //indel_insertion_starts.push(old_parse_position);
                //indel_insertion_stops.push(parse_position);
                ref_insertion = 1;
            }
            //}
            old_parse_position = parse_position;
        } else {
            break;
        }
    }

    // Checking to see if nucleotides are same between read and ref/alt allele

    //println!("cigar:{}",cigar_sequence);
    for i in 0..ref_length as usize {
        if read_indel_start + i < sequence.len() {
            //println!("Ref sequence:{}", ref_nucleotides[i]);
            //println!("Ref position:{}", (read_indel_start + i));
            //println!("Ref read:{}", sequence_vector[read_indel_start + i]);
            if &ref_nucleotides[i] != &sequence_vector[read_indel_start + i] {
                ref_polyclonal_status = 1;
                break;
            }
        } else {
            break;
        }
    }

    for i in 0..alt_length as usize {
        if read_indel_start + i < sequence.len() {
            //println!("i:{}", i);
            //println!("Alt sequence:{}", alt_nucleotides[i]);
            //println!("Alt position:{}", (read_indel_start + i));
            //println!("Alt read:{}", sequence_vector[read_indel_start + i]);
            if &alt_nucleotides[i] != &sequence_vector[read_indel_start + i] {
                alt_polyclonal_status = 1;
                break;
            }
        } else {
            break;
        }
    }
    //println!("ref_polyclonal_status:{}", ref_polyclonal_status);
    //println!("alt_polyclonal_status:{}", alt_polyclonal_status);

    if indel_insertion_starts.len() > 0 {
        for i in 0..indel_insertion_starts.len() {
            let insertion_start: usize = indel_insertion_starts[i];
            let insertion_stop: usize = indel_insertion_stops[i];
            for j in (insertion_start - 1)..insertion_stop {
                let k: usize = j - insertion_start + 1;
                if k < indel_length && k < alt_nucleotides.len() {
                    //println!("sequence len:{}", sequence.len());
                    //println!("read_indel_start:{}", read_indel_start);
                    //println!("j:{}", j);
                    //println!("k:{}", k);
                    //println!("indel_length:{}", indel_length);
                    //println!("alt_nucleotides[k]:{}", alt_nucleotides[k]);
                    //println!("sequence_vector[j]:{}", sequence_vector[j]);
                    if (&alt_nucleotides[k] != &sequence_vector[j])
                        && ((read_indel_start as usize) <= j)
                        && (j <= (read_indel_start as usize) + indel_length)
                    {
                        alt_polyclonal_status = 2;
                        ref_polyclonal_status = 0;
                        break;
                    }
                }
            }
        }
    }
    (ref_polyclonal_status, alt_polyclonal_status, ref_insertion)
}

#[allow(dead_code)]
fn build_kmers_reads(
    sequence: String,
    kmer_length: i64,
    left_most_pos: i64,
    indel_start: i64,
    ref_indel_kmers: &Vec<String>,
    alt_indel_kmers: &Vec<String>,
    ref_length: i64,
    alt_length: i64,
) -> (Vec<String>, i64, i64) {
    let num_iterations = sequence.len() as i64 - kmer_length + 1;
    let sequence_vector: Vec<_> = sequence.chars().collect();
    let mut kmers = Vec::<String>::new();
    #[allow(unused_variables)]
    let mut kmer_start = left_most_pos;
    let mut kmer_start_poly = left_most_pos + 1;
    let mut kmer_stop_poly = kmer_start_poly + kmer_length;
    let mut ref_polyclonal_status: i64 = 0;
    let mut alt_polyclonal_status: i64 = 0;
    kmers.reserve(200);
    for i in 0..num_iterations {
        let mut subseq = String::new();
        //let mut subseq2 = String::new();
        let mut j = i as usize;
        for _k in 0..kmer_length {
            subseq += &sequence_vector[j].to_string();
            //subseq2+=&sequence_vector[j].to_string();
            j += 1;
        }
        if (indel_start < kmer_start_poly && kmer_stop_poly <= indel_start + ref_length)
            || (indel_start >= kmer_start_poly && kmer_stop_poly > indel_start + ref_length)
        {
            // Checking to see if there are any kmers which support neither reference nor alternate allele
            let mut index: i64 = binary_search(ref_indel_kmers, &subseq);
            if index == -1 as i64 {
                ref_polyclonal_status = 1 as i64;
                // Comparison with alt allele is only done when a kmer is found with no match to ref allele
                if (indel_start < kmer_start_poly && kmer_stop_poly <= indel_start + alt_length)
                    || (indel_start >= kmer_start_poly && kmer_stop_poly > indel_start + alt_length)
                {
                    index = binary_search(alt_indel_kmers, &subseq);
                    if index == -1 as i64 {
                        alt_polyclonal_status = 1 as i64;
                    }
                }
            }
        }
        kmers.push(subseq);
        kmer_start += 1;
        kmer_start_poly += 1;
        kmer_stop_poly += 1;
    }
    kmers.shrink_to_fit();
    (kmers, ref_polyclonal_status, alt_polyclonal_status)
    //(kmers, 0 as i64, 0 as i64)
}

// Multithread this function in the future
fn build_kmers(sequence: String, kmer_length: i64) -> Vec<String> {
    //println!("sequence:{}", sequence);
    let sequence_vector: Vec<_> = sequence.chars().collect();
    let num_iterations = sequence.len() as i64 - kmer_length + 1;
    let mut kmers = Vec::<String>::new();
    kmers.reserve(200);
    for i in 0..num_iterations {
        //println!("{}", i);
        let mut subseq = String::new();
        let mut j = i as usize;
        for _k in 0..kmer_length {
            subseq += &sequence_vector[j].to_string();
            j += 1;
        }
        kmers.push(subseq);
        //println!("subseq:{}", subseq);
    }
    kmers.shrink_to_fit();
    //println!("kmers:{}",kmers[10]);
    kmers
}

fn jaccard_similarity_weights(
    kmers1: &Vec<String>,
    kmers2_nodups: &Vec<String>,
    kmers2_data: &Vec<kmer_data>,
    kmers2_weight: f64,
) -> f64 {
    // Getting unique read kmers
    let mut kmers1_nodup = kmers1.clone();
    kmers1_nodup.sort();
    let kmers1_sorted = kmers1_nodup.clone();
    kmers1_nodup.dedup();

    // Finding common kmers between read and ref/alt
    let mut intersection = HashSet::new();
    //let mut intersection = kmers1_nodup.clone();

    //println!("Length of kmers1_nodup:{}",kmers1_nodup.len());
    //println!("Length of kmer2_seq_values_nodups:{}",kmer2_seq_values_nodups.len());

    for kmer in &kmers1_nodup {
        intersection.insert(kmer);
    }

    for kmer in kmers2_nodups {
        intersection.insert(kmer);
    }

    //println!("Length of intersection:{}",intersection.len());

    let mut kmer1_counts = Vec::<i64>::new();
    kmer1_counts.reserve(250);
    let mut kmers1_weight: f64 = 0.0;

    let mut index;
    for kmer1 in &kmers1_nodup {
        let kmer_count;
        let score;
        kmer_count = binary_search_repeat(&kmers1_sorted, &kmer1).len() as i64;
        //for kmer2 in &kmers1_sorted { // Binary search should not be used here since it cannot handle duplicate entries
        //    if kmer1==kmer2 {
        //	kmer_count+=1;
        //    }
        //}
        //println!(&kmer1.into());
        //if (binary_search(&kmers1,&kmer1) != -1 as i64) {
        //  kmer_count+=1;
        //}

        index = binary_search(&kmers2_nodups, &kmer1);
        #[allow(unused_assignments)]
        if index == -1 as i64 {
            score = 0.0;
        } else {
            //if (kmer1!=&kmers2_nodups[index as usize].to_string()) {
            //    println!(&"Incorrect binary_search (1st):".into(), &kmer1.to_string().into(),&kmers2_nodups[index as usize].to_string().into());
            //}
            score = kmers2_data[index as usize].kmer_weight;
            kmers1_weight += (kmer_count as f64) * score;
        }
        kmer1_counts.push(kmer_count);
    }
    kmer1_counts.shrink_to_fit();
    //println!("kmers1_weight:{}",kmers1_weight);

    let mut intersection_weight: f64 = 0.0;
    for kmer1 in intersection {
        let score;
        let mut kmer1_freq: i64 = 0;
        let mut kmer2_freq: i64 = 0;
        //for kmer2 in kmers2_nodups {
        //    if kmer1==&kmer2.kmer_sequence {
        //	score=kmer2.kmer_weight;
        //	kmer2_freq=kmer2_counts[j];
        //	continue;
        //    }
        //    j+=1;
        //}
        //println!(&"Intersection kmer1:".into(),&kmer1.into());
        index = binary_search(&kmers2_nodups, &kmer1);
        if index != -1 as i64 {
            //if (kmer1!=&kmers2_nodups[index as usize].to_string()) {
            //    println!(&"Incorrect binary_search (2nd):".into(), &kmer1.to_string().into(),&kmers2_nodups[index as usize].to_string().into());
            //}
            score = kmers2_data[index as usize].kmer_weight;
            kmer2_freq = kmers2_data[index as usize].kmer_count;
        } else {
            score = 0.0;
        }
        //j=0;
        //for kmer2 in &kmers1_nodup {
        //    if kmer1==kmer2 {
        //	kmer1_freq=kmer1_counts[j];
        //	continue;
        //    }
        //    j+=1;
        //}
        //println!(&"Intersection kmer2:".into(),&kmer1.into());
        index = binary_search(&kmers1_nodup, &kmer1);
        //println!(&"Index:".into(),&index.to_string().into());
        if index != -1 as i64 {
            //if (kmer1!=&kmers1_nodup[index as usize].to_string()) {
            //   println!(&"Incorrect binary_search (3rd):".into(), &kmer1.to_string().into(),&kmers1_nodup[index as usize].to_string().into());
            //}
            kmer1_freq = kmer1_counts[index as usize];
        }
        if kmer1_freq <= kmer2_freq {
            intersection_weight += score * (kmer1_freq as f64);
        }
        if kmer1_freq > kmer2_freq {
            intersection_weight += score * (kmer2_freq as f64);
        }
    }
    intersection_weight / (kmers1_weight + kmers2_weight - intersection_weight) // Jaccard similarity
}

fn determine_maxima_alt(
    kmer_diff_scores: &mut Vec<read_diff_scores>,
    threshold_slope: &f64,
) -> Vec<read_category> {
    // Sorting kmer_diff_scores
    kmer_diff_scores.sort_by(|a, b| a.value.partial_cmp(&b.value).unwrap_or(Ordering::Equal));

    let mut kmer_diff_scores_sorted = Vec::<read_diff_scores>::new();
    for item in kmer_diff_scores {
        // Making multiple copyies of kmer_diff_scores for further use
        //println!("Value:{}",item.value);
        //println!("groupID:{}",item.groupID);
        let item2: read_diff_scores = read_diff_scores_owned(item);
        kmer_diff_scores_sorted.push(item2);
        //let item2:read_diff_scores = read_diff_scores_owned(item);
    }

    let kmer_diff_scores_length: usize = kmer_diff_scores_sorted.len();

    let mut start_point: usize = kmer_diff_scores_length - 1;
    let mut slope;
    let mut is_a_line = 1;
    let mut indices = Vec::<read_category>::new();
    let threshold_slope_clone: f64 = threshold_slope.to_owned();
    if kmer_diff_scores_length > 1 {
        for i in (1..kmer_diff_scores_length).rev() {
            slope =
                (&kmer_diff_scores_sorted[i - 1].value - &kmer_diff_scores_sorted[i].value).abs();
            if slope > threshold_slope_clone {
                start_point = i as usize;
                is_a_line = 0;
                break;
            }
        }
    } else {
        println!(
            "{}",
            "Number of reads too low to determine curvature of slope"
        );
    }
    if is_a_line == 1 {
        for i in 0..kmer_diff_scores_length {
            if kmer_diff_scores_sorted[i].polyclonal == 2 as i64 {
                let read_cat = read_category {
                    category: String::from("none"),
                    groupID: usize::from(kmer_diff_scores_sorted[i].groupID),
                    diff_score: f64::from(kmer_diff_scores_sorted[i].value),
                    ref_insertion: i64::from(kmer_diff_scores_sorted[i].ref_insertion),
                };
                indices.push(read_cat);
            } else {
                let read_cat = read_category {
                    category: String::from("refalt"),
                    groupID: usize::from(kmer_diff_scores_sorted[i].groupID),
                    diff_score: f64::from(kmer_diff_scores_sorted[i].value),
                    ref_insertion: i64::from(kmer_diff_scores_sorted[i].ref_insertion),
                };
                indices.push(read_cat);
            }
        }
    } else {
        println!("{} {}", "start_point:", start_point.to_string());
        let mut kmer_diff_scores_input = Vec::<read_diff_scores>::new();
        for i in 0..start_point {
            let item = read_diff_scores {
                value: f64::from(kmer_diff_scores_sorted[i].value),
                groupID: usize::from(i),
                polyclonal: i64::from(kmer_diff_scores_sorted[i].polyclonal),
                ref_insertion: i64::from(kmer_diff_scores_sorted[i].ref_insertion),
            };
            kmer_diff_scores_input.push(item);
        }

        let min_value = read_diff_scores {
            value: f64::from(kmer_diff_scores_sorted[0].value),
            groupID: usize::from(0 as usize),
            polyclonal: i64::from(kmer_diff_scores_sorted[0].polyclonal),
            ref_insertion: i64::from(kmer_diff_scores_sorted[0].ref_insertion),
        };

        let max_value = read_diff_scores {
            value: f64::from(kmer_diff_scores_sorted[start_point].value),
            groupID: usize::from(start_point),
            polyclonal: i64::from(kmer_diff_scores_sorted[start_point].polyclonal),
            ref_insertion: i64::from(kmer_diff_scores_sorted[start_point].ref_insertion),
        };

        let slope_of_line: f64 = (max_value.value - min_value.value)
            / (max_value.groupID as f64 - min_value.groupID as f64); // m=(y2-y1)/(x2-x1)
        let intercept_of_line: f64 = min_value.value - (min_value.groupID as f64) * slope_of_line; // c=y-m*x
        let mut distances_from_line;
        let mut array_maximum: f64 = 0.0;
        let mut index_array_maximum: usize = 0;

        for i in 0..kmer_diff_scores_input.len() {
            distances_from_line = (slope_of_line * kmer_diff_scores_input[i].groupID as f64
                - kmer_diff_scores_input[i].value
                + intercept_of_line)
                .abs()
                / (1.0 as f64 + slope_of_line * slope_of_line).sqrt(); // distance of a point from line  = abs(a*x+b*y+c)/sqrt(a^2+b^2)
            if array_maximum < distances_from_line {
                array_maximum = distances_from_line;
                index_array_maximum = i;
            }
        }
        let score_cutoff: f64 = kmer_diff_scores_sorted[index_array_maximum].value;
        println!(
            "{} {}",
            "score_cutoff (from Rust):",
            score_cutoff.to_string()
        );
        for i in 0..kmer_diff_scores_length {
            if score_cutoff >= kmer_diff_scores_sorted[i].value {
                let read_cat = read_category {
                    category: String::from("none"),
                    groupID: usize::from(kmer_diff_scores_sorted[i].groupID),
                    diff_score: f64::from(kmer_diff_scores_sorted[i].value),
                    ref_insertion: i64::from(kmer_diff_scores_sorted[i].ref_insertion),
                };
                indices.push(read_cat);
            } else {
                if kmer_diff_scores_sorted[i].polyclonal == 2 as i64 {
                    let read_cat = read_category {
                        category: String::from("none"),
                        groupID: usize::from(kmer_diff_scores_sorted[i].groupID),
                        diff_score: f64::from(kmer_diff_scores_sorted[i].value),
                        ref_insertion: i64::from(kmer_diff_scores_sorted[i].ref_insertion),
                    };
                    indices.push(read_cat);
                } else {
                    let read_cat = read_category {
                        category: String::from("refalt"),
                        groupID: usize::from(kmer_diff_scores_sorted[i].groupID),
                        diff_score: f64::from(kmer_diff_scores_sorted[i].value),
                        ref_insertion: i64::from(kmer_diff_scores_sorted[i].ref_insertion),
                    };
                    indices.push(read_cat);
                }
            }
        }
    }
    indices
}
