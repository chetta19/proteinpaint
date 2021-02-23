import { dofetch2 } from './client'
import { debounce } from 'debounce'

export async function init_examples(par) {
	const { holder } = par
	const re = await loadJson()
	let track_arg = {}
	if (re.error) {
		holder
			.append('div')
			.text(re.error)
			.style('background-color', '#f5f5f5')
		return
	}
	const wrapper_div = make_examples_page(holder)
	const searchbar_div = wrapper_div.append('div')
	const track_grid = make_main_track_grid(wrapper_div)
	const gbrowser_col = make_gBrowserCol(track_grid)
	const app_col = make_appCol(track_grid)

	// genomepaint panel
	// subgrid
	// top card followed by additional tiles
	gbrowser_col
		.append('div')
		.style('display', 'flex')
		.style('align-items', 'center')
		.style('justify-content', 'center')
	// .style('flex-direction', 'column')
	// const gb_btn_div = gbrowser_col.append('span')
	// gb_btn_div
	// .style('margin', '20px, 10px, 10px, 10px')
	launch_gBrowser_btn(gbrowser_col)

	gbrowser_col
		.append('h5')
		.html('GenomePaint')
		.append('hr')
	const gpaintList = gbrowser_col.append('ul')
	gpaintList
		.style('display', 'grid')
		.style('grid-template-columns', 'repeat(auto-fit, minmax(320px, 1fr))')
		.style('gap', '10px')
		.style('padding', '10px')
		.style('border-radius', '8px')

	// tracks panel
	// subgrid
	gbrowser_col
		.append('h5')
		.html('Genome Browser Tracks')
		.append('hr')
	const browserList = gbrowser_col.append('ul')
	browserList
		.style('display', 'grid')
		.style('grid-template-columns', 'repeat(auto-fit, minmax(320px, 1fr))')
		.style('gap', '10px')
		.style('padding', '10px')
		.style('border-radius', '8px')

	// experimental tracks panel
	// subgrid
	gbrowser_col
		.append('h5')
		.html('Experimental Tracks')
		.append('hr')
	const experimentalList = gbrowser_col.append('ul')
	experimentalList
		.attr('class', 'track-list')
		.style('display', 'grid')
		.style('grid-template-columns', 'repeat(auto-fit, minmax(320px, 1fr))')
		.style('gap', '10px')
		.style('padding', '10px')
		.style('border-radius', '8px')

	// otherapps track panel
	// subgrid
	app_col
		.append('h5')
		.html('Apps')
		.append('hr')
	const appList = app_col.append('ul')
	appList
		.style('display', 'grid')
		.style('grid-template-columns', 'repeat(auto-fit, minmax(320px, 1fr))')
		.style('gap', '10px')
		.style('padding', '10px')
		.style('border-radius', '8px')

	track_arg = {
		tracks: re.examples,
		gpaintList,
		browserList,
		experimentalList,
		appList
	}
	make_searchbar(searchbar_div, track_arg)
	await loadTracks(track_arg)
}

function make_examples_page(holder) {
	const wrapper_div = holder.append('div')
	wrapper_div
		.append('div')
		.style('margins', '5px')
		.style('position', 'relative')
		.style('padding', '10px')
		.style('background-color', '#f5f5f5')
	return wrapper_div
}
//Makes search bar and functionality to search tracks
function make_searchbar(div, args) {
	const bar_div = div.append('div')
	bar_div
		.style('display', 'flex')
		.style('flex-direction', 'column')
		.style('align-items', 'center')
		.style('justify-content', 'center')
		.style('background-color', '#f5f5f5')
	const searchBar = bar_div.append('div')
	searchBar
		.append('div')
		.append('input')
		.attr('type', 'text')
		.style('width', '500px')
		.style('height', '24px')
		.style('border-radius', '3px')
		.style('border', '2px solid #dbdbdb')
		.style('font-size', '12px')
		.property('placeholder', 'Search apps, tracks, or features')
		.on(
			'keyup',
			debounce(async () => {
				const data = args.tracks
				const searchInput = searchBar
					.select('input')
					.node()
					.value.toLowerCase()
				const filteredTracks = data.filter(track => {
					let searchTermFound = (track.searchterms || []).reduce((searchTermFound, searchTerm) => {
						if (searchTermFound) {
							return true
						}
						return searchTerm.toLowerCase().includes(searchInput)
					}, false)
					return searchTermFound || track.name.toLowerCase().includes(searchInput)
				})
				displayGPaintTracks(filteredTracks, args.gpaintList)
				displayBrowserTracks(filteredTracks, args.browserList)
				displayExperimentalTracks(filteredTracks, args.experimentalList)
				displayAppTracks(filteredTracks, args.appList)
			}),
			700
		)

	return searchBar
}

