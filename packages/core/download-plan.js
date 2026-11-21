const {validateFeed}=require('./index');
function downloadPlan(feed){
 validateFeed(feed);const groups=new Map();
 for(const pack of feed.packs){
  const key=pack.url+'|'+pack.sha256.toLowerCase();
  if(!groups.has(key))groups.set(key,{url:pack.url,sha256:pack.sha256,packs:[]});
  groups.get(key).packs.push(pack);
 }
 return [...groups.values()];
}
module.exports={downloadPlan};
