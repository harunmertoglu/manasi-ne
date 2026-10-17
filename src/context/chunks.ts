import { AppError } from '../shared/types';
export function chunkText(paragraphs:string[]):string[]{
 // Joining first preserves every paragraph; separators count toward the budget.
 const text=paragraphs.join('\n');
 if(text.length>120000)throw new AppError('page_too_large','Sayfa 120.000 karakter sınırını aşıyor. Daha kısa bir sayfada deneyin.');
 if(!text.trim())throw new AppError('empty_page','Okunabilir metin bulunamadı.');
 const chunks:string[]=[];for(let i=0;i<text.length;i+=12000)chunks.push(text.slice(i,i+12000));
 return chunks;
}
