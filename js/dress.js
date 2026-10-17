/* ============ dress.js：今天穿什麼（支援 Open-Meteo API） ============ */
const DRESS_GUIDE = {
  cold: { range:'10°C 以下',  icon:'🧥', name:'冬天很冷', items:['厚外套或羽絨衣','毛衣或厚長袖','長褲','圍巾或帽子','手套（如果有）'] },
  cool: { range:'10–18°C',    icon:'🧣', name:'天氣涼',   items:['薄外套或夾克','長袖上衣或薄毛衣','長褲'] },
  mild: { range:'18–26°C',    icon:'👔', name:'天氣舒適', items:['薄長袖或短袖都可以','薄外套帶著備用','長褲或七分褲'] },
  warm: { range:'26–32°C',    icon:'👕', name:'天氣熱',   items:['短袖或薄長袖','短褲或薄長褲','出門帶把傘（午後雷陣雨）'] },
  hot:  { range:'32°C 以上',  icon:'🌞', name:'很熱！',   items:['最薄的短袖','短褲或薄裙','帽子或陽傘（防曬必備）','多帶一瓶水'] }
};

// 縣市對應經緯度（簡易版，你可以補齊）
const CITY_COORDS = {
  '臺北市': { lat: 25.03, lon: 121.56 },
  '新北市': { lat: 25.01, lon: 121.46 },
  '桃園市': { lat: 24.99, lon: 121.30 },
  '臺中市': { lat: 24.14, lon: 120.68 },
  '臺南市': { lat: 22.99, lon: 120.21 },
  '高雄市': { lat: 22.62, lon: 120.31 },
  '基隆市': { lat: 25.13, lon: 121.74 },
  '新竹市': { lat: 24.80, lon: 120.97 },
  '嘉義市': { lat: 23.48, lon: 120.44 },
  '新竹縣': {lat:24.83,lon:121.01}, '苗栗縣': {lat:24.56,lon:120.82},
  '彰化縣': {lat:24.07,lon:120.54}, '南投縣': {lat:23.91,lon:120.68},
  '雲林縣': {lat:23.71,lon:120.43}, '嘉義縣': {lat:23.46,lon:120.29},
  '屏東縣': {lat:22.67,lon:120.49}, '宜蘭縣': {lat:24.75,lon:121.75},
  '花蓮縣': {lat:23.99,lon:121.60}, '臺東縣': {lat:22.76,lon:121.14},
  '澎湖縣': {lat:23.57,lon:119.57}, '金門縣': {lat:24.43,lon:118.32},
  '連江縣': {lat:26.16,lon:119.95},
  '預設':   { lat: 25.03, lon: 121.56 } // 尚未設定時僅供預覽
};

window.initDress = async function(){
  const body = document.getElementById('dress-body');
  if(!body) return;

  const m = new Date().getMonth() + 1;
  const now = new Date();
  const days = ['日','一','二','三','四','五','六'];

  // 顯示載入中
  body.innerHTML = '<div style="text-align:center;padding:40px;color:var(--muted)">正在取得天氣資訊...</div>';

  let temp = null;
  let isRealData = false;

  // 1. 嘗試從網路抓真實氣溫
  if (navigator.onLine && window.C && CITY_COORDS[window.C.rg]) {
    try {
      const rg = (window.C && window.C.rg) ? window.C.rg : '預設';
      const coords = CITY_COORDS[rg] || CITY_COORDS['預設'];
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 8000);
      let res;
      try { res = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${coords.lat}&longitude=${coords.lon}&current_weather=true`, {signal:controller.signal}); }
      finally { clearTimeout(timeout); }
      if (!res.ok) throw new Error('weather HTTP ' + res.status);
      const data = await res.json();
      if (data && data.current_weather && typeof data.current_weather.temperature === 'number') {
        temp = data.current_weather.temperature;
        isRealData = true;
      }
    } catch (e) {
      console.log('氣象 API 失敗，使用預設推估');
    }
  }

  // 無資料時不猜測氣溫，避免錯誤的穿衣建議。
  if(temp === null) {
    body.innerHTML = '<div class="safety-note" role="status">目前無法取得即時氣溫，請先查看手機天氣或詢問家人，再決定衣著。<button type="button" onclick="initDress()">重新查詢天氣</button></div>';
    return;
  }

  // 判斷類別
  const category = temp < 10 ? 'cold'
                 : temp < 18 ? 'cool'
                 : temp < 26 ? 'mild'
                 : temp < 32 ? 'warm'
                 : 'hot';

  const guide = DRESS_GUIDE[category];

  const itemsHtml = guide.items.map((item, i) =>
    `<div style="display:flex;align-items:center;gap:12px;padding:11px 12px;background:${i%2?'#F8FAFC':'#EBF5FB'};border-radius:10px;margin-bottom:6px;font-size:clamp(15px,4vw,18px);color:var(--text)">
      <span style="font-size:clamp(18px,4.5vw,22px);flex-shrink:0">✓</span>${item}
    </div>`
  ).join('');

  // 渲染畫面
  body.innerHTML = `
    <div style="background:linear-gradient(135deg,var(--n),var(--n2));border-radius:18px;padding:22px;margin-bottom:14px;text-align:center;color:#fff">
      <div style="font-size:clamp(46px,12vw,56px);margin-bottom:10px">${guide.icon}</div>
      <div style="font-size:clamp(18px,5vw,22px);font-weight:900;margin-bottom:4px">${guide.name}</div>
      <div style="font-size:clamp(13px,3.4vw,15px);opacity:.8">${now.getMonth()+1}月${now.getDate()}日（星期${days[now.getDay()]}）</div>
      <div style="font-size:clamp(11px,3vw,13px);opacity:.65;margin-top:4px">
        ${isRealData ? `目前氣溫：${temp.toFixed(1)}°C（線上觀測）` : '無法取得目前氣溫，以下僅為季節性參考'}
      </div>
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
      ${isRealData ? '天氣資料來源：Open-Meteo.com；縣市中心附近參考值' : '無即時天氣資料，請勿以此判斷戶外溫度或天氣警報'}
    </div>
  `;
};
