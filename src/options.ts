import {request} from './shared/messages';
import type {ModelOption} from './shared/types';
const key=document.querySelector<HTMLInputElement>('#api-key')!;
const model=document.querySelector<HTMLSelectElement>('#model')!;
const status=document.querySelector<HTMLElement>('#status')!;
const buttons=[...document.querySelectorAll<HTMLButtonElement>('button')];
async function run(action:()=>Promise<void>){buttons.forEach(b=>b.disabled=true);status.dataset.error='false';status.textContent='İşlem sürüyor…';try{await action();}catch(error){status.textContent=error instanceof Error?error.message:'İşlem tamamlanamadı.';status.dataset.error='true';}finally{buttons.forEach(b=>b.disabled=false);}}
async function refresh(){const saved=await request<{configured:boolean;model?:string}>({type:'SETTINGS_STATUS'});document.querySelector('#saved')!.textContent=saved.configured?'Bir anahtar kayıtlı. Değiştirmeyeceksen bu alanı boş bırak.':'Anahtar yalnızca bu tarayıcıdaki eklentide saklanır.';if(saved.model&&!model.value){model.replaceChildren(new Option(saved.model,saved.model));}}
document.querySelector('#load-models')!.addEventListener('click',()=>void run(async()=>{const models=await request<ModelOption[]>({type:'LIST_MODELS',apiKey:key.value.trim()});const previous=model.value;model.replaceChildren(...models.map(m=>new Option(m.id,m.id)));if(models.some(m=>m.id===previous))model.value=previous;status.textContent='Modeller alındı. Bir metin modeli seçip doğrula.';}));
document.querySelector('#settings-form')!.addEventListener('submit',e=>{e.preventDefault();void run(async()=>{await request({type:'SAVE_SETTINGS',apiKey:key.value.trim(),model:model.value});key.value='';await refresh();status.textContent='Bağlantı hazır. Bir web sayfasında eklentiyi açıp başlatabilirsin.';});});
document.querySelector('#delete')!.addEventListener('click',()=>void run(async()=>{await request({type:'CLEAR_SETTINGS'});key.value='';model.replaceChildren(new Option('Önce modelleri getir',''));await refresh();status.textContent='Kayıtlı anahtar ve sayfa bağlamları silindi.';}));
void refresh().catch(()=>{status.textContent='Ayarlar yüklenemedi. Eklentiyi yeniden aç.';});
