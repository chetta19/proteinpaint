import path from 'path'
import fs from 'fs'
import { exec } from 'child_process'
import util from 'util'
import pkg from '../../../package.json' assert { type: 'json' }
import serverconfig from '../../src/serverconfig.js'

const execPromise = util.promisify(exec)

const docs = {
	get: {
		summary: 'Returns server health and build status.',
		operationId: 'getHealth',
		parameters: [],
		responses: {
			200: {
				description: 'An object of server health parameters and build status',
				schema: {
					type: 'object',
					items: {
						//$ref: '#/definitions/health'
					}
				}
			},
			default: {
				description: 'An error occurred',
				schema: {
					additionalProperties: true
				}
			}
		}
	}
}

export default function (genomes) {
	const operations = { GET }

	// only loaded once when this route handler is created
	const revfile = path.join(process.cwd(), './rev.txt')
	let rev = ''
	if (fs.existsSync(revfile)) {
		rev = fs.readFileSync(revfile, { encoding: 'utf8' })
	}

	async function GET(req, res) {
		try {
			const health = await getStat(genomes, rev)
			Object.assign(health, versionDates)
			res.send(health)
		} catch (e) {
			res.send({ error: e.message || e })
		}
	}

	GET.apiDoc = docs.get

	return operations
}

export const versionDates = Object.freeze({
	pkgver: pkg.version,
	codedate: get_codedate(),
	launchdate: Date(Date.now()).toString().split(' ').slice(0, 5).join(' ')
})

function get_codedate() {
	const date1 = fs.statSync(serverconfig.binpath + '/server.js').mtime
	const date2 = (fs.existsSync('public/bin/proteinpaint.js') && fs.statSync('public/bin/proteinpaint.js').mtime) || 0
	const date = date1 > date2 ? date1 : date2
	return date.toDateString()
}

async function getStat(genomes, rev) {
	const health = { status: 'ok', rev } // object to be returned to client

	const keys = serverconfig.features.healthcheck_keys || []

	if (keys.includes('w')) {
		const { stdout, stderr } = await execPromise('w | head -n1')
		if (stderr) throw stderr
		health.w = stdout
			.toString()
			.trim()
			.split(' ')
			.slice(-3)
			.map(d => (d.endsWith(',') ? +d.slice(0, -1) : +d))
	}

	if (keys.includes('rs')) {
		const { stdout, stderr } = await execPromise('ps aux | grep rsync -w')
		if (stderr) throw stderr
		health.rs = stdout.toString().trim().split('\n').length - 1
	}

	if (!health.rev) health.rev = serverconfig.rev
	if (serverconfig.commitHash) health.commitHash = serverconfig.commitHash
	if (serverconfig.version) health.version = serverconfig.version

	// report status of every genome
	for (const gn in genomes) {
		health[gn] = {} // object to store status of this genome

		const genome = genomes[gn] //; console.log(genome.genedb)

		if (genome.genedb) {
			// genedb status
			health[gn].genedb = {
				buildDate: genome.genedb.get_buildDate ? genome.genedb.get_buildDate.get().date : 'unknown',
				tables: genome.genedb.tableSize
			}
		}

		if (genome.termdbs) {
			// genome-level termdb status e.g. msigdb
			health[gn].termdbs = {}
			for (const key in genome.termdbs) {
				const db = genome.termdbs[key]
				health[gn].termdbs[key] = {
					buildDate: db.cohort.termdb.q.get_buildDate ? db.cohort.termdb.q.get_buildDate.get().date : 'unknown'
				}
			}
		}
	}

	return health
}
