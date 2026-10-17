
window.bldP = function(tid, sosOnly){
  const ph = [];
  if(C.f1n && C.f1p) ph.push({s:'nvy', ic:'👨‍👩‍👧', n:C.f1n, num:C.f1p, cls:''});
  if(C.f2n && C.f2p) ph.push({s:'nvy', ic:'👨‍👩‍👧', n:C.f2n, num:C.f2p, cls:''});
  ph.push({s:'red', ic:'🚑', n:'緊急救護', num:'119', cls:'rc'});
  ph.push({s:'red', ic:'🚔', n:'報警電話', num:'110', cls:'rc'});

  if(!sosOnly){
    ph.push({s:'grn', ic:'🏥', n:'長照服務專線', num:'1966', cls:''});
    ph.push({s:'amb', ic:'📞', n:'安心專線（心理支持）', num:'1925', cls:''});
    if(C.cn && C.cp) ph.push({s:'grn', ic:'🏥', n:C.cn, num:C.cp, cls:''});
  }

  const list = sosOnly ? ph.filter(p => p.cls === 'rc' || p.s === 'nvy') : ph;
  const target = e(tid);
  if(!target) return;

  target.innerHTML = list.map(p => {
    const telNum = p.num.replace(/[^\d+]/g, '');
    return `<div class="pcd"><div class="pst ${p.s}"></div><div class="pct"><span class="pic">${p.ic}</span><div class="pin"><div class="pnm">${escapeHTML(p.n)}</div><div class="pph">${escapeHTML(p.num)}</div></div></div><div class="prgt"><a class="pcl ${p.cls}" href="tel:${telNum}" aria-label="撥打 ${escapeHTML(p.n)}">撥打</a></div></div>`;
  }).join('');
};

// 不連接即時官方公告來源時，不可聲稱已確認無停水、停電。
window.bldN = function(){
  const target = e('nlist'); if(!target) return;
  const entries = [];
  if(C.sw !== false) entries.push(['停水資訊','本程式尚未連接即時停水公告，請向當地自來水事業查詢。']);
  if(C.se !== false) entries.push(['停電資訊','本程式尚未連接即時停電公告，請向台灣電力公司查詢。']);
  if(C.sg !== false) entries.push(['政府福利資訊','長照服務與補助資格請撥打 1966，向專員確認最新規定。']);
  target.innerHTML = entries.map(([title, body]) => `<div class="nc gov"><div class="nt">${title}</div><div class="nb">${body}</div></div>`).join('') || '<div class="nc">已關閉公告類別，可在設定中重新開啟。</div>';
};
