const { spawn } = require('node:child_process');
const readline = require('node:readline');
const fs = require('node:fs/promises');
const path = require('node:path');

function startEventTrust(helper, directory, host, port) {
  return new Promise((resolve, reject) => {
    const trace=message=>{fs.mkdir(directory,{recursive:true}).then(()=>fs.appendFile(path.join(directory,'helper-events.jsonl'),JSON.stringify({time:new Date().toISOString(),launcherPid:process.pid,host,port,...message})+'\n')).catch(()=>{});};
    trace({phase:'helper-start',helper});
    const child = spawn(helper, [String(process.pid), host, String(port), directory], { windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
    let resolveReady, rejectReady, resolveExit, restoreError, waiting = false, patched = false, exited = false, stderr = '';
    const ready = new Promise((yes, no) => { resolveReady = yes; rejectReady = no; });
    ready.catch(() => {});
    const exit = new Promise(yes => { resolveExit = yes; });
    const timeout = setTimeout(() => {
      const error = new Error('Minecraft tardó demasiado en preparar el permiso del evento.');
      reject(error); rejectReady(error); child.stdin.end();
    }, 90000);
    const lines = readline.createInterface({ input: child.stdout });
    const session = { ready, async stop() {
      if (!exited) child.stdin.end('restore\n');
      let timer;
      try {
        await Promise.race([exit, new Promise((_, no) => { timer = setTimeout(() => no(new Error('La restauración del permiso no terminó. Cierra Minecraft para retirar la sesión temporal.')), 15000); })]);
        if (restoreError) throw restoreError;
      } finally { clearTimeout(timer); }
    } };
    child.stdin.on('error', () => {});
    child.stderr.on('data', bytes => { stderr = (stderr + bytes).slice(-4000); });
    lines.on('line', line => {
      let message; try { message = JSON.parse(line); } catch { return; }
      trace(message);
      if (message.phase === 'waiting') { waiting = true; resolve(session); }
      if (message.phase === 'patched') { patched = true; clearTimeout(timeout); resolveReady(); }
      if (message.phase === 'error') {
        const error = new Error(message.message); reject(error); rejectReady(error);
        if (patched) restoreError = error;
      }
    });
    child.on('error', error => { trace({phase:'spawn-error',message:error.message});clearTimeout(timeout); reject(error); rejectReady(error); exited = true; resolveExit(); });
    child.on('close', code => {
      trace({phase:'helper-exit',code,patched,stderr});
      clearTimeout(timeout); lines.close(); exited = true; resolveExit();
      if (!patched) { const error = new Error(stderr || 'No se pudo preparar el permiso temporal de esta versión de Minecraft.'); reject(error); rejectReady(error); }
      if (code && waiting && patched && !restoreError) restoreError = new Error('No se pudo verificar la restauración del permiso temporal. Cierra Minecraft para retirar esta sesión.');
    });
  });
}
async function launchWithEventTrust({helper,directory,host,port,uri,enabled,open,start=startEventTrust,report=()=>{}}){
  let session=null,warning='';
  const warn=error=>{warning=' No se pudo aplicar el permiso del evento: '+error.message+' Confirma el aviso normal en Minecraft.';report(warning.trim());};
  try{
    if(enabled){
      try{session=await start(helper,directory,host,port);}catch(error){warn(error);}
    }
    // Bedrock queues a connect activation on cold start. A menu-only activation
    // followed by another activation during startup can lose the destination.
    report('Solicitando conexión a '+host+':'+port+'.');
    await open(uri);
    if(session){
      try{await session.ready;report('Parche preparado para '+host+':'+port+'.');}
      catch(error){const failed=session;session=null;await failed.stop();warn(error);}
    }
    return {session,warning};
  }catch(error){if(session)await session.stop();throw error;}
}
module.exports = { startEventTrust, launchWithEventTrust };
