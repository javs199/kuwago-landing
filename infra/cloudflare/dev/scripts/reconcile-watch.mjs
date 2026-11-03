// Local stand-in for Cloudflare Cron. Fixed loopback URL; no remote endpoint or credentials accepted.
if(process.argv.length>2&&!(process.argv.length===3&&process.argv[2]==='--once'))throw new Error('Only --once is supported');
let running=false;
async function tick(){
  if(running)return;running=true;
  try{
    const response=await fetch('http://127.0.0.1:8793/cdn-cgi/local/scheduled?cron=*+*+*+*+*&format=json',{signal:AbortSignal.timeout(20000)});
    if(!response.ok)throw new Error('local_scheduled_failed');
    console.info(JSON.stringify({event:'local_scheduled_tick',ok:true}));
  }catch{console.error(JSON.stringify({event:'local_scheduled_tick',ok:false}));if(process.argv[2]==='--once')process.exitCode=1;}
  finally{running=false;}
}
await tick();
if(process.argv[2]!=='--once')setInterval(()=>{void tick();},60000);
