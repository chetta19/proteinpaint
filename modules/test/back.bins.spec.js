const tape = require('tape')
const b = require('../termdb.bins')

/*************************
 reusable helper functions
**************************/

const get_summary = (() => {
	const values = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20]
	const n = values.length / 100
	return percentiles => {
		const summary = {
			min: Math.min(...values),
			max: Math.max(...values)
		}

		const pct = []
		for (const num of percentiles) {
			summary['p' + num] = values[Math.floor(num * n)]
		}

		return summary
	}
})()

function tryBin(test, arg, testMssg, expectedErrMssg) {
	try {
		b.compute_bins(arg, get_summary)
		test.fail(testMssg)
	} catch (e) {
		test.equal(e, expectedErrMssg, testMssg)
	}
}

/**************
 test sections
***************/
tape('\n', function(test) {
	test.pass('-***- termdb.bins specs -***-')
	test.end()
})

tape('compute_bins() error handling, type=regular', function(test) {
	tryBin(test, null, 'should throw on empty config', 'bin schema must be an object')

	tryBin(test, {}, 'should throw on missing bin_size', 'non-numeric bin_size')

	tryBin(test, { bin_size: 'abc' }, 'should throw on non-numeric bin_size', 'non-numeric bin_size')

	tryBin(test, { bin_size: 0 }, 'should throw on bin_size <= 0', 'bin_size must be greater than 0')

	tryBin(test, { bin_size: 5 }, 'should throw on missing first_bin', 'first_bin{} missing')

	tryBin(
		test,
		{ bin_size: 5, first_bin: 'abc' },
		'should throw on a non-object first_bin',
		'first_bin{} is not an object'
	)

	tryBin(
		test,
		{ bin_size: 5, first_bin: {} },
		'should throw on an empty first_bin object',
		'first_bin is an empty object'
	)

	tryBin(
		test,
		{ bin_size: 5, first_bin: { startunbounded: 1 } },
		'should throw if missing first_bin.startunbounded + stop, or start_percentile, or start',
		'first_bin.stop should be a number when startunbounded and stop_percentile is not set'
	)

	test.end()
})

tape('compute_bins() error handling, type=custom', function(test) {
	tryBin(test, null, 'should throw on empty config', 'bin schema must be an object')

	tryBin(test, { type: 'custom' }, 'should throw on missing lst', 'binconfig.lst must be an array')

	tryBin(test, { type: 'custom', lst: [] }, 'should throw on empty lst', 'binconfig.lst must have entries')

	tryBin(
		test,
		{ type: 'custom', lst: [{}] },
		'should throw on missing *inclusive keys',
		'custom bin.startinclusive and/or bin.stopinclusive must be defined'
	)

	tryBin(
		test,
		{ type: 'custom', lst: [{ startinclusive: 1 }] },
		'should throw on a custom first bin missing both .startunbounded and .start',
		'the first bin must define either startunbounded or start'
	)

	tryBin(
		test,
		{ type: 'custom', lst: [{ startinclusive: 1, start: 'abc' }] },
		'should throw on non-numeric start for a bounded first bin',
		'bin.start must be numeric for a bounded first bin'
	)

	tryBin(
		test,
		{
			type: 'custom',
			lst: [
				{ startinclusive: 1, start: 1, stop: 2 },
				{ startinclusive: 1, start: 3 }
			]
		},
		'should throw on a custom last bin missing both .stopunbounded and .stop',
		'the last bin must define either stopunbounded or stop'
	)

	tryBin(
		test,
		{
			type: 'custom',
			lst: [
				{ startinclusive: 1, start: 1, stop: 2 },
				{ startinclusive: 1, start: 3, stop: 'abc' }
			]
		},
		'should throw on non-numeric stop for a bounded last bin',
		'bin.stop must be numeric for a bounded last bin'
	)

	test.end()
})

