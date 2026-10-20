
/* ─── 配對記憶：可選 N×N、每局隨機圖案 ─── */

const EMOJIS = [
  '🍎','🍊','🍋','🍌','🍇','🍓','🍉','🍍',
  '🍑','🥝','🍒','🥕','🌽','🍅','🥦','🍄',
  '🐶','🐱','🐰','🐻','🐼','🐸','🐵','🐷',
  '🐔','🐥','🐟','🐬','🦋','🐢','🐝','🐞',
  '🌸','🌼','🌷','🌻','🌹','🌈','⭐','🌙',
  '☀️','☁️','🌳','🍀','🎈','🎁','⚽','🎵',
  '🚗','🚲','🚀','🏠','📚','✏️','💎','❤️'
];

let memSize = 2;
let memFlipped = [];
let memMatched = 0;
let memSteps = 0;
let memLock = false;
let memTimers = [];
let memRound = 0;
let memTotal = 2;

function shuffleMem(items) {
  const result = [...items];

  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }

  return result;
}

// 選擇難度
window.setMemSize = function (size, btn) {
  if (![2, 4, 6].includes(size)) return;

  memSize = size;

  document.querySelectorAll('.mem-level').forEach(item => {
    item.classList.remove('act');
    item.setAttribute('aria-pressed', 'false');
  });

  if (btn) {
    btn.classList.add('act');
    btn.setAttribute('aria-pressed', 'true');
  }

  initMem();
};

// 開始新的一局
window.initMem = function () {
  memRound++;

  memTimers.forEach(clearTimeout);
  memTimers = [];

  memFlipped = [];
  memMatched = 0;
  memSteps = 0;
  memLock = false;

  const grid = document.getElementById('mem-grid');
  if (!grid) return;

  const cardCount = memSize * memSize;
  memTotal = cardCount / 2;

  // 每次從 56 種 Emoji 隨機抽取需要的組數
  const selected = shuffleMem(EMOJIS).slice(0, memTotal);

  // 每個圖案各兩張，再重新打亂位置
  const cards = shuffleMem([...selected, ...selected]);

  grid.style.setProperty('--mem-columns', memSize);
  grid.replaceChildren();

  document.getElementById('mem-steps').textContent = '0';
  document.getElementById('mem-matched').textContent = '0';
  document.getElementById('mem-total').textContent = memTotal;

  cards.forEach((emoji, index) => {
    const card = document.createElement('button');

    card.type = 'button';
    card.className = 'mem-card';
    card.dataset.em = emoji;
    card.dataset.i = index;
    card.textContent = '❓';
    card.setAttribute(
      'aria-label',
      `第 ${index + 1} 張牌，尚未翻開`
    );

    card.addEventListener('click', () => flipCard(card));

    grid.appendChild(card);
  });
};

// 點選翻牌
window.flipCard = function (card) {
  if (
    memLock ||
    card.classList.contains('flip') ||
    card.classList.contains('matched')
  ) {
    return;
  }

  card.classList.add('flip');

  const emoji = document.createElement('span');
  emoji.className = 'mem-emoji';
  emoji.textContent = card.dataset.em;

  card.replaceChildren(emoji);
  card.setAttribute('aria-label', `圖案：${card.dataset.em}`);

  memFlipped.push(card);

  if (memFlipped.length < 2) return;

  memLock = true;
  memSteps++;

  document.getElementById('mem-steps').textContent = memSteps;

  const [first, second] = memFlipped;

  if (first.dataset.em === second.dataset.em) {
    first.classList.add('matched');
    second.classList.add('matched');

    first.classList.remove('flip');
    second.classList.remove('flip');

    first.disabled = true;
    second.disabled = true;

    memMatched++;

    document.getElementById('mem-matched').textContent =
      memMatched;

    memFlipped = [];
    memLock = false;

    if (memMatched === memTotal) {
      const round = memRound;

      memTimers.push(setTimeout(() => {
        if (round !== memRound) return;

        if (typeof toast === 'function') {
          toast(`🎉 全部配對完成！共用了 ${memSteps} 步！`);
        }
      }, 350));
    }

    return;
  }

  // 不相同：短暫顯示，再蓋回卡片
  const round = memRound;

  memTimers.push(setTimeout(() => {
    if (round !== memRound) return;

    first.classList.add('wrong');
    second.classList.add('wrong');

    memTimers.push(setTimeout(() => {
      if (round !== memRound) return;

      [first, second].forEach(item => {
        item.classList.remove('flip', 'wrong');
        item.textContent = '❓';
        item.setAttribute('aria-label', '尚未翻開');
      });

      memFlipped = [];
      memLock = false;
    }, 700));
  }, 800));
};



/* =========================
   2. 算術練習
========================= */

let mathR = 0;
let mathW = 0;
let mathLevel = 1;
let mathTimer = null;
let mathLocked = false;

