import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../',import.meta.url));
const result=spawnSync(process.execPath,[fileURLToPath(new URL('../node_modules/vite/bin/vite.js',import.meta.url)),'--host','127.0.0.1','--port','5175','--strictPort'],{cwd:root,env:{...process.env,VITE_LOCAL_TEST_LOGIN:'true'},stdio:'inherit'});
if(result.error)throw result.error;process.exitCode=result.status??1;
