import html
import ipaddress
import json
import re
import sys

from datetime import datetime, timedelta, timezone
from email.utils import parsedate_to_datetime
from pathlib import Path
from urllib.parse import urljoin, urlparse, urlunparse
from urllib.request import (
    HTTPRedirectHandler,
    Request,
    build_opener,
)
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
    "BanLaoYou-OfficialNotices/8.1 "
    "(Public government RSS reader)"
)

# 不強迫補滿 40 則。
# 每個主題設定上限，避免單一來源淹沒其他資訊。
CATEGORY_LIMITS = {
    "健康資訊": 10,
    "長者福利": 10,
    "食藥安全": 10,
    "健保就醫": 7,
    "年金給付": 7,
    "防詐提醒": 7,
    "天氣預報": 6,
    "預定停電": 6,
    "預定停水": 6,
    "衛福部公告": 3,
    "政府資訊": 3,
}

WELFARE_WORDS = (
    "長照", "長期照顧", "高齡", "長者", "老人",
    "敬老", "失智", "日照中心", "照顧服務",
    "居家照護", "居家照顧", "喘息服務",
    "老人福利", "獨居長者", "輔具",
    "照顧者", "老老照顧", "銀髮",
)

MEDICAL_WORDS = (
    "健保", "健保署", "健保給付", "就醫權益",
    "部分負擔", "醫療費用", "慢性病",
    "居家醫療", "醫療補助",
)

PENSION_WORDS = (
    "國民年金", "老年年金", "勞保年金",
    "老年給付", "退休金", "勞工退休金",
    "農民退休儲金", "年金給付",
    "老農津貼", "勞保給付",
)

FRAUD_WORDS = (
    "詐騙", "防詐", "反詐", "假投資",
    "假檢警", "假冒", "165反詐",
    "165全民防騙", "金融詐欺",
)

HEALTH_WORDS = (
    "疫苗", "接種", "流感", "新冠",
    "COVID", "肺炎", "疫情", "防疫",
    "傳染病", "帶狀疱疹", "健康檢查",
    "成人預防保健", "癌症篩檢",
    "疾病預防", "登革熱", "腸病毒",
    "公費疫苗",
)

FOOD_DRUG_WORDS = (
    "食安", "食品安全", "食品中毒",
    "食物中毒", "食品召回", "回收",
    "下架", "藥品", "藥物", "用藥",
    "不良反應", "違規食品",
    "醫療器材", "藥品安全",
)

LIFE_WORDS = (
    "停水", "停電", "供水", "供電",
    "豪雨", "低溫", "高溫", "寒流",
    "颱風", "熱傷害", "避難",
    "補助申請", "補助資格",
    "申請期限", "津貼",
)

# 只用於行政院 RSS 的生活政策篩選。
POLICY_WORDS = (
    "長照", "高齡", "長者", "老人",
    "敬老", "失智", "照顧服務",
    "老人福利", "健保", "醫療",
    "就醫", "慢性病", "年金",
    "退休金", "老農津貼",
    "詐騙", "防詐", "反詐",
    "食安", "食品安全", "藥品安全",
    "疫苗", "流感", "防疫",
    "停水", "停電", "供水",
    "豪雨", "寒流", "高溫",
    "熱傷害", "弱勢補助",
    "社會救助", "住宅補貼",
    "補助申請", "補助資格",
)

# 明確排除不符合本服務方向的內容。
# 不使用「市長」「總統」等單字排除，
# 以免誤刪真正影響長輩權益的政策。
EXCLUDE_WORDS = (
    "地震", "震央", "地震報告",
    "剪綵", "揭牌典禮",
    "競選造勢", "選舉造勢",
    "政黨募款", "黨內初選",
    "觀光行銷", "旅遊推廣",
    "演唱會售票", "藝文表演售票",
)

# 只針對行政院的新聞式標題進一步排除。
POLICY_NEWS_EXCLUDE = (
    "接見外賓", "外交宴會",
    "國際訪賓", "出席晚宴",
    "體育賽事成績",
)


def clean_text(value):
    value = re.sub(
        r"(?is)<(script|style)\b[^>]*>.*?</\1\s*>",
        " ",
        str(value or ""),
    )
    value = re.sub(r"(?s)<[^>]+>", " ", value)
    return re.sub(
        r"\s+", " ", html.unescape(value)
    ).strip()


def is_official_url(value):
    if not isinstance(value, str):
        return False

    try:
        parsed = urlparse(value.strip())
        host = (parsed.hostname or "").lower().rstrip(".")

        if parsed.scheme.lower() != "https":
            return False

        if not host.endswith(".gov.tw"):
            return False

        if parsed.username or parsed.password:
            return False

        if parsed.port not in (None, 443):
            return False

        try:
            ipaddress.ip_address(host)
            return False
        except ValueError:
            return True

    except (ValueError, TypeError):
        return False


