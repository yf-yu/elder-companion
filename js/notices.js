
/* 伴老友：官方最新公告 */
(function () {
  "use strict";

  const officialLinks = [
    ["停水公告", "https://www.water.gov.tw/"],
    ["停電查詢", "https://www.taipower.com.tw/"],
    ["防災示警", "https://alerts.ncdr.nat.gov.tw/"],
    ["天氣警特報", "https://www.cwa.gov.tw/"],
    ["防詐資訊", "https://165.npa.gov.tw/"]
  ];

  function safeUrl(value) {
    try {
      const url = new URL(value);
      const host = url.hostname.toLowerCase();

      if (url.protocol !== "https:") return null;

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

  function makeNode(tag, content, className) {
    const element = document.createElement(tag);

    if (className) {
      element.className = className;
    }

    if (content != null) {
      element.textContent = content;
    }

    return element;
  }

  function makeLink(text, url) {
    const link = makeNode("a", text);
    link.href = url;
    link.target = "_blank";
    link.rel = "noopener noreferrer";

    link.style.cssText = `
      display: inline-block;
      padding: 10px 0;
      margin-right: 12px;
      text-decoration: underline;
      font-weight: 600;
    `;

    return link;
  }

  function renderAnnouncements(data) {
    const container = document.getElementById("nlist");
    if (!container) return;

    container.replaceChildren();

    const region = window.C?.rg || "未設定";

    container.appendChild(
      makeNode(
        "p",
        "目前地區：" + region +
        "。請以官方公告確認實際影響範圍。"
      )
    );

    const updated = data.generated_at
      ? new Date(data.generated_at)
      : null;

    const validDate =
      updated && !Number.isNaN(updated.getTime());

    const age = validDate
      ? Date.now() - updated.getTime()
      : Infinity;

    const fresh =
  age >= 0 && age < 30 * 60 * 60 * 1000;

    const status =
      data.status === "ok" && fresh
        ? "資料已更新"
        : "資料可能延遲或尚未連接";

    container.appendChild(
      makeNode(
        "p",
        "資料狀態：" + status +
        "。更新時間：" +
        (validDate
          ? updated.toLocaleString("zh-TW")
          : "尚無") +
        "。本功能不是即時緊急警報。"
      )
    );

    const items = Array.isArray(data.items)
      ? data.items
      : [];

    if (items.length === 0) {
      container.appendChild(
        makeNode(
          "p",
          "目前沒有可顯示的已匯入公告，" +
          "不代表沒有停水、停電或災害。"
        )
      );
    }

    items.slice(0, 40).forEach(item => {
      const url = safeUrl(item.url);
      if (!url) return;

      const card = makeNode("article", null, "nc gov");

      card.appendChild(
        makeNode("div", item.title || "公告", "nt")
      );

      card.appendChild(
        makeNode(
          "div",
          (item.source || "官方來源") +
          " · " +
          (item.category || "政府資訊"),
          "nb"
        )
      );

      if (item.published_at) {
        const date = new Date(item.published_at);

        if (!Number.isNaN(date.getTime())) {
          card.appendChild(
            makeNode(
              "div",
              "發布：" + date.toLocaleString("zh-TW"),
              "nb"
            )
          );
        }
      }

      if (item.summary) {
        card.appendChild(
          makeNode(
            "div",
            String(item.summary).slice(0, 300),
            "nb"
          )
        );
      }

      card.appendChild(
        makeLink("閱讀官方公告 ↗", url)
      );

      container.appendChild(card);
    });

    const section = makeNode("section");

    section.appendChild(
      makeNode("h3", "直接查詢官方資訊")
    );

    officialLinks.forEach(([name, url]) => {
      section.appendChild(
        makeLink(name + " ↗", url)
      );
    });

    container.appendChild(section);
  }

  window.bldN = async function () {
    renderAnnouncements({
      status: "loading",
      items: []
    });

    const controller = new AbortController();
    const timer = setTimeout(
      () => controller.abort(),
      9000
    );

    try {
      const response = await fetch(
        "./data/announcements.json?t=" + Date.now(),
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
        document.getElementById("notice")
          ?.classList.contains("show")
      ) {
        renderAnnouncements(data);
      }

    } catch (error) {
      renderAnnouncements({
        status: "unavailable",
        items: []
      });

    } finally {
      clearTimeout(timer);
    }
  };
})();
