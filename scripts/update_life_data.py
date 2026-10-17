
"""伴老友 V8.2｜民生資料整合。Python 3.12 標準函式庫。"""

import csv
import io
import json
import os
import re
import sys
import zipfile

from datetime import datetime, timedelta, timezone
from pathlib import Path
from urllib.parse import urlparse, urlencode
from urllib.request import Request, urlopen

ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "data" / "announcements.json"
REPORT = ROOT / "data" / "life_source_status.json"

TZ = timezone(timedelta(hours=8))
NOW = datetime.now(TZ)
MAX_BYTES = 15 * 1024 * 1024

DATASETS = {
    "預定停電": 26144,
    "預定停水": 6050,
}

CITIES = (
    "基隆市", "臺北市", "新北市", "桃園市",
    "新竹市", "新竹縣", "苗栗縣", "臺中市",
    "彰化縣", "南投縣", "雲林縣", "嘉義市",
    "嘉義縣", "臺南市", "高雄市", "屏東縣",
    "宜蘭縣", "花蓮縣", "臺東縣", "澎湖縣",
    "金門縣", "連江縣",
)

ALLOWED_HOSTS = (
    "data.gov.tw",
    "file.data.gov.tw",
    "opendata.cwa.gov.tw",
    "taipower.com.tw",
    "water.gov.tw",
)

def allowed(url):
    p = urlparse(url)
    host = (p.hostname or "").lower()
    return (
        p.scheme == "https"
        and not p.username
        and not p.password
        and p.port in (None, 443)
        and any(
            host == domain or host.endswith("." + domain)
            for domain in ALLOWED_HOSTS
        )
    )

def fetch(url):
    if not allowed(url):
        raise ValueError("未允許的下載網址：" + url)
    req = Request(
        url,
        headers={"User-Agent": "BanLaoYou/8.2"}
    )
    with urlopen(req, timeout=30) as response:
        if not allowed(response.geturl()):
            raise ValueError("下載重新導向至未允許網址")
        data = response.read(MAX_BYTES + 1)
    if len(data) > MAX_BYTES:
        raise ValueError("資料超過大小限制")
    return data

def text(value):
    return re.sub(r"\s+", " ", str(value or "")).strip()

def field(row, *names):
    for name in names:
        value = row.get(name)
        if value is not None and text(value):
            return text(value)
    return ""

def parse_time(value):
    value = text(value)
    if not value:
        return None

    value = value.replace("T", " ").replace("Z", "+00:00")
    try:
        dt = datetime.fromisoformat(value)
        return dt.replace(tzinfo=TZ) if dt.tzinfo is None else dt.astimezone(TZ)
    except ValueError:
        pass

    for fmt in (
        "%Y/%m/%d %H:%M",
        "%Y/%m/%d %H:%M:%S",
        "%Y-%m-%d %H:%M",
        "%Y-%m-%d %H:%M:%S",
        "%Y/%m/%d",
        "%Y-%m-%d",
    ):
        try:
            return datetime.strptime(value, fmt).replace(tzinfo=TZ)
        except ValueError:
            continue
    return None

def metadata(dataset_id):
    url = f"https://data.gov.tw/api/v2/rest/dataset/{dataset_id}"
    obj = json.loads(fetch(url))
    if isinstance(obj, dict) and isinstance(obj.get("result"), dict):
        obj = obj["result"]
    if isinstance(obj, list):
        obj = obj[0]
    if not isinstance(obj, dict):
        raise ValueError("資料集詮釋資料格式不符")
    return obj

def resource_urls(obj):
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
        url = (
            resource.get("resourceDownloadUrl")
            or resource.get("resourceDownloadURL")
            or resource.get("downloadURL")
            or resource.get("url")
        )
        if isinstance(url, str) and allowed(url):
            urls.append(url)
    return urls

def decode_csv(data):
    for encoding in ("utf-8-sig", "cp950", "big5"):
        try:
            content = data.decode(encoding)
            return list(csv.DictReader(io.StringIO(content)))
        except UnicodeError:
            continue
    raise ValueError("CSV 編碼無法解析")

