

import html
import ipaddress
import json
import re
import sys
from datetime import datetime, timedelta, timezone
from email.utils import parsedate_to_datetime
from pathlib import Path
from urllib.parse import urljoin, urlparse, urlunparse
from urllib.request import HTTPRedirectHandler, Request, build_opener
from xml.etree import ElementTree as ET

ROOT = Path(__file__).resolve().parents[1]
SOURCES_FILE = ROOT / "data" / "sources.json"
OUTPUT_FILE = ROOT / "data" / "announcements.json"

MAX_ITEMS = 40
MAX_ITEMS_PER_SOURCE = 60
MAX_DOWNLOAD_BYTES = 2 * 1024 * 1024
MAX_SUMMARY_LENGTH = 280
TIMEOUT = 20

TZ_TAIWAN = timezone(timedelta(hours=8))
USER_AGENT = (
    "BanLaoYou-OfficialNotices/1.1 "
    "(Public government RSS reader)"
)

# 各分類先分配名額；如有剩餘空間，再依日期補滿 40 則。
CATEGORY_LIMITS = {
    "健康資訊": 12,
    "長者福利": 8,
    "食藥安全": 10,
    "健保就醫": 6,
    "年金給付": 6,
    "防詐提醒": 5,
    "衛福部公告": 6,
    "政府資訊": 6,
}

WELFARE_WORDS = (
    "長照", "高齡", "長者", "老人", "敬老",
    "失智", "日照中心", "照顧服務",
    "居家照護", "喘息服務", "老人福利"
)

MEDICAL_WORDS = (
    "健保", "健保署", "健保給付",
    "就醫權益", "部分負擔", "醫療費用"
)

PENSION_WORDS = (
    "國民年金", "老年年金", "勞保年金",
    "老年給付", "退休金", "勞工退休金",
    "農民退休儲金", "年金給付"
)

FRAUD_WORDS = (
    "詐騙", "防詐", "假投資",
    "165反詐", "165全民防騙"
)


# ============================================================
# 文字及網址安全
# ============================================================

def clean_text(value):
    value = re.sub(
        r"(?is)<(script|style)\b[^>]*>.*?</\1\s*>",
        " ",
        str(value or "")
    )
    value = re.sub(r"(?s)<[^>]+>", " ", value)
    return re.sub(
        r"\s+", " ", html.unescape(value)
    ).strip()


def is_official_url(value):
    """RSS 來源及公告連結必須是 HTTPS 的 .gov.tw。"""
    if not isinstance(value, str):
        return False

    try:
        p = urlparse(value.strip())
        host = (p.hostname or "").lower().rstrip(".")

        if p.scheme.lower() != "https":
            return False

        if not host.endswith(".gov.tw"):
            return False

        if p.username or p.password:
            return False

        if p.port not in (None, 443):
            return False

        try:
            ipaddress.ip_address(host)
            return False
        except ValueError:
            return True

    except (ValueError, TypeError):
        return False


def normalize_article_url(value):
    """
    只針對食藥署官方 RSS 使用的 HTTP 文章網址，
    升級為 HTTPS，不放寬其他網址安全規則。
    """
    if not isinstance(value, str):
        return ""

    value = html.unescape(value.strip())

    try:
        p = urlparse(value)

        if (
            p.scheme.lower() == "http"
            and (p.hostname or "").lower().rstrip(".")
                == "www.fda.gov.tw"
            and not p.username
            and not p.password
            and p.port in (None, 80)
        ):
            return urlunparse(
                p._replace(
                    scheme="https",
                    netloc="www.fda.gov.tw"
                )
            )

    except ValueError:
        return ""

    return value


class SafeRedirectHandler(HTTPRedirectHandler):
    """每次 RSS 轉址都重新檢查官方 HTTPS 網域。"""

    def redirect_request(
        self, req, fp, code, msg, headers, newurl
    ):
        target = urljoin(req.full_url, newurl)

        if not is_official_url(target):
            raise ValueError(
                "RSS 轉址到非官方 HTTPS 網址：" + target
            )

        return super().redirect_request(
            req, fp, code, msg, headers, target
        )


# ============================================================
# 日期
# ============================================================

def parse_date(value):
    value = str(value or "").strip()

    if not value:
        return None

    try:
        dt = parsedate_to_datetime(value)

        if dt:
            if dt.tzinfo is None:
                dt = dt.replace(tzinfo=TZ_TAIWAN)

            return dt.astimezone(
                timezone.utc
            ).isoformat()

    except (ValueError, TypeError, OverflowError):
        pass

    try:
        dt = datetime.fromisoformat(
            value.replace("Z", "+00:00")
        )

        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=TZ_TAIWAN)

        return dt.astimezone(
            timezone.utc
        ).isoformat()

    except (ValueError, TypeError, OverflowError):
        pass

    formats = (
        "%Y-%m-%d %H:%M:%S",
        "%Y/%m/%d %H:%M:%S",
        "%Y-%m-%d %H:%M",
        "%Y/%m/%d %H:%M",
        "%Y-%m-%d",
        "%Y/%m/%d",
        "%Y.%m.%d"
    )

    for fmt in formats:
        try:
            dt = datetime.strptime(value, fmt)
            dt = dt.replace(tzinfo=TZ_TAIWAN)

            return dt.astimezone(
                timezone.utc
            ).isoformat()

        except ValueError:
            pass

    match = re.fullmatch(
        r"(\d{2,3})[/-](\d{1,2})[/-](\d{1,2})",
        value
    )

    if match:
        try:
            dt = datetime(
                int(match[1]) + 1911,
                int(match[2]),
                int(match[3]),
                tzinfo=TZ_TAIWAN
            )

            return dt.astimezone(
                timezone.utc
            ).isoformat()

        except ValueError:
            pass

    return None


