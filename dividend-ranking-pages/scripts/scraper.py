"""
Yahoo!ファイナンス「配当利回り（会社予想）ランキング」のスクレイパー。

"""
from __future__ import annotations

import re
import time
from dataclasses import dataclass, asdict

import requests
from bs4 import BeautifulSoup

BASE_URL = "https://finance.yahoo.co.jp/stocks/ranking/dividendYield"
HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
        "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36"
    ),
    "Accept-Language": "ja,en;q=0.8",
}
MAX_PAGES = 20               # 50件 × 20ページ = 最大1000銘柄
REQUEST_INTERVAL = 0.7       # サーバー負荷軽減のためページ間に入れる待ち時間(秒)


@dataclass
class Stock:
    rank: int            # ランキングページ上の順位(全市場・利回り順)
    code: str            # 証券コード
    name: str            # 銘柄名
    market: str          # 市場 (東証PRM / 東証STD / 東証GRT など)
    price: float         # 取引値(円)
    fiscal: str          # 決算年月
    dividend: float      # 1株配当(円・会社予想)
    yield_pct: float     # 配当利回り(%)
    url: str             # Yahoo!ファイナンス 銘柄ページ

    @property
    def unit_shares(self) -> int:
        """売買単位。REIT(投資法人)は1口、それ以外は100株と仮定する。"""
        return 1 if "投資法人" in self.name else 100

    @property
    def unit_cost(self) -> float:
        """1単元の購入金額(円)。"""
        return self.price * self.unit_shares


_NUM_RE = re.compile(r"[-+]?\d[\d,]*\.?\d*")


def _num(text: str) -> float | None:
    m = _NUM_RE.search(text or "")
    if not m:
        return None
    try:
        return float(m.group(0).replace(",", "").replace("+", ""))
    except ValueError:
        return None


def parse_page(html: str) -> list[Stock]:
    soup = BeautifulSoup(html, "html.parser")
    stocks: list[Stock] = []
    for tr in soup.select("table tr"):
        tds = tr.find_all("td")
        if len(tds) < 5:
            continue
        link = tr.find("a", href=re.compile(r"/quote/"))
        if not link:
            continue
        code_m = re.search(r"/quote/([0-9A-Z]+)\.T", link["href"])
        if not code_m:
            continue
        code = code_m.group(1)

        # 順位は <th>、以降 <td> が 名称 / 取引値 / 決算年月 / 1株配当 / 配当利回り
        th = tr.find("th")
        rank = int(_num(th.get_text()) or 0) if th else 0

        name_cell = tds[0]
        texts = [t.strip() for t in name_cell.stripped_strings if t.strip()]
        name = link.get_text(strip=True)
        market = next((t for t in texts if t[:2] in ("東証", "名証", "札証", "福証")), "")

        price = _num(tds[1].get_text(" ").split()[0] if tds[1].get_text(" ").split() else "")
        fiscal = tds[2].get_text(strip=True)
        dividend = _num(tds[3].get_text(" "))
        yield_pct = _num(tds[4].get_text(" "))

        if price is None or yield_pct is None:
            continue
        stocks.append(Stock(
            rank=rank, code=code, name=name, market=market,
            price=price, fiscal=fiscal, dividend=dividend or 0.0,
            yield_pct=yield_pct,
            url=f"https://finance.yahoo.co.jp/quote/{code}.T",
        ))
    return stocks


def fetch_all(max_pages: int = MAX_PAGES, session: requests.Session | None = None) -> list[Stock]:
    sess = session or requests.Session()
    sess.headers.update(HEADERS)
    result: list[Stock] = []
    seen: set[str] = set()
    for page in range(1, max_pages + 1):
        r = sess.get(BASE_URL, params={"market": "all", "term": "daily", "page": page}, timeout=20)
        r.raise_for_status()
        rows = parse_page(r.text)
        new = [s for s in rows if s.code not in seen]
        if not new:          # 空ページ or 全て重複 → 末尾に到達
            break
        for s in new:
            seen.add(s.code)
        result.extend(new)
        time.sleep(REQUEST_INTERVAL)
    return result


if __name__ == "__main__":
    import sys
    pages = int(sys.argv[1]) if len(sys.argv) > 1 else 2
    for s in fetch_all(max_pages=pages)[:10]:
        print(f"{s.rank:>3} {s.code} {s.name:<20} {s.market:<7} {s.price:>9,.1f}円 "
              f"配当{s.dividend:>7.2f}円 利回り{s.yield_pct:5.2f}% 単元{s.unit_cost:>12,.0f}円")
