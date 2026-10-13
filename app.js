(function () {
  "use strict";

  const $ = (id) => document.getElementById(id);
  const yen = (v, d = 0) => v.toLocaleString("ja-JP", { minimumFractionDigits: d, maximumFractionDigits: d }) + "円";
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const TAX_RATE = 0.20315; // 所得税15.315% + 住民税5%
  const STORAGE_KEY = "dividend-ranking:portfolio";

  let data = null;
  let portfolio = {}; // code -> 単元数

  function unitShares(stock) {
    return stock.name.includes("投資法人") ? 1 : 100;
  }

  // ---------- 純粋関数 (DOM 非依存) ----------
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

  // 選定銘柄 {code: units} から投資額・配当を計算
  function computePortfolio(stocks, selection, opts) {
    const { nisa = false, budget = null } = opts || {};
    const byCode = new Map(stocks.map((s) => [s.code, s]));
    const items = [];
    for (const [code, units] of Object.entries(selection)) {
      const s = byCode.get(code);
      if (!s || !(units > 0)) continue;
      const shares1 = unitShares(s);
      const shares = units * shares1;
      const invest = shares * s.price;
      const gross = shares * s.dividend;
      const tax = nisa ? 0 : Math.floor(gross * TAX_RATE);
      items.push({
        code, name: s.name, market: s.market, price: s.price, dividend: s.dividend,
        yield_pct: s.yield_pct, url: s.url, fiscal: s.fiscal,
        unitShares: shares1, units, shares, invest, gross, tax, net: gross - tax,
      });
    }
    items.sort((a, b) => b.gross - a.gross);
    const total = items.reduce((t, i) => ({
      invest: t.invest + i.invest, gross: t.gross + i.gross, tax: t.tax + i.tax, net: t.net + i.net,
    }), { invest: 0, gross: 0, tax: 0, net: 0 });
    total.yield_pct = total.invest > 0 ? (total.gross / total.invest) * 100 : 0;
    total.netYield_pct = total.invest > 0 ? (total.net / total.invest) * 100 : 0;
    total.remaining = budget != null ? budget - total.invest : null;
    return { items, total };
  }

  // ---------- 保存 ----------
  function loadPortfolio() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      const obj = raw ? JSON.parse(raw) : {};
      return obj && typeof obj === "object" ? obj : {};
    } catch (e) { return {}; }
  }
  function savePortfolio() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(portfolio)); } catch (e) { /* 保存不可環境 */ }
  }

  // ---------- 画面 ----------
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

  function renderRanking() {
    const opts = readOpts();
    const { rows, total } = buildRanking(data.stocks, opts);
    $("meta").innerHTML =
      `予算: <strong>${opts.budget != null ? yen(opts.budget) + "以内" : "制限なし"}</strong>` +
      ` / 該当 <strong>${total}</strong> 銘柄(うち ${rows.length} 件表示)` +
      ` / 取得対象 ${data.count} 銘柄 / データ取得: ${esc(data.fetched_at)}`;
    if (rows.length === 0) {
      $("rows").innerHTML = `<tr><td colspan="13" class="empty">条件に合う銘柄がありません。</td></tr>`;
      return;
    }
    $("rows").innerHTML = rows.map((r) => {
      const sel = portfolio[r.code] > 0;
      return `
      <tr class="${sel ? "selected" : ""}" data-code="${esc(r.code)}">
        <td class="sel"><input type="checkbox" class="pick" data-code="${esc(r.code)}" data-units="${r.units}" ${sel ? "checked" : ""} title="選定に追加"></td>
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
      </tr>`;
    }).join("");
  }

  function renderPortfolio() {
    const opts = readOpts();
    const nisa = $("nisa").checked;
    const { items, total } = computePortfolio(data.stocks, portfolio, { nisa, budget: opts.budget });
    $("pfCount").textContent = items.length;
    if (items.length === 0) {
      $("pfBody").innerHTML = `<tr><td colspan="10" class="empty">ランキングの左端のチェックで銘柄を選ぶと、ここに実際の配当額が表示されます。</td></tr>`;
      $("pfTotal").innerHTML = "";
      return;
    }
    $("pfBody").innerHTML = items.map((i) => `
      <tr data-code="${esc(i.code)}">
        <td><a href="${esc(i.url)}" target="_blank" rel="noopener">${esc(i.code)}</a></td>
        <td class="name">${esc(i.name)}</td>
        <td class="num">${yen(i.price, 1)}</td>
        <td class="num yield">${i.yield_pct.toFixed(2)}%</td>
        <td class="num"><input type="number" class="units" data-code="${esc(i.code)}" min="1" step="1" value="${i.units}"> 単元<br><small>(${i.shares.toLocaleString("ja-JP")}株)</small></td>
        <td class="num">${yen(i.invest)}</td>
        <td class="num">${yen(i.gross)}</td>
        <td class="num">${nisa ? "-" : yen(i.tax)}</td>
        <td class="num strong">${yen(i.net)}</td>
        <td><button type="button" class="remove" data-code="${esc(i.code)}" title="外す">×</button></td>
      </tr>`).join("");
    const remain = total.remaining == null ? "" :
      ` / 予算残り <strong class="${total.remaining < 0 ? "over" : ""}">${yen(total.remaining)}</strong>${total.remaining < 0 ? " (予算超過)" : ""}`;
    $("pfTotal").innerHTML = `
      <div class="cards">
        <div class="card"><div class="label">投資額合計</div><div class="value">${yen(total.invest)}</div></div>
        <div class="card"><div class="label">年間配当(税引前)</div><div class="value">${yen(total.gross)}</div><div class="label">利回り ${total.yield_pct.toFixed(2)}%</div></div>
        <div class="card"><div class="label">税金 (${nisa ? "NISA 非課税" : "20.315%"})</div><div class="value">${yen(total.tax)}</div></div>
        <div class="card accent"><div class="label">年間 手取り配当</div><div class="value">${yen(total.net)}</div><div class="label">税引後利回り ${total.netYield_pct.toFixed(2)}% / 月あたり約 ${yen(Math.floor(total.net / 12))}</div></div>
      </div>
      <p class="meta">選定 ${items.length} 銘柄${remain}</p>`;
  }

  function render() {
    if (!data) return;
    renderRanking();
    renderPortfolio();
  }

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

  function bindEvents() {
    $("controls").addEventListener("input", () => { render(); syncQueryString(); });
    $("nisa").addEventListener("change", renderPortfolio);

    // ランキングのチェックボックス: 追加時は「予算内で買える数」を初期単元数にする
    $("rows").addEventListener("change", (e) => {
      const cb = e.target.closest("input.pick");
      if (!cb) return;
      const code = cb.dataset.code;
      if (cb.checked) portfolio[code] = Math.max(1, parseInt(cb.dataset.units, 10) || 1);
      else delete portfolio[code];
      savePortfolio();
      render();
    });

    // 選定リスト: 単元数の編集・削除
    $("pfBody").addEventListener("input", (e) => {
      const inp = e.target.closest("input.units");
      if (!inp) return;
      const v = parseInt(inp.value, 10);
      if (v > 0) { portfolio[inp.dataset.code] = v; savePortfolio(); renderPortfolio(); }
    });
    $("pfBody").addEventListener("click", (e) => {
      const btn = e.target.closest("button.remove");
      if (!btn) return;
      delete portfolio[btn.dataset.code];
      savePortfolio();
      render();
    });
    $("pfClear").addEventListener("click", () => {
      if (Object.keys(portfolio).length && !confirm("選定した銘柄をすべて外しますか?")) return;
      portfolio = {};
      savePortfolio();
      render();
    });
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
    portfolio = loadPortfolio();
    bindEvents();
    load();
  }

  if (typeof module !== "undefined") module.exports = { buildRanking, computePortfolio, unitShares, TAX_RATE };
})();
