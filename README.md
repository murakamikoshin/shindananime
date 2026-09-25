# ガチアニメ診断（shindananime）

18問・6軸であなたのアニメタイプ（例 `RDCP-VM`）と二つ名を割り出し、アニメのデータベース全体から
「運命の1作」と次点2作を選ぶ診断。

公開先は **https://koshinstudio.com/app/shindananime/**（紹介ページは `/works/shindananime/`）。
このリポジトリにあるのはアプリ本体とデータ作りだけ。koshinstudio.com への取り付け（中継・紹介ページ）は
`koshin-studio` リポジトリの担当。

| | |
|---|---|
| `build_anime_db.py` | データ作り。Annict・Filmarks から取って `all_anime_db.json` を書く |
| `data/default_titles.tsv` | APIキー無しでも動くための、主要・名作アニメ約500作（手入力） |
| `all_anime_db.json` | 診断が照合するデータ（git に入れる） |
| `src/` | アプリ本体（HTML / JS / Tailwind CSS） |
| `src/questions.js` | 質問（18問） |
| `src/logic.js` | タイプコード・二つ名・コサイン類似度（画面を触らない） |
| `src/config.js` | **広告・アフィリエイト・共有文面の設定はここだけ** |
| `tools/` | build / serve / 検査 / 表紙 |
| `tests/` | `build_anime_db.py` の検査（通信は作り物に差し替える） |

---

## 1. はじめて動かす（ローカル確認）

    npm install                       # Tailwind の CLI
    pip install -r requirements.txt   # requests / beautifulsoup4

    python3 build_anime_db.py         # APIキー無し → 名作 約500作で all_anime_db.json を作る
    npm run serve                     # → http://localhost:4600/app/shindananime/

本番と同じ `/app/shindananime/` の下で開く（相対指定の漏れがあればここで気づく）。

検査をまとめて:

    npm run check     # build → Python の検査 → 計算の検査 → ブラウザで最初から最後まで押す

`node tools/e2e.mjs --shots` で `store/shot-*.png` に画面写真が残る（紹介ページ用）。

## 2. データを作る（build_anime_db.py）

    python3 build_anime_db.py                             # 手元の約500作だけ
    ANNICT_TOKEN=xxxx python3 build_anime_db.py --annict   # + Annict の全作品
    python3 build_anime_db.py --filmarks                   # + Filmarks のアニメ全部
    SCRAPEDO_TOKEN=xxxx python3 build_anime_db.py --filmarks   # scrape.do を通す
    python3 build_anime_db.py --filmarks --limit 30        # 試しに 30 件だけ

トークンは**環境変数で渡す**。ファイルやリポジトリには書かない。

### Annict API

1. https://annict.com/settings/apps →「個人用アクセストークン」を作る（読み取りだけでよい）
2. `ANNICT_TOKEN=... python3 build_anime_db.py --annict`

- GraphQL（`https://api.annict.com/graphql`）の `searchWorks` を、シーズンごと（1960年〜来年）に頁を送って取る
- 取るもの: タイトル・放送年・媒体（TV / MOVIE / OVA / WEB。OTHER は落とす）・画像 URL・見ている人の数
- 続けて、作品ごとのレビュー（1 作 30 件まで）を 10 作ずつまとめて取る。見ている人が
  `--annict-min-watchers`（既定 30）人未満の作品は飛ばす。`--no-annict-reviews` で取らない
- レビュー本文は残さず、言葉の数（`counts`）だけを `data/annict_reviews.jsonl` に 1 作 1 行で足していく。
  止めても続きから。この言葉から 6 軸を見積もるので、**Filmarks に無い作品も診断に出せる**
- Annict にはあらすじと★が無い。★は Filmarks が取れた作品だけに出る
- `--annict-since 2000` で取り始めの年を変えられる

### Filmarks

- まず `robots.txt` を読む。**許されていない道には行かない。読めなければ行かない**
- robots.txt の `Sitemap:` から、名前に anime の付いた sitemap だけを辿り、`/animes/<シリーズ>/<シーズン>` を全部集める。
  sitemap が無ければ一覧ページ（`FM_LIST_PATHS`）を辿る