def normalize_article_url(value):
    """僅將食藥署官方文章的 HTTP 網址升級為 HTTPS。"""
    if not isinstance(value, str):
        return ""

    value = html.unescape(value.strip())

    try:
        parsed = urlparse(value)

        if (
            parsed.scheme.lower() == "http"
            and (parsed.hostname or "").lower().rstrip(".")
            == "www.fda.gov.tw"
            and not parsed.username
            and not parsed.password
            and parsed.port in (None, 80)
        ):
            return urlunparse(
                parsed._replace(
                    scheme="https",
                    netloc="www.fda.gov.tw",
                )
            )

    except ValueError:
        return ""

    return value


class SafeRedirectHandler(HTTPRedirectHandler):
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
        "%Y.%m.%d",
    )

    for fmt in formats:
        try:
            dt = datetime.strptime(value, fmt)
            return dt.replace(
                tzinfo=TZ_TAIWAN
            ).astimezone(timezone.utc).isoformat()

        except ValueError:
            pass

    match = re.fullmatch(
        r"(\d{2,3})[/-](\d{1,2})[/-](\d{1,2})",
        value,
    )

    if match:
        try:
            dt = datetime(
                int(match[1]) + 1911,
                int(match[2]),
                int(match[3]),
                tzinfo=TZ_TAIWAN,
            )

            return dt.astimezone(
                timezone.utc
            ).isoformat()

        except ValueError:
            pass

    return None


def local_name(tag):
    return (
        str(tag)
        .split("}")[-1]
        .split(":")[-1]
        .lower()
    )


def child_text(element, names):
    names = {name.lower() for name in names}

    for child in element:
        if local_name(child.tag) in names:
            return "".join(child.itertext()).strip()

    return ""


def entry_date(entry):
    fields = (
        "pubDate",
        "published",
        "publishedDate",
        "publicationDate",
        "date",
        "issued",
        "created",
        "updated",
        "modified",
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


def contains_any(text, words):
    text = (text or "").lower()

    return any(
        word.lower() in text
        for word in words
    )


def classify(item, source):
    """依文章標題與來源分類。"""

    title = item["title"]
    source_name = source["name"]
    configured = source["category"]

    if contains_any(title, FRAUD_WORDS):
        return "防詐提醒"

    if contains_any(title, PENSION_WORDS):
        return "年金給付"

    if contains_any(title, MEDICAL_WORDS):
        return "健保就醫"

    if contains_any(title, WELFARE_WORDS):
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


def is_relevant(item, source):
    """判斷公告是否適合伴老友。

    行政院採嚴格關鍵字篩選。
    原有專業來源保留其主題公告，
    並排除明顯無關的內容。
    """

    title = item["title"]
    summary = item.get("summary", "")
    category = item["category"]

    if contains_any(title, EXCLUDE_WORDS):
        return False

    if source.get("filter") == "elder_life":
        if contains_any(
            title, POLICY_NEWS_EXCLUDE
        ):
            return False

        # 行政院必須在標題出現明確生活主題，
        # 避免摘要中的偶然字詞造成誤判。
        return contains_any(
            title, POLICY_WORDS
        )

    if category == "衛福部公告":
        # 衛福部的一般新聞不再全部保留。
        # 必須與生活、健康、福利或安全有關。
        return contains_any(
            title + " " + summary,
            (
                WELFARE_WORDS
                + MEDICAL_WORDS
                + PENSION_WORDS
                + FRAUD_WORDS
                + HEALTH_WORDS
                + FOOD_DRUG_WORDS
                + LIFE_WORDS
            ),
        )

    # 疾管署、食藥署等專業來源，
    # 先保留主題公告，避免過度過濾重要警訊。
    return True


def parse_feed(data, source):
    root = ET.fromstring(data)

    root_type = local_name(root.tag)

    if root_type not in ("rss", "feed", "rdf"):
        raise ValueError(
            "不是有效 RSS/Atom，根節點：" + root_type
        )

    entries = [
        element
        for element in root.iter()
        if local_name(element.tag)
        in ("item", "entry")
    ]

    results = []
    missing_title = 0
    rejected_link = 0
    filtered = 0
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
                    "description",
                    "summary",
                    "content",
                    "encoded",
                    "subtitle",
                ),
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
            "published_at": entry_date(entry),
        }

        item["category"] = classify(
            item, source
        )

        if not is_relevant(item, source):
            filtered += 1
            continue

        results.append(item)

    return results, {
        "root": root_type,
        "entries": len(entries),
        "missing_title": missing_title,
        "rejected_link": rejected_link,
        "filtered": filtered,
        "examples": examples,
    }


def download_feed(url):
    if not is_official_url(url):
        raise ValueError(
            "不允許的官方來源網址：" + str(url)
        )

    request = Request(
        url,
        headers={
            "User-Agent": USER_AGENT,
            "Accept": (
                "application/rss+xml,"
                "application/atom+xml,"
                "application/xml,"
                "text/xml,*/*"
            ),
        },
    )

    opener = build_opener(
        SafeRedirectHandler()
    )

    with opener.open(
        request, timeout=TIMEOUT
    ) as response:

        if not is_official_url(
            response.geturl()
        ):
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


