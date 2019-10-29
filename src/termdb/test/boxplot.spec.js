const tape = require('tape')
const termjson = require('../../../test/termdb/termjson').termjson
const helpers = require('../../../test/front.helpers.js')

/*************************
 reusable helper functions
**************************/

const runpp = helpers.getRunPp('termdb', {
	state: {
		dslabel: 'SJLife',
		genome: 'hg38',
		termfilter: { show_top_ui: false }
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
	test.pass('-***- termdb/boxplot -***-')
	test.end()
})

tape('unsupported overlay types', function(test) {
	test.timeoutAfter(2000)
	runpp({
		state: {
			tree: {
				expandedTermIds: ['root', 'Cancer-related Variables', 'Diagnosis', 'diaggrp'],
				visiblePlotIds: ['diaggrp'],
				plots: {
					diaggrp: {
						settings: { currViews: ['boxplot'] },
						term: { id: 'diaggrp', term: termjson['diaggrp'] }
					}
				}
			}
		},
		callbacks: {
			boxplot: {
				'postInit.test': runTests
			}
		}
	})

	let boxDiv
	function runTests(box) {
		boxDiv = box.Inner.dom.div
		helpers
			.rideInit({ arg: box, eventType: 'postRender.test' })
			.run(testHiddenNoOverlay, { wait: 200 })
			.run(triggerNonNumericOverlay, { wait: 200 })
			.run(testHiddenNonNumericOverlay, { wait: 200 })
			.done(test)
	}

	function testHiddenNoOverlay() {
		test.equal(boxDiv.style('display'), 'none', 'should be HIDDEN when there is no overlay')
	}

	function triggerNonNumericOverlay(box) {
		box.Inner.app.dispatch({
			type: 'plot_edit',
			id: box.id,
			config: {
				term2: {
					term: termjson['sex']
				}
			}
		})
	}

	function testHiddenNonNumericOverlay(box) {
		test.equal(boxDiv.style('display'), 'none', 'should be HIDDEN when the overlay is not numeric')
	}
})

tape('supported numeric overlay', function(test) {
	test.timeoutAfter(1000)
	runpp({
		state: {
			tree: {
				expandedTermIds: ['root', 'Cancer-related Variables', 'Diagnosis', 'diaggrp'],
				visiblePlotIds: ['diaggrp'],
				plots: {
					diaggrp: {
						settings: { currViews: ['boxplot'] },
						term: { id: 'diaggrp', term: termjson['diaggrp'] },
						term2: { id: 'agedx', term: termjson['agedx'] }
					}
				}
			}
		},
		callbacks: {
			boxplot: {
				'postRender.test': runTests
			}
		}
	})

	function runTests(box) {
		testVisibleBoxplot(box)
		test.end()
	}

	function testVisibleBoxplot(box) {
		test.equal(box.Inner.dom.div.style('display'), 'block', 'should be visible when there is a numeric overlay')
	}
})