- 1 ページごとに ★スコア・レビュー数・あらすじ・レビュー本文・配信サービス・画像を取る
- 間隔は既定 1.5 秒（これより短くはできない）。**1万ページで約4時間**
- 取ったページは `.cache/pages/` に残る。**止めても、次は続きから**（取り直したい時は `.cache` を消す）
- 429 / 503 が 3 回続いたらそこで止める
- `SCRAPEDO_TOKEN` があれば、全部の取得（robots.txt 含む）を scrape.do 経由にする。
  間隔と robots.txt はそのまま守る

**回す前に Filmarks の利用規約を確かめること。** 自動取得やデータの再配布が禁じられているなら、
Filmarks は回さず、Annict と手元の一覧だけで作る。Filmarks の HTML は予告なく変わる。
取れなくなったら `SEL` と `FM_LIST_PATHS` を直す（`tests/test_build.py` の作り物の HTML も合わせる）。

### 取ったものの置き場と、毎期の追加

- Filmarks で取った作品は `data/filmarks_works.jsonl`、Annict は `data/annict_works.jsonl`（作品）と `data/annict_reviews.jsonl`（レビューの言葉）に 1 行 1 作品で残る（git に入れる）
- `--filmarks` を付けなくても、取ってある分は毎回 all_anime_db.json に入る
- `--filmarks` は**取ったことのある作品を飛ばす**。毎期はこれで新作だけ取れる
- `--refresh-since 2026` でその年以降の作品を取り直す（★の更新）。`--refresh-all` で全部
- 手元で全部取る手順は **docs/LOCAL_SETUP.md**

### まとめ方

- タイトル（記号・空白を落として比べる）が同じで、放送年が1年以内なら同じ作品として1行にまとめる
- 6軸の値:
  - 手元の一覧の作品 … 手で付けたタグから計算（`TAGS`）。取れた文章の言葉を少しだけ混ぜる
  - それ以外 … あらすじと、Filmarks・Annict のレビューに出る言葉（`TAG_WORDS`）を足し合わせて数え、タグ → 軸にする
  - 手がかりがほとんど無い作品（`--min-info` 未満）は落とす
- 人気 `p`（0〜1）… Filmarks のレビュー数か Annict の見ている人の数の大きい方（対数）

### all_anime_db.json の形

1万件でも軽いよう、キーは短くしてある（`meta.keys` に説明がある）。

    { "meta": {...}, "works": [
      { "id":0, "t":"タイトル", "y":2013, "m":"TV", "s":4.3, "n":123456, "p":0.9, "i":1,
        "v":[world, mood, structure, taste, visual, watch], "g":["タグ"], "syn":"あらすじの冒頭",
        "img":"...", "fm":"Filmarks の URL", "an":Annict の id, "se":シリーズ id, "vod":["unext"], "src":"adf" } ] }

## 3. 判定のしくみ

| 軸 | + | - | 問題 |
|---|---|---|---|
| 世界観 | R 現実・現代 | F 異世界・SF | Q1–3 |
| 後味・刺激 | D ダーク | H ハッピー | Q4–6 |
| 構成・テンポ | C 伏線・考察 | S テンポ・勢い | Q7–9 |
| サブテイスト | P 心理戦・言葉 | A アクション・迫力 | Q10–12 |
| 視覚・フェチズム | V 映像美・演出 | ST ストーリー・脚本 | Q13–15 |
| 視聴スタイル | M 熟読・考察 | L 一気見・サクッと | Q16–18 |

