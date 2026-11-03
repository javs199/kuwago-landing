import {spawnSync} from 'node:child_process';
import {resolve} from 'node:path';
import {root,requireSafe} from './policy.mjs';
export const custodyRoot='C:\\Users\\JV\\AppData\\Local\\Kuwago\\D1Backups\\development';
function powershell(script,args=[],input){
 const env={...process.env};for(const key of Object.keys(env))if(/^(CLOUDFLARE_|CF_|WRANGLER_)/i.test(key))delete env[key];
 // Do not inherit PowerShell 7 module paths into Windows PowerShell 5.1.
 for(const key of Object.keys(env))if(key.toLowerCase()==='psmodulepath')delete env[key];
 const result=spawnSync('powershell.exe',['-NoProfile','-NonInteractive','-File',resolve(root,'scripts',script),...args],{env,input,encoding:'utf8',windowsHide:true,timeout:20000,maxBuffer:65536});
 let output;try{output=JSON.parse(result.stdout);}catch{throw Error('windows_security_check_failed');}
 requireSafe(result.status===0&&output.ok===true,'windows_security_check_failed');return output;
}
export const inspectCustody=()=>powershell('backup-custody.ps1',['-Mode','Inspect']);
export const prepareCustody=()=>powershell('backup-custody.ps1',['-Mode','Prepare']);
export const verifyWindowsCustody=()=>powershell('backup-custody.ps1',['-Mode','Verify']);
export const dpapi=Object.freeze({
 protect:async key=>Buffer.from(powershell('backup-dpapi.ps1',[],JSON.stringify({action:'protect',data:key.toString('base64')})).data,'base64'),
 unprotect:async key=>Buffer.from(powershell('backup-dpapi.ps1',[],JSON.stringify({action:'unprotect',data:key.toString('base64')})).data,'base64'),
});
