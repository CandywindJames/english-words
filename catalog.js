import {mergeEvents} from './core.js';
const UUID='[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}';
const uuid=new RegExp(`^${UUID}$`,'i'),custom=new RegExp(`^custom:${UUID}$`,'i');
export const wordKey=s=>s.trim().replace(/\s+/g,' ').toLowerCase();
export function validateWord({word,meaning,frequency,tags=[]}){
 word=String(word||'').trim().replace(/\s+/g,' ');meaning=String(meaning||'').trim();
 if(!word||word.length>100||!/[a-z]/i.test(word))throw Error('请输入 1–100 字符的英文单词或短语');
 if(!meaning||meaning.length>2000)throw Error('请输入 1–2000 字符的完整释义');
 frequency=frequency===''||frequency===null||frequency===undefined?null:Number(frequency);
 if(frequency!==null&&(!Number.isInteger(frequency)||frequency<0||frequency>100000))throw Error('考频需为 0–100000 的整数，也可以留空');
 if(!Array.isArray(tags))throw Error('释义标签格式不正确');
 tags=[...new Set(tags.map(x=>String(x).trim()).filter(Boolean))];
 if(tags.length>20||tags.some(t=>t.length>32))throw Error('最多填写 20 个标签，每个不超过 32 字');
 return {word,meaning,frequency,tags};
}
export function validCatalogEvent(e){
 if(!e||!uuid.test(e.id)||typeof e.word_id!=='string'||e.word_id.length>200||!['add','delete','restore'].includes(e.kind)||Number.isNaN(Date.parse(e.created_at)))return false;
 if(e.kind!=='add')return true;
 if(!custom.test(e.word_id)||typeof e.word!=='string'||typeof e.meaning!=='string'||!Array.isArray(e.tags))return false;
 try{validateWord(e);return e.frequency===null||Number.isInteger(e.frequency);}catch{return false;}
}
export function catalogState(base,events){
 const all=new Map(base.map(w=>[w.id,w])),hidden=new Set();
 for(const e of mergeEvents(events)){
  if(e.kind==='add'&&custom.test(e.word_id)&&!all.has(e.word_id))all.set(e.word_id,{id:e.word_id,word:e.word,meaning:e.meaning,frequency:e.frequency,page:null,tags:e.tags,custom:true});
  else if(e.kind==='delete')hidden.add(e.word_id);
  else if(e.kind==='restore')hidden.delete(e.word_id);
 }
 const words=[...all.values()];return {all:words,active:words.filter(w=>!hidden.has(w.id)),deleted:words.filter(w=>hidden.has(w.id)),hidden};
}
export function sortWords(words,order='az'){
 const compare=(a,b)=>{const x=wordKey(a.word),y=wordKey(b.word);return x<y?-1:x>y?1:a.id.localeCompare(b.id);};
 return [...words].sort(order==='frequency'?(a,b)=>(b.frequency??-1)-(a.frequency??-1)||compare(a,b):compare);
}
