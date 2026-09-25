# shindananime — Claude Code 向けのメモ

アニメ診断アプリ（koshinstudio.com/app/shindananime/）と、そのデータ作り。詳しくは README.md。
手元で Filmarks を取る手順は docs/LOCAL_SETUP.md。

## 決まりごと

- Filmarks: robots.txt を守る。間隔は 1.5 秒より縮めない（`Fetcher.MIN_SLEEP`）。scrape.do 経由でも同じ
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
