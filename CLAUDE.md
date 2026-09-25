# shindananime — Claude Code 向けのメモ

アニメ診断アプリ（koshinstudio.com/app/shindananime/）と、そのデータ作り。詳しくは README.md。
手元で Filmarks を取る手順は docs/LOCAL_SETUP.md。

## 決まりごと

- Filmarks: robots.txt を守る。間隔は 1.5 秒より縮めない（`Fetcher.MIN_SLEEP`）。scrape.do 経由でも同じ
- Filmarks の取得はまず直接。403/429/503 が続いた時だけ scrape.do に自動で切り替わる（クレジットを無駄に使わないため。`.env` に `SCRAPEDO_TOKEN` があっても既定はこれ）
- トークンは環境変数（`.env`）だけ。コードやコミットに書かない
- レビュー本文そのものは保存しない（`counts` に言葉の数だけ残す）。Filmarks も Annict も同じ
- 手元の名作一覧（data/default_titles.tsv）にスコアをでっち上げない
- 画面の数字（件数・除外数）は実際に数えた値を出す
- アフィリエイトのボタンは PR 表記と rel="sponsored" を外さない

## よく使う

    python3 build_anime_db.py --probe <Filmarks の作品 URL>   # 1 枚だけ読んで確かめる
    python3 build_anime_db.py --filmarks                      # 取る（続きから。Annict も足すなら --annict）
    npm run check                                             # 検査を全部
    npm run serve                                             # http://localhost:4600/app/shindananime/

Filmarks の画面の作りが変わったら `SEL` / `FM_LIST_PATHS` を直し、tests/test_build.py の作り物の HTML も合わせる。

## いまの状況（2026-09-25 時点。終わったら書き換える）

終わったこと
- アプリ本体（src/）: 基本 20 問＋追加 18 問、6 軸のタイプコード、運命の1作＋次点2作。検査は `npm run check` で全部通る
- Annict: 作品一覧 15,971 作を `data/annict_works.jsonl` に取った（まだ push していない）
- Filmarks: `--probe https://filmarks.com/animes/3844/5200` で全項目が読めることを確かめた（★4.3・レビュー数・年・あらすじ・制作会社・再生時間・配信）
- 1. Annict のレビュー取得 … 完了（4,213 作に手がかりあり。`data/annict_reviews.jsonl`）
- 2. Filmarks 30 作の中身確認 … 完了（★・レビュー数・年・あらすじ・制作会社・配信は良好。`minutes` の欠けは個別ページの実際の欠落で SEL の不具合ではない）
- Fetcher を「まず直接、403/429/503 が続いたら scrape.do に切り替え」の作りに変更（前は `SCRAPEDO_TOKEN` があると全部 scrape.do 経由だった。クレジットの節約のため）。`tests/test_build.py` も合わせて直し、`npm run check` の Python 側は通った

いま進めていること
3. `caffeinate -i python3 build_anime_db.py --filmarks` を実行中（バックグラウンド。直接取得、ブロックされたら自動で scrape.do）。1 万ページ弱で約 3 時間。止まっても同じコマンドで続きから

次にやること（この順で）
4. 最後の行の「手がかり不足で落とした N」を見る。多すぎたら TAG_WORDS や --min-info を見直す
5. `npm run check` → `git add data/ all_anime_db.json` → commit → push
6. 公開（README の「5. 出す」と koshin-studio の README の順番: アプリ → 中継 worker → サイト）

決まっていないこと（持ち主に聞く）
- `data/visual_studios.tsv` に足す会社（例: マッドハウス）

解決したこと
- Filmarks の利用規約・AdSense の「解析中画面」の方針 → 持ち主がリスクを承知の上で許容する判断（2026-09-25）。loading 枠も本物の広告にする（loadingPr には逃がさない）
- AdSense: koshinstudio.com を AdSense for content として登録、`ads.txt` を本番に出した。サイト審査待ち。広告ユニット（`top`/`loading`）は審査が通ってから作る
- Filmarks への外向きリンク（結果画面の「Filmarks でレビューを見る」ボタン）を削除。★スコアは「あくまで診断材料」として使うだけで、画面には一切出さない（2026-09-25、`src/app.js`）。footer の Filmarks・Annict という名前も、カードの「Filmarks ★」表示も削除済み。★は `quality()` の内部計算にだけ使う
- 作品画像（Annict の公式サイト OGP 画像 / Filmarks の og:image）→ 持ち主がリスクを承知の上で出す判断（2026-09-25）。`showImages: true`。優先順位は Annict → 無ければ Filmarks（`build_anime_db.py` の `merge()`、`image` は上書きしない＝先勝ち）
- 質問画面のボタン配置を直した。A/B の本回答と「どちらかといえば」がバラバラの並びだったのを、A 列・B 列で縦に揃えて「どちらともいえない」だけ下に独立させた（2026-09-25、`src/index.html`）
- 結果画面の軸バーの「ほぼ半々」表示をやめた。常に「{勝った側} 寄り {%}」と言い切る（タイプコードの文字も元々「ちょうど0なら+側」で言い切る作りなので、それに揃えた）。質問数を増やして半々を減らす案は検討したが、しきい値の絶対値 0.1 が質問数のスケールに合わずバグる上、効果も薄い（3問→21問でも15.2%→6.0%止まり）ので却下（2026-09-25、`src/app.js` の `axisRow`）

気をつけること
- `all_anime_db.json` は手元で作ったものが正。クラウド側からは push しない約束
- Python は Mac 標準の 3.9。ターミナルを開いたら `source .venv/bin/activate` を先に
