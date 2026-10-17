import {collectBlocks,normalize} from './extract';
import {AppError,type SelectionContext} from '../shared/types';
export function resolveSelection(range:Range,doc:Document):SelectionContext{
 const text=normalize(range.toString());
 if(!text||text.length>200)throw new AppError('selection_size','Lütfen en fazla 200 karakterlik bir kelime veya ifade seçin.');
 const blocks=collectBlocks(doc);
 const index=blocks.findIndex(b=>b.nodes.includes(range.startContainer as Text));
 const block=blocks[index];
 if(!block||!block.nodes.includes(range.endContainer as Text))throw new AppError('selection_location','Lütfen ana metnin içinden bir kelime seçin.');
 let prefix='';for(const node of block.nodes){if(node===range.startContainer){prefix+=node.data.slice(0,range.startOffset);break;}prefix+=node.data;}
 const startOffset=prefix.replace(/\s+/gu,' ').trimStart().length;
 const surrounding=blocks.slice(Math.max(0,index-1),index+2).map((b,i)=>{
  if(b.text.length<=12000)return b.text;
  const selected=Math.max(0,index-1)+i===index;
  const start=selected?Math.max(0,startOffset-6000):0;
  return b.text.slice(start,start+12000);
 });
 return {text,paragraphIndex:index,startOffset,surrounding};
}
