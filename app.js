(function () {
  "use strict";

  const $ = (id) => document.getElementById(id);
  const yen = (v, d = 0) => v.toLocaleString("ja-JP", { minimumFractionDigits: d, maximumFractionDigits: d }) + "円";
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  let data = null;

  function unitShares(stock) {
    return stock.name.includes("投資法人") ? 1 : 100;
  }

  // 純粋関数: 条件に合う行を計算して返す(テストしやすいよう DOM に依存しない)
  function buildRanking(stocks, opts) {
    const { budget, market, minYield, query, limit } = opts;
    const q = (query || "").trim().toLowerCase();
    const rows = [];
    for (const s of stocks) {
      if (s.price <= 0 || s.yield_pct < minYield) continue;
      if (market === "reit") {
        if (["東証PRM", "東証STD", "東証GRT"].includes(s.market)) continue;
      } else if (market !== "all" && s.market !== market) continue;
      if (q && !(s.name.toLowerCase().includes(q) || s.code.toLowerCase().includes(q))) continue;
      const shares1 = unitShares(s);
      const unitCost = s.price * shares1;
      if (budget != null && unitCost > budget) continue;
      const units = budget != null ? Math.floor(budget / unitCost) : 1;
      const shares = units * shares1;
      rows.push({
        ...s, unitShares: shares1, unitCost, units, shares,
        invest: shares * s.price, annualDividend: shares * s.dividend,
      });
    }
    rows.sort((a, b) => b.yield_pct - a.yield_pct);
    rows.forEach((r, i) => (r.rank = i + 1));
    return { rows: rows.slice(0, limit), total: rows.length };
  }

  function readOpts() {
    const custom = parseInt($("budget").value, 10);
    const rankVal = $("rank").value;
    let budget = null;
    if (custom > 0) budget = custom;
    else if (rankVal !== "") budget = parseInt(rankVal, 10);
    return {
      budget,
      market: $("market").value,
      minYield: parseFloat($("minYield").value) || 0,
      query: $("query").value,
      limit: Math.max(1, Math.min(1000, parseInt($("limit").value, 10) || 50)),
    };
  }

  function render() {
    if (!data) return;
    const opts = readOpts();
    const { rows, total } = buildRanking(data.stocks, opts);
    $("meta").innerHTML =
      `予算: <strong>${opts.budget != null ? yen(opts.budget) + "以内" : "制限なし"}</strong>` +
      ` / 該当 <strong>${total}</strong> 銘柄(うち ${rows.length} 件表示)` +
      ` / 取得対象 ${data.count} 銘柄 / データ取得: ${esc(data.fetched_at)}`;
    if (rows.length === 0) {
      $("rows").innerHTML = `<tr><td colspan="12" class="empty">条件に合う銘柄がありません。</td></tr>`;
      return;
    }
    $("rows").innerHTML = rows.map((r) => `
      <tr>
        <td class="num">${r.rank}</td>
        <td><a href="${esc(r.url)}" target="_blank" rel="noopener">${esc(r.code)}</a></td>
        <td class="name">${esc(r.name)}</td>
        <td>${esc(r.market || "東証(REIT/ETF等)")}</td>
        <td class="num">${yen(r.price, 1)}</td>
        <td class="num">${yen(r.dividend, 2)}</td>
        <td class="num yield">${r.yield_pct.toFixed(2)}%</td>
        <td class="num">${yen(r.unitCost)}<br><small>(${r.unitShares}株)</small></td>
        <td class="num">${r.units}単元<br><small>(${r.shares.toLocaleString("ja-JP")}株)</small></td>
        <td class="num">${yen(r.invest)}</td>
        <td class="num strong">${yen(r.annualDividend)}</td>
        <td>${esc(r.fiscal)}</td>
      </tr>`).join("");
  }

  // URL のクエリ (?rank=100000&market=東証PRM など) から初期値を復元
  function applyQueryString() {
    const p = new URLSearchParams(location.search);
    for (const id of ["rank", "budget", "market", "minYield", "query", "limit"]) {
      if (p.has(id)) $(id).value = p.get(id);
    }
  }
  function syncQueryString() {
    const p = new URLSearchParams();
    for (const id of ["rank", "budget", "market", "minYield", "query", "limit"]) {
      const v = $(id).value;
      if (v !== "" && v !== $(id).defaultValue) p.set(id, v);
    }
    history.replaceState(null, "", p.toString() ? "?" + p.toString() : location.pathname);
  }

  async function load() {
    try {
      const res = await fetch("data/stocks.json", { cache: "no-cache" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      data = await res.json();
      render();
    } catch (e) {
      $("meta").innerHTML = `<span class="error">データの読み込みに失敗しました: ${esc(e.message)}</span>`;
    }
  }

  if (typeof document !== "undefined" && $("controls")) {
    applyQueryString();
    $("controls").addEventListener("input", () => { render(); syncQueryString(); });
    load();
  }

  // Node からのテスト用
  if (typeof module !== "undefined") module.exports = { buildRanking, unitShares };
})();
