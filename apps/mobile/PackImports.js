import React,{useState} from 'react';
import {NativeModules,Pressable,StyleSheet,Text,View} from 'react-native';
const {downloadPlan}=require('../../packages/core/download-plan');
export default function PackImports({feed}){
 const [files,setFiles]=useState({}),[pending,setPending]=useState(''),[error,setError]=useState('');
 async function act(group){
  setPending(group.sha256);setError('');
  try{
   if(!NativeModules.FonyxFiles)throw new Error('El módulo de archivos no está disponible en esta compilación.');
   const file=files[group.sha256];
   if(file){await NativeModules.FonyxFiles.importPack(file.name);setFiles(old=>({...old,[group.sha256]:{...file,sent:true}}));}
   else{const name=await NativeModules.FonyxFiles.downloadPack(group.url,group.sha256);setFiles(old=>({...old,[group.sha256]:{name,sent:false}}));}
  }catch(e){setError(e.message);}finally{setPending('');}
 }
 const groups=downloadPlan(feed);
 return <View style={s.panel}><Text style={s.title}>Prepara los addons.</Text><Text style={s.copy}>Descarga verificada y envío a Minecraft, un archivo a la vez. Minecraft confirma la importación dentro del juego.</Text>{groups.map(group=>{
  const file=files[group.sha256];const title=decodeURIComponent(new URL(group.url).pathname.split('/').pop());
  return <View key={group.sha256+group.url} style={s.row}><Text style={s.name}>{title}</Text><Text style={s.small}>{group.packs.length} pack{group.packs.length===1?'':'s'} en este archivo</Text><Pressable accessibilityRole="button" disabled={!!pending} onPress={()=>act(group)} style={[s.button,!!pending&&s.disabled]}><Text style={s.buttonText}>{pending===group.sha256?'Preparando…':file?'Importar en Minecraft':'Descargar y verificar'}</Text></Pressable>{file?.sent&&<Text style={s.copy}>Enviado a Minecraft. Revisa allí el resultado de la importación; todavía no se ha confirmado la instalación.</Text>}</View>;
 })}{!!error&&<Text accessibilityRole="alert" style={s.error}>{error}</Text>}</View>;
}
const s=StyleSheet.create({panel:{padding:18,backgroundColor:'#152235',borderRadius:10,gap:14},title:{fontSize:20,color:'#eef3fa',fontFamily:'Minecraft-Bold'},name:{fontSize:14,fontWeight:'700',color:'#eef3fa',lineHeight:21},copy:{fontSize:14,color:'#b5c5d8',lineHeight:22},small:{fontSize:12,color:'#b5c5d8'},row:{gap:10,paddingVertical:12,borderTopWidth:1,borderTopColor:'#334359'},button:{padding:14,backgroundColor:'#ffd500',borderRadius:5,alignItems:'center'},disabled:{opacity:.5},buttonText:{color:'#111a24',fontWeight:'800'},error:{color:'#ffbd99',lineHeight:22}});
