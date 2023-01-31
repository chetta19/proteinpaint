// Test syntax: cd ~/proteinpaint/utils/benchmark && node fisher.rust.r.js

// Input data is in JSON format and is read from stdin.
// Results are written in JSON format to stdout.

// Input JSON specifications:
// {
//   mtc: fdr/bon (optional). If some other string is used in this field, the script panics.
//   skipLowSampleSize: Flag to check if entries with low sample size need to be ignored (true/false) (optional). When entry follows this criteria total < 2000.0 && ((n1 + n2) / total < 0.03 || (n1 + n3)  / total < 0.03 || (n2 + n4)  / total < 0.03 || (n3 + n4)  / total < 0.03)
//   input:[{
//     index: Index of the entry
//        n1:
//        n2:
//        n3:
//        n4:
//   }]
// }

// NOTE: For now harcoded fisher.rs to ALWAYS use fisher's test

/*
    Suggested by Qian & Yutaka:
    1. Using <5 in each cell is a conventional rule of thumb for choosing chi-square or Fisher’s exact test. Now expected value
    for determining fisher/chisq test is calculated using the formula (ni1 + ni2) * (n1j + n2j) / (n11 + n12 + n21 + n22)
    2. The association test may have extremely low power if a group (row sum or column sum of 2x2 table) is too small compared to
    the total participants, regardless of the value in each cell. Including too many non-powerful tests in this portal may affect
    the detection of ‘true’ association in multiple testing. So, the total participant is less than 2000 and if either of the
    4 groups is <3% of all participants, the sample size is too low and the test is skipped (has a pvalue of null) when
    skipLowSampleSize flag is set to true in the input json

*/

// Output JSON specifications
//    When fdr is not specified
//
//    [{ Array of json objects
//      index:
//      n1:
//      n2:
//      n3:
//      n4:
//      p_value: p-value from fisher/chisq test, "null" for cases with low sample sizes
//      fisher_chisq: "NA" for cases with low sample size, "fisher" when fisher test is used, "chisq" when chisq test is used
//    }]

//    When fdr is specified
//    [{ Array of json objects
//      index:
//      n1:
//      n2:
//      n3:
//      n4:
//      p_value: p-value from fisher/chisq test, "null" for cases with low sample sizes
//      adjusted_p_value: adjusted p-value using Benjamini-Hochberg/Bonferonni correction, "null" for cases with low sample sizes
//      fisher_chisq: "NA" for cases with low sample size, "fisher" when fisher test is used, "chisq" when chisq test is used
//    }]
//
// Example of json input containing the fdr flag

// cd ~/proteinpaint/rust && cargo build --release && json='{"fdr":true,"input":[{ "index": 0, "n1": 2, "n2": 4, "n3": 300, "n4": 400 },{ "index": 1, "n1": 1, "n2": 2, "n3": 3, "n4": 2 },{ "index": 2, "n1": 10, "n2": 22, "n3": 9, "n4": 15 },{ "index": 3, "n1": 14, "n2": 18, "n3": 8, "n4": 16 }]}' && time echo "$json" | target/release/fisher

// cd ~/proteinpaint/rust && cargo build --release && json='{"mtc":"fdr","input":[{"index":0,"n1":514,"n2":626,"n3":45,"n4":106},{"index":1,"n1":11,"n2":948,"n3":364,"n4":292},{"index":2,"n1":129,"n2":951,"n3":531,"n4":268},{"index":3,"n1":677,"n2":40,"n3":11,"n4":837},{"index":4,"n1":947,"n2":937,"n3":245,"n4":817},{"index":5,"n1":589,"n2":889,"n3":934,"n4":400},{"index":6,"n1":5,"n2":119,"n3":278,"n4":641},{"index":7,"n1":873,"n2":113,"n3":771,"n4":109},{"index":8,"n1":495,"n2":69,"n3":759,"n4":884},{"index":9,"n1":266,"n2":192,"n3":686,"n4":761},{"index":10,"n1":484,"n2":814,"n3":754,"n4":521},{"index":11,"n1":50,"n2":615,"n3":357,"n4":470},{"index":12,"n1":416,"n2":109,"n3":472,"n4":462},{"index":13,"n1":535,"n2":935,"n3":969,"n4":35},{"index":14,"n1":605,"n2":667,"n3":553,"n4":359},{"index":15,"n1":483,"n2":719,"n3":879,"n4":254},{"index":16,"n1":940,"n2":32,"n3":259,"n4":373},{"index":17,"n1":228,"n2":565,"n3":154,"n4":155},{"index":18,"n1":23,"n2":57,"n3":232,"n4":238},{"index":19,"n1":356,"n2":39,"n3":771,"n4":887},{"index":20,"n1":481,"n2":307,"n3":776,"n4":952},{"index":21,"n1":463,"n2":202,"n3":57,"n4":218},{"index":22,"n1":658,"n2":68,"n3":431,"n4":774},{"index":23,"n1":334,"n2":266,"n3":266,"n4":677},{"index":24,"n1":97,"n2":544,"n3":532,"n4":863},{"index":25,"n1":562,"n2":313,"n3":725,"n4":574}]}' && time echo "$json" | target/release/fisher

