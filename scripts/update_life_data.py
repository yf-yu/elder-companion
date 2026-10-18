
# -*- coding: utf-8 -*-
"""伴老友 V8.6：民生資訊整合、時效管理、資料品質與來源診斷。"""

import csv
import hashlib
import io
import json
import os
import re
import sys
import zipfile
import xml.etree.ElementTree as ET

from collections import Counter
from datetime import datetime, timedelta, timezone
from pathlib import Path
from urllib.error import HTTPError
from urllib.parse import urlencode, urljoin, urlparse
from urllib.request import HTTPRedirectHandler, Request, build_opener


ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "data"

OUT = DATA / "life_information.json"
STATUS = DATA / "life_source_status.json"

TZ = timezone(timedelta(hours=8))
NOW = datetime.now(TZ)

MAX_BYTES = 20 * 1024 * 1024

CITIES = (
    "基隆市", "臺北市", "新北市", "桃園市",
    "新竹市", "新竹縣", "苗栗縣", "臺中市",
    "彰化縣", "南投縣", "雲林縣", "嘉義市",
    "嘉義縣", "臺南市", "高雄市", "屏東縣",
    "宜蘭縣", "花蓮縣", "臺東縣", "澎湖縣",
    "金門縣", "連江縣"
)

OFFICES = {
    "基隆": "基隆市",
    "臺北": "臺北市",
    "新北": "新北市",
    "桃園": "桃園市",
    "新竹": "新竹縣",
    "苗栗": "苗栗縣",
    "臺中": "臺中市",
    "彰化": "彰化縣",
    "南投": "南投縣",
    "雲林": "雲林縣",
    "嘉義": "嘉義縣",
    "臺南": "臺南市",
    "高雄": "高雄市",
    "屏東": "屏東縣",
    "宜蘭": "宜蘭縣",
    "花蓮": "花蓮縣",
    "臺東": "臺東縣",
    "澎湖": "澎湖縣",
    "金門": "金門縣",
    "馬祖": "連江縣"
}

HOSTS = (
    "data.gov.tw",
    "opendata.cwa.gov.tw",
    "taipower.com.tw",
    "water.gov.tw",
    "gov.tw"
)

ALERT_IDS = (
    "W-C0033-006",
    "W-C0033-007",
    "W-C0033-008",
    "W-C0033-009",
    "W-C0033-010"
)

WINDOWS = {
    "天氣預報": 3,
    "預定停水": 30,
    "預定停電": 30,
    "天氣警示": None
}

EXTRA = {
    "防詐提醒": "官方來源待驗證",
    "長者福利": "縣市官方來源待驗證",
    "勞保與勞退": "官方來源待驗證",
    "健保資訊": "官方來源待驗證"
}


# ============================================================
# 通用工具
# ============================================================

def clean(x):
    if x is None or isinstance(x, dict):
        return ""

    if isinstance(x, (list, tuple)):
        return "、".join(filter(None, map(clean, x)))

    s = re.sub(r"\s+", " ", str(x)).strip()

    if s.lower() in (
        "null", "none", "nan", "undefined",
        "n/a", "[]", "{}"
    ):
        return ""

    return s


def pick(row, *names):
    for name in names:
        value = (
            clean(row.get(name))
            if isinstance(row, dict)
            else ""
        )

        if value:
            return value

    return ""


def dt(x):
    s = (
        clean(x)
        .replace("T", " ")
        .replace("Z", "+00:00")
    )

    if not s:
        return None

    try:
        d = datetime.fromisoformat(s)

        if d.tzinfo is None:
            d = d.replace(tzinfo=TZ)

        return d.astimezone(TZ)

    except ValueError:
        pass

    s = (
        s.replace("年", "/")
        .replace("月", "/")
        .replace("日", " ")
        .replace("：", ":")
    )

    m = re.search(
        r"(?<!\d)"
        r"(\d{2,4})[/.-](\d{1,2})[/.-](\d{1,2})"
        r"(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?",
        s
    )

    if not m:
        return None

    a = [int(v or 0) for v in m.groups()]

    if a[0] < 1911:
        a[0] += 1911

    try:
        return datetime(*a, tzinfo=TZ)
    except ValueError:
        return None


def iso(d):
    return d.isoformat() if d else None


def uid(prefix, *parts):
    s = "|".join(map(clean, parts))

    digest = hashlib.sha256(
        s.encode()
    ).hexdigest()[:24]

    return prefix + "-" + digest


