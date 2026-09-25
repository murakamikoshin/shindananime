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

リポジトリの直下に `.env` を作って、こう書く（`.gitignore` 済み）:

    SCRAPEDO_TOKEN=scrape.do の管理画面のトークン
    ANNICT_TOKEN=https://annict.com/settings/apps で作った個人用トークン

読み込む:

    set -a; source .env; set +a                   # Mac / Linux / Git Bash
    # PowerShell: Get-Content .env | % { $k,$v = $_ -split '=',2; Set-Item "env:$k" $v }

## 4. まず 1 枚だけ試す（大事）

Filmarks の画面の作りは、こちらでは確かめられていない。先に 1 枚読んで、項目が取れるか見る。

    python3 build_anime_db.py --probe https://filmarks.com/animes/<シリーズ>/<シーズン>

最後の行が「読めなかった項目: なし」ならよい。何か欠けていたら、Claude Code にこう頼む:

> `--probe` の結果で score と synopsis が取れていない。取った HTML は `.cache/pages/` にある。
> `build_anime_db.py` の `SEL` を実際の HTML に合わせて直して、`tests/test_build.py` の作り物の HTML も合わせて。

`sitemaps` が空なら、一覧ページを辿る方（`FM_LIST_PATHS`）を使う。これも実物に合わせて直してもらう。

## 5. 少しだけ回す → 全部回す

    python3 build_anime_db.py --filmarks --limit 30      # 30 作だけ
    npm run serve                                         # http://localhost:4600/app/shindananime/ で見る

よさそうなら全部:

    python3 build_anime_db.py --annict --filmarks

- 1 ページ 1.5 秒。1 万ページで約 4 時間。**パソコンが眠らない設定にしておく**
  （Mac: `caffeinate -i python3 build_anime_db.py --annict --filmarks`）
- 止まっても、同じコマンドをもう一度打てば続きから（取った作品は飛ばす）
- 429 / 503 が続いたら自分で止まる。少し時間をおいてから、もう一度

## 6. できたら

    npm run check                    # 検査を全部
    git add data/ all_anime_db.json
    git commit -m "Filmarks の全アニメを取った"
    git push

`all_anime_db.json` が大きすぎる（数 MB を超える）ときは Claude Code に相談する（あらすじを短くする、分割する など）。

## 7. 毎期の追加（1 月・4 月・7 月・10 月）

    set -a; source .env; set +a
    python3 build_anime_db.py --annict --filmarks --refresh-since 2026
    npm run check && git add data/ all_anime_db.json && git commit -m "2026 年春の新作を足す" && git push

- `--filmarks` は、取ったことのある作品を飛ばして新しいページだけ取る
- `--refresh-since 2026` は、2026 年以降の作品だけ★やレビュー数を取り直す（放送中は数字が動くため）
- そのあと README の「5. 出す」で公開する

## 気をつけること

- **Filmarks の利用規約**を先に読む。自動取得や再配布が禁じられていたら、Filmarks は回さない
- 間隔（1.5 秒）を縮めない。scrape.do を通しても同じ
- `.env` と `.cache/` は git に入れない（`.gitignore` 済み）
