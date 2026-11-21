const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),esbuild=require('esbuild');
const root=path.resolve(__dirname,'..'),out=path.join(root,'apps/desktop/src/renderer-unified/build');
async function build(){
 fs.mkdirSync(out,{recursive:true});
 await esbuild.build({entryPoints:[path.join(root,'apps/desktop/src/renderer-unified/entry.jsx')],bundle:true,outfile:path.join(out,'app.js'),platform:'browser',alias:{'react-native':'react-native-web'},loader:{'.png':'file','.webp':'file','.gif':'file'},assetNames:'assets/[name]-[hash]',define:{'process.env.NODE_ENV':'"production"'},minify:true,metafile:true}).then(result=>{assert(Object.keys(result.metafile.inputs).some(file=>file.endsWith('packages/ui/Launcher.jsx')));fs.writeFileSync(path.join(out,'inputs.json'),JSON.stringify(Object.keys(result.metafile.inputs),null,2));});
 for(const name of ['Minecraft.otf','Minecraft-Bold.otf'])fs.copyFileSync(path.join(root,'apps/desktop/assets/fonts',name),path.join(out,name));
 const html=`<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'self';script-src 'self';style-src 'self' 'unsafe-inline';img-src 'self' data: https:;connect-src 'none';object-src 'none';base-uri 'none';frame-src 'none'"><title>Fonyx Launcher</title><style>@font-face{font-family:Minecraft;src:url(Minecraft.otf)}@font-face{font-family:Minecraft-Bold;src:url(Minecraft-Bold.otf)}html,body,#root{height:100%;margin:0;background:#0d121a}body{overflow:hidden}#root{display:flex}</style></head><body><div id="root"></div><script src="app.js"></script></body></html>`;
 fs.writeFileSync(path.join(out,'index.html'),html);
 console.log('Built the same packages/ui/Launcher.jsx for the desktop renderer. Android imports that file directly.');
}
build().catch(error=>{console.error(error);process.exitCode=1;});