def decode_rows(data):
    if data[:2] == b"PK":
        rows = []
        with zipfile.ZipFile(io.BytesIO(data)) as archive:
            for info in archive.infolist():
                if info.is_dir() or info.file_size > MAX_BYTES:
                    continue
                if info.filename.lower().endswith((".csv", ".json")):
                    rows.extend(decode_rows(archive.read(info)))
        return rows

    try:
        obj = json.loads(data.decode("utf-8-sig"))
        if isinstance(obj, list):
            return [r for r in obj if isinstance(r, dict)]
        if isinstance(obj, dict):
            for key in ("records", "data", "result", "items"):
                value = obj.get(key)
                if isinstance(value, list):
                    return [r for r in value if isinstance(r, dict)]
                if isinstance(value, dict):
                    for child in value.values():
                        if isinstance(child, list):
                            return [r for r in child if isinstance(r, dict)]
    except (ValueError, UnicodeError):
        pass

    return decode_csv(data)

def make_item(title, summary, category, source, url, published=None):
    return {
        "title": text(title)[:160],
        "summary": text(summary)[:280],
        "category": category,
        "source": source,
        "url": url,
        "published_at": (
            published.astimezone(timezone.utc).isoformat()
            if published else NOW.astimezone(timezone.utc).isoformat()
        ),
    }

def parse_water(row):
    start = parse_time(field(
        row, "案件日期時間", "停水時間", "停水開始時間"
    ))
    end = parse_time(field(
        row, "恢復日期時間", "復水時間", "停水結束時間"
    ))

    # 不知道時間或已經結束的事件不發布。
    if not start or not end or end < NOW:
        return None

    city = field(row, "影響縣市", "縣市")
    district = field(row, "影響行政區", "行政區")
    area = field(row, "停水地區", "影響範圍")
    reason = field(row, "停水原因", "原因")

    if not (city or district or area):
        return None

    title = f"停水資訊｜{city}{district}"
    summary = (
        f"停水：{start:%m/%d %H:%M}；"
        f"預計恢復：{end:%m/%d %H:%M}。"
        f"影響地區：{area}。原因：{reason}"
    )

    return make_item(
        title, summary, "預定停水",
        "台灣自來水公司",
        "https://data.gov.tw/dataset/6050",
        start,
    )

def parse_power(row):
    area = field(row, "停電範圍", "停電地區", "停電區域")
    start_raw = field(row, "第一次停電時間")
    second = field(row, "第二次停電時間")
    office = field(row, "營業區處")
    description = field(row, "工作概述")

    if not area or not start_raw:
        return None

    # 台電可能把起訖時間放在同一欄。
    # 無法可靠解析時，不猜測停電日期。
    matches = re.findall(
        r"\d{4}[/\-]\d{1,2}[/\-]\d{1,2}"
        r"(?:\s+\d{1,2}:\d{2}(?::\d{2})?)?",
        start_raw + " " + second,
    )
    dates = [parse_time(x) for x in matches]
    dates = [x for x in dates if x]

    if not dates or max(dates) < NOW - timedelta(days=1):
        return None

    summary = (
        f"區處：{office}。"
        f"停電時間：{start_raw}。"
        f"{'第二次停電：' + second + '。' if second else ''}"
        f"範圍：{area}。"
        f"工作內容：{description}。"
        "請以台電官方資訊確認實際停電時段。"
    )

    return make_item(
        f"預定停電｜{office or area[:18]}",
        summary,
        "預定停電",
        "台灣電力公司",
        "https://data.gov.tw/dataset/26144",
        min(dates),
    )

def load_dataset(category, dataset_id):
    obj = metadata(dataset_id)
    urls = resource_urls(obj)
    if not urls:
        raise ValueError("找不到資料資源下載網址")

    parser = parse_water if category == "預定停水" else parse_power
    errors = []

    for url in urls:
        try:
            rows = decode_rows(fetch(url))
            items = [parser(row) for row in rows]
            return [item for item in items if item]
        except Exception as exc:
            errors.append(str(exc))

    raise RuntimeError("; ".join(errors)[:300])

