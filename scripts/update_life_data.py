import csv
import io
import json
import os
import re
import sys
import zipfile
import xml.etree.ElementTree as ET

from urllib.error import HTTPError
from datetime import datetime, timedelta, timezone
from pathlib import Path
from urllib.parse import urlencode, urlparse
from urllib.request import (
    HTTPRedirectHandler,
    Request,
    build_opener
)

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


def allowed(url):
    try:
        p = urlparse(url)
        h = (p.hostname or "").lower().rstrip(".")

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
        from urllib.parse import urljoin

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
    """清理官方資料的空值、陣列與多餘空白。"""

    if value is None:
        return ""

    if isinstance(value, (list, tuple, set)):
        parts = [clean(x) for x in value]
        return "、".join(x for x in parts if x)

    if isinstance(value, dict):
        return ""

    text = re.sub(r"\s+", " ", str(value)).strip()

    if text.lower() in (
        "",
        "null",
        "none",
        "nan",
        "undefined",
        "[]",
        "{}",
        "n/a"
    ):
        return ""

    return text



def parse_dt(value):
    s = clean(value)

    if not s:
        return None

    s = s.replace("T", " ").replace(
        "Z", "+00:00"
    )

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
        r"^(\d{2,3})[/.-](\d{1,2})[/.-](\d{1,2})"
        r"(?:\s+(\d{1,2}):(\d{2}))?",
        s
    )

    if m:
        y = int(m[1])

        if y < 1911:
            y += 1911

        try:
            return datetime(
                y,
                int(m[2]),
                int(m[3]),
                int(m[4] or 0),
                int(m[5] or 0),
                tzinfo=TZ
            )
        except ValueError:
            pass

    return None


def stamp(d):
    return d.isoformat() if d else None


def pick(row, *keys):
    for key in keys:
        if clean(row.get(key)):
            return clean(row[key])

    return ""


def unwrap(obj):
    if isinstance(obj, list):
        return [
            x for x in obj
            if isinstance(x, dict)
        ]

    if isinstance(obj, dict):
        for key in (
            "records", "data", "result", "items"
        ):
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

        with zipfile.ZipFile(io.BytesIO(data)) as z:
            for info in z.infolist():
                if (
                    info.is_dir()
                    or info.file_size > MAX_BYTES
                ):
                    continue

                if info.filename.lower().endswith(
                    (".csv", ".json")
                ):
                    rows.extend(
                        rows_from_bytes(z.read(info))
                    )

        if not rows:
            raise ValueError(
                "ZIP 內沒有可讀的 CSV/JSON"
            )

        return rows

    for enc in ("utf-8-sig", "cp950", "big5"):
        try:
            s = data.decode(enc)

            try:
                return unwrap(json.loads(s))

            except (ValueError, TypeError):
                reader = csv.DictReader(
                    io.StringIO(s)
                )
                rows = list(reader)

                if reader.fieldnames:
                    return rows

        except UnicodeError:
            continue

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

    for r in resources:
        if not isinstance(r, dict):
            continue

        for key in (
            "resourceDownloadUrl",
            "resourceDownloadURL",
            "downloadURL",
            "url"
        ):
            u = r.get(key)

            if (
                isinstance(u, str)
                and allowed(u)
                and u not in urls
            ):
                urls.append(u)

    if not urls:
        raise ValueError(
            "找不到官方資源下載網址"
        )

    return urls


def city_in(value):
    value = str(value or "").replace(
        "台", "臺"
    )

    return [
        c for c in CITIES
        if c in value
    ]


OFFICE_CITIES = {
    "臺北": "臺北市",
    "新北": "新北市",
    "桃園": "桃園市",
    "新竹": "新竹市",
    "苗栗": "苗栗縣",
    "臺中": "臺中市",
    "彰化": "彰化縣",
    "南投": "南投縣",
    "雲林": "雲林縣",
    "嘉義": "嘉義市",
    "臺南": "臺南市",
    "高雄": "高雄市",
    "屏東": "屏東縣",
    "宜蘭": "宜蘭縣",
    "花蓮": "花蓮縣",
    "臺東": "臺東縣",
    "澎湖": "澎湖縣",
    "金門": "金門縣",
    "馬祖": "連江縣",
    "基隆": "基隆市"
}


def infer_cities(office, area):
    cities = city_in(
        str(office) + " " + str(area)
    )

    if cities:
        return cities

    office = str(office or "").replace(
        "台", "臺"
    )

    # 新竹、嘉義可能跨縣市，不直接推論。
    for prefix, city in OFFICE_CITIES.items():
        if prefix in ("新竹", "嘉義"):
            continue

        if office.startswith(prefix):
            return [city]

    return []


