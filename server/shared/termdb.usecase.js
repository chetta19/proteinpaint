/*
	term {}
		.type: 'categorical', etc.
		.included_types: []
	
	use {}
		.target: 'barchart', etc.
		.detail: 'term1', 'term2', etc.
	
	ds
*/
export function isUsableTerm(term, use, ds) {
	// may apply dataset specific filter for a use case
	if (ds && ds.usecase && use.target in ds.usecase) {
		return ds.usecase[use.target](term, use)
	}

	// default handling
	switch (use.target) {
		case 'barchart':
			return term.included_types.length > 1 || term.included_types[0] != 'survival'

		case 'table':
			return true

		case 'scatterplot':
			return term.included_types.includes('float') || term.included_types.includes('integer')

		case 'boxplot':
			if (use.detail === 'term2')
				return term.included_types.includes('float') || term.included_types.includes('integer')
			else return true

		case 'cuminc':
			if (use.detail === 'term2') return true
			return term.included_types.includes('condition')

		case 'survival':
			if (use.detail === 'term2') return true
			return term.included_types.includes('survival')

		case 'regression':
			if (use.detail == 'term')
				return term.included_types.includes('condition') || term.included_types.includes('survival')
			return term.included_types.filter(type => type != 'condition' && type != 'survival').length
	}
}
