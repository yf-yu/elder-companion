/* ============ brain.js：配對記憶、算術、情緒打卡 ============ */

/* ─── 配對記憶 ─── */
const EMOJIS = ['🍎','🐶','🌸','🐟','🌙','☀️','🎯','🦋'];
let memFlipped = [], memMatched = 0, memSteps = 0, memLock = false, memTimers = [], memRound = 0;

window.initMem = function(){
  memRound++; memTimers.forEach(clearTimeout); memTimers = [];
  const cards = [...EMOJIS, ...EMOJIS].sort(() => Math.random() - .5);
  memFlipped = []; memMatched = 0; memSteps = 0; memLock = false;

  if(e('mem-steps'))   e('mem-steps').textContent = '0';
  if(e('mem-matched')) e('mem-matched').textContent = '0';

  const g = e('mem-grid');
  if(!g) return;
  g.innerHTML = cards.map((em, i) =>
    `<button type="button" class="mem-card" data-em="${em}" data-i="${i}" aria-label="第 ${i+1} 張牌，尚未翻開" onclick="flipCard(this)">❓</button>`
  ).join('');
};

window.flipCard = function(card){
  if(memLock || card.classList.contains('flip') || card.classList.contains('matched')) return;
  card.classList.add('flip');
  card.textContent = card.dataset.em;
  card.setAttribute('aria-label', '圖案：' + card.dataset.em);
  memFlipped.push(card);

  if(memFlipped.length === 2){
    memLock = true;
    memSteps++;
    if(e('mem-steps')) e('mem-steps').textContent = memSteps;

    if(memFlipped[0].dataset.em === memFlipped[1].dataset.em){
      memFlipped.forEach(c => { c.classList.add('matched'); c.classList.remove('flip'); c.disabled = true; });
      memMatched++;
      if(e('mem-matched')) e('mem-matched').textContent = memMatched;
      memFlipped = []; memLock = false;
      if(memMatched === 8){
        memTimers.push(setTimeout(() => toast('🎉 恭喜！全部配對完成！步數：' + memSteps), 300));
      }
    } else {
      const round = memRound;
      memTimers.push(setTimeout(() => {
        if(round !== memRound) return;
        memFlipped.forEach(c => c.classList.add('wrong'));
        memTimers.push(setTimeout(() => {
          if(round !== memRound) return;
          memFlipped.forEach(c => {
            c.classList.remove('flip', 'wrong');
            c.textContent = '❓'; c.setAttribute('aria-label', '尚未翻開');
          });
          memFlipped = []; memLock = false;
        }, 600));
      }, 600));
    }
  }
};

/* ─── 算術練習 ─── */
let mathR = 0, mathW = 0, mathLevel = 1, mathTimer = null, mathLocked = false;

window.setMathLevel = function(level){
  clearTimeout(mathTimer); mathLocked = false;
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
  mathLocked = false;
  // 題目完全在本機產生，不需要網路
  const ops = ['+','-','×'];
  ops.push('÷');
  if (mathLevel === 3) ops.push('mix');
  
  const op = ops[Math.floor(Math.random() * ops.length)];
  let a, b, ans;
  const maxNum = mathLevel === 1 ? 20 : mathLevel === 2 ? 50 : 99;

  if(op === '+'){ a = Math.floor(Math.random()*maxNum)+1; b = Math.floor(Math.random()*maxNum)+1; ans = a+b; }
  else if(op === '-'){ a = Math.floor(Math.random()*(maxNum*2))+maxNum; b = Math.floor(Math.random()*a)+1; ans = a-b; }
  else if(op === '×'){ const m = mathLevel===1?9:mathLevel===2?12:19; a = Math.floor(Math.random()*m)+2; b = Math.floor(Math.random()*m)+2; ans = a*b; }
  else if(op === '÷'){ 
    ans = Math.floor(Math.random()*(mathLevel===1?5:10)) + 2; 
    b = Math.floor(Math.random()*(mathLevel===1?5:10)) + 2; 
    a = ans * b; 
  }
  else if(op === 'mix') {
    a = Math.floor(Math.random()*20)+1; b = Math.floor(Math.random()*10)+1; 
    const c = Math.floor(Math.random()*10)+1;
    ans = a + b * c;
    if(e('math-q')) e('math-q').textContent = `${a} + ${b} × ${c} = ?`;
    // 跳過下面的一般渲染
  }

  if(op !== 'mix' && e('math-q')) e('math-q').textContent = `${a} ${op} ${b} = ?`;

  const opts = new Set([ans]);
  let offset = 1;
  while(opts.size < 4) {
    if(ans - offset >= 0) opts.add(ans - offset);
    opts.add(ans + offset); offset++;
  }
  const optArr = [...opts].sort(() => Math.random() - .5);
  if(e('math-opts')){
    e('math-opts').innerHTML = optArr.map(o =>
      `<button class="mopt" onclick="chkMath(this,${o},${ans})">${o}</button>`
    ).join('');
  }
};

