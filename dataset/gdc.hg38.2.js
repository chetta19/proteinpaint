////////////////////////// list of query strings

/*
query list of variants by isoform
*/
const query_isoform2variants = `
query Lolliplot_relayQuery(
	$filters: FiltersArgument
	$score: String
) {
	analysis {
		protein_mutations {
			data(first: 10000, score: $score, filters: $filters, fields: [
				"ssm_id"
				"chromosome"
				"start_position"
				"reference_allele"
				"tumor_allele"
				"consequence.transcript.aa_change"
				"consequence.transcript.consequence_type"
				"consequence.transcript.transcript_id"
				"consequence.transcript.annotation.vep_impact"
				"consequence.transcript.annotation.polyphen_impact"
				"consequence.transcript.annotation.polyphen_score"
				"consequence.transcript.annotation.sift_impact"
				"consequence.transcript.annotation.sift_score"
				"occurrence.case.project.project_id"
				"occurrence.case.primary_site"
				"occurrence.case.disease_type"
				"occurrence.case.case_id"
			])
		}
	}
}`
const variables_isoform2variants = {
	filters: {
		op: '=',
		content: {
			field: 'consequence.transcript.transcript_id'
			// value=[isoform] added here
		}
	},
	score: 'occurrence.case.project.project_id'
}