// cd ~/proteinpaint/rust && cargo build --release && json='{"mtc":"fdr","input":[{"index":0,"n1":214,"n2":2057,"n3":134,"n4":1954},{"index":1,"n1":134,"n2":1954,"n3":214,"n4":2057},{"index":2,"n1":1863,"n2":225,"n3":1935,"n4":336},{"index":3,"n1":1935,"n2":336,"n3":1863,"n4":225},{"index":4,"n1":106,"n2":2165,"n3":74,"n4":2014},{"index":5,"n1":74,"n2":2014,"n3":106,"n4":2165},{"index":6,"n1":1,"n2":987,"n3":3,"n4":897},{"index":7,"n1":3,"n2":748,"n3":4,"n4":977}]}' && time echo "$json" | target/release/fisher

// cd ~/proteinpaint/rust && cargo build --release && json='{"mtc":"fdr", "skipLowSampleSize":true,"input":[{"index":0,"n1":214,"n2":2057,"n3":134,"n4":1954},{"index":1,"n1":134,"n2":1954,"n3":214,"n4":2057},{"index":2,"n1":1863,"n2":225,"n3":1935,"n4":336},{"index":3,"n1":1935,"n2":336,"n3":1863,"n4":225},{"index":4,"n1":106,"n2":2165,"n3":74,"n4":2014},{"index":5,"n1":74,"n2":2014,"n3":106,"n4":2165},{"index":6,"n1":1,"n2":987,"n3":3,"n4":897},{"index":7,"n1":3,"n2":748,"n3":4,"n4":977}]}' && time echo "$json" | target/release/fisher

// cd ~/proteinpaint/rust && cargo build --release && json='{"mtc":"bon", "skipLowSampleSize":true,"input":[{"index":0,"n1":214,"n2":2057,"n3":134,"n4":1954},{"index":1,"n1":134,"n2":1954,"n3":214,"n4":2057},{"index":2,"n1":1863,"n2":225,"n3":1935,"n4":336},{"index":3,"n1":1935,"n2":336,"n3":1863,"n4":225},{"index":4,"n1":106,"n2":2165,"n3":74,"n4":2014},{"index":5,"n1":74,"n2":2014,"n3":106,"n4":2165},{"index":6,"n1":1,"n2":987,"n3":3,"n4":897},{"index":7,"n1":3,"n2":748,"n3":4,"n4":977}]}' && time echo "$json" | target/release/fisher

// cd ~/proteinpaint/rust && cargo build --release && json='{"mtc":"bon","input":[{"index":0,"n1":214,"n2":2057,"n3":134,"n4":1954},{"index":1,"n1":134,"n2":1954,"n3":214,"n4":2057},{"index":2,"n1":1863,"n2":225,"n3":1935,"n4":336},{"index":3,"n1":1935,"n2":336,"n3":1863,"n4":225},{"index":4,"n1":106,"n2":2165,"n3":74,"n4":2014},{"index":5,"n1":74,"n2":2014,"n3":106,"n4":2165},{"index":6,"n1":1,"n2":987,"n3":3,"n4":897},{"index":7,"n1":3,"n2":748,"n3":4,"n4":977}]}' && time echo "$json" | target/release/fisher

// cd ~/proteinpaint/rust && cargo build --release && json='{"skipLowSampleSize":true, "input":[{"index":0,"n1":214,"n2":2057,"n3":134,"n4":1954},{"index":1,"n1":134,"n2":1954,"n3":214,"n4":2057},{"index":2,"n1":1863,"n2":225,"n3":1935,"n4":336},{"index":3,"n1":1935,"n2":336,"n3":1863,"n4":225},{"index":4,"n1":106,"n2":2165,"n3":74,"n4":2014},{"index":5,"n1":74,"n2":2014,"n3":106,"n4":2165},{"index":6,"n1":1,"n2":987,"n3":3,"n4":897},{"index":7,"n1":3,"n2":748,"n3":4,"n4":977}]}' && time echo "$json" | target/release/fisher // This output will panic because only skipLowSampleSize = true

