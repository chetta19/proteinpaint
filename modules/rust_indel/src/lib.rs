// Syntax for testing wasm implementation: cd .. && wasm-pack build --target nodejs && time node pkg/wasmtest.js
// Passing vector using webassembly: https://stackoverflow.com/questions/50220966/how-to-use-vectors-of-c-stl-with-webassembly

use wasm_bindgen::prelude::*;
use wasm_bindgen::JsValue;
use serde::{Serialize, Deserialize};
use std::cmp::Ordering;
use std::collections::HashSet;
use web_sys::console;


pub struct read_diff_scores {
   groupID:usize,
   value:f64
}

struct kmer_input {
   kmer_sequence:String,
   kmer_weight:f64
}

struct kmer_data {
   kmer_count:i64,
   kmer_weight:f64
}

struct read_category {
   category:String,
   groupID:usize
}

#[derive(Serialize, Deserialize)]
pub struct output_structure {
    category:Vec<String>,
    groupID:Vec<usize>,
    kmer_diff_scores:Vec<f64>	
}    

fn read_diff_scores_owned(item: &mut read_diff_scores) -> read_diff_scores {
    let val=item.value.to_owned();        
    let gID=item.groupID.to_owned();

    let read_val = read_diff_scores{
	    value:f64::from(val),
	    groupID:usize::from(gID)
    };	
    read_val	
}

fn binary_search(kmers: &Vec<String>, y: &String) -> i64 {
    let kmers_dup = &kmers[..];
    //let kmers_dup = kmers.clone();
    //let x:String = y.to_owned();
    //println!("Search string:{}",&x);
    let mut index: i64 = -1;    
    let mut l:usize = 0;
    let mut r:usize = kmers_dup.len()-1;
    let mut m:usize = 0;
    //console::log_2(&"r:".into(),&r.to_string().into());
    //let mut n:usize = 0;
    while (l <= r) {
        m = l + ((r-l)/2);
	//if (m>=kmers_dup.len()){
        //  n=kmers_dup.len()-1;
	//}
	//else {
         // n=m;
	//}
	//console::log_2(&"kmers_dup[m]:".into(),&kmers_dup[m].to_string().into());
	//console::log_6(&"l:".to_string().into(), &l.to_string().into(),&"m:".to_string().into(), &m.to_string().into(),&"r:".to_string().into(), &r.to_string().into());
	//println!("l:{},m:{},r:{}",l,m,r);
	// Check if x is present at mid
	if (y == &kmers_dup[m]) {
	    index = m as i64;
            break;
	}
        //else if m==0 as usize {break;}
	
	// If x is greater, ignore left half
	else if (y > &kmers_dup[m]) {
	    //console::log_2(&"l:".into(),&l.to_string().into());
	    l = m + 1;
	} 
	// If x is smaller, ignore right half 
	else {
	    //console::log_2(&"r:".into(),&r.to_string().into());
	    if m == 0 as usize {
              break;
            } 			    
	    r=m-1;
	}
	//if r==0 as usize {break;}
	//console::log_2(&"r:".into(),&r.to_string().into());
    }
    //console::log_2(&"index:".into(), &index.to_string().into());
    index    
}

fn binary_search_repeat(kmers: &Vec<String>, y: &String) -> Vec<usize> {
    let orig_index: i64 = binary_search(kmers,y);
    let mut kmer_count: usize = 0;
    let mut indexes_vec = Vec::<usize>::new();
    let x:String = y.to_owned();
    if orig_index != -1 as i64 {
	indexes_vec.push(orig_index as usize);
	let mut index: usize = orig_index as usize;
	while (index > 0) {
            if (kmers[index-1]==x) {
		index=index-1;
		indexes_vec.push(index);
	    }
	    else {
                break; 
            }	    
	}
	index=orig_index as usize;
	while (index < (kmers.len() - 1)) {
            if (kmers[index+1]==x) {
		index=index+1;
		indexes_vec.push(index);
	    }
	    else {
                break; 
            }            
	}    
    }
    indexes_vec
}

