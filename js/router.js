
function showPage(id) {
  const target = document.getElementById(id);

  if (!target) return;

  // 先隱藏所有頁面
  document.querySelectorAll('.page, .sub').forEach(page => {
    page.classList.remove('show');
  });

  // 只顯示指定頁面
  target.classList.add('show');

  // 切換後回到頂部
  target.scrollTop = 0;

  const content = target.querySelector('.sbdy');
  if (content) content.scrollTop = 0;
}

window.go = function(id) {
  showPage(id);

  // 保留原本功能初始化
  if (id === 'sos') bldP('sos-phones', true);
  if (id === 'phone') bldP('all-phones', false);
  if (id === 'notice') bldN();
  if (id === 'meds') initMeds();
  if (id === 'brain') initMem();
  if (id === 'dress') initDress();
};

window.bk = function(id) {
  showPage('home');
};

window.goHome = function() {
  localStorage.setItem(
    'elder_lastopen',
    new Date().toLocaleString('zh-TW')
  );

  showPage('home');
  initH();
};