tape('get_bin_label(), label_offset>0', function(test) {
	// test smaller helper functions first since they
	// tend to get used in larger functions and the
	// testing sequence would help isolate the cause(s)
	// of multiple failing tests
	const binconfig = {
		bin_size: 3,
		startinclusive: true,
		first_bin: {},
		label_offset: 1,
		results: {
			summary: {
				min: 0
			}
		}
	}
	test.equal(b.get_bin_label({ startunbounded: 1, stop: 3 }, binconfig), '<3', 'startunbounded')

	test.equal(
		b.get_bin_label({ startunbounded: 1, stop: 3, stopinclusive: 1 }, binconfig),
		'≤3',
		'startunbounded + stopinclusive'
	)

	test.deepEqual(b.get_bin_label({ stopunbounded: 1, start: 30 }, binconfig), '>30', 'stopunbounded')

	test.equal(
		b.get_bin_label({ stopunbounded: 1, start: 25, startinclusive: 1 }, binconfig),
		'≥25',
		'stopunbounded + startinclusive'
	)

	test.equal(
		b.get_bin_label({ start: 1, stop: 5, startinclusive: 1 }, binconfig),
		'1 to 4',
		'startinclusive and not stopinclusive'
	)

	test.equal(
		b.get_bin_label({ start: 1, stop: 5, stopinclusive: 1, startinclusive: false }, binconfig),
		'>1 to 5',
		'not startinclusive but stopinclusive, so IGNORE label_offset'
	)

	test.equal(
		b.get_bin_label({ start: 1, stop: 5, stopinclusive: 1, startinclusive: 1 }, binconfig),
		'1 to 5',
		'both startinclusive and stopinclusive'
	)

	test.equal(
		b.get_bin_label({ start: 1, stop: 5 }, Object.assign({}, binconfig, { startinclusive: false })),
		'>1 to <5',
		'neither startinclusive nor stopinclusive'
	)

	const binconfig2 = {
		bin_size: 1,
		startinclusive: true,
		label_offset: 1,
		first_bin: {},
		results: {
			summary: {
				min: 0
			}
		}
	}
	test.equal(
		b.get_bin_label({ start: 1, stop: 2 }, binconfig2),
		'1',
		'single-number label when label_offset == abs(start - stop)'
	)

	const binconfig3 = {
		label_offset: 0.01,
		rounding: '.1f',
		bin_size: 3.0,
		first_bin: {},
		startinclusive: true,
		results: {
			summary: {
				min: 0
			}
		}
	}
	test.equal(b.get_bin_label({ start: 0.1, stop: 0.5 }, binconfig3), '0.1 to 0.5', 'label_offset=0.1')

	test.equal(
		b.get_bin_label({ start: 30, stopunbounded: true, startinclusive: true }, binconfig),
		'≥30',
		'stopunbounded'
	)

	test.end()
})

tape('get_bin_label(), label_offset=0', function(test) {
	const binconfig = {
		bin_size: 3,
		startinclusive: true,
		first_bin: {},
		results: {
			summary: {
				min: 0
			}
		}
	}
	test.equal(b.get_bin_label({ startunbounded: 1, stop: 3 }, binconfig), '<3', 'startunbounded')

	test.equal(
		b.get_bin_label({ startunbounded: 1, stop: 3, stopinclusive: 1 }, binconfig),
		'≤3',
		'startunbounded + stopinclusive'
	)

	test.deepEqual(b.get_bin_label({ stopunbounded: 1, start: 30 }, binconfig), '>30', 'stopunbounded')

	test.equal(
		b.get_bin_label({ stopunbounded: 1, start: 25, startinclusive: 1 }, binconfig),
		'≥25',
		'stopunbounded + startinclusive'
	)

	test.equal(
		b.get_bin_label({ start: 1, stop: 5, startinclusive: 1 }, binconfig),
		'1 to <5',
		'startinclusive (IGNORED) and not stopinclusive'
	)

	test.equal(
		b.get_bin_label({ start: 1, stop: 5, stopinclusive: 1, startinclusive: false }, binconfig),
		'>1 to 5',
		'not startinclusive but stopinclusive, so IGNORE label_offset'
	)

	test.equal(
		b.get_bin_label({ start: 1, stop: 5, stopinclusive: 1, startinclusive: 1 }, binconfig),
		'1 to 5',
		'both startinclusive and stopinclusive'
	)

	test.equal(
		b.get_bin_label({ start: 1, stop: 5 }, Object.assign({}, binconfig, { startinclusive: false })),
		'>1 to <5',
		'neither startinclusive nor stopinclusive'
	)

	const binconfig2 = {
		bin_size: 1,
		startinclusive: true,
		label_offset: 1,
		first_bin: {},
		results: {
			summary: {
				min: 0
			}
		}
	}
	test.equal(
		b.get_bin_label({ start: 1, stop: 2 }, binconfig2),
		'1',
		'single-number label when label_offset == abs(start - stop)'
	)

	const binconfig3 = {
		rounding: '.1f',
		bin_size: 3.0,
		first_bin: {},
		startinclusive: true,
		results: {
			summary: {
				min: 0
			}
		}
	}
	test.equal(b.get_bin_label({ start: 0.1, stop: 0.5 }, binconfig3), '0.1 to <0.5', 'startinclusive IGNORED')

	test.equal(
		b.get_bin_label({ start: 30, stopunbounded: true, startinclusive: true }, binconfig),
		'≥30',
		'stopunbounded'
	)

	test.end()
})

