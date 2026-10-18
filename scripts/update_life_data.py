
# -*- coding: utf-8 -*-
"""
伴老友 V8.5.1
民生資訊自動更新與過期資料淘汰

資料保留規則：
- 天氣預報：現在至未來 3 天
- 停水公告：現在至未來 30 天
- 停電公告：現在至未來 30 天
- 氣象警示：僅保留有效警示
- API 更新失敗：舊資料仍須符合時效規則
- 資料來源：記錄最近成功更新時間
"""

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
from urllib.parse import urlencode, urlparse, urljoin
from urllib.request import (
    HTTPRedirectHandler,
    Request,
    build_opener
)


# ============================================================
# 基本設定
# ============================================================

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "data"

OUT = DATA / "life_information.json"
STATUS = DATA / "life_source_status.json"

TZ = timezone(timedelta(hours=8))
NOW = datetime.now(TZ)

MAX_BYTES = 20 * 1024 * 1024

WEATHER_DAYS = 3
NOTICE_DAYS = 30
STALE_HOURS = 24

CITIES = (
    "基隆市", "臺北市", "新北市", "桃園市",
    "新竹市", "新竹縣", "苗栗縣", "臺中市",
    "彰化縣", "南投縣", "雲林縣", "嘉義市",
    "嘉義縣", "臺南市", "高雄市", "屏東縣",
    "宜蘭縣", "花蓮縣", "臺東縣", "澎湖縣",
    "金門縣", "連江縣"
)

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

OFFICE_CITIES = {
    "基隆": "基隆市",
    "臺北": "臺北市",
    "台北": "臺北市",
    "新北": "新北市",
    "桃園": "桃園市",
    "苗栗": "苗栗縣",
    "臺中": "臺中市",
    "台中": "臺中市",
    "彰化": "彰化縣",
    "南投": "南投縣",
    "雲林": "雲林縣",
    "臺南": "臺南市",
    "台南": "臺南市",
    "高雄": "高雄市",
    "屏東": "屏東縣",
    "宜蘭": "宜蘭縣",
    "花蓮": "花蓮縣",
    "臺東": "臺東縣",
    "台東": "臺東縣",
    "澎湖": "澎湖縣",
    "金門": "金門縣",
    "馬祖": "連江縣"
}


# ============================================================
# 通用工具
# ============================================================

def clean(value):
    if value is None:
        return ""

    if isinstance(value, (list, tuple, set)):
        parts = [clean(x) for x in value]
        return "、".join(x for x in parts if x)

    if isinstance(value, dict):
        return ""

    text = re.sub(
        r"\s+", " ", str(value)
    ).strip()

    if text.lower() in (
        "", "null", "none", "nan",
        "undefined", "[]", "{}", "n/a"
    ):
        return ""

    return text


def normalize_city(value):
    return clean(value).replace("台", "臺")


def city_in(value):
    text = normalize_city(value)

    return [
        city for city in CITIES
        if city in text
    ]


def pick(row, *keys):
    if not isinstance(row, dict):
        return ""

    for key in keys:
        value = clean(row.get(key))
        if value:
            return value

    return ""


def parse_dt(value):
    text = clean(value)

    if not text:
        return None

    text = text.replace("T", " ")
    text = text.replace("Z", "+00:00")

    try:
        dt = datetime.fromisoformat(text)

        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=TZ)

        return dt.astimezone(TZ)

    except ValueError:
        pass

    text = (
        text.replace("年", "/")
        .replace("月", "/")
        .replace("日", " ")
        .replace("：", ":")
    )

    match = re.search(
        r"(?<!\d)"
        r"(\d{2,4})[/.-](\d{1,2})[/.-](\d{1,2})"
        r"(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?",
        text
    )

    if not match:
        return None

    year = int(match.group(1))

    if year < 1911:
        year += 1911

    try:
        return datetime(
            year,
            int(match.group(2)),
            int(match.group(3)),
            int(match.group(4) or 0),
            int(match.group(5) or 0),
            int(match.group(6) or 0),
            tzinfo=TZ
        )
    except ValueError:
        return None


