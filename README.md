# 神アニメ診断（shindananime）

18問・6軸で好みを割り出して、いちばん刺さるアニメを3つ選ぶ診断。
公開先は **https://koshinstudio.com/app/shindananime/**（紹介ページは `/works/shindananime/`）。

このリポジトリにあるのはアプリ本体だけ。koshinstudio.com への取り付け（中継・紹介ページ）は
`koshin-studio` リポジトリの担当。

| | |
|---|---|
| `scrape_filmarks.py` | Filmarks から作品データを取って `anime_data.json` を書く。取れなければ手元の50作で作る |
| `anime_data.json` | 診断が照合するデータ（git に入れる） |
| `src/` | アプリ本体（HTML / JS / Tailwind CSS） |
| `src/questions.js` | 質問（18問） |
| `src/logic.js` | 判定の計算（画面を触らない） |
| `src/config.js` | **広告・アフィリエイトの設定はここだけ** |
| `tools/build.mjs` | `dist/` に配る形を組む |
| `tools/test.mjs` | 計算の検査 |
| `tools/e2e.mjs` | ブラウザで最初から最後まで押す検査（`--shots` で画面写真も撮る） |
| `store/` | 表紙（`cover-square-800x800.png`）。koshin-studio の `tools/images.py` が拾う |

## いつもの流れ

    npm install                       # 初回だけ（Tailwind の CLI）
    pip install -r requirements.txt   # 初回だけ（requests / beautifulsoup4）

    python3 scrape_filmarks.py        # データを作り直す（しなくてもよい）
    npm run check                     # build → 計算の検査 → ブラウザの検査
    npx wrangler pages deploy dist --project-name shindananime --branch main

**初回の deploy は必ず `--branch main` を付ける。** 付けないと、そのとき居た git の branch 名が
本番ブランチとして登録される（koshin-studio の README「C. ゲームを新しく作った」を参照）。

## 判定のしくみ

6つの軸を、それぞれ -1〜+1 で持つ。

| 軸 | + | - | 問題 |
|---|---|---|---|
| world 世界観 | R 現実・現代 | F 異世界・SF | Q1–3 |
| mood 後味・刺激 | D ダーク | H ハッピー | Q4–6 |
| structure 構成・テンポ | C 伏線・考察 | S テンポ・直感 | Q7–9 |
| bond 人間関係 | G 群像・絆 | I 孤高・推し | Q10–12 |
| taste サブテイスト | P 心理戦・ドラマ | A アクション・熱量 | Q13–15 |
| watch 視聴・演出 | V 映像美・じっくり没入 | L 気軽・一気見 | Q16–18 |

- 回答は5段階（A / どちらかといえばA / どちらともいえない / どちらかといえばB / B）→ +1, +0.5, 0, -0.5, -1
- 軸ごとに平均して、その人の6つの値にする。タイプは符号で6文字（例 `RDCIPV`）
- 作品も同じ6軸の値を持つ。近さは軸ごとの差で測り、**はっきり答えた軸ほど重く**見る
- Filmarks の★が取れている作品には、ごく少しだけ上乗せする（±0.04）
- 3作が似たものばかりにならないよう、選んだ作品と近すぎる候補は少し下げる
- 「見た」を押すと、その作品を除いて次に近い作品と入れ替える

作品側の軸は、フォールバックの50作は手で付けた見立て。Filmarks から新しく取れた作品は
レビュー本文に出る言葉（胸糞・伏線・作画 など）の数から見積もる（`TAG_AXES`）。

## データの取り方（scrape_filmarks.py）

- 先に robots.txt を読む。**読めなければ取りに行かない**
- リクエストの間隔は既定 2.0 秒（下限 1.5 秒）。429 が返ったらそこで止める
- 取れた作品が10件未満なら、手元の50作で埋める（`source` が `mixed` / `fallback` になる）
- Filmarks の HTML は変わる。取れなくなったら `SEL` と `LIST_PATHS` を直す

**Filmarks の利用規約を確かめてから回すこと。** 自動での取得や、取ったデータの再配布を
禁じている場合は、スクリプトは回さず `--fallback-only` で使う。

### データの出し方（権利）

- **スコア**: 出すときは「Filmarks の★」「いつ時点か」を書き、作品ページへリンクする（画面はそうなっている）
- **あらすじ**: 取った公式あらすじは権利者のもの。今は400字で切って出している。
  気になるなら `scrape_filmarks.py` で空にして、自分の一行紹介を使う
- **画像**: 作品の絵は権利者のもの。`config.js` の `showImages` は `false`（色の札で代わりに出す）。
  使ってよいと確かめるまでは変えない
- フォールバックの50作は **スコアを持たない**（`null`）。数字をでっち上げないため。
  画面では「Filmarks でレビューを見る」リンクだけを出す

## 収益（広告・アフィリエイト）

設定は `src/config.js` だけ。**何も埋めなければ、他社の script は一切読み込まない。**

### 配信サービス（アフィリエイト）

- 各作品に「U-NEXTで探す」などのボタンが出る。既定は各サービスの検索ページへのただのリンク
- `vod[].affiliate` に ASP のリンクの型を書くと、そのボタンだけ
  - `rel="sponsored noopener"` が付く
  - ボタンに **PR** の札が出る
  - 結果画面の下に「一部はアフィリエイトリンクです」の注記が出る
- 型の中の `{q}` に作品名、`{url}` に検索 URL が（どちらも URL エンコードして）入る
- ステマ規制（2023年10月〜）に沿って、広告であることは必ず見える形にしている。外さないこと
- 配信の有無は変わるので「で見る」と言い切らない。Filmarks から配信情報が取れた作品だけ
  「配信（取得時点）」として出し、それ以外は「で探す」にしている
- **検索 URL の形は各サービスの都合で変わる。出す前に一つずつ踏んで確かめること**

### 解析中の画面（ローディング）

- 解析中の画面は約3.2秒。6軸のバーが伸びる、診断そのものの演出
- ここには **AdSense を置かない**。中身の無い画面・遷移中の画面への広告は AdSense の方針違反になりうるため
- 代わりに `loadingPr` で自前の PR 枠（アフィリエイト1枠）を出せる。PR 表記つき。
  「無料」「○日間」などの条件は、確かめたものだけを書く

### AdSense

- `ads.enabled` を `true` にして `client` と `slots.result` を埋めると、結果画面の
  「スポンサーリンク」枠にだけ出る。script は結果を出す時に初めて読む
- `ads.txt` は **koshinstudio.com の直下**に置く（koshin-studio リポジトリ）。このアプリの Pages ではない
- 出し始めたら koshin-studio の `privacy/index.html`（あつかい）の「広告について」を書き足す

## 置き方

- `koshinstudio.com/app/shindananime/` は koshin-studio の `worker/` が
  `https://shindananime.pages.dev` に中継している。中の指定は全部相対（`./app.js` など）にしてある
- 実物のページは `noindex, follow`（meta と `_headers` の両方）。検索に出すのは紹介ページの方
- データは端末の中で計算するだけ。回答はどこにも送らない
