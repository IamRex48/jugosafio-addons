const {https}=require('../../packages/core');
const {validateContent}=require('../../packages/core/content');
async function loadContent(sources,load){
 let failure;
 for(const source of sources){
  try{
   return validateContent(await load(https(source)));
  }catch(error){failure=error;}
 }
 throw failure||new Error('No hay fuentes de contenido configuradas.');
}
module.exports={loadContent};
