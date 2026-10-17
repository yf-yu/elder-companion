window.go = function(id){
  document.querySelectorAll('.sub').forEach(p => p.classList.remove('show'));
  const target = document.getElementById(id);
  if(target) target.classList.add('show');
  window.scrollTo(0, 0);

  if(id === 'sos')    bldP('sos-phones', true);
  if(id === 'phone')  bldP('all-phones', false);
  if(id === 'notice') bldN();
  if(id === 'meds')   initMeds();
  if(id === 'brain')  initMem();
  if(id === 'dress')  initDress();
};

window.bk = function(id){
  const el = document.getElementById(id);
  if(el) el.classList.remove('show');
};

window.goHome = function(){
  localStorage.setItem('elder_lastopen', new Date().toLocaleString('zh-TW'));
  document.querySelectorAll('.page').forEach(p => p.classList.remove('show'));
  document.getElementById('home').classList.add('show');
  initH();
};
