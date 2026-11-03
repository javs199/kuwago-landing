import test from 'node:test';
import assert from 'node:assert/strict';
import {protectBookmark} from '../scripts/safe-d1/bookmark-protection.mjs';
import {dpapi} from '../scripts/safe-d1/windows-custody.mjs';
test('existing DPAPI accepts BKM1 bookmark encoding; rejects textual bookmark length',async()=>{
 const synthetic='00000000-00000000-00000000-'+'0'.repeat(32);
 await assert.rejects(()=>dpapi.protect(Buffer.from(synthetic)),/windows_security_check_failed/);
 const sealed=await protectBookmark(synthetic,dpapi);const restored=await dpapi.unprotect(Buffer.from(sealed,'base64'));
 try{assert.equal(restored.length,32);assert.equal(restored.subarray(28).toString(),'BKM1');assert.ok(restored.subarray(0,28).every(b=>b===0));}finally{restored.fill(0);}
});
