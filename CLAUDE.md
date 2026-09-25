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
- アプリ本体（src/）: 全50問（基本20問＋好みの要素30問、続けて1回で聞く）、6 軸のタイプコード、運命の1作＋次点2作。検査は `npm run check` で全部通る
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
- バグ: 適合度%が軸の類似度（cos）だけから出ていて、実際の並び順（★・人気・年代・好みまで足した total）とズレていた。「82%より80%が選ばれる」ように見えた。`rank()` の match を total から出すように直した（`src/logic.js`）。あわせて、値がちょうど0でも「寄り 50%」という自己矛盾を出さないよう、軸バーの%は最低51%を主張する（2026-09-25、`src/app.js` の `axisRow`）
- バグ: 「見た → 別の作品にする」がその枠だけ差し替えていて、次点を繰り上げていなかった（適合度の並び順とズレる）。`replace()` を `pick()` の再計算に統一して、次点が繰り上がるようにした（2026-09-25、`src/app.js`）
- 好みの要素を 18 → 30 問に増やして全50問に（舞台・ジャンル・トーンで12問追加。`school/fantasy/scifi/historical/modern/horror/mystery/adventure/hotblood/family/work/mature`）。`build_anime_db.py` の `FEATURES` にも対応するタグを追加。基本20問との二段階（「もっと絞り込む？」画面）はやめて、常に50問を続けて聞く作りに統一（2026-09-25）
- バグ: 質問を増やしたことで、片方ばかり選ぶと `total`（cos + quality + era + 好み）が 1 を超えて、複数の作品が match 100% に張り付き「同じ系統でもニュアンスが違う」はずの差が消えた。`quality()` の上乗せを控えめに（最大 0.18→0.126）、`prefAdjust()` の合計に上限（±0.08）を付けて緩和した。普通の（極端でない）回答では元々十分な差が出る（2026-09-25、`src/logic.js`）
- バグ: 配信ボタン（DMM TV / U-NEXT）が、その作品が実際にそのサービスにあるかを見ずに毎回出ていて、無い場合に検索結果が空になっていた。`w.vod`（Filmarks が持っている実際の配信状況）でボタンを絞り込むように直した。`w.vod` が分からない作品は今まで通り全部の中から出す（2026-09-25、`src/app.js` の `vodButtons`）。あわせて、Prime Video・Netflix・ABEMA・Hulu・Disney+・dアニメストア・TELASA・FOD・Lemino・バンダイチャンネルの10サービスを追加（`src/config.js`、`build_anime_db.py` の `VOD_NAMES`）。検索URLは実際にブラウザで確かめた。Disney+とバンダイチャンネルは検索URLの形が確かめられなかったので、トップページへのリンクにしてある（アフィリエイトは全部未提携。決まったら `url` を埋める）。サービスが増えてカードが縦に伸びすぎるので、`MAX_VOD_BUTTONS = 3` で上位3つに絞る
- 質問画面の「世界観　R or F」のような軸の札（`qaxis`）は不要という指摘で削除（2026-09-25、`src/index.html` / `src/app.js`）
- 配信ボタンを「メジャー度順」に並べ直した（Netflix・Prime Video・Disney+・U-NEXT・Hulu・DMM TV・ABEMA・dアニメストア・FOD・TELASA・Lemino・バンダイチャンネルの順）。実際に見られるサービスの中から、この並びで上位3つが出る（2026-09-25、`src/config.js`）
- バグ: 適合度%を整数に丸めていたせいで、近い値の作品が同じ%にたくさん集まって見えた。小数第一位まで出すようにした（2026-09-25、`src/logic.js` の `matchPct`）
- 画像が無い作品が多い（77%程度）→ 調べたら、AnnictとFilmarksでタイトルの区切り方が違い（「Season 3 Part.1」と「Season3」など）、同じ作品なのにマージが一致せず画像だけ欠けているケースが大半だった。同じシリーズ（`franchise_key`）で画像がある作品から借りるようにして 86% まで改善（2026-09-25、`build_anime_db.py` の `finish()`）
- footer の「あつかい（プライバシー）」が koshinstudio.com 全体のページで関係ないという指摘 → このアプリ専用のプライバシーページを新設（`src/privacy/index.html`）。診断の回答・作品データ・広告(AdSense)・配信ボタンについて書いた。AdSenseの規約でプライバシーポリシーの掲示が必須なので、リンクは無くさずに作り直す方針にした（2026-09-25）。あわせて `tools/serve.mjs` が「ディレクトリ/index.html」を解決できていなかったので直した（本番の Cloudflare Pages は元々対応している）
- バグ: DMM TV の検索URL（`/vod/search/`）が404になっていた（DMM TV 側の変更）。実際にブラウザで確かめて `/vod/list/` に直した（2026-09-25、`src/config.js`）
- 質問画面で、問題文・選択肢の文字数によってボタンの位置がズレるのがストレスという指摘 → `#qtext` と A/B の選択肢ボタンに `min-h` を付けて、どの質問でも下のボタンの位置が揃うようにした（実際に最長・最短の質問で確認済み。2026-09-25、`src/index.html`）
- バグ: 「アルプスの少女ハイジ」など、画像URLが `http://` の作品が出ない。https のこのアプリから混在コンテンツでブロックされていた（`heidi.ne.jp` は証明書も無い）。`https_only()` を作り、Annict・Filmarks 両方の画像取得と `merge()` の image 優先ロジックに適用。http の画像は「無い」扱いにして、後から来る https（大抵 Filmarks の CloudFront）で埋まるようにした。テストの `image: 'an.jpg'` のような作り物も https URL に直した（2026-09-25、`build_anime_db.py`）
- バグ: 「ゲボイデ＝ボイデ」「ぷれぷれぷれあです」など、URLはhttpsでも実物の絵ではない画像（Filmarks自身の「画像が無い時の仮の絵」＝`placehold`、公式サイト共通の汎用OGP画像＝`default-og-image`）が出ていた。`BAD_IMAGE_HINTS` で弾くようにした（2026-09-25、`build_anime_db.py`）。ネットワークでURLの生死を確かめる仕組みはまだ無いので、既知のパターン以外の壊れたリンクは今後も見つかり次第ここに足す
- 結果画面の軸バーの中央の目印線が実際の中心から1pxズレていた（`transform: translateX(-50%)` が無かった）のと、左右のラベルの文字数が違うと真ん中のラベル（「世界観」など）が中心からズレる作り（flex justify-between）だったのを直した。ラベルは3等分グリッドに変更（2026-09-25、`src/styles.css`・`src/app.js`）
- 視覚軸だけ負の側が `ST`（2文字）で他の軸と揃っていなかったのを `T`（Tale）に統一。`FHSA-STL`→`FHSA-TL`、`RHSP-STL`→`RHSP-TL` など、二つ名の決め打ちコードやテストの正規表現も合わせて直した（2026-09-25、`src/logic.js`）

気をつけること
- `all_anime_db.json` は手元で作ったものが正。クラウド側からは push しない約束
- Python は Mac 標準の 3.9。ターミナルを開いたら `source .venv/bin/activate` を先に
