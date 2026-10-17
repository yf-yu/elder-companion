/* ============ main.js：啟動入口 ============ */
(function init(){
  lC();

  if(location.search.includes('setup') || !C.ok){
    document.querySelectorAll('.page').forEach(p => p.classList.remove('show'));
    document.getElementById('setup').classList.add('show');
    fillS();
    loadElderStatus();
  } else {
    goHome();
  }
})();

/* Service Worker 註冊 */
if('serviceWorker' in navigator){
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(() => {});
  });
}
