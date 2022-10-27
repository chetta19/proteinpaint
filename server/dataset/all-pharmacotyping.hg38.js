module.exports = {
	isMds3: true,
	genome: 'hg38',

	cohort: {
		// data downloading is disabled, can reenable later
		allowedChartTypes: ['barchart', 'matrix', 'sampleScatter', 'summary'],

		db: { file: 'files/hg38/ALL-pharmacotyping/clinical/db' },
		termdb: {},

		scatterplots: {
			plots: [
				{
					name: 'Transcriptome t-SNE',
					dimension: 2,
					file: 'files/hg38/ALL-pharmacotyping/clinical/transcriptome-tSNE.txt',
					colorTW: { id: 'Molecular subtype' }
				}
			]
		}
	}
}