#[wasm_bindgen]
pub fn match_complex_variant_rust(sequences: String, variant_pos: i64, segbplen: i64, refallele: String, altallele: String, kmer_length: i64, weight_no_indel: f64, weight_indel: f64, threshold_slope: f64) -> JsValue {

    //console::log_1(&"Hello using web-sys".into());
    //console::log_2(&"segbplen:".into(), &segbplen.to_string().into());
    //console::log_2(&"sequences:".into(), &sequences.into());
    
    
    let lines: Vec<&str> = sequences.split("\n").collect();
    //let lines = lines.unwrap();    
    
    println!("{:?}", lines);
    println!("{}", lines[0]);

    let left_most_pos = variant_pos - segbplen;
    let ref_length: i64 = refallele.len() as i64;
    let alt_length: i64 = altallele.len() as i64;    
    
    let kmers = build_kmers(lines[0].to_string(), kmer_length);
    
    let (ref_kmers_weight, ref_kmers_nodups, ref_kmers_data) = build_kmers_refalt(
    		lines[0].to_string(),
    		kmer_length,
    		left_most_pos,
    		variant_pos,
    		variant_pos + ref_length,
    		weight_indel,
    		weight_no_indel
    );
    let mut iter_check: usize = 0;
    while (iter_check < ref_kmers_nodups.len()) {
	console::log_6(&"sequence:".into(), &ref_kmers_nodups[iter_check].to_string().into(), &"kmer_count:".into(), &ref_kmers_data[iter_check].kmer_count.to_string().into(),&"kmer_weight:".into(), &ref_kmers_data[iter_check].kmer_weight.to_string().into());
	iter_check+=1;
    }
    console::log_2(&"total_ref_weights:".into(), &ref_kmers_weight.to_string().into());
    
    let (alt_kmers_weight, alt_kmers_nodups, alt_kmers_data) = build_kmers_refalt(
    		lines[1].to_string(),
    		kmer_length,
    		left_most_pos,
    		variant_pos,
    		variant_pos + alt_length,
    		weight_indel,
    		weight_no_indel
    );
    
    let mut kmer_diff_scores = Vec::<f64>::new();
    let mut alt_comparisons = Vec::<f64>::new();    
    let mut ref_comparisons = Vec::<f64>::new();
    let mut ref_scores = Vec::<read_diff_scores>::new();
    let mut alt_scores = Vec::<read_diff_scores>::new();
    let mut i:i64 = 0;
    console::log_2(&"Number of reads (from Rust):".into(), &(lines.len()-2).to_string().into());
    for read in lines{ // Will multithread this loop in the future
    	if i >= 2 && read.len() > 0  { // The first two sequences are reference and alternate allele and therefore skipped. Also checking there are no blank lines in the input file
              let kmers = build_kmers(read.to_string(), kmer_length);
              //println!("kmers:{}",kmers.len());
              let ref_comparison=jaccard_similarity_weights(&kmers, &ref_kmers_nodups, &ref_kmers_data, ref_kmers_weight);
    	      let alt_comparison=jaccard_similarity_weights(&kmers, &alt_kmers_nodups, &alt_kmers_data, alt_kmers_weight);
    	      let diff_score: f64 = alt_comparison - ref_comparison; // Is the read more similar to reference sequence or alternate sequence
    	      kmer_diff_scores.push(diff_score);
    	      ref_comparisons.push(ref_comparison);
    	      alt_comparisons.push(alt_comparison);
    	      let item = read_diff_scores{
    	         value:f64::from(diff_score),
    	         groupID:usize::from(i as usize -2) // The -2 has been added since the first two sequences in the file are reference and alternate     
    	      };
    	      if diff_score > 0.0 {
    		alt_scores.push(item)
    	      } else if diff_score <= 0.0 {
    		ref_scores.push(item)
    	      }	    
    	}    
        i+=1;
    }	

    console::log_2(&"ref_scores length (from Rust):".into(), &ref_scores.len().to_string().into());
    console::log_2(&"alt_scores length (from Rust):".into(), &alt_scores.len().to_string().into());
    
    let mut ref_indices = Vec::<read_category>::new();    
    println!("Parsing ref scores");
    if ref_scores.len() > 0 {
      ref_indices = determine_maxima_alt(&mut ref_scores, &threshold_slope);
    }
    console::log_2(&"ref_indices length (from Rust):".into(), &ref_indices.len().to_string().into());
    
    let mut alt_indices = Vec::<read_category>::new();
    println!("Parsing alt scores");
    if alt_scores.len() > 0 {
      alt_indices = determine_maxima_alt(&mut alt_scores, &threshold_slope);
    }
    console::log_2(&"alt_indices length (from Rust):".into(), &alt_indices.len().to_string().into());
    
    let mut output_cat = Vec::<String>::new();
    let mut output_gID = Vec::<usize>::new();
    
    for item in ref_indices {
    	if item.category == "refalt".to_string() {
            output_cat.push("ref".to_string());		
        }
    	else {
            output_cat.push("none".to_string());
    	}    
        output_gID.push(item.groupID);	    
    }
    
    for item in alt_indices {
    	if item.category == "refalt".to_string() {
            output_cat.push("alt".to_string());		
        }
    	else {
            output_cat.push("none".to_string());
    	}    
        output_gID.push(item.groupID);	    
    }
    kmer_diff_scores.sort_by(|a, b| a.partial_cmp(&b).unwrap_or(Ordering::Equal));
    //println!("{}", output_cat[0]);
    //console::log_2(&"output_cat[0]:".into(), &output_cat[0].to_string().into());
    let item = output_structure{
    	category:output_cat,
    	groupID:output_gID,
	kmer_diff_scores:kmer_diff_scores
    };
    
    JsValue::from_serde(&item).unwrap()
}

