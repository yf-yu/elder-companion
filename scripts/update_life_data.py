
import csv
import io
import json
import os
import re
import sys
import zipfile
import xml.etree.ElementTree as ET

from datetime import datetime, timedelta, timezone
from pathlib import Path
from urllib.error import HTTPError
from urllib.parse import urlencode, urlparse, urljoin
from urllib.request import HTTPRedirectHandler, Request, build_opener


# ============================================================
# 伴老友 V8.5｜民生資訊整合
# 停水、停電、天氣預報、氣象警示
# ============================================================

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
    "新北": "新北市",
    "桃園": "桃園市",
    "苗栗": "苗栗縣",
    "臺中": "臺中市",
    "彰化": "彰化縣",
    "南投": "南投縣",
    "雲林": "雲林縣",
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


# ============================================================
# 安全下載與資料解析
# ============================================================

def allowed(url):
    try:
        p = urlparse(url)
        host = (p.hostname or "").lower().rstrip(".")

        return (
            p.scheme == "https"
            and not p.username
            and not p.password
            and p.port in (None, 443)
            and any(
                host == domain or host.endswith("." + domain)
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
        raise ValueError("非官方 HTTPS 網址")

    req = Request(
        url,
        headers={
            "User-Agent": "BanLaoYou/8.5",
            "Accept": (
                "application/json,text/csv,"
                "application/zip,application/xml,*/*"
            )
        }
    )

    opener = build_opener(SafeRedirect())

    with opener.open(req, timeout=35) as response:
        if not allowed(response.geturl()):
            raise ValueError("最終網址不安全")

        data = response.read(MAX_BYTES + 1)

        if len(data) > MAX_BYTES:
            raise ValueError("檔案超過 20MB")

        return data


def clean(value):
    """清理空值、陣列、無效文字。"""
    if value is None:
        return ""

    if isinstance(value, (list, tuple, set)):
        parts = [clean(x) for x in value]
        return "、".join(x for x in parts if x)

    if isinstance(value, dict):
        return ""

    text = re.sub(r"\s+", " ", str(value)).strip()

    if text.lower() in (
        "", "null", "none", "nan", "undefined",
        "[]", "{}", "n/a"
    ):
        return ""

    return text


def parse_dt(value):
    s = clean(value)

    if not s:
        return None

    s = s.replace("T", " ").replace("Z", "+00:00")

    try:
        d = datetime.fromisoformat(s)
        return (
            d.replace(tzinfo=TZ)
            if d.tzinfo is None
            else d.astimezone(TZ)
        )
    except ValueError:
        pass

    m = re.match(
        r"^(\d{2,4})[/.-](\d{1,2})[/.-](\d{1,2})"
        r"(?:\s+(\d{1,2}):(\d{2}))?",
        s
    )

    if not m:
        return None

    year = int(m[1])

    if year < 1911:
        year += 1911

    try:
        return datetime(
            year, int(m[2]), int(m[3]),
            int(m[4] or 0), int(m[5] or 0),
            tzinfo=TZ
        )
    except ValueError:
        return None


def stamp(value):
    return value.isoformat() if value else None


def pick(row, *keys):
    for key in keys:
        value = clean(row.get(key))
        if value:
            return value
    return ""


def unwrap(obj):
    if isinstance(obj, list):
        return [x for x in obj if isinstance(x, dict)]

    if isinstance(obj, dict):
        for key in ("records", "data", "result", "items"):
            value = obj.get(key)

            if isinstance(value, list):
                return unwrap(value)

            if isinstance(value, dict):
                for child in value.values():
                    if isinstance(child, list):
                        return unwrap(child)

    raise ValueError("無法辨識資料列結構")


def rows_from_bytes(data):
    if data[:2] == b"PK":
        rows = []

        with zipfile.ZipFile(io.BytesIO(data)) as archive:
            for info in archive.infolist():
                if info.is_dir() or info.file_size > MAX_BYTES:
                    continue

                if info.filename.lower().endswith(
                    (".csv", ".json")
                ):
                    rows.extend(
                        rows_from_bytes(archive.read(info))
                    )

        if not rows:
            raise ValueError("ZIP 內沒有可讀的 CSV/JSON")

        return rows

    for encoding in ("utf-8-sig", "cp950", "big5"):
        try:
            content = data.decode(encoding)
        except UnicodeError:
            continue

        try:
            return unwrap(json.loads(content))
        except (ValueError, TypeError):
            reader = csv.DictReader(io.StringIO(content))

            if reader.fieldnames:
                return list(reader)

    raise ValueError("無法解析 JSON/CSV")


def dataset_urls(dataset_id):
    url = (
        "https://data.gov.tw/api/v2/rest/"
        f"dataset/{dataset_id}"
    )

    obj = json.loads(fetch(url))

    if isinstance(obj, list):
        obj = obj[0]

    if (
        isinstance(obj, dict)
        and isinstance(obj.get("result"), dict)
    ):
        obj = obj["result"]

    if not isinstance(obj, dict):
        raise ValueError("詮釋資料格式錯誤")

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
            value = resource.get(key)

            if (
                isinstance(value, str)
                and allowed(value)
                and value not in urls
            ):
                urls.append(value)

    if not urls:
        raise ValueError("找不到官方資源下載網址")

    return urls


def city_in(value):
    text = str(value or "").replace("台", "臺")
    return [city for city in CITIES if city in text]


def infer_cities(office, area):
    cities = city_in(
        str(office or "") + " " + str(area or "")
    )

    if cities:
        return cities

    office = str(office or "").replace("台", "臺")

    for prefix, city in OFFICE_CITIES.items():
        if office.startswith(prefix):
            return [city]

    # 新竹與嘉義可能跨縣市，不能只憑區處推斷。
    return []


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
                        row, "案件日期時間",
                        "停水開始時間", "停水時間"
                    )
                )

                end = parse_dt(
                    pick(
                        row, "恢復日期時間",
                        "停水結束時間", "復水時間"
                    )
                )

                if (
                    not start or not end
                    or end < NOW or end < start
                ):
                    continue

                area = pick(
                    row, "停水地區", "影響範圍"
                )
                county = pick(
                    row, "影響縣市", "縣市"
                )
                district = pick(
                    row, "影響行政區", "行政區"
                )

                cities = city_in(
                    county + " " + district + " " + area
                )

                if not cities:
                    continue

                item_id = pick(row, "案件編號") or (
                    f"{start.isoformat()}-{county}-{area}"
                )

                reason = pick(
                    row, "停水原因", "原因"
                ) or "官方未提供詳細原因"

                output.append({
                    "id": "water-" + clean(item_id)[:130],
                    "category": "預定停水",
                    "title": (
                        f"停水通知｜{county}{district}"
                        if county or district
                        else "停水通知"
                    )[:120],
                    "summary": (
                        "影響地區："
                        + (area or "官方未提供詳細影響範圍")
                        + "；原因："
                        + reason
                    )[:300],
                    "cities": cities,
                    "district": district,
                    "starts_at": stamp(start),
                    "ends_at": stamp(end),
                    "source": "台灣自來水公司",
                    "url": "https://data.gov.tw/dataset/6050"
                })

            print(
                f"[停水診斷] 原始 {len(rows)} 筆，"
                f"有效 {len(output)} 筆"
            )
            return output

        except Exception as exc:
            errors.append(
                f"{type(exc).__name__}: {exc}"
            )

    raise RuntimeError("; ".join(errors)[:300])


