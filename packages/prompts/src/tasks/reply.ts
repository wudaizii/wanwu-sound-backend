// Reads what a language model sent back. Models often wrap JSON in Markdown, add a sentence before it or leave a trailing
// comma; those are repaired (and noted), anything else is refused and the task falls back to the corpus.
export type ReadReply={value:unknown;repairs:string[]}|{value:null;repairs:string[];problem:string};

export function readReply(text:string):ReadReply{
 const repairs:string[]=[];
 let body=text.trim();
 const fenced=/^```(?:json)?\s*([\s\S]*?)\s*```$/i.exec(body);
 if(fenced){body=fenced[1]!;repairs.push('去掉了 Markdown 包裹');}
 const start=body.indexOf('{'),end=body.lastIndexOf('}');
 if(start<0||end<start)return {value:null,repairs,problem:'回复里没有 JSON 对象'};
 if(start>0||end<body.length-1){body=body.slice(start,end+1);repairs.push('去掉了 JSON 前后的文字');}
 try{return {value:JSON.parse(body),repairs};}catch{/* try the common slips below */}
 const trimmed=body.replace(/,\s*([}\]])/g,'$1');
 if(trimmed!==body){
  try{const value:unknown=JSON.parse(trimmed);repairs.push('去掉了多余的逗号');return {value,repairs};}catch{/* fall through */}
 }
 return {value:null,repairs,problem:'JSON 读不出来'};
}
