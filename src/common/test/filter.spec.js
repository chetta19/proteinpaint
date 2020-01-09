const tape = require('tape')
const d3s = require('d3-selection')
const filterInit = require('../filter').filterInit

/*********
the direct functional testing of the component, without the use of runpp()

run it as:
$ npx watchify filterControls.spec.js -o ../../../public/bin/spec.bundle.js -v

*/

/*************************
 reusable helper functions
**************************/

function getOpts(_opts = {}) {
	const holder = d3s
		.select('body')
		.append('div')
		.style('position', 'relative')
		.style('margin', '20px')
		.style('border', '1px solid #000')

	const opts = Object.assign({ holder }, _opts)

	opts.filter = filterInit({
		btn: holder.append('div'),
		btnLabel: 'Filter',
		holder: holder.append('div'),
		genome: 'hg38',
		dslabel: 'SJLife',
		debug: true,
		callback: function(filter) {
			opts.filterData = filter
			opts.filter.main(opts.filterData)
		}
	})

	return opts
}

function sleep(ms) {
	return new Promise(resolve => setTimeout(resolve, ms))
}

async function addDemographicSexFilter(opts, btn) {
	btn.click()
	await sleep(200)
	// termdiv[1] is assumed to be Demographics
	const termdiv1 = opts.filter.Inner.dom.treeTip.d.node().querySelectorAll('.termdiv')[1]
	termdiv1.querySelectorAll('.termbtn')[0].click()
	await sleep(200)

	const termdivSex = termdiv1.querySelectorAll('.termdiv')[2]
	termdivSex.querySelectorAll('.termview')[0].click()
	await sleep(800)

	termdivSex.querySelector('.bars-cell > rect').dispatchEvent(new Event('click', { bubbles: true }))
}

/**************
 test sections
***************/

tape('\n', test => {
	test.pass('-***- common/filter -***-')
	test.end()
})

tape('empty root filter', async test => {
	const opts = getOpts({
		filterData: {
			type: 'tvslst',
			join: '',
			lst: []
		}
	})

	const tipd = opts.filter.Inner.dom.controlsTip.d
	await opts.filter.main(opts.filterData)
	test.notEqual(
		opts.holder.node().querySelector('.sja_new_filter_btn').style.display,
		'none',
		'should show the +NEW button'
	)
	test.equal(
		opts.holder.node().querySelector('.sja_filter_container').style.display,
		'none',
		'should hide the filter container div'
	)

	// simulate creating the initial filter
	await addDemographicSexFilter(opts, opts.holder.node().querySelector('.sja_new_filter_btn'))
	test.equal(opts.filterData.lst.length, 1, 'should create a one-entry filter.lst[]')
	// behavioral repeat of the data-only test for
	// a single-entry root filter test
	//test.equal(opts.holder.select('.sja_new_filter_btn').style('display'), 'none', 'should hide the +NEW button')
	test.notEqual(
		opts.holder.select('.sja_filter_container').style('display'),
		'none',
		'should show the filter container div'
	)
	test.equal(
		tipd
			.selectAll('.sja_filter_lst_appender')
			.filter(function() {
				return this.style.display !== 'none'
			})
			.size(),
		0,
		'should hide all filter list appender buttons'
	)

	opts.holder
		.select('.sja_filter_div_mask')
		.node()
		.click()
	await sleep(50)
	// remove the only entry from root filter.lst[]
	tipd
		.selectAll('tr')
		.filter(d => d.action == 'remove')
		.node()
		.click()

	await sleep(200)
	await opts.filter.main(opts.filterData)
	test.notEqual(
		opts.holder.node().querySelector('.sja_new_filter_btn').style.display,
		'none',
		'should show the +NEW button'
	)
	test.equal(
		opts.holder.node().querySelector('.sja_filter_container').style.display,
		'none',
		'should hide the filter container div'
	)

	test.end()
})

tape.skip('root filter with a single-entry', async test => {
	const opts = getOpts({
		filterData: {
			type: 'tvslst',
			join: '',
			lst: [
				{
					type: 'tvs',
					tvs: {
						term: {
							id: 'abc',
							name: 'ABC',
							iscategorical: true
						},
						values: [
							{
								key: 'cat1',
								label: 'val 1'
							}
						]
					}
				}
			]
		}
	})

	await sleep(150)
	const tipd = opts.filter.Inner.dom.controlsTip.d
	await opts.filter.main(opts.filterData)

	//test.equal(opts.holder.select('.sja_new_filter_btn').style('display'), 'none', 'should hide the +NEW button')
	test.notEqual(
		opts.holder.select('.sja_filter_container').style('display'),
		'none',
		'should show the filter container div'
	)
	test.equal(
		tipd.node().querySelector('.sja_filter_add_transformer').style.display,
		'none',
		'should hide the filter adder button'
	)
	test.notEqual(
		tipd.node().querySelector('.sja_filter_remove_transformer').style.display,
		'none',
		'should show the filter remover button'
	)

	opts.holder
		.select('.sja_filter_div_mask')
		.node()
		.click()

	// simulate appending another tvs to the root filter.lst[]
	const lstAppender = tipd.node().querySelector('.sja_filter_lst_appender')
	await addDemographicSexFilter(opts, lstAppender)
	test.equal(opts.filterData.lst.length, 2, 'should create a two-entry filter.lst[]')
	//test.equal(opts.holder.select('.sja_new_filter_btn').style('display'), 'none', 'should hide the +NEW button')
	test.notEqual(
		opts.holder.select('.sja_filter_container').style.display,
		'none',
		'should show the filter container div'
	)
	const addTransformer = tipd.select('.sja_filter_add_transformer').node()
	test.notEqual(addTransformer.style.display, 'none', 'should show the filter adder button')
	test.notEqual(
		addTransformer.innerHTML,
		lstAppender.innerHTML,
		'should label the add-transformer button with the opposite of the lst-appender button label'
	)
	test.notEqual(
		tipd.select('.sja_filter_remove_transformer').style.display,
		'none',
		'should show the filter remover button'
	)
	test.notEqual(tipd.select('.sja_filter_join_label').style.display, 'none', 'should show the filter join label')
	test.equal(
		tipd
			.selectAll('.sja_filter_lst_appender')
			.filter(function() {
				return this.style.display !== 'none'
			})
			.size(),
		1,
		'should show 1 filter list appender buttons'
	)
	await sleep(100)

	const secondItemRemover = tipd.node().querySelectorAll('.sja_filter_remove_transformer')[1]
	secondItemRemover.click()
	await sleep(300)
	//test.equal(opts.holder.select('.sja_new_filter_btn').style('display'), 'none', 'should hide the +NEW button')
	test.notEqual(
		opts.holder.select('.sja_filter_container').style('display'),
		'none',
		'should show the filter container div'
	)
	test.equal(tipd.select('.sja_filter_add_transformer').style('display'), 'none', 'should hide the filter adder button')
	test.notEqual(
		tipd.select('.sja_filter_remove_transformer').style('display'),
		'none',
		'should show the filter remover button'
	)
	test.equal(tipd.select('.sja_filter_join_label').style('display'), 'none', 'should hide the filter join label')

	test.end()
})