window.chkMath = function(btn, chosen, ans){
  if(mathLocked) return;
  mathLocked = true;
  document.querySelectorAll('.mopt').forEach(b => b.disabled = true);
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
  mathTimer = setTimeout(() => newMath(), 1400);
};

/* ─── 情緒打卡 ─── */
const MOODS = {5:'😄', 4:'🙂', 3:'😐', 2:'😔', 1:'😢'};
const MOOD_LABELS = {5:'很好', 4:'不錯', 3:'普通', 2:'不太好', 1:'很不好'};
let moodData = readJSON('elder_mood', []);
if(!Array.isArray(moodData)) moodData = [];

window.selMood = function(btn, score){
  document.querySelectorAll('.mood-btn').forEach(b => b.classList.remove('sel'));
  btn.classList.add('sel');

  const today = new Date().toLocaleDateString('zh-TW');
  const idx = moodData.findIndex(m => m.date === today);
  if(idx >= 0) moodData[idx].score = score;
  else moodData.unshift({date: today, score});

  if(moodData.length > 30) moodData = moodData.slice(0, 30);
  if(!saveJSON('elder_mood', moodData)) return;

  if(e('mood-msg')) e('mood-msg').textContent = `已記錄：${MOODS[score]} ${MOOD_LABELS[score]}`;
  renderMoodHist();
};

window.renderMoodHist = function(){
  const hist = e('mood-hist');
  if(!hist) return;
  hist.innerHTML = moodData.slice(0, 7).map(m =>
    `<div class="mhrow"><span class="mhdate">${escapeHTML(m.date)}</span><span class="mhface">${MOODS[m.score]}</span><span style="font-size:13px;color:var(--muted)">${MOOD_LABELS[m.score]}</span></div>`
  ).join('') || '<div style="color:var(--hint);font-size:14px;text-align:center;padding:10px">還沒有記錄</div>';
};

window.swb = function(btn, tid){
  document.querySelectorAll('.btab').forEach(t => t.classList.remove('act'));
  btn.classList.add('act');
  ['mem-game','math-game','spot-game','sequence-game','quiz-game','mood-track'].forEach(id => {
    const el = e(id);
    if(el) el.style.display = 'none';
  });
  const target = e(tid);
  if(target) target.style.display = 'block';

  if(tid === 'mem-game')   initMem();
  if(tid === 'math-game')  { setMathLevel(1); }
  if(tid === 'mood-track') renderMoodHist();
  if(tid === 'spot-game') startSpot();
  if(tid === 'sequence-game') startSequence(true);
  if(tid === 'quiz-game') startQuiz(true);
};


