/* 伴老友：單一頁面路由。每次切換只顯示一頁。 */
window.showPage = function(id){
  const target = document.getElementById(id);
  if(!target || !target.matches('.page,.sub')) return false;

  document.querySelectorAll('.page,.sub').forEach(page => {
    page.classList.toggle('show', page === target);
  });
  target.scrollTop = 0;
  const content = target.querySelector('.sbdy');
  if(content) content.scrollTop = 0;
  return true;
};

window.go = function(id){
  const target = document.getElementById(id);
  if(!target || !target.classList.contains('sub')) return;
  if(!showPage(id)) return;

  if(id === 'sos')    bldP('sos-phones', true);
  if(id === 'phone')  bldP('all-phones', false);
  if(id === 'notice') bldN();
  if(id === 'meds')   initMeds();
  if(id === 'brain')  initMem();
  if(id === 'dress')  initDress();
};

window.bk = function(id){
  // 現有介面中所有子頁返回鍵均回到首頁
  showPage('home');
};

window.goHome = function(){
  localStorage.setItem('elder_lastopen',new Date().toLocaleString('zh-TW'));
  showPage('home');
  initH();
};