fn build_kmers_refalt(sequence: String, kmer_length: i64,left_most_pos: i64, indel_start: i64,indel_stop: i64,weight_indel: f64, weight_no_indel: f64) -> (f64,Vec::<String>,Vec::<kmer_data>)
{
    let num_iterations = sequence.len() as i64 - kmer_length + 1;
    let sequence_vector: Vec<_> = sequence.chars().collect();    
    let mut kmers = Vec::<kmer_input>::new();  
    let mut kmers_nodup = Vec::<String>::new();
    let mut kmer_start = left_most_pos;
    let mut kmer_stop = kmer_start + kmer_length;
    for i in 0..num_iterations {
	#[derive(Copy, Clone)]
	let mut subseq = String::new();
	let mut j=i as usize;	
	for _k in 0..kmer_length {
            subseq+=&sequence_vector[j].to_string();
	    j+=1;
	}
	let mut kmer_score:f64 = 0.0;
	for _k in kmer_start..kmer_stop {
	    if indel_start <= (_k as i64) && (_k as i64) < indel_stop {
		// Determining if nucleotide is within indel or not
		kmer_score += weight_indel;
	    }
	    else {
		kmer_score += weight_no_indel;
	    }           
	}
	kmers_nodup.push(subseq.to_owned());
	let kmer_weight = kmer_input{
	    kmer_sequence:String::from(subseq.to_owned()),
	    kmer_weight:f64::from(kmer_score)
	};
	kmers.push(kmer_weight);	
	kmer_start+=1;
	kmer_stop+=1;
    }
    //println!("Number of kmers before:{}", kmers_nodup.len());
    // Getting unique kmers
    kmers_nodup.sort();
    kmers_nodup.dedup();
    //println!("Number of kmers after:{}", kmers_nodup.len());

    //println!("Total number of kmers:{}",kmers.len());
    
    let mut kmers_data = Vec::<kmer_data>::new();
    let mut total_kmers_weight:f64 = 0.0;
    for kmer1 in &kmers_nodup {
	let mut kmer_values = Vec::<f64>::new();
	let mut kmer_count = 0;
	for kmer2 in &kmers {
            if kmer1.to_owned()==kmer2.kmer_sequence {
		kmer_values.push(kmer2.kmer_weight);
		kmer_count+=1;
            } 		
	}
	
	let sum: f64 = kmer_values.iter().sum();
        //println!("i:{}", i);
        //println!("kmer:{}", kmer_weight.kmer_sequence);	
        total_kmers_weight += (kmer_count as f64)*(sum as f64 / kmer_values.len() as f64);	
	let kmer_weight:f64 = sum as f64 / kmer_values.len() as f64; // Calculating mean
	let kmer_data_struct = kmer_data{
	    kmer_count:i64::from(kmer_count),
	    kmer_weight:f64::from(kmer_weight)
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
    (total_kmers_weight,kmers_nodup,kmers_data)
}

// Multithread this function in the future
fn build_kmers(sequence: String, kmer_length: i64) -> Vec::<String>  {
    //println!("sequence:{}", sequence);
    let sequence_vector: Vec<_> = sequence.chars().collect();    
    let num_iterations = sequence.len() as i64 - kmer_length + 1;
    let mut kmers = Vec::<String>::new();
    for i in 0..num_iterations {
	//println!("{}", i);
	let mut subseq = String::new();
	let mut j=i as usize;
	for _k in 0..kmer_length {
            subseq+=&sequence_vector[j].to_string();
	    j+=1;
	}
	kmers.push(subseq);
	//println!("subseq:{}", subseq);
    }
    //println!("kmers:{}",kmers[10]);
    kmers
}

fn jaccard_similarity_weights(kmers1: &Vec<String>, kmers2_nodups: &Vec<String>, kmers2_data: &Vec<kmer_data>, kmers2_weight: f64) -> f64 {
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
    
    for kmer in &kmers1_nodup{
       intersection.insert(kmer);
    }
    
    for kmer in kmers2_nodups{
       intersection.insert(kmer);
    }	

    //println!("Length of intersection:{}",intersection.len());
 
    let mut kmer1_counts = Vec::<i64>::new();
    let mut kmers1_weight: f64 = 0.0;
    let mut index: i64 = 0;
    for kmer1 in &kmers1_nodup {
	let mut kmer_count: i64 = 0;
	let mut score: f64 = 0.0;
	kmer_count=binary_search_repeat(&kmers1_sorted,&kmer1).len() as i64;
	//for kmer2 in &kmers1_sorted { // Binary search should not be used here since it cannot handle duplicate entries
        //    if kmer1==kmer2 {
	//	kmer_count+=1;
        //    } 	
	//}
	//console::log_1(&kmer1.into());
	//if (binary_search(&kmers1,&kmer1) != -1 as i64) {
        //  kmer_count+=1;
	//}    

	index=binary_search(&kmers2_nodups,&kmer1);
	if index == -1 as i64 {
          score=0.0;
	}
	else {
	  //if (kmer1!=&kmers2_nodups[index as usize].to_string()) {
          //    console::log_3(&"Incorrect binary_search (1st):".into(), &kmer1.to_string().into(),&kmers2_nodups[index as usize].to_string().into());
          //}		
	  score=kmers2_data[index as usize].kmer_weight;
	  kmers1_weight += (kmer_count as f64)*score;
	}    
	kmer1_counts.push(kmer_count);	
    }
    //println!("kmers1_weight:{}",kmers1_weight);
    
    let mut intersection_weight: f64 = 0.0;
    for kmer1 in intersection {
	let mut score: f64 = 0.0;
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
        //console::log_2(&"Intersection kmer1:".into(),&kmer1.into());
        index=binary_search(&kmers2_nodups,&kmer1);
	if index != -1 as i64 {
	  //if (kmer1!=&kmers2_nodups[index as usize].to_string()) {
          //    console::log_3(&"Incorrect binary_search (2nd):".into(), &kmer1.to_string().into(),&kmers2_nodups[index as usize].to_string().into());
          //}  
	  score=kmers2_data[index as usize].kmer_weight;
	  kmer2_freq=kmers2_data[index as usize].kmer_count;
	}
	else {
          score=0.0;
	}    
	//j=0;
	//for kmer2 in &kmers1_nodup {
        //    if kmer1==kmer2 {
	//	kmer1_freq=kmer1_counts[j];
	//	continue;
        //    }
	//    j+=1;
	//}
	//console::log_2(&"Intersection kmer2:".into(),&kmer1.into());	
        index=binary_search(&kmers1_nodup,&kmer1);
	//console::log_2(&"Index:".into(),&index.to_string().into());
	if index != -1 as i64 {
	   //if (kmer1!=&kmers1_nodup[index as usize].to_string()) {
           //   console::log_3(&"Incorrect binary_search (3rd):".into(), &kmer1.to_string().into(),&kmers1_nodup[index as usize].to_string().into());
           //}		    
	   kmer1_freq=kmer1_counts[index as usize];
	}
	if kmer1_freq <= kmer2_freq {
          intersection_weight += score*(kmer1_freq as f64);
	}
	if kmer1_freq > kmer2_freq {
          intersection_weight += score*(kmer2_freq as f64);
	}    
    }
    intersection_weight / (kmers1_weight + kmers2_weight - intersection_weight) // Jaccard similarity
}

fn determine_maxima_alt(kmer_diff_scores: &mut Vec<read_diff_scores>, threshold_slope: &f64) -> Vec<read_category> {

    // Sorting kmer_diff_scores
    kmer_diff_scores.sort_by(|a, b| a.value.partial_cmp(&b.value).unwrap_or(Ordering::Equal));

    let mut kmer_diff_scores_sorted = Vec::<read_diff_scores>::new();
    for item in kmer_diff_scores { // Making multiple copyies of kmer_diff_scores for further use
	//println!("Value:{}",item.value);
	//println!("groupID:{}",item.groupID);
	let item2:read_diff_scores = read_diff_scores_owned(item);
	kmer_diff_scores_sorted.push(item2);
	//let item2:read_diff_scores = read_diff_scores_owned(item);
    }
      
    let kmer_diff_scores_length: usize = kmer_diff_scores_sorted.len();
    //console::log_2(&"kmer_diff_scores_length:".into(), &kmer_diff_scores_length.to_string().into());
    
    let mut start_point: usize = kmer_diff_scores_length - 1;
    let mut slope:f64 = 0.0;
    let mut is_a_line = 1;
    let mut indices = Vec::<read_category>::new();
    let threshold_slope_clone: f64 = threshold_slope.to_owned();
    if kmer_diff_scores_length > 1 {
       for i in (1..kmer_diff_scores_length).rev() {
	   slope=(&kmer_diff_scores_sorted[i - 1].value - &kmer_diff_scores_sorted[i].value).abs();
	   //console::log_2(&"slope:".into(),&slope.to_string().into());
	   //console::log_2(&"i:".into(),&i.to_string().into());
	   if slope > threshold_slope_clone {
              start_point=i as usize;
              is_a_line = 0;
	      break; 
	   }    
       }	   
    }
    else {
      console::log_1(&"Number of reads too low to determine curvature of slope".into());       
    }
    if (is_a_line == 1) {
	for i in 0..kmer_diff_scores_length { 
           let read_cat = read_category{
	       category:String::from("refalt"),
	       groupID:usize::from(kmer_diff_scores_sorted[i].groupID)
           };
	   indices.push(read_cat);
	   //console::log_2(&"i inline:".into(),&i.to_string().into()); 
        }
    }
    else {
	console::log_2(&"start_point:".into(),&start_point.to_string().into());
    	let mut kmer_diff_scores_input = Vec::<read_diff_scores>::new();
    	for i in 0..start_point {
    	      let item = read_diff_scores{
    	         value:f64::from(kmer_diff_scores_sorted[i].value),
    	         groupID:usize::from(i)     
    	      };
    	      kmer_diff_scores_input.push(item);
    	}
    
        let min_value=read_diff_scores{
        	value:f64::from(kmer_diff_scores_sorted[0 as usize].value),
        	groupID:usize::from(0 as usize)
        };
        
        let max_value=read_diff_scores{
        	value:f64::from(kmer_diff_scores_sorted[start_point].value),
        	groupID:usize::from(start_point)
        };
	
        let slope_of_line: f64 = (max_value.value-min_value.value)/(max_value.groupID as f64 - min_value.groupID as f64); // m=(y2-y1)/(x2-x1)        
        let intercept_of_line: f64 = min_value.value - (min_value.groupID as f64) * slope_of_line; // c=y-m*x 
        let mut distances_from_line:f64 = 0.0;
        let mut array_maximum:f64 = 0.0;
        let mut index_array_maximum:usize = 0;
    	
        for i in 0..kmer_diff_scores_input.len() {
            distances_from_line=(slope_of_line * kmer_diff_scores_input[i].groupID as f64 - kmer_diff_scores_input[i].value + intercept_of_line).abs()/(1.0 as f64 + slope_of_line * slope_of_line).sqrt(); // distance of a point from line  = abs(a*x+b*y+c)/sqrt(a^2+b^2)
            if (array_maximum<distances_from_line) {
                array_maximum=distances_from_line;
        	    index_array_maximum=i;
        	}    
        }
        let score_cutoff:f64 = kmer_diff_scores_sorted[index_array_maximum].value;
	console::log_2(&"score_cutoff (from Rust):".into(),&score_cutoff.to_string().into());
        for i in 0..kmer_diff_scores_length	{
           if (score_cutoff >= kmer_diff_scores_sorted[i].value) {
              let read_cat = read_category{
        	       category:String::from("none"),
        	       groupID:usize::from(kmer_diff_scores_sorted[i].groupID)
              };
              indices.push(read_cat); 
           }
           else {
              let read_cat = read_category{
        	       category:String::from("refalt"),
        	       groupID:usize::from(kmer_diff_scores_sorted[i].groupID)
              };
              indices.push(read_cat); 
           }	   
        }	    
    }
    indices
}