/* 動腦遊戲整合：同一選單切換，不另加第二套遊戲。 */
(function () {
  'use strict';
  const byId = id => document.getElementById(id);
  const symbols = ['🍎','🍋','🌷','🐱','🐟','⭐','🍇','🦋','🍊','🌙','🐸','🐻'];
  const random = n => Math.floor(Math.random()*n);
  const shuffled = arr => { const a=[...arr]; for(let i=a.length-1;i>0;i--){const k=random(i+1);[a[i],a[k]]=[a[k],a[i]];}return a; };
  const button = (label, cb, cls='') => {const b=document.createElement('button');b.type='button';b.textContent=label;b.className=cls;b.addEventListener('click',cb);return b;};
  const visible = id => {const n=byId(id);return n && n.style.display!=='none' && !byId('brain').hidden;};
  let spotLevel=1, spotCorrect=0, spotLock=false, spotTimer=null, spotToken=0;
  function drawSpot(){
    if(!byId('spot-grid'))return;
    const token=++spotToken;spotLock=false;
    const base=symbols[random(symbols.length)];
    // Higher levels prefer similar-looking pairs for a gradual challenge.
    const similar=[['🍎','🍊'],['🍋','🍊'],['🐱','🐻'],['🌷','🌸'],['⭐','🌙'],['🐟','🐬']];
    const pair=similar.find(x=>x.includes(base));
    const odd=spotLevel>=4&&pair?pair.find(x=>x!==base):shuffled(symbols.filter(x=>x!==base))[0];
    const pos=random(9), area=byId('spot-grid');area.replaceChildren();
    byId('spot-level').textContent=`第 ${spotLevel} 關`;
    byId('spot-score').textContent=`答對 ${spotCorrect} 題`;
    byId('spot-msg').textContent='請點選不一樣的圖案';
    for(let i=0;i<9;i++){
      const b=button(i===pos?odd:base,()=>{
        if(spotLock||!visible('spot-game'))return;
        if(i===pos){spotLock=true;spotCorrect++;spotLevel++;b.classList.add('correct');byId('spot-msg').textContent='答對了！準備下一關。';}
        else{b.classList.add('wrong');byId('spot-msg').textContent='再看看，找出唯一不同的圖案。';return;}
        byId('spot-score').textContent=`答對 ${spotCorrect} 題`;
        spotTimer=setTimeout(()=>{if(token===spotToken&&visible('spot-game'))drawSpot();},950);
      },'spot-cell');area.appendChild(b);
    }
  }
  window.startSpot=function(){clearTimeout(spotTimer);spotLevel=1;spotCorrect=0;drawSpot();};
  let seqLevel=1,seq=[],seqStep=0,seqToken=0,seqTimers=[],seqLocked=false;
  function clearSeq(){seqToken++;seqTimers.forEach(clearTimeout);seqTimers=[];}
  function scheduleSeq(fn,ms){seqTimers.push(setTimeout(fn,ms));}
  function drawSequence(){
    clearSeq();const token=seqToken,area=byId('seq-grid');if(!area)return;
    const count=Math.min(2+seqLevel-1,8);
    const pool=shuffled(symbols).slice(0,Math.max(4,count));
    seq=shuffled(pool).slice(0,count);
    seqStep=0;seqLocked=true;
    byId('seq-level').textContent=`第 ${seqLevel} 關`;
    byId('seq-count').textContent=`記住 ${count} 個`;
    byId('seq-msg').textContent=`先看 ${Math.max(3,Math.min(6,count+1))} 秒，記住順序`;
    area.replaceChildren();
    seq.forEach(x=>{const n=document.createElement('span');n.className='sequence-symbol';n.textContent=x;area.appendChild(n);});
    scheduleSeq(()=>{
      if(token!==seqToken||!visible('sequence-game'))return;
      seqLocked=false;area.replaceChildren();
      byId('seq-msg').textContent=`依照順序點選：第 1 / ${count} 個`;
      pool.forEach(x=>area.appendChild(button(x,()=>{
        if(seqLocked||!visible('sequence-game'))return;
        if(x===seq[seqStep]){
          seqStep++;
          if(seqStep===seq.length){seqLocked=true;byId('seq-msg').textContent='🎉 全部正確！下一關會更難。';seqLevel++;scheduleSeq(()=>{if(token===seqToken&&visible('sequence-game'))drawSequence();},1200);}
          else byId('seq-msg').textContent=`答對了！請點第 ${seqStep+1} / ${count} 個`;
        } else {
          seqLocked=true;byId('seq-msg').textContent='順序不太一樣，這一關再試一次。';
          scheduleSeq(()=>{if(token===seqToken&&visible('sequence-game'))drawSequence();},1400);
        }
      },'sequence-cell')));
    },Math.max(3,Math.min(6,count+1))*1000);
  }
  window.startSequence=function(reset){if(reset)seqLevel=1;drawSequence();};
  const quizzes=[
    ['買三顆蘋果，每顆 20 元，一共多少元？',['40 元','60 元','80 元'],1,'20 × 3 = 60 元'],
    ['今天星期二，後天是星期幾？',['星期三','星期四','星期五'],1,'星期四'],
    ['出門前看到天空烏雲密布，適合帶什麼？',['雨傘','毛帽','拖鞋'],0,'雨傘'],
    ['下午 3 點再過 2 小時是幾點？',['下午 4 點','下午 5 點','下午 6 點'],1,'下午 5 點'],
    ['搭公車付 50 元，車資 18 元，找回多少？',['22 元','32 元','42 元'],1,'32 元'],
    ['一週有幾天？',['5 天','7 天','10 天'],1,'7 天'],
    ['買兩瓶水各 15 元，付 50 元找回多少？',['10 元','20 元','30 元'],1,'20 元'],
    ['上午 9 點半，再過半小時是幾點？',['10 點','10 點半','11 點'],0,'10 點']
  ];
  let quizAnswered=0,quizCorrect=0,quizLock=false,quizToken=0,quizTimer=null,quizLast=-1;
  function drawQuiz(){const area=byId('quiz-options');if(!area)return;
    const token=++quizToken;quizLock=false;let idx=random(quizzes.length);
    if(idx===quizLast)idx=(idx+1)%quizzes.length;quizLast=idx;
    const q=quizzes[idx];byId('quiz-question').textContent=q[0];area.replaceChildren();
    byId('quiz-msg').textContent='請選擇答案';
    q[1].forEach((a,i)=>area.appendChild(button(a,()=>{
      if(quizLock||!visible('quiz-game'))return;quizLock=true;quizAnswered++;
      if(i===q[2]){quizCorrect++;byId('quiz-msg').textContent='答對了！'+q[3];}
      else byId('quiz-msg').textContent='一起看看答案：'+q[3];
      byId('quiz-progress').textContent=`已答 ${quizAnswered} 題`;
      byId('quiz-score').textContent=`答對 ${quizCorrect} 題`;
      quizTimer=setTimeout(()=>{if(token===quizToken&&visible('quiz-game'))drawQuiz();},1600);
    },'quiz-option')));
  }
  window.startQuiz=function(reset){clearTimeout(quizTimer);if(reset){quizAnswered=0;quizCorrect=0;byId('quiz-progress').textContent='已答 0 題';byId('quiz-score').textContent='答對 0 題';}drawQuiz();};
  // Stop pending callbacks when navigating away from the brain page.
  window.addEventListener('hashchange',()=>{if(!visible('sequence-game'))clearSeq();});
})();
