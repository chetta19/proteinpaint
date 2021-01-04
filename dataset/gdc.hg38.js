////////////////////////// list of query strings

/*
query list of variants by isoform
*/
const isoform2variants = [
	{
		endpoint: 'https://api.gdc.cancer.gov/ssms',
		size: 100000,
		fields: [
			'ssm_id',
			'chromosome',
			'start_position',
			'reference_allele',
			'tumor_allele',
			'consequence.transcript.transcript_id',
			'consequence.transcript.consequence_type',
			'consequence.transcript.aa_change'
		],
		filters: p => {
			// p:{}
			// .isoform
			// .set_id
			if (!p.isoform) throw '.isoform missing'
			if (typeof p.isoform != 'string') throw '.isoform value not string'
			const f = {
				op: 'and',
				content: [
					{
						op: '=',
						content: {
							field: 'consequence.transcript.transcript_id',
							value: [p.isoform]
						}
					}
				]
			}
			if (p.set_id) {
				if (typeof p.set_id != 'string') throw '.set_id value not string'
				f.content.push({
					op: 'in',
					content: {
						field: 'cases.case_id',
						value: [p.set_id]
					}
				})
			}
			return f
		}
	},
	{
		endpoint: 'https://api.gdc.cancer.gov/ssm_occurrences',
		size: 100000,
		fields: ['ssm.ssm_id', 'case.project.project_id', 'case.case_id', 'case.primary_site', 'case.disease_type'],
		filters: p => {
			// p:{}
			// .isoform
			// .set_id
			if (!p.isoform) throw '.isoform missing'
			if (typeof p.isoform != 'string') throw '.isoform value not string'
			const f = {
				op: 'and',
				content: [
					{
						op: '=',
						content: {
							field: 'ssms.consequence.transcript.transcript_id',
							value: [p.isoform]
						}
					}
				]
			}
			if (p.set_id) {
				if (typeof p.set_id != 'string') throw '.set_id value not string'
				f.content.push({
					op: 'in',
					content: {
						field: 'cases.case_id',
						value: [p.set_id]
					}
				})
			}
			return f
		}
	}
]

/*
not in use for the moment
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
function variables_range2variants(p) {
	// p:{}
	// .chr/start/stop
	// .set_id
	if (!p.chr) throw '.chr missing'
	if (typeof p.chr != 'string') throw '.chr value not string'
	if (!Number.isInteger(p.start)) throw '.start not integer'
	if (!Number.isInteger(p.stop)) throw '.stop not integer'
	const f = {
		filter: {
			op: 'and',
			content: [
				{ op: '=', content: { field: 'chromosome', value: [p.chr] } },
				{ op: '>=', content: { field: 'start_position', value: [p.start] } },
				{ op: '<=', content: { field: 'end_position', value: [p.stop] } }
			]
		}
	}
	if (p.set_id) {
		if (typeof p.set_id != 'string') throw '.set_id value not string'
		f.filter.content.push({
			op: 'in',
			content: { field: 'cases.case_id', value: [p.set_id] }
		})
	}
	return f
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
const variant2samples = {
	endpoint: 'https://api.gdc.cancer.gov/ssm_occurrences',
	size: 100000,
	fields_sunburst: ['ssm.ssm_id', 'case.project.project_id', 'case.case_id', 'case.disease_type'],
	fields_list: [
		'case.project.project_id',
		'case.case_id',
		'case.disease_type',
		'case.primary_site',
		'case.demographic.gender',
		'case.demographic.year_of_birth',
		'case.demographic.race',
		'case.demographic.ethnicity'
	],
	filters: p => {
		if (!p.ssm_id_lst) throw '.ssm_id_lst missing'
		const f = {
			op: 'and',
			content: [
				{
					op: '=',
					content: {
						field: 'ssm.ssm_id',
						value: p.ssm_id_lst.split(',')
					}
				}
			]
		}
		if (p.set_id) {
			if (typeof p.set_id != 'string') throw '.set_id value not string'
			f.content.push({
				op: 'in',
				content: {
					field: 'cases.case_id',
					value: [p.set_id]
				}
			})
		}
		return f
	}
}

/*
getting total cohort sizes
*/
function totalsize_filters(p) {
	// same filter maker function is shared for all terms that need to get total size
	const f = {
		filters: {
			op: 'and',
			content: [{ op: 'in', content: { field: 'cases.available_variation_data', value: ['ssm'] } }]
		}
	}
	if (p.set_id) {
		f.filters.content.push({
			op: 'in',
			content: {
				field: 'cases.case_id',
				value: [p.set_id]
			}
		})
	}
	if (p.tid2value) {
		for (const tid in p.tid2value) {
			const t = terms.find(i => i.id == tid)
			if (t) {
				f.filters.content.push({
					op: 'in',
					content: { field: 'cases.' + t.fields.join('.'), value: [p.tid2value[tid]] }
				})
			}
		}
	}
	return f
}
const project_size = {
	query: ` query projectSize( $filters: FiltersArgument) {
	viewer {
		explore {
			cases {
				total: aggregations(filters: $filters) {
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
}`,
	keys: ['data', 'viewer', 'explore', 'cases', 'total', 'project__project_id', 'buckets'],
	filters: totalsize_filters
}
const disease_size = {
	query: ` query diseaseSize( $filters: FiltersArgument) {
	viewer {
		explore {
			cases {
				total: aggregations(filters: $filters) {
					disease_type {
						buckets {
							doc_count
							key
						}
					}
				}
			}
		}
	}
}`,
	keys: ['data', 'viewer', 'explore', 'cases', 'total', 'disease_type', 'buckets'],
	filters: totalsize_filters
}
const site_size = {
	query: ` query siteSize( $filters: FiltersArgument) {
	viewer {
		explore {
			cases {
				total: aggregations(filters: $filters) {
					primary_site {
						buckets {
							doc_count
							key
						}
					}
				}
			}
		}
	}
}`,
	keys: ['data', 'viewer', 'explore', 'cases', 'total', 'primary_site', 'buckets'],
	filters: totalsize_filters
}

