import {captureDatabase,snapshotFingerprint} from './snapshot.mjs';
import {isBookmark} from './export.mjs';
import {requireSafe} from './policy.mjs';
export async function auditBaseline(transport,backup){
 const privateBookmarks=[],safe={startedAt:new Date().toISOString(),status:'incomplete',snapshots:[],bookmarks:[]};
 const fixedTimestamp=new Date(Date.now()-10000).toISOString();
 async function bookmark(label,fixed=false){const startedAt=new Date().toISOString();const value=await (fixed?transport.bookmarkAt(fixedTimestamp):transport.bookmark());requireSafe(isBookmark(value),'bookmark_invalid');const finishedAt=new Date().toISOString();privateBookmarks.push({label,value,startedAt,finishedAt,...(fixed?{requestedTimestamp:fixedTimestamp}:{})});safe.bookmarks.push({label,startedAt,finishedAt,...(fixed?{requestedTimestamp:fixedTimestamp}:{})});return value;}
 async function snapshot(label){const startedAt=new Date().toISOString();const captured=await captureDatabase(transport,{requireApproved:false});const fingerprint=snapshotFingerprint(captured.snapshot);safe.snapshots.push({label,startedAt,finishedAt:new Date().toISOString(),stage:captured.stage,fingerprint,applicationTables:captured.snapshot.tables.length,rows:captured.snapshot.tables.reduce((n,t)=>n+t.rows.length,0),tables:captured.snapshot.tables.map(t=>({name:t.name,columns:t.columns.length,rows:t.rows.length}))});return fingerprint;}
 const first=await bookmark('current_before');const fixedFirst=await bookmark('fixed_time_before',true);
 const fp1=await snapshot('first');const mid=await bookmark('current_between');const fp2=await snapshot('second');
 const fixedLast=await bookmark('fixed_time_after',true);const last=await bookmark('current_after');
 safe.logicalContentMatchesBackup=fp1===backup.fingerprint&&fp2===backup.fingerprint;
 safe.logicalContentStable=fp1===fp2;safe.fixedTimestampBookmarkStable=fixedFirst===fixedLast;
 safe.currentBookmarksStable=first===mid&&mid===last;safe.currentEqualsSavedBackup=last===backup.bookmark;
 safe.currentAfterSavedBackup=last>backup.bookmark;safe.finishedAt=new Date().toISOString();
 safe.status=safe.logicalContentMatchesBackup&&safe.logicalContentStable&&safe.fixedTimestampBookmarkStable?'logical_match':'difference_requires_review';
 privateBookmarks.unshift({label:'saved_backup',value:backup.bookmark});
 return {safe,privateBookmarks};
}