// cd ~/proteinpaint/rust && cargo build --release && json='{"input":[{"index":0,"n1":214,"n2":2057,"n3":134,"n4":1954},{"index":1,"n1":134,"n2":1954,"n3":214,"n4":2057},{"index":2,"n1":1863,"n2":225,"n3":1935,"n4":336},{"index":3,"n1":1935,"n2":336,"n3":1863,"n4":225},{"index":4,"n1":106,"n2":2165,"n3":74,"n4":2014},{"index":5,"n1":74,"n2":2014,"n3":106,"n4":2165},{"index":6,"n1":1,"n2":987,"n3":3,"n4":897},{"index":7,"n1":3,"n2":748,"n3":4,"n4":977}]}' && time echo "$json" | target/release/fisher

// cd ~/proteinpaint/rust && cargo build --release && json='{"mtc":"fdr","input":[{"index":0,"n1":214,"n2":2057,"n3":134,"n4":1954},{"index":1,"n1":134,"n2":1954,"n3":214,"n4":2057},{"index":2,"n1":1863,"n2":225,"n3":1935,"n4":336},{"index":3,"n1":1935,"n2":336,"n3":1863,"n4":225},{"index":4,"n1":106,"n2":2165,"n3":74,"n4":2014},{"index":5,"n1":74,"n2":2014,"n3":106,"n4":2165}]}' && time echo "$json" | target/release/fisher

// Example of json input missing the fdr/bon flag

// cd ~/proteinpaint/rust && cargo build --release && json='{"input":[{"index":0,"n1":514,"n2":626,"n3":45,"n4":106},{"index":1,"n1":11,"n2":948,"n3":364,"n4":292},{"index":2,"n1":129,"n2":951,"n3":531,"n4":268},{"index":3,"n1":677,"n2":40,"n3":11,"n4":837},{"index":4,"n1":947,"n2":937,"n3":245,"n4":817},{"index":5,"n1":589,"n2":889,"n3":934,"n4":400},{"index":6,"n1":5,"n2":119,"n3":278,"n4":641},{"index":7,"n1":873,"n2":113,"n3":771,"n4":109},{"index":8,"n1":495,"n2":69,"n3":759,"n4":884},{"index":9,"n1":266,"n2":192,"n3":686,"n4":761},{"index":10,"n1":484,"n2":814,"n3":754,"n4":521},{"index":11,"n1":50,"n2":615,"n3":357,"n4":470},{"index":12,"n1":416,"n2":109,"n3":472,"n4":462},{"index":13,"n1":535,"n2":935,"n3":969,"n4":35},{"index":14,"n1":605,"n2":667,"n3":553,"n4":359},{"index":15,"n1":483,"n2":719,"n3":879,"n4":254},{"index":16,"n1":940,"n2":32,"n3":259,"n4":373},{"index":17,"n1":228,"n2":565,"n3":154,"n4":155},{"index":18,"n1":23,"n2":57,"n3":232,"n4":238},{"index":19,"n1":356,"n2":39,"n3":771,"n4":887},{"index":20,"n1":481,"n2":307,"n3":776,"n4":952},{"index":21,"n1":463,"n2":202,"n3":57,"n4":218},{"index":22,"n1":658,"n2":68,"n3":431,"n4":774},{"index":23,"n1":334,"n2":266,"n3":266,"n4":677},{"index":24,"n1":97,"n2":544,"n3":532,"n4":863},{"index":25,"n1":562,"n2":313,"n3":725,"n4":574}]}' && time echo "$json" | target/release/fisher

use json::JsonValue;
use serde::{Deserialize, Serialize};
use serde_json;
use std::cmp::Ordering;
use std::io;
mod stats_functions; // Import functions from stats_functions.rs

#[derive(Debug, Serialize, Deserialize)]
struct PValueIndexes {
    index: usize,
    n1: u32,
    n2: u32,
    n3: u32,
    n4: u32,
    p_value: Option<f64>, // The "option" keyword tells the compiler that this field can possibly be "None"
    fisher_chisq: String,
}

