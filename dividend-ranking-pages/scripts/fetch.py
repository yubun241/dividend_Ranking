"""
Yahoo!ファイナンスの配当利回りランキングを取得し docs/data/stocks.json に書き出す。
GitHub Actions から定期実行される。ローカルでも `python scripts/fetch.py` で実行可。
"""
from __future__ import annotations

import datetime as dt
import json
import sys
from dataclasses import asdict
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import scraper  # noqa: E402

OUT = Path(__file__).resolve().parents[1] / "docs" / "data" / "stocks.json"
JST = dt.timezone(dt.timedelta(hours=9))


def main() -> None:
    pages = int(sys.argv[1]) if len(sys.argv) > 1 else scraper.MAX_PAGES
    stocks = scraper.fetch_all(max_pages=pages)
    if len(stocks) < 50:
        raise SystemExit(f"取得件数が少なすぎます ({len(stocks)}件)。ページ構造が変わった可能性があります。")
    payload = {
        "fetched_at": dt.datetime.now(JST).strftime("%Y-%m-%d %H:%M JST"),
        "source": scraper.BASE_URL,
        "count": len(stocks),
        "stocks": [asdict(s) for s in stocks],
    }
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(payload, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(f"{len(stocks)} 銘柄を {OUT} に保存しました")


if __name__ == "__main__":
    main()
