/* 伴老友 V8.4｜加碼動腦：找不同、順序記憶、生活問答。完全離線。 */
(function () {
  'use strict';
  const $ = id => document.getElementById(id);
  const pick = arr => arr[Math.floor(Math.random() * arr.length)];
  const shuffle = arr => [...arr].sort(() => Math.random() - .5);
  let mode = 'spot', round = 0, correct = 0, sequence = [], stage = 0, locked = false;
  const quizzes = [
    ['買三顆蘋果，每顆 20 元，一共多少元？',['40 元','60 元','80 元'],1,'20 × 3 = 60 元'],
    ['今天星期二，後天是星期幾？',['星期三','星期四','星期五'],1,'星期二再過兩天是星期四'],
    ['出門前看到天空烏雲密布，適合帶什麼？',['雨傘','毛帽','拖鞋'],0,'帶雨傘比較方便'],
    ['下午 3 點再過 2 小時是幾點？',['下午 4 點','下午 5 點','下午 6 點'],1,'3 + 2 = 5'],
    ['搭公車付 50 元，車資 18 元，找回多少？',['22 元','32 元','42 元'],1,'50 − 18 = 32 元'],
    ['一週有幾天？',['5 天','7 天','10 天'],1,'一週有七天'],
    ['買兩瓶水各 15 元，付 50 元找回多少？',['10 元','20 元','30 元'],1,'50 − 30 = 20 元'],
    ['上午 9 點半，再過半小時是幾點？',['10 點','10 點半','11 點'],0,'9:30 + 30 分鐘 = 10:00']
  ];
  function showMessage(message) { const n = $('brain-extra-msg'); if (n) n.textContent = message; }
  function score() { const n = $('brain-extra-score'); if (n) n.textContent = `完成 ${round} 題，答對 ${correct} 題`; }
  function option(text, action) { const b = document.createElement('button'); b.type='button'; b.className='brain-extra-option'; b.textContent=text; b.addEventListener('click',action); return b; }
  function drawSpot() {
    const icons=['🍎','🍋','🌷','🐱','🐟','⭐','🍇','🦋'];
    const main=pick(icons), other=pick(icons.filter(x=>x!==main));
    const position=Math.floor(Math.random()*9);
    $('brain-extra-question').textContent='請找出九個圖案中不一樣的那一個';
    const area=$('brain-extra-options'); area.replaceChildren();
    for(let i=0;i<9;i++) area.appendChild(option(i===position?other:main,()=>{
      if(locked)return; locked=true;round++;
      if(i===position){correct++;showMessage('答對了！找到了不同的圖案。');} else showMessage('再試下一題，慢慢來就好。');
      score(); setTimeout(()=>{locked=false;drawSpot();},1000);
    }));
  }
  function drawSequence() {
    sequence=shuffle(['🍎','🌸','🐟','🌙','⭐','🍇']).slice(0,3);
    stage=0; locked=true;
    $('brain-extra-question').textContent='請記住這三個圖案的順序';
    const area=$('brain-extra-options'); area.replaceChildren();
    sequence.forEach(icon=>{const span=document.createElement('span');span.className='brain-extra-symbol';span.textContent=icon;area.appendChild(span);});
    showMessage('先看五秒鐘，等等照順序點選。');
    setTimeout(()=>{
      if(mode!=='sequence')return;
      locked=false; $('brain-extra-question').textContent='請依照剛才看到的順序，點選圖案';
      area.replaceChildren();
      shuffle(sequence).forEach(icon=>area.appendChild(option(icon,()=>{
        if(locked)return;
        if(icon===sequence[stage]){
          stage++; showMessage(`已答對 ${stage} / 3 個`);
          if(stage===3){locked=true;round++;correct++;score();showMessage('太棒了！順序全部正確。');setTimeout(()=>{if(mode==='sequence')drawSequence();},1200);}
        } else {locked=true;round++;score();showMessage('這次順序不太一樣，下一題再試試。');setTimeout(()=>{if(mode==='sequence')drawSequence();},1200);}
      })));
    },5000);
  }
  function drawQuiz() {
    const q=pick(quizzes); $('brain-extra-question').textContent=q[0];
    const area=$('brain-extra-options');area.replaceChildren();
    q[1].forEach((answer,index)=>area.appendChild(option(answer,()=>{
      if(locked)return;locked=true;round++;
      if(index===q[2])correct++;
      score();showMessage((index===q[2]?'答對了！':'一起看看答案：')+q[3]);
      setTimeout(()=>{if(mode==='quiz'){locked=false;drawQuiz();}},1700);
    })));
  }
  function start(which) {
    mode=which;round=0;correct=0;locked=false;score();
    document.querySelectorAll('[data-brain-mode]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.brainMode===mode)));
    if(mode==='spot')drawSpot(); else if(mode==='sequence')drawSequence(); else drawQuiz();
  }
  function init() {
    const parent=$('brain'); if(!parent || $('brain-extra'))return;
    const box=document.createElement('section');box.id='brain-extra';box.className='game-card';
    const title=document.createElement('h3');title.textContent='🎲 更多動腦小遊戲';box.appendChild(title);
    const desc=document.createElement('p');desc.textContent='不用計時、不用登入，選一種喜歡的遊戲。';box.appendChild(desc);
    const nav=document.createElement('div');nav.className='brain-extra-nav';
    [['spot','找不同'],['sequence','記順序'],['quiz','生活問答']].forEach(([id,name])=>{const b=option(name,()=>start(id));b.dataset.brainMode=id;nav.appendChild(b);});
    box.appendChild(nav);
    const q=document.createElement('h4');q.id='brain-extra-question';box.appendChild(q);
    const options=document.createElement('div');options.id='brain-extra-options';options.className='brain-extra-options';box.appendChild(options);
    const msg=document.createElement('p');msg.id='brain-extra-msg';msg.setAttribute('aria-live','polite');box.appendChild(msg);
    const s=document.createElement('p');s.id='brain-extra-score';box.appendChild(s);
    const restart=option('換一題／重新開始',()=>start(mode));box.appendChild(restart);
    const body=parent.querySelector('.sbdy')||parent;body.appendChild(box);
    start('spot');
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
})();
