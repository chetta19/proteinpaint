export function asefromtemplate ( tk, template ) {
	if( !template.rnabamfile ) {
		if( !template.ranbamurl ) return 'neither file or url given for rnabam'
	}
	if( !template.vcffile ) {
		if( !template.vcfurl ) return 'neither file or url given for vcf'
	}
	return null
}


export function asemaketk(tk,block) {
	tk.uninitialized=true
}


export function aseload(tk,block) {
	import('./block.tk.ase').then(_=>{
		_.loadTk(tk,block)
	})
}
