import {event as d3event} from 'd3-selection'
import * as client from './client'
import * as bulk from './bulk'
import * as bulksnv from './bulk.snv'
import * as bulksv from './bulk.sv'
import * as bulksvjson from './bulk.svjson'
import * as bulkcnv from './bulk.cnv'
import * as bulkitd from './bulk.itd'
import * as bulkdel from './bulk.del'
import * as bulktrunc from './bulk.trunc'
import {ProjectHandler} from './bulk.project'
import * as common from './common'
import {tpinit} from './tp.init'


/*


for generating the UI that prompts user to select file type & upload text file


bulkui()

content2flag()

bulkin()

bulkembed()


*/









export function bulkui(x,y,genomes, hostURL) {
	const [pane,inputdiv,gselect,filediv,saydiv,visualdiv]=client.newpane3(x,y,genomes)
	pane.header.text('Load mutation from text files')
	inputdiv.append('div').style('margin','20px 0px').style('color','#858585').html(`
	<p>Choose one file and upload to initiate the display panel.<br>From there you can add additional files.</p>
	<div>Supported data types:</div>
	<ul>
	  <li>SNV and indel</li>
	  <ul>
	    <li><a href=https://drive.google.com/open?id=1OJ9aXq2_-a3BfIQdKLYCYzrJRTpu4_9i3gephTY-Z38 target=_blank>Format</a>,
	        <a href=https://www.dropbox.com/s/h61yiotf0x8ciji/example.snvindel.txt?dl=0 target=_blank>example file</a></li>
	  </ul>
	  <li>SV or fusion transcript</li>
	  <ul>
	    <li><a href=https://drive.google.com/open?id=1klDZ0MHVkQTW2-lCu_AvpRE4_FcbhdB-yI17wNdPaOM target=_blank>Tabular format</a>,
	        <a href=https://www.dropbox.com/s/4nu35t7s4ux0k36/example.svfusion.txt?dl=0 target=_blank>example file</a>
		</li>
		<li>JSON-format, to come</li>
	  </ul>
	  <li>CNV, gene-level</li>
	  <ul>
	    <li><a href=https://drive.google.com/open?id=1WHptqOWNf96V0bYEDpj-EsKZGYnbBNc9aQIrhzdEJaU target=_blank>Format</a>, 
	        <a href=https://www.dropbox.com/s/qg0dq2yq76wj8mi/example.cnv.txt?dl=0 target=_blank>example file</a>
		</li>
	  </ul>
	  <li>ITD</li>
	  <ul>
	  	<li>Internal tandem duplication, in-frame</li>
	    <li><a href=https://drive.google.com/open?id=1Bh9awBsraoHbV8iWXv_3oDeXMsjIAHaOKHr973IJyZc target=_blank>Format</a>, 
	        <a href=https://www.dropbox.com/s/h4enlvtti2n8flu/example.itd.txt?dl=0 target=_blank>example file</a>
		</li>
	  </ul>
	  <li>Intragenic deletion, in-frame</li>
	  <ul>
	    <li><a href=https://drive.google.com/open?id=1tWbf3rg3BmVIZPGGPk023P0aBkDw_ry5XuZLGyGodyg target=_blank>Format</a>, 
	        <a href=https://www.dropbox.com/s/kyedh7ronyyb4xu/example.deletion.txt?dl=0 target=_blank>example file</a>
		</li>
	  </ul>
	  <li>Truncation</li>
	  <ul>
	  	<li>Either N-terminus loss or C-terminus loss</li>
	    <li><a href=https://drive.google.com/open?id=1P1g-Y8r30pSKfan1BhYZcsUtSk7wRb4plaO1S-JCJr4 target=_blank>Format</a>, 
	        <a href=https://www.dropbox.com/s/2a1fvyzmcjrrpyi/example.truncation.txt?dl=0 target=_blank>example file</a>
		</li>
	  </ul>
	</ul>`)


	const fileui=()=>{
		filediv.selectAll('*').remove()
		
		// create a separate project handler for each bulk ui pane
		new ProjectHandler({
			bulkin,
			genomes,
			gselect,
			content2flag,
			flag2tp,
			filediv,
			init_bulk_flag: bulk.init_bulk_flag
		});
		
		filediv.append('span').html('Select data type&nbsp;')
		const typeselect=client.filetypeselect(filediv).style('margin-right','20px')


		// TODO vcf, new tabular formats
		const butt=filediv.append('input').attr('type','file').on('change',()=>{
			const flag=bulk.init_bulk_flag(genomes[gselect.options[gselect.selectedIndex].innerHTML])
			saydiv.text('')
			const file=d3event.target.files[0]
			if(!file) {
				fileui()
				return
			}
			if(file.size==0) {
				saydiv.text('Wrong file: '+file.name)
				fileui()
				return
			}
			const reader=new FileReader()
			reader.onload=(event)=>{

				const error=content2flag(
					event.target.result,
					typeselect.node().selectedIndex,
					flag
				)

				if(error) {
					saydiv.text('Error: '+error)
					fileui()
					return
				}

				flag2tp(flag,file)
			}
			reader.onerror=function(){
				saydiv.text('Error reading file '+file.name)
				fileui()
				return
			}
			saydiv.text('Parsing file '+file.name+' ...')
			reader.readAsText(file,'utf8')
		})
		butt.node().focus()
	}
	fileui()

	// has to keep this function here because 
	// of referece to x,y,hostURL,etc closured variables 
	function flag2tp(flag,file,_cohort=null,ds=null) {
		if (typeof flag=='string') {
			saydiv.text(flag)
			fileui()
			return
		}
		saydiv.text('')
		fileui()
		// good data ready
		
		const cohort = _cohort ? _cohort : Object.assign({
			genome:flag.genome,
			name:file.name,
		});


		const err=bulkin({
			flag:flag,
			filename:file.name,
			cohort:cohort,
			flag2thisds: ds
		})
		if(err) {
			saydiv.text('Error with '+file.name+': '+err)
			return
		}

		if(flag.good==0) {
			saydiv.text('No mutations can be loaded')
			return
		}
		client.disappear(pane.pane)
		const pane2=client.newpane({x:x+100,y:y+100,toshrink:true})
		pane2.header.html('<span style="opacity:.5">FILE</span> '+file.name)
		import('./tp.ui').then(tpui=>{
			tpui.default(cohort,pane2.body, hostURL)
		});
		return cohort;
	}

	return function content2flag2tp(file,type){

		// testing only
		// to load text files from server public/

		const error=content2flag(file.content,type,flag)

		if(error) {
			saydiv.text('Error: '+error)
			fileui()
			return
		}

		flag2tp(flag,file)
	}
}