impl PValueIndexes {
    fn abs_p_value(&self) -> f64 {
        // This function is specific to this struct PValueIndexes
        let final_p_val;
        match self.p_value {
            Some(p_val) => {
                final_p_val = p_val;
            }
            None => {
                final_p_val = 0.0;
            }
        }
        final_p_val
    }
}

#[derive(Debug, Serialize, Deserialize)]
struct AdjustedPValueIndexes {
    index: usize,
    n1: u32,
    n2: u32,
    n3: u32,
    n4: u32,
    p_value: Option<f64>, // The "option" keyword tells the compiler that this field can possibly be "None"
    adjusted_p_value: Option<f64>, // The "option" keyword tells the compiler that this field can possibly be "None"
    fisher_chisq: String,
}

fn main() {
    let mut input = String::new();
    match io::stdin().read_line(&mut input) {
        // Accepting the piped input from nodejs (or command line from testing)
        Ok(_n) => {
            //println!("{} bytes read", n);
            //println!("input:{}", input);

            let input_json = json::parse(&input);
            match input_json {
                Ok(json_string) => {
                    //println!("{} bytes read", n);
                    //println!("json_string:{}", json_string);
                    let variants: &JsonValue = &json_string["input"]; // Putting each variant in a separate element of vector

                    //let fisher_limit: u32 = json_string["fisher_limit"].as_u32().unwrap(); // Cutoff for sum of all four numbers to decide whether to use fisher or chisq test
                    let individual_fisher_limit: f64 = 5.0;
                    let mtc_string = &json_string["mtc"].to_owned();
                    let low_sample_size_string = &json_string["skipLowSampleSize"].to_owned();
                    //println!("fdr_string:{}", fdr_string);

                    let mut fdr_bool = false;
                    let mut bon_bool = false;

                    match mtc_string.as_str() {
                        Some(mtc) => {
                            if mtc == "fdr" {
                                fdr_bool = true;
                            } else if mtc == "bon" {
                                bon_bool = true;
                            } else {
                                panic!("Unrecognized option, mtc field should be fdr/bon");
                            }
                        }
                        None => {}
                    }
                    //match fdr_string.as_bool() {
                    //    Some(fdr) => match fdr {
                    //        true => fdr_bool = true,
                    //        false => {}
                    //    },
                    //    None => {}
                    //}
                    //
                    //match bon_string.as_bool() {
                    //    Some(bon) => match bon {
                    //        true => bon_bool = true,
                    //        false => {}
                    //    },
                    //    None => {}
                    //}

                    let mut low_sample_size_bool = false;
                    match low_sample_size_string.as_bool() {
                        Some(low_sample_size) => match low_sample_size {
                            true => low_sample_size_bool = true,
                            false => {}
                        },
                        None => {}
                    }

                    if fdr_bool == false && bon_bool == false && low_sample_size_bool == true {
                        panic!("skipLowSampleSize = true but fdr and bon is set to false.");
                    }

                    if fdr_bool == false && bon_bool == false {
                        // Check if FDR calculation is required or not
                        calculate_fisher_chisq_test(
                            variants,
                            individual_fisher_limit,
                            false,
                            false,
                            low_sample_size_bool,
                        );
                    } else if fdr_bool == true && bon_bool == false {
                        calculate_fisher_chisq_test(
                            variants,
                            individual_fisher_limit,
                            true,
                            false,
                            low_sample_size_bool,
                        );
                    } else if fdr_bool == false && bon_bool == true {
                        calculate_fisher_chisq_test(
                            variants,
                            individual_fisher_limit,
                            false,
                            true,
                            low_sample_size_bool,
                        );
                    } else if fdr_bool == true && bon_bool == true {
                        // This scenario is probably no longer possible ?
                        println!(
                            "Choose either Bonferronni correction or Benjamini-Hochberg correction"
                        );
                    } else {
                        // Should not happen
                        println!("Unidentified case");
                    }
                }
                Err(error) => println!("Incorrect json: {}", error),
            }
        }
        Err(error) => println!("Piping error: {}", error),
    }
}