def cities(text):
    s = clean(text).replace("台", "臺")

    return [
        c for c in CITIES
        if c in s
    ]


def valid(item):
    if not isinstance(item, dict):
        return False

    kind = item.get("category")

    if kind not in WINDOWS:
        return False

    start = dt(item.get("starts_at"))
    end = dt(item.get("ends_at"))

    if not start or not end:
        return False

    if start > end or end <= NOW:
        return False

    days = WINDOWS[kind]

    if days is not None:
        if start >= NOW + timedelta(days=days):
            return False

    item_cities = item.get("cities")

    if not isinstance(item_cities, list):
        return False

    return any(
        c in CITIES for c in item_cities
    )


def read_json(path, default):
    try:
        return json.loads(
            path.read_text(encoding="utf-8")
        )
    except (OSError, ValueError):
        return default


def save(path, obj):
    temp = path.with_suffix(".json.tmp")

    temp.write_text(
        json.dumps(
            obj,
            ensure_ascii=False,
            indent=2
        ) + "\n",
        encoding="utf-8"
    )

    temp.replace(path)


# ============================================================
# 安全下載
# ============================================================

def allowed(url):
    try:
        p = urlparse(url)

        h = (
            p.hostname or ""
        ).lower().rstrip(".")

        return (
            p.scheme == "https"
            and not p.username
            and not p.password
            and p.port in (None, 443)
            and any(
                h == x or h.endswith("." + x)
                for x in HOSTS
            )
        )

    except ValueError:
        return False


class SafeRedirect(HTTPRedirectHandler):

    def redirect_request(
        self, req, fp, code, msg, headers, newurl
    ):
        target = urljoin(req.full_url, newurl)

        if not allowed(target):
            raise ValueError(
                "轉址至非白名單網域，已阻擋"
            )

        return super().redirect_request(
            req, fp, code, msg, headers, target
        )


def fetch(url):
    if not allowed(url):
        raise ValueError(
            "非白名單 HTTPS 網址"
        )

    req = Request(
        url,
        headers={
            "User-Agent": "BanLaoYou/8.6",
            "Accept": (
                "application/json,text/csv,"
                "application/zip,application/xml,*/*"
            )
        }
    )

    with build_opener(
        SafeRedirect()
    ).open(req, timeout=35) as response:

        if not allowed(response.geturl()):
            raise ValueError(
                "最終網址不安全"
            )

        raw = response.read(MAX_BYTES + 1)

        if len(raw) > MAX_BYTES:
            raise ValueError(
                "來源檔案超過 20MB"
            )

        return raw


def unwrap(obj):
    if isinstance(obj, list):
        return [
            x for x in obj
            if isinstance(x, dict)
        ]

    if isinstance(obj, dict):
        for name in (
            "records", "data", "result", "items"
        ):
            value = obj.get(name)

            if isinstance(value, (list, dict)):
                try:
                    return unwrap(value)
                except ValueError:
                    pass

    raise ValueError(
        "無法辨識資料格式"
    )


def rows(raw):
    if raw.startswith(b"PK"):
        result = []

        with zipfile.ZipFile(
            io.BytesIO(raw)
        ) as z:

            for info in z.infolist():
                if info.is_dir():
                    continue

                if info.file_size > MAX_BYTES:
                    continue

                if info.filename.lower().endswith(
                    (".csv", ".json")
                ):
                    result.extend(
                        rows(z.read(info))
                    )

        if not result:
            raise ValueError(
                "ZIP 沒有 CSV/JSON"
            )

        return result

    for enc in (
        "utf-8-sig", "cp950", "big5"
    ):
        try:
            text = raw.decode(enc)

        except UnicodeError:
            continue

        try:
            return unwrap(json.loads(text))

        except (ValueError, TypeError):
            reader = csv.DictReader(
                io.StringIO(text)
            )

            if reader.fieldnames:
                return list(reader)

    raise ValueError(
        "CSV/JSON 無法解析"
    )


