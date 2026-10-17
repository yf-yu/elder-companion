
/*
 * 伴老友｜最新公告 V7.6
 *
 * 每日官方公告
 * 九大分類
 * 長輩友善閱讀
 * 保留既有 window.bldN() 入口
 *
 * 不需要外部套件或付費服務。
 */

(function () {
  "use strict";

  const DATA_URL = "./data/announcements.json";
  const MAX_ITEMS = 40;
  const STALE_HOURS = 30;
  const TIMEOUT_MS = 9000;

  const FONT_KEY = "banlaoyou_notice_font";

  const categories = [
    {
      id: "all",
      name: "全部公告",
      keywords: []
    },
    {
      id: "health",
      name: "健康防疫",
      keywords: ["健康", "疫情", "防疫", "疾管"]
    },
    {
      id: "weather",
      name: "天氣預報",
      keywords: ["天氣", "氣象", "預報"]
    },
    {
      id: "power",
      name: "預定停電",
      keywords: ["停電", "電力"]
    },
    {
      id: "water",
      name: "預定停水",
      keywords: ["停水", "供水"]
    },
    {
      id: "welfare",
      name: "長者福利",
      keywords: ["長者福利", "老人福利", "長照", "補助"]
    },
    {
      id: "fraud",
      name: "防詐提醒",
      keywords: ["防詐", "詐騙"]
    },
    {
      id: "medical",
      name: "健保就醫",
      keywords: ["健保", "就醫"]
    },
    {
      id: "food",
      name: "食藥安全",
      keywords: ["食藥", "食品安全", "藥品"]
    },
    {
      id: "pension",
      name: "年金給付",
      keywords: ["年金", "退休", "給付"]
    }
  ];

  const officialLinks = [
    ["健康防疫", "疾病管制署", "https://www.cdc.gov.tw/"],
    ["天氣預報", "中央氣象署", "https://www.cwa.gov.tw/"],
    ["預定停電", "台灣電力公司", "https://www.taipower.com.tw/"],
    ["預定停水", "台灣自來水公司", "https://www.water.gov.tw/"],
    ["長者福利", "衛生福利部", "https://www.mohw.gov.tw/"],
    ["防詐提醒", "165 全民防騙網", "https://165.npa.gov.tw/"],
    ["健保就醫", "中央健康保險署", "https://www.nhi.gov.tw/"],
    ["食藥安全", "食品藥物管理署", "https://www.fda.gov.tw/"],
    ["年金給付", "勞工保險局", "https://www.bli.gov.tw/"]
  ];

  let currentData = null;
  let activeCategory = "all";
  let fontLevel = readFontLevel();
  let loading = false;

  // ==================================================
  // 工具
  // ==================================================

  function node(tag, text, className) {
    const el = document.createElement(tag);

    if (className) el.className = className;

    if (text !== null && text !== undefined) {
      el.textContent = String(text);
    }

    return el;
  }

  function button(text, callback) {
    const el = node("button", text);

    el.type = "button";

    el.style.cssText = [
      "min-height:44px",
      "padding:10px 14px",
      "border:1px solid #888",
      "border-radius:12px",
      "background:transparent",
      "color:inherit",
      "font:inherit",
      "cursor:pointer"
    ].join(";");

    el.addEventListener("click", callback);

    return el;
  }

  function safeUrl(value) {
    try {
      const url = new URL(value);

      const host = url.hostname
        .toLowerCase()
        .replace(/\.$/, "");

      if (url.protocol !== "https:") return null;
      if (url.username || url.password) return null;

      if (
        host.endsWith(".gov.tw") ||
        host === "www.taipower.com.tw"
      ) {
        return url.href;
      }

      return null;

    } catch {
      return null;
    }
  }

  function link(text, url) {
    const el = node("a", text);

    el.href = url;
    el.target = "_blank";
    el.rel = "noopener noreferrer";

    el.style.cssText = [
      "display:inline-flex",
      "align-items:center",
      "min-height:44px",
      "padding:8px 2px",
      "font-weight:700",
      "text-decoration:underline",
      "text-underline-offset:3px",
      "overflow-wrap:anywhere"
    ].join(";");

    return el;
  }

  function dateValue(value) {
    if (!value) return null;

    const d = new Date(value);

    return Number.isNaN(d.getTime()) ? null : d;
  }

  function formatDate(value, time = false) {
    const d = dateValue(value);

    if (!d) return "日期未提供";

    return new Intl.DateTimeFormat("zh-TW", {
      timeZone: "Asia/Taipei",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      ...(time
        ? {
            hour: "2-digit",
            minute: "2-digit",
            hour12: false
          }
        : {})
    }).format(d);
  }

  function readFontLevel() {
    try {
      const value = Number(
        localStorage.getItem(FONT_KEY)
      );

      if (
        Number.isInteger(value) &&
        value >= 1 &&
        value <= 3
      ) {
        return value;
      }
    } catch {}

    return 2;
  }

  function setFontLevel(value) {
    fontLevel = Math.max(1, Math.min(3, value));

    try {
      localStorage.setItem(
        FONT_KEY,
        String(fontLevel)
      );
    } catch {}

    render();
  }

  function fontSize() {
    return [16, 19, 22][fontLevel - 1];
  }

  function titleSize() {
    return [19, 23, 27][fontLevel - 1];
  }

  function currentRegion() {
    const value = window.C?.rg;

    return typeof value === "string" && value.trim()
      ? value.trim()
      : "未設定";
  }

  // ==================================================
  // 分類
  // ==================================================

  function categoryFor(item) {
    const category = String(item.category || "");
    const source = String(item.source || "");

    // 優先辨識資料來源及分類，
    // 避免一般新聞內提到其他詞就誤分類。
    if (
      source.includes("疾病管制署") ||
      category === "健康資訊"
    ) {
      return "health";
    }

    const text = category + " " + source;

    for (const group of categories) {
      if (group.id === "all") continue;

      if (
        group.keywords.some(keyword =>
          text.includes(keyword)
        )
      ) {
        return group.id;
      }
    }

    return "other";
  }

  function getItems() {
    const data = currentData;

    if (!data || !Array.isArray(data.items)) {
      return [];
    }

    const seen = new Set();

    return data.items
      .filter(item => {
        if (!item || typeof item !== "object") {
          return false;
        }

        const url = safeUrl(item.url);

        if (!url || seen.has(url)) {
          return false;
        }

        seen.add(url);
        return true;
      })
      .sort((a, b) => {
        const aTime =
          dateValue(a.published_at)?.getTime() || 0;

        const bTime =
          dateValue(b.published_at)?.getTime() || 0;

        return bTime - aTime;
      })
      .slice(0, MAX_ITEMS);
  }

  // ==================================================
  // 頁面
  // ==================================================

  function renderHeader(container) {
    const heading = node(
      "h3",
      "政府官方最新公告"
    );

    container.appendChild(heading);

    const region = node(
      "p",
      "目前設定地區：" + currentRegion() +
      "。全國性公告均可查看；" +
      "地方資訊請以官方公告的影響範圍為準。"
    );

    container.appendChild(region);

    const controls = node("div");

    controls.style.cssText = [
      "display:flex",
      "flex-wrap:wrap",
      "gap:8px",
      "margin:14px 0"
    ].join(";");

    const smaller = button("字體 A−", () => {
      setFontLevel(fontLevel - 1);
    });

    smaller.disabled = fontLevel === 1;

    const larger = button("字體 A＋", () => {
      setFontLevel(fontLevel + 1);
    });

    larger.disabled = fontLevel === 3;

    const refresh = button("重新整理", () => {
      window.bldN();
    });

    refresh.disabled = loading;

    controls.append(smaller, larger, refresh);

    container.appendChild(controls);
  }

  function renderStatus(container) {
    const data = currentData;

    const status = node("section");

    status.style.cssText = [
      "border:1px solid #999",
      "border-radius:12px",
      "padding:14px",
      "margin:14px 0",
      "line-height:1.7"
    ].join(";");

    let message = "尚未取得公告資料";

    if (loading && !data) {
      message = "正在讀取官方公告…";

    } else if (data?.status === "unavailable") {
      message = "目前無法取得最新公告，請稍後再試。";

    } else if (data?.status === "not_configured") {
      message = "尚未設定官方公告來源。";

    } else if (data?.status === "partial") {
      message = "部分官方來源更新失敗，公告可能不完整。";

    } else if (data?.status === "ok") {
      const updated = dateValue(data.generated_at);

      if (updated) {
        const age = Date.now() - updated.getTime();

        message =
          age >= 0 &&
          age <= 30 * 60 * 60 * 1000
            ? "官方公告資料已更新"
            : "公告資料可能延遲，請以官方網站為準。";
      } else {
        message = "公告更新時間未提供。";
      }
    }

    status.appendChild(node("strong", message));

    if (data?.generated_at) {
      status.appendChild(
        node(
          "p",
          "資料更新時間：" +
          formatDate(data.generated_at, true)
        )
      );
    }

    status.appendChild(
      node(
        "p",
        "本頁每天整理一次公告，" +
        "不是即時緊急警報。"
      )
    );

    container.appendChild(status);
  }

  function renderCategories(container, items) {
    const section = node("section");

    section.style.cssText = [
      "display:grid",
      "grid-template-columns:repeat(auto-fit,minmax(120px,1fr))",
      "gap:10px",
      "margin:18px 0"
    ].join(";");

    categories.forEach(group => {
      const count = group.id === "all"
        ? items.length
        : items.filter(item =>
            categoryFor(item) === group.id
          ).length;

      const el = button(
        group.name + "（" + count + "）",
        () => {
          activeCategory = group.id;
          render();
        }
      );

      el.setAttribute(
        "aria-pressed",
        String(activeCategory === group.id)
      );

      if (activeCategory === group.id) {
        el.style.borderWidth = "2px";
        el.style.fontWeight = "800";
      }

      section.appendChild(el);
    });

    container.appendChild(section);
  }

  function renderCard(container, item) {
    const url = safeUrl(item.url);

    if (!url) return;

    const card = node("article", null, "nc gov");

    card.style.cssText = [
      "padding:18px",
      "border:1px solid #aaa",
      "border-radius:14px",
      "margin:14px 0",
      "line-height:1.75",
      "overflow-wrap:anywhere"
    ].join(";");

    const label = categories.find(
      group => group.id === categoryFor(item)
    )?.name || item.category || "政府資訊";

    card.appendChild(
      node("div", label, "nb")
    );

    const title = node(
      "h4",
      item.title || "官方公告",
      "nt"
    );

    title.style.cssText =
      "font-size:" + titleSize() + "px;" +
      "line-height:1.45;margin:10px 0";

    card.appendChild(title);

    card.appendChild(
      node(
        "p",
        "發布日期：" +
        formatDate(item.published_at)
      )
    );

    card.appendChild(
      node(
        "p",
        "來源：" +
        (item.source || "政府官方來源")
      )
    );

    const summary = String(
      item.summary || ""
    ).trim();

    if (summary) {
      const limit = 100;

      const preview = node(
        "p",
        summary.length > limit
          ? summary.slice(0, limit) + "…"
          : summary
      );

      card.appendChild(preview);

      if (summary.length > limit) {
        let expanded = false;

        const toggle = button(
          "展開更多內容",
          () => {
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
          }
        );

        toggle.setAttribute(
          "aria-expanded",
          "false"
        );

        card.appendChild(toggle);
      }
    }

    card.appendChild(
      link("閱讀官方完整公告 ↗", url)
    );

    container.appendChild(card);
  }

  function renderOfficialLinks(container) {
    const section = node("section");

    section.style.marginTop = "24px";

    section.appendChild(
      node("h3", "官方資訊查詢")
    );

    section.appendChild(
      node(
        "p",
        "尚未自動串接的類別，" +
        "仍可透過以下官方網站查詢。"
      )
    );

    officialLinks.forEach(([category, name, url]) => {
      const row = node("div");

      row.style.cssText = [
        "padding:10px 0",
        "border-bottom:1px solid #bbb"
      ].join(";");

      row.appendChild(
        link(category + "｜" + name + " ↗", url)
      );

      section.appendChild(row);
    });

    container.appendChild(section);
  }

  function render() {
    const container = document.getElementById("nlist");

    if (!container) return;

    container.replaceChildren();

    container.style.fontSize = fontSize() + "px";
    container.style.lineHeight = "1.7";

    renderHeader(container);
    renderStatus(container);

    const allItems = getItems();

    renderCategories(container, allItems);

    const items = activeCategory === "all"
      ? allItems
      : allItems.filter(item =>
          categoryFor(item) === activeCategory
        );

    if (items.length) {
      container.appendChild(
        node(
          "h3",
          "目前顯示 " + items.length + " 則公告"
        )
      );

      items.forEach(item => {
        renderCard(container, item);
      });

    } else {
      const selected = categories.find(
        group => group.id === activeCategory
      );

      const message =
        activeCategory === "all"
          ? "目前沒有可顯示的已匯入公告，" +
            "不代表沒有停水、停電或其他生活影響。"
          : selected.name +
            "目前沒有已匯入的公告。" +
            "可能尚未串接資料來源，" +
            "不代表沒有相關公告。";

      container.appendChild(
        node("p", message)
      );
    }

    renderOfficialLinks(container);
  }

  // ==================================================
  // 讀取資料
  // ==================================================

  window.bldN = async function () {
    if (loading) return;

    loading = true;

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
        throw new Error(
          "HTTP " + response.status
        );
      }

      const data = await response.json();

      if (
        !data ||
        typeof data !== "object" ||
        !Array.isArray(data.items)
      ) {
        throw new Error(
          "公告 JSON 格式錯誤"
        );
      }

      currentData = data;

    } catch (error) {
      console.warn(
        "公告資料讀取失敗：",
        error
      );

      if (currentData) {
        currentData = {
          ...currentData,
          status: "unavailable"
        };
      } else {
        currentData = {
          status: "unavailable",
          items: []
        };
      }

    } finally {
      clearTimeout(timer);
      loading = false;
      render();
    }
  };

})();
