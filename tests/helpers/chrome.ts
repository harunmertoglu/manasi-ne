export function memoryArea(){
 const data:Record<string,any>={};let access='TRUSTED_AND_UNTRUSTED_CONTEXTS';
 return {data,get access(){return access;},async get(key:string|null){if(key===null)return structuredClone(data);return {[key]:structuredClone(data[key])};},async set(value:Record<string,any>){Object.assign(data,structuredClone(value));},async remove(key:string|string[]){for(const k of typeof key==='string'?[key]:key)delete data[k];},async setAccessLevel(value:{accessLevel:string}){access=value.accessLevel;}};
}