def dataset_urls(number):
    obj = json.loads(
        fetch(
            "https://data.gov.tw/api/v2/rest/"
            f"dataset/{number}"
        )
    )

    if isinstance(obj, list):
        obj = obj[0] if obj else {}

    if (
        isinstance(obj, dict)
        and isinstance(obj.get("result"), dict)
    ):
        obj = obj["result"]

    resources = (
        obj.get("distribution")
        or obj.get("resources")
        or []
    )

    if isinstance(resources, dict):
        resources = [resources]

    urls = []

    for resource in resources:
        if not isinstance(resource, dict):
            continue

        for field in (
            "resourceDownloadUrl",
            "resourceDownloadURL",
            "downloadURL",
            "url"
        ):
            url = resource.get(field)

            if (
                isinstance(url, str)
                and allowed(url)
                and url not in urls
            ):
                urls.append(url)

    if not urls:
        raise ValueError(
            "沒有可用的官方下載連結"
        )

    return urls


def first_dataset(number, parse):
    errors = []

    for url in dataset_urls(number):
        try:
            return parse(
                rows(fetch(url))
            )

        except Exception as e:
            errors.append(
                f"{type(e).__name__}: {e}"
            )

    raise RuntimeError(
        "; ".join(errors)[:350]
    )


# ============================================================
# 停水
# ============================================================

def water_parse(data):
    out = []
    stats = Counter()

    for r in data:
        a = dt(
            pick(
                r,
                "案件日期時間",
                "停水開始時間",
                "停水時間"
            )
        )

        b = dt(
            pick(
                r,
                "恢復日期時間",
                "停水結束時間",
                "復水時間"
            )
        )

        county = pick(
            r, "影響縣市", "縣市"
        )

        district = pick(
            r, "影響行政區", "行政區"
        )

        area = pick(
            r, "停水地區", "影響範圍"
        )

        cc = cities(
            " ".join(
                (county, district, area)
            )
        )

        if not a or not b:
            stats["時間無法解析"] += 1
            continue

        if not cc:
            stats["地區無法辨識"] += 1
            continue

        item = {
            "id": uid(
                "water",
                pick(r, "案件編號"),
                iso(a),
                iso(b),
                county,
                district,
                area
            ),
            "category": "預定停水",
            "title": (
                "停水通知｜"
                + county
                + district
            )[:120],
            "summary": (
                "影響地區："
                + (area or "未提供")
                + "；原因："
                + (
                    pick(
                        r, "停水原因", "原因"
                    ) or "未提供"
                )
            )[:300],
            "cities": cc,
            "district": district,
            "starts_at": iso(a),
            "ends_at": iso(b),
            "source": "台灣自來水公司",
            "url": (
                "https://data.gov.tw/"
                "dataset/6050"
            )
        }

        if valid(item):
            out.append(item)
        else:
            stats["超出時效"] += 1

    return out, stats, len(data)


# ============================================================
# 停電
# ============================================================

def power_range(text):
    s = (
        clean(text)
        .replace("：", ":")
        .replace("年", "/")
        .replace("月", "/")
        .replace("日", " ")
    )

    dates = re.findall(
        r"(?<!\d)"
        r"\d{2,4}[/.-]\d{1,2}[/.-]\d{1,2}"
        r"(?!\d)",
        s
    )

    times = re.findall(
        r"(?<!\d)"
        r"(?:[01]?\d|2[0-3]):[0-5]\d"
        r"(?!\d)",
        s
    )

    if not dates or len(times) < 2:
        return None, None

    a = dt(
        dates[0] + " " + times[0]
    )

    b = dt(
        (
            dates[1]
            if len(dates) > 1
            else dates[0]
        )
        + " "
        + times[1]
    )

    if (
        a and b
        and b < a
        and len(dates) == 1
    ):
        b += timedelta(days=1)

    return a, b


def power_dates(r):
    for a, b in (
        ("停電開始時間", "停電結束時間"),
        ("開始時間", "結束時間"),
        (
            "預定停電開始時間",
            "預定停電結束時間"
        )
    ):
        start = dt(pick(r, a))
        end = dt(pick(r, b))

        if start and end and end >= start:
            return start, end

    for field in (
        "第一次停電時間",
        "停電時間",
        "預定停電時間",
        "第二次停電時間"
    ):
        if pick(r, field):
            a, b = power_range(
                pick(r, field)
            )

            if a and b and b >= a:
                return a, b

    return None, None


def office_cities(office, area):
    cc = cities(area) or cities(office)

    if cc:
        return cc

    office = clean(office).replace(
        "台", "臺"
    )

    for key, value in OFFICES.items():
        if office.startswith(key):
            return [value]

    return []


