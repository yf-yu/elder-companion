
(function () {
  "use strict";

  const DATA_URL = "./data/announcements.json";
  const CACHE_KEY = "banlaoyou_notice_cache_v79";
  const FONT_KEY = "banlaoyou_notice_font";
  const MAX_ITEMS = 40;
  const TIMEOUT_MS = 9000;
  const STALE_HOURS = 30;

  const categories = [
    {
      id: "all",
      name: "全部公告",
      url: null,
      source: "",
      note: ""
    },
    {
      id: "health",
      name: "健康防疫",
      url: "https://www.cdc.gov.tw/",
      source: "衛生福利部疾病管制署",
      note: "查看官方疫情、防疫與健康資訊。"
    },
    {
      id: "weather",
      name: "天氣預報",
      url: "https://www.cwa.gov.tw/",
      source: "交通部中央氣象署",
      note: "查看最新天氣預報與各地氣象資訊。"
    },
    {
      id: "power",
      name: "預定停電",
      url: "https://data.gov.tw/dataset/26144",
      source: "台灣電力公司",
      note: "查看計畫性工作停電公開資料。實際影響範圍及時間請以台電公告為準。"
    },
    {
      id: "water",
      name: "預定停水",
      url: "https://www.water.gov.tw/",
      source: "台灣自來水公司",
      note: "前往台水官方網站查詢停水資訊；部分地區可能由其他供水單位服務。"
    },
    {
      id: "welfare",
      name: "長者福利",
      url: "https://www.mohw.gov.tw/",
      source: "衛生福利部",
      note: "查詢長照、老人福利與相關服務資訊。"
    },
    {
      id: "fraud",
      name: "防詐提醒",
      url: "https://165.npa.gov.tw/",
      source: "內政部警政署 165 全民防騙網",
      note: "查看最新防詐提醒。遇到可疑電話或訊息，可撥打 165。"
    },
    {
      id: "medical",
      name: "健保就醫",
      url: "https://www.nhi.gov.tw/",
      source: "衛生福利部中央健康保險署",
      note: "查詢健保給付、就醫及相關政策資訊。"
    },
    {
      id: "food",
      name: "食藥安全",
      url: "https://www.fda.gov.tw/",
      source: "衛生福利部食品藥物管理署",
      note: "查看食品、藥品及相關安全公告。"
    },
    {
      id: "pension",
      name: "年金給付",
      url: "https://www.bli.gov.tw/",
      source: "勞動部勞工保險局",
      note: "查詢勞保、國民年金及老年給付資訊。"
    },
    {
      id: "mohw",
      name: "衛福部公告",
      url: "https://www.mohw.gov.tw/",
      source: "衛生福利部",
      note: "查看衛福部其他官方新聞與公告。"
    }
  ];

  const categoryMap = {
    "健康資訊": "health",
    "健康防疫": "health",
    "天氣預報": "weather",
    "預定停電": "power",
    "預定停水": "water",
    "長者福利": "welfare",
    "防詐提醒": "fraud",
    "健保就醫": "medical",
    "食藥安全": "food",
    "年金給付": "pension",
    "衛福部公告": "mohw"
  };

  let currentData = readCache();
  let activeCategory = "all";
  let fontLevel = readFont();
  let loading = false;
  let fetchError = false;

  function el(tag, text, cls) {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text !== undefined && text !== null) {
      n.textContent = String(text);
    }
    return n;
  }

  function btn(text, onClick) {
    const n = el("button", text);
    n.type = "button";
    n.style.cssText = [
      "min-height:48px",
      "padding:10px 14px",
      "border:1px solid #888",
      "border-radius:12px",
      "background:transparent",
      "color:inherit",
      "font:inherit",
      "cursor:pointer",
      "text-align:center"
    ].join(";");
    n.addEventListener("click", onClick);
    return n;
  }

  function safeUrl(value) {
    if (typeof value !== "string") return null;

    try {
      const u = new URL(value);
      const host = u.hostname.toLowerCase().replace(/\.$/, "");

      if (u.protocol !== "https:") return null;
      if (u.username || u.password) return null;
      if (u.port && u.port !== "443") return null;

      const allowed =
        host.endsWith(".gov.tw") ||
        host === "www.taipower.com.tw";

      return allowed ? u.href : null;
    } catch {
      return null;
    }
  }

  function officialLink(text, url) {
    const safe = safeUrl(url);
    if (!safe) return null;

    const n = el("a", text);
    n.href = safe;
    n.target = "_blank";
    n.rel = "noopener noreferrer";
    n.style.cssText = [
      "display:inline-flex",
      "align-items:center",
      "min-height:48px",
      "padding:9px 4px",
      "font-weight:700",
      "text-decoration:underline",
      "text-underline-offset:3px",
      "overflow-wrap:anywhere"
    ].join(";");
    return n;
  }

  function readFont() {
    try {
      const n = Number(localStorage.getItem(FONT_KEY));
      if ([1, 2, 3].includes(n)) return n;
    } catch {}
    return 2;
  }

  function changeFont(delta) {
    fontLevel = Math.max(1, Math.min(3, fontLevel + delta));
    try {
      localStorage.setItem(FONT_KEY, String(fontLevel));
    } catch {}
    render();
  }

  function readCache() {
    try {
      const data = JSON.parse(
        localStorage.getItem(CACHE_KEY) || "null"
      );
      if (data && Array.isArray(data.items)) return data;
    } catch {}
    return null;
  }

  function saveCache(data) {
    try {
      localStorage.setItem(CACHE_KEY, JSON.stringify(data));
    } catch {}
  }

  function dateOf(value) {
    if (!value) return null;
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? null : d;
  }

  function formatDate(value, withTime) {
    const d = dateOf(value);
    if (!d) return "日期未提供";

    return new Intl.DateTimeFormat("zh-TW", {
      timeZone: "Asia/Taipei",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      ...(withTime ? {
        hour: "2-digit",
        minute: "2-digit",
        hour12: false
      } : {})
    }).format(d);
  }

  function categoryFor(item) {
    const cat = String(item.category || "").trim();
    const source = String(item.source || "");
    const title = String(item.title || "");

    if (categoryMap[cat]) return categoryMap[cat];

    if (
      source.includes("疾病管制署") ||
      source.includes("疾管署")
    ) return "health";

    if (
      source.includes("食品藥物管理署") ||
      source.includes("食藥署")
    ) return "food";

    if (source.includes("中央氣象署")) return "weather";

    if (source.includes("台灣電力")) return "power";

    if (source.includes("自來水")) return "water";

    if (source.includes("勞工保險局")) return "pension";

    if (source.includes("健康保險署")) return "medical";

    if (
      source.includes("警政署") &&
      /詐騙|防詐|165/.test(title)
    ) return "fraud";

    if (/國民年金|勞保年金|老年年金|退休金/.test(title)) {
      return "pension";
    }

    if (/健保|就醫權益|部分負擔/.test(title)) {
      return "medical";
    }

    if (/長照|長者|高齡|老人福利|失智/.test(title)) {
      return "welfare";
    }

    if (/防詐|詐騙/.test(title)) return "fraud";

    if (source.includes("衛生福利部")) return "mohw";

    return "other";
  }

  function itemsAll() {
    if (!currentData || !Array.isArray(currentData.items)) {
      return [];
    }

    const seen = new Set();

    return currentData.items
      .filter(item => {
        if (!item || typeof item !== "object") return false;

        const url = safeUrl(item.url);
        if (!url || seen.has(url)) return false;

        seen.add(url);
        return true;
      })
      .sort((a, b) => {
        const at = dateOf(a.published_at)?.getTime() || 0;
        const bt = dateOf(b.published_at)?.getTime() || 0;
        return bt - at;
      })
      .slice(0, MAX_ITEMS);
  }

  function currentRegion() {
    const region = window.C?.rg;
    return typeof region === "string" && region.trim()
      ? region.trim()
      : "未設定";
  }

  function renderHeader(root) {
    root.appendChild(el("h3", "政府官方最新公告"));

    root.appendChild(el(
      "p",
      "目前設定地區：" + currentRegion() +
      "。目前尚未依所在地自動篩選停水、停電，請以官方影響範圍為準。"
    ));

    const controls = el("div");
    controls.style.cssText =
      "display:flex;flex-wrap:wrap;gap:8px;margin:14px 0";

    const minus = btn("字體 A−", () => changeFont(-1));
    minus.disabled = fontLevel === 1;

    const plus = btn("字體 A＋", () => changeFont(1));
    plus.disabled = fontLevel === 3;

    const refresh = btn(
      loading ? "更新中…" : "重新整理",
      () => window.bldN()
    );
    refresh.disabled = loading;

    controls.append(minus, plus, refresh);
    root.appendChild(controls);
  }

  function renderStatus(root) {
    const section = el("section");
    section.style.cssText = [
      "border:1px solid #999",
      "border-radius:12px",
      "padding:14px",
      "margin:14px 0",
      "line-height:1.7"
    ].join(";");

    let message = "尚未取得公告資料。";

    if (loading && !currentData) {
      message = "正在讀取官方公告…";
    } else if (fetchError && currentData) {
      message = "目前無法更新，正在顯示上次保存的公告。";
    } else if (fetchError) {
      message = "目前無法取得公告，仍可使用下方官方查詢入口。";
    } else if (currentData?.status === "partial") {
      message = "部分官方來源更新失敗，公告可能不完整。";
    } else if (currentData?.status === "not_configured") {
      message = "尚未設定自動公告來源。";
    } else if (currentData?.status === "ok") {
      const d = dateOf(currentData.generated_at);
      const age = d ? Date.now() - d.getTime() : Infinity;

      message = age >= 0 && age <= STALE_HOURS * 3600000
        ? "官方公告資料已更新。"
        : "公告資料可能延遲，請以官方網站為準。";
    }

    section.appendChild(el("strong", message));

    if (currentData?.generated_at) {
      section.appendChild(el(
        "p",
        "資料更新時間：" +
        formatDate(currentData.generated_at, true)
      ));
    }

    section.appendChild(el(
      "p",
      "自動公告每天整理一次；天氣、停水、停電及防詐資訊可能隨時改變。"
    ));

    root.appendChild(section);
  }

  function renderCategories(root, items) {
    const grid = el("section");
    grid.style.cssText = [
      "display:grid",
      "grid-template-columns:repeat(auto-fit,minmax(125px,1fr))",
      "gap:10px",
      "margin:18px 0"
    ].join(";");

    categories.forEach(cat => {
      const count = cat.id === "all"
        ? items.length
        : items.filter(item =>
            categoryFor(item) === cat.id
          ).length;

      const text = cat.name + "（" + count + "）";

      const control = btn(text, () => {
        activeCategory = cat.id;
        render();
      });

      const active = activeCategory === cat.id;

      control.setAttribute("aria-pressed", String(active));

      if (active) {
        control.style.borderWidth = "3px";
        control.style.fontWeight = "800";
      }

      grid.appendChild(control);
    });

    root.appendChild(grid);

    root.appendChild(el(
      "p",
      "括號數字代表已自動匯入的公告數量；即使顯示 0，也可以進入分類查看官方查詢入口。"
    ));
  }

  function renderCard(root, item) {
    const url = safeUrl(item.url);
    if (!url) return;

    const card = el("article", null, "nc gov");
    card.style.cssText = [
      "padding:18px",
      "border:1px solid #aaa",
      "border-radius:14px",
      "margin:14px 0",
      "line-height:1.75",
      "overflow-wrap:anywhere"
    ].join(";");

    const catId = categoryFor(item);
    const label = categories.find(x => x.id === catId);

    card.appendChild(el(
      "div",
      label?.name || String(item.category || "政府資訊"),
      "nb"
    ));

    const title = el(
      "h4",
      item.title || "官方公告",
      "nt"
    );

    title.style.cssText =
      "font-size:" + [19, 23, 27][fontLevel - 1] +
      "px;line-height:1.45;margin:10px 0";

    card.appendChild(title);

    card.appendChild(el(
      "p",
      "發布日期：" + formatDate(item.published_at)
    ));

    card.appendChild(el(
      "p",
      "來源：" + (item.source || "政府官方來源")
    ));

    const summary = String(item.summary || "").trim();

    if (summary) {
      const limit = 110;
      const preview = el(
        "p",
        summary.length > limit
          ? summary.slice(0, limit) + "…"
          : summary
      );

      card.appendChild(preview);

      if (summary.length > limit) {
        let expanded = false;

        const toggle = btn("展開更多內容", () => {
          expanded = !expanded;
          preview.textContent = expanded
            ? summary
            : summary.slice(0, limit) + "…";
          toggle.textContent = expanded
            ? "收合內容"
            : "展開更多內容";
          toggle.setAttribute(
            "aria-expanded",
            String(expanded)
          );
        });

        toggle.setAttribute("aria-expanded", "false");
        card.appendChild(toggle);
      }
    }

    const a = officialLink("閱讀官方完整公告 ↗", url);
    if (a) card.appendChild(a);

    root.appendChild(card);
  }

  function renderOfficialEntry(root, cat) {
    if (!cat?.url) return;

    const section = el("section");
    section.style.cssText = [
      "border:1px solid #aaa",
      "border-radius:14px",
      "padding:18px",
      "margin:18px 0",
      "line-height:1.75"
    ].join(";");

    section.appendChild(el(
      "h4",
      cat.name + "｜官方查詢"
    ));

    section.appendChild(el("p", cat.note));
    section.appendChild(el("p", "官方單位：" + cat.source));

    const a = officialLink(
      "前往官方網站查詢 ↗",
      cat.url
    );

    if (a) section.appendChild(a);

    section.appendChild(el(
      "p",
      "此處是官方查詢入口，不代表伴老友已取得該項目的最新資料。"
    ));

    root.appendChild(section);
  }

  function renderAllOfficialEntries(root) {
    const section = el("section");
    section.style.marginTop = "24px";

    section.appendChild(el("h3", "各類官方資訊入口"));
    section.appendChild(el(
      "p",
      "每個分類都可以前往對應的官方網站，查詢尚未自動匯入的資訊。"
    ));

    categories
      .filter(cat => cat.id !== "all")
      .forEach(cat => {
        const row = el("div");
        row.style.cssText =
          "padding:10px 0;border-bottom:1px solid #bbb";

        const a = officialLink(
          cat.name + "｜" + cat.source + " ↗",
          cat.url
        );

        if (a) row.appendChild(a);
        section.appendChild(row);
      });

    root.appendChild(section);
  }

  function render() {
    const root = document.getElementById("nlist");
    if (!root) return;

    root.replaceChildren();

    root.style.fontSize =
      [16, 19, 22][fontLevel - 1] + "px";
    root.style.lineHeight = "1.7";

    renderHeader(root);
    renderStatus(root);

    const all = itemsAll();
    renderCategories(root, all);

    const selected = categories.find(
      x => x.id === activeCategory
    ) || categories[0];

    const items = activeCategory === "all"
      ? all
      : all.filter(item =>
          categoryFor(item) === activeCategory
        );

    if (items.length) {
      root.appendChild(el(
        "h3",
        "已匯入公告：" + items.length + " 則"
      ));

      items.forEach(item => renderCard(root, item));
    } else {
      root.appendChild(el(
        "p",
        activeCategory === "all"
          ? "目前沒有可顯示的已匯入公告。"
          : "這個分類目前沒有已匯入的公告，請使用下方官方查詢入口。"
      ));
    }

    if (activeCategory === "all") {
      renderAllOfficialEntries(root);
    } else {
      renderOfficialEntry(root, selected);
    }
  }

  window.bldN = async function () {
    if (loading) return;

    loading = true;
    fetchError = false;
    render();

    const controller = new AbortController();
    const timer = setTimeout(
      () => controller.abort(),
      TIMEOUT_MS
    );

    try {
      const response = await fetch(
        DATA_URL + "?t=" + Date.now(),
        {
          cache: "no-store",
          signal: controller.signal
        }
      );

      if (!response.ok) {
        throw new Error("HTTP " + response.status);
      }

      const data = await response.json();

      if (
        !data ||
        typeof data !== "object" ||
        !Array.isArray(data.items)
      ) {
        throw new Error("公告 JSON 格式錯誤");
      }

      currentData = data;
      saveCache(data);
    } catch (error) {
      fetchError = true;
      console.warn("公告資料讀取失敗：", error);
    } finally {
      clearTimeout(timer);
      loading = false;
      render();
    }
  };

})();
