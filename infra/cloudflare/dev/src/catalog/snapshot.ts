import { PublicCatalogSchema } from '../../../../../packages/contracts/src/public.js';
import type { PublicCatalog } from '../../../../../packages/contracts/src/models.js';
import { ApiFailure } from './errors.js';
export const manifestKey='catalog/v1/current.json';
export function parseSnapshot(text:string):{epoch?:string;generation:number;catalog:PublicCatalog} {
  if(new TextEncoder().encode(text).length>1_049_600)throw new ApiFailure(503,'catalog_unavailable');
  let data:unknown;try{data=JSON.parse(text);}catch{throw new ApiFailure(503,'catalog_unavailable');}
  if(!data||typeof data!=='object'||Array.isArray(data)||Object.keys(data).some(k=>!['epoch','generation','catalog'].includes(k))||!('generation'in data)||!Number.isSafeInteger(data.generation)||(data.generation as number)<0||!('catalog'in data)||('epoch'in data&&(typeof data.epoch!=='string'||!/^[a-f0-9]{32}$/.test(data.epoch))))throw new ApiFailure(503,'catalog_unavailable');
  const parsed=PublicCatalogSchema.safeParse(data.catalog);
  if(!parsed.success||parsed.data.source!=='api'||parsed.data.services.some(s=>s.source!=='published'||s.media.some(m=>!/^\/v1\/media\/[a-f0-9]{64}$/.test(m.url))))throw new ApiFailure(503,'catalog_unavailable');
  const used=new Set(parsed.data.services.map(s=>s.categoryId));
  if(parsed.data.categories.some(category=>!used.has(category.id)))throw new ApiFailure(503,'catalog_unavailable');
  return {...('epoch'in data?{epoch:data.epoch as string}:{}),generation:data.generation as number,catalog:parsed.data};
}