def power_parse(data):
    out = []
    stats = Counter()

    for r in data:
        a, b = power_dates(r)

        if not a or not b:
            stats["時間無法解析"] += 1
            continue

        if b <= NOW:
            stats["已結束"] += 1
            continue

        if a >= NOW + timedelta(days=30):
            stats["超過30天"] += 1
            continue

        area = pick(
            r,
            "停電範圍",
            "停電區域",
            "停電地區"
        )

        office = pick(
            r,
            "營業區處",
            "區處",
            "營業處"
        )

        if not area:
            stats["缺少範圍"] += 1
            continue

        cc = office_cities(
            office, area
        )

        if not cc:
            stats["地區無法辨識"] += 1
            continue

        number = pick(
            r, "請求號數", "案件編號"
        )

        reason = (
            pick(
                r,
                "工作概述",
                "停電原因"
            ) or "未提供"
        )

        item = {
            "id": uid(
                "power",
                office,
                number,
                iso(a),
                iso(b),
                area
            ),
            "category": "預定停電",
            "title": (
                "預定停電｜"
                + (office or area[:20])
            )[:120],
            "summary": (
                "停電範圍："
                + area
                + "；工作內容："
                + reason
                + "；查詢電話：1911"
            )[:300],
            "cities": cc,
            "district": "",
            "starts_at": iso(a),
            "ends_at": iso(b),
            "source": "台灣電力公司",
            "url": (
                "https://data.gov.tw/"
                "dataset/26144"
            )
        }

        if valid(item):
            out.append(item)
        else:
            stats["時效不符"] += 1

    unique = {
        x["id"]: x for x in out
    }

    stats["相同公告ID"] += (
        len(out) - len(unique)
    )

    return (
        list(unique.values()),
        stats,
        len(data)
    )


# ============================================================
# 中央氣象署
# ============================================================

def cwa(code, key):
    url = (
        "https://opendata.cwa.gov.tw/"
        "api/v1/rest/datastore/"
        + code
        + "?"
        + urlencode({
            "Authorization": key,
            "format": "JSON"
        })
    )

    obj = json.loads(fetch(url))

    if str(
        obj.get("success", "")
    ).lower() not in ("true", "1"):
        raise ValueError(
            "氣象署回傳失敗："
            + clean(obj.get("message"))
        )

    return obj


def forecast(key):
    obj = cwa(
        "F-C0032-001", key
    )

    out = []
    stats = Counter()

    locations = (
        obj.get("records", {})
        .get("location", [])
    )

    for loc in locations:
        city = clean(
            loc.get("locationName")
        ).replace("台", "臺")

        if city not in CITIES:
            stats["未知縣市"] += 1
            continue

        elements = {
            e.get("elementName"): e.get(
                "time", []
            )
            for e in loc.get(
                "weatherElement", []
            )
        }

        for i, p in enumerate(
            elements.get("Wx", [])
        ):
            a = dt(p.get("startTime"))
            b = dt(p.get("endTime"))

            if not a or not b:
                stats["時間錯誤"] += 1
                continue

            def val(k):
                periods = elements.get(k, [])

                if i >= len(periods):
                    return ""

                return clean(
                    periods[i]
                    .get("parameter", {})
                    .get("parameterName")
                )

            item = {
                "id": uid(
                    "weather",
                    city,
                    iso(a),
                    iso(b)
                ),
                "category": "天氣預報",
                "title": (
                    f"{city}天氣｜{val('Wx')}"
                ),
                "summary": (
                    f"氣溫 {val('MinT')}"
                    f"～{val('MaxT')}°C，"
                    f"降雨機率 {val('PoP')}%。"
                ),
                "cities": [city],
                "district": "",
                "starts_at": iso(a),
                "ends_at": iso(b),
                "source": "中央氣象署",
                "url": "https://www.cwa.gov.tw/"
            }

            if valid(item):
                out.append(item)
            else:
                stats["已過期或超出3天"] += 1

    return out, stats, len(locations)


# ============================================================
# 氣象警示
# ============================================================

def xml_text(node, name):
    for e in node.iter():
        if (
            e.tag.rsplit("}", 1)[-1] == name
            and e.text
        ):
            return clean(e.text)

    return ""


