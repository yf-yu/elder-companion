
import json
import re
import sys
import html
import ipaddress

from pathlib import Path
from datetime import datetime, timezone, timedelta
from email.utils import parsedate_to_datetime
from urllib.request import (
    Request,
    urlopen,
    build_opener,
    HTTPRedirectHandler,
)
from urllib.parse import urlparse, urljoin
from xml.etree import ElementTree as ET


# ============================================================
# 基本設定
# ============================================================

ROOT = Path(__file__).resolve().parents[1]

SOURCES_FILE = ROOT / "data" / "sources.json"
OUTPUT_FILE = ROOT / "data" / "announcements.json"

MAX_ITEMS = 40
MAX_ITEMS_PER_SOURCE = 40
MAX_SUMMARY_LENGTH = 280
MAX_DOWNLOAD_BYTES = 2 * 1024 * 1024

REQUEST_TIMEOUT = 20

TAIWAN_TZ = timezone(timedelta(hours=8))

USER_AGENT = (
    "BanLaoYou-OfficialNotices/1.0 "
    "(Public government RSS reader)"
)


# ============================================================
# 時間處理
# ============================================================

def utc_now():
    return datetime.now(timezone.utc)


def normalize_datetime(dt):
    """將 datetime 轉成 UTC ISO 8601。"""

    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=TAIWAN_TZ)

    return dt.astimezone(timezone.utc).isoformat()


def parse_date(value):
    """
    支援 RSS、Atom、ISO 8601、台灣常見日期格式。

    無法解析時回傳 None，不猜測日期。
    """

    if not value:
        return None

    value = str(value).strip()

    if not value:
        return None

    # 1. RSS 標準日期，例如：
    # Tue, 13 Oct 2026 10:00:00 +0800
    try:
        dt = parsedate_to_datetime(value)
        if dt:
            return normalize_datetime(dt)
    except (ValueError, TypeError, OverflowError):
        pass

    # 2. ISO 8601，例如：
    # 2026-10-13T10:00:00+08:00
    # 2026-10-13T02:00:00Z
    try:
        dt = datetime.fromisoformat(
            value.replace("Z", "+00:00")
        )
        return normalize_datetime(dt)
    except (ValueError, TypeError, OverflowError):
        pass

    # 3. 常見日期格式
    formats = [
        "%Y-%m-%d %H:%M:%S",
        "%Y/%m/%d %H:%M:%S",
        "%Y-%m-%d %H:%M",
        "%Y/%m/%d %H:%M",
        "%Y-%m-%d",
        "%Y/%m/%d",
        "%Y-%m-%d",
        "%Y/%m/%d",
        "%Y.%m.%d",
    ]

    for fmt in formats:
        try:
            dt = datetime.strptime(value, fmt)
            return normalize_datetime(dt)
        except ValueError:
            continue

    # 4. 民國日期，例如：115/10/13
    match = re.fullmatch(
        r"(\d{2,3})[/-](\d{1,2})[/-](\d{1,2})",
        value
    )

    if match:
        try:
            year = int(match.group(1)) + 1911
            month = int(match.group(2))
            day = int(match.group(3))

            dt = datetime(
                year, month, day,
                tzinfo=TAIWAN_TZ
            )

            return normalize_datetime(dt)
        except ValueError:
            pass

    return None


# ============================================================
# 文字處理
# ============================================================

def clean_text(value):
    """移除 HTML 標籤、解碼 HTML 實體、整理空白。"""

    if value is None:
        return ""

    text = str(value)

    text = re.sub(
        r"(?is)<(script|style)\b[^>]*>.*?</\1\s*>",
        " ",
        text
    )

    text = re.sub(r"(?s)<[^>]+>", " ", text)

    text = html.unescape(text)

    text = re.sub(r"\s+", " ", text)

    return text.strip()


def shorten_text(value, limit=MAX_SUMMARY_LENGTH):
    """限制摘要長度，避免公告頁過度冗長。"""

    text = clean_text(value)

    if len(text) <= limit:
        return text

    return text[:limit].rstrip() + "…"


# ============================================================
# 網址安全檢查
# ============================================================

def is_official_url(value):
    """
    只接受 HTTPS 的 .gov.tw 網址。

    注意：
    此檢查用於政府來源白名單。
    """

    if not isinstance(value, str):
        return False

    try:
        parsed = urlparse(value.strip())

        if parsed.scheme.lower() != "https":
            return False

        if parsed.username or parsed.password:
            return False

        host = (parsed.hostname or "").lower().rstrip(".")

        if not host.endswith(".gov.tw"):
            return False

        # 排除 IP 形式主機
        try:
            ipaddress.ip_address(host)
            return False
        except ValueError:
            pass

        if not host:
            return False

        # 不允許非標準 HTTPS 連接埠
        if parsed.port not in (None, 443):
            return False

        return True

    except (ValueError, TypeError):
        return False