def load_sources():
    with SOURCES_FILE.open(
        "r", encoding="utf-8"
    ) as file:
        raw = json.load(file)

    if (
        not isinstance(raw, dict)
        or not isinstance(
            raw.get("sources"), list
        )
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
                f"第 {index} 個來源網址"
                "不符合官方 HTTPS 規則"
            )

        sources.append({
            "name": clean_text(
                source.get(
                    "name", "官方公告"
                )
            ),
            "category": clean_text(
                source.get(
                    "category", "政府資訊"
                )
            ),
            "url": source["url"].strip(),
            "filter": source.get(
                "filter", ""
            ),
        })

    return sources


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
    """去重、依主題上限選取，不強迫補滿。"""

    unique = {}

    for item in items:
        unique.setdefault(
            item["url"], item
        )

    ordered = sorted(
        unique.values(),
        key=timestamp,
        reverse=True,
    )

    selected = []
    counts = {}

    for item in ordered:
        if len(selected) >= MAX_ITEMS:
            break

        category = item["category"]
        limit = CATEGORY_LIMITS.get(
            category, 5
        )

        if counts.get(category, 0) >= limit:
            continue

        selected.append(item)

        counts[category] = (
            counts.get(category, 0) + 1
        )

    return sorted(
        selected,
        key=timestamp,
        reverse=True,
    )


def write_json(data):
    OUTPUT_FILE.parent.mkdir(
        parents=True,
        exist_ok=True,
    )

    temporary = OUTPUT_FILE.with_suffix(
        ".json.tmp"
    )

    with temporary.open(
        "w", encoding="utf-8"
    ) as file:
        json.dump(
            data,
            file,
            ensure_ascii=False,
            indent=2,
        )
        file.write("\n")

    temporary.replace(
        OUTPUT_FILE
    )


def main():
    print("=" * 45, flush=True)
    print(
        "伴老友｜官方生活公告自動更新 V8.1",
        flush=True,
    )
    print("=" * 45, flush=True)

    sources = load_sources()

    print(
        f"設定來源數量：{len(sources)}",
        flush=True,
    )

    if not sources:
        # 不覆蓋現有公告。
        raise RuntimeError(
            "沒有設定來源，保留上次公告"
        )

    all_items = []
    successes = 0
    failures = 0

    for source in sources:
        print(
            f"\n讀取來源：{source['name']}",
            flush=True,
        )

        print(
            f"網址：{source['url']}",
            flush=True,
        )

        try:
            data = download_feed(
                source["url"]
            )

            items, info = parse_feed(
                data, source
            )

            print(
                "RSS 診斷："
                f"根節點={info['root']}、"
                f"原始項目={info['entries']}、"
                f"缺少標題={info['missing_title']}、"
                f"網址不符={info['rejected_link']}、"
                f"生活篩選排除={info['filtered']}",
                flush=True,
            )

            for example in info["examples"]:
                print(
                    "網址檢查未通過：" + example,
                    flush=True,
                )

            # 解析成功且原始 RSS 有項目，
            # 即使全部被生活篩選排除，
            # 也不視為來源連線失敗。
            if info["entries"] == 0:
                raise ValueError(
                    "RSS 沒有任何原始公告"
                )

            successes += 1
            all_items.extend(items)

            print(
                f"保留 {len(items)} 則生活公告",
                flush=True,
            )

        except Exception as exc:
            failures += 1

            print(
                "來源讀取失敗："
                + str(exc),
                file=sys.stderr,
                flush=True,
            )

    if not successes:
        raise RuntimeError(
            "所有官方 RSS 來源失敗；"
            "保留上次 announcements.json"
        )

    selected = select_balanced(
        all_items
    )

    status = (
        "ok" if failures == 0
        else "partial"
    )

    # 安全保護：
    # 避免來源格式異常或篩選規則過嚴，
    # 把原本有資料的公告覆蓋成空清單。
    if not selected:
        raise RuntimeError(
            "篩選後沒有任何公告；"
            "保留上次 announcements.json"
        )

    write_json({
        "generated_at": datetime.now(
            timezone.utc
        ).isoformat(),
        "status": status,
        "items": selected,
    })

    print()
    print("=" * 45)
    print(
        f"Status: {status}, "
        f"items: {len(selected)}"
    )
    print(f"成功來源：{successes}")
    print(f"失敗來源：{failures}")

    print("分類統計：")

    for category in sorted({
        item["category"]
        for item in selected
    }):
        count = sum(
            item["category"] == category
            for item in selected
        )

        print(
            f"  {category}：{count} 則"
        )

    print(
        "資料檔案：data/announcements.json"
    )
    print("=" * 45)


if __name__ == "__main__":
    try:
        main()

    except Exception as exc:
        print(
            "更新失敗：" + str(exc),
            file=sys.stderr,
        )
        sys.exit(1)
