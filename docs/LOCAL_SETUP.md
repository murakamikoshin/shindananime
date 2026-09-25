# 手元で Filmarks の全アニメを取る（VS Code + Claude Code）

一度全部取れば、あとは毎期の新作だけを足せばよい（取ったものは `data/filmarks_works.jsonl` に残る）。

## 0. 入れるもの（最初の一回だけ）

| | Mac | Windows |
|---|---|---|
| Git | `xcode-select --install` | https://git-scm.com/download/win |
| Python 3.10 以上 | `brew install python`（または python.org） | https://www.python.org/downloads/ （「Add python.exe to PATH」に印） |
| Node.js 20 以上 | `brew install node`（または nodejs.org） | https://nodejs.org/ （LTS） |
| VS Code | https://code.visualstudio.com/ | 同じ |
| Claude Code | VS Code の拡張機能で「Claude Code」を入れる | 同じ |

入ったか確かめる（VS Code のターミナル: 表示 → ターミナル）:

    git --version
    python3 --version      # Windows は python --version
    node --version

## 1. リポジトリを持ってくる

    cd ~/Desktop            # 置きたい場所。koshin-studio と横に並べる
    git clone https://github.com/murakamikoshin/shindananime.git
    cd shindananime
    git switch claude/anime-diagnosis-app-cjxvid     # main に入ったら、この行は要らない
    code .                  # VS Code で開く

## 2. 道具を入れる

    python3 -m venv .venv
    source .venv/bin/activate          # Windows: .venv\Scripts\activate
    pip install -r requirements.txt
    npm install

## 3. トークンを置く（git には入らない）

使うのは scrape.do のトークンだけ。Annict は任意（Filmarks だけで診断は作れる。足すと Filmarks に無い作品と「見ている人の数」が増える）。
トークンは**パスワードと同じ扱い**（人に見せない・チャットに貼らない・git に入れない）。

### 3-1. scrape.do のトークンを写す

1. https://dashboard.scrape.do/ にログイン
2. ダッシュボードの最初の画面に出ている **API Token**（長い英数字）の横のコピーを押す

### 3-2. Annict のトークンを作る（任意。使わないなら飛ばす）

1. https://annict.com/ にログイン（アカウントが無ければ作る。無料）
2. 右上のアイコン →「設定」→ 左の「アプリ」、または直接 https://annict.com/settings/apps を開く
3. 「個人用アクセストークン」の方で「新規作成」（「OAuth アプリケーション」の方ではない）
4. 説明は何でもよい（例: `shindananime`）。スコープは **読み込み専用** を選んで登録
5. 出てきたトークンをコピーする。**この画面を閉じると二度と見られない**ので、すぐ次へ

### 3-3. .env を作る

VS Code の左の一覧（エクスプローラー）で `.env.example` を右クリック →「コピー」→ 同じ場所に「貼り付け」
→ できた `.env.example のコピー` を右クリック →「名前の変更」で **`.env`** にする（先頭の点を忘れない）。

ターミナルなら:

    cp .env.example .env              # Windows PowerShell: Copy-Item .env.example .env

`.env` を開いて、= の右に貼る。**引用符も空白も要らない**:

    SCRAPEDO_TOKEN=ここに scrape.do のトークン
    ANNICT_TOKEN=                              ← Annict を使わないなら空のまま

保存する（Ctrl+S / ⌘S）。

### 3-4. 入ったか確かめる

    python3 build_anime_db.py --check-env

こう出れば OK（トークンそのものは画面に出ない。末尾 4 文字だけ）:

    SCRAPEDO_TOKEN: 入っている（32 文字・末尾 …ab12）
    ANNICT_TOKEN: 入っている（43 文字・末尾 …9xyz）
    Annict: 通った（あなたのユーザー名 さんのトークン）

| 出たもの | 直し方 |
|---|---|
| 入っていない | `.env` の名前が違う（`.env.txt` になっている等）か、保存していない。Windows は「表示 → ファイル名拡張子」を入れて確かめる |
| Annict: 通らない（401） | トークンの写し間違い。3-2 で作り直して貼り直す |
| Annict: 確かめられない | ネットに繋がっていない、または会社などのネットで止められている |

最後に、`.env` が git に入らないことを確かめる:

    git status          # 一覧に .env が出てこなければよい

スクリプトは `.env` を自分で読むので、ターミナルで読み込む操作は要らない。
scrape.do のトークンが本当に通るかは、次の 4 で 1 枚取ってみれば分かる。

## 4. まず 1 枚だけ試す（大事）

Filmarks の画面の作りは、こちらでは確かめられていない。先に 1 枚読んで、項目が取れるか見る。

    python3 build_anime_db.py --probe https://filmarks.com/animes/<シリーズ>/<シーズン>

最後の行が「読めなかった項目: なし」ならよい。何か欠けていたら、Claude Code にこう頼む:

> `--probe` の結果で score と synopsis が取れていない。取った HTML は `.cache/pages/` にある。
> `build_anime_db.py` の `SEL` を実際の HTML に合わせて直して、`tests/test_build.py` の作り物の HTML も合わせて。

`sitemaps` が空なら、一覧ページを辿る方（`FM_LIST_PATHS`）を使う。これも実物に合わせて直してもらう。

## 5. Annict を取る（任意・公式 API なので速い）

    python3 build_anime_db.py --annict --limit 50     # 試しに 50 作とそのレビュー
    python3 build_anime_db.py --annict                # 全部。作品 → レビューの順に取る

- 作品は数分〜十数分。レビューは見ている人が 30 人以上の作品だけ、10 作ずつ取る
- 止まっても、もう一度打てば続きから（レビューは取ってある作品を飛ばす）
- 最後の行の「手がかり不足で落とした ○○」が減っていれば、レビューが効いている

## 6. 少しだけ回す → 全部回す

    python3 build_anime_db.py --filmarks --limit 30      # 30 作だけ
    npm run serve                                         # http://localhost:4600/app/shindananime/ で見る

よさそうなら全部:

    python3 build_anime_db.py --filmarks              # Annict も足すなら --annict を付ける

- 1 ページ 1.5 秒。1 万ページで約 4 時間。**パソコンが眠らない設定にしておく**
  （Mac: `caffeinate -i python3 build_anime_db.py --filmarks`）
- 止まっても、同じコマンドをもう一度打てば続きから（取った作品は飛ばす）
- 429 / 503 が続いたら自分で止まる。少し時間をおいてから、もう一度

## 7. できたら

    npm run check                    # 検査を全部
    git add data/ all_anime_db.json
    git commit -m "Filmarks の全アニメを取った"
    git push

`all_anime_db.json` が大きすぎる（数 MB を超える）ときは Claude Code に相談する（あらすじを短くする、分割する など）。

## 8. 毎期の追加（1 月・4 月・7 月・10 月）

    python3 build_anime_db.py --annict --filmarks --refresh-since 2026
    npm run check && git add data/ all_anime_db.json && git commit -m "2026 年春の新作を足す" && git push

- `--filmarks` は、取ったことのある作品を飛ばして新しいページだけ取る
- `--refresh-since 2026` は、2026 年以降の作品だけ★やレビュー数を取り直す（放送中は数字が動くため）
- そのあと README の「5. 出す」で公開する

## 気をつけること

- **Filmarks の利用規約**を先に読む。自動取得や再配布が禁じられていたら、Filmarks は回さない
- 間隔（1.5 秒）を縮めない。scrape.do を通しても同じ
- `.env` と `.cache/` は git に入れない（`.gitignore` 済み）