def cap_alert(code, key):
    url = (
        "https://opendata.cwa.gov.tw/"
        "fileapi/v1/opendataapi/"
        + code
        + "?"
        + urlencode({
            "Authorization": key,
            "format": "CAP"
        })
    )

    root = ET.fromstring(fetch(url))

    if root.tag.rsplit("}", 1)[-1] == "alert":
        alerts = [root]
    else:
        alerts = [
            e for e in root.iter()
            if e.tag.rsplit("}", 1)[-1]
            == "alert"
        ]

    out = []

    for alert_node in alerts:
        for info in alert_node:
            if info.tag.rsplit(
                "}", 1
            )[-1] != "info":
                continue

            title = (
                xml_text(info, "headline")
                or xml_text(info, "event")
            )

            a = dt(
                xml_text(info, "effective")
                or xml_text(info, "onset")
                or xml_text(
                    alert_node, "sent"
                )
            )

            b = dt(
                xml_text(info, "expires")
            )

            cc = cities(
                " ".join(
                    xml_text(e, "areaDesc")
                    for e in info.iter()
                    if e.tag.rsplit(
                        "}", 1
                    )[-1] == "area"
                )
            )

            if (
                not a or not b
                or not cc or not title
            ):
                continue

            item = {
                "id": uid(
                    "alert",
                    code,
                    xml_text(
                        alert_node, "identifier"
                    ),
                    title,
                    iso(a),
                    iso(b),
                    ",".join(cc)
                ),
                "category": "天氣警示",
                "title": title[:120],
                "summary": (
                    xml_text(
                        info, "description"
                    )
                    or xml_text(
                        info, "instruction"
                    )
                    or "請參閱氣象署公告"
                )[:300],
                "cities": cc,
                "district": "",
                "starts_at": iso(a),
                "ends_at": iso(b),
                "source": "中央氣象署",
                "url": "https://www.cwa.gov.tw/",
                "api_id": code
            }

            if valid(item):
                out.append(item)

    return out


def rest_alert(code, key):
    obj = cwa(code, key)

    found = []

    def walk(x):
        if isinstance(x, dict):
            if any(
                k in x
                for k in (
                    "headline",
                    "event",
                    "alertName"
                )
            ):
                found.append(x)

            for v in x.values():
                walk(v)

        elif isinstance(x, list):
            for v in x:
                walk(v)

    walk(
        obj.get("records", {})
    )

    out = []

    for r in found:
        title = pick(
            r,
            "headline",
            "alertName",
            "event",
            "title"
        )

        a = dt(
            pick(
                r,
                "effective",
                "onset",
                "startTime",
                "issueTime"
            )
        )

        b = dt(
            pick(
                r,
                "expires",
                "endTime",
                "expireTime"
            )
        )

        cc = cities(
            json.dumps(
                r,
                ensure_ascii=False
            )
        )

        if (
            not a or not b
            or not cc or not title
        ):
            continue

        item = {
            "id": uid(
                "alert",
                code,
                title,
                iso(a),
                iso(b),
                ",".join(cc)
            ),
            "category": "天氣警示",
            "title": title[:120],
            "summary": (
                pick(
                    r,
                    "description",
                    "instruction",
                    "content",
                    "summary"
                )
                or "請參閱氣象署公告"
            )[:300],
            "cities": cc,
            "district": "",
            "starts_at": iso(a),
            "ends_at": iso(b),
            "source": "中央氣象署",
            "url": "https://www.cwa.gov.tw/",
            "api_id": code
        }

        if valid(item):
            out.append(item)

    return out


def alert(code, key):
    try:
        items = rest_alert(code, key)

    except (HTTPError, ValueError) as e:
        try:
            items = cap_alert(code, key)

        except Exception as f:
            raise RuntimeError(
                f"REST：{e}；CAP：{f}"
            ) from f

    return items, Counter(), len(items)


# ============================================================
# 來源狀態與更新紀錄
# ============================================================

def group(item):
    if item.get(
        "category"
    ) == "天氣警示":
        return item.get("api_id")

    return item.get("category")


def last_success(previous, name):
    source = previous.get(
        "sources", {}
    ).get(name, {})

    return dt(
        source.get("last_success_at")
        or (
            previous.get("checked_at")
            if source.get("state") == "ok"
            else None
        )
    )


def state(
    name,
    status,
    count,
    previous,
    message="",
    stats=None,
    raw=None
):
    success = (
        NOW
        if status == "ok"
        else last_success(previous, name)
    )

    hours = (
        max(
            0,
            (NOW - success).total_seconds()
            / 3600
        )
        if success
        else None
    )

    result = {
        "state": status,
        "items": count,
        "last_success_at": (
            iso(
                success.astimezone(
                    timezone.utc
                )
            )
            if success
            else None
        ),
        "hours_since_success": (
            round(hours, 1)
            if hours is not None
            else None
        ),
        "stale": (
            hours is None
            or hours > 24
        )
    }

    if message:
        result["message"] = message[:350]

    if stats is not None:
        result["quality"] = {
            "raw_rows": raw,
            "excluded": dict(stats)
        }

    return result