export function content2flag(text, type, flag) {
	/*
	text:
		entire text loaded from a file
	type:
		numeric index of options in the <select> that corresponds to data types, solely defined in bulkui()
	flag:
		the old flag variable

	upon any error, return string as error message
	*/

	if(!flag) return 'should not happen!'

	let err
	switch(type) {
	case 0:
		err = parse_snvindel(text, flag)
		if(err) return err
		break
	case 1:
		err = parse_sv(text, flag, true)
		if(err) return err
		break
	case 2:
		err = parse_sv(text, flag, false)
		if(err) return err
		break
	case 3:
		err = parse_itd(text, flag)
		if(err) return err
		break
	case 4:
		err = parse_del(text, flag)
		if(err) return err
		break
	case 5:
		err = parse_trunc(text, flag)
		if(err) return err
		break
	case 6:
		err = parse_cnv(text, flag)
		if(err) return err
		break
	default:
		return 'unknown option array index from file type <select>: '+type
	}
}





export function bulkin(p,callback=null) {
	/*
	must always call this for ds-to-cohort flow

	p {} keys:

	flag - flag object
	cohort - cohort object
	filename - str
	flag2thisds - dataset object

	if flag2thisds is set:
		flag.data will be appended to the given ds
		ds must already have data
		new data from flag must have the same attributes with existing data, so will compare and abort upon any difference
	else:
		create a new dataset for flag.data and put in cohort
	*/
	const flag=p.flag
	const cohort=p.cohort
	if(!cohort.p2st) {
		cohort.p2st={}
	}
	if(!cohort.dsset) {
		cohort.dsset={}
	}
	if(!cohort.assaylst) {
		cohort.assaylst=[]
	}
	if(flag.variantgene) {
		if(cohort.variantgene) {
			return 'variantgene already set for this cohort'
		}
		cohort.variantgene=flag.variantgene
	}
	if(flag.snv.badlines.length>0) {
		client.bulk_badline(flag.snv.header,flag.snv.badlines)
	}
	if(flag.fusion.badlines.length>0) {
		client.bulk_badline(flag.fusion.header,flag.fusion.badlines)
	}
	if(flag.sv.badlines.length>0) {
		client.bulk_badline(flag.sv.header,flag.sv.badlines)
	}
	if(flag.cnv.badlines.length>0) {
		client.bulk_badline(flag.cnv.header,flag.cnv.badlines)
	}
	if(flag.itd.badlines.length>0) {
		client.bulk_badline(flag.itd.header,flag.itd.badlines)
	}
	if(flag.del.badlines.length>0) {
		client.bulk_badline(flag.del.header,flag.del.badlines)
	}
	if(flag.truncation.badlines.length>0) {
		client.bulk_badline(flag.truncation.header,flag.truncation.badlines)
	}
	// newdt
	if(flag.good==0) {
		return false
	}
	// registering good data
	const tmp={}
	let hastumormaf=false
	if(flag.snv.loaded) {
		for(const i of flag.snv.header) {
			tmp[i]=1
		}
		if('maf_tumor_v1' in tmp && 'maf_tumor_v2' in tmp) {
			hastumormaf=true
		}
	}
	if(flag.cnv.loaded) {
		for(const i of flag.cnv.header) {
			tmp[i]=1
		}
	}
	if(flag.fusion.loaded) {
		for(const i of flag.fusion.header) {
			tmp[i]=1
		}
	}
	if(flag.sv.loaded) {
		for(const i of flag.sv.header){
			tmp[i]=1
		}
	}
	if(flag.itd.loaded) {
		for(const i of flag.itd.header){
			tmp[i]=1
		}
	}
	if(flag.del.loaded) {
		for(const i of flag.del.header){
			tmp[i]=1
		}
	}
	if(flag.truncation.loaded) {
		for(const i of flag.truncation.header){
			tmp[i]=1
		}
	}
	// newdt

	// attributes of flag.data
	const hassample= ('sample' in tmp) || ('patient' in tmp)
	const hasdisease= 'disease' in tmp
	const hasst= 'sampletype' in tmp

	let dsc
	if(p.flag2thisds) {
		dsc=p.flag2thisds
		// flag data to existing ds
		// compare attributes
		if(hassample && !dsc.hassample) {
			return '"sample" column found in new data but not in existing data'
		}
		if(!hassample && dsc.hassample) {
			return '"sample" column found in existing data but not in new data'
		}
		if(hasdisease && !dsc.hasdisease) {
			return '"disease" column found in new data but not in existing data'
		}
		if(!hasdisease && dsc.hasdisease) {
			return '"disease" column found in existing data but not in new data'
		}
		if(hasst && !dsc.hasst) {
			return '"sampletype" column found in new data but not in existing data'
		}
		if(!hasst && dsc.hasst) {
			return '"sampletype" column found in existing data but not in new data'
		}

		for(const genename in flag.data) {
			const lst=dsc.bulkdata[genename]
			if(lst) {
				dsc.bulkdata[genename]=lst.concat(flag.data[genename])
			} else {
				dsc.bulkdata[genename]=flag.data[genename]
			}
		}
	} else { 
		let dsname=p.filename+(flag.tpsetname ? '_'+flag.tpsetname : '');
		if(dsname in flag.genome.datasets) {
			let j=1
			let n2=dsname+' '+j
			while(n2 in flag.genome.datasets) {
				j++
				n2=dsname+' '+j
			}
			dsname=n2
		}
		dsc={
			label:dsname,
			bulkdata:flag.data, // official dataset don't have this
			hassample:hassample,
			hasdisease:hasdisease,
			hastumormaf:hastumormaf,
			hasst:hasst,
			genome:cohort.genome,
			import:{},
			imported:{},
			importsilent: (flag.snv.silent==0 ? false : (flag.snv.missense/flag.snv.silent >=5 ? false : true)),
			}
		flag.genome.datasets[dsname]=dsc
		cohort.dsset[dsname]=dsc
		if(cohort.dbexpression) {
			if(cohort.dbexpression.tidy) {
				try{
					cohort.dbexpression.tidy=eval('('+cohort.dbexpression.tidy+')')
				} catch(e){
					err('invalid JavaScript for dbexpression.tidy')
					// disable whole thing
					delete cohort.dbexpression
				}
			}
			dsc.dbexpression=cohort.dbexpression
		}
		if(hasdisease) {
			dsc.stratify=[
				{
					label:'disease',
					attr1:{k:'disease',label:'disease'}
				}
			]
		}
	}
	// flag.data to cohort.p2st
	// must not use bulkdata since when appending data to ds, avoid double counting samples
	if(hassample) {
		for(const gene in flag.data) {
			for(const m of flag.data[gene]) {
				let pn=m.patient
				if(!pn) {
					pn=m.sample
					if(!pn) {
						continue
					}
				}
				if(!cohort.p2st[pn]) {
					cohort.p2st[pn]={}
				}
				let st=m.sampletype
				if(!st) {
					// note this!!!
					st=pn
				}
				if(!cohort.p2st[pn][st]) {
					cohort.p2st[pn][st]={
						dsset:{},
						tktemplate:[]
					}
				}
				if(!cohort.p2st[pn][st].dsset[dsc.label]) {
					cohort.p2st[pn][st].dsset[dsc.label]=[]
				}
				cohort.p2st[pn][st].dsset[dsc.label].push(m)
				// XXX for sv/fusion, each n-gene record will be created into n records in flag.data,
				// thus making duplicated data in sample.dsset
				// dealt by svpairlstset in tp.sample.js
			}
		}
	}
	if (callback) callback();
	return false
}