window.setMathLevel = function (level) {
  clearTimeout(mathTimer);
  mathLocked = false;
  mathLevel = level;

  [1, 2, 3].forEach(number => {
    const btn = e('ml-' + number);
    if (!btn) return;

    btn.classList.toggle('act', number === level);
  });

  mathR = 0;
  mathW = 0;

  if (e('math-right')) {
    e('math-right').textContent = '0';
  }

  if (e('math-wrong')) {
    e('math-wrong').textContent = '0';
  }

  newMath();
};

window.newMath = function () {
  mathLocked = false;

  const ops = ['+', '-', '×', '÷'];

  if (mathLevel === 3) {
    ops.push('mix');
  }

  const op = ops[Math.floor(Math.random() * ops.length)];

  let a;
  let b;
  let ans;

  const maxNum =
    mathLevel === 1 ? 20 :
    mathLevel === 2 ? 50 : 99;

  if (op === '+') {
    a = Math.floor(Math.random() * maxNum) + 1;
    b = Math.floor(Math.random() * maxNum) + 1;
    ans = a + b;
  }

  else if (op === '-') {
    a = Math.floor(Math.random() * (maxNum * 2)) + maxNum;
    b = Math.floor(Math.random() * a) + 1;
    ans = a - b;
  }

  else if (op === '×') {
    const max =
      mathLevel === 1 ? 9 :
      mathLevel === 2 ? 12 : 19;

    a = Math.floor(Math.random() * max) + 2;
    b = Math.floor(Math.random() * max) + 2;
    ans = a * b;
  }

  else if (op === '÷') {
    ans = Math.floor(
      Math.random() * (mathLevel === 1 ? 5 : 10)
    ) + 2;

    b = Math.floor(
      Math.random() * (mathLevel === 1 ? 5 : 10)
    ) + 2;

    a = ans * b;
  }

  else if (op === 'mix') {
    a = Math.floor(Math.random() * 20) + 1;
    b = Math.floor(Math.random() * 10) + 1;

    const c = Math.floor(Math.random() * 10) + 1;

    ans = a + b * c;

    if (e('math-q')) {
      e('math-q').textContent =
        `${a} + ${b} × ${c} = ?`;
    }
  }

  if (op !== 'mix' && e('math-q')) {
    e('math-q').textContent = `${a} ${op} ${b} = ?`;
  }

  const options = new Set([ans]);
  let offset = 1;

  while (options.size < 4) {
    if (ans - offset >= 0) {
      options.add(ans - offset);
    }

    options.add(ans + offset);
    offset++;
  }

  const shuffledOptions = [...options]
    .sort(() => Math.random() - 0.5);

  if (e('math-opts')) {
    e('math-opts').innerHTML = shuffledOptions.map(value => `
      <button
        class="mopt"
        onclick="chkMath(this, ${value}, ${ans})"
      >${value}</button>
    `).join('');
  }
};

window.chkMath = function (btn, chosen, answer) {
  if (mathLocked) return;

  mathLocked = true;

  document.querySelectorAll('.mopt').forEach(item => {
    item.disabled = true;
  });

  if (chosen === answer) {
    btn.classList.add('correct');
    mathR++;

    toast('✓ 答對了！');

    if (e('math-right')) {
      e('math-right').textContent = mathR;
    }
  }

  else {
    btn.classList.add('wrong');
    mathW++;

    document.querySelectorAll('.mopt').forEach(item => {
      if (parseInt(item.textContent, 10) === answer) {
        item.classList.add('correct');
      }
    });

    toast('再試試看，繼續加油！');

    if (e('math-wrong')) {
      e('math-wrong').textContent = mathW;
    }
  }

  mathTimer = setTimeout(() => newMath(), 1400);
};


/* =========================
   3. 情緒打卡
========================= */

const MOODS = {
  5: '😄',
  4: '🙂',
  3: '😐',
  2: '😔',
  1: '😢'
};

const MOOD_LABELS = {
  5: '很好',
  4: '不錯',
  3: '普通',
  2: '不太好',
  1: '很不好'
};

let moodData = readJSON('elder_mood', []);

if (!Array.isArray(moodData)) {
  moodData = [];
}

window.selMood = function (btn, score) {
  document.querySelectorAll('.mood-btn').forEach(item => {
    item.classList.remove('sel');
  });

  btn.classList.add('sel');

  const today = new Date().toLocaleDateString('zh-TW');

  const index = moodData.findIndex(item => {
    return item.date === today;
  });

  if (index >= 0) {
    moodData[index].score = score;
  } else {
    moodData.unshift({
      date: today,
      score: score
    });
  }

  if (moodData.length > 30) {
    moodData = moodData.slice(0, 30);
  }

  if (!saveJSON('elder_mood', moodData)) return;

  if (e('mood-msg')) {
    e('mood-msg').textContent =
      `已記錄：${MOODS[score]} ${MOOD_LABELS[score]}`;
  }

  renderMoodHist();
};

