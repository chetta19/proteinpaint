#!/usr/bin/env node
process.chdir('../server')
const serverconfig = require('../../server/src/serverconfig.js')
if (!serverconfig.ignoreTermdbTest) {
	const hg38 = serverconfig.genomes && serverconfig.genomes.find(g => g.name == 'hg38')
	if (!hg38 || !hg38.datasets || !hg38.datasets.find(d => d.name == 'TermdbTest')) {
		throw 'Missing the TermdbTest dataset entry in the hg38 genome of serverconfig.json'
	}
}
