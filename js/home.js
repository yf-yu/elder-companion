
window.initH = function(){
  const now = new Date(), h = now.getHours();
  const days = ['日','一','二','三','四','五','六'];
  const nm = window.C.name || '朋友';

  const greet = h < 12 ? '早安 ☀️' : h < 18 ? '午安 🌤️' : '晚安 🌙';
  e('eg').textContent = greet + '，' + nm;
  e('ed').textContent = `${now.getFullYear()}年${now.getMonth()+1}月${now.getDate()}日（星期${days[now.getDay()]}）`;

  const m = now.getMonth() + 1;
  const tips = [,'保暖第一，多喝溫水','乍暖還寒，外出帶外套','春天多喝水，預防過敏','早晚溫差大，記得帶外套','天氣熱，多補充水分','天氣很熱，午後留在室內','炎夏補水，少在正午外出','秋燥來了，多喝水潤喉','涼意漸起，早晚添衣','氣溫下降，注意保暖','天氣冷，出門圍圍巾','冬天保暖，少吹冷風'];
  e('ewx').textContent = tips[m] || '今天天氣舒適，注意保暖';

  setSeason(m);

  e('ntxt').textContent = window.C.rg
    ? `${window.C.rg}：目前無緊急公告，點「最新公告」查看詳情`
    : '今天沒有緊急公告';
};

window.setSeason = function(m){
  const s =
    (m <= 2 || m === 12) ? {i:'❄️', t:'冬季養生重點', b:'冬天注意保暖，特別是頸部腰部腳部。多吃溫熱食物，像是薑、黑木耳、核桃，幫助禦寒。', tp:'💡 冬天適合喝薑母茶或黑芝麻糊，每天一杯，暖和又養生！'} :
    m <= 5              ? {i:'🌸', t:'春季養生重點', b:'春天氣候多變，容易過敏。多吃綠色蔬菜，保持情緒舒暢，多做戶外活動。', tp:'💡 春天適合吃菠菜、韭菜、豆芽，幫助身體從冬天甦醒！'} :
    m <= 8              ? {i:'☀️', t:'夏季養生重點', b:'夏天要注意補水，每天至少喝6到8杯水。避開正午外出，多休息，吃清淡食物。', tp:'💡 夏天適合吃苦瓜、冬瓜、綠豆湯，消暑又健康！'} :
                          {i:'🍂', t:'秋季養生重點', b:'秋天空氣乾燥，容易咳嗽皮膚乾。多喝水，多吃梨子蜂蜜白木耳，幫助滋潤身體。', tp:'💡 秋天適合燉銀耳蓮子湯，潤肺又好喝！'};

  if(e('sei'))  e('sei').textContent = s.i;
  if(e('set'))  e('set').textContent = s.t;
  if(e('seb'))  e('seb').textContent = s.b;
  if(e('setp'))