//Creates the two column outer grid
function make_main_track_grid(div) {
	const track_grid = div.append('div')
	track_grid
		.style('display', 'grid')
		.style('grid-template-columns', 'repeat(auto-fit, minmax(425px, 1fr))')
		.style('grid-template-areas', '"gbrowser otherapps"')
		.style('gap', '10px')
		.style('background-color', '#f5f5f5')
		.style('padding', '10px 20px')
		.style('text-align', 'left')

	return track_grid
}

//Creates the outer Genome Browser column
function make_gBrowserCol(div) {
	const gBrowserCol = div.append('div')
	gBrowserCol
		.style('grid-area', 'gbrowser')
		.property('position', 'relative')
		.style('background-color', '#f5f5f5')

	return gBrowserCol
}

//Creates the launch genome browser button
function launch_gBrowser_btn(div) {
	const launch_btn = div.append('div')
	launch_btn
		.append('button')
		.attr('class', 'gbrowser-btn')
		.style('height', '75px')
		.style('width', '100%')
		.style('border-radius', '3px')
		.style('border', 'none')
		.style('background-color', 'white')
		.style('text-align', 'center')
		.style('font-size', '14.5px')
		.style(
			'font-family',
			'"Lucida Sans", "Lucida Sans Regular", "Lucida Grande", "Lucida Sans Unicode", Geneva, Verdana, sans-serif'
		)
		.text('Launch Genome Browser')
		.append('span')
		.attr('class', 'launch-btn_tooltip')
		.style('font-size', '11px')
		.text('Change the genome from the header dropdown')

	return launch_btn
}

//Creates the outer Other App column
function make_appCol(div) {
	const otherAppsCol = div.append('div')
	otherAppsCol
		.style('grid-area', 'otherapps')
		.property('position', 'relative')
		.style('background-color', '#f5f5f5')

	return otherAppsCol
}

async function loadJson() {
	const json = await dofetch2('/examples', { method: 'POST', body: JSON.stringify({ getexamplejson: true }) })
	return json
}

async function loadTracks(args) {
	try {
		displayGPaintTracks(args.tracks, args.gpaintList)
		displayBrowserTracks(args.tracks, args.browserList)
		displayExperimentalTracks(args.tracks, args.experimentalList)
		displayAppTracks(args.tracks, args.appList)
	} catch (err) {
		console.error(err)
	}
}
//TODO: ?? Styling difference between clickable tiles and not clickable tiles (which ones have examples and which don't)??

//For all display functions: If example is available, the entire tile is clickable. If url and/or doc links are provided, buttons appear and open a new tab

//Displays tracks under the GenomePaint subheader.
function displayGPaintTracks(tracks, holder) {
	holder.selectAll('*').remove()
	const trackData = tracks.filter(track => {
		const app = `${track.app}`
		const subheading = `${track.subheading}`
		if (app == 'Genome Browser' && subheading == 'GenomePaint') {
			const li = holder.append('li')
			li.attr('class', 'track')
				.html(
					`
							${
								track.blurb
									? `<div class="track-h" id="theader"><span style="font-size:14.5px;font-weight:500;">${track.name}</span><span id="track-blurb">  ${track.blurb}</span></div>`
									: `<div class="track-h"><span style="font-size:14.5px;font-weight:500;">${track.name}</span></div>`
							}
						<span class="track-image"><img src="${track.image}"></img></span>
						<div class="track-btns">
						${
							track.buttons.url
								? `<button class="url-tooltip-outer" id="url-btn" onclick="window.open('${window.location.origin}${track.buttons.url}', '_blank')">URL<span class="url-tooltip-span">View a parameterized URL example of this track</span></button>`
								: ''
						}
						${
							track.buttons.doc
								? `<button id="doc-btn" onclick="window.open('${track.buttons.doc}', '_blank')" type="button">Docs</button>`
								: ''
						}
						</div>`
				)
				.on('click', async () => {
					if (track.buttons.example) {
						openExample(track, holder)
					}
				})
			return JSON.stringify(li)
		}
	})
}

//Displays tracks under the Genome Browser subheader
function displayBrowserTracks(tracks, holder) {
	holder.selectAll('*').remove()
	const trackData = tracks.filter(track => {
		const app = `${track.app}`
		const subheading = `${track.subheading}`
		if (app == 'Genome Browser' && subheading == 'Tracks') {
			const li = holder.append('li')
			li.attr('class', 'track')
				.html(
					`
					${
						track.blurb
							? `<div class="track-h" id="theader"><span style="font-size:14.5px;font-weight:500;">${track.name}</span><span id="track-blurb">  ${track.blurb}</span></div>`
							: `<div class="track-h"><span style="font-size:14.5px;font-weight:500;">${track.name}</span></div>`
					}
					<span class="track-image"><img src="${track.image}"></img></span>
					<div class="track-btns">
					${
						track.buttons.url
							? `<button class="url-tooltip-outer" id="url-btn" onclick="window.open('${window.location.origin}${track.buttons.url}', '_blank')">URL<span class="url-tooltip-span">View a parameterized URL example of this track</span></button>`
							: ''
					}
					${
						track.buttons.doc
							? `<button id="doc-btn" onclick="window.open('${track.buttons.doc}', '_blank')" type="button">Docs</button>`
							: ''
					}
					</div>`
				)
				.on('click', async () => {
					if (track.buttons.example) {
						openExample(track, holder)
					}
				})
			return JSON.stringify(li)
		}
	})
}

