import {mergeEvents,isLearningEvent} from './core.js';
import {catalogState,validCatalogEvent,validateWord,wordKey} from './catalog.js';
const CFG=window.WORDS_CONFIG,PREFIX='wordspace-v1:emmkdmolsirctaaikotu:';
const learningFields=e=>({id:e.id,word_id:e.word_id,kind:e.kind,correct:e.correct,answer:e.answer??null,created_at:e.created_at});
const catalogFields=e=>({id:e.id,word_id:e.word_id,kind:e.kind,word:e.kind==='add'?e.word:null,meaning:e.kind==='add'?e.meaning:null,frequency:e.kind==='add'?e.frequency:null,tags:e.kind==='add'?e.tags:[],created_at:e.created_at});
export class LearningStore extends EventTarget{
 constructor(words){
  super();this.baseWords=words;this.user=null;this.scope='guest';this.events=[];this.pending=[];this.catalogEvents=[];this.catalogPending=[];this.status='本机记录';this.busy=false;
  this.client=window.supabase?.createClient(CFG.url,CFG.publishableKey,{auth:{storageKey:PREFIX+'session',persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}});this.load();
  window.addEventListener('online',()=>this.sync());
  window.addEventListener('storage',e=>{if(e.key===PREFIX+this.scope){const old=this.snapshot();this.load();this.mergeLocal(old);this.notify();}});
 }
 notify(){this.dispatchEvent(new Event('change'));}
 rebuild(){this.catalog=catalogState(this.baseWords,this.catalogEvents);this.validWords=new Set(this.catalog.all.map(w=>w.id));}
 snapshot(){return{events:this.events,pending:this.pending,catalogEvents:this.catalogEvents,catalogPending:this.catalogPending};}
 mergeLocal(v){
  this.catalogEvents=mergeEvents(this.catalogEvents,(v.catalogEvents||[]).filter(validCatalogEvent));this.rebuild();
  this.events=mergeEvents(this.events,(v.events||[]).filter(e=>isLearningEvent(e,this.validWords)));
  const eventIds=new Set(this.events.map(e=>e.id)),catalogIds=new Set(this.catalogEvents.map(e=>e.id));
  this.pending=[...new Set([...this.pending,...(v.pending||[])])].filter(id=>eventIds.has(id));this.catalogPending=[...new Set([...this.catalogPending,...(v.catalogPending||[])])].filter(id=>catalogIds.has(id));
 }
 load(){
  this.events=[];this.pending=[];this.catalogEvents=[];this.catalogPending=[];
  try{this.mergeLocal(JSON.parse(localStorage.getItem(PREFIX+this.scope)||'{}'));}catch{this.rebuild();this.status='本机数据读取失败，请导出备份';}
 }
 absorbDisk(){try{this.mergeLocal(JSON.parse(localStorage.getItem(PREFIX+this.scope)||'{}'));}catch{}}
 save(){try{localStorage.setItem(PREFIX+this.scope,JSON.stringify(this.snapshot()));return true;}catch{this.status='本机空间不足，请立即导出备份';this.notify();return false;}}
 stamp(){const last=[...this.events,...this.catalogEvents].reduce((n,e)=>Math.max(n,Date.parse(e.created_at)),0);return new Date(Math.max(Date.now(),last+1)).toISOString();}
 async init(){
  if(!this.client){this.status='云端组件不可用 · 本机仍可练习';this.notify();return;}
  const{data,error}=await this.client.auth.getSession();if(error){this.status='登录状态读取失败，可重新登录';this.notify();}await this.useSession(data?.session);
  this.client.auth.onAuthStateChange((_event,session)=>setTimeout(()=>this.useSession(session),0));
 }
 async useSession(session){const uid=session?.user?.id||'guest';if(uid===this.scope){if(session)this.user=session.user;return;}this.scope=uid;this.user=session?.user||null;this.load();this.status=this.user?'等待同步':'本机记录';this.notify();if(this.user)await this.sync();}
 add(word_id,kind,correct=null,answer=null){
  this.absorbDisk();if(!this.validWords.has(word_id))throw Error('这个单词已不可用，请重新选择');
  const e={id:crypto.randomUUID(),word_id,kind,correct,answer,created_at:this.stamp()};this.events=mergeEvents(this.events,[e]);this.pending.push(e.id);const saved=this.save();this.notify();if(this.user&&saved)this.sync();return e;
 }
 addWord(input){
  this.absorbDisk();const data=validateWord(input);const existing=this.catalog.all.find(w=>wordKey(w.word)===wordKey(data.word));
  if(existing)throw Error(this.catalog.hidden.has(existing.id)?'这个词在“已删除”中，请先恢复':'词库已有这个单词或短语，请勿重复添加');
  const word_id='custom:'+crypto.randomUUID();this.catalogChange({word_id,kind:'add',...data});return word_id;
 }
 setDeleted(word_id,deleted){this.absorbDisk();if(!this.validWords.has(word_id))throw Error('单词不存在');this.catalogChange({word_id,kind:deleted?'delete':'restore'});}
 catalogChange(input){
  const e=catalogFields({id:crypto.randomUUID(),...input,created_at:this.stamp()});this.catalogEvents=mergeEvents(this.catalogEvents,[e]);this.catalogPending.push(e.id);this.rebuild();const saved=this.save();this.notify();if(this.user&&saved)this.sync();
 }
 async fetchRows(table,columns,uid){let all=[];for(let from=0;;from+=1000){const{data,error}=await this.client.from(table).select(columns).eq('user_id',uid).order('created_at').order('id').range(from,from+999);if(error)throw error;all.push(...data);if(data.length<1000)return all;}}
 async upload(table,events,pendingName,scope,uid,clean){
  const ids=new Set(this[pendingName]),batchEvents=events.filter(e=>ids.has(e.id));
  for(let i=0;i<batchEvents.length;i+=100){const batch=batchEvents.slice(i,i+100);const{error}=await this.client.from(table).upsert(batch.map(e=>({...clean(e),user_id:uid})),{onConflict:'user_id,id',ignoreDuplicates:true});if(error)throw error;if(scope!==this.scope)return false;const sent=new Set(batch.map(e=>e.id));this[pendingName]=this[pendingName].filter(id=>!sent.has(id));this.save();}return true;
 }
 async sync(){
  if(!this.user||!this.client)return;if(this.busy){this.resync=true;return;}if(!navigator.onLine){this.status='离线 · 联网后补同步';this.notify();return;}
  this.busy=true;this.resync=false;const scope=this.scope,uid=this.user.id;this.status='正在同步…';this.notify();
  try{
   // Publish custom word definitions before answer events that refer to them.
   if(!await this.upload('vocab_catalog_events',this.catalogEvents.filter(e=>e.kind==='add'),'catalogPending',scope,uid,catalogFields))return;
   if(!await this.upload('vocab_catalog_events',this.catalogEvents.filter(e=>e.kind!=='add'),'catalogPending',scope,uid,catalogFields))return;
   const catalogRemote=await this.fetchRows('vocab_catalog_events','id,word_id,kind,word,meaning,frequency,tags,created_at',uid);if(scope!==this.scope)return;
   this.catalogEvents=mergeEvents(this.catalogEvents,catalogRemote.filter(validCatalogEvent));this.rebuild();
   // A local word may have been added while the first upload was running.
   if(this.catalogPending.length){this.resync=true;this.save();return;}
   if(!await this.upload('vocab_events',this.events,'pending',scope,uid,learningFields))return;
   const remote=await this.fetchRows('vocab_events','id,word_id,kind,correct,answer,created_at',uid);if(scope!==this.scope)return;
   this.events=mergeEvents(this.events,remote.filter(e=>isLearningEvent(e,this.validWords)));if(this.save()){this.status=this.pending.length||this.catalogPending.length?'有记录等待同步':'云端已同步';this.lastError='';}
  }catch(error){if(scope===this.scope){this.status='同步失败 · 记录已保存在本机';this.lastError=error.message;}}
  finally{this.busy=false;this.notify();if(this.resync||scope!==this.scope)setTimeout(()=>this.sync(),300);}
 }
 backup(){return{app:'english-words',version:2,exportedAt:new Date().toISOString(),events:this.events.map(learningFields),catalogEvents:this.catalogEvents.map(catalogFields)};}
 importGuest(){let v;try{v=JSON.parse(localStorage.getItem(PREFIX+'guest')||'{}');}catch{throw Error('访客记录读取失败');}return this.importBackup({app:'english-words',events:v.events||[],catalogEvents:v.catalogEvents||[]});}
 importBackup(data){
  if(data?.app!=='english-words'||!Array.isArray(data.events))throw Error('请选择本站导出的 JSON 备份');
  const changes=data.catalogEvents||[];if(!Array.isArray(changes)||changes.length>100000||!changes.every(validCatalogEvent))throw Error('备份包含无效词库记录，未导入');
  const merged=mergeEvents(this.catalogEvents,changes.map(catalogFields));const valid=new Set(catalogState(this.baseWords,merged).all.map(w=>w.id));
  if(data.events.length>100000||!data.events.every(e=>isLearningEvent(e,valid))||changes.some(e=>e.kind!=='add'&&!valid.has(e.word_id)))throw Error('备份包含无效记录，未导入');
  const additions=data.events.filter(e=>!this.events.some(x=>x.id===e.id)).map(learningFields);const newCatalog=changes.filter(e=>!this.catalogEvents.some(x=>x.id===e.id)).map(catalogFields);
  this.catalogEvents=merged;this.catalogPending=[...new Set([...this.catalogPending,...newCatalog.map(e=>e.id)])];this.rebuild();this.events=mergeEvents(this.events,additions);this.pending=[...new Set([...this.pending,...additions.map(e=>e.id)])];this.save();this.notify();this.sync();return additions.length+newCatalog.length;
 }
}
