/* 伴老友：啟動入口 */
(function init(){
  lC();
  if(location.search.includes('setup') || !C.ok){
    showPage('setup');
    fillS();
    loadElderStatus();
  }else{
    goHome();
  }
})();
if('serviceWorker' in navigator){
  window.addEventListener('load',()=>{
    navigator.serviceWorker.register('./sw.js').catch(()=>{});
  });
}
