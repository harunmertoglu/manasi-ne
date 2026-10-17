import type {Meaning,PageState,StorageArea} from '../shared/types';
export type SessionRecord={state:PageState;cache:{key:string;value:Meaning}[]};
export class SessionStore{
 private queues=new Map<number,Promise<unknown>>();
 constructor(private area:StorageArea){}
 async get(tabId:number):Promise<SessionRecord|null>{return (await this.area.get(`page:${tabId}`))[`page:${tabId}`]??null;}
 async all():Promise<SessionRecord[]>{const data=await this.area.get(null);return Object.entries(data).filter(([k])=>k.startsWith('page:')).map(([,v])=>v);}
 async update(tabId:number,change:(record:SessionRecord|null)=>SessionRecord|null):Promise<void>{
  const previous=this.queues.get(tabId)??Promise.resolve();
  const next=previous.catch(()=>{}).then(async()=>{const value=change(await this.get(tabId));if(value)await this.area.set({[`page:${tabId}`]:value});else await this.area.remove(`page:${tabId}`);});
  this.queues.set(tabId,next);try{await next;}finally{if(this.queues.get(tabId)===next)this.queues.delete(tabId);}
 }
}
