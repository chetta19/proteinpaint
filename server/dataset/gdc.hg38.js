/*
validate_filter0
isoform2ssm_query1_getvariant
	filter2GDCfilter
		mayChangeCase2Cases
query_range2variants
variables_range2variants
*/

/* if filter0 is missing necessary attr, adding it to api query will cause error
if valid, returns object
otherwise returns null, so it won't be added to query and will not print error
*/
function validate_filter0(f) {
	if (typeof f != 'object') return null
	if (typeof f.op != 'string') return null
	// may check if f.op value is valid
	if (typeof f.content == 'object') {
	} else if (typeof f.content == 'array') {
		// may do recursion
	} else {
		return null
	}
	return f
}

////////////////////////// list of query strings

/*
query list of variants by isoform
*/

/*
TODO if can be done in protein_mutations
query list of variants by genomic range (of a gene/transcript)
does not include info on individual tumors
the "filter" name is hardcoded and used in app.js
*/
const query_range2variants = `query range2variants($filters: FiltersArgument) {
  explore {
    ssms {
      hits(first: 100000, filters: $filters) {
        total
        edges {
          node {
            ssm_id
            chromosome
            start_position
            end_position
            genomic_dna_change
			reference_allele
            tumor_allele
            occurrence {
              hits {
                total
				edges {
				  node {
				    case {
					  case_id
					  project {
					    project_id
					  }
					  primary_site
					  disease_type
					}
				  }
				}
              }
            }
			consequence{
              hits{
                total
                edges{
                  node{
                    transcript{
                      transcript_id
					  aa_change
					  consequence_type
					  gene{
					  	symbol
					  }
                    }
                  }
                }
              }
            }
          }
        }
      }
    }
  }
}`
function variables_range2variants(p) {
	// p:{}
	// .rglst[{chr/start/stop}]
	// .set_id
	if (!p.rglst) throw '.rglst missing'
	const r = p.rglst[0]
	if (!r) throw '.rglst[0] missing'
	if (typeof r.chr != 'string') throw '.rglst[0].chr not string'
	if (!Number.isInteger(r.start)) throw '.rglst[0].start not integer'
	if (!Number.isInteger(r.stop)) throw '.rglst[0].stop not integer'
	const f = {
		filters: {
			op: 'and',
			content: [
				{ op: '=', content: { field: 'chromosome', value: [r.chr] } },
				{ op: '>=', content: { field: 'start_position', value: [r.start] } },
				{ op: '<=', content: { field: 'end_position', value: [r.stop] } }
			]
		}
	}
	if (p.set_id) {
		if (typeof p.set_id != 'string') throw '.set_id value not string'
		f.filters.content.push({
			op: 'in',
			content: { field: 'cases.case_id', value: [p.set_id] }
		})
	}
	if (p.filter0) {
		f.filters.content.push(p.filter0)
	}
	return f
}

///////////////////////////////// end of query strings ///////////////

// mds3 hardcodes to use .sample_id to dedup samples

