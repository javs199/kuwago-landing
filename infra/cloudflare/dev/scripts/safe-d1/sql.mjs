// Delimit only top-level semicolons. Trigger bodies and quoted strings stay intact.
export function splitMigration(sql){
 const result=[];let start=0,quote='',line=false,block=false,trigger=false,word='',words=[],depth=0;
 const flush=()=>{if(!word)return;const token=word.toUpperCase();words.push(token);if(words[0]==='CREATE'&&words.includes('TRIGGER'))trigger=true;if(trigger){if(token==='BEGIN'||token==='CASE')depth++;if(token==='END')depth--;}word='';};
 for(let i=0;i<sql.length;i++){
  const c=sql[i],next=sql[i+1];
  if(line){if(c==='\n')line=false;continue;}
  if(block){if(c==='*'&&next==='/'){block=false;i++;}continue;}
  if(quote){if(c===quote){if(next===quote)i++;else quote='';}continue;}
  if(c==='-'&&next==='-'){flush();line=true;i++;continue;}
  if(c==='/'&&next==='*'){flush();block=true;i++;continue;}
  if(c==="'"||c==='"'||c==='`'){flush();quote=c;continue;}
  if(/[A-Za-z_]/.test(c)){word+=c;continue;}flush();
  if(c===';'&&(!trigger||depth===0)){const statement=sql.slice(start,i).replace(/^\s*--[^\n]*(?:\n|$)/gm,'').trim();if(statement)result.push(statement);start=i+1;trigger=false;depth=0;words=[];}
 }
 flush();const tail=sql.slice(start).replace(/^\s*--[^\n]*(?:\n|$)/gm,'').trim();if(tail)result.push(tail);
 if(quote||block||depth!==0)throw Error('migration_sql_structure_invalid');return result;
}