class SafeRedirectHandler(HTTPRedirectHandler):
    """每次 HTTP 轉址都重新檢查官方網域。"""

    def redirect_request(
        self,
        req,
        fp,
        code,
        msg,
        headers,
        newurl
    ):
        target = urljoin(req.full_url, newurl)

        if not is_official_url(target):
            raise ValueError(
                "RSS 轉址到非官方或不安全網址："
                + target
            )

        return super().redirect_request(
            req,
            fp,
            code,
            msg,
            headers,
            target
        )


# ============================================================
# XML 處理
# ============================================================

def local_name(tag):
    """移除 XML namespace 前綴。"""

    return str(tag).split("}")[-1].split(":")[-1].lower()


def find_child(element, names):
    """尋找指定名稱的直接子元素。"""

    targets = {name.lower() for name in names}

    for child in element:
        if local_name(child.tag) in targets:
            return child

    return None


def find_text(element, names):
    """讀取指定 XML 欄位的文字。"""

    child = find_child(element, names)

    if child is None:
        return ""

    return "".join(child.itertext()).strip()


def find_date(element):
    """
    依常見 RSS / Atom 欄位讀取發布日期。

    只讀取 XML 內明確存在的日期，不從文章內容猜測。
    """

    date_fields = [
        "pubDate",
        "published",
        "publishedDate",
        "publicationDate",
        "date",
        "issued",
        "created",
        "updated",
        "modified",
        "lastBuildDate",
    ]

    for field in date_fields:
        raw = find_text(element, [field])

        if raw:
            parsed = parse_date(raw)

            if parsed:
                return parsed

    return None


def find_link(element, feed_url):
    """RSS/Atom 連結；兼容 CDATA、相對網址、guid 與文字連結。"""
    for child in element:
        if local_name(child.tag) != "link":
            continue
        href = child.attrib.get("href", "").strip()
        rel = child.attrib.get("rel", "alternate").lower()
        raw = href or "".join(child.itertext()).strip()
        if raw and rel in ("alternate", ""):
            return urljoin(feed_url, html.unescape(raw))

    # 有些政府 RSS 將文章網址放在 guid/id 中
    for field in ("guid", "id"):
        raw = find_text(element, [field]).strip()
        if raw.startswith(("https://", "http://", "/")):
            return urljoin(feed_url, html.unescape(raw))
    return ""


def parse_feed(xml_data, source):
    """解析 RSS/Atom，並回傳公告與診斷資訊。"""
    root = ET.fromstring(xml_data)
    source_name = clean_text(source.get("name", "官方公告"))
    category = clean_text(source.get("category", "政府資訊"))
    feed_url = source["url"]

    entries = [element for element in root.iter()
               if local_name(element.tag) in ("item", "entry")]
    results = []
    missing_title = 0
    rejected_link = 0
    examples = []

    for entry in entries[:MAX_ITEMS_PER_SOURCE]:
        title = clean_text(find_text(entry, ["title"]))
        url = find_link(entry, feed_url)
        if not title:
            missing_title += 1
            continue
        if not is_official_url(url):
            rejected_link += 1
            if len(examples) < 2:
                # 僅輸出網址供診斷，不抓取或開啟文章連結
                examples.append(url[:180] or "(空連結)")
            continue
        summary = find_text(entry, [
            "description", "summary", "content", "encoded", "subtitle"
        ])
        results.append({
            "title": title,
            "url": url,
            "summary": shorten_text(summary),
            "source": source_name,
            "category": category,
            "published_at": find_date(entry),
        })

    diagnostics = {
        "root": local_name(root.tag),
        "entries": len(entries),
        "missing_title": missing_title,
        "rejected_link": rejected_link,
        "examples": examples,
    }
    return results, diagnostics


# ============================================================
# 下載官方 RSS
# ============================================================

def download_feed(url):
    """下載官方 RSS，限制大小與等待時間。"""

    if not is_official_url(url):
        raise ValueError(
            "不是允許的官方 HTTPS 網址：" + str(url)
        )

    request = Request(
        url,
        headers={
            "User-Agent": USER_AGENT,
            "Accept": (
                "application/rss+xml,"
                "application/atom+xml,"
                "application/xml,"
                "text/xml,"
                "*/*"
            ),
        }
    )

    opener = build_opener(SafeRedirectHandler())

    with opener.open(
        request,
        timeout=REQUEST_TIMEOUT
    ) as response:

        final_url = response.geturl()

        if not is_official_url(final_url):
            raise ValueError(
                "最終網址不是官方網址：" + final_url
            )

        content = response.read(
            MAX_DOWNLOAD_BYTES + 1
        )

        if len(content) > MAX_DOWNLOAD_BYTES:
            raise ValueError(
                "RSS 檔案超過大小限制"
            )

        return content


# ============================================================
# 讀取設定
# ============================================================

