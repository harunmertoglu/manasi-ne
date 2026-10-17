import {ContentSession} from './session';
import {extractPage} from '../context/extract';
import {failure} from '../shared/types';
const world=globalThis as typeof globalThis&{__manasiSession?:ContentSession};
if(!world.__manasiSession){
 const session=new ContentSession(message=>chrome.runtime.sendMessage(message));world.__manasiSession=session;
 chrome.runtime.onMessage.addListener((message,sender,respond)=>{
  if(sender.id!==chrome.runtime.id)return false;
  try{
   switch(message?.type){
    case 'READ_PAGE':respond({ok:true,value:extractPage(document)});break;
    case 'ACTIVATE':session.activate(message.generation,message.url,message.version);respond({ok:true,value:null});break;
    case 'DEACTIVATE':session.deactivate();respond({ok:true,value:null});break;
    default:return false;
   }
  }catch(error){respond(failure(error));}return false;
 });
}
