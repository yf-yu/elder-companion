(function () {
  "use strict";

  const DATA_URL = "./data/announcements.json";

  const MAX_ITEMS = 40;
  const STALE_HOURS = 30;
  const FETCH_TIMEOUT = 9000;

  const FONT_STORAGE_KEY = "banlaoyou_notice_font";

  const FONT_MIN = 1;
  const FONT_MAX = 3;

  const officialLinks = [
    {
      name: "停水公告",
      description: "查詢自來水相關公告",
      url: "https://www.water.gov.tw/"
    },
    {
      name: "停電查詢",
      description: "查詢台電停電資訊",
      url: "https://www.taipower.com.tw/"
    },
    {
      name: "防災示警",
      description: "查詢政府防災示警",
      url: "https://alerts.ncdr.nat.gov.tw/"
    },
    {
      name: "天氣警特報",
      description: "查詢中央氣象署警特報",
      url: "https://www.cwa.gov.tw/"
    },
    {
      name: "防詐資訊",
      description: "查詢官方防詐資訊",
      url: "https://165.npa.gov.tw/"
    }
  ];

  let currentData = null;
  let loading = false;
  let requestNumber = 0;

  let fontLevel = readFontLevel();

  // --------------------------------------------------
  // 基本工具
  // --------------------------------------------------

  function makeNode(tag, content, className) {
    const element = document.createElement(tag);

    if (className) {
      element.className = className;
    }

    if (content !== null && content !== undefined) {
      element.textContent = String(content);
    }

    return element;
  }

  function makeButton(text, onClick) {
    const button = makeNode("button", text);

    button.type = "button";

    button.addEventListener("click", onClick);

    button.style.cssText = [
      "min-height:44px",
      "padding:10px 14px",
      "border:1px solid #777",
      "border-radius:10px",
      "background:transparent",
      "color:inherit",
      "font:inherit",
      "font-weight:600",
      "cursor:pointer"
    ].join(";");

    return button;
  }

  function makeLink(text, url) {
    const link = makeNode("a", text);

    link.href = url;
    link.target = "_blank";
    link.rel = "noopener noreferrer";

    link.style.cssText = [
      "display:inline-flex",
      "align-items:center",
      "min-height:44px",
      "padding:8px 2px",
      "text-decoration:underline",
      "text-underline-offset:3px",
      "font-weight:700",
      "overflow-wrap:anywhere"
    ].join(";");

    return link;
  }

  function setStyles(element, styles) {
    Object.assign(element.style, styles);
    return element;
  }

  function safeUrl(value) {
    try {
      const url = new URL(value);

      if (url.protocol !== "https:") {
        return null;
      }

      if (url.username || url.password) {
        return null;
      }

      const host = url.hostname
        .toLowerCase()
        .replace(/\.$/, "");

      const official =
        host.endsWith(".gov.tw") ||
        host === "www.taipower.com.tw";

      return official ? url.href : null;

    } catch {
      return null;
    }
  }

  function parseDate(value) {
    if (!value) return null;

    const date = new Date(value);

    return Number.isNaN(date.getTime())
      ? null
      : date;
  }

  function formatDate(value, withTime = false) {
    const date = parseDate(value);

    if (!date) {
      return "日期未提供";
    }

    return new Intl.DateTimeFormat("zh-TW", {
      timeZone: "Asia/Taipei",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      ...(withTime
        ? {
            hour: "2-digit",
            minute: "2-digit",
            hour12: false
          }
        : {})
    }).format(date);
  }

  function taiwanDayNumber(date) {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: "Asia/Taipei",
      year: "numeric",
      month: "2-digit",
      day: "2-digit"
    }).formatToParts(date);

    const values = {};

    parts.forEach(part => {
      if (part.type !== "literal") {
        values[part.type] = Number(part.value);
      }
    });

    return Math.floor(
      Date.UTC(
        values.year,
        values.month - 1,
        values.day
      ) / 86400000
    );
  }

  function relativeDate(value) {
    const date = parseDate(value);

    if (!date) {
      return "發布日期未提供";
    }

    const days =
      taiwanDayNumber(new Date()) -
      taiwanDayNumber(date);

    if (days === 0) return "今天發布";
    if (days === 1) return "昨天發布";

    if (days > 1 && days <= 6) {
      return days + " 天前發布";
    }

    return formatDate(value) + " 發布";
  }

  function readFontLevel() {
    try {
      const value = Number(
        localStorage.getItem(FONT_STORAGE_KEY)
      );

      if (
        Number.isInteger(value) &&
        value >= FONT_MIN &&
        value <= FONT_MAX
      ) {
        return value;
      }

    } catch {
      // 無痕模式或儲存空間停用時使用預設值
    }

    return 2;
  }

  function saveFontLevel(level) {
    fontLevel = Math.max(
      FONT_MIN,
      Math.min(FONT_MAX, level)
    );

    try {
      localStorage.setItem(
        FONT_STORAGE_KEY,
        String(fontLevel)
      );
    } catch {
      // 儲存失敗不影響閱讀
    }

    applyFontLevel();
  }

  function applyFontLevel() {
    const container = document.getElementById("nlist");

    if (!container) return;

    const sizes = {
      1: {
        body: "16px",
        title: "19px"
      },
      2: {
        body: "19px",
        title: "23px"
      },
      3: {
        body: "22px",
        title: "27px"
      }
    };

    const size = sizes[fontLevel];

    container.style.setProperty(
      "--notice-body-size",
      size.body
    );

    container.style.setProperty(
      "--notice-title-size",
      size.title
    );
  }

  // --------------------------------------------------
  // 標題與操作工具
  // --------------------------------------------------

  function makeHeader(container) {
    const header = makeNode("div");

    setStyles(header, {
      display: "flex",
      flexWrap: "wrap",
      gap: "12px",
      justifyContent: "space-between",
      alignItems: "center",
      marginBottom: "16px"
    });

    const heading = makeNode(
      "h3",
      "政府官方最新公告"
    );

    heading.style.margin = "0";

    header.appendChild(heading);

    const controls = makeNode("div");

    setStyles(controls, {
      display: "flex",
      flexWrap: "wrap",
      gap: "8px"
    });

    const smaller = makeButton("字體 A−", () => {
      saveFontLevel(fontLevel - 1);
      updateFontButtons();
    });

    smaller.dataset.noticeControl = "smaller";

    const larger = makeButton("字體 A＋", () => {
      saveFontLevel(fontLevel + 1);
      updateFontButtons();
    });

    larger.dataset.noticeControl = "larger";

    const refresh = makeButton("重新整理", () => {
      window.bldN();
    });

    refresh.dataset.noticeControl = "refresh";

    controls.append(
      smaller,
      larger,
      refresh
    );

    header.appendChild(controls);

    container.appendChild(header);

    updateFontButtons();
  }

  function updateFontButtons() {
    const container = document.getElementById("nlist");

    if (!container) return;

    const smaller = container.querySelector(
      '[data-notice-control="smaller"]'
    );

    const larger = container.querySelector(
      '[data-notice-control="larger"]'
    );

    const refresh = container.querySelector(
      '[data-notice-control="refresh"]'
    );

    if (smaller) {
      smaller.disabled = fontLevel <= FONT_MIN;
    }

    if (larger) {
      larger.disabled = fontLevel >= FONT_MAX;
    }

    if (refresh) {
      refresh.disabled = loading;
      refresh.textContent = loading
        ? "更新中…"
        : "重新整理";
    }
  }

  // --------------------------------------------------
  // 狀態資訊
  // --------------------------------------------------

  function getStatus(data) {
    if (data.status === "loading") {
      return {
        title: "正在讀取官方公告",
        detail: "請稍候，正在取得最新資料。"
      };
    }

    if (data.status === "unavailable") {
      return {
        title: "目前無法取得公告資料",
        detail:
          "可能是網路中斷或資料暫時無法讀取。" +
          "請稍後重新整理，並可使用下方官方查詢連結。"
      };
    }

    if (data.status === "not_configured") {
      return {
        title: "官方公告來源尚未設定",
        detail:
          "目前尚未完成自動公告來源設定，" +
          "請使用下方官方查詢連結。"
      };
    }

    const updated = parseDate(data.generated_at);

    if (!updated) {
      return {
        title: "公告更新時間未提供",
        detail: "無法確認這批公告的更新時間。"
      };
    }

    const age = Date.now() - updated.getTime();

    const stale =
      age < -10 * 60 * 1000 ||
      age > STALE_HOURS * 60 * 60 * 1000;

    if (data.status === "partial") {
      return {
        title: "部分公告來源更新失敗",
        detail:
          "目前仍可閱讀已取得的公告，" +
          "但內容可能不完整。"
      };
    }

    if (stale) {
      return {
        title: "公告資料可能延遲",
        detail:
          "已超過預期更新時間，" +
          "請以官方網站最新資訊為準。"
      };
    }

    if (data.status === "ok") {
      return {
        title: "官方公告資料已更新",
        detail:
          "資料依每日排程更新，" +
          "不是即時緊急警報。"
      };
    }

    return {
      title: "公告資料狀態尚未確認",
      detail: "請以官方網站資訊為準。"
    };
  }

  function makeStatusSection(container, data) {
    const status = getStatus(data);

    const section = makeNode("section");

    setStyles(section, {
      padding: "16px",
      border: "1px solid #999",
      borderRadius: "12px",
      marginBottom: "18px",
      fontSize: "var(--notice-body-size)"
    });

    const title = makeNode(
      "p",
      status.title
    );

    title.style.fontWeight = "700";
    title.style.margin = "0 0 8px";

    const detail = makeNode(
      "p",
      status.detail
    );

    detail.style.margin = "0";

    section.append(title, detail);

    if (data.generated_at) {
      const updated = makeNode(
        "p",
        "資料更新時間：" +
        formatDate(data.generated_at, true)
      );

      updated.style.margin = "10px 0 0";

      section.appendChild(updated);
    }

    container.appendChild(section);
  }

  // --------------------------------------------------
  // 公告卡片
  // --------------------------------------------------

  function makeAnnouncementCard(item) {
    const url = safeUrl(item.url);

    if (!url) return null;

    const card = makeNode(
      "article",
      null,
      "nc gov"
    );

    setStyles(card, {
      padding: "18px",
      marginBottom: "16px",
      border: "1px solid #aaa",
      borderRadius: "14px",
      fontSize: "var(--notice-body-size)",
      lineHeight: "1.75",
      overflowWrap: "anywhere"
    });

    const category = makeNode(
      "div",
      item.category || "政府資訊",
      "nb"
    );

    category.style.fontWeight = "700";

    const title = makeNode(
      "h4",
      item.title || "官方公告",
      "nt"
    );

    setStyles(title, {
      margin: "10px 0",
      fontSize: "var(--notice-title-size)",
      lineHeight: "1.45"
    });

    const date = makeNode(
      "p",
      relativeDate(item.published_at)
    );

    date.style.margin = "6px 0";

    const source = makeNode(
      "p",
      "資料來源：" +
      (item.source || "政府官方來源")
    );

    source.style.margin = "6px 0 12px";

    card.append(
      category,
      title,
      date,
      source
    );

    const summary = String(
      item.summary || ""
    ).trim();

    if (summary) {
      const previewLength = 100;

      const preview = makeNode(
        "p",
        summary.length > previewLength
          ? summary.slice(0, previewLength) + "…"
          : summary,
        "nb"
      );

      preview.style.margin = "10px 0";

      card.appendChild(preview);

      if (summary.length > previewLength) {
        let expanded = false;

        const toggle = makeButton(
          "展開更多內容",
          () => {
            expanded = !expanded;

            preview.textContent = expanded
              ? summary
              : summary.slice(0, previewLength) + "…";

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

    const footer = makeNode("div");

    footer.style.marginTop = "12px";

    footer.appendChild(
      makeLink("閱讀官方完整公告 ↗", url)
    );

    card.appendChild(footer);

    return card;
  }

  function normalizeItems(data) {
    if (!Array.isArray(data.items)) {
      return [];
    }

    const seen = new Set();

    return data.items
      .filter(item => {
        if (
          !item ||
          typeof item !== "object" ||
          !safeUrl(item.url)
        ) {
          return false;
        }

        if (seen.has(item.url)) {
          return false;
        }

        seen.add(item.url);
        return true;
      })
      .sort((a, b) => {
        const dateA = parseDate(a.published_at);
        const dateB = parseDate(b.published_at);

        return (
          (dateB ? dateB.getTime() : 0) -
          (dateA ? dateA.getTime() : 0)
        );
      })
      .slice(0, MAX_ITEMS);
  }

  // --------------------------------------------------
  // 官方查詢入口
  // --------------------------------------------------

  function makeOfficialLinks(container) {
    const section = makeNode("section");

    section.style.marginTop = "24px";

    const heading = makeNode(
      "h3",
      "直接查詢官方資訊"
    );

    section.appendChild(heading);

    const intro = makeNode(
      "p",
      "停水、停電、天氣及防災資訊可能隨時變動。" +
      "請直接查詢官方網站，" +
      "不要只依賴每日更新的公告。"
    );

    intro.style.fontSize =
      "var(--notice-body-size)";

    section.appendChild(intro);

    officialLinks.forEach(item => {
      const row = makeNode("div");

      setStyles(row, {
        padding: "12px 0",
        borderBottom: "1px solid #bbb",
        fontSize: "var(--notice-body-size)"
      });

      const link = makeLink(
        item.name + " ↗",
        item.url
      );

      const description = makeNode(
        "div",
        item.description
      );

      description.style.opacity = "0.85";

      row.append(link, description);

      section.appendChild(row);
    });

    container.appendChild(section);
  }

  // --------------------------------------------------
  // 頁面渲染
  // --------------------------------------------------

  function renderAnnouncements(data) {
    const container = document.getElementById("nlist");

    if (!container) return;

    container.replaceChildren();

    applyFontLevel();

    makeHeader(container);

    const region = window.C?.rg || "未設定";

    const regionText = makeNode(
      "p",
      "目前設定地區：" + region +
      "。以下公告不一定只與此地區有關，" +
      "請以官方公告確認影響範圍。"
    );

    regionText.style.fontSize =
      "var(--notice-body-size)";

    container.appendChild(regionText);

    makeStatusSection(container, data);

    const items = normalizeItems(data);

    if (items.length > 0) {
      const count = makeNode(
        "h3",
        "已取得 " + items.length + " 則官方公告"
      );

      container.appendChild(count);

      items.forEach(item => {
        const card = makeAnnouncementCard(item);

        if (card) {
          container.appendChild(card);
        }
      });

    } else if (data.status !== "loading") {
      const empty = makeNode(
        "p",
        "目前沒有可顯示的已匯入公告。" +
        "這不代表沒有停水、停電、疫情或災害。"
      );

      empty.style.fontSize =
        "var(--notice-body-size)";

      container.appendChild(empty);
    }

    makeOfficialLinks(container);

    const note = makeNode(
      "p",
      "提醒：本頁提供官方公告整理，" +
      "不提供即時緊急警報。遇到緊急危險，" +
      "請依當地政府及相關單位指示處理。"
    );

    setStyles(note, {
      marginTop: "24px",
      fontSize: "var(--notice-body-size)",
      lineHeight: "1.7"
    });

    container.appendChild(note);

    updateFontButtons();
  }

  // --------------------------------------------------
  // 資料讀取
  // --------------------------------------------------

  window.bldN = async function () {
    if (loading) return;

    loading = true;

    const thisRequest = ++requestNumber;

    if (currentData) {
      renderAnnouncements(currentData);
    } else {
      renderAnnouncements({
        status: "loading",
        items: []
      });
    }

    const controller = new AbortController();

    const timer = setTimeout(
      () => controller.abort(),
      FETCH_TIMEOUT
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
          "公告資料格式不正確"
        );
      }

      if (thisRequest !== requestNumber) {
        return;
      }

      currentData = data;

      renderAnnouncements(data);

    } catch (error) {
      console.warn(
        "伴老友公告讀取失敗：",
        error
      );

      if (currentData) {
        renderAnnouncements({
          ...currentData,
          status: "unavailable"
        });
      } else {
        renderAnnouncements({
          status: "unavailable",
          items: []
        });
      }

    } finally {
      clearTimeout(timer);

      loading = false;

      updateFontButtons();
    }
  };

})();
