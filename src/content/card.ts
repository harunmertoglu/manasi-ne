import type {Meaning} from '../shared/types';
let host:HTMLElement|null=null;
export function hideCard(){host?.remove();host=null;}
export function showCard(anchor:DOMRect,state:{loading?:boolean;meaning?:Meaning;error?:string},onClose:()=>void=hideCard){
 hideCard();host=document.createElement('div');host.setAttribute('data-manasi-root','');
 host.style.cssText='all:initial!important;position:fixed!important;z-index:2147483647!important;display:block!important;';
 const shadow=host.attachShadow({mode:'open'});
 const style=document.createElement('style');style.textContent=`:host{color-scheme:light}*{box-sizing:border-box}.card{font-family:system-ui,-apple-system,sans-serif;width:min(340px,calc(100vw - 24px));padding:20px;background:#fffef8;color:#183c30;border:1px solid #c5d0bf;border-radius:14px;box-shadow:0 10px 42px #15332424;font-size:14px;line-height:1.6}.top{display:flex;justify-content:space-between;align-items:center;gap:18px}.brand{font-size:9px;font-weight:750;letter-spacing:1.8px;color:#6c7d68}button{font:inherit;cursor:pointer;border:0;background:transparent;color:#536d5a;padding:0 4px;font-size:22px;line-height:1.2}button:focus-visible{outline:2px solid #54765c}h2{font:400 27px/1.2 Georgia,serif;margin:13px 0;overflow-wrap:anywhere}p{margin:10px 0 0;overflow-wrap:anywhere}.translation{border-top:1px solid #dce1d3;margin-top:14px;padding-top:12px}.label{display:block;font-size:9px;font-weight:750;letter-spacing:1.5px;color:#71816d;margin-bottom:4px}.error{color:#913a2d}.loading{color:#677660}`;
 const card=document.createElement('section');card.className='card';card.setAttribute('role','region');card.setAttribute('aria-label','Kelimenin bağlamsal anlamı');card.setAttribute('aria-live','polite');
 const top=document.createElement('div');top.className='top';const brand=document.createElement('span');brand.className='brand';brand.textContent='m.  MANASI NEDİR';const close=document.createElement('button');close.type='button';close.textContent='×';close.setAttribute('aria-label','Açıklamayı kapat');close.addEventListener('click',onClose);top.append(brand,close);card.append(top);
 if(state.loading){const p=document.createElement('p');p.className='loading';p.textContent='Bağlamdaki anlamı aranıyor…';card.append(p);}
 if(state.error){const p=document.createElement('p');p.className='error';p.textContent=state.error;card.append(p);}
 if(state.meaning){const heading=document.createElement('h2');heading.textContent=state.meaning.word;const p=document.createElement('p');p.lang=state.meaning.language;p.textContent=state.meaning.explanation;card.append(heading,p);
  if(state.meaning.language==='en'){const t=document.createElement('p');t.className='translation';t.lang='tr';const label=document.createElement('span');label.className='label';label.textContent='TÜRKÇE KARŞILIĞI';t.append(label,document.createTextNode(state.meaning.turkishEquivalent??''));card.append(t);}
 }
 shadow.append(style,card);document.documentElement.append(host);
 const bounds=card.getBoundingClientRect();const width=bounds.width||340,height=bounds.height||220;
 host.style.setProperty('left',`${Math.max(12,Math.min(anchor.left,window.innerWidth-width-12))}px`,'important');
 const below=anchor.bottom+10;const topPos=below+height<=window.innerHeight?below:Math.max(12,anchor.top-height-10);
 host.style.setProperty('top',`${topPos}px`,'important');
 card.style.maxHeight=`${Math.max(100,window.innerHeight-24)}px`;card.style.overflowY='auto';
}
