/* ============ brain.js：配對記憶、算術、情緒打卡 ============ */

/* ─── 配對記憶 ─── */
const EMOJIS = ['🍎','🐶','🌸','🐟','🌙','☀️','🍊','🐸','🐔','🐥','🍅','🐹','🌼','🐬','🍌'];

let memFlipped = [];
let memMatched = 0;
let memSteps = 0;
let memLock = false;
let memTimers = [];
let memRound = 0;

window.initMem = function () {
  memRound++;

  memTimers.forEach(clearTimeout);
  memTimers = [];

  const cards = [...EMOJIS, ...EMOJIS]
    .sort(() => Math.random() - 0.5);

  memFlipped = [];
  memMatched = 0;
  memSteps = 0;
  memLock = false;

  if (e('mem-steps')) {
    e('mem-steps').textContent = '0';
  }

  if (e('mem-matched')) {
    e('mem-matched').textContent = '0';
  }

  const grid = e('mem-grid');
  if (!grid) return;

  grid.innerHTML = cards.map((emoji, index) => `
    <button
      type="button"
      class="mem-card"
      data-em="${emoji}"
      data-i="${index}"
      aria-label="第 ${index + 1} 張牌，尚未翻開"
      onclick="flipCard(this)"
    >❓</button>
  `).join('');
};

window.flipCard = function (card) {
  if (
    memLock ||
    card.classList.contains('flip') ||
    card.classList.contains('matched')
  ) {
    return;
  }

  card.classList.add('flip');

  // Emoji 獨立包在 span，讓 CSS 能真正放大圖案
  card.innerHTML =
    '<span class="mem-emoji" aria-hidden="true">' +
    card.dataset.em +
    '</span>';

  card.setAttribute(
    'aria-label',
    '圖案：' + card.dataset.em
  );

  memFlipped.push(card);

  if (memFlipped.length !== 2) return;

  memLock = true;
  memSteps++;

  if (e('mem-steps')) {
    e('mem-steps').textContent = memSteps;
  }

  const first = memFlipped[0];
  const second = memFlipped[1];

  if (first.dataset.em === second.dataset.em) {
    memFlipped.forEach(item => {
      item.classList.add('matched');
      item.classList.remove('flip');
      item.disabled = true;
    });

    memMatched++;

    if (e('mem-matched')) {
      e('mem-matched').textContent = memMatched;
    }

    memFlipped = [];
    memLock = false;

    if (memMatched === EMOJIS.length) {
      memTimers.push(
        setTimeout(() => {
          toast('🎉 恭喜！全部配對完成！步數：' + memSteps);
        }, 300)
      );
    }

    return;
  }

  const round = memRound;

  memTimers.push(
    setTimeout(() => {
      if (round !== memRound) return;

      memFlipped.forEach(item => {
        item.classList.add('wrong');
      });

      memTimers.push(
        setTimeout(() => {
          if (round !== memRound) return;

          memFlipped.forEach(item => {
            item.classList.remove('flip', 'wrong');
            item.textContent = '❓';
            item.setAttribute('aria-label', '尚未翻開');
          });

          memFlipped = [];
          memLock = false;
        }, 600)
      );
    }, 600)
  );
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
    '🍎', '🍋', '🌷', '🐱',
    '🐟', '⭐', '🍇', '🦋',
    '🍊', '🌙', '🐸', '🐻'
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
    ['🍎', '🍊'],
    ['🍋', '🍊'],
    ['🐱', '🐻'],
    ['🌷', '🌸'],
    ['⭐', '🌙'],
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

  const quizzes = [
    [
      '有人突然昏倒、叫不醒，應該打哪個電話？',
      ['119', '110', '1999'],
      0,
      '在台灣，緊急救護請撥 119，並依接線人員指示處理。'
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
      '過馬路要看號誌，也要注意左右來車。'
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
      ['忍耐不說', '找人協助，緊急時打119', '自己亂吃藥'],
      1,
      '身體不適要及時求助，緊急情況可撥 119。'
    ],
    [
      '夏天天氣很熱，出門應該注意？',
      ['適時喝水、避開曝曬', '完全不喝水', '一直曬太陽'],
      0,
      '天熱要注意補充水分與休息。'
    ],
    [
      '家裡聞到瓦斯味，應該？',
      ['開燈查看', '點火測試', '避免操作電器並離開求助'],
      2,
      '不要點火或操作電器開關，先離開危險區域並求助。'
    ],
    [
      '陌生人要你的銀行密碼，應該？',
      ['直接告訴他', '拒絕並查證', '貼在網路上'],
      1,
      '銀行密碼和驗證碼不能隨便告訴別人。'
    ],
    [
      '走路時突然頭暈，應該？',
      ['停下來找安全地方坐下並求助', '繼續快跑', '自己開車'],
      0,
      '先避免跌倒並尋求協助，症狀嚴重時應緊急就醫。'
    ],
    [
      '搭公車時，怎樣比較安全？',
      ['站穩並扶好扶手', '在車內奔跑', '站著不扶'],
      0,
      '搭車要站穩扶好，避免煞車時跌倒。'
    ],
    [
      '可疑電話自稱銀行人員，應該？',
      ['提供帳號密碼', '掛斷後找官方電話確認', '照指示轉帳'],
      1,
      '透過銀行官方管道確認，不要提供密碼。'
    ],
    [
      '出門前，應該確認什麼？',
      ['瓦斯、電器與門窗', '把門敞開', '忘記關瓦斯'],
      0,
      '出門前記得檢查瓦斯、電器和門窗。'
    ]
  ];

  let quizAnswered = 0;
  let quizCorrect = 0;
  let quizLock = false;
  let quizToken = 0;
  let quizTimer = null;
  let quizLast = -1;

  function drawQuiz() {
    const area = byId('quiz-options');
    if (!area) return;

    const token = ++quizToken;

    quizLock = false;

    let index = random(quizzes.length);

    // 避免連續兩題完全相同
    if (index === quizLast) {
      index = (index + 1) % quizzes.length;
    }

    quizLast = index;

    const question = quizzes[index];

    byId('quiz-question').textContent = question[0];
    byId('quiz-msg').textContent = '請選擇答案';

    area.replaceChildren();

    question[1].forEach((answer, answerIndex) => {
      const option = button(
        answer,
        () => {
          if (
            quizLock ||
            !visible('quiz-game')
          ) {
            return;
          }

          quizLock = true;
          quizAnswered++;

          if (answerIndex === question[2]) {
            quizCorrect++;

            byId('quiz-msg').textContent =
              '🎉 答對了！' + question[3];
          }

          else {
            byId('quiz-msg').textContent =
              '一起記住這個生活常識：' + question[3];
          }

          byId('quiz-progress').textContent =
            `已答 ${quizAnswered} 題`;

          byId('quiz-score').textContent =
            `答對 ${quizCorrect} 題`;

          quizTimer = setTimeout(() => {
            if (
              token === quizToken &&
              visible('quiz-game')
            ) {
              drawQuiz();
            }
          }, 1600);
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
