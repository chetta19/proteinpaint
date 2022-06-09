// a separate script to contain additional examples for indel typing test
// this helps reduce the script size
// also allow multiple people to add indel examples at the same time
const pphost = 'http://pp-int-test.stjude.org/'

const examples = [
    {
        comment: 'deletion in polyA region',
        pplink:
            pphost +
            '?genome=hg38&block=1&position=chr22:19686868-19687868&hlregion=chr22:19687367-19687367&bamfile=SJSTS052331_G1,tempbamslice/8BE5C5PZK9.bam&variant=chr22.19687368.TA.T',
        leftFlank:
            'GAAAAAATTCAATTAAAAAATATTTTAAAGCACATAACAGGCAGTCATGTGTAATTTGGGTCACGTAGAACAAGTCTGGATCATGAAGTCTGTGAGGCTGGTGTACACTTAACTGAGAGTGTGTCTAGCTTTAAACCGGTATCTGCATT',
        rightFlank:
            'AAAAAAAAAAAAAAGGCAGAGTCGGGGGCCACTCTCAGAGAGCACTATTAGGTGCTCACCGGCAGAACCCAGACATTGCATTTTCAAAGCTTTTAAGCTTTTCAGCTGCACTCTGAGGAACCGGCTATTGATCTGTGTCCTTGGTGCAC',
        seqRef:
            'GAAAAAATTCAATTAAAAAATATTTTAAAGCACATAACAGGCAGTCATGTGTAATTTGGGTCACGTAGAACAAGTCTGGATCATGAAGTCTGTGAGGCTGGTGTACACTTAACTGAGAGTGTGTCTAGCTTTAAACCGGTATCTGCATTTAAAAAAAAAAAAAAAGGCAGAGTCGGGGGCCACTCTCAGAGAGCACTATTAGGTGCTCACCGGCAGAACCCAGACATTGCATTTTCAAAGCTTTTAAGCTTTTCAGCTGCACTCTGAGGAACCGGCTATTGATCTGTGTCCTTGGTGCAC',
        seqMut:
            'GAAAAAATTCAATTAAAAAATATTTTAAAGCACATAACAGGCAGTCATGTGTAATTTGGGTCACGTAGAACAAGTCTGGATCATGAAGTCTGTGAGGCTGGTGTACACTTAACTGAGAGTGTGTCTAGCTTTAAACCGGTATCTGCATTTAAAAAAAAAAAAAAGGCAGAGTCGGGGGCCACTCTCAGAGAGCACTATTAGGTGCTCACCGGCAGAACCCAGACATTGCATTTTCAAAGCTTTTAAGCTTTTCAGCTGCACTCTGAGGAACCGGCTATTGATCTGTGTCCTTGGTGCAC',
        variant: {
            pos: 19687367,
            ref: 'TA',
            alt: 'T'
        },
        reads: [
            {
                n: 'read supports alt allele with mismatch on right',
                s: 'GCAGTCATGTGTAATTTGGGTCACGTAGAACAAGTCTGGATCATGAAGTCTGTGAGGCTGGTGTACACTTAACTGAGAGTGTGTCTAGCTTTAAACCGGTATCTGCATTTAAAAAAAAAAAAAAGGAAGATTCGGGGGCCACAAACAGATA',
                p: 19687259,
                c: '110M1D32M9S',
                f: 163,
                g: 'alt'
            },
            {
                n: 'read supports alt allele with mismatch on left',
                s: 'TAATTTGGGTCACGTAGAACAAGTCTGGATCATGAAGTCTGTGAGGCTGGTGTACACTTAAATGAGAGTGTGTCTAGCTTTAAACCGGTATCTCCATTTAAAAAAAAAAAAAAGGCAGAGTCGGGGGCCACTCTCAGAGAGCACTATTAGG',
                p: 19687270,
                c: '99M1D52M',
                f: 83,
                g: 'alt'
            },
            {
                n: 'read supports ref allele',
                s: 'GTCTGGATCATGAAGTCTGTGAGGCTGGTGTACACTTAACTGAGAGTGTGTCTAGCTTTAAACCGGTATCTGCATTTAAAAAAAAAAAAAAAGGCAGAGTCGGGGGCCACTCTCAGAGAGCACTATTAGGTGCTCACCGGCAGAACCCAGA',
                p: 19687292,
                c: '151M',
                f: 147,
                g: 'ref'
            },
            {
                n: 'read with 2 A deletion',
                s: 'ACATAACAGGCAGTCATGTGTAATTTGGGTCACGTAGAACAAGTCTGGATCATGAAGTCTGTGAGGCTGGTGTACACTTAACTGAGAGTGTGTCTAGCTTTAAACCGGTATCTGCATTTAAAAAAAAAAAAAGGCAGAGTCGGGGGCCACT',
                p: 19687250,
                c: '119M2D32M',
                f: 83,
                g: 'none',
                g_0: 'alt'
            },
            {
                n: 'ambiguous reads',
                s: 'AATTAAAAAATATTTTAAAGCACATAACAGGCAGTCATGTGTAATTTGGGTCACGTAGAACAAGTCTGGATCATGAAGTCTGTGAGGCTGGTGTACACTTAACTGAGAGTGTGTCTAGCTTTAAACCGGTATCTGCATTTAAAAAAAAAAA',
                p: 19687229,
                c: '151M',
                f: 99,
                g: 'amb'
            }
        ]
    },
    {
        comment: 'deletion in repeat region (CCTTn)',
        pplink:
            pphost +
            '?genome=hg38&block=1&position=chr22:19661012-19662012&hlregion=chr22:19661511-19661511&bamfile=SJAML018551_G1,tempbamslice/77ZA975VAC.bam&variant=chr22.19661512.CCCTTCCTT.C',
        leftFlank:
            'AGACAGTCAGATCACTGGTATGTTGTGGGGGTGCAGTTGGGGAAATGAGGAAACTCCAGGCATCAGGGGGCCCCATTTGAGATGTACCATCCAGAGTGTGAGAATTCTAATGAGTAGGCAGGGGCCATAAGGACCATTTTCTTCCTCCCT',
        rightFlank:
            'CCTTCCTTCCTTCCTTCCTTCCTTCCTTCCTTCCTTCCTTCCTTCTTCCCTCCCTCCCGCCCTCCCTTCTTTCCTTCCTTTTTCGTTTTTGAAATAGGGTCTCACTCTGTCACCCAAGCTGGAGTGCAGTGACACAATCATAGCTCACTG',
        seqRef:
            'AGACAGTCAGATCACTGGTATGTTGTGGGGGTGCAGTTGGGGAAATGAGGAAACTCCAGGCATCAGGGGGCCCCATTTGAGATGTACCATCCAGAGTGTGAGAATTCTAATGAGTAGGCAGGGGCCATAAGGACCATTTTCTTCCTCCCTCCCTTCCTTCCTTCCTTCCTTCCTTCCTTCCTTCCTTCCTTCCTTCCTTCCTTCTTCCCTCCCTCCCGCCCTCCCTTCTTTCCTTCCTTTTTCGTTTTTGAAATAGGGTCTCACTCTGTCACCCAAGCTGGAGTGCAGTGACACAATCATAGCTCACTG',
        seqMut:
            'AGACAGTCAGATCACTGGTATGTTGTGGGGGTGCAGTTGGGGAAATGAGGAAACTCCAGGCATCAGGGGGCCCCATTTGAGATGTACCATCCAGAGTGTGAGAATTCTAATGAGTAGGCAGGGGCCATAAGGACCATTTTCTTCCTCCCTCCCTTCCTTCCTTCCTTCCTTCCTTCCTTCCTTCCTTCCTTCCTTCTTCCCTCCCTCCCGCCCTCCCTTCTTTCCTTCCTTTTTCGTTTTTGAAATAGGGTCTCACTCTGTCACCCAAGCTGGAGTGCAGTGACACAATCATAGCTCACTG',
        variant: {
            pos: 19661511,
            ref: 'CCCTTCCTT',
            alt: 'C'
        },
        reads: [
            {
                n: 'read supports alt allele with softclip on right',
                s: 'TTTCTTCCTCCCTCCCTTCCTTCCTTCCTTCCTTCCTTCCTTCCTTCCTTCCTTCCTTCTTCCCTCCCCCCCCCCCCCCCCTCTTTTCTTTCCTTTTTTTTTTTTTAATAAGGGGTCCCCCTTTTCCCCCACCCTGGGGGCGGTGGCACAA',
                p: 19661499,
                c: '59M92S',
                f: 163,
                g: 'alt'
            },
            {
                n: 'read supports alt allele',
                s: 'TGTACCATCCAGAGTGTGAGAATTCTAATGAGTAGGCAGGGGCCATAAGGACCATTTTCTTCCTCCCTCCCTTCCTTCCTTCCTTCCTTCCTTCCTTCCTTCCTTCCTTCCTTCTTCCCTCCCTCCCGCCCTCCCTTCTTTCCTTCCTTTT',
                p: 19661444,
                c: '69M8D82M',
                f: 147,
                g: 'alt'
            },
            {
                n: 'read supports neither ref nor alt(alt)',
                s: 'TACCATCCAGAGTGTGAGAATTCTAATGAGTAGGCAGGGGCCATAAGGACCATTTTCTTCCTCCCTCCCTTCCTGCCTTCCTTCCTTCCTTCCTTCCTTCCTTCCTTCCTTCTTCCCTCCCTCCCGCCCTCCCTTCTTTCCTTCCTTTTTC',
                p: 19661446,
                c: '67M8D84M',
                f: 147,
                g: 'none',
                g_0: 'alt'
            },
            {
                n: 'read support neither ref nor alt(alt under g_0)',
                s: 'TGTGAGAATTCTAATGAGTAGGCAGGGGCCATAAGGACCATTTTCTTCCTCCCTCCCTTCCTTCCTTCCTTCCTTCCTTCCTTCCTTCCTTCCTTCTTCCCTCCCTCCCGCCCTCCCTTCTTTCCTTCCTTTTTCGTTTTTGAAATAGGGT',
                p: 19661458,
                c: '30S25M12D96M',
                f: 83,
                g: 'none',
                g_0: 'alt'
            }
        ]
    },
    {
        comment: 'insertion in repeat region (AACn)',
        pplink:
            pphost +
            '?genome=hg38&block=1&position=chr22:23190951-23191951&hlregion=chr22:23191450-23191450&bamfile=SJGENKY053909_G1,tempbamslice/YMM5YGTRBZ.bam&variant=chr22.23191451.A.AAACAAC',
        leftFlank:
            'GAAGGCAACCACCTCTCCCTATCCAATCGCTCAAAGGTATTTATTGAGCATCTACTTTGTGCCTGGCACTATCTTCATGGAAATCCTTTCTTCCTTATTCATTGATTTATGGAAAGGCTGATCTCCAAGGGCCTTGTCTTTA',
        rightFlank:
            'AACAACAACAAACAAACAAAACCTTTCTAATGTCAAAGCATTTTCCCCTGCGTATCTTTCTTTAACGGTATATTTGCAGCTGTTTCCTGTTAATCCTTTGTCTATCTGGCTTCCTTTTTAGGGTGATGGGATCCTTAAGCAC',
        seqRef:
            'GAAGGCAACCACCTCTCCCTATCCAATCGCTCAAAGGTATTTATTGAGCATCTACTTTGTGCCTGGCACTATCTTCATGGAAATCCTTTCTTCCTTATTCATTGATTTATGGAAAGGCTGATCTCCAAGGGCCTTGTCTTTAAAACAACAACAAACAAACAAAACCTTTCTAATGTCAAAGCATTTTCCCCTGCGTATCTTTCTTTAACGGTATATTTGCAGCTGTTTCCTGTTAATCCTTTGTCTATCTGGCTTCCTTTTTAGGGTGATGGGATCCTTAAGCAC',
        seqMut:
            'GAAGGCAACCACCTCTCCCTATCCAATCGCTCAAAGGTATTTATTGAGCATCTACTTTGTGCCTGGCACTATCTTCATGGAAATCCTTTCTTCCTTATTCATTGATTTATGGAAAGGCTGATCTCCAAGGGCCTTGTCTTTAAAACAACAACAACAACAAACAAACAAAACCTTTCTAATGTCAAAGCATTTTCCCCTGCGTATCTTTCTTTAACGGTATATTTGCAGCTGTTTCCTGTTAATCCTTTGTCTATCTGGCTTCCTTTTTAGGGTGATGGGATCCTTAAGCAC',
        variant: {
            pos: 23191450,
            ref: 'A',
            alt: 'AAACAAC'
        },
        reads: [
            {
                n: 'read supports alt allele with softclip on right',
                s: 'CCCTATCCAATCGCTCAAAGGTATTTATTGAGCATCTACTTTGTGCCTGGCACTATCTTCATGGAAATCCTTTCTTCCTTATTCATTGATTTATGGAAAGGCTGATCTCCAAGGGCCTTGTCTTTAAAACAACAACAACAACAAACAAACA',
                p: 23191325,
                c: '137M2I12M',
                f: 163,
                g: 'alt'
            },
            {
                n: 'read supports alt allele',
                s: 'GCATCTACTTTGTGCCTGGCACTATCTTCATGGAAATCCTTTCTTCCTTATTCATTGATTTATGGAAAGGCTGATCTCCAAGGGCCTTGTCTTTAAAACAACAACAACAACAAACAAACAAAACCTTTCTAATGTCAAAGCATTTTCCCCT',
                p: 23191356,
                c: '96M6I49M',
                f: 83,
                g: 'alt'
            },
            {
                n: 'read supports neither ref nor alt(ref)',
                s: 'ATCGATCAATTGTATTTTTTGTGAATATACTTTGTGCCTTGCTCTTTCTTCATGGAAATCCTTTCTTACTTTTTCATTGATTTATGGTTAGGCTGTTCTCCATGGGCGTTGTATTTTATTGAACAACAAACAAACAAACCCTTTCTTATTT',
                p: 23191334,
                c: '46S100M5S',
                f: 147,
                g: 'none',
                g_0: 'ref'
            },
            {
                n: 'ambiguous reads',
                s: 'CGAAGGCAACCACCTCTCCCTATCCAATCGCTCAAAGGTATTTATTGAGCATCTACTTTGTGCCTGGCACTATCTTCATGGAAATCCTTTCTTCCTTATTCATTGATTTATGGAAAGGCTGATCTCCAAGGGCCTTGTCTTTAAAACAACA',
                p: 23191308,
                c: '151M',
                f: 147,
                g: 'amb'
            }
        ]
    }
]

exports.examples = examples