fn calculate_fisher_chisq_test(
    variants: &JsonValue,
    _individual_fisher_limit: f64,
    fdr: bool,
    bon: bool,
    low_sample_size: bool,
) {
    let mut p_values_list = Vec::<PValueIndexes>::new();
    let mut num_of_tests: f64 = 0.0; // Number of test actually carried out ignoring those which have low sample-size
    for i in 0..variants.len() {
        let variant = &variants[i];
        //println!("variant:{:?}", variant);
        if variant.len() > 1 {
            // Check if total greater than fisher limit, if yes then use chisq test
            let fisher_chisq_test: u64 = 1; // Initializing to fisher-test
            let n1 = variant["n1"].as_u32().unwrap();
            let n2 = variant["n2"].as_u32().unwrap();
            let n3 = variant["n3"].as_u32().unwrap();
            let n4 = variant["n4"].as_u32().unwrap();
            let total: f64 = (n1 + n2 + n3 + n4) as f64;

            let mut p_value_original = Option::<f64>::None;
            let p_value_final;
            let fisher_chisq_test_string;
            if total < 2000.0
                && ((n1 + n2) as f64 / total < 0.03
                    || (n1 + n3) as f64 / total < 0.03
                    || (n2 + n4) as f64 / total < 0.03
                    || (n3 + n4) as f64 / total < 0.03)
                && low_sample_size == true
            {
                // Sample size too low for doing association test
                //p_value_original = None;
                fisher_chisq_test_string = "NA".to_string();
            }
            //else if calculate_expected_value(1, n1, n2, n3, n4, total) >= individual_fisher_limit
            //    && calculate_expected_value(2, n1, n2, n3, n4, total) >= individual_fisher_limit
            //    && calculate_expected_value(3, n1, n2, n3, n4, total) >= individual_fisher_limit
            //    && calculate_expected_value(4, n1, n2, n3, n4, total) >= individual_fisher_limit
            //{
            //    fisher_chisq_test = 2; // Setting test = chi-sq
            //    let _fisher_chisq_test_final;
            //    (p_value_final, _fisher_chisq_test_final) =
            //        stats_functions::strand_analysis_one_iteration(
            //            n1,
            //            n2,
            //            n3,
            //            n4,
            //            fisher_chisq_test,
            //        );
            //    fisher_chisq_test_string = "chisq".to_string();
            //    p_value_original = Some(p_value_final);
            //    num_of_tests += 1.0;
            //}
            else {
                let _fisher_chisq_test_final;
                (p_value_final, _fisher_chisq_test_final) =
                    stats_functions::strand_analysis_one_iteration(
                        n1,
                        n2,
                        n3,
                        n4,
                        fisher_chisq_test,
                    );
                fisher_chisq_test_string = "fisher".to_string();
                p_value_original = Some(p_value_final);
                num_of_tests += 1.0;
            }

            p_values_list.push(PValueIndexes {
                index: variant["index"].as_usize().unwrap(),
                n1: n1,
                n2: n2,
                n3: n3,
                n4: n4,
                p_value: p_value_original,
                fisher_chisq: fisher_chisq_test_string.to_string(),
            });
        }
    }

    // Calculate Benjamini Hochberg/Bonferroni correction
    match fdr {
        true => benjamini_hochberg_correction(p_values_list, num_of_tests),
        false => {
            match bon {
                true => bonferroni_correction(p_values_list, num_of_tests),

                false => {
                    let mut output_string = "[".to_string();
                    for i in 0..p_values_list.len() {
                        output_string += &serde_json::to_string(&p_values_list[i]).unwrap();
                        if i != p_values_list.len() - 1 {
                            output_string += &",".to_string();
                        }
                    }
                    output_string += &"]".to_string();
                    //println!("output:{}", json::stringify(output_string));
                    println!("{}", output_string);
                }
            }
        }
    }
}

