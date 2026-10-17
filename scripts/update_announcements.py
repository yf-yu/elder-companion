
import json
import re
import html
import urllib.request
import urllib.parse
import xml.etree.ElementTree as ET

from pathlib import Path
from datetime import datetime, timezone
from email.utils import parsedate_to_datetime

ROOT = Path(__file__).resolve().parents[1]
SOURCES = ROOT / "data" / "sources.json"
OUTPUT = ROOT / "data" / "announcements.json"


def now_iso():
    return datetime.now(timezone.utc).isoformat()


def clean_text(value):
    value = html.unescape(value or "")
    value = re.sub(r"<[^>]+>", " ", value)
    return " ".join(value.split())[:500]


def parse_date(value):
    if not value:
        return None

    try:
        return parsedate_to_datetime(
            value
        ).astimezone(timezone.utc).isoformat()
    except Exception:
        pass

    try:
        return datetime.fromisoformat(
            value.replace("Z", "+00:00")
        ).astimezone(timezone.utc).isoformat()
    except Exception:
        return None


def get_text(node, names):
    for name in names:
        child = node.find(name)
        if child is not None and child.text:
            return child.text.strip()
    return ""


def fetch_feed(source):
    url = source["url"]
    parsed = urllib.parse.urlparse(url)

    if parsed.scheme != "https":
        raise ValueError("Only HTTPS feeds allowed")

    host = parsed.hostname or ""
    if not (
        host.endswith(".gov.tw")
        or host == "gov.tw"
    ):
        raise ValueError("Not a government domain")

    request = urllib.request.Request(
        url,
        headers={
            "User-Agent": "ElderCompanion/1.0",
            "Accept": "application/rss+xml, application/atom+xml, application/xml"
        }
    )

    with urllib.request.urlopen(
        request, timeout=15
    ) as response:
        xml_data = response.read(2_000_001)

    if len(xml_data) > 2_000_000:
        raise ValueError("Feed too large")

    root = ET.fromstring(xml_data)
    items = []

    # RSS 2.0
    for node in root.findall(".//item"):
        title = get_text(node, ["title"])
        link = get_text(node, ["link"])
        summary = get_text(
            node, ["description"]
        )
        date = get_text(node, ["pubDate"])

        if title and link:
            items.append({
                "title": clean_text(title),
                "url": link,
                "summary": clean_text(summary),
                "source": source["name"],
                "category": source["category"],
                "published_at": parse_date(date)
            })

    # Atom
    ns = "{http://www.w3.org/2005/Atom}"

    for node in root.findall(f".//{ns}entry"):
        title = get_text(node, [f"{ns}title"])
        summary = get_text(
            node, [f"{ns}summary", f"{ns}content"]
        )
        date = get_text(
            node, [f"{ns}published", f"{ns}updated"]
        )

        link_node = node.find(f"{ns}link")
        link = (
            link_node.get("href", "")
            if link_node is not None else ""
        )

        if title and link:
            items.append({
                "title": clean_text(title),
                "url": link,
                "summary": clean_text(summary),
                "source": source["name"],
                "category": source["category"],
                "published_at": parse_date(date)
            })

    return items


def main():
    config = json.loads(
        SOURCES.read_text(encoding="utf-8")
    )

    sources = config.get("sources", [])
    items = []
    errors = []

    for source in sources:
        try:
            items.extend(fetch_feed(source))
        except Exception as error:
            errors.append(
                f"{source.get('name', 'unknown')}: {error}"
            )

    unique = {}

    for item in items:
        url = item["url"]
        parsed = urllib.parse.urlparse(url)

        if parsed.scheme != "https":
            continue

        host = parsed.hostname or ""
        if not (
            host.endswith(".gov.tw")
            or host == "gov.tw"
        ):
            continue

        unique[url] = item

    result = sorted(
        unique.values(),
        key=lambda x: x["published_at"] or "",
        reverse=True
    )[:40]

    # 不用空結果覆蓋舊資料
    if sources and not result:
        raise RuntimeError(
            "No valid announcements. " +
            "; ".join(errors)
        )

    status = (
        "not_configured" if not sources
        else "partial" if errors
        else "ok"
    )

    output = {
        "generated_at": now_iso(),
        "status": status,
        "items": result
    }

    OUTPUT.parent.mkdir(
        parents=True, exist_ok=True
    )

    OUTPUT.write_text(
        json.dumps(
            output,
            ensure_ascii=False,
            indent=2
        ) + "\n",
        encoding="utf-8"
    )

    print(
        f"Status: {status}, items: {len(result)}"
    )

    for error in errors:
        print("WARNING:", error)


if __name__ == "__main__":
    main()
