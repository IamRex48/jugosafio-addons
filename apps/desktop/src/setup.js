const fs=require('node:fs/promises');
const path=require('node:path');
const {execFile}=require('node:child_process');
const {promisify}=require('node:util');
const core=require('./core');
async function executableCheck(file){
  if(typeof file!=='string'||!path.isAbsolute(file)||path.basename(file).toLowerCase()!=='minecraft.windows.exe')throw new Error('Selecciona Minecraft.Windows.exe dentro de la instalación de Minecraft.');
  const handle=await fs.open(file,'r');
  try{const bytes=Buffer.alloc(2);await handle.read(bytes,0,2,0);if(bytes.toString()!=='MZ')throw new Error('El archivo seleccionado no es un ejecutable de Windows válido.');}finally{await handle.close();}
  return file;
}
async function detectExecutable(saved=''){
  const candidates=[saved,'C:/XboxGames/Minecraft for Windows/Content/Minecraft.Windows.exe'];
  if(process.platform==='win32')try{
    const {stdout}=await promisify(execFile)('powershell.exe',['-NoProfile','-NonInteractive','-Command',"Get-AppxPackage -Name Microsoft.MinecraftUWP | Select-Object -ExpandProperty InstallLocation"],{windowsHide:true,timeout:10000});
    for(const folder of stdout.trim().split(/\r?\n/).filter(Boolean))candidates.push(path.join(folder,'Minecraft.Windows.exe'));
  }catch{}
  for(const candidate of candidates.filter(Boolean))try{return await executableCheck(candidate);}catch{}
  return '';
}
async function dataCheck(folder,account=false){
  await core.rootCheck(folder);
  if(account){if(!(await fs.stat(path.join(folder,'minecraftpe','options.txt'))).isFile())throw new Error('Faltan los ajustes de Minecraft en esta carpeta. Abre Minecraft una vez o selecciona su carpeta de datos.');}
  else{const entries=await fs.readdir(folder);if(!entries.some(name=>['resource_packs','behavior_packs','minecraftpe','minecraftWorlds'].includes(name)))throw new Error('No aparecen los archivos de Minecraft en esta carpeta. Abre Minecraft una vez o elige otra ubicación.');}
}
async function status(settings){
  const result={root:settings.root||'',profile:settings.profile||'',executable:settings.minecraftExecutable||'',rootValid:false,profileValid:false,installationValid:false,errors:[],problems:{}};
  for(const [field,check] of [['rootValid',()=>dataCheck(result.root)],['profileValid',()=>dataCheck(result.profile,true)],['installationValid',()=>executableCheck(result.executable)]])try{await check();result[field]=true;}catch(error){const message=field==='installationValid'?'No se encontró Minecraft.Windows.exe. Selecciona su ubicación.':error.code==='ENOENT'?'Faltan archivos de Minecraft. Abre el juego una vez o revisa su carpeta.':error.message;result.errors.push(message);result.problems[field]=message;}
  return result;
}
async function accountChoices(root){
  const candidates=[root],users=path.dirname(path.dirname(path.dirname(root)));
  if(path.basename(users).toLowerCase()==='users'&&path.basename(path.dirname(root)).toLowerCase()==='games'){
    let entries=[];try{entries=await fs.readdir(users,{withFileTypes:true});}catch(error){if(error.code!=='ENOENT')throw error;}
    for(const entry of entries)if(entry.isDirectory()&&entry.name.toLowerCase()!=='shared')candidates.push(path.join(users,entry.name,'games','com.mojang'));
  }
  const choices=[];
  for(const candidate of [...new Set(candidates.filter(Boolean).map(folder=>path.resolve(folder)))].sort())try{await dataCheck(candidate,true);choices.push(candidate);}catch{}
  return choices;
}
async function accountFolder(root,xuid){
  if(typeof xuid!=='string'||!/^\d{1,20}$/.test(xuid))return '';
  const choices=await accountChoices(root);return choices.length===1?choices[0]:'';
}
function audioPreferences(value){
  if(!value||typeof value.inputId!=='string'||typeof value.outputId!=='string'||value.inputId.length>512||value.outputId.length>512||/[\x00-\x1f]/.test(value.inputId+value.outputId))throw new Error('Selecciona dispositivos de audio válidos.');
  return {voiceInput:value.inputId,voiceOutput:value.outputId,audioConfigured:true};
}
module.exports={executableCheck,detectExecutable,dataCheck,status,accountFolder,accountChoices,audioPreferences};
