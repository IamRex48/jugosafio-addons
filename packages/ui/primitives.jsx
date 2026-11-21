import React,{createContext,useContext} from 'react';
import {Image,Pressable,StyleSheet,Text,View} from 'react-native';
import {icons,rasterSource} from './assets';
export function T({style,bold=false,...props}){return <Text allowFontScaling={false} {...props} style={[{fontFamily:bold?'Minecraft-Bold':'Minecraft',fontSize:14,lineHeight:22.4,color:'#f5f5f5'},style]}/>;}
export const Accent=createContext('#ffd465');
export function Icon({name,size=20,color='#bec9d9',style}){return <Image accessibilityElementsHidden source={rasterSource(icons[name]||icons.home)} style={[{width:size,height:size,tintColor:color,resizeMode:'contain'},style]}/>;}
export function Button({children,onPress,disabled=false,primary=false,icon,style,label}){const accent=useContext(Accent);return <Pressable accessibilityRole="button" accessibilityLabel={label} disabled={disabled} onPress={onPress} style={({pressed,hovered})=>[s.button,primary&&s.primary,primary&&{backgroundColor:accent},hovered&&!disabled&&{opacity:.95},pressed&&!disabled&&{transform:[{translateY:1}]},disabled&&{opacity:.5},style]}>{icon&&<Icon name={icon} color={primary?'#000':'#e4eaf2'}/>}<T bold={primary} style={{fontSize:primary?18:12,color:primary?'#000':'#e4eaf2'}}>{children}</T></Pressable>;}
export function Panel({children,style}){return <View style={[s.panel,style]}>{children}</View>;}
const s=StyleSheet.create({button:{minHeight:42,borderRadius:5,paddingVertical:9,paddingHorizontal:15,backgroundColor:'#152335d9',borderWidth:1,borderColor:'#ffffff32',flexDirection:'row',alignItems:'center',justifyContent:'center',gap:9},primary:{backgroundColor:'#ffd465',borderColor:'#fff5c177'},panel:{padding:28,backgroundColor:'#122031ed',borderWidth:1,borderColor:'#71839c55',borderRadius:8}});
