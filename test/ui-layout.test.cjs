const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {geometry,measuredBounds,pageTitle}=require('../packages/ui/layout');
test('shared landscape geometry preserves desktop proportions on phone and tablet',()=>{
 for(const [width,height] of [[1240,800],[1920,1080],[640,320],[2560,1600]]){const g=geometry(width,height);assert(g.width>=1000);assert.equal(g.width*g.scale,width);assert.equal(g.height*g.scale,height);}
 assert.deepEqual(geometry(1240,800),{width:1240,height:800,scale:1});
 assert.throws(()=>geometry(0,800));assert.throws(()=>geometry(NaN,800));
 const last={width:1240,height:800};assert.equal(measuredBounds(last,{width:0,height:0}),last);assert.equal(measuredBounds(last,{width:NaN,height:800}),last);assert.deepEqual(measuredBounds(last,{width:1920,height:1080}),{width:1920,height:1080});
 assert.equal(pageTitle('notices',{name:'Jugosafio R'}),'Avisos de Jugosafio R');
});
test('shared icons come from the desktop SVG symbols and both apps import one scene',()=>{
 const html=fs.readFileSync(path.join(__dirname,'../apps/desktop/src/renderer/index.html'),'utf8');
 const hashes=require('../packages/ui/assets/source-icons.json');
 for(const [,name,body]of html.matchAll(/<symbol id="i-([a-z-]+)"[^>]*>([\s\S]*?)<\/symbol>/g)){assert.equal(crypto.createHash('sha256').update(body).digest('hex'),hashes[name]);assert(fs.statSync(path.join(__dirname,'../packages/ui/assets',name+'.png')).size>0);}
 for(const file of ['apps/mobile/App.js','apps/desktop/src/renderer-unified/entry.jsx'])assert.match(fs.readFileSync(path.join(__dirname,'..',file),'utf8'),/packages\/ui\/Launcher/);
 const scene=fs.readFileSync(path.join(__dirname,'../packages/ui/Launcher.jsx'),'utf8');assert(!/Elige tu aventura|Tu próximo evento|A tu manera|Prueba nativa|COMPILACIÓN DE PRUEBA/.test(scene));
});
