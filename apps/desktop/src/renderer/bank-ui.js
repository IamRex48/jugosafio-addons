(() => {
  const panel=document.querySelector('#bank-record'),balance=document.querySelector('#bank-balance'),soul=document.querySelector('#bank-soul'),status=document.querySelector('#bank-status');
  let loading=false;
  async function refresh(){
    if(loading||document.hidden)return;loading=true;
    try{
      const response=await window.fonyx.bankStatus();if(!response.ok)throw new Error(response.error);
      const {record,status:message}=response.value;
      balance.textContent=record?new Intl.NumberFormat('es-MX').format(record.balance):'—';
      soul.hidden=!record;soul.src='../../assets/bank/'+(record?.soul?'alma':'alma_vacia')+'.png';soul.alt=record?.soul?'Con alma':'Sin alma';
      status.textContent=message+(record?' · '+new Date(record.recordedAt).toLocaleString('es-MX'):'');panel.title=status.textContent;
    }catch{status.textContent='No se pudo consultar el banco';}finally{loading=false;}
  }
  window.fonyx.onVoice(event=>{if(event.type==='account'){balance.textContent='—';soul.hidden=true;status.textContent='Consultando tu registro…';refresh();}});
  document.addEventListener('visibilitychange',refresh);setInterval(refresh,30000);refresh();
})();