window.renderMoodHist = function () {
  const history = e('mood-hist');
  if (!history) return;

  history.innerHTML = moodData.slice(0, 7).map(item => `
    <div class="mhrow">
      <span class="mhdate">${escapeHTML(item.date)}</span>
      <span class="mhface">${MOODS[item.score]}</span>
      <span style="font-size:13px;color:var(--muted)">
        ${MOOD_LABELS[item.score]}
      </span>
    </div>
  `).join('') || `
    <div style="color:var(--hint);font-size:14px;text-align:center;padding:10px">
      還沒有記錄
    </div>
  `;
};


/* =========================
   4. 動腦遊戲切換
========================= */

window.swb = function (btn, targetId) {
  document.querySelectorAll('.btab').forEach(item => {
    item.classList.remove('act');
  });

  btn.classList.add('act');

  const games = [
    'mem-game',
    'math-game',
    'spot-game',
    'sequence-game',
    'quiz-game',
    'mood-track'
  ];

  games.forEach(id => {
    const section = e(id);

    if (section) {
      section.style.display = 'none';
    }
  });

  const target = e(targetId);

  if (target) {
    target.style.display = 'block';
  }

  if (targetId === 'mem-game') {
    initMem();
  }

  if (targetId === 'math-game') {
    setMathLevel(1);
  }

  if (targetId === 'mood-track') {
    renderMoodHist();
  }

  if (targetId === 'spot-game') {
    startSpot();
  }

  if (targetId === 'sequence-game') {
    startSequence(true);
  }

  if (targetId === 'quiz-game') {
    startQuiz(true);
  }
};


/* =========================
   5. 找不同、記憶順序、生活問答
========================= */