module.exports = {
	isMds3: true,
	genome: 'hg38',

	validate_filter0,

	// termdb as a generic interface
	// getters will be added to abstract the detailed implementations
	termdb: {
		// quick fix to convert category values from a term to lower cases for comparison
		// as different api returns case-mismatching strings for the same category Breast/breast
		// need example
		useLower: true,

		// for each term from an input list, get total sizes for each category
		// used for sunburst and summary
		termid2totalsize2: { gdcapi: true },

		dictionary: {
			// runs termdb.gdc.js to init gdc dictionary
			// create standard helpers at ds.cohort.termdb.q{}
			gdcapi: true
		},

		matrix: {
			maxSample: 1000,
			geneVariantCountSamplesSkipMclass: ['CNV_loss', 'CNV_amp'],

			// for sample sorting, which sample annotation by mclass ranks higher
			sortPriority: [
				{
					types: ['geneVariant'],
					tiebreakers: [
						{
							by: 'dt',
							order: [1] // snvindel, cnv,
							// other dt values will be ordered last
							// for the sorter to not consider certain dt values,
							// need to explicitly not use such values for sorting
							// ignore: [4]
						},
						{
							by: 'class',
							order: [
								// truncating
								'F',
								'N',
								// indel
								'D',
								'I',
								// point
								'M',
								'P',
								'L',
								// noncoding
								'Utr3',
								'Utr5',
								'S',
								'Intron'
							]
						}
					]
				},
				{
					types: ['geneVariant'],
					tiebreakers: [
						{
							by: 'dt',
							order: [4] // snvindel, cnv,
							// other dt values will be ordered last
							// for the sorter to not consider certain dt values,
							// need to explicitly not use such values for sorting
							// ignore: [4]
						},
						{
							by: 'class',
							order: [
								// Lou and JZ wanted samples with CNV to be sorted first??
								'CNV_loss',
								'CNV_amp'
							]
						}
					]
				},
				{
					types: ['categorical', 'integer', 'float', 'survival'],
					tiebreakers: [{ by: 'values' }]
				}
			]

			/*
			// sort samples for the purpose of truncating,
			// then afterwards will re-sort samples for the purpose 
			// of displaying in the matrix
			truncatePriority: [
				{
					types: ['geneVariant'],
					tiebreakers: [
						{
							by: 'dt',
							order: [1] // snvindel, cnv,
							// other dt values will be ordered last
							// for the sorter to not consider certain dt values,
							// need to explicitly not use such values for sorting
							// ignore: [4]
						},
						{
							by: 'class',
							order: [
								// Lou and JZ wanted samples with CNV to be sorted first??
								//'CNV_loss',
								//'CNV_amp',
								// truncating
								'F',
								'N',
								// indel
								'D',
								'I',
								// point
								'M',
								'P',
								'L',
								// noncoding
								'Utr3',
								'Utr5',
								'S',
								'Intron'
							]
						}
					]
				},
				{
					types: ['geneVariant'],
					tiebreakers: [
						{
							by: 'dt',
							order: [4]
						},
						{
							by: 'class',
							order: [
								// Lou and JZ wanted samples with CNV to be sorted first??
								'CNV_loss',
								'CNV_amp',
							]
						}
					],
				},
				{
					types: ['categorical', 'integer', 'float', 'survival'],
					tiebreakers: [{ by: 'values' }]
				}
			],

			// for sample sorting, which sample annotation by mclass ranks higher
			sortPriority: [
				{
					types: ['geneVariant'],
					tiebreakers: [
						{
							by: 'dt',
							order: [1, 4] // snvindel, cnv,
							// other dt values will be ordered last
							// for the sorter to not consider certain dt values,
							// need to explicitly not use such values for sorting
							// ignore: [4]
						},
						{
							by: 'class',
							order: [
								// truncating
								'F',
								'N',
								// indel
								'D',
								'I',
								// point
								'M',
								'P',
								'L',
								// noncoding
								'Utr3',
								'Utr5',
								'S',
								'Intron',
								// Lou and JZ wanted samples with CNV to be sorted first??
								'CNV_loss',
								'CNV_amp',
							]
						}
					]
				},
				{
					types: ['categorical', 'integer', 'float', 'survival'],
					tiebreakers: [{ by: 'values' }]
				}
			],
			*/
		},

		// pending
		allowCaseDetails: {
			sample_id_key: 'case_uuid',
			terms: ['case.diagnoses']
		}
	},

	// not part of generic mds3 dataset, to map a SSM id to a canonical ENST name
	ssm2canonicalisoform: { gdcapi: true },

	/* hope this can be applied to all types of variants
	but if it can only be applied to ssm, then it may be moved to queries.snvindel{}
	*/
	variant2samples: {
		variantkey: 'ssm_id', // required, tells client to return ssm_id for identifying variants

		//////////////////////////////
		// termidlst and sunburst_ids are sent to client as default lists for different purposes
		// subject to user-customization there, and sent back via request arg for computing
		// not to be used on server-side!

		// list of term ids as sample details
		twLst: [
			{ id: 'case.disease_type', q: {} },
			{ id: 'case.primary_site', q: {} },
			{ id: 'case.project.project_id', q: {} },
			{ id: 'case.demographic.gender', q: {} },
			{ id: 'case.diagnoses.age_at_diagnosis', q: {} },
			//'case.diagnoses.age_at_diagnosis',
			//'case.diagnoses.treatments.therapeutic_agents',
			{ id: 'case.demographic.race', q: {} },
			{ id: 'case.demographic.ethnicity', q: {} }
		],

		// small list of terms for sunburst rings
		sunburst_twLst: [{ id: 'case.disease_type', q: {} }, { id: 'case.primary_site', q: {} }],

		url: {
			base: 'https://uat-portal.gdc.cancer.gov/v2/cases/',
			// if "namekey" is provided, use the given key to obtain sample name to append to url
			// if missing, will require sample_id_key
			namekey: 'sample_URLid'
		},
		gdcapi: true
	},

	queries: {
		snvindel: {
			forTrack: true,
			variantUrl: {
				// for adding url link in variant panel
				base: 'https://uat-portal.gdc.cancer.gov/v2/ssms/',
				key: 'ssm_id'
			},
			byrange: {
				gdcapi: {
					query: query_range2variants,
					variables: variables_range2variants
				}
			},

			byisoform: {
				// implementation details are in mds3.gdc.js
				gdcapi: true
			},

			m2csq: {
				// may also support querying a vcf by chr.pos.ref.alt
				by: 'ssm_id',
				gdcapi: true
			},

			format: {
				TumorAC: {
					ID: 'TumorAC',
					Description: 'Tumor MAF',
					Number: 'R',
					Type: 'Integer'
				},
				NormalDepth: {
					ID: 'NormalDepth',
					Description: 'Normal depth',
					Number: 1,
					Type: 'Integer'
				}
			}
		},
		geneCnv: {
			// gene=level cnv with samples
			bygene: {
				gdcapi: true // see mds3.gdc.js for detailed implementations
			}
		}

		/*
		svfusion: {
		},
		cnvpileup:{},
		geneexpression: {
		},
		*/
	}
}
