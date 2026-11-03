// Private logical media archive for local operator use only. Never routed over HTTP.
import {createHash} from 'node:crypto';
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
export async function createMediaArchive(backup,bucket){
  const assets=backup.data.tables.find(table=>table.name==='media_assets').rows;
  const objects=[],missing=[];let total=0;
  for(const asset of assets.filter(asset=>asset.state!=='deleted'))for(const variant of ['private_object_key','derivative_object_key']){
    if(!asset[variant])continue;const object=await bucket.get(asset[variant]);if(!object){missing.push({mediaId:asset.id,variant});continue;}
    const bytes=Buffer.from(await object.arrayBuffer());total+=bytes.length;if(bytes.length>2097152||total>50000000||objects.length>=1000)throw new Error('media_archive_limit');
    objects.push({mediaId:asset.id,variant,bytes:bytes.toString('base64'),sha256:hash(bytes)});
  }
  const data={format:1,databaseHash:backup.sha256,objects,missing};return {data,sha256:hash(JSON.stringify(data))};
}
export async function restoreMediaArchive(db,bucket,archive,databaseHash){
  const control=await db.prepare('SELECT mode FROM publication_control WHERE id=1').first();if(control.mode!=='paused')throw new Error('paused_isolated_restore_required');
  if(archive?.data?.format!==1||archive.data.databaseHash!==databaseHash||hash(JSON.stringify(archive.data))!==archive.sha256||JSON.stringify(archive).length>70000000)throw new Error('media_archive_integrity_failed');
  const seen=new Set();
  for(const item of archive.data.objects){
    if(!['private_object_key','derivative_object_key'].includes(item.variant))throw new Error('invalid_media_variant');const identity=item.mediaId+':'+item.variant;if(seen.has(identity))throw new Error('duplicate_media_object');seen.add(identity);
    const asset=await db.prepare('SELECT * FROM media_assets WHERE id=?').bind(item.mediaId).first();if(!asset||asset.state==='deleted'||!asset[item.variant])throw new Error('media_archive_reference_mismatch');
    const bytes=Buffer.from(item.bytes,'base64');if(bytes.length>2097152||hash(bytes)!==item.sha256||(item.variant==='derivative_object_key'&&asset.sha256!==item.sha256))throw new Error('media_bytes_integrity_failed');
    const existing=await bucket.get(asset[item.variant]);if(existing){if(hash(Buffer.from(await existing.arrayBuffer()))!==item.sha256)throw new Error('restore_object_conflict');}
    else if(!await bucket.put(asset[item.variant],bytes,{onlyIf:{etagDoesNotMatch:'*'}}))throw new Error('concurrent_restore');
  }
  return verifyMediaStorage(db,bucket);
}
export async function verifyMediaStorage(db,bucket){
  const assets=(await db.prepare("SELECT * FROM media_assets WHERE state<>'deleted'").all()).results,missing=[],invalid=[];
  for(const asset of assets)for(const variant of ['private_object_key','derivative_object_key']){
    if(!asset[variant])continue;const object=await bucket.get(asset[variant]);if(!object){missing.push({mediaId:asset.id,variant});continue;}
    if(variant==='derivative_object_key'&&hash(Buffer.from(await object.arrayBuffer()))!==asset.sha256)invalid.push({mediaId:asset.id,variant});
  }
  return {missing,invalid,complete:missing.length===0&&invalid.length===0};
}