tape('compute_bins() unbounded', function(test) {
	test.deepLooseEqual(
		b.compute_bins({ bin_size: 5, label_offset: 1, first_bin: { startunbounded: 1, stop: 5 } }, get_summary),
		[
			{ startunbounded: 1, start: undefined, stop: 5, startinclusive: 1, stopinclusive: 0, label: '<5' },
			{ startinclusive: 1, stopinclusive: 0, start: 5, stop: 10, label: '5 to 9' },
			{ startinclusive: 1, stopinclusive: 0, start: 10, stop: 15, label: '10 to 14' },
			{ startinclusive: 1, stopinclusive: 0, start: 15, stop: 20, label: '15 to 19' }
		],
		'should default to unbounded firt and last bins, equally sized bins'
	)

	test.deepLooseEqual(
		b.compute_bins({ bin_size: 4, label_offset: 1, first_bin: { startunbounded: 1, stop: 2 } }, get_summary),
		[
			{ startunbounded: 1, start: undefined, stop: 2, startinclusive: 1, stopinclusive: 0, label: '<2' },
			{ startinclusive: 1, stopinclusive: 0, start: 2, stop: 6, label: '2 to 5' },
			{ startinclusive: 1, stopinclusive: 0, start: 6, stop: 10, label: '6 to 9' },
			{ startinclusive: 1, stopinclusive: 0, start: 10, stop: 14, label: '10 to 13' },
			{ startinclusive: 1, stopinclusive: 0, start: 14, stop: 18, label: '14 to 17' },
			{ startinclusive: 1, stopinclusive: 0, start: 18, stop: 20, label: '18 to 19' }
		],
		'should default to unbounded firt and last bins, not equally sized bins'
	)

	test.deepLooseEqual(
		b.compute_bins(
			{ bin_size: 6, label_offset: 1, first_bin: { startunbounded: 1, start_percentile: 4, start: 5, stop: 10 } },
			get_summary
		),
		[
			{ startunbounded: 1, start: undefined, stop: 10, startinclusive: 1, stopinclusive: 0, label: '<10' },
			{ startinclusive: 1, stopinclusive: 0, start: 10, stop: 16, label: '10 to 15' },
			{ startinclusive: 1, stopinclusive: 0, start: 16, stop: 20, label: '16 to 19' }
		],
		'should override start_percentile or start with startunbounded'
	)

	test.end()
})

