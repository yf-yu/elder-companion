/* ============ setup.js：子女設定、今日狀況 ============ */
window.fillS = function(){
  if(!C.ok) return;
  ['sn|name','sf1n|f1n','sf1p|f1p','sf2n|f2n','sf2p|f2p','scn|cn','scp|cp','srg|rg'].forEach(s => {
    const [id, k] = s.split('|');
    if(e(id)) e(id).value = C[k] || '';
  });
  ['tw|sw','te|se','tg|sg'].forEach(s => {
    const [id, k] = s.split('|');
    if(C[k] !== false) e(id).classList.add('on');
    else e(id).classList.remove('on');
  });
};

window.saveC = function(){
  C = {
    name: v('sn') || '朋友',
    f1n: v('sf1n'), f1p: v('sf1p'),
    f2n: v('sf2n'), f2p: v('sf2p'),
    cn:  v('scn'),  cp:  v('scp'),
    rg:  v('srg'),
    sw:  e('tw').classList.contains('on'),
    se:  e('te').classList.contains('on'),
    sg:  e('tg').classList.contains('on'),
    ok:  true
  };
  localStorage.setItem('banlaoyou', JSON.stringify(C));
  toast('✓ 設定已儲存！');
  setTimeout(() => goHome(), 800);
};

window.loadElderStatus = function(){
  const today = new Date().toLocaleDateString('zh-TW');

  const meds = readJSON('elder_meds', []);
  const todayMeds = (Array.isArray(meds) ? meds : []).filter(m => m.date === today).map(m => m.time);
  const medEl = document.getElementById('status-meds');
  if(medEl) medEl.textContent = todayMeds.length ? todayMeds.join('、') + ' ✓' : '今日未記錄';

  const moods = readJSON('elder_mood', []);
  const todayMood = (Array.isArray(moods) ? moods : []).find(m => m.date === today);
  const moodFaces = {5:'😄 很好', 4:'🙂 不錯', 3:'😐 普通', 2:'😔 不太好', 1:'😢 很不好'};
  const moodEl = document.getElementById('status-mood');
  if(moodEl) moodEl.textContent = todayMood ? moodFaces[todayMood.score] : '今日未記錄';

  const habits = readJSON('st_habits_' + today, {});
  const habitNames = {h_water:'喝水', h_veg:'蔬菜', h_sleep:'睡眠', h_ex:'運動', h_sun:'曬太陽'};
  const done = Object.entries(habits && typeof habits === 'object' && !Array.isArray(habits) ? habits : {}).filter(([k,v]) => v).map(([k]) => habitNames[k] || k);
  const habEl = document.getElementById('status-habits');
  if(habEl) habEl.textContent = done.length ? done.join('・') : '今日未記錄';

  const lastOpen = localStorage.getItem('elder_lastopen');
  const loEl = document.getElementById('status-lastopen');
  if(loEl) loEl.textContent = lastOpen || '未知';
};
