window.C = {};

window.lC = function(){
  try { window.C = JSON.parse(localStorage.getItem('banlaoyou') || '{}'); }
  catch(e){ window.C = {}; }
};

window.e = function(id){ return document.getElementById(id); };
window.v = function(id){ return (document.getElementById(id) || {}).value || ''; };

window.toast = function(msg){
  const t = document.getElementById('toast');
  if(!t) return;
  t.textContent = msg;
  t.style.transform = 'translateX(-50%) translateY(0)';
  clearTimeout(t._t);
  t._t = setTimeout(() => {
    t.style.transform = 'translateX(-50%) translateY(80px)';
  }, 2800);
};