# ============================================================
# 主程序
# ============================================================

def main():
    DATA.mkdir(
        parents=True,
        exist_ok=True
    )

    previous = read_json(
        OUT, {}
    )

    old = (
        previous.get("items", [])
        if isinstance(previous, dict)
        else []
    )

    if not isinstance(old, list):
        old = []

    prev_status = read_json(
        STATUS, {}
    )

    if not isinstance(prev_status, dict):
        prev_status = {}

    sources = [
        (
            "預定停水",
            lambda: first_dataset(
                6050, water_parse
            )
        ),
        (
            "預定停電",
            lambda: first_dataset(
                26144, power_parse
            )
        )
    ]

    api_key = os.environ.get(
        "CWA_API_KEY", ""
    ).strip()

    if api_key:
        sources.append(
            (
                "天氣預報",
                lambda: forecast(api_key)
            )
        )

        sources.extend(
            (
                code,
                lambda c=code: alert(
                    c, api_key
                )
            )
            for code in ALERT_IDS
        )

    results = {}
    fresh = []

    if not api_key:
        for name in (
            "天氣預報",
        ) + ALERT_IDS:
            results[name] = state(
                name,
                "not_configured",
                0,
                prev_status,
                "缺少 CWA_API_KEY"
            )

    for name, fn in sources:
        try:
            items, quality, raw = fn()

            items = [
                x for x in items
                if valid(x)
            ]

            fresh.extend(items)

            results[name] = state(
                name,
                "ok",
                len(items),
                prev_status,
                stats=quality,
                raw=raw
            )

            print(
                f"[{name}] 成功 {len(items)} 筆；"
                f"來源 {raw} 筆；"
                f"排除 {dict(quality)}"
            )

        except Exception as e:
            msg = (
                f"{type(e).__name__}: {e}"
            )

            results[name] = state(
                name,
                "error",
                0,
                prev_status,
                msg
            )

            print(
                f"[{name}] 錯誤：{msg}"
            )

    # 來源失敗時，只保留仍有效的舊資料
    retained = [
        x for x in old
        if (
            valid(x)
            and results.get(
                group(x), {}
            ).get("state") != "ok"
        )
    ]

    # 跨版本統一去重
    unique = {}

    for item in retained + fresh:
        identity = uid(
            "record",
            item.get("category"),
            item.get("source"),
            item.get("title"),
            item.get("summary"),
            item.get("starts_at"),
            item.get("ends_at"),
            ",".join(
                item.get("cities", [])
            )
        )

        unique[identity] = item

    final = sorted(
        unique.values(),
        key=lambda x: (
            x.get("starts_at") or "",
            x.get("category") or "",
            x.get("id") or ""
        )
    )

    now = datetime.now(
        timezone.utc
    ).isoformat()

    save(
        OUT,
        {
            "generated_at": now,
            "items": final
        }
    )

    report = {
        "checked_at": now,
        "version": "8.6",
        "retention": {
            "weather_days": 3,
            "water_days": 30,
            "power_days": 30,
            "stale_hours": 24
        },
        "sources": results,
        "planned_modules": {
            k: {
                "state": "not_connected",
                "note": v
            }
            for k, v in EXTRA.items()
        },
        "items": len(final),
        "category_counts": dict(
            Counter(
                x["category"]
                for x in final
            )
        ),
        "removed_expired_old_items": sum(
            not valid(x)
            for x in old
        ),
        "retained_during_source_errors": len(
            retained
        ),
        "deduplicated_records": (
            len(retained)
            + len(fresh)
            - len(final)
        ),
        "note": (
            "僅顯示有效公告；"
            "新增模組未驗證前不刊登資料；"
            "stale 代表來源成功更新超過24小時。"
        )
    }

    save(
        STATUS,
        report
    )

    print(
        json.dumps(
            report,
            ensure_ascii=False,
            indent=2
        )
    )


if __name__ == "__main__":
    try:
        main()

    except Exception as e:
        print(
            f"V8.6 執行失敗：{e}",
            file=sys.stderr
        )

        sys.exit(1)