tape('compute_bins() non-percentile', function(test) {
	test.deepLooseEqual(
		b.compute_bins({ bin_size: 3, label_offset: 1, first_bin: { start: 4 } }, get_summary),
		[
			{ startunbounded: undefined, start: 4, stop: 7, startinclusive: 1, stopinclusive: 0, label: '4 to 6' },
			{ startinclusive: 1, stopinclusive: 0, start: 7, stop: 10, label: '7 to 9' },
			{ startinclusive: 1, stopinclusive: 0, start: 10, stop: 13, label: '10 to 12' },
			{ startinclusive: 1, stopinclusive: 0, start: 13, stop: 16, label: '13 to 15' },
			{ startinclusive: 1, stopinclusive: 0, start: 16, stop: 19, label: '16 to 18' },
			{ startinclusive: 1, stopinclusive: 0, start: 19, stop: 20, label: '19' }
		],
		'should handle first_bin.start'
	)

	test.deepLooseEqual(
		b.compute_bins({ bin_size: 3, label_offset: 1, first_bin: { start: 4, stop: 8 } }, get_summary),
		[
			{ startunbounded: undefined, start: 4, stop: 8, startinclusive: 1, stopinclusive: 0, label: '4 to 7' },
			{ startinclusive: 1, stopinclusive: 0, start: 8, stop: 11, label: '8 to 10' },
			{ startinclusive: 1, stopinclusive: 0, start: 11, stop: 14, label: '11 to 13' },
			{ startinclusive: 1, stopinclusive: 0, start: 14, stop: 17, label: '14 to 16' },
			{ startinclusive: 1, stopinclusive: 0, start: 17, stop: 20, label: '17 to 19' }
		],
		'should handle first_bin.start + stop'
	)

	test.deepLooseEqual(
		b.compute_bins({ bin_size: 4, label_offset: 1, first_bin: { start: 4 }, last_bin: { stop: 15 } }, get_summary),
		[
			{ startunbounded: undefined, start: 4, stop: 8, startinclusive: 1, stopinclusive: 0, label: '4 to 7' },
			{ startinclusive: 1, stopinclusive: 0, start: 8, stop: 12, label: '8 to 11' },
			{ startinclusive: 1, stopinclusive: 0, start: 12, stop: 15, label: '12 to 14' }
		],
		'should handle last_bin.start'
	)

	test.deepLooseEqual(
		b.compute_bins(
			{ bin_size: 3, label_offset: 1, first_bin: { startunbounded: 1, stop: 3 }, last_bin: { start: 15, stop: 18 } },
			get_summary
		),
		[
			{ startunbounded: 1, start: undefined, stop: 3, startinclusive: 1, stopinclusive: 0, label: '<3' },
			{ startinclusive: 1, stopinclusive: 0, start: 3, stop: 6, label: '3 to 5' },
			{ startinclusive: 1, stopinclusive: 0, start: 6, stop: 9, label: '6 to 8' },
			{ startinclusive: 1, stopinclusive: 0, start: 9, stop: 12, label: '9 to 11' },
			{ startinclusive: 1, stopinclusive: 0, start: 12, stop: 15, label: '12 to 14' },
			{ startinclusive: 1, stopinclusive: 0, start: 15, stop: 18, label: '15 to 17' }
		],
		'should handle last_bin.start + stop'
	)

	test.deepLooseEqual(
		b.compute_bins(
			{
				bin_size: 1,
				label_offset: 1,
				first_bin: { start: 5, stopunbounded: 1, stop: 7, stopinclusive: 1 },
				last_bin: { start: 12, stopunbounded: 1 }
			},
			get_summary
		),
		[
			{ startunbounded: undefined, start: 5, stop: 7, startinclusive: 1, stopinclusive: 0, label: '5 to 6' },
			{ startinclusive: 1, stopinclusive: 0, start: 7, stop: 8, label: 7 },
			{ startinclusive: 1, stopinclusive: 0, start: 8, stop: 9, label: 8 },
			{ startinclusive: 1, stopinclusive: 0, start: 9, stop: 10, label: 9 },
			{ startinclusive: 1, stopinclusive: 0, start: 10, stop: 11, label: 10 },
			{ startinclusive: 1, stopinclusive: 0, start: 11, stop: 12, label: 11 },
			{ startinclusive: 1, stopinclusive: 0, start: 12, stop: 13, stopunbounded: true, label: '≥12' }
		],
		'should handle first_bins, last_bin'
	)

	test.end()
})

tape('target_percentiles()', function(test) {
	test.deepLooseEqual(
		b.target_percentiles(
			{ bin_size: 3, label_offset: 1, first_bin: { startunbounded: 1, stop_percentile: 4 } },
			get_summary
		),
		[4],
		'should find the first_bin.stop_percentile'
	)

	test.deepLooseEqual(
		b.target_percentiles(
			{
				bin_size: 3,
				label_offset: 1,
				first_bin: { start: 4 },
				first_bin: { stopunbounded: 1, start_percentile: 80 }
			},
			get_summary
		),
		[80],
		'should find the first_bin.stop_percentile'
	)

	test.deepLooseEqual(
		b.target_percentiles(
			{
				bin_size: 3,
				label_offset: 1,
				first_bin: { startunbounded: 1, start_percentile: 10, stop_percentile: 20 },
				last_bin: { stopunbounded: 1, start_percentile: 80, stop_percentile: 95 }
			},
			get_summary
		),
		[10, 20, 80, 95],
		'should find all configured percentiles'
	)

	test.end()
})

