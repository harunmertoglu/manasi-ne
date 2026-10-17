import {AppError,failure,type PageState,type PageContent,type Settings,type Meaning,type SelectionContext,type StorageArea,type Result} from '../shared/types';
import {SessionStore} from './state';
import {chunkText} from '../context/chunks';
import {cacheKey} from '../context/cache';
import {validatePage} from '../shared/messages';
type Client={summarize(text:string):Promise<string>;explain(page:PageContent,summary:string,selection:SelectionContext):Promise<Meaning>};
export class PageController{
 private store:SessionStore;
 private generations=new Map<number,string>();
 private pending=new Map<string,Promise<Result<Meaning>>>();
 constructor(area:StorageArea,private settings:()=>Promise<Settings|null>,private factory:(settings:Settings)=>Client,private notify:(state:PageState)=>Promise<void>=async()=>{}){this.store=new SessionStore(area);}
 private matches(tabId:number,generation:string){return this.generations.get(tabId)===generation;}
 async recover(){for(const record of await this.store.all()){this.generations.set(record.state.tabId,record.state.generation);if(record.state.status==='preparing')await this.store.update(record.state.tabId,r=>r?{...r,state:{...r.state,status:'error',error:'Hazırlık kesildi. Bu sayfada yeniden başlatın.'}}:null);}}
 async status(tabId:number):Promise<PageState|null>{return (await this.store.get(tabId))?.state??null;}
 async start(tabId:number,input:PageContent):Promise<Result<PageState>>{
  try{
   const page=validatePage(input);const chunks=chunkText(page.paragraphs);const settings=await this.settings();
   if(!settings?.validated)throw new AppError('missing_key','Önce ayarlardan Groq anahtarını bağlayıp doğrulayın.');
   const generation=crypto.randomUUID();this.generations.set(tabId,generation);
   const state:PageState={tabId,generation,page,status:'preparing',summary:'',updatedAt:Date.now(),progress:`0 / ${chunks.length} bölüm`};
   await this.store.update(tabId,()=>this.matches(tabId,generation)?{state,cache:[]}:null);
   void this.prepare(state,chunks,this.factory(settings));
   return {ok:true,value:state};
  }catch(error){return failure(error);}
 }
 private async prepare(initial:PageState,chunks:string[],client:Client){
  const {tabId,generation}=initial;
  try{
   const summaries:string[]=[];
   for(const chunk of chunks){if(!this.matches(tabId,generation))return;summaries.push(await client.summarize(chunk));await this.store.update(tabId,r=>r&&r.state.generation===generation&&r.state.status==='preparing'?{...r,state:{...r.state,progress:`${summaries.length} / ${chunks.length} bölüm`,updatedAt:Date.now()}}:r);}
   if(!this.matches(tabId,generation))return;
   const summary=summaries.length===1?summaries[0]:await client.summarize(summaries.join('\n'));
   await this.store.update(tabId,r=>r&&this.matches(tabId,generation)&&r.state.status==='preparing'?{...r,state:{...r.state,summary,status:'ready',updatedAt:Date.now(),progress:undefined}}:r);
   const state=await this.status(tabId);if(state?.generation===generation&&state.status==='ready')await this.notify(state);
  }catch(error){const result=failure(error);await this.store.update(tabId,r=>r&&this.matches(tabId,generation)&&r.state.generation===generation?{...r,state:{...r.state,status:'error',error:!result.ok?result.message:'İşlem tamamlanamadı.',updatedAt:Date.now()}}:r).catch(()=>{});}
 }
 async stop(tabId:number){this.generations.set(tabId,crypto.randomUUID());await this.store.update(tabId,()=>null);}
 async invalidate(tabId:number){this.generations.set(tabId,crypto.randomUUID());await this.store.update(tabId,r=>r?{state:{...r.state,status:'stale',summary:'',updatedAt:Date.now(),error:'Sayfa değişti. Yeni bağlam için yeniden başlatın.'},cache:[]}:null);}
 async stopAll(){for(const record of await this.store.all())await this.stop(record.state.tabId);}
 async explain(tabId:number,generation:string,selection:SelectionContext):Promise<Result<Meaning>>{
  try{
   const record=await this.store.get(tabId);
   if(!record||record.state.status!=='ready'||record.state.generation!==generation||!this.matches(tabId,generation))throw new AppError('stale_context','Sayfa bağlamı hazır değil veya değişti. Eklentiyi yeniden başlatın.');
   const settings=await this.settings();if(!settings?.validated)throw new AppError('missing_key','Groq anahtarınızı ayarlardan doğrulayın.');
   const key=cacheKey(record.state.page,selection,settings.model);
   const cached=record.cache.find(c=>c.key===key);if(cached)return {ok:true,value:cached.value};
   const pendingKey=`${tabId}:${generation}:${key}`;const existing=this.pending.get(pendingKey);if(existing)return existing;
   const work=(async():Promise<Result<Meaning>>=>{
    try{const value=await this.factory(settings).explain(record.state.page,record.state.summary,selection);
     if(!this.matches(tabId,generation))throw new AppError('stale_context','Sayfa değişti. Eklentiyi yeniden başlatın.');
     await this.store.update(tabId,r=>r&&r.state.generation===generation&&r.state.status==='ready'&&this.matches(tabId,generation)?{...r,cache:[...r.cache.filter(c=>c.key!==key),{key,value}].slice(-100)}:r);
     if(!this.matches(tabId,generation))throw new AppError('stale_context','Sayfa değişti. Eklentiyi yeniden başlatın.');
     return {ok:true,value};
    }catch(error){return failure(error);}
   })();
   this.pending.set(pendingKey,work);try{return await work;}finally{this.pending.delete(pendingKey);}
  }catch(error){return failure(error);}
 }
}