const query_genecnv = `query CancerDistributionBarChart_relayQuery(
	$caseAggsFilters: FiltersArgument
	$ssmTested: FiltersArgument
	$cnvGain: FiltersArgument
	$cnvLoss: FiltersArgument
	$cnvTested: FiltersArgument
	$cnvTestedByGene: FiltersArgument
	$cnvAll: FiltersArgument
	$ssmFilters: FiltersArgument
) {
	viewer {
		explore {
			ssms {
				hits(first: 0, filters: $ssmFilters) { total }
			}
			cases {
				cnvAll: hits(filters: $cnvAll) { total }
				cnvTestedByGene: hits(filters: $cnvTestedByGene) { total }
				gain: aggregations(filters: $cnvGain) {
					project__project_id {
						buckets {
							doc_count
							key
						}
					}
				}
				loss: aggregations(filters: $cnvLoss) {
					project__project_id {
						buckets {
							doc_count
							key
						}
					}
				}
				cnvTotal: aggregations(filters: $cnvTested) {
					project__project_id {
						buckets {
							doc_count
							key
						}
					}
				}
				filtered: aggregations(filters: $caseAggsFilters) {
					project__project_id {
						buckets {
							doc_count
							key
						}
					}
				}
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

const variables_genecnv = {
	caseAggsFilters: {
		op: 'and',
		content: [
			{
				op: 'in',
				content: {
					field: 'cases.available_variation_data',
					value: ['ssm']
				}
			},
			{
				op: 'NOT',
				content: {
					field: 'cases.gene.ssm.observation.observation_id',
					value: 'MISSING'
				}
			},
			{
				op: 'in',
				content: {
					field: 'genes.gene_id'
					// value=[gene] added here
				}
			}
		]
	},
	ssmTested: {
		op: 'and',
		content: [
			{
				op: 'in',
				content: {
					field: 'cases.available_variation_data',
					value: ['ssm']
				}
			}
		]
	},
	cnvGain: {
		op: 'and',
		content: [
			{
				op: 'in',
				content: {
					field: 'cases.available_variation_data',
					value: ['cnv']
				}
			},
			{
				op: 'in',
				content: {
					field: 'cnvs.cnv_change',
					value: ['Gain']
				}
			},
			{
				op: 'in',
				content: {
					field: 'genes.gene_id'
					// value=[gene] added here
				}
			}
		]
	},
	cnvLoss: {
		op: 'and',
		content: [
			{
				op: 'in',
				content: {
					field: 'cases.available_variation_data',
					value: ['cnv']
				}
			},
			{
				op: 'in',
				content: {
					field: 'cnvs.cnv_change',
					value: ['Loss']
				}
			},
			{
				op: 'in',
				content: {
					field: 'genes.gene_id'
					// value=[gene] added here
				}
			}
		]
	},
	cnvTested: {
		op: 'and',
		content: [
			{
				op: 'in',
				content: {
					field: 'cases.available_variation_data',
					value: ['cnv']
				}
			}
		]
	},
	cnvTestedByGene: {
		op: 'and',
		content: [
			{
				op: 'in',
				content: {
					field: 'cases.available_variation_data',
					value: ['cnv']
				}
			},
			{
				op: 'in',
				content: {
					field: 'genes.gene_id'
					// value=[gene] added here
				}
			}
		]
	},
	cnvAll: {
		op: 'and',
		content: [
			{
				op: 'in',
				content: {
					field: 'cases.available_variation_data',
					value: ['cnv']
				}
			},
			{
				op: 'in',
				content: {
					field: 'cnvs.cnv_change',
					value: ['Gain', 'Loss']
				}
			},
			{
				op: 'in',
				content: {
					field: 'genes.gene_id'
					// value=[gene] added here
				}
			}
		]
	},
	ssmFilters: {
		op: 'and',
		content: [
			{
				op: 'in',
				content: {
					field: 'cases.available_variation_data',
					value: ['ssm']
				}
			},
			{
				op: 'in',
				content: {
					field: 'genes.gene_id'
					// value=[gene] added here
				}
			}
		]
	}
}

///////////////////////////////// end of query strings ///////////////

/*
hardcoding a flat list of terms here
any possibility of dynamically querying terms from api??
*/
const terms = [
	{
		name: 'Project',
		id: 'project',
		type: 'categorical',
		fields: ['project', 'project_id']
	},
	{
		name: 'Disease',
		id: 'disease',
		type: 'categorical',
		fields: ['disease_type']
	},
	{
		name: 'Primary site',
		id: 'primary_site',
		type: 'categorical',
		fields: ['primary_site']
	},
	{
		name: 'Gender',
		id: 'gender',
		type: 'categorical',
		fields: ['demographic', 'gender']
	},
	{
		name: 'Birth year',
		id: 'year_of_birth',
		type: 'integer',
		fields: ['demographic', 'year_of_birth']
	},
	{
		name: 'Race',
		id: 'race',
		type: 'categorical',
		fields: ['demographic', 'race']
	},
	{
		name: 'Ethnicity',
		id: 'ethnicity',
		type: 'categorical',
		fields: ['demographic', 'ethnicity']
	}
]

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

// XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX
// XXX hardcoded to use .sample_id to dedup samples
// XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX

module.exports = {
	isMds3: true,
	color: '#545454',
	genome: 'hg38',
	snvindel_attributes,
	apihost: 'https://api.gdc.cancer.gov/v0/graphql',

	// termdb as a generic interface
	// getters will be added to abstract the detailed implementations
	termdb: {
		terms,
		termid2totalsize: {
			// keys are term ids
			project: { gdcapi: project_size },
			disease: { gdcapi: disease_size },
			primary_site: { gdcapi: site_size }
		}
	},

	/* hope this can be applied to all types of variants
	but if it can only be applied to ssm, then it may be moved to queries.snvindel{}
	*/
	variant2samples: {
		variantkey: 'ssm_id', // required, tells client to return ssm_id for identifying variants
		// list of terms to show as items in detailed info page
		termidlst: ['project', 'disease', 'primary_site', 'gender', 'year_of_birth', 'race', 'ethnicity'],
		sunburst_ids: ['project', 'disease'], // term id
		gdcapi: variant2samples
	},

	// this is meant for the leftside labels under tklabel
	// should not be called sample summary but mclassSummary
	sampleSummaries: {
		lst: [
			// for a group of samples that carry certain variants
			{ label1: 'project', label2: 'disease' },
			{ label1: 'primary_site' }
		]
	},
	// how to let gene-level gain/loss data shown as additional labels?

	queries: {
		snvindel: {
			forTrack: true,
			url: {
				base: 'https://portal.gdc.cancer.gov/ssms/',
				key: 'ssm_id'
			},
			byrange: {
				gdcapi: {
					query: query_range2variants,
					variables: variables_range2variants
				}
			},
			byisoform: {
				gdcapi: { lst: isoform2variants }
			}
		},
		genecnv: {
			gaincolor: '#c1433f',
			losscolor: '#336cd5',
			// gene-level cnv of gain/loss categories
			// only produce project summary, not sample level query
			byisoform: {
				sqlquery_isoform2gene: {
					statement: 'select gene from isoform2gene where isoform=?'
				},
				gdcapi: {
					query: query_genecnv,
					variables: variables_genecnv
				}
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
