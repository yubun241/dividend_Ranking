# 配当利回りランキング (GitHub Pages 版)

Yahoo!ファイナンスの「配当利回り(会社予想)ランキング」を GitHub Actions が定期的にスクレイピングして
`data/stocks.json` に保存し、GitHub Pages の静的ページがそのデータを読み込んで
掛け金(投資予算)ランク別のランキングを表示します。サーバーも Python 環境も不要です。

## 仕組み

```
GitHub Actions (平日 16:30 JST)
  └─ scripts/fetch.py ── Yahoo!ファイナンスを取得 ──▶ docs/data/stocks.json をコミット
GitHub Pages
  └─ index.html + app.js ── stocks.json を読み込み、ブラウザ上で絞り込み・並べ替え
```

## 公開手順 (初回のみ)

1. GitHub で新しいリポジトリを作成します (例: `dividend-ranking`)。
2. このフォルダをプッシュします。

   ```bash
   cd ~/Desktop/dividend-ranking-pages
   git remote add origin https://github.com/<ユーザー名>/dividend-ranking.git
   git push -u origin main
   ```

3. リポジトリの **Settings → Pages** で
   - Source: `Deploy from a branch`
   - Branch: `main` / フォルダ: `/ (root)`
   を選んで Save します。
4. **Settings → Actions → General → Workflow permissions** で
   `Read and write permissions` を選んで Save します (Actions がデータをコミットするために必要)。
5. 数分後に `https://<ユーザー名>.github.io/dividend-ranking/` で公開されます。

データを今すぐ更新したい場合は **Actions → Update dividend data → Run workflow** を実行します。

## 機能

- 掛け金ランク(〜5万 / 〜10万 / 〜30万 / 〜50万 / 〜100万 / 〜300万 / 制限なし)で絞り込み
- 予算を円で直接指定することも可能(ランクより優先)
- 市場(プライム / スタンダード / グロース / REIT等)、利回り下限、銘柄名・コード検索、表示件数
- 予算内で買える単元数・投資額・年間配当(予想)を自動計算
- 絞り込み条件は URL に反映されるので、そのままブックマーク・共有できます

## ローカルで確認する場合

```bash
python3 -m http.server 8000   # http://localhost:8000
```

データを手動で更新するには:

```bash
pip install -r requirements.txt
python scripts/fetch.py
```

## 注意

- 配当は会社予想値です。投資判断は自己責任でお願いします。
- 売買単位は通常100株、REIT(投資法人)は1口として計算しています。
- 取得元のページ構造が変わると `scripts/scraper.py` の `parse_page` の修正が必要です。
- 取得は最大20ページ(約1000銘柄、利回り上位順)に制限しています。