(function () {
  'use strict';

  const byId = id => document.getElementById(id);

  const symbols = [
    '🍎', '🍋', '🌷', '🐱','🌸','🍅','🌼',
    '🐟', '⭐', '🍇', '🦋','🐥','🐹','🐬',
    '🍊', '🌙', '🐸', '🐻','🐶','☀️','🐔','🍌'
  ];

  const random = max => Math.floor(Math.random() * max);

  function shuffled(items) {
    const result = [...items];

    for (let i = result.length - 1; i > 0; i--) {
      const j = random(i + 1);

      [result[i], result[j]] = [result[j], result[i]];
    }

    return result;
  }

  function button(label, callback, className = '') {
    const element = document.createElement('button');

    element.type = 'button';
    element.textContent = label;
    element.className = className;
    element.addEventListener('click', callback);

    return element;
  }

  function visible(id) {
    const game = byId(id);
    const brainPage = byId('brain');

    return Boolean(
      game &&
      game.style.display !== 'none' &&
      brainPage &&
      !brainPage.hidden
    );
  }


  /* =========================
     5-1. 找不同：固定 3 × 3
  ========================= */

  let spotLevel = 1;
  let spotCorrect = 0;
  let spotLock = false;
  let spotTimer = null;
  let spotToken = 0;

  const similarPairs = [
    ['🍎', '🍅'],
    ['🍋', '🍊'],
    ['🐹', '🐻'],
    ['🌷', '🌼'],
    ['🍌', '🌙'],
    ['🐔', '🐥'],
    ['🐶', '🐸'],
    ['🐟', '🐬']
  ];

  function drawSpot() {
    const area = byId('spot-grid');
    if (!area) return;

    const token = ++spotToken;

    spotLock = false;

    const base = symbols[random(symbols.length)];

    const similarPair = similarPairs.find(pair => {
      return pair.includes(base);
    });

    const odd =
      spotLevel >= 4 && similarPair
        ? similarPair.find(item => item !== base)
        : shuffled(symbols.filter(item => item !== base))[0];

    const correctPosition = random(9);

    area.replaceChildren();

    byId('spot-level').textContent =
      `第 ${spotLevel} 關`;

    byId('spot-score').textContent =
      `答對 ${spotCorrect} 題`;

    byId('spot-msg').textContent =
      '請找出唯一不同的圖案';

    for (let i = 0; i < 9; i++) {
      const cell = button(
        i === correctPosition ? odd : base,
        () => {
          if (spotLock || !visible('spot-game')) return;

          if (i === correctPosition) {
            spotLock = true;
            spotCorrect++;
            spotLevel++;

            cell.classList.add('correct');

            byId('spot-msg').textContent =
              '🎉 找到了！準備下一關。';

            byId('spot-score').textContent =
              `答對 ${spotCorrect} 題`;

            spotTimer = setTimeout(() => {
              if (
                token === spotToken &&
                visible('spot-game')
              ) {
                drawSpot();
              }
            }, 950);
          }

          else {
            cell.classList.add('wrong');

            byId('spot-msg').textContent =
              '再仔細看看，還有一個不一樣的圖案。';
          }
        },
        'spot-cell'
      );

      area.appendChild(cell);
    }
  }

  window.startSpot = function () {
    clearTimeout(spotTimer);

    spotLevel = 1;
    spotCorrect = 0;

    drawSpot();
  };


  /* =========================
     5-2. 記憶順序
     每個難度連續答對三題才升級
  ========================= */

  let seqLevel = 1;
  let seqStreak = 0;
  let seq = [];
  let seqStep = 0;
  let seqToken = 0;
  let seqTimers = [];
  let seqLocked = false;

  const seqTarget = 3;
  const seqMaxCount = 8;

  function clearSeq() {
    seqToken++;

    seqTimers.forEach(clearTimeout);
    seqTimers = [];
  }

  function scheduleSeq(callback, milliseconds) {
    seqTimers.push(
      setTimeout(callback, milliseconds)
    );
  }

  function drawSequence() {
    clearSeq();

    const token = seqToken;
    const area = byId('seq-grid');

    if (!area) return;

    // 難度 1 記 2 個，難度 2 記 3 個
    const count = Math.min(
      seqLevel + 1,
      seqMaxCount
    );

    // 額外加入干擾選項
    const pool = shuffled(symbols).slice(
      0,
      Math.max(4, count)
    );

    seq = shuffled(pool).slice(0, count);

    seqStep = 0;
    seqLocked = true;

    const seconds = Math.max(
      3,
      Math.min(6, count + 1)
    );

    byId('seq-level').textContent =
      `難度 ${seqLevel}｜連對 ${seqStreak}/${seqTarget} 題`;

    byId('seq-count').textContent =
      `記住 ${count} 個`;

    byId('seq-msg').textContent =
      `先看 ${seconds} 秒，記住圖案的順序`;

    area.replaceChildren();

    // 第一階段：顯示要記住的圖案
    seq.forEach(symbol => {
      const item = document.createElement('span');

      item.className = 'sequence-symbol';
      item.textContent = symbol;

      area.appendChild(item);
    });

    scheduleSeq(() => {
      if (
        token !== seqToken ||
        !visible('sequence-game')
      ) {
        return;
      }

      seqLocked = false;
      area.replaceChildren();

      byId('seq-msg').textContent =
        `請依序點選：第 1 / ${count} 個`;

      // 第二階段：讓使用者依順序選擇
      pool.forEach(symbol => {
        const cell = button(
          symbol,
          () => {
            if (
              seqLocked ||
              !visible('sequence-game')
            ) {
              return;
            }

            if (symbol === seq[seqStep]) {
              seqStep++;

              if (seqStep === seq.length) {
                seqLocked = true;
                seqStreak++;

                // 連對三題才升級
                if (seqStreak >= seqTarget) {
                  seqLevel = Math.min(
                    seqLevel + 1,
                    seqMaxCount - 1
                  );

                  seqStreak = 0;

                  byId('seq-msg').textContent =
                    '🎉 連續答對三題！下一題挑戰更高難度！';
                }

                else {
                  byId('seq-msg').textContent =
                    `答對了！已連續答對 ${seqStreak}/${seqTarget} 題`;
                }

                byId('seq-level').textContent =
                  `難度 ${seqLevel}｜連對 ${seqStreak}/${seqTarget} 題`;

                scheduleSeq(() => {
                  if (
                    token === seqToken &&
                    visible('sequence-game')
                  ) {
                    drawSequence();
                  }
                }, 1600);
              }

              else {
                byId('seq-msg').textContent =
                  `答對了！請點第 ${seqStep + 1} / ${count} 個`;
              }
            }

            else {
              // 答錯：連對歸零，難度不降低
              seqLocked = true;
              seqStreak = 0;

              byId('seq-level').textContent =
                `難度 ${seqLevel}｜連對 0/${seqTarget} 題`;

              byId('seq-msg').textContent =
                '順序不太一樣，再試一次！目前難度不變。';

              scheduleSeq(() => {
                if (
                  token === seqToken &&
                  visible('sequence-game')
                ) {
                  drawSequence();
                }
              }, 1400);
            }
          },
          'sequence-cell'
        );

        area.appendChild(cell);
      });

    }, seconds * 1000);
  }

  window.startSequence = function (reset) {
    if (reset) {
      seqLevel = 1;
      seqStreak = 0;
    }

    drawSequence();
  };


  /* =========================
     5-3. 生活常識問答
     20 題，簡單、實用、邊玩邊學
  ========================= */

  const quizzes =[
  [
    '有人突然昏倒、叫不醒，應該打哪個電話？',
    ['119', '110', '1999'],
    0,
    '如果身體不舒服請緊急救護請撥 119，並依接線人員指示處理。'
  ],
  [
    '看到火災，應該打哪個電話？',
    ['119', '165', '1966'],
    0,
    '火警請撥 119，先到安全地方再求助。'
  ],
  [
    '需要警察緊急協助，應該打哪個電話？',
    ['110', '119', '1999'],
    0,
    '在台灣，報警請撥 110。'
  ],
  [
    '陌生人說中獎了，要先匯錢才能領獎，應該？',
    ['馬上匯錢', '先掛電話查證', '告訴對方密碼'],
    1,
    '遇到可疑電話不要急著匯款，可撥 165 查證。'
  ],
  [
    '陌生簡訊要你點連結輸入密碼，應該？',
    ['直接點開', '轉傳給朋友', '不要點並查證'],
    2,
    '不要隨便點陌生連結，也不要提供密碼。'
  ],
  [
    '過馬路時，哪個做法比較安全？',
    ['走斑馬線並注意來車', '邊走邊看手機', '直接穿越車陣'],
    0,
    '過馬路要看號誌，也要注意左右來車. '
  ],
  [
    '下雨天出門，最好帶什麼？',
    ['雨傘或雨衣', '電風扇', '厚棉被'],
    0,
    '帶好雨具，也要小心地面濕滑。'
  ],
  [
    '浴室地板很滑，應該？',
    ['快跑過去', '先擦乾並注意防滑', '閉眼走路'],
    1,
    '保持地面乾燥，能減少滑倒的風險。'
  ],
  [
    '要拿很高的東西，怎麼做比較安全？',
    ['踩不穩的椅子', '請人幫忙', '踩紙箱'],
    1,
    '不要爬上不穩的物品，必要時請家人協助。'
  ],
  [
    '食物聞起來有怪味，應該？',
    ['繼續吃', '加熱就一定安全', '不要吃'],
    2,
    '疑似腐敗的食物不要食用。'
  ],
  [
    '吃飯前，最好先做什麼？',
    ['洗手', '擦鞋', '開電視'],
    0,
    '用肥皂洗手有助減少病菌傳播。'
  ],
  [
    '忘記藥要吃幾顆，應該？',
    ['自己多吃一顆', '查看藥袋或問藥師', '隨便猜'],
    1,
    '吃藥要依照指示，不清楚時先問藥師。'
  ],
  [
    '身體突然很不舒服，應該？',
    ['怕造成麻煩忍著不說', '找人協助，沒有人時撥打119', '自己拿成藥吃'],
    1,
    '身體不適要及時求助，緊急情況可撥 119，千萬不要自己當醫生拿藥吃'
  ],
  [
    '夏天天氣很熱，出門應該注意？',
    ['適時喝水、做好防曬', '不會渴就不需要喝水', '曬太陽對骨頭好不需要防曬'],
    0,
    '天熱要注意補充水分與休息。'
  ],
  [
    '看電視或看書一段時間後，眼睛容易疲勞，以下哪種方法最能消除眼睛疲勞?',
    ['不用管他', '眨眨眼，並望向遠方的綠色植物', '用力揉眼睛'],
    1,
    '揉眼睛容易讓細菌感染或受傷。最好的放鬆方式是每用眼 30 分鐘，就望向遠方，讓緊繃的眼部肌肉放鬆。'
  ],
  [
    '垃圾分類時，吃剩的飯菜、果皮、茶葉渣，應該歸類在哪一類?',
    ['一般垃圾', '資源回收', '廚餘'],
    2,
    '剩菜飯、果皮等有機廢棄物屬於廚餘，回收後可以作為養豬飼料或堆肥利用，不可混入一般垃圾。'
  ],
  [
    '走路時突然頭暈，應該？',
    ['停下來找安全地方坐下並求助', '繼續走', '自己開車離開'],
    0,
    '先避免跌倒並尋求協助，症狀嚴重時應緊急就醫。'
  ],
  [
    '剛從床上下床時，怎麼做才能避免突然頭暈跌倒?',
    ['馬上下床', '先在床邊坐個1到2分鐘，再慢慢站起來', '繼續躺著不起來'],
    1,
    '剛醒來時血壓變化較大，起太快容易姿勢性低血壓導致頭暈。記住慢動作，先坐一下、動動腳，再站起來最安全！'
  ],
  [
    '多吃哪種食物可以幫助排便、避免便秘?',
    ['白米飯', '綠色蔬菜和水果', '炸雞和薯條'],
    1,
    '蔬菜和水果含有豐富的膳食纖維，就像腸道裡的小掃把，可以促進腸胃蠕動，讓排便更順暢喔！'
  ],
  [
    '吃飽飯後不要馬上做什麼事，以免消化不良或頭暈？',
    ['洗澡', '坐著聊天', '聽音樂'],
    0,
    '吃飽後血液會集中在胃部幫助消化。此時如果馬上洗澡，熱水會讓全身皮膚血管擴張，導致胃部血液減少，容易引起消化不良或大腦供血不足而頭暈。'
  ],
  [
    '不小心燙傷時，塗牙膏、抹醬油，其實是錯誤的！正確的急救第一步是什麼？',
    ['用流動的冷水沖洗傷口', '立刻用力扯掉衣服', '馬上擦燙傷藥膏'],
    0,
    '第一步最重要的是用流動的冷水持續沖洗 15 到 30 分鐘來降溫，塗抹牙膏或醬油反而會造成傷口感染。'
  ],
  [
    '如果接到電話說要教你操作 ATM 才能「退款」或「解除扣款」，應該？',
    ['照著指示操作', '絕對是詐騙，立刻掛斷', '把卡片密碼告訴他'],
    1,
    '自動櫃員機（ATM）只有轉帳和提款功能，絕對沒有退款或解除設定的功能，接到這類電話必為詐騙。'
  ],
  [
    '運動或散步後，如果覺得肌肉有點酸痛，最適合的溫和舒緩方式是？',
    ['用力搥打酸痛部位', '做簡單的伸展拉筋與熱敷', '立刻去跑步'],
    1,
    '運動後的酸痛可以透過溫和的伸展拉筋來放鬆肌肉，或是適度熱敷促進血液循環，千萬不要用力猛烈揉搥。'
  ],
  [
    '如果家裡有過期的廢棄藥水、藥膏，正確的處理方式是什麼？',
    ['直接倒進馬桶沖走', '倒進水槽流掉', '倒入夾鏈袋與吸水紙混合後丟一般垃圾'],
    2,
    '藥水如果直接倒馬桶或水槽會污染環境與水源。正確做法是將藥水倒在廢紙或茶葉渣上吸乾，包好後丟入一般垃圾。'
  ],
  [
    '高血壓患者每天量血壓，最重要的「722」原則是指什麼？',
    ['每週量7天、每天量2次、每次量2遍', '每天量7次、量2天、每次間隔2分鐘', '每個月量7天、每天量2次'],
    0,
    '722原則是：連續量「7」天、每天早晚共「2」次（起床後、睡前）、每次量「2」遍（間隔1分鐘取平均值）。'
  ],
  [
    '散步時如果發現後方有狗靠近，怎麼樣做比較安全？',
    ['大聲尖叫並立刻轉身逃跑', '保持冷靜、放慢步伐或停下，不與狗直視', '拿石頭用力砸牠'],
    1,
    '尖叫和逃跑會激起狗追逐的本能。保持冷靜、不直視狗的眼睛，用餘光注意並慢慢離開才是最安全的做法。'
  ],
  [
    '看報紙或手機時，若發現字體太小、眼睛很吃力，應該？',
    ['用力瞇著眼睛看', '放大字體，或配戴合適度數的老花眼鏡', '離螢幕越近越好'],
    1,
    '瞇眼或靠太近都會加重眼睛負擔。調整合適的字體大小或配戴經專業驗光的眼鏡，才能保護視力。'
  ],
  [
    '除夕夜圍爐吃年糕、麻糬等黏性高的食物時，應該注意什麼？',
    ['大口吞嚥才過癮', '切成小塊，並且細嚼慢嚥', '一邊大笑一邊吃'],
    1,
    '糯米類食物黏性大、不易嚼碎，長輩應切成小塊並專心細嚼慢嚥，避免發生食物噎住氣管的危險。'
  ],
  [
    '修剪腳指甲時，為了預防指甲長進肉裡（凍甲），應該剪成什麼形狀？',
    ['剪得非常深、兩側挖成弧形', '平平地剪，呈現稍微方形', '剪得越短越好'],
    1,
    '腳指甲兩側如果挖得太深，新長出來的指甲容易刺入皮膚。正確剪法是前端平剪，兩側留下一點點白邊。'
  ],
  [
    '洗澡時，熱水器的瓦斯突然漏氣，或是感到頭暈、想吐，應該第一時間？',
    ['趕快上床睡覺休息', '關閉瓦斯並打開窗戶通風，到室外求助', '點打火機檢查哪裡漏氣'],
    1,
    '這可能是熱水器通風不良引起的一氧化碳中毒。應立刻關閉瓦斯、開窗通風並移到安全戶外，切勿點火或開啟電器。'
  ],
  [
    '打噴嚏或咳嗽時，如果手邊沒有手帕或衛生紙，應該怎麼遮掩？',
    ['用雙手手掌緊緊捂住', '用衣袖或手臂內側遮住口鼻', '不用遮，直接對著空氣打'],
    1,
    '用手掌遮掩會讓病菌沾滿雙手，再去摸東西容易傳播病毒。用衣袖或手臂內側遮擋，可以減少雙手接觸病菌的機會。'
  ],
  [
    '如果發現視力出現「看東西變形、直線變彎曲、中間有一塊黑影」，應該？',
    ['以為只是眼睛太累，多睡覺就好', '馬上到眼科檢查黃斑部', '自己去買眼藥水來點'],
    1,
    '直線變彎曲或視野中心有黑影，是黃斑部病變的典型症狀，嚴重可能失明，必須立刻找專業眼科醫生診斷。'
  ],
  [
    '家裡的瓦斯爐好幾天沒用，今天開火時發現火焰呈現「紅色或黃色」，代表？',
    ['代表火很旺，非常好', '燃燒不完全，應注意通風並請人檢修', '瓦斯快用完了'],
    1,
    '正常且燃燒完全的瓦斯火應該是藍色的。出現紅色或黃色火焰代表燃燒不完全，容易產生一氧化碳，要特別注意。'
  ],
  [
    '洗完衣服要把濕衣服掛起來曬，怎麼做比較安全、不傷腰？',
    ['直接彎腰用力把整籃濕衣服抱起來', '蹲下或把衣服籃放在高一點的椅子上拿取', '單手用力猛拉'],
    1,
    '直接彎腰搬重物對脊椎傷害很大。應該雙腿微蹲、保持腰部挺直，或把籃子墊高，減少彎腰的幅度。'
  ],
  [
    '使用延長線時，哪一種習慣是錯誤且容易引發火災的？',
    ['把很多高耗電電器（如電鍋、電暖器）同時插在同一條延長線上', '定期清理插頭上的灰塵', '購買有過載保護開關的延長線'],
    0,
    '將多個大耗電量的電器插在同一個延長線上，會導致電流過載、電線發熱，非常容易引發電氣火災。'
  ],
  [
    '買回來的罐頭，如果發現外觀有「膨脹（膨包）或凹陷嚴重」，應該？',
    ['加熱後繼續吃', '絕對不要吃，直接丟棄', '打開聞聞看沒臭味就可以吃'],
    1,
    '罐頭膨包代表裡面可能已經滋生細菌（如致命的肉毒桿菌）並產生氣體，凹陷則可能讓內襯破損變質，千萬不能食用。'
  ],
  [
    '老人家為了預防肌少症、走路更有力，日常飲食除了吃飽，還要多補充哪種營養？',
    ['優質蛋白質（如豆腐、魚、瘦肉、蛋）', '純澱粉（如白糖、太白粉）', '高鹽高油的零食'],
    0,
    '蛋白質是肌肉合成的重要原料。長輩每餐都要吃足夠的優質蛋白質，搭配適度運動，才能留住肌肉、預防跌倒。'
  ],
  [
    '開車或騎車出門時，如果遇到救護車、消防車在後面鳴笛，應該怎麼做？',
    ['跟在救護車後面加速超車', '向兩側避讓，空出中間通道讓救災車輛優先通行', '在路中間停下來不動'],
    1,
    '聽到消防車或救護車鳴笛，所有車輛應主動減速並向道路兩側避讓，禮讓救災與救護車輛優先通過。'
  ],
  [
    '蚊蟲叮咬或抓癢抓到皮膚破皮流血時，應該怎麼處理才正確？',
    ['繼續用力抓，抓到痛就不癢了', '用清水或生理食鹽水清潔，並塗抹藥膏保護傷口', '塗抹口水來消毒'],
    1,
    '抓破皮容易引發細菌感染（如蜂窩性數字炎）。塗口水並不具備消毒效果，應保持傷口清潔，必要時就醫擦藥。'
  ],
  [
    '每天晚上睡覺前，哪一個好習慣最能幫助睡眠、讓隔天精神更好？',
    ['躺在床上看手機看一小時', '喝一杯熱咖啡提神', '用溫熱的水泡腳，讓身體放鬆'],
    2,
    '睡前看手機的藍光會干擾睡眠荷爾蒙；咖啡因會讓人亢奮。用溫熱水泡腳可以促進血液循環、放鬆神經，最助眠。'
  ],
  [
    '沒吃完的飯菜放進冰箱就不會壞嗎？以下哪個觀念才是正確的？',
    ['放冰箱只是低溫延緩細菌生長，放久了依然會腐敗發霉', '只要冰進冰箱，放一個月也可以吃', '冰箱有殺菌功能，食物永遠不會壞'],
    0,
    '冰箱的低溫只能「減緩」細菌繁殖，並沒有殺菌功能！剩菜剩飯在冰箱放太久一樣會發霉變質，建議2天內吃完最安全。'
  ],
  [
    '剛煮好熱騰騰的飯菜如果吃不完，應該怎麼冰最正確？',
    ['放室溫等到完全冰涼，隔天再放進冰箱', '稍微降溫到不燙手（約60度）就趕快蓋好冰起來', '直接在室溫下放著過夜'],
    1,
    '室溫（攝氏20到50度）是細菌繁殖的黃金溫熱帶。熱騰騰的食物稍微降溫、不燙手時就該冰進冰箱，避免放在室溫太久孳生細菌。'
  ],
  [
    '在廚房想拿高處的東西、搬重物，或者身體突然不舒服時，應該怎麼做？',
    ['自己咬牙硬撐，不麻煩別人', '主動開口請家人、鄰居或志工幫忙', '假裝沒看見，什麼都不做'],
    1,
    '長輩千萬不要勉強做危險動作。主動開口求助不是添麻煩，而是保護自己不跌倒、不受伤最聰明、最安全的方法。'
  ],
  [
    '到醫院看病或去政府機關辦事情，如果聽不懂人員的說明，該怎麼辦？',
    ['不好意思再問，點頭假裝懂了回家再說', '勇敢開口說「請再講慢一點，我聽不懂」', '當場發脾氣罵人'],
    1,
    '聽不懂時一定要主動開口請對方再解釋一次。醫護人員或辦事員都很樂意為您放慢速度說得更清楚，千萬別憋在心裡。'
  ],
  [
    '最近總覺得心裡悶悶的、對以前喜歡的興趣突然提不起勁，怎麼做比較好？',
    ['把自己關在房間不跟人說話', '主動跟家人、朋友聊天，或者去醫院找醫生談談', '多吃止痛藥或感冒藥就會好'],
    1,
    '心裡悶悶、提不起勁就像心靈感冒了，千萬不要一個人憋著。主動找信任的人說說話，或是找醫生聊聊，心情會輕鬆很多喔！'
  ],
  [
    '想讓每天的心情更開朗、身體更有活力，以下哪一種日常活動最有幫助？',
    ['整天關在家裡吹冷氣看電視', '每天出門散步、曬曬太陽，和鄰居朋友見面笑笑聊天', '一直坐在椅子上回想過去不開心的事情'],
    1,
    '曬太陽能讓大腦分泌讓人快樂的元素，而維持社交互動、和朋友說說笑笑，更是讓心情保持開朗、有活力的最佳良藥！'
  ],
  [
    '如果發現身邊的朋友或鄰居長輩最近相較以往變得很沉默、不愛出門，我們可以怎麼關心他？',
    ['隨便他去，覺得不要打擾他比較好', '主動打個電話或路過時開口問候一句「最近好嗎？出來走走呀」', '到處去跟別人說他的八卦'],
    1,
    '一聲簡單的問候和邀請，對心情低落、不想動的人來說是很大的溫暖。主動開口關心身邊的人，能幫彼此找回好心情。'
  ],
  [
    '放在冰箱角落、忘記放了多久的食物，如果外觀看起來沒變，應該怎麼處理？',
    ['沒變色就代表沒壞，繼續吃掉', '安全起見，直接丟棄不要吃', '只要加熱煮滾很久就可以吃'],
    1,
    '有些細菌或毒素（如米酵菌酸或黃麴毒素）是肉眼看不見、而且高溫煮不死的。不確定放了多久的過期食物，最安全的做法就是直接丟掉。'
  ],
  [
    '在家裡不小心滑倒坐在地上，雖然好像還能動，但正確的做法應該是？',
    ['怕丟臉立刻用力撐著站起來', '先在地上休息一下，開口呼叫家人或打電話求助，確認沒大礙再慢慢扶著站起', '一直躺在地上哭'],
    1,
    '跌倒後立刻猛然站起容易造成二次傷害。應保持冷靜，先開口呼救，在有人協助或確認骨頭沒受傷的情況下再移動。'
  ]
]


  let quizAnswered = 0;
  let quizCorrect = 0;
  let quizLock = false;
  let quizToken = 0;
  let quizTimer = null;
  let quizLast = -1;

  
function drawQuiz() {
  const area = byId('quiz-options');
  if (!area) return;

  ++quizToken;
  quizLock = false;

  let index = random(quizzes.length);

  // 避免連續兩題相同
  if (index === quizLast) {
    index = (index + 1) % quizzes.length;
  }

  quizLast = index;

  const question = quizzes[index];

  byId('quiz-question').textContent = question[0];
  byId('quiz-msg').textContent = '請選擇答案';

  area.replaceChildren();

  // 避免重複產生下一題按鈕
  const oldNext = byId('quiz-next');
  if (oldNext) oldNext.remove();

  question[1].forEach((answer, answerIndex) => {
    const option = button(
      answer,
      () => {
        if (quizLock || !visible('quiz-game')) return;

        quizLock = true;
        quizAnswered++;

        const correct = answerIndex === question[2];

        if (correct) {
          quizCorrect++;
          option.classList.add('correct');

          byId('quiz-msg').textContent =
            '🎉 答對了！' + question[3];
        } else {
          option.classList.add('wrong');

          byId('quiz-msg').textContent =
            '💡 一起記住這個生活常識：' + question[3];
        }

        // 顯示正確答案
        [...area.querySelectorAll('.quiz-option')]
          .forEach((item, i) => {
            item.disabled = true;

            if (i === question[2]) {
              item.classList.add('correct');
            }
          });

        byId('quiz-progress').textContent =
          `已答 ${quizAnswered} 題`;

        byId('quiz-score').textContent =
          `答對 ${quizCorrect} 題`;

        // 由使用者決定何時進入下一題
        const next = button(
          '下一題 →',
          () => {
            next.remove();
            drawQuiz();
          },
          'quiz-next'
        );

        next.id = 'quiz-next';
        area.after(next);
      },
      'quiz-option'
    );

    area.appendChild(option);
  });
}


  window.startQuiz = function (reset) {
    clearTimeout(quizTimer);

    if (reset) {
      quizAnswered = 0;
      quizCorrect = 0;

      if (byId('quiz-progress')) {
        byId('quiz-progress').textContent = '已答 0 題';
      }

      if (byId('quiz-score')) {
        byId('quiz-score').textContent = '答對 0 題';
      }
    }

    drawQuiz();
  };


  /* =========================
     6. 離開頁面時清除記憶計時
  ========================= */

  window.addEventListener('hashchange', () => {
    if (!visible('sequence-game')) {
      clearSeq();
    }
  });

})();
