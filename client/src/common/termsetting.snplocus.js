import { event } from 'd3-selection'
import { makeSnpSelect } from './termsetting.snplst'

/* 
instance attributes

self.term{}
	.id: str, not really used
	.type: "snplocus"
self.q{}
	.alleleType: int
	.geneticModel: int
	.missingGenotype: int
	.chr/start/stop: defines the locus
	.info_fields[ {} ]
		.key
		.label

	.cacheid
		the cache file name storing the snp-by-sample genotypes, for samples based on current filter
		!!NOTE!! id changes for every validation, e.g. for snp/cohort/filter update
*/

const term_name = 'Variants in a locus'

// self is the termsetting instance
export function getHandler(self) {
	return {
		getPillName(d) {
			return self.term.name
		},

		getPillStatus() {
			if (!self.term || !self.q) return
			return { text: `${self.q.chr}:${self.q.start}-${self.q.stop} (n=${self.term.snps.length})` }
		},

		validateQ(data) {
			validateQ(self, data)
		},

		async showEditMenu(div) {
			await makeEditMenu(self, div)
		},

		async postMain() {
			if (self.q && self.q.chr) {
				await validateInput(self)
			}
		}
	}
}

async function makeEditMenu(self, div) {
	const searchbox = add_genesearchbox(self, div)

	const tmpinfoarg = await mayDisplayInfoFields(self, div)
	// TODO tmpinfoarg to be replaced with filter api

	const [select_alleleType, select_geneticModel, select_missingGenotype] = makeSnpSelect(
		div.append('div').style('margin', '10px'),
		self
	)

	// submit button
	div
		.append('button')
		.style('margin', '0px 15px 15px 15px')
		.text('Submit')
		.on('click', async () => {
			const [chr, start, stop] = get_coordinput(searchbox)
			event.target.disabled = true
			event.target.innerHTML = 'Validating input...'
			// parse input text
			if (self.term) {
			} else {
				self.term = { id: makeId() }
				self.q = {}
			}
			self.term.type = 'snplocus' // in case self.term was something else..
			self.q.chr = chr
			self.q.start = start
			self.q.stop = stop
			self.term.name = term_name
			self.q.info_fields = tmpinfoarg
			await validateInput(self)
			// q.cacheid is set

			self.q.alleleType = select_alleleType.property('selectedIndex')
			self.q.geneticModel = select_geneticModel.property('selectedIndex')
			self.q.missingGenotype = select_missingGenotype.property('selectedIndex')

			self.runCallback()
		})

	div
		.append('div')
		.style('display', 'inline-block')
		.style('margin', '5px')
		.style('opacity', 0.4)
		.style('font-size', '.7em')
		.text('Must press Submit button to apply changes.')
}

/* 
Argument
self: may be a termsetting instance or any object

snp validation will query bigbed to convert to pos, and bcf file
very expensive step
will write snp-by-sample gt matrix to a cache file, using all samples from bcf file of this dataset
do not apply sample filtering
*/
async function validateInput(self) {
	const data = await self.vocabApi.validateSnps(self.q)
	if (data.error) throw data.error
	self.q.cacheid = data.cacheid
	self.term.snps = data.snps
}

function validateQ(self, data) {
	const q = data.q
	if (![0, 1].includes(q.alleleType)) throw 'alleleType value is not one of 0/1'
	if (![0, 1, 2, 3].includes(q.geneticModel)) throw 'geneticModel value is not one of 0/1'
	if (![0, 1, 2].includes(q.missingGenotype)) throw 'missingGenotype value is not one of 0/1'
	if (!q.chr) throw 'chr missing'
	if (!Number.isInteger(q.start)) throw 'start coordinate is not integer'
	if (!Number.isInteger(q.stop)) throw 'stop coordinate is not integer'
	if (q.start < 0) throw 'start < 0'
	if (q.stop <= q.start) throw 'stop <= start'
	if (q.info_fields) {
		if (!Array.isArray(q.info_fields)) throw 'info_fields[] is not array'
	}
}

export async function fillTW(tw, vocabApi) {
	try {
		// to catch any error in q{} before running validateInput()
		validateQ(null, tw)
	} catch (e) {
		throw 'snplocus validateQ(): ' + e
	}
	if (!tw.term.name) tw.term.name = term_name
	if (tw.id == undefined || tw.id == '') {
		// tw is missing id
		if (tw.term.id == undefined || tw.term.id == '') {
			// tw.term is also missing id
			tw.term.id = makeId()
		}
		tw.id = tw.term.id
	} else {
		if (tw.term.id == undefined || tw.term.id == '') {
			tw.term.id = tw.id
		}
	}

	await validateInput({
		term: tw.term,
		q: tw.q,
		vocabApi
	})
}

function makeId() {
	return 'snplocus' + Math.random()
}

function add_genesearchbox(self, div) {
	const row = div.append('div').style('margin', '10px')
	const searchbox = row
		.append('input')
		.attr('type', 'text')
		.attr('placeholder', 'Type gene, position, or SNP')
		.style('width', '200px')
	// TODO design interactivities for searching gene and snp here
	row
		.append('span')
		.text('Limit range to under 10 Kb')
		.style('margin-left', '20px')
		.style('opacity', 0.5)
	if (self.q && self.q.chr) {
		searchbox.property('value', self.q.chr + ':' + self.q.start + '-' + self.q.stop)
	}
	return searchbox
}

function get_coordinput(searchbox) {
	// TODO fix
	return ['chr17', 7674304, 7676849]
}

async function mayDisplayInfoFields(self, holder) {
	const info_fields = (await self.vocabApi.get_infofields()).info_fields
	// TODO info fields to be changed to term objects
	if (!info_fields || info_fields.length == 0) return
	const div = holder.append('div').style('margin', '10px')
	// TODO show filter UI after info fields are converted to term objects
	// return filter ui api

	return tempFunction_getinfoarg(info_fields, div)
}

function tempFunction_getinfoarg(lst, div) {
	// temporary function, to be deleted later
	const tmpinfoarg = []
	for (const i of lst) {
		if (!i.isfilter || !i.isactivefilter) continue
		div.append('div').text(i.label)
		const j = { key: i.key }
		if (i.iscategorical) {
			j.iscategorical = true
			j.hiddenvalues = {}
			for (const k of i.values) {
				if (k.ishidden) j.hiddenvalues[k.key] = 1
			}
		} else if (i.isfloat || i.isinteger) {
			j.isnumerical = true
			j.range = i.range
		} else if (i.isflag) {
			j.isflag = true
			j.remove_yes = i.remove_yes
		} else {
			throw 'unknown filter ' + i
		}
		tmpinfoarg.push(j)
	}
	return tmpinfoarg
}
