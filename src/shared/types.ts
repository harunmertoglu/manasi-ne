export type PageContent = {url:string;title:string;paragraphs:string[];version:string};
export type SelectionContext = {text:string;paragraphIndex:number;startOffset:number;surrounding:string[]};
export type Meaning = {word:string;language:'tr'|'en';explanation:string;turkishEquivalent?:string};
export type Settings = {apiKey:string;model:string;validated:boolean};
export type PageStatus = 'preparing'|'ready'|'stale'|'error';
export type PageState = {tabId:number;generation:string;page:PageContent;status:PageStatus;summary:string;updatedAt:number;error?:string;progress?:string};
export type Result<T> = {ok:true;value:T}|{ok:false;code:string;message:string};
export type ModelOption = {id:string};
export class AppError extends Error {constructor(public code:string,message:string){super(message);}}
export function failure(error:unknown):Result<never>{return {ok:false,code:error instanceof AppError?error.code:'unexpected',message:error instanceof AppError?error.message:'İşlem tamamlanamadı. Lütfen yeniden deneyin.'};}
