// Placeholders in corpus and prompt files: `{name}` is filled by the program with a fact, a number or a word table entry.
// The files never hold logic; the program never holds wording.

/** The placeholder names a text uses, in order (repeats kept). */
export const placeholders=(text:string)=>[...text.matchAll(/\{([^{}\s]+)\}/g)].map(match=>match[1]!);

/** Fills every `{name}`; a missing value is a programming error, so it throws instead of showing braces to a child. */
export function fill(text:string,values:Readonly<Record<string,string|number>>){
 return text.replace(/\{([^{}\s]+)\}/g,(_,name:string)=>{
  const value=values[name];
  if(value===undefined)throw new Error(`占位符 {${name}} 没有填`);
  return String(value);
 });
}

/** Placeholders a text may use; anything else is reported as `where 用了不认识的占位符 {x}`. */
export function unknownPlaceholders(where:string,text:string,allowed:readonly string[]){
 return placeholders(text).filter(name=>!allowed.includes(name)).map(name=>`${where} 用了不认识的占位符 {${name}}（可用：${allowed.length?allowed.map(item=>`{${item}}`).join(' '):'无'}）`);
}