# ============================================================
# RSS / Atom
# ============================================================

def local_name(tag):
    return str(tag).split("}")[-1].split(":")[-1].lower()


def child_text(element, names):
    names = {name.lower() for name in names}

    for child in element:
        if local_name(child.tag) in names:
            return "".join(child.itertext()).strip()

    return ""


def entry_date(entry):
    fields = (
        "pubDate", "published", "publishedDate",
        "publicationDate", "date", "issued",
        "created", "updated", "modified"
    )

    for field in fields:
        result = parse_date(
            child_text(entry, (field,))
        )

        if result:
            return result

    return None


def entry_link(entry, feed_url):
    for child in entry:
        if local_name(child.tag) != "link":
            continue

        rel = child.attrib.get(
            "rel", "alternate"
        ).lower()

        raw = (
            child.attrib.get("href", "").strip()
            or "".join(child.itertext()).strip()
        )

        if raw and rel in ("alternate", ""):
            return urljoin(
                feed_url, html.unescape(raw)
            )

    for field in ("guid", "id"):
        raw = child_text(entry, (field,))

        if raw.startswith(
            ("https://", "http://", "/")
        ):
            return urljoin(
                feed_url, html.unescape(raw)
            )

    return ""


# ============================================================
# 公告自動分類
# ============================================================

def classify(item, source):
    """
    根據來源及標題分類。

    衛福部的所有新聞不會自動視為長者福利。
    這是關鍵字初步分類，不代表人工審核結果。
    """
    title = item["title"]
    source_name = source["name"]
    configured = source["category"]

    if any(word in title for word in FRAUD_WORDS):
        return "防詐提醒"

    if any(word in title for word in PENSION_WORDS):
        return "年金給付"

    if any(word in title for word in MEDICAL_WORDS):
        return "健保就醫"

    if any(word in title for word in WELFARE_WORDS):
        return "長者福利"

    if (
        "食品藥物管理署" in source_name
        or "食藥署" in source_name
    ):
        return "食藥安全"

    if "疾病管制署" in source_name:
        return "健康資訊"

    if configured == "長者福利":
        return "衛福部公告"

    return configured or "政府資訊"


def parse_feed(data, source):
    root = ET.fromstring(data)

    entries = [
        el for el in root.iter()
        if local_name(el.tag) in ("item", "entry")
    ]

    results = []
    missing_title = 0
    rejected_link = 0
    examples = []

    for entry in entries[:MAX_ITEMS_PER_SOURCE]:
        title = clean_text(
            child_text(entry, ("title",))
        )

        url = normalize_article_url(
            entry_link(entry, source["url"])
        )

        if not title:
            missing_title += 1
            continue

        if not is_official_url(url):
            rejected_link += 1

            if len(examples) < 2:
                examples.append(
                    url[:180] or "(空連結)"
                )

            continue

        summary = clean_text(
            child_text(
                entry,
                (
                    "description", "summary",
                    "content", "encoded", "subtitle"
                )
            )
        )

        if len(summary) > MAX_SUMMARY_LENGTH:
            summary = (
                summary[:MAX_SUMMARY_LENGTH].rstrip()
                + "…"
            )

        item = {
            "title": title,
            "url": url,
            "summary": summary,
            "source": source["name"],
            "category": source["category"],
            "published_at": entry_date(entry)
        }

        item["category"] = classify(item, source)

        results.append(item)

    diagnostics = {
        "root": local_name(root.tag),
        "entries": len(entries),
        "missing_title": missing_title,
        "rejected_link": rejected_link,
        "examples": examples
    }

    return results, diagnostics


# ============================================================
# 下載 RSS
# ============================================================

def download_feed(url):
    if not is_official_url(url):
        raise ValueError(
            "不允許的官方來源網址：" + str(url)
        )

    req = Request(
        url,
        headers={
            "User-Agent": USER_AGENT,
            "Accept": (
                "application/rss+xml,"
                "application/atom+xml,"
                "application/xml,"
                "text/xml,*/*"
            )
        }
    )

    opener = build_opener(SafeRedirectHandler())

    with opener.open(req, timeout=TIMEOUT) as response:
        if not is_official_url(response.geturl()):
            raise ValueError(
                "RSS 最終網址不符合安全規則"
            )

        data = response.read(
            MAX_DOWNLOAD_BYTES + 1
        )

        if len(data) > MAX_DOWNLOAD_BYTES:
            raise ValueError(
                "RSS 超過 2MB 限制"
            )

        return data