export function bulkembed(arg) {
	/*
	called by app.js, when there is the studyview object in the parameter

	arg is the studyview object
	
	TWO ways to provide text mutation data:

	.snvindel
	.svjson
	.cnv
		-- data as text string
		-- parse into one flag

	.mutationset:[{ }]
		-- standard study config
		-- parse into one or more flags

	*/

	if(!arg.name) arg.name='Unamed dataset'

	let holder=arg.holder
	if(!holder) {
		const pane=client.newpane({x:100,y:100})
		holder=pane.body
	}

	const saydiv=holder.append('div')

	new Promise((resolve, reject)=>{
		
		const cohort = {
			dsset: {}
		}
		for(const k in arg) {
			if(k=='snvindel' || k=='svjson' || k=='cnv' || k=='mutationset') {
				// don't copy these to cohort
				continue
			}
			cohort[k] = arg[k]
		}
		resolve(cohort)
	})

	.then( cohort => {

		if(!arg.snvindel && !arg.svjson && !arg.cnv) return cohort

		/************ parse data by lumped text string, tabular format
		*/

		const flag = bulk.init_bulk_flag(cohort.genome)

		if(arg.snvindel) {
			const e = parse_snvindel(arg.snvindel, flag)
			if(e) throw({message:'error in snvindel data: '+e})
			delete arg.snvindel
		}
		if(arg.svjson) {
			const e = parse_svjson(arg.svjson, flag)
			if(e) throw({message: 'error in svjson data: '+e})
			delete arg.svjson
		}
		if(arg.cnv) {
			const e = parse_cnv(arg.cnv, flag)
			if(e) throw({message: 'error in cnv data: '+e})
			delete arg.cnv
		}

		const err = bulkin({
			flag:flag,
			filename:arg.name,
			cohort:cohort, 
		})
		if(err) throw({message:'Error parsing data: '+err})
		return cohort
	})

	.then( cohort => {

		if(!arg.mutationset) return cohort
		if(!Array.isArray(arg.mutationset)) throw({message:'mutationset is not an array'})

		/************ load server hosted text files, in groups
		*/

		const tasks2 = []

		for(const mset of arg.mutationset) {

			const flag = bulk.init_bulk_flag(cohort.genome)
			const tasks = []

			if(mset.snvindel) {
				const req = new Request(arg.hostURL+'/textfile',{
					method:'POST',
					body:'{"file":"'+mset.snvindel+'"}'
				})
				const task = fetch(req)
					.then(data=>{return data.json()})
					.then(data=>{
						if(data.error) throw({message:'error with snvindel file: '+data.error})
						const e = parse_snvindel(data.text, flag)
						if(e) throw({message:'error with snvindel file: '+e})
					})
				tasks.push( task )
			}
			if(mset.cnv) {
				const req = new Request(arg.hostURL+'/textfile',{
					method:'POST',
					body:'{"file":"'+mset.cnv+'"}'
				})
				const task = fetch(req)
					.then(data=>{return data.json()})
					.then(data=>{
						if(data.error) throw({message:'error with cnv file: '+data.error})
						const e = parse_cnv(data.text, flag)
						if(e) throw({message:'error with cnv file: '+e})
					})
				tasks.push( task )
			}
			if(mset.sv) {
				const req = new Request(arg.hostURL+'/textfile',{
					method:'POST',
					body:'{"file":"'+mset.sv+'"}'
				})
				const task = fetch(req)
					.then(data=>{return data.json()})
					.then(data=>{
						if(data.error) throw({message:'error with sv file: '+data.error})
						const e = parse_sv(data.text, flag, true)
						if(e) throw({message:'error with sv file: '+e})
					})
				tasks.push( task )
			}
			if(mset.fusion) {
				const req = new Request(arg.hostURL+'/textfile',{
					method:'POST',
					body:'{"file":"'+mset.fusion+'"}'
				})
				const task = fetch(req)
					.then(data=>{return data.json()})
					.then(data=>{
						if(data.error) throw({message:'error with fusion file: '+data.error})
						const e = parse_sv(data.text, flag, false)
						if(e) throw({message:'error with fusion file: '+e})
					})
				tasks.push( task )
			}
			if(mset.svjson) {
				const req = new Request(arg.hostURL+'/textfile',{
					method:'POST',
					body:'{"file":"'+mset.svjson+'"}'
				})
				const task = fetch(req)
					.then(data=>{return data.json()})
					.then(data=>{
						if(data.error) throw({message:'error with svjson file: '+data.error})
						const e = parse_svjson(data.text, flag, false)
						if(e) throw({message:'error with svjson file: '+e})
					})
				tasks.push( task )
			}
			if(mset.deletion) {
				const req = new Request(arg.hostURL+'/textfile',{
					method:'POST',
					body:'{"file":"'+mset.deletion+'"}'
				})
				const task = fetch(req)
					.then(data=>{return data.json()})
					.then(data=>{
						if(data.error) throw({message:'error with deletion file: '+data.error})
						const e = parse_del(data.text, flag, false)
						if(e) throw({message:'error with deletion file: '+e})
					})
				tasks.push( task )
			}
			if(mset.truncation) {
				const req = new Request(arg.hostURL+'/textfile',{
					method:'POST',
					body:'{"file":"'+mset.truncation+'"}'
				})
				const task = fetch(req)
					.then(data=>{return data.json()})
					.then(data=>{
						if(data.error) throw({message:'error with truncation file: '+data.error})
						const e = parse_trunc(data.text, flag, false)
						if(e) throw({message:'error with truncation file: '+e})
					})
				tasks.push( task )
			}
			if(mset.itd) {
				const req = new Request(arg.hostURL+'/textfile',{
					method:'POST',
					body:'{"file":"'+mset.itd+'"}'
				})
				const task = fetch(req)
					.then(data=>{return data.json()})
					.then(data=>{
						if(data.error) throw({message:'error with itd file: '+data.error})
						const e = parse_itd(data.text, flag, false)
						if(e) throw({message:'error with itd file: '+e})
					})
				tasks.push( task )
			}

			const task2 = Promise.all( tasks )
				.then(data=>{
					const err = bulkin({
						flag:flag,
						filename:arg.name,
						cohort:cohort, 
					})
					if(err) throw({message:'Error parsing data from '+mset.name+': '+err})
					// done this mset
				})
			tasks2.push( task2 )
		}

		return Promise.all(tasks2)
			.then(data=>{
				// done all msets
				return cohort
			})
	})

	.then( cohort=>{

		const err=tpinit(cohort)
		if(err) throw({message:'Error parsing study: '+err})

		saydiv.text('')

		import('./tp.ui').then(p=>{
			p.default(cohort, holder, arg.hostURL)
		})
	})

	.catch(err=>{
		saydiv.text(err.message)
		if(err.stack) {
			console.log(err.stack)
		}
	})
}











