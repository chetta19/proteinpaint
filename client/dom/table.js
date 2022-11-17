import { select, style } from 'd3'
import { defaultcolor } from '../shared/common'

/*
print an html table, using the specified columns and rows

input:

div = d3-wrapped holder

columns = [ {label} ]
	each element is an object describing a column
	label: str, the text to show as header of a column
	width: str, column width

rows = [ [] ]
	each element is an array of cells for a row, with array length must matching columns.length
	a cell can be single value, or multi value:

	single value cell: 
	{
		url: string, to print in <a> element
		html: string, to print with .html() d3 method, may be susceptible to attack
		value: to print with .text() d3 method
		
	}

	multi-value cell:
	{
		values: [
			{url/html/value}, {}, ...
		]
	}
style = {}

	max_width: str, the max width of the table, if not provided is set to 90vw
	max_height: str, the max height of the table, if not provided is set to 40vh
	row_height: str, the height of the row

buttons = [ {button} ]
	Each element is an object describing a button:
	text: str, the text to show in the button
	callback: function, the function to be called when the button is clicked
	
*/
export async function renderTable({ columns, rows, div, style = {}, buttons }) {
	const numColumns = columns.length

	// create a Parent Div element to which the header and sample table will be appended as divH and divS.
	const parentDiv = div
		.style('padding', '5px')
		.style('background-color', 'white')
		.append('table')
		.style('display', 'block')
		.style('background-color', 'white')
		//.attr('class', 'sjpp_table_container')
		//.style('table-template-columns', `1.5vw ${buttons ? '2vw' : ''} repeat(${numColumns}, auto)`)
		.style('max-width', style.max_width ? style.max_width : '90vw')

	// header div
	const divH = parentDiv
		.append('thead')
		.style('display', 'table')
		.style('table-layout', 'fixed')
		.style('width', '100%')
		.append('tr')
	divH
		.append('th')
		.attr('class', 'sjpp_table_item sjpp_table_header')
		.text('#')
		.style('width', '1.5vw')
	if (buttons) {
		const cell = divH
			.append('th')
			.attr('class', 'sjpp_table_header sjpp_table_item')
			.style('width', '1.5vw')

		const checkboxH = cell
			.append('input')
			.attr('type', 'checkbox')
			.on('change', () => {
				table.selectAll('input').property('checked', checkboxH.node().checked)
				enableButtons()
			})
	}

	// header values
	for (const c of columns) {
		const th = divH
			.append('th')
			.text(c.label)
			.attr('class', 'sjpp_table_item sjpp_table_header')
		if (c.width) th.style('width', c.width)
	}

	const table = parentDiv
		.append('tbody')
		.style('display', 'block')
		.style('max-height', style.max_height ? style.max_height : '40vw')
		.style('overflow', 'scroll')

	for (const [i, row] of rows.entries()) {
		const rowtable = table
			.append('tr')
			.attr('class', 'sjpp_row_wrapper')
			.style('display', 'table')
			.style('table-layout', 'fixed')
			.style('width', '100%')

		const lineDiv = rowtable
			.append('td')
			.text(i + 1)
			.style('width', '1.5vw')
			.style('font-size', '0.8rem')
			.style('color', defaultcolor)
			.attr('class', 'sjpp_table_item')

		if (buttons) {
			const checkbox = rowtable
				.append('td')
				.style('width', '1.5vw')
				.attr('class', 'sjpp_table_item')
				.style('float', 'center')
				.append('input')
				.attr('type', 'checkbox')
				.attr('value', i)
				.on('change', () => enableButtons())
		}

		for (const [colIdx, cell] of row.entries()) {
			const td = rowtable.append('td').attr('class', 'sjpp_table_item')
			const column = columns[colIdx]
			if (column.width) td.style('width', column.width)

			if (cell.values) {
				for (const v of cell.values) {
					// if those values have url in them then tag it to the sample name/id otherwise just append the value of that cell onto the td
					if (v.url) {
						td.append('a')
							.text(v.value)
							.attr('href', v.url)
							.attr('target', '_blank')
					} else if (v.html) {
						td.html(v.html)
					} else {
						td.text(v.value)
					}
				}
			} else if (cell.url) {
				td.append('a')
					.text(cell.value)
					.attr('href', cell.url)
					.attr('target', '_blank')
			} else if (cell.html) {
				td.html(cell.html)
			} else if (cell.value) {
				td.text(cell.value)
			}
		}
	}
	if (buttons) {
		const footerDiv = div
			.append('div')
			.style('display', 'inline-block')
			.style('float', 'right')
			.style('margin', '5px 5px')

		for (const button of buttons) {
			const values = []

			button.button = footerDiv
				.append('button')
				.attr('disabled', true)
				.text(button.text)
				.style('margin-right', '10px')
				.on('click', e => {
					const checkboxs = table.selectAll('input:checked')
					if (!checkboxs.empty()) {
						checkboxs.each((d, i, nodes) => {
							const node = nodes[i]
							values.push(parseInt(node.value))
						})
						button.callback(values)
					}
				})
		}
	}

	function enableButtons() {
		const checkboxs = table.selectAll('input:checked')
		for (const button of buttons) button.button.node().disabled = checkboxs.empty()
	}
}
