/* ============ phones.js：電話、公告 ============ */
window.bldP = function(tid, sosOnly){
  const ph = [];
  if(C.f1n && C.f1p) ph.push({s:'nvy', ic:'👨‍👩‍👧', n:C.f1n, num:C.f1p, cls:''});
  if(C.f2n && C.f2p) ph.push({s:'nvy', ic:'👨‍👩‍👧', n:C.f2n, num:C.f2p, cls:''});
  ph.push({s:'red', ic:'🚑', n:'緊急救護', num:'119', cls:'rc'});
  ph.push({s:'red', ic:'🚔', n:'報警電話', num:'110', cls:'rc'});

  if(!sosOnly){
    ph.push({s:'grn', ic:'🏥', n:'長照服務專線', num:'1966', cls:''});
    ph.push({s:'amb', ic:'📞', n:'老人保護專線', num:'1925', cls:''});
    if(C.cn && C.cp) ph.push({s:'grn', ic:'🏥', n:C.cn, num:C.cp, cls:''});
  }

  const list = sosOnly ? ph.filter(p => p.cls === 'rc' || p.s === 'nvy') : ph;
  const target = e(tid);
  if(!target) return;

  target.innerHTML = list.map(p => {
    const telNum = p.num.replace(/[^\d+]/g, '');
    return `<div class="pcd"><div class="pst ${p.s}"></div><div class="pct"><span class="pic">${p.ic}</span><div class="pin"><div class="pnm">${p.n}</div><div class="pph">${p.num}</div></div></div><div class="prgt"><a href="tel:${telNum}"><button class="pcl ${p.cls}">撥打</button></a></div></div>`;
  }).join('');
};

const DN = [
  {t:'wtr', bg:'bg-b',  btxt:'停水通知', ti:'目前無停水公告', b:'您所在地區目前沒有計劃性停水。'},
  {t:'gov', bg:'bg-g',  btxt:'政府公告', ti:'老人健康檢查補助', b:'65歲以上長輩每年可免費做一次老人健康檢查，攜帶健保卡到附近診所預約。'},
  {t:'gov', bg:'bg-g',  btxt:'長照補助', ti:'長照2.0服務申請', b:'如需照顧協助，可撥打1966長照專線，了解居家服務、喘息服務等補助。'},
  {t:'elc', bg:'bg-gr', btxt:'停電通知', ti:'目前無停電公告', b:'您所在地區目前沒有計劃性停電。'}
];

window.bldN = function(){
  const target = e('nlist');
  if(!target) return;

  const filtered = DN.filter(n => {
    if(n.t === 'wtr' && C.sw === false) return false;
    if(n.t === 'elc' && C.se === false) return false;
    if(n.t === 'gov' && C.sg === false) return false;
    return true;
  });

  target.innerHTML = filtered.map(n =>
    `<div class="nc ${n.t==='wtr'?'wtr':n.t==='gov'?'gov':''}"><span class="nbg ${n.bg}">${n.btxt}</span><div class="nt">${n.ti}</div><div class="nb">${n.b}</div></div>`
  ).join('') + (C.rg
    ? `<div class="nc gov"><span class="nbg bg-g">在地服務</span><div class="nt">${C.rg}長輩服務</div><div class="nb">如需了解${C.rg}在地長照、老人送餐、交通接送，撥1966長照專線詢問。</div></div>`
    : '');
};