/********* helper functions *********

of loading text data of various types of mutations from server-hosted files
slight duplication with what's in server.js, where it handles calls from studies
*/




function parse_snvindel(text, flag) {
	const lines=text.trim().split(/\r?\n/)
	let headerline = lines[0]
	let lineidx = 0
	while(headerline[0]=='#') {
		lineidx++
		headerline = lines[lineidx]
	}
	if(!headerline) return 'no header line'
	const err=bulksnv.parseheader(headerline,flag)
	if(err) return 'header error: '+err
	for(let i=lineidx+1; i<lines.length; i++) {
		if(lines[i]=='') continue
		if(lines[i][0]=='#') continue
		bulksnv.parseline(i,lines[i],flag)
	}
}



function parse_svjson(text, flag) {
	const lines = text.split(/\r?\n/)
	let headerline = lines[0]
	let lineidx = 0
	while(headerline[0]=='#') {
		lineidx++
		headerline = lines[lineidx]
	}
	if(!headerline) return 'no header line'
	const [err,header]=bulksvjson.parseheader(headerline,flag)
	if(err) return 'header error: '+err
	for(let i=lineidx+1; i<lines.length; i++) {
		if(lines[i]=='') continue
		if(lines[i][0]=='#') continue
		bulksvjson.parseline(i,lines[i],flag,header)
	}
}