def stamp(value):
    return value.isoformat() if value else None


def stable_id(prefix, *parts):
    content = "|".join(
        clean(part) for part in parts
    )

    digest = hashlib.sha256(
        content.encode("utf-8")
    ).hexdigest()[:24]

    return f"{prefix}-{digest}"


def is_current(item, now=None):
    """
    統一資料生命週期檢查。
    只有仍有效且落在顯示期間的資料可刊登。
    """
    if now is None:
        now = NOW

    if not isinstance(item, dict):
        return False

    category = clean(item.get("category"))

    start = parse_dt(item.get("starts_at"))
    end = parse_dt(item.get("ends_at"))

    if not start or not end:
        return False

    if end < start:
        return False

    # 已結束的公告直接淘汰
    if end <= now:
        return False

    if category == "天氣預報":
        return start < (
            now + timedelta(days=WEATHER_DAYS)
        )

    if category in ("預定停水", "預定停電"):
        return start < (
            now + timedelta(days=NOTICE_DAYS)
        )

    if category == "天氣警示":
        return True

    # 未來新增的公告類型，不在未定義
    # 保存期限時自動放進民生公告。
    return False


def safe_json(path, default):
    if not path.exists():
        return default

    try:
        with path.open(
            "r", encoding="utf-8"
        ) as file:
            return json.load(file)

    except (OSError, ValueError):
        return default


