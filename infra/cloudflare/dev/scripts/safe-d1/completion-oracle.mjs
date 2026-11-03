import {Miniflare,convertV4MiniflareOptions} from 'miniflare';
import {withCompletionSql} from './completion-backup.mjs';
import {approvedSources,migrations,target,requireSafe} from './policy.mjs';
import {splitMigration} from './sql.mjs';
import {captureDatabase} from './snapshot.mjs';
function checkedGenerated(ack,previous){
 const {stage,completionOutput:o}=ack;requireSafe([5,6].includes(stage)&&o?.history.length===stage&&o.history.every((r,i)=>r.id===i+1&&r.name===migrations[i].name),'completion_history_invalid');
 for(const r of o.history){const t=Date.parse(r.applied_at+'Z');requireSafe(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(r.applied_at)&&Number.isFinite(t)&&new Date(t).toISOString().slice(0,19).replace('T',' ')===r.applied_at,'completion_timestamp_invalid');}
 const c=o.control;requireSafe(c.length===1&&c[0].id===1&&/^[a-f0-9]{32}$/.test(c[0].epoch)&&c[0].mode==='ready'&&c[0].generation===null&&c[0].payload_hash===null,'completion_control_invalid');
 if(stage===6)requireSafe(previous?.stage===5&&c[0].epoch===previous.epoch&&JSON.stringify(o.history.slice(0,5))===JSON.stringify(previous.history),'completion_generated_values_changed');
 return Object.freeze({stage,epoch:c[0].epoch,history:o.history});
}
// Only epoch and CURRENT_TIMESTAMP output from this SAME successful transaction
// are substituted locally. All schemas, defaults, rows and prior history come from
// the pinned backup plus original migration SQL, not a postflight response.
export async function projectCompletion(ack,previous){
 const generated=checkedGenerated(ack,previous);let mf;
 try{return await withCompletionSql(async sql=>{
  mf=new Miniflare(convertV4MiniflareOptions({name:'kuwago-completion-oracle-local',host:'127.0.0.1',modules:true,script:'export default {fetch(){return new Response(null,{status:503})}}',compatibilityDate:'2026-07-30',telemetry:{enabled:false},cf:false,d1Databases:{DB:'ephemeral-completion-oracle'}}));
  const db=await mf.getD1Database('DB');await db.batch(splitMigration(sql.toString('utf8')).map(q=>db.prepare(q)));
  const old=(await db.prepare('SELECT id,name,applied_at FROM d1_migrations ORDER BY id').all()).results;
  requireSafe(JSON.stringify(old)===JSON.stringify(generated.history.slice(0,4)),'completion_previous_history_changed');
  const sources=approvedSources();for(let stage=5;stage<=ack.stage;stage++){
   await db.batch([...splitMigration(sources[stage-1]).map(q=>db.prepare(q)),db.prepare('INSERT INTO d1_migrations(id,name,applied_at) VALUES(?,?,?)').bind(stage,migrations[stage-1].name,generated.history[stage-1].applied_at)]);
   if(stage===5)await db.prepare('UPDATE publication_control SET epoch=? WHERE id=1').bind(generated.epoch).run();
  }
  const expected=await captureDatabase({metadata:async()=>({uuid:target.id,name:target.name,version:'production'}),select:async q=>(await db.prepare(q).all()).results});return {expected,generated};
 });}finally{await mf?.dispose();}
}
