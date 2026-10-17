import {extractPage} from '../context/extract';
export function watchPage(onInvalidated:()=>void):()=>void{
 const url=location.href;let version:string;try{version=extractPage(document).version;}catch{version='';}
 let ended=false;let debounce:ReturnType<typeof setTimeout>|undefined;
 const invalidate=()=>{if(!ended){ended=true;cleanup();onInvalidated();}};
 const check=()=>{if(location.href!==url){invalidate();return;}try{if(extractPage(document).version!==version)invalidate();}catch{invalidate();}};
 const observer=new MutationObserver(records=>{if(records.every(r=>(r.target.nodeType===1?r.target as Element:r.target.parentElement)?.closest('[data-manasi-root]')))return;clearTimeout(debounce);debounce=setTimeout(check,750);});
 observer.observe(document.documentElement,{subtree:true,childList:true,characterData:true});
 const timer=setInterval(check,1000);
 window.addEventListener('popstate',check);window.addEventListener('hashchange',check);
 function cleanup(){observer.disconnect();clearInterval(timer);clearTimeout(debounce);window.removeEventListener('popstate',check);window.removeEventListener('hashchange',check);}
 return ()=>{ended=true;cleanup();};
}
