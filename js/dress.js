/* ============ dress.js：今天穿什麼 ============ */
const DRESS_GUIDE = {
  cold: { range:'10°C 以下',  icon:'🧥', name:'冬天很冷', items:['厚外套或羽絨衣','毛衣或厚長袖','長褲','圍巾或帽子','手套（如果有）'] },
  cool: { range:'10–18°C',    icon:'🧣', name:'天氣涼',   items:['薄外套或夾克','長袖上衣或薄毛衣','長褲'] },
  mild: { range:'18–26°C',    icon:'👔', name:'天氣舒適', items:['薄長袖或短袖都可以','薄外套帶著備用','長褲或七分褲'] },
  warm: { range:'26–32°C',    icon:'👕', name:'天氣熱',   items:['短袖或薄長袖','短褲或薄長褲','出門帶把傘（午後雷陣雨）'] },
  hot:  { range:'32°C 以上',  icon:'🌞', name:'很熱！',   items:['最薄的短袖','短褲或薄裙','帽子或陽傘（防曬必備）','多帶一瓶水'] }
};

window.initDress = function(){
  const body = document.getElementById('dress-body');
  if(!body) return;

  const m = new Date().getMonth() + 1;
  const tempGuess = (m <= 1 || m === 12) ? 8
                  : m <= 3 ? 15
                  : m <= 4 ? 22
                  : m <= 9 ? 30
                  : m <= 10 ? 25
                  : 18;

  const category = tempGuess < 10 ? 'cold'
                 : tempGuess < 18 ? 'cool'
                 : tempGuess < 26 ? 'mild'
                 : tempGuess < 32 ? 'warm'
                 : 'hot';

  const guide = DRESS_GUIDE[category];
  const now = new Date();
  const days = ['日','一','二','三','四','五','六'];

  const itemsHtml = guide.items.map((item, i) =>
    `<div style="display:flex;align-items:center;gap:12px;padding:11px 12px;background:${i%2?'#F8FAFC':'#EBF5FB'};border-radius:10px;margin-bottom:6px;font-size:clamp(15px,4vw,18px);color:var(--text)">
      <span style="font-size:clamp(18px,4.5vw,22px);flex-shrink:0">✓</span>${item}
    </div>`
  ).join('');

  body.innerHTML = `
    <div style="background:linear-gradient(135deg,var(--n),var(--n2));border-radius:18px;padding:22px;margin-bottom:14px;text-align:center;color:#fff">
      <div style="font-size:clamp(46px,12vw,56px);margin-bottom:10px">${guide.icon}</div>
      <div style="font-size:clamp(18px,5vw,22px);font-weight:900;margin-bottom:4px">${guide.name}</div>
      <div style="font-size:clamp(13px,3.4vw,15px);opacity:.8">${now.getMonth()+1}月${now.getDate()}日（星期${days[now.getDay()]}）</div>
      <div style="font-size:clamp(11px,3vw,13px);opacity:.65;margin-top:4px">參考氣溫區間：${guide.range}</div>
    </div>
    <div style="background:var(--white);border:2px solid var(--border);border-radius:16px;padding:18px;margin-bottom:12px">
      <div style="font-size:clamp(15px,4.2vw,18px);font-weight:900;color:var(--n);margin-bottom:14px">📋 今天建議穿這些</div>
      ${itemsHtml}
    </div>
    <div style="background:var(--sky);border-radius:14px;padding:14px 16px;font-size:clamp(13px,3.6vw,16px);color:var(--n2);line-height:1.9">
      💡 <strong>貼心提醒：</strong>早晚溫差大，出門時多帶一件薄外套比較安全！
      <br>如果不確定，可以問家人今天的天氣如何。
    </div>
    <div style="margin-top:12px;font-size:12px;color:var(--hint);text-align:center;line-height:1.7">
      以上建議依台灣${m}月份一般氣候推估<br>實際天氣以當天狀況為準
    </div>
  `;
};
