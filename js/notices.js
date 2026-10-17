
(function () {
  "use strict";

  const URLS = {
    notices: "./data/announcements.json",
    life: "./data/life_information.json",
    status: "./data/life_source_status.json"
  };
  const CACHE_PREFIX = "banlaoyou_v83_";
  const FONT_KEY = "banlaoyou_notice_font";
  const TIMEOUT = 12000;
  const MAX_NOTICES = 40;
  const CITIES = ["基隆市","臺北市","新北市","桃園市","新竹市","新竹縣","苗栗縣","臺中市","彰化縣","南投縣","雲林縣","嘉義市","嘉義縣","臺南市","高雄市","屏東縣","宜蘭縣","花蓮縣","臺東縣","澎湖縣","金門縣","連江縣"];
  const CATS = [
    ["all","全部公告",null,""],
    ["health","健康防疫","https://www.cdc.gov.tw/","疾病管制署健康防疫資訊"],
    ["weather","天氣預報","https://www.cwa.gov.tw/","中央氣象署天氣預報與警特報"],
    ["power","預定停電","https://data.gov.tw/dataset/26144","台電預定停電資料；實際時間以台電公告為準"],
    ["water","預定停水","https://www.water.gov.tw/","台灣自來水公司停水資訊；其他供水單位請另查"],
    ["welfare","長者福利","https://www.mohw.gov.tw/","衛福部長照與老人福利資訊"],
    ["fraud","防詐提醒","https://165.npa.gov.tw/","165 全民防騙網"],
    ["medical","健保就醫","https://www.nhi.gov.tw/","中央健康保險署"],
    ["food","食藥安全","https://www.fda.gov.tw/","食品藥物管理署"],
    ["pension","年金給付","https://www.bli.gov.tw/","勞工保險局"],
    ["mohw","衛福部公告","https://www.mohw.gov.tw/","衛生福利部"]
  ];
  const MAP = {"健康資訊":"health","健康防疫":"health","天氣預報":"weather","天氣警示":"weather","預定停電":"power","預定停水":"water","長者福利":"welfare","防詐提醒":"fraud","健保就醫":"medical","食藥安全":"food","年金給付":"pension","衛福部公告":"mohw"};
  const SOURCE_KEYS = {weather:["天氣預報","W-C0033-006","W-C0033-007","W-C0033-008","W-C0033-009","W-C0033-010"],power:["預定停電"],water:["預定停水"]};
  let notices = readCache("notices");
  let life = readCache("life");
  let status = readCache("status");
  let errors = {};
  let loading = false;
  let active = "all";
  let font = readFont();
  let cityChoice = "";

  function node(tag, value, className) {
    const e = document.createElement(tag);
    if (className) e.className = className;
    if (value !== undefined && value !== null) e.textContent = String(value);
    return e;
  }
  function button(value, callback) {
    const e = node("button", value);
    e.type = "button";
    e.style.cssText = "min-height:48px;padding:10px 14px;border:1px solid #888;border-radius:12px;background:transparent;color:inherit;font:inherit;cursor:pointer;text-align:center";
    e.addEventListener("click", callback);
    return e;
  }
  function readCache(name) {
    try { return JSON.parse(localStorage.getItem(CACHE_PREFIX + name) || "null"); }
    catch { return null; }
  }
  function saveCache(name, data) {
    try { localStorage.setItem(CACHE_PREFIX + name, JSON.stringify(data)); }
    catch { /* Storage disabled or full. */ }
  }
  function readFont() {
    try { const n = Number(localStorage.getItem(FONT_KEY)); if ([1,2,3].includes(n)) return n; }
    catch { /* Private browsing. */ }
    return 2;
  }
  function date(value) {
    if (!value) return null;
    const d = new Date(value);
    return Number.isFinite(d.getTime()) ? d : null;
  }
  function fmt(value, time) {
    const d = date(value);
    if (!d) return "未提供";
    return new Intl.DateTimeFormat("zh-TW", {timeZone:"Asia/Taipei",year:"numeric",month:"2-digit",day:"2-digit",...(time ? {hour:"2-digit",minute:"2-digit",hour12:false} : {})}).format(d);
  }
  function safeUrl(value) {
    if (typeof value !== "string") return null;
    try {
      const u = new URL(value);
      const h = u.hostname.toLowerCase().replace(/\.$/, "");
      if (u.protocol !== "https:" || u.username || u.password || (u.port && u.port !== "443")) return null;
      if (!(h === "gov.tw" || h.endsWith(".gov.tw") || h === "taipower.com.tw" || h.endsWith(".taipower.com.tw"))) return null;
      return u.href;
    } catch { return null; }
  }
  function link(text, url) {
    const safe = safeUrl(url);
    if (!safe) return null;
    const a = node("a", text);
    a.href = safe;
    a.target = "_blank";
    a.rel = "noopener noreferrer";
    a.style.cssText = "display:inline-flex;align-items:center;min-height:48px;font-weight:700;text-decoration:underline;overflow-wrap:anywhere";
    return a;
  }
  function normalizeCity(value) {
    const v = String(value || "").replace(/台/g,"臺").trim();
    return CITIES.find(c => v.includes(c)) || "";
  }
  function region() {
    return normalizeCity(cityChoice || window.C?.rg || "");
  }
  function category(item) {
    const cat = String(item.category || "").trim();
    if (MAP[cat]) return MAP[cat];
    const s = String(item.source || "");
    const t = String(item.title || "");
    if (/疾管署|疾病管制署/.test(s)) return "health";
    if (/食藥署|食品藥物管理署/.test(s)) return "food";
    if (/中央氣象署/.test(s)) return "weather";
    if (/台灣電力|臺灣電力/.test(s)) return "power";
    if (/自來水/.test(s)) return "water";
    if (/勞工保險局/.test(s)) return "pension";
    if (/健康保險署/.test(s)) return "medical";
    if (/國民年金|勞保年金|老年年金|退休金/.test(t)) return "pension";
    if (/健保|就醫權益|部分負擔/.test(t)) return "medical";
    if (/長照|長者|高齡|老人福利|失智/.test(t)) return "welfare";
    if (/防詐|詐騙/.test(t)) return "fraud";
    if (/衛生福利部/.test(s)) return "mohw";
    return "other";
  }
  function noticeItems() {
    if (!Array.isArray(notices?.items)) return [];
    const seen = new Set();
    return notices.items.filter(item => {
      if (!item || !safeUrl(item.url)) return false;
      const id = [item.url,item.title,item.published_at].join("|");
      if (seen.has(id)) return false;
      seen.add(id);
      return true;
    }).sort((a,b) => (date(b.published_at)?.getTime() || 0) - (date(a.published_at)?.getTime() || 0)).slice(0,MAX_NOTICES);
  }
  function lifeItems() {
    if (!Array.isArray(life?.items)) return [];
    const seen = new Set();
    return life.items.filter(item => {
      if (!item || !safeUrl(item.url) || !["weather","water","power"].includes(category(item))) return false;
      const end = date(item.ends_at);
      if (!end || end.getTime() < Date.now()) return false;
      const id = String(item.id || [item.category,item.title,item.starts_at,item.ends_at].join("|"));
      if (seen.has(id)) return false;
      seen.add(id);
      return true;
    }).sort((a,b) => {
      const aAlert = a.category === "天氣警示" ? 1 : 0;
      const bAlert = b.category === "天氣警示" ? 1 : 0;
      return bAlert - aAlert || (date(a.starts_at)?.getTime() || 0) - (date(b.starts_at)?.getTime() || 0);
    });
  }
  function relevant(item, selectedCity) {
    if (!selectedCity) return true;
    const cities = Array.isArray(item.cities) ? item.cities.map(normalizeCity).filter(Boolean) : [];
    // 未標示適用縣市的民生事件不當成該縣市事件。
    return cities.includes(selectedCity);
  }
  function selectedItems() {
    const old = noticeItems();
    const local = lifeItems().filter(item => relevant(item,region()));
    if (active === "all") return [...local,...old];
    return [...local,...old].filter(item => category(item) === active);
  }
  function countFor(id) {
    if (id === "all") return selectedItems().length;
    return [...lifeItems().filter(item => relevant(item,region())),...noticeItems()].filter(item => category(item) === id).length;
  }
  function section(root, message) {
    const e = node("section");
    e.style.cssText = "border:1px solid #999;border-radius:12px;padding:14px;margin:14px 0;line-height:1.7";
    e.appendChild(node("p",message));
    root.appendChild(e);
    return e;
  }
  function renderHeader(root) {
    root.appendChild(node("h3","政府官方公告與民生資訊"));
    const r = region();
    root.appendChild(node("p",r ? "目前查看地區：" + r + "。天氣、停水及停電依縣市篩選。" : "尚未選擇縣市：天氣及民生事件目前顯示全部地區，請選擇所在地。"));
    const controls = node("div");
    controls.style.cssText = "display:flex;flex-wrap:wrap;gap:8px;margin:14px 0";
    const minus = button("字體 A−",() => changeFont(-1));
    const plus = button("字體 A＋",() => changeFont(1));
    minus.disabled = font === 1;
    plus.disabled = font === 3;
    const refresh = button(loading ? "更新中…" : "重新整理",() => window.bldN());
    refresh.disabled = loading;
    controls.append(minus,plus,refresh);
    root.appendChild(controls);
    const label = node("label","民生資訊縣市：");
    const select = node("select");
    select.setAttribute("aria-label","選擇民生資訊縣市");
    select.style.cssText = "font:inherit;padding:10px;min-height:48px;max-width:100%;border:1px solid #888;border-radius:10px;background:transparent;color:inherit";
    const opt = node("option","全部縣市"); opt.value = ""; select.appendChild(opt);
    CITIES.forEach(c => {const o=node("option",c);o.value=c;select.appendChild(o);});
    select.value = region();
    select.addEventListener("change",() => {cityChoice = select.value;render();});
    label.appendChild(select);
    root.appendChild(label);
  }
  function changeFont(delta) {
    font = Math.max(1,Math.min(3,font+delta));
    try { localStorage.setItem(FONT_KEY,String(font)); } catch {}
    render();
  }
  function stateFor(cat) {
    const sources = status?.sources;
    if (!sources || !SOURCE_KEYS[cat]) return null;
    const states = SOURCE_KEYS[cat].map(key => sources[key]?.state || "missing");
    if (states.every(s => s === "ok")) return "ok";
    if (states.some(s => s === "ok")) return "partial";
    return "error";
  }
  function renderStatus(root) {
    const p = section(root,loading ? "正在讀取官方資料…" : "公告及民生資料分別更新，以下顯示目前取得的資訊。");
    if (notices?.generated_at) p.appendChild(node("p","公告更新："+fmt(notices.generated_at,true)));
    if (life?.generated_at) p.appendChild(node("p","民生資料更新："+fmt(life.generated_at,true)));
    if (Object.keys(errors).length) p.appendChild(node("p","部分資料目前無法更新，已保留可用的先前資料。"));
    if (notices?.status === "partial") p.appendChild(node("p","部分公告來源更新失敗。"));
    const age = date(life?.generated_at);
    if (age && Date.now()-age.getTime()>30*3600000) p.appendChild(node("p","民生資料超過 30 小時未更新，請以官方網站為準。"));
    if (!life) p.appendChild(node("p","尚未取得民生資料，天氣、停水、停電數量可能顯示 0。"));
  }
  function renderCategories(root) {
    const grid = node("section");
    grid.style.cssText = "display:grid;grid-template-columns:repeat(auto-fit,minmax(125px,1fr));gap:10px;margin:18px 0";
    CATS.forEach(([id,name]) => {
      const b = button(name+"（"+countFor(id)+"）",() => {active=id;render();});
      const selected = active === id;
      b.setAttribute("aria-pressed",String(selected));
      if (selected) {b.style.borderWidth="3px";b.style.fontWeight="800";}
      grid.appendChild(b);
    });
    root.appendChild(grid);
    root.appendChild(node("p","數字為目前顯示的有效民生資訊及已匯入公告筆數，不代表官方所有事件總量。"));
  }
  function renderCard(root,item) {
    const card = node("article",null,"nc gov");
    card.style.cssText = "padding:18px;border:1px solid #aaa;border-radius:14px;margin:14px 0;line-height:1.75;overflow-wrap:anywhere";
    const label = CATS.find(c => c[0] === category(item));
    card.appendChild(node("div",item.category === "天氣警示" ? "天氣警示" : label?.[1] || item.category || "政府資訊","nb"));
    const title = node("h4",item.title || "官方資訊","nt");
    title.style.cssText = "font-size:"+[19,23,27][font-1]+"px;line-height:1.45;margin:10px 0";
    card.appendChild(title);
    if (item.starts_at) card.appendChild(node("p","開始時間："+fmt(item.starts_at,true)));
    if (item.ends_at) card.appendChild(node("p","結束／預報截止："+fmt(item.ends_at,true)));
    if (!item.starts_at && !item.ends_at) card.appendChild(node("p","發布日期："+fmt(item.published_at)));
    if (Array.isArray(item.cities) && item.cities.length) card.appendChild(node("p","適用縣市："+item.cities.join("、")));
    card.appendChild(node("p","來源："+(item.source || "政府官方來源")));
    const summary = String(item.summary || "").trim();
    if (summary) {
      const preview = node("p",summary.length>160 ? summary.slice(0,160)+"…" : summary);
      card.appendChild(preview);
      if (summary.length>160) {
        let expanded=false;
        const toggle=button("展開更多內容",() => {expanded=!expanded;preview.textContent=expanded?summary:summary.slice(0,160)+"…";toggle.textContent=expanded?"收合內容":"展開更多內容";toggle.setAttribute("aria-expanded",String(expanded));});
        toggle.setAttribute("aria-expanded","false");
        card.appendChild(toggle);
      }
    }
    const a=link("查看官方資訊 ↗",item.url);
    if (a) card.appendChild(a);
    root.appendChild(card);
  }
  function renderEntry(root,cat) {
    if (!cat || !cat[2]) return;
    const s=section(root,cat[3]);
    s.insertBefore(node("h4",cat[1]+"｜官方查詢"),s.firstChild);
    const a=link("前往官方網站查詢 ↗",cat[2]);
    if (a) s.appendChild(a);
    s.appendChild(node("p","官方查詢入口不代表本網站已取得該來源的完整即時資料。"));
  }
  function renderEntries(root) {
    const s=node("section");
    s.appendChild(node("h3","各類官方資訊入口"));
    CATS.slice(1).forEach(c => {
      const a=link(c[1]+"｜官方網站 ↗",c[2]);
      if (a) {const row=node("div");row.style.cssText="padding:8px 0;border-bottom:1px solid #bbb";row.appendChild(a);s.appendChild(row);}
    });
    root.appendChild(s);
  }
  function render() {
    const root=document.getElementById("nlist");
    if (!root) return;
    root.replaceChildren();
    root.style.fontSize=[16,19,22][font-1]+"px";
    root.style.lineHeight="1.7";
    renderHeader(root);
    renderStatus(root);
    renderCategories(root);
    const items=selectedItems();
    if (["weather","power","water"].includes(active)) {
      const state=stateFor(active);
      if (state === "error") section(root,"這項民生資料來源尚未全部成功取得，不能判定目前沒有事件。請使用官方查詢入口。");
      else if (state === "partial") section(root,"部分天氣警示來源讀取失敗，顯示的資訊可能不完整。");
      else if (state === "ok" && !items.length) section(root,region()?"目前沒有符合所選縣市的已匯入有效資料；這不代表官方保證沒有事件。":"目前沒有已匯入的有效資料；請參考官方查詢入口。");
    }
    if (items.length) {
      root.appendChild(node("h3","已匯入資訊："+items.length+" 則"));
      items.forEach(item => renderCard(root,item));
    } else if (!["weather","power","water"].includes(active)) {
      root.appendChild(node("p","目前沒有可顯示的已匯入公告。"));
    }
    if (active === "all") renderEntries(root);
    else renderEntry(root,CATS.find(c=>c[0]===active));
  }
  async function getJSON(name,controller) {
    const response=await fetch(URLS[name]+"?t="+Date.now(),{cache:"no-store",signal:controller.signal});
    if (!response.ok) throw new Error("HTTP "+response.status);
    const obj=await response.json();
    if (!obj || typeof obj!=="object") throw new Error("JSON 格式錯誤");
    if ((name==="notices" || name==="life") && !Array.isArray(obj.items)) throw new Error("缺少 items");
    if (name==="status" && (!obj.sources || typeof obj.sources!=="object")) throw new Error("缺少 sources");
    return obj;
  }
  window.bldN=async function () {
    if (loading) return;
    loading=true;
    errors={};
    render();
    const controller=new AbortController();
    const timer=setTimeout(()=>controller.abort(),TIMEOUT);
    try {
      const names=["notices","life","status"];
      const results=await Promise.allSettled(names.map(name=>getJSON(name,controller)));
      results.forEach((result,i) => {
        const name=names[i];
        if (result.status==="fulfilled") {
          if (name==="notices") notices=result.value;
          if (name==="life") life=result.value;
          if (name==="status") status=result.value;
          saveCache(name,result.value);
        } else {
          errors[name]=String(result.reason);
          console.warn("資料讀取失敗："+name,result.reason);
        }
      });
    } finally {
      clearTimeout(timer);
      loading=false;
      render();
    }
  };
})();