tape.skip('root filter with nested filters', async test => {
	const opts = getOpts({
		filterData: {
			type: 'tvslst',
			in: true,
			join: 'and',
			lst: [
				{
					type: 'tvs',
					tvs: {
						term: {
							id: 'abc',
							name: 'ABC',
							iscategorical: true
						},
						values: [
							{
								key: 'cat1',
								label: 'val 1'
							}
						]
					}
				},
				{
					type: 'tvslst',
					in: true,
					join: 'or',
					lst: [
						{
							type: 'tvs',
							tvs: {
								term: {
									id: 'abc',
									name: 'ABC',
									iscategorical: true
								},
								values: [
									{
										key: 'cat2',
										label: 'val 2'
									}
								]
							}
						},
						{
							type: 'tvs',
							tvs: {
								term: {
									id: 'xyz',
									name: 'XYZ',
									iscategorical: true
								},
								values: [
									{
										key: 'catx',
										label: 'Cat X'
									}
								]
							}
						}
					]
				}
			]
		}
	})

	const tipd = opts.filter.Inner.dom.controlsTip.d
	await opts.filter.main(opts.filterData)
	//test.equal(opts.holder.select('.sja_new_filter_btn').style('display'), 'none', 'should hide the +NEW button')
	test.notEqual(
		opts.holder.select('.sja_filter_container').style('display'),
		'none',
		'should show the filter container div'
	)
	test.equal(
		tipd.select('.sja_filter_add_transformer').style('display'),
		'inline-block',
		'should show the filter adder button'
	)
	test.equal(
		tipd.select('.sja_filter_remove_transformer').style('display'),
		'inline-block',
		'should show the filter remover button'
	)
	const joinLabelsA = opts.holder.node().querySelectorAll('.sja_filter_join_label')
	test.notEqual(joinLabelsA[0].style.display, 'none', 'should show the join label after the first item')
	test.equal(
		joinLabelsA[joinLabelsA.length - 1].style.display,
		'none',
		'should hide the join label after the last item'
	)

	const grpDivsA = tipd.node().querySelectorAll('.sja_filter_grp')
	test.equal(grpDivsA[0].style.border, 'none', 'should not show a border around the root-level group')
	test.notEqual(grpDivsA[1].style.border, 'none', 'should show a border around a filter with >1 terms')

	const nestedItemRemover = tipd.node().querySelectorAll('.sja_filter_remove_transformer')[2]
	nestedItemRemover.click()
	await sleep(300)
	const grpDivsB = tipd.node().querySelectorAll('.sja_filter_grp')
	test.equal(
		opts.filterData.lst.length,
		2,
		'should create a two-entry root filter.lst[] after editing the nested group to one-item'
	)
	test.equal(
		opts.filterData.lst.filter(d => !('lst' in d)).length,
		2,
		'should create tvs-only items in root filter.lst[]'
	)
	test.equal(grpDivsB[0].style.border, 'none', 'should not show a border around the root group')
	test.notEqual(joinLabelsA[0].style.display, 'none', 'should show the join label after the first item')
	test.equal(
		joinLabelsA[joinLabelsA.length - 1].style.display,
		'none',
		'should hide the join label after the last item'
	)

	const addTransformer = tipd.node().querySelectorAll('.sja_filter_add_transformer')[0]
	await addDemographicSexFilter(opts, addTransformer)
	const grpDivsC = tipd.node().querySelectorAll('.sja_filter_grp')
	test.notEqual(
		grpDivsC[1].style.border,
		'none',
		'should show a border around the first root filter.lst[] item, which is now a subnested group'
	)
	test.equal(grpDivsC[0].style.border, 'none', 'should not show a border around the root group')
	test.notEqual(joinLabelsA[0].style.display, 'none', 'should show the join label after the first item')
	test.equal(
		joinLabelsA[joinLabelsA.length - 1].style.display,
		'none',
		'should hide the join label after the last item'
	)

	test.end()
})