//Displays tracks under the Experimental Tracks subheader
function displayExperimentalTracks(tracks, holder) {
	holder.selectAll('*').remove()
	const trackData = tracks.filter(track => {
		const app = `${track.app}`
		const subheading = `${track.subheading}`
		if (app == 'Genome Browser' && subheading == 'Experimental Tracks') {
			const li = holder.append('li')
			li.attr('class', 'track')
				.html(
					`
					${
						track.blurb
							? `<div class="track-h" id="theader"><span style="font-size:14.5px;font-weight:500;">${track.name}</span><span id="track-blurb">  ${track.blurb}</span></div>`
							: `<div class="track-h"><span style="font-size:14.5px;font-weight:500;">${track.name}</span></div>`
					}
					<span class="track-image"><img src="${track.image}"></img></span>
					<div class="track-btns">
					${
						track.buttons.url
							? `<button class="url-tooltip-outer" id="url-btn" onclick="window.open('${window.location.origin}${track.buttons.url}', '_blank')">URL<span class="url-tooltip-span">View a parameterized URL example of this track</span></button>`
							: ''
					}
					${
						track.buttons.doc
							? `<button id="doc-btn" onclick="window.open('${track.buttons.doc}', '_blank')" type="button">Docs</button>`
							: ''
					}
					</div>`
				)
				.on('click', async () => {
					if (track.buttons.example) {
						openExample(track, holder)
					}
				})
			return JSON.stringify(li)
		}
	})
}

//Displays tracks under the Apps subheader
async function displayAppTracks(tracks, holder) {
	holder.selectAll('*').remove()
	const trackData = tracks.filter(track => {
		const app = `${track.app}`
		const subheading = `${track.subheading}`
		if (app == 'Apps' && subheading == 'Tracks') {
			const li = holder.append('li')
			li.attr('class', 'track')
				.html(
					`
					${
						track.blurb
							? `<div class="track-h" id="theader"><span style="font-size:14.5px;font-weight:500;">${track.name}</span><span id="track-blurb">  ${track.blurb}</span></div>`
							: `<div class="track-h"><span style="font-size:14.5px;font-weight:500;">${track.name}</span></div>`
					}
					<span class="track-image"><img src="${track.image}"></img></span>
					<div class="track-btns">
					${
						track.buttons.url
							? `<button class="url-tooltip-outer" id="url-btn" onclick="window.open('${window.location.origin}${track.buttons.url}', '_blank')">URL<span class="url-tooltip-span">View a parameterized URL example of this track</span></button>`
							: ''
					}
					${
						track.buttons.doc
							? `<button id="doc-btn" onclick="window.open('${track.buttons.doc}', '_blank')" type="button">Docs</button>`
							: ''
					}
					</div>`
				)
				.on('click', async () => {
					if (track.buttons.example) {
						openExample(track, holder)
					}
				})
			return JSON.stringify(li)
		}
	})
}

//TODO: styling for the container
//Opens example of app in landing page container
async function openExample(track, holder) {
	holder.selectAll('*').remove()
	const strippedTrack = `${JSON.stringify(track.buttons.example)}`.slice(1, -1)
	const contents = `<script src="${window.location.origin}/bin/proteinpaint.js" charset="utf-8"></script>
				<div id="aaa" style="margin:20px">
				<button type="submit" onclick="window.open('${window.location.origin}', '_self')">Go Back</button>
				<h2 class="header" id="track-example-header">${track.name} Example</h2>
				</div>
			<script>
				runproteinpaint({
                    host: '${window.location.origin}',
                    holder: document.getElementById('aaa'),
                    ${strippedTrack}
                })
			</script>`
	holder.append('div').html(contents)

	// const tab = window.open('${window.location.origin}','_self')
	// const tab = window.open(`${track.shorthand},name=${track.shorthand} Example`)
	// const script = tab.document.createElement('script')
	// const tabName = `${track.shorthand}`
	// script.type = 'text/javascript'
	// tab.document.write(contents)
	// tab.document.close()
	// setTimeout(function() {
	// 	tab.document.title = tabName
	// }, 500)
}