function parse_cnv(text,flag) {
	const lines = text.split(/\r?\n/)
	let headerline = lines[0]
	let lineidx = 0
	while(headerline[0]=='#') {
		lineidx++
		headerline = lines[lineidx]
	}
	if(!headerline) return 'no header line'
	const err=bulkcnv.parseheader(headerline,flag)
	if(err) return 'header error: '+err
	for(let i=lineidx+1; i<lines.length; i++) {
		if(lines[i]=='') continue
		if(lines[i][0]=='#') continue
		bulkcnv.parseline(i,lines[i],flag)
	}
}




function parse_itd(text,flag) {
	const lines = text.split(/\r?\n/)
	let headerline = lines[0]
	let lineidx = 0
	while(headerline[0]=='#') {
		lineidx++
		headerline = lines[lineidx]
	}
	if(!headerline) return 'no header line'
	const err=bulkitd.parseheader(headerline,flag)
	if(err) return 'header error: '+err
	for(let i=lineidx+1; i<lines.length; i++) {
		if(lines[i]=='') continue
		if(lines[i][0]=='#') continue
		bulkitd.parseline(i,lines[i],flag)
	}
}



function parse_del(text,flag) {
	const lines = text.split(/\r?\n/)
	let headerline = lines[0]
	let lineidx = 0
	while(headerline[0]=='#') {
		lineidx++
		headerline = lines[lineidx]
	}
	if(!headerline) return 'no header line'
	const err=bulkdel.parseheader(headerline,flag)
	if(err) return 'header error: '+err
	for(let i=lineidx+1; i<lines.length; i++) {
		if(lines[i]=='') continue
		if(lines[i][0]=='#') continue
		bulkdel.parseline(i,lines[i],flag)
	}
}



function parse_trunc(text,flag) {
	const lines = text.split(/\r?\n/)
	let headerline = lines[0]
	let lineidx = 0
	while(headerline[0]=='#') {
		lineidx++
		headerline = lines[lineidx]
	}
	if(!headerline) return 'no header line'
	const err=bulktrunc.parseheader(headerline,flag)
	if(err) return 'header error: '+err
	for(let i=lineidx+1; i<lines.length; i++) {
		if(lines[i]=='') continue
		if(lines[i][0]=='#') continue
		bulktrunc.parseline(i,lines[i],flag)
	}
}



function parse_sv(text, flag, isSv) {
	// for both sv and fusion, from tabular text file
	const lines = text.split(/\r?\n/)
	let headerline = lines[0]
	let lineidx = 0
	while(headerline[0]=='#') {
		lineidx++
		headerline = lines[lineidx]
	}
	if(!headerline) return 'no header line'
	const err=bulksv.parseheader( headerline, flag, isSv )
	if(err) return 'header error: '+err
	for(let i=lineidx+1; i<lines.length; i++) {
		if(lines[i]=='') continue
		if(lines[i][0]=='#') continue
		bulksv.parseline( i, lines[i], flag, isSv )
	}
}


