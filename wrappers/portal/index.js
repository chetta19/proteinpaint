// import * as React from 'react'
import { runproteinpaint } from 'pp-react'
import * as common from '../../src/common'
import { select } from 'd3-selection'

console.log('test ....')
console.log(common.defaultcolor)
//console.log(common.d3color)
//console.log(common.Partjson)
console.log(10, runproteinpaint)

/*
runproteinpaint({
	holder: select('body').append('div').node(),
	noheader:1,
	nobox:true,
	termdb:{
		dev:true,
		state:{
			dslabel:'SJLife',
			genome:'hg38',
			termfilter: {
				afilter:{
					type:'tvslst',
					join:'',
					in:true,
					lst:[
						{type:'tvs',tvs: {
							term: {id: "aaclassic_5", name: "Cumulative Alkylating Agent (Cyclophosphamide Equivalent Dose)", type:'float',
								"values":{
        					        "0": { "label":"Not exposed", "uncomputable":true },
                					"-8888": { "label":"Exposed but dose unknown", "uncomputable":true },
                					"-9999": { "label":"Unknown treatment record", "uncomputable":true }
        						}
							},
							ranges: [
								{ value: '0', label: "Not exposed"},
								{startunbounded:true,stop:2000,stopinclusive:true}
							]
						}}
					]
				}
			},
			nav: {
				header_mode: 'with_tabs',
			},
			activeCohort:-1
		},
		barchart:{
			bar_click_opts:['hide_bar','add_filter','select_to_gp']
		}
	}
})*/