# ============================================================
# 來源設定
# ============================================================

def load_sources():
    with SOURCES_FILE.open(
        "r", encoding="utf-8"
    ) as f:
        raw = json.load(f)

    if (
        not isinstance(raw, dict)
        or not isinstance(raw.get("sources"), list)
    ):
        raise ValueError(
            "sources.json 必須包含 sources 陣列"
        )

    sources = []

    for index, source in enumerate(
        raw["sources"], 1
    ):
        if (
            not isinstance(source, dict)
            or not is_official_url(
                source.get("url")
            )
        ):
            raise ValueError(
                f"第 {index} 個來源網址不符合官方 HTTPS 規則"
            )

        sources.append({
            "name": clean_text(
                source.get("name", "官方公告")
            ),
            "category": clean_text(
                source.get("category", "政府資訊")
            ),
            "url": source["url"].strip()
        })

    return sources


# ============================================================
# 排序、去重及分類配額
# ============================================================

def timestamp(item):
    try:
        if item.get("published_at"):
            return datetime.fromisoformat(
                item["published_at"]
            ).timestamp()

    except (ValueError, TypeError):
        pass

    return 0


def select_balanced(items):
    """
    第一輪：依分類名額選取。
    第二輪：如果不足 40 則，依日期補滿。
    """
    unique = {}

    for item in items:
        unique.setdefault(
            item["url"], item
        )

    ordered = sorted(
        unique.values(),
        key=timestamp,
        reverse=True
    )

    selected = []
    deferred = []
    counts = {}

    for item in ordered:
        cat = item["category"]

        limit = CATEGORY_LIMITS.get(
            cat, 6
        )

        if (
            counts.get(cat, 0) < limit
            and len(selected) < MAX_ITEMS
        ):
            selected.append(item)

            counts[cat] = (
                counts.get(cat, 0) + 1
            )

        else:
            deferred.append(item)

    for item in deferred:
        if len(selected) >= MAX_ITEMS:
            break

        selected.append(item)

    return sorted(
        selected,
        key=timestamp,
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
        "w", encoding="utf-8"
    ) as f:
        json.dump(
            data,
            f,
            ensure_ascii=False,
            indent=2
        )

        f.write("\n")

    temporary.replace(OUTPUT_FILE)


# ============================================================
# 主程式
# ============================================================

def main():
    print(
        "================================",
        flush=True
    )

    print(
        "伴老友｜官方公告自動更新 V7.8",
        flush=True
    )

    print(
        "================================",
        flush=True
    )

    sources = load_sources()

    print(
        f"設定來源數量：{len(sources)}",
        flush=True
    )

    if not sources:
        write_json({
            "generated_at": None,
            "status": "not_configured",
            "items": []
        })

        print(
            "Status: not_configured, items: 0"
        )
        return

    all_items = []
    successes = 0
    failures = 0

    for source in sources:
        print(
            f'\n讀取來源：{source["name"]}'
            f'\n網址：{source["url"]}',
            flush=True
        )

        try:
            items, info = parse_feed(
                download_feed(source["url"]),
                source
            )

            print(
                "RSS 診斷："
                "根節點={root}、"
                "原始項目={entries}、"
                "缺少標題={missing_title}、"
                "不符官方網址={rejected_link}".format(
                    **info
                ),
                flush=True
            )

            for example in info["examples"]:
                print(
                    "未通過網址檢查的範例："
                    + example,
                    flush=True
                )

            if not items:
                raise ValueError(
                    "RSS 沒有可用的官方公告"
                )

            successes += 1
            all_items.extend(items)

            print(
                f"成功取得 {len(items)} 則公告",
                flush=True
            )

            dated_count = sum(
                bool(x["published_at"])
                for x in items
            )

            print(
                f"具有發布日期：{dated_count} 則",
                flush=True
            )

        except Exception as exc:
            failures += 1

            print(
                f"來源讀取失敗：{exc}",
                file=sys.stderr,
                flush=True
            )

    if not successes:
        raise RuntimeError(
            "所有官方 RSS 來源失敗；"
            "保留上次 announcements.json"
        )

    selected = select_balanced(all_items)

    status = (
        "ok" if failures == 0
        else "partial"
    )

    write_json({
        "generated_at": datetime.now(
            timezone.utc
        ).isoformat(),
        "status": status,
        "items": selected
    })

    print("\n================================")

    print(
        f"Status: {status}, "
        f"items: {len(selected)}"
    )

    print(f"成功來源：{successes}")
    print(f"失敗來源：{failures}")

    print("分類統計：")

    for cat in sorted({
        item["category"]
        for item in selected
    }):
        count = sum(
            item["category"] == cat
            for item in selected
        )

        print(f"  {cat}：{count} 則")

    print(
        "資料檔案：data/announcements.json"
    )

    print("================================")


if __name__ == "__main__":
    try:
        main()

    except Exception as exc:
        print(
            "更新失敗：" + str(exc),
            file=sys.stderr
        )

        sys.exit(1)
