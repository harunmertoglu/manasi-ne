import type {PageContent,SelectionContext} from '../shared/types';
export function cacheKey(page:PageContent,selection:SelectionContext,model:string):string{
 return JSON.stringify([page.version,selection.paragraphIndex,selection.startOffset,selection.text,model,'contextual-v1']);
}
