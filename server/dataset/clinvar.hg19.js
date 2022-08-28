const clinvar = require('./clinvar')
module.exports = {
	color: '#545454',
	dsinfo: [
		{ k: 'Source', v: '<a href=http://www.ncbi.nlm.nih.gov/clinvar/ target=_blank>NCBI ClinVar</a>' },
		{ k: 'Data type', v: 'SNV/Indel' },
		{ k: 'Gene annotation', v: 'VEP version 102' },
		{ k: 'Download date', v: 'June 2021' }
	],
	genome: 'hg19',
	queries: [
		{
			name: 'clinvar',
			vcffile: 'hg19/clinvar.hg19.hgvs_short.vep.bcf.gz',
			hlinfo: {}
		}
	],
	vcfinfofilter: {
		setidx4mclass: 0,
		setidx4numeric: 1,
		lst: [
			{
				name: 'Clinical significance',
				locusinfo: {
					key: 'CLNSIG'
				},
				categories: clinvar.clinsig
			},
			clinvar.AF.AF_EXAC,
			clinvar.AF.AF_ESP,
			clinvar.AF.AF_TGP
		]
	},

	url4variant: [
		{
			makelabel: m => 'ClinVar Variation ' + m.vcf_ID,
			makeurl: m => {
				return 'https://www.ncbi.nlm.nih.gov/clinvar/variation/' + m.vcf_ID
			}
		}
	]
}
