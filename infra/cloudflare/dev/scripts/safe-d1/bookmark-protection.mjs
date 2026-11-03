import {isBookmark} from './export.mjs';
import {requireSafe} from './policy.mjs';
export async function protectBookmark(value,protector){
 requireSafe(isBookmark(value),'bookmark_invalid');
 const bytes=Buffer.concat([Buffer.from(value.replaceAll('-',''),'hex'),Buffer.from('BKM1')]);
 try{requireSafe(bytes.length===32,'bookmark_encoding_invalid');return (await protector.protect(bytes)).toString('base64');}finally{bytes.fill(0);}
}