fn benjamini_hochberg_correction(mut p_values_list: Vec<PValueIndexes>, num_of_tests: f64) {
    // Sorting p-values in ascending order
    //println!("MTC using FDR correction");
    p_values_list.as_mut_slice().sort_by(|a, b| {
        (a.abs_p_value())
            .partial_cmp(&b.abs_p_value())
            .unwrap_or(Ordering::Equal)
    });

    //println!("p_values_list:{:?}", p_values_list);

    //println!("num_of_tests:{}", num_of_tests);
    let mut adjusted_p_values = Vec::<AdjustedPValueIndexes>::new();
    let mut old_p_value: f64 = 0.0;
    let mut rank: f64 = num_of_tests;
    for j in 0..p_values_list.len() {
        let i = p_values_list.len() - j - 1;

        let mut adjusted_p_value: Option<f64> = None;
        match p_values_list[i].p_value {
            Some(p_val) => {
                //println!("p_val:{}", p_val);
                let mut adjusted_p_val: f64 = p_val * (num_of_tests / rank); // adjusted p-value = original_p_value * (N/rank)
                if adjusted_p_val > 1.0 {
                    // p_value should NEVER be greater than 1
                    adjusted_p_val = 1.0;
                }
                //println!("Original p_value:{}", p_values_list[i].p_value);
                //println!("Raw adjusted p_value:{}", adjusted_p_value);
                if i != p_values_list.len() - 1 {
                    if adjusted_p_val > old_p_value {
                        adjusted_p_val = old_p_value;
                    }
                }
                old_p_value = adjusted_p_val;
                //println!("adjusted_p_value:{}", adjusted_p_val);
                adjusted_p_value = Some(adjusted_p_val);
                rank -= 1.0;
            }
            None => {}
        }

        adjusted_p_values.push(AdjustedPValueIndexes {
            index: p_values_list[i].index,
            n1: p_values_list[i].n1,
            n2: p_values_list[i].n2,
            n3: p_values_list[i].n3,
            n4: p_values_list[i].n4,
            p_value: p_values_list[i].p_value,
            adjusted_p_value: adjusted_p_value,
            fisher_chisq: p_values_list[i].fisher_chisq.clone(),
        });
    }

    // Sorting original p-values by their original indexes in ascending order
    adjusted_p_values
        .as_mut_slice()
        .sort_by(|a, b| (a.index).partial_cmp(&b.index).unwrap_or(Ordering::Equal));

    // Printing original and adjusted p-values

    let mut output_string = "[".to_string();
    for i in 0..adjusted_p_values.len() {
        output_string += &serde_json::to_string(&adjusted_p_values[i]).unwrap();
        if i != adjusted_p_values.len() - 1 {
            output_string += &",".to_string();
        }
    }
    output_string += &"]".to_string();
    println!("{}", output_string);
}

fn bonferroni_correction(p_values_list: Vec<PValueIndexes>, num_of_tests: f64) {
    //println!("num_of_tests:{}", num_of_tests);
    //println!("MTC using Bonferroni correction");
    let mut adjusted_p_values = Vec::<AdjustedPValueIndexes>::new();
    for i in 0..p_values_list.len() {
        let mut adjusted_p_value: Option<f64> = None;
        match p_values_list[i].p_value {
            Some(p_val) => {
                //println!("p_val:{}", p_val);
                let mut adjusted_p_val: f64 = p_val * num_of_tests; // In bonferroni correction, multiplying p_value by number of tests (excluding those with low sample sizes)
                if adjusted_p_val > 1.0 {
                    // p_value should NEVER be greater than 1
                    adjusted_p_val = 1.0;
                }
                adjusted_p_value = Some(adjusted_p_val);
            }
            None => {}
        }

        adjusted_p_values.push(AdjustedPValueIndexes {
            index: p_values_list[i].index,
            n1: p_values_list[i].n1,
            n2: p_values_list[i].n2,
            n3: p_values_list[i].n3,
            n4: p_values_list[i].n4,
            p_value: p_values_list[i].p_value,
            adjusted_p_value: adjusted_p_value,
            fisher_chisq: p_values_list[i].fisher_chisq.clone(),
        });
    }

    // Printing original and adjusted p-values

    let mut output_string = "[".to_string();
    for i in 0..adjusted_p_values.len() {
        output_string += &serde_json::to_string(&adjusted_p_values[i]).unwrap();
        if i != adjusted_p_values.len() - 1 {
            output_string += &",".to_string();
        }
    }
    output_string += &"]".to_string();
    println!("{}", output_string);
}

#[allow(dead_code)]
fn calculate_expected_value(
    position: u32, // position must be between 1 and 4
    n1: u32,
    n2: u32,
    n3: u32,
    n4: u32,
    total: f64,
) -> f64 {
    let mut expected_value: f64 = 0.0; //  [ 1   2 ]
                                       //  [ 3   4 ]
    if position == 1 {
        expected_value = ((n1 + n2) as f64) * ((n1 + n3) as f64) / total;
    } else if position == 2 {
        expected_value = ((n1 + n2) as f64) * ((n2 + n4) as f64) / total;
    } else if position == 3 {
        expected_value = ((n1 + n3) as f64) * ((n3 + n4) as f64) / total;
    } else if position == 4 {
        expected_value = ((n2 + n4) as f64) * ((n3 + n4) as f64) / total;
    }
    expected_value
}
