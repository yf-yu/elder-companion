
"""伴老友 V8.0｜官方 RSS 來源檢查工具。僅使用 Python 標準函式庫。"""

import json
import sys
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import urlparse
from urllib.request import Request, build_opener, HTTPRedirectHandler
from xml.etree import ElementTree as ET

ROOT = Path(__file__).resolve().parents[1]
CATALOG = ROOT / "data" / "source_catalog.json"
REPORT = ROOT / "data" / "source_check_report.json"

MAX_BYTES = 2 * 1024 * 1024
TIMEOUT = 20


def official_https(url):
    if not isinstance(url, str):
        return False

    try:
        parsed = urlparse(url)
        host = (parsed.hostname or "").lower()

        return (
            parsed.scheme == "https"
            and not parsed.username
            and not parsed.password
            and parsed.port in (None, 443)
            and (
                host == "gov.tw"
                or host.endswith(".gov.tw")
                or host in {
                    "www.taipower.com.tw",
                    "www.water.gov.tw"
                }
            )
        )
    except ValueError:
        return False


def local_name(tag):
    return tag.rsplit("}", 1)[-1].lower()


class SafeRedirectHandler(HTTPRedirectHandler):
    def redirect_request(
        self, req, fp, code, msg, headers, newurl
    ):
        if not official_https(newurl):
            raise ValueError(
                "重新導向至非允許的官方 HTTPS 網址"
            )

        return super().redirect_request(
            req, fp, code, msg, headers, newurl
        )


def check_rss(source):
    url = source["url"]

    if not official_https(url):
        raise ValueError(
            "非允許的官方 HTTPS 網址"
        )

    request = Request(
        url,
        headers={
            "User-Agent": "BanLaoYou-SourceChecker/8.0",
            "Accept": (
                "application/rss+xml,"
                "application/atom+xml,"
                "application/xml,"
                "text/xml"
            )
        }
    )

    opener = build_opener(SafeRedirectHandler())

    with opener.open(request, timeout=TIMEOUT) as response:
        final_url = response.geturl()

        if not official_https(final_url):
            raise ValueError(
                "最終網址不符合官方 HTTPS 規則"
            )

        content = response.read(MAX_BYTES + 1)

    if len(content) > MAX_BYTES:
        raise ValueError(
            "下載內容超過 2MB"
        )

    root = ET.fromstring(content)
    kind = local_name(root.tag)

    if kind not in {"rss", "feed", "rdf"}:
        raise ValueError(
            f"不是 RSS/Atom：根節點為 {kind}"
        )

    count = sum(
        local_name(element.tag) in {"item", "entry"}
        for element in root.iter()
    )

    if count == 0:
        raise ValueError(
            "RSS/Atom 目前沒有可讀取項目"
        )

    return count


def main():
    if not CATALOG.exists():
        print(
            "找不到 data/source_catalog.json",
            file=sys.stderr
        )
        return 1

    catalog = json.loads(
        CATALOG.read_text(encoding="utf-8")
    )

    results = []

    print("=" * 45)
    print("伴老友｜V8.0 官方資料來源檢查")
    print("=" * 45)

    for source in catalog.get("sources", []):
        result = {
            "id": source["id"],
            "name": source["name"],
            "type": source["type"],
            "configured_status": source["status"],
            "enabled": source.get("enabled", False)
        }

        if source["type"] != "rss":
            result["result"] = "not_rss_configured"
        else:
            try:
                count = check_rss(source)

                result["result"] = "pass"
                result["items_found"] = count

            except Exception as exc:
                result["result"] = "fail"
                result["error"] = str(exc)[:300]

        results.append(result)

        print(
            f"{result['name']}: {result['result']}"
            + (
                f" ({result['items_found']} items)"
                if "items_found" in result
                else ""
            ),
            flush=True
        )

    governments = catalog.get(
        "local_governments", []
    )

    report = {
        "checked_at": datetime.now(
            timezone.utc
        ).isoformat(),
        "sources": results,
        "local_governments_configured": len(
            governments
        ),
        "local_governments_with_rss": sum(
            bool(item.get("rss_url"))
            for item in governments
        ),
        "passed": sum(
            item["result"] == "pass"
            for item in results
        ),
        "failed": sum(
            item["result"] == "fail"
            for item in results
        )
    }

    REPORT.parent.mkdir(
        parents=True,
        exist_ok=True
    )

    REPORT.write_text(
        json.dumps(
            report,
            ensure_ascii=False,
            indent=2
        ) + "\n",
        encoding="utf-8"
    )

    print()
    print("=" * 45)
    print(f"RSS 通過：{report['passed']}")
    print(f"RSS 失敗：{report['failed']}")
    print(
        "縣市已設定："
        f"{report['local_governments_configured']}"
    )
    print(
        "縣市已填 RSS："
        f"{report['local_governments_with_rss']}"
    )
    print(
        "報告位置：data/source_check_report.json"
    )
    print("=" * 45)

    return 0


if __name__ == "__main__":
    sys.exit(main())
