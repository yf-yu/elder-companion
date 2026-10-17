/* ============ brain.js：配對記憶、算術、情緒打卡 ============ */

/* ─── 配對記憶 ─── */
const EMOJIS = ['🍎','🐶','🌸','🐟','🌙','☀️','🎵','🦋'];
let memFlipped = [], memMatched = 0, memSteps = 0, memLock = false;

window.initMem = function(){
  const cards = [...EMOJIS, ...EMOJIS].sort(() => Math.random() - .5);
  memFlipped = []; memMatched = 0; memSteps = 0; memLock = false;

  if(e('mem-steps'))   e('mem-steps').textContent = '0';
  if(e('mem-matched')) e('mem-matched').textContent = '0';

  const g = e('mem-grid');
  if(!g) return;
  g.innerHTML = cards.map((em, i) =>
    `<div class="mem-card" data-em="${em}" data-i="${i}" onclick="flipCard(this)">❓</div>`
  ).join('');
};

window.flipCard = function(card){
  if(memLock || card.classList.contains('flip') || card.classList.contains('matched')) return;
  card.classList.add('flip');
  card.textContent = card.dataset.em;
  memFlipped.push(card);

  if(memFlipped.length === 2){
    memLock = true;
    memSteps++;
    if(e('mem-steps')) e('mem-steps').textContent = memSteps;

    if(memFlipped[0].dataset.em === memFlipped[1].dataset.em){
      memFlipped.forEach(c => { c.classList.add('matched'); c.classList.remove('flip'); });
      memMatched++;
      if(e('mem-matched')) e('mem-matched').textContent = memMatched;
      memFlipped = []; memLock = false;
      if(memMatched === 8){
        setTimeout(() => toast('🎉 恭喜！全部配對完成！步數：' + memSteps), 300);
      }
    } else {
      setTimeout(() => {
        memFlipped.forEach(c => c.classList.add('wrong'));
        setTimeout(() => {
          memFlipped.forEach(c => {
            c.classList.remove('flip', 'wrong');
            c.textContent = '❓';
          });
          memFlipped = []; memLock = false;
        }, 600);
      }, 600);
    }
  }
};

/* ─── 算術練習 ─── */
let mathR = 0, mathW = 0, mathLevel = 1;

window.setMathLevel = function(level){
  mathLevel = level;
  [1,2,3].forEach(l => {
    const btn = e('ml-' + l);
    if(!btn) return;
    if(l === level) btn.classList.add('act');
    else btn.classList.remove('act');
  });
  mathR = 0; mathW = 0;
  if(e('math-right')) e('math-right').textContent = '0';
  if(e('math-wrong')) e('math-wrong').textContent = '0';
  newMath();
};

window.newMath = function(){
  const ops = ['+','-','×'];
  const op = ops[Math.floor(Math.random() * 3)];
  let a, b, ans;
  const maxNum = mathLevel === 1 ? 20 : mathLevel === 2 ? 50 : 99;

  if(op === '+'){ a = Math.floor(Math.random()*maxNum)+1; b = Math.floor(Math.random()*maxNum)+1; ans = a+b; }
  else if(op === '-'){ a = Math.floor(Math.random()*(maxNum*2))+maxNum; b = Math.floor(Math.random()*a)+1; ans = a-b; }
  else { const m = mathLevel===1?9:mathLevel===2?12:19; a = Math.floor(Math.random()*m)+2; b = Math.floor(Math.random()*m)+2; ans = a*b; }

  if(e('math-q')) e('math-q').textContent = `${a} ${op} ${b} = ?`;

  const opts = new Set([ans]);
  while(opts.size < 4){
    const r = ans + Math.floor(Math.random()*11) - 5;
    if(r > 0 && r !== ans) opts.add(r);
  }
  const optArr = [...opts].sort(() => Math.random() - .5);
  if(e('math-opts')){
    e('math-opts').innerHTML = optArr.map(o =>
      `<button class="mopt" onclick="chkMath(this,${o},${ans})">${o}</button>`
    ).join('');
  }
};

window.chkMath = function(btn, chosen, ans){
  document.querySelectorAll('.mopt').forEach(b => b.style.pointerEvents = 'none');
  if(chosen === ans){
    btn.classList.add('correct');
    mathR++;
    toast('✓ 答對了！');
    if(e('math-right')) e('math-right').textContent = mathR;
  } else {
    btn.classList.add('wrong');
    mathW++;
    document.querySelectorAll('.mopt').forEach(b => {
      if(parseInt(b.textContent) === ans) b.classList.add('correct');
    });
    toast('✗ 答錯了，繼續加油！');
    if(e('math-wrong')) e('math-wrong').textContent = mathW;
  }
  setTimeout(() => newMath(), 1400);
};

/* ─── 情緒打卡 ─── */
const MOODS = {5:'😄', 4:'🙂', 3:'😐', 2:'😔', 1:'😢'};
const MOOD_LABELS = {5:'很好', 4:'不錯', 3:'普通', 2:'不太好', 1:'很不好'};
let moodData = JSON.parse(localStorage.getItem('elder_mood') || '[]');

window.selMood = function(btn, score){
  document.querySelectorAll('.mood-btn').forEach(b => b.classList.remove('sel'));
  btn.classList.add('sel');

  const today = new Date().toLocaleDateString('zh-TW');
  const idx = moodData.findIndex(m => m.date === today);
  if(idx >= 0) moodData[idx].score = score;
  else moodData.unshift({date: today, score});

  if(moodData.length > 30) moodData = moodData.slice(0, 30);
  localStorage.setItem('elder_mood', JSON.stringify(moodData));

  if(e('mood-msg')) e('mood-msg').textContent = `已記錄：${MOODS[score]} ${MOOD_LABELS[score]}`;
  renderMoodHist();
};

window.renderMoodHist = function(){
  const hist = e('mood-hist');
  if(!hist) return;
  hist.innerHTML = moodData.slice(0, 7).map(m =>
    `<div class="mhrow"><span class="mhdate">${m.date}</span><span class="mhface">${MOODS[m.score]}</span><span style="font-size:13px;color:var(--muted)">${MOOD_LABELS[m.score]}</span></div>`
  ).join('') || '<div style="color:var(--hint);font-size:14px;text-align:center;padding:10px">還沒有記錄</div>';
};

window.swb = function(btn, tid){
  document.querySelectorAll('.btab').forEach(t => t.classList.remove('act'));
  btn.classList.add('act');
  ['mem-game','math-game','mood-track'].forEach(id => {
    const el = e(id);
    if(el) el.style.display = 'none';
  });
  const target = e(tid);
  if(target) target.style.display = 'block';

  if(tid === 'mem-game')   initMem();
  if(tid === 'math-game')  { setMathLevel(1); }
  if(tid === 'mood-track') renderMoodHist();
};