def load_water():
    errors = []

    for url in dataset_urls(6050):
        try:
            rows = rows_from_bytes(fetch(url))
            output = []

            for r in rows:
                start = parse_dt(
                    pick(
                        r,
                        "案件日期時間",
                        "停水開始時間",
                        "停水時間"
                    )
                )

                end = parse_dt(
                    pick(
                        r,
                        "恢復日期時間",
                        "停水結束時間",
                        "復水時間"
                    )
                )

                if (
                    not start
                    or not end
                    or end < NOW
                    or end < start
                ):
                    continue

                area = pick(
                    r,
                    "停水地區",
                    "影響範圍"
                )

                county = pick(
                    r,
                    "影響縣市",
                    "縣市"
                )

                district = pick(
                    r,
                    "影響行政區",
                    "行政區"
                )

                places = city_in(
                    county + " " + district
                    + " " + area
                )

                if (
                    not (county or district or area)
                    or not places
                ):
                    continue

                item_id = pick(
                    r, "案件編號"
                ) or (
                    f"{start.isoformat()}-"
                    f"{county}-{area}"
                )

                output.append({
                    "id": (
                        "water-" + clean(item_id)[:130]
                    ),
                    "category": "預定停水",
                    "title": (
                        f"停水通知｜{county}{district}"
                    )[:120],
                    
"summary": (
    "影響地區："
    + (area or "官方未提供詳細影響範圍")
    + "；原因："
    + (
        pick(r, "停水原因", "原因")
        or "官方未提供詳細原因"
    )
)[:300],

                    "cities": places,
                    "district": district,
                    "starts_at": stamp(start),
                    "ends_at": stamp(end),
                    "source": "台灣自來水公司",
                    "url": (
                        "https://data.gov.tw/"
                        "dataset/6050"
                    )
                })

            return output

        except Exception as e:
            errors.append(str(e))

    raise RuntimeError(
        "; ".join(errors)[:300]
    )


def power_times(raw):
    s = clean(raw).replace(
        "～", "~"
    ).replace("至", "~")

    full = re.findall(
        r"\d{2,4}[/.-]\d{1,2}[/.-]\d{1,2}"
        r"\s+\d{1,2}:\d{2}",
        s
    )

    if len(full) >= 2:
        return (
            parse_dt(full[0]),
            parse_dt(full[1])
        )

    dates = re.findall(
        r"\d{2,4}[/.-]\d{1,2}[/.-]\d{1,2}",
        s
    )

    times = re.findall(
        r"(?<!\d)\d{1,2}:\d{2}",
        s
    )

    if len(dates) == 1 and len(times) == 2:
        start = parse_dt(
            dates[0] + " " + times[0]
        )

        end = parse_dt(
            dates[0] + " " + times[1]
        )

        if start and end and end > start:
            return start, end

    return None, None


def load_power():
    errors = []

    for url in dataset_urls(26144):
        try:
            rows = rows_from_bytes(fetch(url))
            output = []

            for r in rows:
                raw = pick(
                    r, "第一次停電時間"
                )

                start, end = power_times(raw)

                if (
                    not start
                    or not end
                    or end < NOW
                    or end < start
                ):
                    continue

                area = pick(
                    r, "停電範圍"
                )

                if not area:
                    continue

                office = pick(
                    r, "營業區處"
                )

                cities = infer_cities(
                    office, area
                )

                if not cities:
                    continue

                item_id = pick(
                    r, "請求號數"
                ) or (
                    f"{start.isoformat()}-{area}"
                )

                output.append({
                    "id": (
                        "power-" + clean(item_id)[:130]
                    ),
                    "category": "預定停電",
                    "title": (
                        "預定停電｜"
                        + (office or area[:20])
                    ),
                    "summary": (
                        f"停電範圍：{area}；"
                        "工作內容："
                        + pick(r, "工作概述")
                        + "；查詢電話：1911"
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
                })

            return output

        except Exception as e:
            errors.append(str(e))

    raise RuntimeError(
        "; ".join(errors)[:300]
    )


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
    for e in elements:
        if e.get("elementName") == code:
            periods = e.get("time", [])

            if index < len(periods):
                return clean(
                    periods[index].get(
                        "parameter", {}
                    ).get("parameterName")
                )

    return ""


def load_forecast(key):
    obj = cwa("F-C0032-001", key)

    locations = obj.get(
        "records", {}
    ).get("location", [])

    output = []

    for loc in locations:
        city = clean(
            loc.get("locationName")
        ).replace("台", "臺")

        if city not in CITIES:
            continue

        elements = loc.get(
            "weatherElement", []
        )

        wx = next(
            (
                e.get("time", [])
                for e in elements
                if e.get("elementName") == "Wx"
            ),
            []
        )

        for index, p in enumerate(wx):
            start = parse_dt(
                p.get("startTime")
            )

            end = parse_dt(
                p.get("endTime")
            )

            if (
                not start
                or not end
                or end < NOW
            ):
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
                    f"weather-{city}-"
                    f"{start.isoformat()}"
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
            })

    if not output:
        raise ValueError(
            "沒有有效的預報時段"
        )

    return output


