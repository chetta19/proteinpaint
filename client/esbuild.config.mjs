import path from 'path'
import fs from 'fs'
import { execSync } from 'child_process'
import { context } from 'esbuild'
import { polyfillNode } from 'esbuild-plugin-polyfill-node'
import notifier from 'node-notifier'
import postcss from 'postcss'

const __dirname = import.meta.dirname
const ENV = process.env.ENV

const entryPoints = ['./src/app.js']
if (ENV != 'prod') entryPoints.push(`./test/internals-${ENV}.js`)

const outdir = path.join(__dirname, ENV == 'test' ? '../public/bin/test' : './dist')

const libReplacers = ENV == 'dev' ? [nodeLibToBrowser()] : ENV == 'test' ? [polyfillNode(), nodeLibToBrowser()] : []

const ctx = await context({
	entryPoints,
	bundle: true,
	platform: 'browser',
	// - in dev, there is an existing public/dist -> client/dist symlink
	//   to ensure that the same bundle is used for locally-developed
	//   embedder portals like GFF
	// - for CLI tests such as in CI, the bundles can be outputted directly
	//   to the test runner's static (public) dir
	outdir,
	outbase: 'src',
	//chunkNames: '[hash].app', // TODO: enable for prod build?
	sourcemap: true,
	splitting: true,
	format: 'esm',
	plugins: [...libReplacers, dirnamePlugin(), cssLoader(), logRebuild()],
	logLevel: 'warning'
})

if (ENV == 'dev') {
	console.log('watching files ...')
	await ctx.watch()
} else {
	ctx.rebuild()
}

function logRebuild() {
	const messagesDir = path.join(__dirname, '../.sse/messages')
	const internalsFilename = path.join(__dirname, `./test/internals-${ENV}.js`)
	const emitImports = path.join(__dirname, 'emitImports.mjs')
	return {
		name: 'logBuildStage',
		setup({ onStart, onEnd }) {
			let t, numErrs

			onStart(() => {
				console.log('\n--- starting client rebuild... ---\n')
				if (ENV == 'dev') {
					//console.log('emitting spec imports')
					execSync(`node ${emitImports} > ${internalsFilename}`)
				}
				t = Date.now()
			})
			onEnd(result => {
				if (ENV == 'dev') {
					if (result.errors.length) {
						numErrs = result.errors.length
						const message = `${numErrs} esbuild error(s)`
						notifier.notify({ title: 'client', message })
						const data = JSON.stringify({
							key: 'client',
							message,
							color: 'red'
						})
						fs.promises.writeFile(`${messagesDir}/client`, data)
					} /*if (numErrs)*/ else {
						numErrs = 0
						const message = 'success, esbuild ok'
						// only notify of success if recovering from a bundling error
						notifier.notify({ title: 'client', message })
						const data = JSON.stringify({
							key: 'client',
							message,
							status: 'ok',
							color: 'green',
							duration: 2500,
							reload: true,
							time: Date.now()
						})
						fs.promises.writeFile(`${messagesDir}/client`, data)
					}
				}
				console.log('\n--- client rebuild finished in', Date.now() - t, 'ms ---\n')
				if (ENV != 'dev') ctx.dispose()
			})
		}
	}
}

function nodeLibToBrowser() {
	// NOTE: These polyfills are installed by node-polyfill-webpack-plugin,
	// and will still be required as devDependencies after removing webpack
	// and its plugins post-esbuild migration
	const replace =
		ENV == 'test'
			? {
					tape: import.meta.resolve('./test/tape.bundle.js').replace('file://', '')
			  }
			: ENV == 'dev'
			? {
					path: import.meta.resolve('path-browserify').replace('file://', ''),
					stream: import.meta.resolve('stream-browserify').replace('file://', '')
			  }
			: {}

	const filter = RegExp(`^(${Object.keys(replace).join('|')})$`)
	return {
		name: 'replaceNodeBuiltIns',
		setup(build) {
			build.onResolve({ filter }, arg => {
				return {
					path: replace[arg.path]
				}
			})
		}
	}
}

function dirnamePlugin() {
	const filter = new RegExp(/^(?:.*[\\\/])?node_modules(?:[\\\/].*)?$/) // /.*/
	return {
		name: 'dirnamePlugin',

		setup(build) {
			build.onLoad({ filter }, ({ path: _filePath }) => {
				const fileExt = _filePath.split('.').pop()
				let filePath = _filePath
				if (!fileExt.endsWith('js') && !fileExt.endsWith('ts')) {
					if (fs.existsSync(filePath + '.js')) filePath += '.js'
					if (fs.existsSync(filePath + '.js')) filePath += '.ts'
				}
				if (filePath.includes('/tape/')) {
					let contents = fs.readFileSync(filePath, 'utf8')
					const loader = path.extname(filePath).substring(1)
					const dirname = path.dirname(filePath)
					contents = contents.replace('__dirname', `"${dirname}"`).replace('__filename', `"${filePath}"`)
					return {
						contents,
						loader
					}
				}
			})
		}
	}
}

function cssLoader() {
	// this custom postcss plugin was coded based on instructions from
	// https://evilmartians.com/chronicles/postcss-8-plugin-migration
	// no need for runtime opts{} argument for this simple custom plugin
	const postCssEscape = () => {
		return {
			postcssPlugin: 'postcss-custom-escape',
			Once(root /*, { result }*/) {
				root.walkDecls(decl => {
					decl.value = decl.value.replace(/\\([0-7]{1,3})/g, (match, octal) => {
						return String.fromCharCode(parseInt(octal, 8))
					})
				})
			}
		}
	}
	postCssEscape.postcss = true

	return {
		name: 'cssLoader',
		setup(build) {
			build.onLoad({ filter: /\.css$/ }, async args => {
				let css = fs.readFileSync(args.path, 'utf8')
				if (args.path.includes('ol-ext/dist/ol-ext.css')) {
					const result = await postcss([postCssEscape()]).process(css, { from: args.path })
					css = result.css
				}

				const contents = `
    					const styles = new CSSStyleSheet()
    					styles.replaceSync(\`${css.replace(/[`$]/gm, '\\$&')}\`)
    					document.adoptedStyleSheets.push(styles)
    				`
				return { contents, loader: 'js' }
			})
		}
	}
}
