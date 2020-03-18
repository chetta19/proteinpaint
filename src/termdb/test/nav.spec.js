const tape = require('tape')
const termjson = require('../../../test/testdata/termjson').termjson
const helpers = require('../../../test/front.helpers.js')

/*************************
 reusable helper functions
**************************/

const runpp = helpers.getRunPp('termdb', {
	state: {
		dslabel: 'SJLife',
		genome: 'hg38',
		nav: { show_tabs: true }
	},
	debug: 1,
	fetchOpts: {
		serverData: helpers.serverData
	}
})

function sleep(ms) {
	return new Promise(resolve => setTimeout(resolve, ms))
}

async function addDemographicSexFilter(opts, btn) {
	btn.click()
	await sleep(200)
	// termdiv[1] is assumed to be Demographics
	const termdiv1 = opts.filter.Inner.dom.treeTip.d.node().querySelectorAll('.termdiv')[2]
	termdiv1.querySelectorAll('.termbtn')[0].click()
	await sleep(200)

	const termdivSex = [...termdiv1.querySelectorAll('.termdiv')].find(elem => elem.__data__.id === 'sex')
	termdivSex.querySelectorAll('.termview')[0].click()
	await sleep(800)

	termdivSex.querySelector('.bars-cell > rect').dispatchEvent(new Event('click', { bubbles: true }))
	await sleep(100)
}

/**************
 test sections
***************/
tape('\n', function(test) {
	test.pass('-***- termdb/nav -***-')
	test.end()
})

tape('default hidden tabs, no filter', function(test) {
	runpp({
		state: {
			nav: { show_tabs: false }
		},
		nav: {
			callbacks: {
				'postInit.test': runTests
			}
		}
	})
	function runTests(nav) {
		test.equal(nav.Inner.dom.tabDiv.style('display'), 'none', 'should hide the tabs by default')
		test.equal(nav.Inner.dom.holder.style('margin-bottom'), '0px', 'should not set a margin-bottom')
		test.equal(nav.Inner.dom.holder.style('border-bottom'), '0px none rgb(0, 0, 0)', 'should not show a border-bottom')
		test.notEqual(nav.Inner.dom.searchDiv.style('display'), 'none', 'should show the search input')
		test.equal(nav.Inner.dom.subheaderDiv.style('display'), 'none', 'should hide the subheader')
		test.end()
	}
})

tape('empty cohort, then selected', function(test) {
	test.timeoutAfter(3000)

	runpp({
		state: {
			activeCohort: -1,
			nav: {
				show_tabs: true
			}
		},
		nav: {
			callbacks: {
				'postRender.test': runTests
			}
		}
	})

	let tds, trs
	function runTests(nav) {
		tds = nav.Inner.dom.tabDiv.selectAll('td')
		trs = nav.Inner.dom.tabDiv.node().querySelectorAll('tr')
		helpers
			.rideInit({ arg: nav, bus: nav, eventType: 'postRender.test' })
			.run(testPreCohortSelection)
			.use(triggerCohortSelection)
			.to(testPostCohortSelection, 100)
			.use(triggerTabFold)
			.to(testTabFold, 100)
			.use(triggerTabUnfold)
			.to(testTabUnfold, 100)
			.done(test)
	}

	function testPreCohortSelection(nav) {
		test.equal(
			tds
				.filter(function() {
					return this.style.display !== 'none'
				})
				.size() / trs.length,
			1,
			'should show 1 tab when no cohort is selected'
		)
		test.notEqual(
			nav.Inner.dom.subheaderDiv.style('display'),
			'none',
			'should show the subheader when no cohort is selected'
		)
		test.notEqual(
			tds.filter((d, i) => i === 0).style('background-color'),
			'transparent',
			'should highlight the active cohort tab'
		)
	}

	function triggerCohortSelection(nav) {
		nav.Inner.dom.cohortOpts
			.selectAll('input')
			.filter((d, i) => i === 0)
			.node()
			.click()
	}

	function testPostCohortSelection(nav) {
		test.equal(
			tds
				.filter(function() {
					return this.style.display !== 'none'
				})
				.size() / trs.length,
			3,
			'should show 3 tabs after a cohort is selected'
		)
		test.notEqual(
			nav.Inner.dom.subheaderDiv.style('display'),
			'none',
			'should still show the subheader after a cohort is selected'
		)
		test.notEqual(
			tds.filter((d, i) => i === 0).style('background-color'),
			'transparent',
			'should highlight the active tab'
		)
	}

	function triggerTabFold(nav) {
		tds
			.filter((d, i) => i === 0)
			.node()
			.click()
	}

	function testTabFold(nav) {
		test.equal(
			nav.Inner.dom.subheaderDiv.style('display'),
			'none',
			'should hide the subheader when a tab is clicked again'
		)
		test.equal(
			tds
				.filter(function() {
					return this.style.backgroundColor === 'transparent'
				})
				.size() / trs.length,
			3,
			'should not highlight any active tab'
		)
	}

	function triggerTabUnfold(nav) {
		tds
			.filter((d, i) => i === 0)
			.node()
			.click()
	}

	function testTabUnfold(nav) {
		test.notEqual(
			nav.Inner.dom.subheaderDiv.style('display'),
			'none',
			'should unfold the subheader when a tab is clicked a third time'
		)
		test.notEqual(
			tds.filter((d, i) => i === 0).style('background-color'),
			'transparent',
			'should highlight the active tab'
		)
	}
})

