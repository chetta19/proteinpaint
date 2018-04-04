function abort(m) {
	console.error(m)
	process.exit()
}


if(process.argv.length!=4) abort('<SV file from cohort> <bin bp length> output compressed SV to stdout')


const svfile = process.argv[2]
const binsize = Number.parseInt(process.argv[3])
if(Number.isNaN(binsize)) abort('invalid value for bin bp length')


const fs=require('fs')

const lines = fs.readFileSync(svfile,{encoding:'utf8'}).trim().split('\n')

/*
1	sample	PAISNS_diagnosis
2	chra	1
3	posa	120543859
4	chrb	2
5	posb	65103235
*/

const data = new Map()
/*
k: chrA
v: {}
  k: bin posA
  v: {}
    k: chrB
	v: {}
	  k: bin posB
	  v: set of samples
*/

for(let i=1; i<lines.length; i++) {
	const l = lines[i].split('\t')
	const sample = l[0]
	const chr1 = l[1][0]=='c' ? l[1] : 'chr'+l[1]
	const pos1 = Number.parseInt(l[2])
	if(Number.isNaN(pos1)) abort('invalid posA: '+lines[i])
	const chr2 = l[3][0]=='c' ? l[3] : 'chr'+l[3]
	const pos2 = Number.parseInt(l[4])
	if(Number.isNaN(pos2)) abort('invalid posB: '+lines[i])

	let chrA, posA, chrB, posB
	/* for sv cases of chr1-chr2 & chr2-chr1, they should be registered using the same chr in data
	*/
	if(data.has(chr1)) {
		chrA = chr1
		posA = pos1
		chrB = chr2
		posB = pos2
	} else if(data.has(chr2)) {
		chrA = chr2
		posA = pos2
		chrB = chr1
		posB = pos1
	} else {
		// neither chr indexed
		chrA = chr1
		posA = pos1
		chrB = chr2
		posB = pos2
	}

	const binposA = binsize * Math.floor( posA/binsize )
	const binposB = binsize * Math.floor( posB/binsize )

	if(!data.has(chrA)) data.set( chrA, new Map())

	if(!data.get(chrA).has(binposA)) data.get(chrA).set(binposA, new Map())

	if(!data.get(chrA).get(binposA).has(chrB)) data.get(chrA).get(binposA).set( chrB, new Map() )

	if(!data.get(chrA).get(binposA).get(chrB).has(binposB)) data.get(chrA).get(binposA).get(chrB).set(binposB, new Set())

	data.get(chrA).get(binposA).get(chrB).get(binposB).add( sample )
}

for(const [chrA,d1] of data) {
	for(const [posA, d2] of d1) {
		for(const [chrB, d3] of d2) {
			for(const [posB, samples] of d3) {
				console.log(chrA+'\t'+posA+'\t'+chrB+'\t'+posB+'\t'+samples.size)
			}
		}
	}
}
