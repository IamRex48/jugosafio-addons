const HEIGHT=800;
function geometry(width,height){
 if(!Number.isFinite(width)||!Number.isFinite(height)||width<=0||height<=0)throw new Error('Invalid launcher viewport');
 const scale=Math.min(width/1000,height/HEIGHT);
 return {width:width/scale,height:height/scale,scale};
}
function measuredBounds(previous,next){return Number.isFinite(next.width)&&Number.isFinite(next.height)&&next.width>0&&next.height>0?next:previous;}
function pageTitle(page,event){return {home:event.name,notices:'Avisos de '+event.name,bestiary:'Dedciclopedia',changes:'Cambios de '+event.name,voice:'Chat de voz',admin:'Administración'}[page]||event.name;}
module.exports={geometry,measuredBounds,pageTitle};