/*
query list of variants by genomic range (of a gene/transcript)
does not include info on individual tumors
the "filter" name is hardcoded and used in app.js
TODO convert to text output
*/
const query_range2variants = `
query GdcSsmByGene($filter: FiltersArgument) {
	explore {
		ssms {
			hits(first: 10000, filters: $filter) {
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
											project {
												project_id
											}
											disease_type
											primary_site
											# case_id
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
const variables_range2variants = {
	filter: {
		op: 'and',
		content: [
			{ op: 'in', content: { field: 'chromosome' } }, // to add "value" at runtime
			{ op: '>=', content: { field: 'start_position' } },
			{ op: '<=', content: { field: 'end_position' } }
		]
	}
}

/*
using one or multiple variants, get info about all tumors harbording them
variant2samples intends to be a generic mechanism for fetching tumors harbording a variant
same name attribute will be exposed to client (ds.variant2samples: true)
and hiding the implementation details on server

on client, get() is added to tk.ds.variant2samples to make GET request for list of variants
this happens for sunburst and itemtable

query mode: samples/sunburst/summaries
difference is how many sample attributes are included
don't know a js method to alter the list of attributes in `case { }` part
- samples
  return entire list of attributes on the sample
  use for returning list of samples, or summarizing all attributes
- sunburst
  only return subset of attributes selected for sunburst chart
*/
const query_variant2samples_sunburst = `
query OneSsm($filter: FiltersArgument) {
	explore {
		ssms {
			hits(first: 10000, filters: $filter) {
				edges {
					node {
						occurrence {
							hits {
								edges {
									node {
										case {
											project {
												project_id
											}
											disease_type
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
const query_variant2samples_list = `
query OneSsm($filter: FiltersArgument) {
	explore {
		ssms {
			hits(first: 10000, filters: $filter) {
				edges {
					node {
						occurrence {
							hits {
								edges {
									node {
										case {
											project {
												project_id
											}
											disease_type
											primary_site
											case_id
											available_variation_data
											state
											days_to_index
											submitter_id
											tissue_source_site {
												name
											}
											demographic {
												gender
												year_of_birth
												race
												ethnicity
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
const variables_variant2samples = {
	filter: {
		op: 'in',
		content: {
			field: 'ssm_id'
			// value=[ssm_id] added here
		}
	}
}
const ssmCaseAttr = [
	{
		sunburst: true, // set to true so it will be a level in summary
		k: 'Project', // attribute for stratinput
		get: m => {
			// the getter will not be passed to client
			if (m.project) return m.project.project_id
			return null
		}
	},
	{
		sunburst: true,
		k: 'Disease',
		get: m => m.disease_type
	},
	{
		k: 'Primary site',
		get: m => m.primary_site
	},
	{
		k: 'Available variation data',
		get: m => m.available_variation_data
	},
	{ k: 'State', get: m => m.state },
	{ k: 'Days to index', get: m => m.days_to_index },
	{ k: 'Submitter', get: m => m.submitter_id },
	{
		k: 'Tissue source site',
		get: m => {
			if (m.tissue_source_site) return m.tissue_source_site.name
			return null
		}
	},
	{
		k: 'Gender',
		get: m => {
			if (m.demographic) return m.demographic.gender
			return null
		}
	},
	{
		k: 'Birth year',
		get: m => {
			if (m.demographic) return m.demographic.year_of_birth
			return null
		}
	},
	{
		k: 'Race',
		get: m => {
			if (m.demographic) return m.demographic.race
			return null
		}
	},
	{
		k: 'Ethnicity',
		get: m => {
			if (m.demographic) return m.demographic.ethnicity
			return null
		}
	}
]

/*
one time query: will only run once and result is cached on serverside
to retrieve total number of tumors per project
the number will be displayed in both sunburst and singleton variant panel
must associate the "project" with project_id in sunburst

for now this is only triggered in variant2samples query
*/
const query_projectsize = `
query projectSize( $ssmTested: FiltersArgument) {
	viewer {
		explore {
			cases {
				total: aggregations(filters: $ssmTested) {
					project__project_id {
						buckets {
							doc_count
							key
						}
					}
				}
			}
		}
	}
}`
const variables_projectsize = {
	ssmTested: {
		op: 'and',
		content: [{ op: 'in', content: { field: 'cases.available_variation_data', value: ['ssm'] } }]
	}
}

//////////////// end of query strings ///////////////

const occurrence_key = 'total' // for the numeric axis showing occurrence

/* this now applies not only to vcf track but also legacy ds
 */

// attributes to show for list of variants
const snvindel_attributes = [
	{
		label: 'Mutation',
		get: m => m.mname || ''
	},
	{
		label: 'Genome pos.',
		get: m => {
			if (m.chr && m.pos) return m.chr + ':' + (m.pos + 1)
			return null
		}
	},
	{
		label: 'Allele',
		lst: [
			{
				get: function(m) {
					return m.ref || ''
				},
				label: 'Ref',
				valuecenter: true
			},
			{
				get: function(m) {
					return m.alt || ''
				},
				label: 'Alt',
				valuecenter: true
			}
		]
	},
	{
		label: 'Occurrence',
		get: m => m.info.total
	},
	{
		label: 'Polyphen impact',
		get: m => m.info.polyphen_impact
	},
	{
		label: 'Polyphen score',
		get: m => m.info.polyphen_score
	},
	{
		label: 'SIFT impact',
		get: m => m.info.sift_impact
	},
	{
		label: 'SIFT score',
		get: m => m.info.sift_score
	},
	{
		label: 'VEP impact',
		get: m => m.info.vep_impact
	}
]

const sampleSummaries = [
	// for a group of samples that carry certain variants
	// TODO project/disease hierarchy
	{ label1: 'project', label2: 'disease' },
	{ label1: 'site' }
]

module.exports = {
	isMds3: true,
	color: '#545454',
	genome: 'hg38',
	snvindel_attributes,

	onetimequery_projectsize: {
		gdcapi: {
			query: query_projectsize,
			variables: variables_projectsize
		}
	},

	variant2samples: {
		variantkey: 'ssm_id', // required, tells client to return ssm_id for identifying variants
		// required
		attributes: ssmCaseAttr,
		gdcapi: {
			query_sunburst: query_variant2samples_sunburst,
			query_list: query_variant2samples_list,
			variables: variables_variant2samples
		}
	},

	// this is meant for the leftside labels under tklabel
	sampleSummaries: {
		lst: sampleSummaries
	},
	// how to let gene-level gain/loss data shown as additional labels?

	queries: {
		snvindel: {
			forTrack: true,
			byrange: {
				// to convert to queries[]
				gdcapi: {
					query: query_range2variants,
					variables: variables_range2variants
				}
			},
			byisoform: {
				gdcapi: {
					query: query_isoform2variants,
					variables: variables_isoform2variants
				}
			},
			occurrence_key
		}
		/*
		svfusion: {
		},
		cnvpileup:{},
		genecnv: {
			// gene-level cnv of gain/loss categories
		},
		geneexpression: {
		},
		*/
	}
}
