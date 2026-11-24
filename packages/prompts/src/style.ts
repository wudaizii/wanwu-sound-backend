// 用词规范 (corpus/style.v1.json): who reads each kind of sentence, how long it may be, which words a child should not
// meet and what is never said to anyone. The same check runs on the corpus (in the tests), on every guide line, and on
// whatever an AI sends back before a page shows it.
import styleFile from '../corpus/style.v1.json' with {type:'json'};

export type Reader='child'|'teacher';
export type Slot=keyof typeof styleFile.slots;
export type StyleRules=Omit<typeof styleFile,'slots'>&{slots:Record<Slot,{reader:Reader;maxChars:number}>};
export const STYLE=styleFile as StyleRules;

/** Characters as a reader sees them: spaces are not counted, a `{placeholder}` counts as a typical name. */
export function charCount(text:string,rules:StyleRules=STYLE){
 const withNames=text.replace(/\{[^{}\s]+\}/g,'某'.repeat(rules.placeholderChars));
 return [...withNames.replace(/\s+/g,'')].length;
}

/** Everything wrong with a sentence for its slot, in plain words; [] when it may be shown. */
export function wordProblems(text:string,slot:Slot,rules:StyleRules=STYLE):string[]{
 const {reader,maxChars}=rules.slots[slot],problems:string[]=[];
 if(!text.trim())return ['是空的'];
 const length=charCount(text,rules);
 if(length>maxChars)problems.push(`有 ${length} 个字，超过上限 ${maxChars}`);
 for(const word of rules.neverSay)if(text.includes(word))problems.push(`用了不对任何人说的话「${word}」`);
 // Everyday phrases that happen to contain a term (柔和声音 holds 和声) are taken out first.
 const plain=rules.notTerms.reduce((rest,phrase)=>rest.split(phrase).join('·'),text);
 if(reader==='child')for(const word of rules.childAvoid)if(plain.includes(word))problems.push(`给孩子的话里用了术语「${word}」`);
 if(/[<>`*#]|https?:/.test(text))problems.push('带了标记或链接');
 return problems;
}

/** The two word lists, for prompts that tell a model what not to say. */
export const avoidList=(rules:StyleRules=STYLE)=>rules.childAvoid.join('、');
export const neverSayList=(rules:StyleRules=STYLE)=>rules.neverSay.join('、');
