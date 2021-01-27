/* these routes are for testing only */

const fs = require('fs')
const path = require('path')
const cookieParser = require('cookie-parser')

// simulate GDC sessionid to token mapping
// sessionid will be the index of the entry in the array
const sessions = [0]

module.exports = function setRoutes(app, basepath) {
	app.use(cookieParser())
	app.use(basepath + '/mds3', (req, res, next) => {
		if (req.cookies.gdcsessionid) {
			console.log(14, 'has gdcsessionid', sessions[+req.cookies.gdcsessionid], sessions)
			req.headers['X-Auth-Token'] = sessions[+req.cookies.gdcsessionid]
		}
		next()
	})
	app.post('/gdc/ssid', async (req, res) => {
		const q = JSON.parse(req.body)
		const i = sessions.indexOf(q.token)
		if (q.action == 'delete') {
			if (i != -1) {
				sessions.splice(i, 1)
				res.cookie('gdcsessionid', 0, { expires: new Date(Date.now() - 30000), 'max-age': 0 }).send({ status: 'ok' })
			}
		} else {
			if (i == -1) {
				sessions.push(q.token)
				res.cookie('gdcsessionid', sessions.length - 1, { 'max-age': 60000 }).send({ status: 'ok' })
			} else {
				res.cookie('gdcsessionid', i).send({ status: 'ok' })
			}
		}
	})
	app.get(basepath + '/genes/bin/:bundle', async (req, res) => {
		const file = path.join(process.cwd(), `./public/bin/${req.params.bundle}`)
		res.header('Content-Type', 'application/js')
		res.send(await fs.readFileSync(file))
	})
	app.get(basepath + '/genes/:gene', async (req, res) => {
		const file = path.join(process.cwd(), './public/example.gdc.react.html')
		res.header('Content-Type', 'text/html')
		res.send(await fs.readFileSync(file))
	})
	app.get(basepath + '/wrappers/test/:filename', async (req, res) => {
		const file = path.join(process.cwd(), `./src/wrappers/test/${req.params.filename}`)
		res.cookie('gdcsessionid', 0, { expires: new Date(Date.now() - 30000), 'max-age': 0 })
		res.header('Content-Type', 'application/javascript')
		res.header('Cache-control', `immutable,max-age=3`)
		const content = await fs.readFileSync(file, { encoding: 'utf8' })
		const lines = content.split('\n')
		let str = ''
		// remove import lines
		for (const line of lines) {
			let l = line.trim()
			if (l.startsWith('import')) {
				if (l.includes('PpLolliplot')) {
					str += `const PpLolliplot = runproteinpaint.wrappers.PpLolliplot` + '\n'
				}
			} else {
				if (l.startsWith('export')) {
					str += l.substr(l.search(' ')) + '\n'
				} else {
					str += l + '\n'
				}
			}
		}
		res.send(str)
	})
}