def nested_strings(obj):
    if isinstance(obj, str):
        yield obj

    elif isinstance(obj, list):
        for x in obj:
            yield from nested_strings(x)

    elif isinstance(obj, dict):
        for k, v in obj.items():
            if k not in (
                "Authorization", "apikey"
            ):
                yield from nested_strings(v)


def cap_text(elem, name):
    for child in elem.iter():
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
            e for e in root.iter()
            if e.tag.rsplit("}", 1)[-1] == "alert"
        ]

    result = []

    for i, alert in enumerate(alerts):
        infos = [
            x for x in alert
            if x.tag.rsplit("}", 1)[-1] == "info"
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

            if (
                not title
                or not end
                or end < NOW
            ):
                continue

            summary = (
                cap_text(info, "description")
                or cap_text(info, "instruction")
            )

            areas = [
                x for x in info.iter()
                if x.tag.rsplit(
                    "}", 1
                )[-1] == "area"
            ]

            cities = city_in(
                " ".join(
                    cap_text(x, "areaDesc")
                    for x in areas
                )
            )

            if not cities:
                continue

            result.append({
                "id": (
                    f"{api_id}-cap-{i}-"
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

    return result


def load_alert(api_id, key):
    try:
        obj = cwa(api_id, key)

    except (HTTPError, ValueError) as rest_error:
        try:
            return load_alert_file(
                api_id, key
            )

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
                k in value
                for k in (
                    "headline",
                    "event",
                    "alertName",
                    "title"
                )
            ):
                candidates.append(value)

            for v in value.values():
                walk(v)

        elif isinstance(value, list):
            for v in value:
                walk(v)

    walk(records)

    output = []

    for i, r in enumerate(candidates):
        title = pick(
            r,
            "headline",
            "alertName",
            "title",
            "event"
        )

        start = parse_dt(
            pick(
                r,
                "effective",
                "onset",
                "startTime",
                "issueTime"
            )
        )

        end = parse_dt(
            pick(
                r,
                "expires",
                "endTime",
                "expireTime"
            )
        )

        if (
            not title
            or not end
            or end < NOW
        ):
            continue

        summary = (
            pick(
                r,
                "description",
                "instruction",
                "content",
                "summary"
            )
            or (
                "請查看中央氣象署原始"
                "警示內容及適用地區。"
            )
        )

        cities = city_in(
            " ".join(nested_strings(r))
        )

        if not cities:
            continue

        output.append({
            "id": (
                f"{api_id}-{i}-"
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


def main():
    DATA.mkdir(
        parents=True,
        exist_ok=True
    )

    previous = {}

    if OUT.exists():
        try:
            previous = json.loads(
                OUT.read_text(
                    encoding="utf-8"
                )
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
        for name in (
            "天氣預報",
        ) + ALERT_IDS:
            status[name] = {
                "state": "not_configured",
                "items": 0,
                "message": "缺少 CWA_API_KEY"
            }

    for name, func in sources:
        try:
            items = func()

            status[name] = {
                "state": "ok",
                "items": len(items),
                "note": (
                    "來源請求成功，且資料已完成解析；"
                    "0 筆不等於官方沒有事件"
                )
            }

            collected.extend(items)

        except Exception as exc:
            status[name] = {
                "state": "error",
                "items": 0,
                "message": str(exc)[:250]
            }

    # 來源失敗時保留尚未過期的舊事件。
    # 來源成功時則使用新資料。
    keep = []

    for item in old:
        if not isinstance(item, dict):
            continue

        end = parse_dt(
            item.get("ends_at")
        )

        if not end or end < NOW:
            continue

        if item.get("category") == "天氣警示":
            group = item.get("api_id")
        else:
            group = item.get("category")

        if (
            status.get(
                group, {}
            ).get("state") != "ok"
        ):
            keep.append(item)

    unique = {}

    for item in keep + collected:
        unique[item["id"]] = item

    result = {
        "generated_at": datetime.now(
            timezone.utc
        ).isoformat(),
        "items": list(unique.values())
    }

    report = {
        "checked_at": result["generated_at"],
        "sources": status,
        "items": len(result["items"]),
        "note": (
            "ok + 0 筆僅代表程式解析後沒有"
            "有效事件；API 未能解析或缺少"
            "地區者不刊登。"
        )
    }

    def write_atomic(path, obj):
        tmp = path.with_suffix(
            ".json.tmp"
        )

        tmp.write_text(
            json.dumps(
                obj,
                ensure_ascii=False,
                indent=2
            ) + "\n",
            encoding="utf-8"
        )

        tmp.replace(path)

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