def load_sources():

    if not SOURCES_FILE.exists():
        raise FileNotFoundError(
            "找不到 data/sources.json"
        )

    with SOURCES_FILE.open(
        "r",
        encoding="utf-8"
    ) as file:
        data = json.load(file)

    sources = data.get("sources", [])

    if not isinstance(sources, list):
        raise ValueError(
            "sources.json 的 sources 必須是陣列"
        )

    validated = []

    for index, source in enumerate(sources, start=1):

        if not isinstance(source, dict):
            raise ValueError(
                f"第 {index} 個資料來源格式錯誤"
            )

        url = source.get("url", "")

        if not is_official_url(url):
            raise ValueError(
                f"第 {index} 個資料來源網址不安全：{url}"
            )

        validated.append({
            "name": clean_text(
                source.get("name", "官方公告")
            ),
            "category": clean_text(
                source.get("category", "政府資訊")
            ),
            "url": url.strip(),
        })

    return validated


# ============================================================
# 公告整理
# ============================================================

def deduplicate(items):
    """依公告網址去除重複資料。"""

    seen = set()
    result = []

    for item in items:

        url = item.get("url", "")

        if url in seen:
            continue

        seen.add(url)
        result.append(item)

    return result


def sort_items(items):
    """
    有發布日期的公告優先依新到舊排序。
    無日期公告保留 RSS 原始順序，放在後面。
    """

    def sort_key(item):

        published = item.get("published_at")

        if published:
            try:
                timestamp = datetime.fromisoformat(
                    published
                ).timestamp()

                return (1, timestamp)

            except (ValueError, TypeError):
                pass

        return (0, 0)

    return sorted(
        items,
        key=sort_key,
        reverse=True
    )


# ============================================================
# 寫入 JSON
# ============================================================

def write_json(data):

    OUTPUT_FILE.parent.mkdir(
        parents=True,
        exist_ok=True
    )

    temporary = OUTPUT_FILE.with_suffix(
        ".json.tmp"
    )

    with temporary.open(
        "w",
        encoding="utf-8"
    ) as file:

        json.dump(
            data,
            file,
            ensure_ascii=False,
            indent=2
        )

        file.write("\n")

    temporary.replace(OUTPUT_FILE)


# ============================================================
# 主程式
# ============================================================

def main():

    print("================================")
    print("伴老友｜官方公告自動更新")
    print("================================")

    sources = load_sources()

    print(f"設定來源數量：{len(sources)}")

    # 尚未設定資料來源
    if not sources:

        output = {
            "generated_at": None,
            "status": "not_configured",
            "items": [],
        }

        write_json(output)

        print("Status: not_configured, items: 0")
        return

    all_items = []
    successful_sources = 0
    failed_sources = 0

    for source in sources:

        print("")
        print("讀取來源：" + source["name"], flush=True)
        print("網址：" + source["url"])

        try:

            xml_data = download_feed(
                source["url"]
            )

            items, diagnostics = parse_feed(
                xml_data,
                source
            )

            print(
                "RSS 診斷：根節點={root}、原始項目={entries}、"
                "缺少標題={missing_title}、不符官方網址={rejected_link}".format(
                    **diagnostics
                ),
                flush=True
            )
            for example in diagnostics["examples"]:
                print("未通過網址檢查的範例：" + example, flush=True)

            if not items:
                raise ValueError(
                    "RSS 沒有可用的官方公告；請查看上方 RSS 診斷"
                )

            successful_sources += 1

            all_items.extend(items)

            print(
                f"成功取得 {len(items)} 則公告"
            )

            dated_count = sum(
                1 for item in items
                if item.get("published_at")
            )

            print(
                f"具有發布日期：{dated_count} 則"
            )

        except Exception as error:

            failed_sources += 1

            print(
                "來源讀取失敗："
                + str(error),
                file=sys.stderr
            )

    # 全部來源失敗：保留舊檔
    if successful_sources == 0:

        print(
            "ERROR: 所有來源失敗，"
            "保留上次成功的 announcements.json",
            file=sys.stderr
        )

        raise RuntimeError(
            "所有官方 RSS 來源均無法取得公告"
        )

    all_items = deduplicate(all_items)

    all_items = sort_items(all_items)

    all_items = all_items[:MAX_ITEMS]

    status = (
        "ok"
        if failed_sources == 0
        else "partial"
    )

    output = {
        "generated_at": utc_now().isoformat(),
        "status": status,
        "items": all_items,
    }

    write_json(output)

    print("")
    print("================================")
    print(
        f"Status: {status}, "
        f"items: {len(all_items)}"
    )
    print(
        f"成功來源：{successful_sources}"
    )
    print(
        f"失敗來源：{failed_sources}"
    )
    print(
        "資料檔案：data/announcements.json"
    )
    print("================================")


if __name__ == "__main__":

    try:
        main()

    except Exception as error:

        print(
            "更新失敗：" + str(error),
            file=sys.stderr
        )

        sys.exit(1)