tape('filter subheader', async function(test) {
	test.timeoutAfter(3000)
	runpp({
		state: {
			activeCohort: 0,
			nav: {
				show_tabs: true
			}
		},
		nav: {
			callbacks: {
				'postRender.test': runTests
			}
		}
	})

	let tds, trs
	function runTests(nav) {
		tds = nav.Inner.dom.tabDiv.selectAll('td')
		trs = nav.Inner.dom.tabDiv.node().querySelectorAll('tr')
		helpers
			.rideInit({ arg: nav, bus: nav, eventType: 'postRender.test' })
			.use(triggerTabSwitch)
			.to(testTabSwitch, 100)
			.use(triggerFilterAdd)
			.to(testFilterAdd, 100)
			.done(test)
	}

	function triggerTabSwitch(nav) {
		tds
			.filter((d, i) => i === 1)
			.node()
			.click()
	}

	function testTabSwitch(nav) {
		test.notEqual(
			nav.Inner.dom.subheaderDiv.style('display'),
			'none',
			'should show the subheader when the filter tab is clicked'
		)
	}

	async function triggerFilterAdd(nav) {
		const newBtn = nav.Inner.dom.subheader.filter.node().querySelector('.sja_new_filter_btn')

		await addDemographicSexFilter({ filter: nav.getComponents('filter').Inner.filterApi }, newBtn)
	}

	function testFilterAdd(nav) {
		test.equal(
			nav.Inner.dom.subheader.filter.node().querySelectorAll('.sja_pill_wrapper').length,
			1,
			'should add blue pill'
		)
	}
})

tape('no termd.selectCohort', function(test) {
	test.timeoutAfter(3000)

	runpp({
		state: {
			genome: 'hg38',
			dslabel: 'NoCohortSJLife',
			activeCohort: -1,
			nav: {
				show_tabs: true
			}
		},
		nav: {
			callbacks: {
				'postRender.test': runTests
			}
		}
	})

	let tds, trs
	function runTests(nav) {
		tds = nav.Inner.dom.tabDiv.selectAll('td')
		trs = nav.Inner.dom.tabDiv.node().querySelectorAll('tr')
		helpers
			.rideInit({ arg: nav, bus: nav, eventType: 'postRender.test' })
			.run(testPreCohortSelection)
			//.use(triggerCohortSelection)
			//.to(testPostCohortSelection, 100)
			//.use(triggerTabFold)
			//.to(testTabFold, 100)
			//.use(triggerTabUnfold)
			//.to(testTabUnfold, 100)
			.done(test)
	}

	function testPreCohortSelection(nav) {
		test.equal(
			tds
				.filter(function() {
					return this.style.display !== 'none'
				})
				.size() / trs.length,
			2,
			'should show 2 tabs'
		)
		test.equal(
			tds
				.filter(function(d) {
					return d.colNum === 0 && this.style.display === 'none'
				})
				.size() / trs.length,
			1,
			'should not show the cohort tab'
		)
		/*
		test.notEqual(
			tds.filter((d, i) => i === 0).style('background-color'),
			'transparent',
			'should highlight the active cohort tab'
		)*/
	}
})