def write_atomic(path, obj):
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
        parsed = urlparse(url)

        host = (
            parsed.hostname or ""
        ).lower().rstrip(".")

        return (
            parsed.scheme == "https"
            and not parsed.username
            and not parsed.password
            and parsed.port in (None, 443)
            and any(
                host == domain
                or host.endswith("." + domain)
                for domain in HOSTS
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
            raise ValueError("不安全的轉址")

        return super().redirect_request(
            req, fp, code, msg, headers, target
        )


def fetch(url):
    if not allowed(url):
        raise ValueError("非允許的官方 HTTPS 網址")

    request = Request(
        url,
        headers={
            "User-Agent": "BanLaoYou/8.5.1",
            "Accept": (
                "application/json,text/csv,"
                "application/zip,application/xml,*/*"
            )
        }
    )

    opener = build_opener(SafeRedirect())

    with opener.open(
        request, timeout=35
    ) as response:

        if not allowed(response.geturl()):
            raise ValueError("最終網址不安全")

        data = response.read(MAX_BYTES + 1)

        if len(data) > MAX_BYTES:
            raise ValueError("檔案超過 20MB")

        return data


def unwrap(obj):
    if isinstance(obj, list):
        return [
            row for row in obj
            if isinstance(row, dict)
        ]

    if isinstance(obj, dict):
        for key in (
            "records", "data", "result", "items"
        ):
            value = obj.get(key)

            if isinstance(value, list):
                return unwrap(value)

            if isinstance(value, dict):
                try:
                    return unwrap(value)
                except ValueError:
                    pass

    raise ValueError("無法辨識資料列結構")


def rows_from_bytes(data):
    if data[:2] == b"PK":
        rows = []

        with zipfile.ZipFile(
            io.BytesIO(data)
        ) as archive:

            for info in archive.infolist():
                if info.is_dir():
                    continue

                if info.file_size > MAX_BYTES:
                    continue

                if info.filename.lower().endswith(
                    (".csv", ".json")
                ):
                    rows.extend(
                        rows_from_bytes(
                            archive.read(info)
                        )
                    )

        if not rows:
            raise ValueError(
                "ZIP 內沒有可讀取的 CSV/JSON"
            )

        return rows

    for encoding in (
        "utf-8-sig", "cp950", "big5"
    ):
        try:
            content = data.decode(encoding)

        except UnicodeError:
            continue

        try:
            return unwrap(json.loads(content))

        except (ValueError, TypeError):
            reader = csv.DictReader(
                io.StringIO(content)
            )

            if reader.fieldnames:
                return list(reader)

    raise ValueError("無法解析 JSON/CSV")


def dataset_urls(dataset_id):
    metadata_url = (
        "https://data.gov.tw/api/v2/rest/"
        f"dataset/{dataset_id}"
    )

    obj = json.loads(fetch(metadata_url))

    if isinstance(obj, list):
        if not obj:
            raise ValueError("資料集不存在")
        obj = obj[0]

    if (
        isinstance(obj, dict)
        and isinstance(obj.get("result"), dict)
    ):
        obj = obj["result"]

    if not isinstance(obj, dict):
        raise ValueError("資料集詮釋資料格式錯誤")

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

        for key in (
            "resourceDownloadUrl",
            "resourceDownloadURL",
            "downloadURL",
            "url"
        ):
            url = resource.get(key)

            if (
                isinstance(url, str)
                and allowed(url)
                and url not in urls
            ):
                urls.append(url)

    if not urls:
        raise ValueError(
            "找不到可下載的官方資料資源"
        )

    return urls


# ============================================================
# 停水公告
# ============================================================

def load_water():
    errors = []

    for url in dataset_urls(6050):
        try:
            rows = rows_from_bytes(fetch(url))
            output = []

            for row in rows:
                start = parse_dt(
                    pick(
                        row,
                        "案件日期時間",
                        "停水開始時間",
                        "停水時間"
                    )
                )

                end = parse_dt(
                    pick(
                        row,
                        "恢復日期時間",
                        "停水結束時間",
                        "復水時間"
                    )
                )

                if not start or not end:
                    continue

                county = pick(
                    row, "影響縣市", "縣市"
                )

                district = pick(
                    row, "影響行政區", "行政區"
                )

                area = pick(
                    row, "停水地區", "影響範圍"
                )

                cities = city_in(
                    county + " " + district + " " + area
                )

                if not cities:
                    continue

                reason = pick(
                    row, "停水原因", "原因"
                ) or "官方未提供詳細原因"

                case_number = pick(
                    row, "案件編號"
                )

                item = {
                    "id": stable_id(
                        "water",
                        case_number,
                        start.isoformat(),
                        end.isoformat(),
                        county,
                        district,
                        area
                    ),
                    "category": "預定停水",
                    "title": (
                        f"停水通知｜{county}{district}"
                    )[:120],
                    "summary": (
                        "影響地區："
                        + (
                            area
                            or "官方未提供詳細影響範圍"
                        )
                        + "；原因："
                        + reason
                    )[:300],
                    "cities": cities,
                    "district": district,
                    "starts_at": stamp(start),
                    "ends_at": stamp(end),
                    "source": "台灣自來水公司",
                    "url": (
                        "https://data.gov.tw/"
                        "dataset/6050"
                    )
                }

                if is_current(item):
                    output.append(item)

            print(
                f"[停水] 原始 {len(rows)} 筆，"
                f"符合時效 {len(output)} 筆"
            )

            return output

        except Exception as exc:
            errors.append(
                f"{type(exc).__name__}: {exc}"
            )

    raise RuntimeError(
        "; ".join(errors)[:300]
    )


# ============================================================
# 台電停電
# ============================================================

def power_times(raw):
    text = clean(raw)

    text = re.sub(
        r"[～〜－—–至到]", "~", text
    )

    text = (
        text.replace("：", ":")
        .replace("年", "/")
        .replace("月", "/")
        .replace("日", " ")
    )

    dates = list(re.finditer(
        r"(?<!\d)"
        r"\d{2,4}[/.-]\d{1,2}[/.-]\d{1,2}"
        r"(?!\d)",
        text
    ))

    times = list(re.finditer(
        r"(?<!\d)"
        r"(?:[01]?\d|2[0-3]):[0-5]\d"
        r"(?!\d)",
        text
    ))

    if not dates or len(times) < 2:
        return None, None

    first_date = dates[0].group()

    last_date = (
        dates[1].group()
        if len(dates) >= 2
        else first_date
    )

    start = parse_dt(
        first_date + " " + times[0].group()
    )

    end = parse_dt(
        last_date + " " + times[1].group()
    )

    if (
        start and end
        and end < start
        and len(dates) == 1
    ):
        end += timedelta(days=1)

    if not start or not end or end < start:
        return None, None

    return start, end


def power_row_times(row):
    for first, last in (
        ("停電開始時間", "停電結束時間"),
        ("開始時間", "結束時間"),
        ("預定停電開始時間", "預定停電結束時間")
    ):
        start = parse_dt(pick(row, first))
        end = parse_dt(pick(row, last))

        if start and end and end >= start:
            return start, end

    for field in (
        "第一次停電時間",
        "停電時間",
        "預定停電時間",
        "第二次停電時間"
    ):
        raw = pick(row, field)

        if raw:
            start, end = power_times(raw)

            if start and end:
                return start, end

    return None, None


def infer_cities(office, area):
    cities = city_in(area)

    if cities:
        return cities

    cities = city_in(office)

    if cities:
        return cities

    office = normalize_city(office)

    for prefix, city in OFFICE_CITIES.items():
        if office.startswith(
            normalize_city(prefix)
        ):
            return [city]

    return []


def load_power():
    errors = []

    for url in dataset_urls(26144):
        try:
            rows = rows_from_bytes(fetch(url))
            output = []

            skipped = Counter()

            print(
                f"[台電] 原始資料：{len(rows)} 筆"
            )

            if rows:
                print(
                    "[台電] 第一筆欄位：",
                    list(rows[0].keys())
                )

            for row in rows:
                start, end = power_row_times(row)

                if not start or not end:
                    skipped["時間無法解析"] += 1
                    continue

                if end <= NOW:
                    skipped["已過期"] += 1
                    continue

                if start >= (
                    NOW + timedelta(days=NOTICE_DAYS)
                ):
                    skipped["超出未來30天"] += 1
                    continue

                area = pick(
                    row,
                    "停電範圍",
                    "停電區域",
                    "停電地區"
                )

                if not area:
                    skipped["缺少停電範圍"] += 1
                    continue

                office = pick(
                    row,
                    "營業區處",
                    "區處",
                    "營業處"
                )

                cities = infer_cities(
                    office, area
                )

                if not cities:
                    skipped["無法辨識縣市"] += 1
                    continue

                case_number = pick(
                    row,
                    "請求號數",
                    "案件編號"
                )

                reason = pick(
                    row,
                    "工作概述",
                    "停電原因"
                ) or "官方未提供詳細原因"

                # 不再只用請求號數當 ID，
                # 避免不同區處或時段互相覆蓋。
                item = {
                    "id": stable_id(
                        "power",
                        office,
                        case_number,
                        start.isoformat(),
                        end.isoformat(),
                        area
                    ),
                    "category": "預定停電",
                    "title": (
                        "預定停電｜"
                        + (office or area[:20])
                    )[:120],
                    "summary": (
                        f"停電範圍：{area}；"
                        f"工作內容：{reason}；"
                        "查詢電話：1911"
                    )[:300],
                    "cities": cities,
                    "district": "",
                    "starts_at": stamp(start),
                    "ends_at": stamp(end),
                    "source": "台灣電力公司",
                    "url": (
                        "https://data.gov.tw/"
                        "dataset/26144"
                    )
                }

                if is_current(item):
                    output.append(item)

            unique = {
                item["id"]: item
                for item in output
            }

            print(
                "[台電] 排除統計：",
                json.dumps(
                    dict(skipped),
                    ensure_ascii=False
                )
            )

            print(
                f"[台電] 時效內 {len(output)} 筆，"
                f"去重後 {len(unique)} 筆，"
                f"重複 {len(output) - len(unique)} 筆"
            )

            return list(unique.values())

        except Exception as exc:
            errors.append(
                f"{type(exc).__name__}: {exc}"
            )

    raise RuntimeError(
        "; ".join(errors)[:300]
    )


# ============================================================
# 中央氣象署天氣預報
# ============================================================

def cwa(api_id, key):
    url = (
        "https://opendata.cwa.gov.tw/"
        "api/v1/rest/datastore/"
        + api_id
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
            f"{api_id} API 未成功："
            + clean(obj.get("message"))[:100]
        )

    return obj


def weather_value(elements, code, index):
    for element in elements:
        if element.get("elementName") != code:
            continue

        periods = element.get("time", [])

        if index < len(periods):
            return clean(
                periods[index]
                .get("parameter", {})
                .get("parameterName")
            )

    return ""


def load_forecast(key):
    obj = cwa("F-C0032-001", key)

    locations = (
        obj.get("records", {})
        .get("location", [])
    )

    output = []

    for location in locations:
        city = normalize_city(
            location.get("locationName")
        )

        if city not in CITIES:
            continue

        elements = location.get(
            "weatherElement", []
        )

        periods = next(
            (
                element.get("time", [])
                for element in elements
                if element.get("elementName") == "Wx"
            ),
            []
        )

        for index, period in enumerate(periods):
            start = parse_dt(
                period.get("startTime")
            )

            end = parse_dt(
                period.get("endTime")
            )

            if not start or not end:
                continue

            condition = weather_value(
                elements, "Wx", index
            )

            low = weather_value(
                elements, "MinT", index
            )

            high = weather_value(
                elements, "MaxT", index
            )

            rain = weather_value(
                elements, "PoP", index
            )

            item = {
                "id": stable_id(
                    "weather",
                    city,
                    start.isoformat(),
                    end.isoformat()
                ),
                "category": "天氣預報",
                "title": (
                    f"{city}天氣｜{condition}"
                ),
                "summary": (
                    f"氣溫 {low}～{high}°C，"
                    f"降雨機率 {rain}%。"
                ),
                "cities": [city],
                "district": "",
                "starts_at": stamp(start),
                "ends_at": stamp(end),
                "source": "中央氣象署",
                "url": "https://www.cwa.gov.tw/"
            }

            if is_current(item):
                output.append(item)

    print(
        f"[天氣] 時效內預報：{len(output)} 筆"
    )

    return output


# ============================================================
# 氣象警示 CAP
# ============================================================

def cap_text(element, name):
    for child in element.iter():
        if (
            child.tag.rsplit("}", 1)[-1] == name
            and child.text
        ):
            return clean(child.text)

    return ""


def load_alert_file(api_id, key):
    url = (
        "https://opendata.cwa.gov.tw/"
        "fileapi/v1/opendataapi/"
        + api_id
        + "?"
        + urlencode({
            "Authorization": key,
            "format": "CAP"
        })
    )

    raw = fetch(url)
    root = ET.fromstring(raw)

    if root.tag.rsplit("}", 1)[-1] == "alert":
        alerts = [root]

    else:
        alerts = [
            element
            for element in root.iter()
            if element.tag.rsplit("}", 1)[-1]
            == "alert"
        ]

    output = []

    for alert in alerts:
        identifier = cap_text(
            alert, "identifier"
        )

        infos = [
            element
            for element in alert
            if element.tag.rsplit("}", 1)[-1]
            == "info"
        ]

        for info in infos:
            title = (
                cap_text(info, "headline")
                or cap_text(info, "event")
            )

            start = parse_dt(
                cap_text(info, "effective")
                or cap_text(info, "onset")
                or cap_text(alert, "sent")
            )

            end = parse_dt(
                cap_text(info, "expires")
            )

            if not title or not end:
                continue

            areas = [
                element
                for element in info.iter()
                if element.tag.rsplit("}", 1)[-1]
                == "area"
            ]

            cities = city_in(
                " ".join(
                    cap_text(area, "areaDesc")
                    for area in areas
                )
            )

            if not cities:
                continue

            summary = (
                cap_text(info, "description")
                or cap_text(info, "instruction")
                or "請查看中央氣象署警示內容。"
            )

            item = {
                "id": stable_id(
                    "alert",
                    api_id,
                    identifier,
                    title,
                    stamp(start),
                    stamp(end),
                    ",".join(cities)
                ),
                "category": "天氣警示",
                "title": title[:120],
                "summary": summary[:300],
                "cities": cities,
                "district": "",
                "starts_at": stamp(start),
                "ends_at": stamp(end),
                "source": "中央氣象署",
                "url": "https://www.cwa.gov.tw/",
                "api_id": api_id
            }

            if is_current(item):
                output.append(item)

    return output


def nested_strings(obj):
    if isinstance(obj, str):
        yield obj

    elif isinstance(obj, list):
        for value in obj:
            yield from nested_strings(value)

    elif isinstance(obj, dict):
        for value in obj.values():
            yield from nested_strings(value)


def load_alert(api_id, key):
    try:
        obj = cwa(api_id, key)

    except (HTTPError, ValueError) as rest_error:
        try:
            return load_alert_file(api_id, key)

        except Exception as file_error:
            raise RuntimeError(
                f"REST 失敗：{rest_error}; "
                f"CAP 失敗：{file_error}"
            ) from file_error

    records = obj.get("records", {})
    candidates = []

    def walk(value):
        if isinstance(value, dict):
            if any(
                key in value
                for key in (
                    "headline",
                    "event",
                    "alertName",
                    "title"
                )
            ):
                candidates.append(value)

            for child in value.values():
                walk(child)

        elif isinstance(value, list):
            for child in value:
                walk(child)

    walk(records)

    output = []

    for row in candidates:
        title = pick(
            row,
            "headline",
            "alertName",
            "title",
            "event"
        )

        start = parse_dt(
            pick(
                row,
                "effective",
                "onset",
                "startTime",
                "issueTime"
            )
        )

        end = parse_dt(
            pick(
                row,
                "expires",
                "endTime",
                "expireTime"
            )
        )

        if not title or not end:
            continue

        cities = city_in(
            " ".join(nested_strings(row))
        )

        if not cities:
            continue

        summary = pick(
            row,
            "description",
            "instruction",
            "content",
            "summary"
        ) or "請查看中央氣象署警示內容。"

        item = {
            "id": stable_id(
                "alert",
                api_id,
                title,
                stamp(start),
                stamp(end),
                ",".join(cities)
            ),
            "category": "天氣警示",
            "title": title[:120],
            "summary": summary[:300],
            "cities": cities,
            "district": "",
            "starts_at": stamp(start),
            "ends_at": stamp(end),
            "source": "中央氣象署",
            "url": "https://www.cwa.gov.tw/",
            "api_id": api_id
        }

        if is_current(item):
            output.append(item)

    return output


# ============================================================
# 資料來源狀態
# ============================================================

def source_group(item):
    if item.get("category") == "天氣警示":
        return item.get("api_id")

    return item.get("category")


def last_success(previous_status, name):
    old_sources = previous_status.get(
        "sources", {}
    )

    if not isinstance(old_sources, dict):
        return None

    old = old_sources.get(name, {})

    if not isinstance(old, dict):
        return None

    value = old.get("last_success_at")

    if value:
        return parse_dt(value)

    # 相容 V8.5：舊版成功狀態只有 checked_at
    if old.get("state") == "ok":
        return parse_dt(
            previous_status.get("checked_at")
        )

    return None


def status_entry(
    name,
    state,
    items,
    previous_status,
    message=""
):
    now_utc = datetime.now(
        timezone.utc
    )

    if state == "ok":
        success = now_utc.astimezone(TZ)

    else:
        success = last_success(
            previous_status, name
        )

    entry = {
        "state": state,
        "items": items,
        "last_success_at": (
            success.astimezone(
                timezone.utc
            ).isoformat()
            if success else None
        )
    }

    if message:
        entry["message"] = message[:250]

    if success:
        hours = (
            NOW - success
        ).total_seconds() / 3600

        entry["hours_since_success"] = round(
            max(0, hours), 1
        )

        entry["stale"] = (
            hours > STALE_HOURS
        )

    else:
        entry["hours_since_success"] = None
        entry["stale"] = True

    return entry


# ============================================================
# 主程序
# ============================================================

def main():
    DATA.mkdir(
        parents=True,
        exist_ok=True
    )

    previous_data = safe_json(
        OUT, {}
    )

    previous_status = safe_json(
        STATUS, {}
    )

    old_items = previous_data.get(
        "items", []
    )

    if not isinstance(old_items, list):
        old_items = []

    status = {}
    collected = []

    sources = [
        ("預定停水", load_water),
        ("預定停電", load_power)
    ]

    key = os.environ.get(
        "CWA_API_KEY", ""
    ).strip()

    if key:
        sources.append((
            "天氣預報",
            lambda: load_forecast(key)
        ))

        for code in ALERT_IDS:
            sources.append((
                code,
                lambda c=code: load_alert(c, key)
            ))

    else:
        for name in (
            "天氣預報",
        ) + ALERT_IDS:
            status[name] = status_entry(
                name,
                "not_configured",
                0,
                previous_status,
                "缺少 CWA_API_KEY"
            )

    for name, function in sources:
        try:
            items = function()

            # 所有來源都統一執行時效檢查
            valid = [
                item for item in items
                if is_current(item)
            ]

            status[name] = status_entry(
                name,
                "ok",
                len(valid),
                previous_status
            )

            collected.extend(valid)

        except Exception as exc:
            message = (
                f"{type(exc).__name__}: "
                f"{str(exc)[:200]}"
            )

            print(
                f"[來源錯誤] {name}: {message}"
            )

            status[name] = status_entry(
                name,
                "error",
                0,
                previous_status,
                message
            )

    # 來源更新失敗時：
    # 只保留仍在時效內的舊資料。
    # 來源成功時：
    # 以新資料取代舊資料。
    retained = []

    for item in old_items:
        if not is_current(item):
            continue

        group = source_group(item)

        if not group:
            continue

        current_state = status.get(
            group, {}
        ).get("state")

        if current_state != "ok":
            retained.append(item)

    # 舊版 ID 與新版 ID 不同時，
    # 用公告內容建立統一的去重鍵。
    unique = {}

    for item in retained + collected:
        key_parts = (
            item.get("category"),
            item.get("source"),
            item.get("title"),
            item.get("summary"),
            item.get("starts_at"),
            item.get("ends_at"),
            ",".join(item.get("cities", []))
        )

        identity = stable_id(
            "record", *key_parts
        )

        unique[identity] = item

    final_items = [
        item for item in unique.values()
        if is_current(item)
    ]

    final_items.sort(
        key=lambda item: (
            item.get("starts_at") or "",
            item.get("category") or "",
            item.get("id") or ""
        )
    )

    generated_at = datetime.now(
        timezone.utc
    ).isoformat()

    category_counts = dict(
        Counter(
            item.get("category", "其他")
            for item in final_items
        )
    )

    result = {
        "generated_at": generated_at,
        "items": final_items
    }

    report = {
        "checked_at": generated_at,
        "version": "8.5.1",
        "retention": {
            "weather_days": WEATHER_DAYS,
            "water_days": NOTICE_DAYS,
            "power_days": NOTICE_DAYS,
            "stale_hours": STALE_HOURS
        },
        "sources": status,
        "items": len(final_items),
        "category_counts": category_counts,
        "removed_expired_old_items": sum(
            1 for item in old_items
            if not is_current(item)
        ),
        "note": (
            "所有刊登資料均通過時效檢查；"
            "來源更新失敗時僅保留仍有效的舊公告。"
            "stale 表示距離最近一次成功更新"
            "已超過 24 小時，或從未成功更新。"
        )
    }

    write_atomic(OUT, result)
    write_atomic(STATUS, report)

    print(
        "[V8.5.1] 更新完成"
    )

    print(
        "[V8.5.1] 分類統計：",
        json.dumps(
            category_counts,
            ensure_ascii=False
        )
    )

    print(
        "[V8.5.1] 淘汰舊資料：",
        report["removed_expired_old_items"]
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

    except Exception as exc:
        print(
            "民生資訊更新失敗："
            + str(exc),
            file=sys.stderr
        )
        sys.exit(1)
