import { VocabApi } from '../../server/shared/types/vocab.ts'
import { Filter } from '../../server/shared/types/filter.ts'
import { CategoricalTerm, CategoricalQ, CategoricalTW } from '../../server/shared/types/terms/categorical.ts'
import { NumericTerm, NumericQ, NumericTW } from '../../server/shared/types/terms/numeric.ts'

/*

!!! 
	For shared/types: 
	- Declare only the types that are used in the request and response payloads, or in *both* client and server-side code
	- Do not track client or server-specific type declarations here, those belong in the corresponding workspace code 
!!!

--------EXPORTED--------
Dom
Api
NoTermPromptOptsEntry
UseCase
SampleCountsEntry
Handler
PillData
TermSettingOpts
InstanceDom
TermSettingInstance
TSInstanceWithDynamicQ

*/

/*** types supporting TermSettingOpts & PillData types ***/

export type Term = CategoricalTerm | NumericTerm
export type Q = CategoricalQ | NumericQ
export type TermWrapper = CategoricalTW | NumericTW

export type Dom = {
	holder: Selection
	tip: any //TODO Menu type??
	tip2: any //same as above
	nopilldiv?: Selection
	pilldiv?: Selection
	btnDiv?: Selection
}

export type NoTermPromptOptsEntry = {
	isDictionary?: boolean
	termtype?: string
	text?: string
	html?: string
	q?: Q
}

type NumericContEditOptsEntry = {
	scale: string
	transform: string
}

export type UseCase = {
	target: string
	detail?: string //Maybe?
	regressionType?: string //Maybe?
	term1type?: string //Maybe? not documented
}

type DefaultQ4fillTW = {
	[index: string]: Q
}

export type SampleCountsEntry = {
	key: string
	value: number //This maybe a string???
	label?: string //Not documented?? in key or no?
}

type BaseTermSettingOpts = {
	//Optional
	abbrCutoff?: number
	activeCohort?: number
	disable_terms?: string[]
	handler: Handler
	noTermPromptOptions?: NoTermPromptOptsEntry[]
}

export type PillData = BaseTermSettingOpts & {
	$id?: string
	doNotHideTipInMain: boolean
	dom: Dom
	error?: string
	filter?: Filter
	q?: Q
	sampleCounts?: SampleCountsEntry[]
	term?: Term
}

export type TermSettingOpts = BaseTermSettingOpts & {
	//Required
	holder: any
	vocabApi: VocabApi
	//Optional
	$id?: string
	buttons?: string[] //replace, delete, info
	defaultQ4fillTW?: DefaultQ4fillTW
	menuOptions: string //all, edit, replace, remove
	menuLayout?: string //horizonal, all
	numericEditMenuVersion?: string[]
	numericContinuousEditOptions?: NumericContEditOptsEntry[]
	placeholder?: string
	placeholderIcon?: string //default '+'
	renderAs: string //none
	tip?: any //TODO: Menu type?
	use_bins_less?: boolean
	usecase?: UseCase
	debug?: boolean | number //true or 1
	//'snplocus' types
	genomeObj?: any

	//vocab??

	// required callback function. argument is the updated termwrapper object
	callback: (f: TermWrapper | null) => void

	// ?
	customFillTw?: (f: TermWrapper) => void

	// to pass in purpose and context-specific arguments that will be merged to client request parameters
	getBodyParams?: () => any
}

/*** types supporting TermSettingInstance type ***/

export type InstanceDom = {
	//Separate from the Dom outlined in termsetting.ts?????
	//Required
	holder: any
	tip: any //TODO Menu type??
	tip2: any //same as above
	nopilldiv?: any
	pilldiv?: any
	btnDiv?: any
	//Optional
	customBinBoundaryInput?: any
	customBinBoundaryPercentileCheckbox?: any
	customBinLabelInput?: any
	customBinRanges?: any
	cutoff_div?: any
	num_holder?: any
	pill_termname?: any
	rangeAndLabelDiv?: any
}

export type TermSettingInstance = {
	activeCohort?: number
	clickNoPillDiv?: any
	dom: InstanceDom
	doNotHideTipInMain?: boolean
	disable_terms?: string[]
	durations: { exit: number }
	filter?: Filter
	handler?: Handler
	handlerByType?: { [TermType: string]: Handler }
	hasError?: boolean
	noTermPromptOptions?: NoTermPromptOptsEntry[]
	opts: TermSettingOpts
	placeholder: string | undefined
	q: Q
	term: Term
	usecase?: UseCase
	vocabApi: VocabApi

	//Methods
	/*
	TODOs: 
		- Move specifc methods to their own intersection instance type within in termsetting/handler/*.ts, out of main type
	*/
	cancelGroupsetting?: () => void
	enterPill?: () => void
	exitPill?: () => void
	initUI: () => void
	removeTerm?: () => void
	runCallback: (f?: any) => any
	setHandler?: (f: string) => any
	showGeneSearch: (clickedElem: Element | null, event: MouseEvent) => void
	showMenu: (event: MouseEvent, clickedElem: string | null, menuHolder: any) => void
	showReuseMenu?: (div: any) => void
	showTree: (holder: Selection, event?: MouseEvent) => void
	tabCallback?: (event: any, tab: any) => void
	updatePill?: () => void
	updateUI: () => void
}

export interface Handler {
	getPillName: (d: any) => string
	getPillStatus: (f?: any) => any
	showEditMenu: (div: Selection) => void
	validateQ?: (d: Q) => void
	postMain?: () => void
}

export interface HandlerGenerator {
	getHandler: (self: TermSettingInstance) => Handler
}