# ============================================================
# 台電停電公告
# ============================================================

def power_times(raw):
    """支援民國、西元、跨日停電時段。"""
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
        r"(?<!\d)\d{2,4}[/.-]\d{1,2}[/.-]\d{1,2}(?!\d)",
        text
    ))

    times = list(re.finditer(
        r"(?<!\d)(?:[01]?\d|2[0-3]):[0-5]\d(?!\d)",
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

    if start and end and end < start and len(dates) == 1:
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


def load_power():
    errors = []

    for url in dataset_urls(26144):
        try:
            rows = rows_from_bytes(fetch(url))
            output = []

            skipped = {
                "時間無法解析": 0,
                "已過期": 0,
                "缺少停電範圍": 0,
                "無法辨識縣市": 0
            }

            print(
                f"[台電診斷] 原始資料筆數：{len(rows)}"
            )

            if rows:
                print(
                    "[台電診斷] 第一筆資料欄位：",
                    list(rows[0].keys())
                )

                # 不在 Actions 紀錄公開完整地址及電話。
                sample = {
                    key: clean(value)[:100]
                    for key, value in rows[0].items()
                    if "時間" in key or "日期" in key
                }

                print(
                    "[台電診斷] 時間欄位範例：",
                    sample
                )

            for row in rows:
                start, end = power_row_times(row)

                if not start or not end:
                    skipped["時間無法解析"] += 1
                    continue

                if end < NOW:
                    skipped["已過期"] += 1
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

                cities = infer_cities(office, area)

                if not cities:
                    skipped["無法辨識縣市"] += 1
                    continue

                item_id = pick(
                    row, "請求號數", "案件編號"
                ) or f"{start.isoformat()}-{area}"

                reason = pick(
                    row, "工作概述", "停電原因"
                ) or "官方未提供詳細原因"

                output.append({
                    "id": "power-" + clean(item_id)[:130],
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
                    "url": "https://data.gov.tw/dataset/26144"
                })

            print(
                "[台電診斷] 排除原因統計：",
                json.dumps(
                    skipped, ensure_ascii=False
                )
            )

            print(
                f"[台電診斷] 有效公告筆數：{len(output)}"
            )

            return output

        except Exception as exc:
            errors.append(
                f"{type(exc).__name__}: {exc}"
            )

    raise RuntimeError("; ".join(errors)[:300])


# ============================================================
# 中央氣象署 API
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
        city = clean(
            location.get("locationName")
        ).replace("台", "臺")

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

            if not start or not end or end < NOW:
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

            output.append({
                "id": (
                    f"weather-{city}-{start.isoformat()}"
                ),
                "category": "天氣預報",
                "title": f"{city}天氣｜{condition}",
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
            })

    if not output:
        raise ValueError("沒有有效的預報時段")

    return output


# ============================================================
# 氣象警示 CAP 解析
# ============================================================

def nested_strings(obj):
    if isinstance(obj, str):
        yield obj

    elif isinstance(obj, list):
        for value in obj:
            yield from nested_strings(value)

    elif isinstance(obj, dict):
        for key, value in obj.items():
            if key not in ("Authorization", "apikey"):
                yield from nested_strings(value)


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
            if element.tag.rsplit("}", 1)[-1] == "alert"
        ]

    output = []

    for index, alert in enumerate(alerts):
        infos = [
            element
            for element in alert
            if element.tag.rsplit("}", 1)[-1] == "info"
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

            if not title or not end or end < NOW:
                continue

            summary = (
                cap_text(info, "description")
                or cap_text(info, "instruction")
            )

            areas = [
                element
                for element in info.iter()
                if element.tag.rsplit("}", 1)[-1] == "area"
            ]

            cities = city_in(
                " ".join(
                    cap_text(area, "areaDesc")
                    for area in areas
                )
            )

            if not cities:
                continue

            output.append({
                "id": (
                    f"{api_id}-cap-{index}-"
                    f"{end.isoformat()}"
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
            })

    return output


def load_alert(api_id, key):
    try:
        obj = cwa(api_id, key)

    except (HTTPError, ValueError) as rest_error:
        try:
            return load_alert_file(api_id, key)

        except Exception as file_error:
            raise RuntimeError(
                f"REST 失敗：{rest_error}; "
                f"CAP 檔案 API 失敗：{file_error}"
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

    for index, row in enumerate(candidates):
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

        if not title or not end or end < NOW:
            continue

        summary = pick(
            row,
            "description",
            "instruction",
            "content",
            "summary"
        ) or (
            "請查看中央氣象署原始"
            "警示內容及適用地區。"
        )

        cities = city_in(
            " ".join(nested_strings(row))
        )

        if not cities:
            continue

        output.append({
            "id": (
                f"{api_id}-{index}-{end.isoformat()}"
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
        })

    return output


# ============================================================
# 整合更新、來源狀態與安全寫入
# ============================================================

def main():
    DATA.mkdir(parents=True, exist_ok=True)

    previous = {}

    if OUT.exists():
        try:
            previous = json.loads(
                OUT.read_text(encoding="utf-8")
            )
        except (ValueError, OSError):
            previous = {}

    old = previous.get("items", [])

    if not isinstance(old, list):
        old = []

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
        for name in ("天氣預報",) + ALERT_IDS:
            status[name] = {
                "state": "not_configured",
                "items": 0,
                "message": "缺少 CWA_API_KEY"
            }

    for name, function in sources:
        try:
            items = function()

            status[name] = {
                "state": "ok",
                "items": len(items),
                "note": (
                    "來源請求成功且完成解析；"
                    "0 筆不代表官方沒有事件"
                )
            }

            collected.extend(items)

        except Exception as exc:
            message = (
                f"{type(exc).__name__}: {str(exc)[:200]}"
            )

            print(f"[來源錯誤] {name}: {message}")

            status[name] = {
                "state": "error",
                "items": 0,
                "message": message[:250]
            }

    # 更新失敗時保留尚未過期的舊公告。
    # 更新成功時採用新公告。
    keep = []

    for item in old:
        if not isinstance(item, dict):
            continue

        end = parse_dt(item.get("ends_at"))

        if not end or end < NOW:
            continue

        if item.get("category") == "天氣警示":
            group = item.get("api_id")
        else:
            group = item.get("category")

        if status.get(group, {}).get("state") != "ok":
            keep.append(item)

    unique = {}

    for item in keep + collected:
        unique[item["id"]] = item

    generated_at = datetime.now(
        timezone.utc
    ).isoformat()

    result = {
        "generated_at": generated_at,
        "items": list(unique.values())
    }

    report = {
        "checked_at": generated_at,
        "sources": status,
        "items": len(result["items"]),
        "note": (
            "ok 且 0 筆僅代表程式解析後"
            "沒有有效事件；無法解析或缺少"
            "地區的公告不刊登。"
        )
    }

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

    write_atomic(OUT, result)
    write_atomic(STATUS, report)

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
            "民生整合錯誤：" + str(exc),
            file=sys.stderr
        )
        sys.exit(1)
