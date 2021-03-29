#!/usr/bin/env node

/*
	- This script loads the server configuration, with
	possible overrides applied at runtime. 

	- It may remove or add a public folder + bin files,
	or change a bundle's publicPath for dynamically
	loading code chunks, depending on the usage context. 

	- It then launches the ProteinPaint server from the command line. 
	
	Usage:
	
	$ npm install @stjude/proteinpaint
	$ npx proteinpaint
*/

const pkg = require('./package.json')
const fs = require('fs')
const execSync = require('child_process').execSync
const path = require('path')
const serverconfig = require('./src/serverconfig.js')

if (serverconfig.backend_only) {
	execSync(`rm -rf ${serverconfig.binpath}/public`)
	execSync(`rm -rf ${serverconfig.binpath}./dist`)
} else if (!fs.existsSync('.git') && pkg._where) {
	// do not do the following in a dev environment

	if (!fs.existsSync('public')) {
		console.log('Creating a public folder ...')
		execSync(`cp -r ${serverconfig.binpath}/public .`)
	}

	// when using as a node_module, would need to copy
	// the pp bin bundles from node_modules/@stjude/proteinpaint to the app directory
	console.log('Replacing the public/bin bundles ...')
	execSync(`rm -rf ./public/bin`)
	execSync(`cp -Rn ${serverconfig.binpath}/public/bin ./public`)

	const publicPath = serverconfig.URL ? serverconfig.URL : ''
	console.log(`Setting the dynamic bundle path to '${publicPath}'`)
	execSync(`mv ./public/bin/proteinpaint.js ./public/bin/proteinpaint-bk.js`)
	execSync(`sed 's%__PP_URL__/bin/%${publicPath}/bin/%' < ./public/bin/proteinpaint-bk.js > public/bin/proteinpaint.js`)
}

require('./server.js')