- 回答は5段階（A / どちらかといえばA / どちらともいえない / どちらかといえばB / B）→ +1, +0.5, 0, -0.5, -1。軸ごとに平均
- **タイプコード**: 6軸の勝った側の文字を `[軸1][軸2][軸3][軸4]-[軸5][軸6]` に並べる（`RDCP-VM`、`FHSA-STL`）。ちょうど0なら + 側
- **二つ名**: 次の4つは決め打ち。残り60通りは「世界観×後味」「構成×テイスト」「視覚×視聴」の3部品を組んで作る（64通りすべて別の名前）

  | コード | 二つ名 |
  |---|---|
  | RDCP-VM | 深淵を覗く考察コレクター |
  | FHSA-STL | 脳汁全開の爽快エンタメハンター |
  | FDCA-VM | 異世界を旅するロマン追及者 |
  | RHSP-STL | 現実逃避のライトファン |

- **選び方**: 全作品とコサイン類似度を取り、`0.82×cos + 0.12×人気 + 0.06×★` の順に並べる。
  同じシリーズ（1期・2期・劇場版）と、軸がほぼ同じ作品は並べない
- **適合度**: `50 + 50×cos`（%）
- **ローディングの「N件を除外」**: いちばんはっきり答えた2軸で、逆の側に寄っている作品を本当に数えた数。
  件数も DB の実際の件数を出す（1万件の DB を作れば「10,000件超」になる）

## 4. 収益（広告・アフィリエイト）

設定は `src/config.js` だけ。

### 広告枠

- 結果画面のいちばん上（`slots.top`）と、解析中の画面のまん中（`slots.loading`）
- `ads.enabled` が false の間は、枠線と「スポンサーリンク」だけのダミー枠。`showPlaceholder: false` で消せる
- `enabled` にして `client` と各 slot を埋めると、その枠だけ AdSense が入る（script はその時に初めて読む）
- **解析中の枠の注意**: 中身が少なく自動で移る画面は、AdSense の「コンテンツの無い画面への広告」に当たる恐れがある。
  審査前に方針を確かめること。心配なら `loadingPr`（自前の PR 枠）に切り替える
- `ads.txt` は **koshinstudio.com の直下**に置く（koshin-studio リポジトリ）。広告を出し始めたら、
  koshin-studio の `privacy/index.html`（あつかい）の「広告について」も書き足す

### 配信ボタン（アフィリエイト）

- どの作品カードにも「DMM TVで無料体験視聴する ➔」「U-NEXTで31日間無料体験 ➔」が出る
- `vod[].url` にアフィリエイトリンクを入れる。`{q}` に作品名、`{url}` にそのサービスの検索 URL が入る
  （例 A8.net: `https://px.a8.net/svt/ejp?a8mat=XXXX&a8ejpredirect={url}`）
- url を入れたボタンには **PR の札と `rel="sponsored"`** が付き、結果の下に「アフィリエイトリンクです」の注記が出る。
  ステマ規制（2023年10月〜）に沿うためなので、外さないこと
- url が空の間は各サービスの検索ページへのただのリンク
- 「31日間無料」などの条件はサービス側で変わる。**提携先の最新の条件と `label` を合わせること**
- その作品が本当にそのサービスで見られるかは分からない（画面にも「各サービスでご確認ください」と出している）

### 共有

- `shareText` と `shareTags`。既定は
  「私のアニメ診断タイプは【RDCP-VM：深淵を覗く考察コレクター型】でした！あなたにぴったりの神アニメは…？ #アニメ診断 #アニメ」

## 5. 出す

    npm run check
    npx wrangler pages deploy dist --project-name shindananime --branch main

**初回の deploy は必ず `--branch main` を付ける**（付けないと、居た git の branch 名が本番ブランチになる）。
そのあと koshin-studio の README の順番（中継 → サイト）で出す。

## 6. データの出し方（権利）

- **★スコア**: 「Filmarks の★」「いつ時点か」を書き、作品ページへリンクしている
- **あらすじ**: Filmarks の公式あらすじは権利者のもの。今は冒頭110字だけを出している
- **画像**: `config.js` の `showImages` は `false`（色の札で代わりに出す）。使ってよいと確かめるまでは変えない
- 手元の約500作は**スコアを持たない**（数字をでっち上げないため）。画面では「Filmarks でレビューを見る」だけを出す
- 回答は端末の中で計算するだけで、どこにも送らない
