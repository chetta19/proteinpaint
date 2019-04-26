

const samplenamekey = 'sjlid'



module.exports={

	isMds:true,



	cohort:{
		files:[
			{file:'files/hg38/sjlife/clinical/matrix'},
			{file:'files/hg38/sjlife/cohort/admix'}
		],
		samplenamekey: samplenamekey,
		tohash: (item, ds)=>{
			const n = item[samplenamekey]
			if(ds.cohort.annotation[n]) {
				for(const k in item) {
					ds.cohort.annotation[n][k] = item[k]
				}
			} else {
				ds.cohort.annotation[ n ] = item
			}
		},

		sampleAttribute: {
			attributes: {
				CEU: {
					label:'Non-finish European',
					isfloat:1
				},
				YRI: {
					label:'African American',
					isfloat:1
				},
				ASA: {
					label:'East Asian',
					isfloat:1
				},
			}
		},

		termdb: {
			term2term:{
				file:'files/hg38/sjlife/clinical/term2term'
			},
			termjson:{
				file:'files/hg38/sjlife/clinical/termjson'
			},
			default_rootterm:[
				{id:'Cancer-related Variables'},
				{id:'Demographics/health behaviors'},
				{id:'Outcomes'}
			]
		},
	},

	mutationAttribute: {
		attributes: {
			AF: {
				label:'SJLIFE allele frequency',
				isfloat:1,
			},
			AF_gnomAD: {
				label:'gnomAD allele frequency',
				isfloat:1
			},
		}
	},

	// mds2 track
	track: {
		name:'SJLife germline SNV',
		vcf: {
			file:'hg38/sjlife/cohort.vcf.gz',
			viewrangeupperlimit: 200000,
			numerical_axis: {
				axisheight: 150,
				info_keys: [
					{
						key:'AF',
						in_use:true,
						// may config axis
						min_value: 0,
						max_value: 1,
						cutoff: {
							in_use:false,
							side:'<',
							value:0.001
						},
						// TODO bind complex things such as boxplot to one of the info fields
					},
					{
						key:'AF_gnomAD',
						min_value: 0,
						max_value: 1,
						missing_value: 0,
						cutoff: {
							in_use:false,
							side:'<',
							value:0.001
						},
					},
					{
						key:'AC_eas',
						missing_value: 0,
						cutoff: {
							in_use:false,
							side:'<',
							value:2
						},
					},
				],
				in_use: true, // to use numerical axis by default

				termdb2groupAF:{
					group1:{
						name:'GROUP 1',
						terms:[
							{
							term: { id:'diaggrp', name:'Diagnosis Group'},
							value:'Acute lymphoblastic leukemia'
							}
						]
					},
					group2:{
						name:'GROUP 2',
						terms:[
							{
							term: { id:'diaggrp', name:'Diagnosis Group'},
							value:'Acute lymphoblastic leukemia',
							isnot: true,
							}
						]
					}
				},

				ebgatest: {
					terms:[
						{
							term:{id:'diaggrp',name:'Diagnosis Group'},
							value:'Acute lymphoblastic leukemia'
						}
					],
					populations:[
						// per variant, the control population allele counts are hardcoded to be info fields
						{
							key:'CEU',
							infokey_AC: 'AC_nfe',
							infokey_AN: 'AN_nfe'
						},
						{
							key:'YRI',
							infokey_AC: 'AC_afr',
							infokey_AN: 'AN_afr'
						},
						{
							key:'ASA',
							infokey_AC: 'AC_eas',
							infokey_AN: 'AN_eas'
						}
					]
				},
			},
			plot_mafcov: {
				show_samplename: 1
				// may allow jwt
			},
			termdb_bygenotype: {
				// this only works for stratifying samples by mutation genotype
				// svcnv or svcnv+snv combined may need its own trigger
			},
			check_pecanpie: {
				info: {
					P: {fill:"#f04124", label:"Pathogenic"},
					LP: {fill:"#e99002", label:"Likely Pathogenic"},
					Uncertain: {fill:"#e7e7e7", label:"Uncertain Pathogenicity", color:'#333'},
					U: {fill:"#e7e7e7", label:"Uncertain Pathogenicity", color:'#333'},
					"null": {fill:"#e7e7e7", label:"Uncertain Pathogenicity",color:'#333'},
					LB:{fill: "#5bc0de", label:"Likely Benign"},
					B: {fill:"#43ac6a", label:"Benign"}
				}
			}
		},
		/*
		svcnv: {
		},
		genevalues: {
			list: [
				// fpkm
				// protein
			]
		}
		*/
	}
}