def load_weather():
    key = os.environ.get("CWA_API_KEY", "").strip()
    if not key:
        raise RuntimeError("未設定 CWA_API_KEY")

    base = (
        "https://opendata.cwa.gov.tw/api/v1/rest/"
        "datastore/F-C0032-001"
    )
    url = base + "?" + urlencode({
        "Authorization": key,
        "format": "JSON",
    })
    obj = json.loads(fetch(url))
    if str(obj.get("success", "")).lower() not in ("true", "1"):
        raise ValueError("氣象署 API 未回傳成功")

    locations = obj.get("records", {}).get("location", [])
    items = []

    for location in locations:
        city = location.get("locationName", "")
        if city not in CITIES:
            continue

        elements = {
            e.get("elementName"): e.get("time", [])
            for e in location.get("weatherElement", [])
        }
        wx = elements.get("Wx", [])
        if not wx:
            continue

        period = wx[0]
        start = parse_time(period.get("startTime"))
        end = parse_time(period.get("endTime"))
        if not end or end < NOW:
            continue

        def value(element):
            times = elements.get(element, [])
            if not times:
                return ""
            parameters = times[0].get("parameter", {})
            return text(parameters.get("parameterName", ""))

        weather = value("Wx")
        low = value("MinT")
        high = value("MaxT")
        rain = value("PoP")
        comfort = value("CI")

        summary = (
            f"預報時段：{start:%m/%d %H:%M} 至 "
            f"{end:%m/%d %H:%M}。"
            f"天氣：{weather}。"
            f"溫度：{low}～{high}°C。"
            f"降雨機率：{rain}%。"
            f"舒適度：{comfort}。"
        )

        items.append(make_item(
            f"{city}天氣預報｜{weather}",
            summary,
            "天氣預報",
            "中央氣象署",
            "https://www.cwa.gov.tw/",
            start,
        ))

    if not items:
        raise ValueError("沒有可用的縣市預報")

    return items

def main():
    original = json.loads(OUTPUT.read_text(encoding="utf-8"))
    existing = original.get("items", [])
    if not isinstance(existing, list):
        raise ValueError("既有公告格式錯誤")

    statuses = {}
    fresh = []

    for category, dataset_id in DATASETS.items():
        try:
            items = load_dataset(category, dataset_id)
            fresh.extend(items)
            statuses[category] = {
                "status": "ok",
                "items": len(items),
            }
        except Exception as exc:
            statuses[category] = {
                "status": "error",
                "message": str(exc)[:250],
            }

    try:
        items = load_weather()
        fresh.extend(items)
        statuses["天氣預報"] = {
            "status": "ok",
            "items": len(items),
        }
    except Exception as exc:
        statuses["天氣預報"] = {
            "status": "error",
            "message": str(exc)[:250],
        }

    # 重新執行時，不保留上一輪已過期的民生公告。
    managed = set(DATASETS) | {"天氣預報"}
    retained = [
        item for item in existing
        if item.get("category") not in managed
    ]

    # 如果本輪失敗，保留舊資料中的未來事件，
    # 但不將舊天氣預報冒充最新預報。
    for item in existing:
        category = item.get("category")
        if category in DATASETS and statuses[category]["status"] == "error":
            retained.append(item)

    combined = retained + fresh
    unique = {}
    for item in combined:
        key = (
            item.get("category", ""),
            item.get("title", ""),
            item.get("summary", ""),
        )
        unique[key] = item

    original["items"] = list(unique.values())
    original["generated_at"] = datetime.now(
        timezone.utc
    ).isoformat()

    REPORT.write_text(
        json.dumps(
            {
                "checked_at": original["generated_at"],
                "sources": statuses,
            },
            ensure_ascii=False,
            indent=2,
        ) + "\n",
        encoding="utf-8",
    )

    # 至少有一個新來源成功才更新公告。
    if any(x["status"] == "ok" for x in statuses.values()):
        OUTPUT.write_text(
            json.dumps(
                original,
                ensure_ascii=False,
                indent=2,
            ) + "\n",
            encoding="utf-8",
        )

    print(json.dumps(
        statuses, ensure_ascii=False, indent=2
    ))

if __name__ == "__main__":
    try:
        main()
    except Exception as exc:
        print("民生資料更新失敗：" + str(exc), file=sys.stderr)
        sys.exit(1)
