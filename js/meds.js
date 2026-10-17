/* ============ meds.js：吃藥提醒 ============ */
let medData = JSON.parse(localStorage.getItem('elder_meds') || '[]');

window.initMeds = function(){
  const today = new Date().toLocaleDateString('zh-TW');
  const todayMeds = medData.filter(m => m.date === today);

  if(e('med-today-txt')){
    e('med-today-txt').textContent = todayMeds.length
      ? `今天已記錄：${todayMeds.map(m => m.time).join('・')}`
      : '今天還沒有記錄';
  }
  if(e('med-today-date')) e('med-today-date').textContent = today;

  if(e('med-hist-list')){
    e('med-hist-list').innerHTML = medData.slice(0, 10).map(m =>
      `<div style="display:flex;justify-content:space-between;padding:7px 0;border-bottom:1px solid var(--border);font-size:14px;color:var(--muted)"><span>${m.date}</span><span>${m.time}</span><span style="font-size:18px">${m.time==='早上'?'☀️':m.time==='中午'?'🌿':'🌙'}</span></div>`
    ).join('') || '<div style="color:var(--hint);font-size:14px;text-align:center;padding:10px">還沒有記錄</div>';
  }
};

window.markMed = function(time){
  const today = new Date().toLocaleDateString('zh-TW');
  const already = medData.find(m => m.date === today && m.time === time);
  if(already){ toast(`${time}的藥已經記錄過了！`); return; }

  medData.unshift({date: today, time});
  if(medData.length > 60) medData = medData.slice(0, 60);
  localStorage.setItem('elder_meds', JSON.stringify(medData));
  toast(`✓ ${time}的藥記錄完成！`);
  initMeds();
};
