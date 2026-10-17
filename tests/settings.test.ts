import {expect,it} from 'vitest';
import {SettingsStore} from '../src/background/settings';
import {authorizeMessage} from '../src/shared/messages';
import {memoryArea} from './helpers/chrome';
it('limits storage access and never replaces working settings on verification failure',async()=>{
 const area=memoryArea();let reject=false;
 const store=new SettingsStore(area,()=>({verify:async()=>{if(reject)throw new Error('bad');}}));
 await store.initialize();expect(area.access).toBe('TRUSTED_CONTEXTS');
 await store.validateAndSaveSettings('good-key','model');reject=true;
 await expect(store.validateAndSaveSettings('bad-key','model')).rejects.toThrow();
 expect(await store.getSettings()).toMatchObject({apiKey:'good-key',validated:true});
 await store.clearSettings();expect(await store.getSettings()).toBeNull();
});
it('rejects website and content senders trying to access privileged settings',()=>{
 const id='extension';
 const content={id,url:'https://example.com',tab:{id:1},frameId:0};
 expect(()=>authorizeMessage({type:'SAVE_SETTINGS',apiKey:'key',model:'m'},content,id)).toThrow();
 expect(()=>authorizeMessage({type:'SETTINGS_STATUS'},content,id)).toThrow();
 expect(()=>authorizeMessage({type:'START',tabId:1},content,id)).toThrow();
 expect(()=>authorizeMessage({type:'CLEAR_SETTINGS'},{id:'other',url:'chrome-extension://extension/options.html'},id)).toThrow();
 expect(authorizeMessage({type:'CLEAR_SETTINGS'},{id,url:'chrome-extension://extension/options.html'},id)).toEqual({type:'CLEAR_SETTINGS'});
});
it('takes content tab only from sender and rejects subframes/invalid payloads',()=>{
 const sender={id:'ext',url:'https://example.com',tab:{id:7},frameId:0};
 expect(authorizeMessage({type:'INVALIDATE',generation:'g',tabId:999},sender,'ext').type).toBe('INVALIDATE');
 expect(()=>authorizeMessage({type:'INVALIDATE',generation:'g'},{...sender,frameId:3},'ext')).toThrow();
 expect(()=>authorizeMessage({type:'EXPLAIN',generation:'g',selection:{text:'x'}},sender,'ext')).toThrow();
});