tape('compute_bins() percentile', function(test) {
	test.deepLooseEqual(
		b.compute_bins({ bin_size: 3, label_offset: 1, first_bin: { start_percentile: 10 } }, get_summary),
		[
			{ startunbounded: undefined, start: 2, stop: 5, startinclusive: 1, stopinclusive: 0, label: '2 to 4' },
			{ startinclusive: 1, stopinclusive: 0, start: 5, stop: 8, label: '5 to 7' },
			{ startinclusive: 1, stopinclusive: 0, start: 8, stop: 11, label: '8 to 10' },
			{ startinclusive: 1, stopinclusive: 0, start: 11, stop: 14, label: '11 to 13' },
			{ startinclusive: 1, stopinclusive: 0, start: 14, stop: 17, label: '14 to 16' },
			{ startinclusive: 1, stopinclusive: 0, start: 17, stop: 20, label: '17 to 19' }
		],
		'should handle first_bin.start_percentile'
	)

	test.deepLooseEqual(
		b.compute_bins(
			{ bin_size: 3, label_offset: 1, first_bin: { start_percentile: 10, stop_percentile: 20 } },
			get_summary
		),
		[
			{ startunbounded: undefined, start: 2, stop: 4, startinclusive: 1, stopinclusive: 0, label: '2 to 3' },
			{ startinclusive: 1, stopinclusive: 0, start: 4, stop: 7, label: '4 to 6' },
			{ startinclusive: 1, stopinclusive: 0, start: 7, stop: 10, label: '7 to 9' },
			{ startinclusive: 1, stopinclusive: 0, start: 10, stop: 13, label: '10 to 12' },
			{ startinclusive: 1, stopinclusive: 0, start: 13, stop: 16, label: '13 to 15' },
			{ startinclusive: 1, stopinclusive: 0, start: 16, stop: 19, label: '16 to 18' },
			{ startinclusive: 1, stopinclusive: 0, start: 19, stop: 20, label: '19' }
		],
		'should handle first_bin.start_percentile + stop_percentile'
	)

	test.deepLooseEqual(
		b.compute_bins(
			{ bin_size: 4, label_offset: 1, first_bin: { start: 4 }, last_bin: { start_percentile: 90, stopunbounded: 1 } },
			get_summary
		),
		[
			{ startunbounded: undefined, start: 4, stop: 8, startinclusive: 1, stopinclusive: 0, label: '4 to 7' },
			{ startinclusive: 1, stopinclusive: 0, start: 8, stop: 12, label: '8 to 11' },
			{ startinclusive: 1, stopinclusive: 0, start: 12, stop: 16, label: '12 to 15' },
			{ startinclusive: 1, stopinclusive: 0, start: 16, stop: 18, label: '16 to 17' },
			{ startinclusive: 1, stopinclusive: 0, start: 18, stop: 20, stopunbounded: 1, label: '≥18' }
		],
		'should handle last_bin.start_percentile'
	)

	test.deepLooseEqual(
		b.compute_bins(
			{
				bin_size: 4,
				label_offset: 1,
				first_bin: { start: 5 },
				last_bin: { start_percentile: 80, stop_percentile: 95 }
			},
			get_summary
		),
		[
			{ startunbounded: undefined, start: 5, stop: 9, startinclusive: 1, stopinclusive: 0, label: '5 to 8' },
			{ startinclusive: 1, stopinclusive: 0, start: 9, stop: 13, label: '9 to 12' },
			{ startinclusive: 1, stopinclusive: 0, start: 13, stop: 16, label: '13 to 15' },
			{ startinclusive: 1, stopinclusive: 0, start: 16, stop: 19, label: '16 to 18' }
		],
		'should handle last_bin.start_percentile + stop_percentile'
	)

	test.end()
})

tape('compute_bins() wgs_sample_age', function(test) {
	const stop = 17.1834269032
	const binconfig = {
		type: 'regular',
		bin_size: 13,
		label_offset: 1,
		startinclusive: true,
		rounding: 'd',
		first_bin: {
			startunbounded: true,
			stop,
			stopinclusive: true
		}
	}
	const bins = b.compute_bins(binconfig, () => {
		return { vmin: 4, vmax: 66, max: 66, min: 4 }
	})
	test.equal(bins.length, 5, 'should create 5 bins')
	test.equal(bins[0].label, '<' + Math.round(stop), 'should include the rounded first bin stop value in the bin label')
	test.equal(bins[4].label, '56 to 65', 'should include decimals in the last bin label')
	test.end()
})

tape('compute_bins() custom', function(test) {
	const binconfig = {
		type: 'custom',
		lst: [
			{
				startunbounded: true,
				stopinclusive: true,
				stop: 10
			},
			{
				start: 20,
				startinclusive: true,
				stopunbounded: true
			}
		]
	}
	test.deepEqual(b.compute_bins(binconfig), binconfig.lst, 'should simply copy binconfig.lst')
	test.end()
})
