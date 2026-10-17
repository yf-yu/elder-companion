/* ============ health.js：健康操、養生知識 ============ */
window.tex = function(hdr){
  const s = hdr.nextElementSibling;
  const a = hdr.querySelector('.etg');
  s.classList.toggle('op');
  a.classList.toggle('op');
};

window.swh = function(btn, tid){
  document.querySelectorAll('.htab').forEach(t => t.classList.remove('act'));
  btn.classList.add('act');
  document.querySelectorAll('.hcards').forEach(c => c.style.display = 'none');
  const target = e(tid);
  if(target) target.style.display = 'flex';
};

window.ytl = function(q){
  if(navigator.onLine){
    window.open('https://www.youtube.com/results?search_query=' + encodeURIComponent(q), '_blank');
  } else {
    toast('目前沒有網路，請依上方文字說明做動作');
  }
};
