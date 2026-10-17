
window.go = function(id) {
  const target = document.getElementById(id);
  if (!target || !target.classList.contains('sub')) return;

  // 確保一次只有一個子頁面顯示
  document.querySelectorAll('.sub').forEach(p => {
    p.classList.remove('show');
  });

  // 主頁面只顯示首頁
  document.querySelectorAll('.page').forEach(p => {
    p.classList.toggle('show', p.id === 'home');
  });

  target.classList.add('show');

  // 重設真正的捲動容器
  target.scrollTop = 0;
  const body = target.querySelector('.sbdy');
  if (body) body.scrollTop = 0;

  // 保留原有功能
  if (id === 'sos') bldP('sos-phones', true);
  if (id === 'phone') bldP('all-phones', false);
  if (id === 'notice') bldN();
  if (id === 'meds') initMeds();
  if (id === 'brain') initMem();
  if (id === 'dress') initDress();
};

window.bk = function(id) {
  const target = document.getElementById(id);
  if (!target) return;

  target.classList.remove('show');
};

window.goHome = function() {
  localStorage.setItem(
    'elder_lastopen',
    new Date().toLocaleString('zh-TW')
  );

  document.querySelectorAll('.sub').forEach(p => {
    p.classList.remove('show');
  });

  document.querySelectorAll('.page').forEach(p => {
    p.classList.remove('show');
  });

  const home = document.getElementById('home');
  home.classList.add('show');
  home.scrollTop = 0;

  initH();
};
