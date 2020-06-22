const tape = require('tape')
const d3s = require('d3-selection')
const helpers = require('../../../test/front.helpers.js')
const graphable = require('../../common/termutils').graphable

/*
Note:
these tests are dependent on SJLife termdb data.
if data updates, these tests may also needs to be updated
*/

const runpp = helpers.getRunPp('termdb', {
	state: {
		dslabel: 'SJLife',
		genome: 'hg38'
	},
	debug: 1,
	fetchOpts: {
		serverData: helpers.serverData
	}
})

/**************
 test sections
***************/

tape('\n', function(test) {
	test.pass('-***- termdb/search -***-')
	test.end()
})

tape('term search, default behavior', function(test) {
	test.timeoutAfter(10000)

	runpp({
		search: {
			callbacks: {
				'postRender.test': runTests
			}
		}
	})

	function runTests(search) {
		const tree = search.Inner.app.getComponents('tree')

		helpers
			.rideInit({ arg: search, bus: search, eventType: 'postSearch' })
			.use(triggerSearchNoResult)
			.to(testSearchNoResult)
			.use(triggerFirstSearch)
			.to(testFirstSearch)
			.use(triggerClickResult_firstSearch)
			.to(testClickResult_firstSearch, { arg: tree, bus: tree, eventType: 'postRender' })
			.use(triggerSecondSearch_samebranchas1st)
			.done(test)
	}

	function triggerSearchNoResult(search) {
		search.Inner.doSearch('xxxyyyzz')
	}

	function testSearchNoResult(search) {
		const div = search.Inner.dom.resultDiv.select('div').node()
		test.equal(div.innerHTML, 'No match', 'should show "No match"')
	}

	function triggerFirstSearch(search) {
		search.Inner.doSearch('cardio')
	}

	let searchResultBtns
	function testFirstSearch(search) {
		searchResultBtns = search.Inner.dom.resultDiv.select('table').selectAll('.sja_menuoption')
		test.equal(searchResultBtns.size(), 4, 'search result should show 4 buttons')
	}

	let clickedTerm_firstSearch
	function triggerClickResult_firstSearch(search) {
		const btn1 = searchResultBtns.nodes()[0]
		btn1.click()
		clickedTerm_firstSearch = btn1.__data__
	}

	function testClickResult_firstSearch(tree) {
		const termdivs = tree.Inner.dom.treeDiv.selectAll('.termdiv')
		test.ok(termdivs.nodes().length > 10, 'updated tree should show more than 10 terms')
		test.equal(
			termdivs.filter(i => i.id == clickedTerm_firstSearch.id).size(),
			1,
			'clicked term now appears in the updated tree'
		)
		test.ok(
			tree.Inner.components.plots[clickedTerm_firstSearch.id],
			'clicked term ID is now a key in tree.components.plots{}'
		)
	}

	// second search, on the same branch as the first search
	function triggerSecondSearch_samebranchas1st(search) {
		// somehow this function doesn't run
		search.Inner.doSearch('asthma')
	}
})

tape('click_term', test => {
	test.timeoutAfter(1000)

	runpp({
		tree: {
			click_term: modifier_callback,
			disable_terms: ['Cardiomyopathy']
		},
		search: {
			callbacks: {
				'postInit.test': runTests
			}
		}
	})

	function runTests(search) {
		const tree = search.Inner.app.getComponents('tree')
		helpers
			.rideInit({ arg: search, bus: search, eventType: 'postSearch' })
			.use(triggerSearch, { wait: 200 })
			.to(testSearchResult, { wait: 100 })
			.run(testClearedResults, { wait: 100 })
			.done(test)
	}
	function triggerSearch(search) {
		search.Inner.doSearch('cardio')
	}
	function testSearchResult(search) {
		const disabledlabels = search.Inner.dom.resultDiv.node().getElementsByClassName('sja_tree_click_term_disabled')
		test.equal(disabledlabels.length, 1, 'should show 1 disabled term')
		const buttons = search.Inner.dom.resultDiv.node().getElementsByClassName('sja_filter_tag_btn sja_tree_click_term')
		test.ok(buttons.length > 0, 'should show 1 or more clickable buttons')
		buttons[0].click()
	}
	function modifier_callback(term) {
		test.ok(graphable(term), 'modifier callback called with a graphable term')
	}
	function testClearedResults(search) {
		const buttons = search.Inner.dom.resultDiv.node().getElementsByClassName('sja_filter_tag_btn sja_tree_click_term')
		test.equal(buttons.length, 0, 'should clear search results after a term is clicked')
		test.equal(search.Inner.dom.input.property('value'), '', 'should clear input text field after a term is clicked')
	}
})
