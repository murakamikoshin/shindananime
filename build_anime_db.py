#!/usr/bin/env python3
"""アニメ診断のデータベース（all_anime_db.json）を組み立てる。

    pip install -r requirements.txt

    # 何も取りに行かず、手元の名作 500 作だけで作る（APIキーなしで動く）
    python3 build_anime_db.py

    # Annict の全作品を足す（https://annict.com/settings/apps で個人用トークンを作る）
    ANNICT_TOKEN=xxxx python3 build_anime_db.py --annict

    # Filmarks にあるアニメを全部取る（何時間もかかる。途中で止めても続きから）
    python3 build_anime_db.py --filmarks
    # SCRAPEDO_TOKEN があっても既定は直接取得。ブロックされた時だけ scrape.do に切り替える

    # Annict も足す（任意。作品とレビューの言葉が増える。公式 API なので速い）
    python3 build_anime_db.py --annict                       # 作品 → レビューの順に取る
    python3 build_anime_db.py --annict --filmarks

    # 試しに少しだけ（本番の前に必ず）
    python3 build_anime_db.py --probe https://filmarks.com/animes/<id>/<id>
    python3 build_anime_db.py --filmarks --limit 30

    # 毎期の追加（取ったことのある作品は飛ばす。今年の作品は★を取り直す）
    python3 build_anime_db.py --filmarks --refresh-since 2026

流れ
  1. 手元の名作一覧（data/default_titles.tsv）を読む。軸はタグから計算
  2. --annict   Annict GraphQL API から、シーズンごとに全作品を取る
                （タイトル・放送年・媒体・画像・見ている人の数）
  3. --filmarks Filmarks のアニメを全部取る。まず robots.txt の Sitemap から
                作品ページを集め、無ければ一覧ページを辿る。
                1 ページごとに ★スコア・レビュー数・あらすじ・レビュー本文の言葉・配信
  4. タイトル（と年）で突き合わせて 1 作品 1 行にまとめる
  5. 手元の一覧にない作品は、あらすじとレビューの言葉から 6 軸を見積もる

守っていること
  - Filmarks は robots.txt を先に読み、許されていない道には行かない。
    読めなければ取りに行かない。間隔は既定 1.5 秒（これより短くはできない）
  - まず直接取りに行く。403 / 429 / 503 が続いた時だけ scrape.do に切り替える
    （scrape.do は「こちらの回線から届かない」時の運び役。行儀を崩すためのものではない）
  - scrape.do を通しても、間隔と robots.txt はそのまま守る
  - 取ったページは .cache/ に残す。止めても、次は続きから
  - 切り替えた後も 403 / 429 / 503 が続いたら、そこで止める

Filmarks の利用規約で自動取得や再配布が禁じられていないか、回す前に確かめること。
取ったあらすじや画像には権利がある。画面に何を出すかは README の「データの出し方」を参照。
"""
from __future__ import annotations

import argparse
import datetime as dt
import gzip
import hashlib
import json
import math
import os
import re
import sys
import time
import unicodedata
import urllib.robotparser
import warnings
from pathlib import Path
from urllib.parse import quote, urljoin, urlparse

# Mac の標準 Python（LibreSSL）で出る urllib3 の注意書き。動きには関係ないので黙らせる
warnings.filterwarnings('ignore', message='urllib3 v2 only supports OpenSSL')

HERE = Path(__file__).resolve().parent
DEFAULT_TSV = HERE / 'data' / 'default_titles.tsv'
# 取ったものの置き場。1 行 1 作品。git に入れる（何時間もかけて取ったものなので）
FILMARKS_STORE = HERE / 'data' / 'filmarks_works.jsonl'
ANNICT_STORE = HERE / 'data' / 'annict_works.jsonl'
# Annict のレビューから数えた言葉。1 行 1 作品（annict_id と counts）。本文そのものは残さない
ANNICT_REVIEWS_STORE = HERE / 'data' / 'annict_reviews.jsonl'
CACHE = HERE / '.cache'

# ---------------------------------------------------------------- 軸

# 6 軸。+ が左の文字、- が右の文字
AXES = ['world', 'mood', 'structure', 'taste', 'visual', 'watch']
AXIS_LETTERS = {
    'world': ('R', 'F'), 'mood': ('D', 'H'), 'structure': ('C', 'S'),
    'taste': ('P', 'A'), 'visual': ('V', 'ST'), 'watch': ('M', 'L'),
}

# タグ 1 つが 6 軸をどちらへ押すか（world, mood, structure, taste, visual, watch）
TAGS = {
    '現代':       (1.0, 0, 0, 0, 0, 0),
    '日常':       (1.0, -.6, -.4, 0, 0, -.6),
    '学園':       (.8, 0, 0, 0, 0, 0),
    '青春':       (.8, -.3, 0, .3, 0, 0),
    '恋愛':       (.7, 0, 0, .6, 0, 0),
    'ラブコメ':   (.7, -.7, -.5, .2, 0, -.6),
    'スポーツ':   (.8, -.6, -.4, -.6, 0, -.2),
    '音楽':       (.6, -.3, 0, 0, .6, 0),
    'アイドル':   (.6, -.6, -.4, -.3, .5, -.5),
    'お仕事':     (1.0, -.3, 0, .4, -.2, 0),
    '家族':       (.6, -.5, -.2, .4, 0, -.2),
    'グルメ':     (.3, -.8, -.5, 0, .2, -.6),
    '歴史':       (.3, .3, .3, .3, 0, .4),
    '異世界':     (-1.0, 0, 0, 0, 0, -.2),
    'ファンタジー': (-.9, 0, 0, 0, .2, 0),
    'SF':         (-.8, 0, .4, 0, .2, .3),
    'ロボット':   (-.8, .2, 0, -.5, .3, 0),
    '冒険':       (-.6, -.3, 0, -.4, .3, 0),
    'バトル':     (-.4, .2, -.3, -.9, .3, -.2),
    'ダーク':     (0, 1.0, .2, .2, 0, .4),
    '胸糞':       (0, 1.0, 0, .3, 0, .4),
    'ホラー':     (.2, 1.0, .4, .3, .3, .3),
    'サスペンス': (.2, .7, .6, .5, 0, .4),
    'ミステリー': (.3, .4, .8, .6, -.2, .6),
    '泣ける':     (0, .3, 0, .6, .2, .3),
    '癒し':       (0, -1.0, -.3, .2, .3, -.3),
    'ギャグ':     (0, -.8, -.8, -.8, -.3, -.9),
    '爽快':       (0, -.9, -.5, -.4, 0, -.5),
    '熱い':       (0, -.4, -.3, -.9, .3, -.2),
    '考察':       (0, .3, 1.0, .5, 0, 1.0),
    '伏線':       (0, .2, 1.0, .3, -.4, .6),
    '脚本':       (0, 0, .6, .4, -1.0, .3),
    '心理戦':     (0, .3, .6, 1.0, -.3, .5),
    '群像劇':     (0, 0, .4, .3, 0, .3),
    '大人':       (0, .2, .3, .8, .2, .5),
    '作画神':     (0, 0, -.2, -.4, 1.0, .3),
    '映像美':     (0, 0, 0, .3, 1.0, .5),
    'ショート':   (0, -.5, -.8, -.5, -.5, -1.0),
    'グロ':       (0, 1.0, 0, -.2, .2, .2),
    'お色気':     (0, -.3, -.5, -.4, .2, -.6),
    '萌え':       (.3, -.6, -.4, 0, .3, -.4),
    '3DCG':       (0, 0, 0, -.3, .4, 0),
    '長編':       (0, 0, .2, -.2, 0, -.2),
    '子ども向け': (0, -.8, -.7, -.5, 0, -.8),
}

# 好みの要素（タイプコードには入れない）。作品ごとに 0〜1 の強さを持たせ、
# 画面の側で「好き / 苦手」に合わせて上げ下げする。タグ → 要素の強さ
FEATURES = {
    'love':     {'恋愛': 1.0, 'ラブコメ': 1.0},
    'gore':     {'グロ': 1.0, 'ホラー': .8, '胸糞': .5, 'ダーク': .4},
    'ecchi':    {'お色気': 1.0},
    'long':     {'長編': 1.0},
    'movie':    {},                     # 媒体（MOVIE）から
    'moe':      {'萌え': 1.0},
    'cg':       {'3DCG': 1.0},
    'sports':   {'スポーツ': 1.0},
    'mecha':    {'ロボット': 1.0},
    'music':    {'音楽': 1.0, 'アイドル': 1.0},
    'gag':      {'ギャグ': 1.0, 'ラブコメ': .4},
    'ensemble': {'群像劇': 1.0},
    'kids':     {'子ども向け': 1.0},
    'cry':      {'泣ける': 1.0},
    'healing':  {'癒し': 1.0, '日常': .6, 'グルメ': .4},
    'isekai':   {'異世界': 1.0},
    'short':    {'ショート': 1.0},
    'school':     {'学園': 1.0},
    'fantasy':    {'ファンタジー': 1.0},
    'scifi':      {'SF': 1.0},
    'historical': {'歴史': 1.0},
    'modern':     {'現代': 1.0},
    'horror':     {'ホラー': 1.0},
    'mystery':    {'ミステリー': 1.0, 'サスペンス': .8},
    'adventure':  {'冒険': 1.0},
    'hotblood':   {'熱い': 1.0, '爽快': .7},
    'family':     {'家族': 1.0},
    'work':       {'お仕事': 1.0},
    'mature':     {'大人': 1.0},
}

# 文章（あらすじ・レビュー）に出る言葉 → タグ。
# 手元の一覧に無い作品は、これで数えたタグから軸を出す
TAG_WORDS = {
    '現代': ['東京', '現代', '大阪', '渋谷', '新宿', '会社員', 'サラリーマン', '都内'],
    '日常': ['日常', 'ほのぼの', 'まったり', 'のんびり'],
    '学園': ['高校', '学園', '中学', '学校', '生徒会', '転校', '入学'],
    '青春': ['青春', '部活', '放課後'],
    '恋愛': ['恋愛', '恋心', '片思い', '告白', '初恋'],
    'ラブコメ': ['ラブコメ'],
    'スポーツ': ['部活', '全国大会', 'バスケ', 'サッカー', '野球', 'バレー', 'テニス', 'スポーツ', '甲子園'],
    '音楽': ['バンド', '音楽', 'ライブ', '吹奏楽', 'ピアノ', 'ギター'],
    'アイドル': ['アイドル'],
    'お仕事': ['仕事', '職場', '会社', '社会人'],
    '家族': ['家族', '父親', '母親', '兄弟', '姉妹', '親子'],
    'グルメ': ['料理', 'ごはん', 'グルメ', '食堂', 'レシピ'],
    '歴史': ['戦国', '江戸', '幕末', '平安', '明治', '大正', '昭和', '中世', '戦時中'],
    '異世界': ['異世界', '転生', '召喚'],
    'ファンタジー': ['魔法', '魔王', '勇者', '王国', 'ドラゴン', '竜', 'エルフ', '妖怪', '魔女', '精霊'],
    'SF': ['宇宙', '未来', 'AI', '人工知能', 'アンドロイド', 'タイムリープ', 'タイムマシン', '近未来'],
    'ロボット': ['ロボット', 'モビルスーツ', 'メカ', '機体', 'パイロット'],
    '冒険': ['冒険', '旅', '探検'],
    'バトル': ['バトル', '戦闘', '戦い', '能力者', '必殺'],
    'ダーク': ['復讐', '殺', '絶望', '残酷', '地獄', '闇'],
    '胸糞': ['胸糞', '胸くそ', '鬱', '後味が悪', '救いがな', '救いのな'],
    'ホラー': ['ホラー', '怪異', '呪い', '怪死', '恐怖'],
    'サスペンス': ['サスペンス', '事件', '陰謀', '犯人'],
    'ミステリー': ['ミステリー', '推理', '謎', '真相', '探偵'],
    '泣ける': ['泣け', '泣いた', '号泣', '涙', '感動'],
    '癒し': ['癒し', '癒され', 'ほっこり', 'ゆるい'],
    'ギャグ': ['ギャグ', '爆笑', '笑った', 'コメディ', '腹筋'],
    '爽快': ['爽快', 'スカッと', 'スッキリ', 'カタルシス', '無双'],
    '熱い': ['熱い', 'アツい', '胸熱', '燃え'],
    '考察': ['考察', '深読み', '解釈', '難解', '哲学'],
    '伏線': ['伏線', '回収'],
    '脚本': ['脚本', 'シナリオ', '構成が', 'ストーリーが'],
    '心理戦': ['心理戦', '頭脳戦', '駆け引き', '騙し合い', '読み合い'],
    '群像劇': ['群像'],
    '大人': ['大人向け', '渋い', '哀愁'],
    '作画神': ['作画', '神作画', 'ぬるぬる'],
    '映像美': ['映像美', '背景が美', '色彩', '演出が'],
    'グロ': ['グロ', '残酷描写', '流血', 'スプラッタ', '猟奇'],
    'お色気': ['お色気', 'エロ', 'サービスシーン', 'ハーレム', '下ネタ', 'パンチラ'],
    '萌え': ['萌え', '美少女', '可愛い', 'かわいい', 'きらら'],
    '3DCG': ['3DCG', 'フルCG', 'CGアニメ', '3Dアニメ'],
    '子ども向け': ['子供向け', '子ども向け', 'ファミリー向け', 'キッズ', '親子で'],
}

# ---------------------------------------------------------------- 手元の一覧


def vec_from_tags(tags, weights=None):
    acc = [0.0] * len(AXES)
    total = 0.0
    for t in tags:
        v = TAGS.get(t)
        if not v:
            continue
        w = (weights or {}).get(t, 1.0)
        total += w
        for i, x in enumerate(v):
            acc[i] += x * w
    if not total:
        return [0.0] * len(AXES)
    # 平均すると薄まるので、少し持ち上げて -1〜+1 に収める
    return [round(max(-1.0, min(1.0, x / total * 1.6)), 2) for x in acc]


def load_defaults(path=DEFAULT_TSV):
    out = []
    for line in path.read_text(encoding='utf-8').splitlines():
        if not line.strip() or line.startswith('#'):
            continue
        title, year, media, tags = (line.split('\t') + ['', '', ''])[:4]
        tags = [t for t in tags.split(',') if t]
        unknown = [t for t in tags if t not in TAGS]
        if unknown:
            raise ValueError(f'{title}: 知らないタグ {unknown}')
        out.append({
            'title': title, 'year': int(year) if year.isdigit() else None, 'media': media or 'TV',
            'tags': tags, 'score': None, 'reviews': None, 'watchers': None, 'image': None,
            'synopsis': '', 'vod': [], 'filmarks_url': None, 'annict_id': None,
            'series': None, 'sources': ['default'],
        })
    return out


# ---------------------------------------------------------------- 取り手


class Fetcher:
    """robots.txt を守り、あいだを空け、取ったものを .cache に残す取り手。
    SCRAPEDO_TOKEN があれば scrape.do を通す。"""

    MIN_SLEEP = 1.5
    UA = ('shindananime-db/2.0 (+https://koshinstudio.com/works/shindananime/; '
          'polite crawler; 1 req / 1.5s)')

    def __init__(self, sleep=1.5, scrapedo_token=None, cache=CACHE, session=None):
        if session is None:
            import requests
            session = requests.Session()
        self.s = session
        self.s.headers.update({'User-Agent': self.UA, 'Accept-Language': 'ja,en;q=0.5'})
        self.sleep = max(float(sleep), self.MIN_SLEEP)
        self.scrapedo_token = scrapedo_token  # ブロックされた時だけ使う（既定は直接）
        self.token = None
        self.cache = Path(cache)
        self.last = 0.0
        self.robots = {}
        self.fails = 0

    def _key(self, url):
        return self.cache / 'pages' / (hashlib.sha1(url.encode()).hexdigest() + '.html')

    def _wire(self, url):
        if not self.token:
            return url
        return 'https://api.scrape.do/?token=' + quote(self.token) + '&url=' + quote(url, safe='')

    def allowed(self, url):
        host = urlparse(url).scheme + '://' + urlparse(url).netloc
        if host not in self.robots:
            rp = urllib.robotparser.RobotFileParser()
            try:
                text, status = self._get(host + '/robots.txt', read=False, write=False)
            except Exception as e:  # noqa: BLE001 — 何であれ「読めない」
                log(f'{host}/robots.txt が読めない（{e.__class__.__name__}）。そこへは行かない')
                self.robots[host] = None
                return False
            if status >= 400 and status != 404:
                log(f'{host}/robots.txt が {status}。そこへは行かない')
                self.robots[host] = None
                return False
            rp.parse(text.splitlines() if status == 200 else [])
            self.robots[host] = rp
        rp = self.robots[host]
        return bool(rp) and rp.can_fetch(self.UA, url)

    def sitemaps(self, host):
        rp = self.robots.get(host)
        return list(rp.site_maps() or []) if rp else []

    def _get(self, url, read=True, write=True):
        key = self._key(url)
        if read and key.exists():
            return key.read_text(encoding='utf-8', errors='replace'), 200
        wait = self.last + self.sleep - time.monotonic()
        if wait > 0:
            time.sleep(wait)
        try:
            r = self.s.get(self._wire(url), timeout=60)
        finally:
            self.last = time.monotonic()
        if r.status_code in (403, 429, 503):
            self.fails += 1
            if self.fails >= 3:
                if self.scrapedo_token and not self.token:
                    log(f'{r.status_code} が続いた。ここから scrape.do に切り替える')
                    self.token = self.scrapedo_token
                    self.fails = 0
                    return self._get(url, read, write)
                raise RuntimeError(f'{r.status_code} が続いた。ここで止める')
            time.sleep(30 * self.fails)
            return self._get(url, read, write)
        self.fails = 0
        body = r.content
        if url.endswith('.gz') or body[:2] == b'\x1f\x8b':
            body = gzip.decompress(body)
        text = body.decode(r.encoding or 'utf-8', errors='replace') if isinstance(body, bytes) else body
        if r.status_code == 200 and write:
            key.parent.mkdir(parents=True, exist_ok=True)
            key.write_text(text, encoding='utf-8')
        return text, r.status_code

    def get(self, url, fresh=False):
        """fresh=True なら .cache を見ずに取り直す（取ったものは .cache に書き直す）"""
        if not self.allowed(url):
            raise PermissionError('robots.txt で止められている: ' + url)
        return self._get(url, read=not fresh)


# ---------------------------------------------------------------- Annict


BAD_IMAGE_HINTS = (
    'placehold',          # Filmarks 自身の「画像が無い時の仮の絵」（例: ぷれぷれぷれあです）
    'default-og-image',   # 公式サイト共通の汎用絵（実在しない絵の時がある。例: ゲボイデ＝ボイデ）
    'default_og_image',
    'no-image', 'noimage',
)


def https_only(url):
    """http:// の画像は、こちら（https）のページからだと混在コンテンツで
    ブロックされて出ない（例: アルプスの少女ハイジの公式サイト）。https だけ通す。
    実物の絵ではない汎用の仮画像（BAD_IMAGE_HINTS）も弾く"""
    if not url or not url.startswith('https://'):
        return None
    if any(h in url for h in BAD_IMAGE_HINTS):
        return None
    return url


ANNICT_GQL = 'https://api.annict.com/graphql'
ANNICT_QUERY = '''
query($seasons: [String!], $after: String) {
  searchWorks(seasons: $seasons, orderBy: {field: WATCHERS_COUNT, direction: DESC}, first: 50, after: $after) {
    pageInfo { hasNextPage endCursor }
    nodes {
      annictId title seasonYear media watchersCount reviewsCount episodesCount
      image { recommendedImageUrl }
    }
  }
}'''


def annict_seasons(since, until):
    for y in range(until, since - 1, -1):
        for s in ('winter', 'spring', 'summer', 'autumn'):
            yield f'{y}-{s}'


def fetch_annict(token, since=1960, until=None, session=None, limit=None, sleep=1.0):
    """Annict の全作品。シーズンごとに頁を送って取る。API の中身は API の規約に従って使う。"""
    if session is None:
        import requests
        session = requests.Session()
    until = until or dt.date.today().year + 1
    head = {'Authorization': f'Bearer {token}', 'Content-Type': 'application/json'}
    out = []
    for season in annict_seasons(since, until):
        after = None
        while True:
            time.sleep(sleep)
            r = session.post(ANNICT_GQL, headers=head, timeout=60,
                             json={'query': ANNICT_QUERY, 'variables': {'seasons': [season], 'after': after}})
            if r.status_code == 401:
                raise RuntimeError('ANNICT_TOKEN が通らない（401）')
            r.raise_for_status()
            data = r.json()
            if data.get('errors'):
                raise RuntimeError('Annict: ' + json.dumps(data['errors'], ensure_ascii=False)[:300])
            page = data['data']['searchWorks']
            for n in page['nodes']:
                if (n.get('media') or '').upper() == 'OTHER':
                    continue
                out.append({
                    'title': n['title'], 'year': n.get('seasonYear'),
                    'media': (n.get('media') or 'TV').upper(),
                    'watchers': n.get('watchersCount'), 'annict_reviews': n.get('reviewsCount'),
                    'episodes': n.get('episodesCount'),
                    'image': https_only((n.get('image') or {}).get('recommendedImageUrl')),
                    'annict_id': n.get('annictId'), 'sources': ['annict'],
                })
            if not page['pageInfo']['hasNextPage']:
                break
            after = page['pageInfo']['endCursor']
        log(f'Annict {season}: 通算 {len(out)} 作')
        if limit and len(out) >= limit:
            break
    return out


ANNICT_REVIEWS_QUERY = '''
query($ids: [Int!]) {
  searchWorks(annictIds: $ids, first: %d) {
    nodes { annictId reviews(first: %d) { nodes { body } } staffs(first: 40) { nodes { name roleText } } }
  }
}'''


def fetch_annict_reviews(token, works, store=ANNICT_REVIEWS_STORE, session=None, per_work=30,
                         batch=10, min_watchers=30, sleep=1.0, limit=None):
    """Annict の作品ごとのレビューを取り、言葉の数（counts）だけを store に 1 行ずつ足す。
    本文は残さない。取ったことのある作品は飛ばすので、止めても続きから。
    見ている人が min_watchers 人未満の作品は、レビューがほぼ無いので飛ばす"""
    if session is None:
        import requests
        session = requests.Session()
    done = {r['annict_id'] for r in load_store(store).values()}
    todo = [w for w in works if w.get('annict_id') and w['annict_id'] not in done
            and (w.get('watchers') or 0) >= min_watchers]
    todo.sort(key=lambda w: -(w.get('watchers') or 0))   # 人気のある作品から
    if limit:
        todo = todo[:limit]
    log(f'Annict のレビュー: {len(todo)} 作を回る（{batch} 作ずつ、{len(todo) / batch * sleep / 60:.0f} 分ほど。'
        f'取ってある {len(done)} 作は飛ばす）')
    head = {'Authorization': f'Bearer {token}', 'Content-Type': 'application/json'}
    query = ANNICT_REVIEWS_QUERY % (batch, per_work)
    Path(store).parent.mkdir(parents=True, exist_ok=True)
    got = 0
    with open(store, 'a', encoding='utf-8') as sink:
        for i in range(0, len(todo), batch):
            ids = [w['annict_id'] for w in todo[i:i + batch]]
            time.sleep(sleep)
            r = session.post(ANNICT_GQL, headers=head, timeout=60, json={'query': query, 'variables': {'ids': ids}})
            if r.status_code == 429:
                log('Annict: 429。少し待つ')
                time.sleep(60)
                r = session.post(ANNICT_GQL, headers=head, timeout=60, json={'query': query, 'variables': {'ids': ids}})
            r.raise_for_status()
            data = r.json()
            if data.get('errors'):
                raise RuntimeError('Annict: ' + json.dumps(data['errors'], ensure_ascii=False)[:300])
            seen = set()
            for n in data['data']['searchWorks']['nodes']:
                bodies = [x.get('body') or '' for x in ((n.get('reviews') or {}).get('nodes') or [])]
                text = ' '.join(b for b in bodies if b.strip())
                studios = [x.get('name') for x in ((n.get('staffs') or {}).get('nodes') or [])
                           if x.get('name') and 'アニメーション制作' in (x.get('roleText') or '')]
                sink.write(json.dumps({'annict_id': n['annictId'], 'counts': text_tags(text), 'studios': studios,
                                       'n': sum(1 for b in bodies if b.strip()),
                                       'fetched_at': dt.date.today().isoformat()}, ensure_ascii=False) + '\n')
                seen.add(n['annictId'])
                got += 1
            for a in ids:   # 返ってこなかった作品も「見た」印を残す（毎回聞き直さない）
                if a not in seen:
                    sink.write(json.dumps({'annict_id': a, 'counts': {}, 'n': 0,
                                           'fetched_at': dt.date.today().isoformat()}) + '\n')
            sink.flush()
            if (i // batch) % 20 == 0:
                log(f'  {min(i + batch, len(todo))}/{len(todo)}')
    return got


def attach_annict_reviews(annict, store=ANNICT_REVIEWS_STORE):
    """Annict の作品に、レビューで数えた言葉をくっつける"""
    rev = {r['annict_id']: r for r in load_store(store).values()}
    for a in annict:
        r = rev.get(a.get('annict_id'))
        if r and r.get('counts'):
            a['counts'] = r['counts']
        if r and r.get('studios'):
            a['studios'] = r['studios']
    return annict


# ---------------------------------------------------------------- Filmarks

FM = 'https://filmarks.com'
FM_DETAIL = re.compile(r'^https?://filmarks\.com/animes/(\d+)/(\d+)/?$')
# Sitemap が無い時に辿る一覧。変わっていたらここを直す
FM_LIST_PATHS = ['/list-anime/popular', '/list-anime/trend']
FM_LIST_PAGES = 400
SEL = {
    # 2026 年 9 月の Filmarks に合わせてある（--probe-debug で確かめた）。
    # 作品の★は c2-rating-l。c-rating__score はレビューを書いた人の★なので使わない
    'title': ['h2.p-content-detail__title span', 'h2.p-content-detail__title', 'h1'],
    'score': ['.p-content-detail__main .c2-rating-l__text', '.c2-rating-l__text',
              '.p-mark-histogram__top .c2-rating-s__text'],
    'reviews': ['.p-mark-histogram__total-count'],
    'synopsis': ['.p-content-detail__synopsis-desc', '#js-content-detail-synopsis'],
    'info': ['.p-content-detail__primary-info'],
    'review': ['.p-mark-review'],
    'vod': ['.p-content-detail-related-info__box-vod-services', '.p-content-detail-related-info'],
    'year': ['.p-content-detail__primary-info', 'h2.p-content-detail__title'],
}
VOD_NAMES = {
    'unext': ['U-NEXT', 'U‐NEXT', 'UNEXT'], 'dmmtv': ['DMM TV', 'DMMTV'],
    'danime': ['dアニメストア'], 'prime': ['Prime Video', 'プライム・ビデオ'],
    'netflix': ['Netflix'], 'abema': ['ABEMA'], 'hulu': ['Hulu'], 'disney': ['Disney+'],
    'telasa': ['TELASA', 'テラサ'], 'fod': ['FOD'], 'lemino': ['Lemino', 'レミノ'],
    'bandaichannel': ['バンダイチャンネル'],
}


def filmarks_urls(f: Fetcher, limit=None, skip=frozenset()):
    """Filmarks のアニメ作品ページを全部集める。Sitemap が先、一覧が後。
    skip にある URL（もう取ったもの）は数えない"""
    urls = []
    seen = set(skip)

    def add(u):
        u = u.split('?')[0].rstrip('/')
        if FM_DETAIL.match(u) and u not in seen:
            seen.add(u)
            urls.append(u)

    if not f.allowed(FM + '/'):
        return urls
    todo = f.sitemaps(FM) or [FM + '/sitemap.xml']
    done = set()
    while todo and not (limit and len(urls) >= limit):
        sm = todo.pop(0)
        if sm in done:
            continue
        done.add(sm)
        try:
            text, status = f.get(sm)
        except Exception as e:  # noqa: BLE001
            log('sitemap で止まった:', sm, e)
            continue
        if status != 200:
            continue
        locs = re.findall(r'<loc>\s*([^<\s]+)\s*</loc>', text)
        if '<sitemapindex' in text:
            # 名前に anime が付いた sitemap があれば、それだけを回す（映画やドラマは要らない）
            animeish = [u for u in locs if 'anime' in u.lower()]
            todo += animeish or locs
        else:
            for u in locs:
                add(u)
        log(f'sitemap {sm}: 通算 {len(urls)} 作品ページ')

    if not urls:
        from bs4 import BeautifulSoup
        for path in FM_LIST_PATHS:
            for page in range(1, FM_LIST_PAGES + 1):
                url = f'{FM}{path}?page={page}'
                try:
                    text, status = f.get(url)
                except Exception as e:  # noqa: BLE001
                    log('一覧で止まった:', url, e)
                    break
                if status != 200:
                    break
                before = len(urls)
                for a in BeautifulSoup(text, 'html.parser').find_all('a', href=True):
                    add(urljoin(FM, a['href']))
                log(f'一覧 {url}: 通算 {len(urls)}')
                if len(urls) == before or (limit and len(urls) >= limit):
                    break
    return urls[:limit] if limit else urls


def _first(soup, sels):
    for s in sels:
        el = soup.select_one(s)
        if el and el.get_text(strip=True):
            return el
    return None


def _meta(soup, prop):
    el = soup.find('meta', attrs={'property': prop}) or soup.find('meta', attrs={'name': prop})
    return (el.get('content') or '').strip() if el else ''


def _num(raw, cast=float):
    try:
        return cast(str(raw).replace(',', '').strip())
    except (TypeError, ValueError):
        return None


def parse_filmarks(html, url):
    from bs4 import BeautifulSoup
    soup = BeautifulSoup(html, 'html.parser')
    # JSON-LD。Filmarks は name を title、description を outline、datePublished を releaseDate と呼んでいる
    ld = {}
    for s in soup.find_all('script', type='application/ld+json'):
        try:
            d = json.loads(s.string or '')
        except (TypeError, ValueError):
            continue
        for x in (d if isinstance(d, list) else [d]):
            if isinstance(x, dict) and x.get('@type') != 'BreadcrumbList' and (x.get('title') or x.get('name')) and not ld:
                ld = x
    og_title = _meta(soup, 'og:title')
    og_desc = _meta(soup, 'og:description')
    t_el = _first(soup, SEL['title'])
    title = (ld.get('title') or ld.get('name')
             or (re.sub(r'\s*（.*?製作のアニメ）\s*$', '', t_el.get_text(' ', strip=True)) if t_el else '')
             or (re.search(r'『(.+?)』', og_title) or [None, ''])[1])
    if not title:
        return None

    # ★と レビュー数。og:description「レビュー数：43037件 ／ 平均スコア：★★★★4.3点」が一番確か
    score = _num((re.search(r'平均スコア：[★☆]*\s*([\d.]+)点', og_desc) or [None, None])[1])
    if score is None:
        agg = ld.get('aggregateRating') or {}
        s_el = _first(soup, SEL['score'])
        score = _num(agg.get('ratingValue')) or _num(s_el.get_text(strip=True) if s_el else None)
    if score is not None and not (0 < score <= 5):
        score = None
    reviews = _num((re.search(r'レビュー数：([\d,]+)件', og_desc) or [None, None])[1], int)
    if reviews is None:
        r_el = _first(soup, SEL['reviews'])
        reviews = _num((re.search(r'([\d,]+)件', r_el.get_text()) or [None, None])[1] if r_el else None, int)

    # あらすじ。見出しの「あらすじ」だけを拾わないように、短すぎるものは捨てる
    syn_el = _first(soup, SEL['synopsis'])
    synopsis = ld.get('outline') or ld.get('description') or (syn_el.get_text(' ', strip=True) if syn_el else '')
    if len(synopsis) < 15:
        synopsis = ''

    # 公開日・制作会社・再生時間（「公開日：2023年09月29日 製作国・地域： 日本 制作会社： マッドハウス 再生時間：24分」）
    i_el = _first(soup, SEL['info'])
    info = i_el.get_text(' ', strip=True) if i_el else ''
    studios = []
    m = re.search(r'制作会社：\s*(.+?)\s*(?:再生時間：|製作国|公開日：|$)', info)
    if m:
        studios = [x.strip() for x in re.split(r'[、,／/]', m.group(1)) if x.strip()]
    minutes = _num((re.search(r'再生時間：\s*(\d+)\s*分', info) or [None, None])[1], int)

    year = None
    for raw in (ld.get('releaseDate'), ld.get('startDate'), ld.get('datePublished'), ld.get('dateCreated'),
                (ld.get('animeSeries') or {}).get('startDate') if isinstance(ld.get('animeSeries'), dict) else None,
                info, (_first(soup, SEL['year']) or soup.new_tag('x')).get_text(' ', strip=True)):
        m = re.search(r'(19[5-9]\d|20\d{2})', raw or '')
        if m:
            year = int(m.group(1))
            break

    kind = str(ld.get('@type') or '')
    media = 'MOVIE' if 'Movie' in kind else 'TV' if kind else None

    texts = [el.get_text(' ', strip=True) for s in SEL['review'] for el in soup.select(s)]
    vod_el = _first(soup, SEL['vod'])
    vod_text = ((vod_el.get_text(' ', strip=True) + ' ' + ' '.join(img.get('alt', '') for img in vod_el.find_all('img')))
                if vod_el else '')
    mm = FM_DETAIL.match(url.rstrip('/'))
    return {
        'title': title, 'year': year, 'media': media, 'score': score, 'reviews': reviews,
        'synopsis': synopsis, 'studios': studios, 'minutes': minutes,
        # レビュー本文そのものは持たない（重い・他人の文章）。言葉の数だけ残す
        'counts': text_tags(' '.join([title, synopsis] + texts)),
        'fetched_at': dt.date.today().isoformat(),
        'vod': [k for k, names in VOD_NAMES.items() if any(n in vod_text for n in names)],
        'image': https_only(_meta(soup, 'og:image')), 'filmarks_url': url,
        'series': int(mm.group(1)) if mm else None, 'sources': ['filmarks'],
    }


def load_store(path):
    """取ったものを読む。同じ URL が何度も出てきたら、あとの行が勝つ。
    splitlines() だと、あらすじの中の U+2028 のような特殊な改行文字でも
    割れて JSON が壊れるので、本当の改行（\\n）だけで割る"""
    out = {}
    path = Path(path)
    if path.exists():
        for line in path.read_text(encoding='utf-8').split('\n'):
            if line.strip():
                r = json.loads(line)
                out[r.get('filmarks_url') or r.get('annict_id') or r['title']] = r
    return out


def fetch_filmarks(f: Fetcher, limit=None, store=FILMARKS_STORE, skip=frozenset(), extra=()):
    """まだ取っていない作品ページを取る。1 作取るごとに store に 1 行足すので、
    途中で止めても取った分は残る。extra は取り直したい URL（スコアの更新など）"""
    try:
        import bs4  # noqa: F401
    except ImportError:
        log('beautifulsoup4 が無い。pip install -r requirements.txt')
        return []
    urls = filmarks_urls(f, limit, skip) + [u for u in extra]
    log(f'Filmarks: 新しく {len(urls) - len(extra)} + 取り直し {len(extra)} ページを回る'
        f'（間隔 {f.sleep} 秒 ≒ {len(urls) * f.sleep / 3600:.1f} 時間。取ったものは {store} に足していく）')
    Path(store).parent.mkdir(parents=True, exist_ok=True)
    sink = open(store, 'a', encoding='utf-8')
    try:
        return _fetch_each(f, urls, set(extra), sink)
    finally:
        sink.close()


def _fetch_each(f, urls, fresh, sink):
    out = []
    for i, url in enumerate(urls, 1):
        try:
            text, status = f.get(url, fresh=url in fresh)
        except PermissionError as e:
            log(e)
            continue
        except RuntimeError as e:
            log(e)
            break
        except Exception as e:  # noqa: BLE001
            log('詳細で止まった:', url, e)
            continue
        if status != 200:
            continue
        item = parse_filmarks(text, url)
        if item:
            out.append(item)
            sink.write(json.dumps(item, ensure_ascii=False) + '\n')
            sink.flush()
        if i % 100 == 0:
            log(f'  {i}/{len(urls)}  取れた {len(out)}')
    return out


# ---------------------------------------------------------------- まとめる


def norm(title):
    # ＜物語＞（Annict、全角の <>）と 〈物語〉（Filmarks、日本語の山括弧）は
    # 見た目は似ているが別の文字。NFKC は ＜＞ を <> にはするが 〈〉 はそのまま
    # なので、両方まとめて外さないと同じ作品なのにマッチしない
    t = unicodedata.normalize('NFKC', title or '').lower()
    return re.sub(r'[\s・:：!！?？「」『』【】()（）\[\]<>〈〉《》☆★♪〜~\-‐―_.,、。/／\'"]', '', t)


def merge(defaults, annict, filmarks):
    """1 作品 1 行にまとめる。タイトルが同じで年が 1 年以内なら同じ作品とみなす"""
    rows = []
    index = {}

    def find(item):
        for r in index.get(norm(item['title']), []):
            if not item.get('year') or not r.get('year') or abs(item['year'] - r['year']) <= 1:
                return r
        return None

    def put(item):
        r = find(item)
        if r is None:
            r = {'tags': [], 'synopsis': '', 'vod': [], 'sources': []}
            rows.append(r)
            index.setdefault(norm(item['title']), []).append(r)
        for k, v in item.items():
            if k == 'sources':
                r['sources'] = list(dict.fromkeys(r['sources'] + v))
            elif k == 'tags':
                r['tags'] = list(dict.fromkeys(r['tags'] + v))
            elif k == 'counts':   # Filmarks と Annict のレビューで数えた言葉は足し合わせる
                c = dict(r.get('counts') or {})
                for t, n in (v or {}).items():
                    c[t] = c.get(t, 0) + n
                r['counts'] = c
            elif k == 'image':
                # https だけ通す（http は混在コンテンツでブロックされて出ない）。
                # 上書きはしない。Annict（先）が https で埋まっていれば Filmarks（後）より優先される
                if https_only(v) and not r.get('image'):
                    r['image'] = v
            elif v not in (None, '', []) and r.get(k) in (None, '', []):
                r[k] = v
            elif k in ('score', 'reviews', 'watchers', 'filmarks_url', 'vod') and v not in (None, '', []):
                r[k] = v   # 取ってきた数字は、手元の空欄より新しい
        return r

    for x in defaults:
        put(x)
    for x in annict:
        put(x)
    for x in filmarks:
        put(x)
    return rows


# けなす言い方・打ち消し。数える前に文章から取り除く（「作画崩壊」を「作画」と数えないため）
NEG_PHRASES = [
    '作画崩壊', '作画が崩れ', '作画の崩れ', '作画の乱れ', '作画が乱れ', '作画が安定しな',
    '作画が残念', '作画は残念', '作画が微妙', '作画は微妙', '作画がいまいち', '作画はいまいち', '作画がイマイチ',
    '作画が悪', '作画は悪', '作画がひど', '作画が酷', '作画が雑', '作画がしょぼ', '作画がショボ', '作画が低',
    '紙芝居', '映像が残念', '映像が微妙', '演出が微妙', '演出が残念', '演出がダサ', '演出が古',
    '泣けなかった', '泣けない', '泣けず', '涙は出なかった', '感動しなかった', '感動できな', '感動はしな',
    '笑えなかった', '笑えない', 'ギャグが寒', '寒いギャグ', 'ギャグがつまらな', 'ギャグが滑',
    '伏線が回収されな', '伏線回収されな', '伏線が放置', '伏線未回収', '回収されず', '回収されな', '回収しな',
    '投げっぱなし', '爽快感がな', '爽快感はな', 'スッキリしな', 'すっきりしな', '熱くな', '燃えな',
    '考察の余地がな', '癒されな', '無双がつまらな',
    'グロくな', 'グロはな', 'グロ描写はな', 'エロくな', 'エロはな', 'お色気はな', 'かわいくな', '可愛くな',
    '子供向けではな', '子ども向けではな', 'CGが気にならな',
]


SERIES_MOVIE_MARK = re.compile(r'^(劇場版|映画|新劇場版|劇場総集編|劇場アニメ|劇場短編)|劇場版|THE MOVIE|the Movie|The Movie')


def franchise_key(title):
    """シリーズの札。先頭の「劇場版」などを外し、最初の区切りまで（英字は 2 語まで）"""
    t = unicodedata.normalize('NFKC', title or '')
    t = re.sub(r'^(劇場版|映画|新劇場版|劇場総集編|劇場アニメ|劇場短編)\s*', '', t)
    m = re.match(r'^[「『](.+?)[」』]', t)
    if m:
        t = m.group(1)
    words = re.split(r'[\s　]+', t.strip())
    t = ''.join(words[:2]) if re.fullmatch(r'[\x20-\x7e]+', words[0] or '') else words[0]
    return re.sub(r'[・:：!！?？「」『』【】()（）\[\]☆★♪〜~\-‐―_.,、。/／\'"]', '', t).lower()[:12]


def drop_series_movies(rows):
    """TV シリーズの続き・番外の劇場版（ドラえもん・コナン・しんちゃんの映画など）を外す。
    オリジナルの単発映画（ジブリ・新海誠・今敏など）は残す。
    見分け方: タイトルに「劇場版」などが付いている、または同じシリーズの TV / OVA / 配信作品がある"""
    series = [franchise_key(r['title']) for r in rows if (r.get('media') or 'TV').upper() != 'MOVIE']
    series = [k for k in series if len(k) >= 3]
    keep, dropped = [], []
    for r in rows:
        if (r.get('media') or 'TV').upper() == 'MOVIE':
            k = franchise_key(r['title'])
            if SERIES_MOVIE_MARK.search(r['title']) or (len(k) >= 3 and any(
                    k.startswith(x) or x.startswith(k) for x in series)):
                dropped.append(r)
                continue
        keep.append(r)
    return keep, dropped


def text_tags(text):
    """文章に出てくる言葉をタグごとに数える。けなす言い方は先に取り除く。
    長い言葉から数えて、数えた所は消す（「神作画」を「作画」と二重に数えない）"""
    for p in NEG_PHRASES:
        text = text.replace(p, ' ')
    counts = {}
    for tag, words in TAG_WORDS.items():
        t, n = text, 0
        for w in sorted(words, key=len, reverse=True):
            c = t.count(w)
            if c:
                n += c
                t = t.replace(w, ' ')
        if n:
            counts[tag] = n
    return counts


def load_studios(path=HERE / 'data' / 'visual_studios.tsv'):
    out = {}
    path = Path(path)
    if path.exists():
        for line in path.read_text(encoding='utf-8').splitlines():
            if line.strip() and not line.startswith('#'):
                name, w = (line.split('\t') + ['1'])[:2]
                out[unicodedata.normalize('NFKC', name).lower().replace(' ', '')] = float(w or 1)
    return out


VISUAL_STUDIOS = load_studios()


def studio_boost(studios):
    """制作スタジオから V（映像美）をどれだけ上げるか（0〜0.35）"""
    best = 0.0
    for s in studios or []:
        n = unicodedata.normalize('NFKC', s).lower().replace(' ', '')
        for name, w in VISUAL_STUDIOS.items():
            if name in n:
                best = max(best, w)
    return 0.35 * best


def features(hand, counts, media, episodes):
    """好みの要素ごとの強さ（0〜1）。手で付けたタグは満点、文章の言葉は 4 回で満点。0 は書かない"""
    out = {}
    total = sum(counts.values()) or 1
    for key, tags in FEATURES.items():
        v = max([w for t, w in tags.items() if t in hand] + [0])
        for t, w in tags.items():
            n = counts.get(t, 0)
            # 言葉は、全体の中で目立つほど強い（「かわいい」が 1 回だけでは萌え系としない）
            if n:
                v = max(v, w * min(1.0, n / 4) * min(1.0, 3 * n / total))
        if key == 'movie' and media == 'MOVIE':
            v = 1.0
        if key == 'long' and episodes:
            v = max(v, 1.0 if episodes >= 50 else .4 if episodes >= 26 else 0)
        if v >= 0.1:
            out[key] = round(v, 2)
    return out


def finish(rows):
    """軸・人気・表示用のタグを決めて、配る形にする"""
    out = []
    for r in rows:
        counts = dict(text_tags(' '.join([r.get('title') or '', r.get('synopsis') or ''])))
        for t, n in (r.get('counts') or {}).items():   # Filmarks で数えたもの（レビュー込み）が勝つ
            counts[t] = max(counts.get(t, 0), n)
        if (r.get('minutes') or 99) <= 10:   # 1 話 10 分以下はショートアニメ（Filmarks の再生時間）
            counts['ショート'] = max(counts.get('ショート', 0), 4)
        hand = [t for t in r.get('tags', []) if t in TAGS]
        if hand:
            # 手で付けたタグを主に、文章の言葉を少しだけ混ぜる
            weights = {t: 1.0 for t in hand}
            total = sum(counts.values()) or 1
            for t, n in counts.items():
                weights[t] = weights.get(t, 0) + 0.6 * n / total
            vec = vec_from_tags(list(weights), weights)
            shown = hand
        else:
            vec = vec_from_tags(list(counts), {t: math.log1p(n) for t, n in counts.items()})
            shown = [t for t, _ in sorted(counts.items(), key=lambda kv: -kv[1])]
        media = (r.get('media') or 'TV').upper()
        boost = studio_boost(r.get('studios'))
        if boost:
            vec[4] = round(min(1.0, vec[4] + boost), 2)
        if media == 'MOVIE':
            vec[4] = round(min(1.0, vec[4] + .25), 2)
            vec[5] = round(min(1.0, vec[5] + .15), 2)
        elif media == 'WEB' and 'ショート' in shown:
            vec[5] = round(max(-1.0, vec[5] - .2), 2)
        # 情報の多さ（0〜1）。言葉が何も拾えない作品は、診断では選ばない
        info = 1.0 if hand else min(1.0, sum(counts.values()) / 12)
        # 人気（0〜1）。Filmarks のレビュー数と Annict の見ている人の数の大きい方
        pop = max(
            math.log10(1 + (r.get('reviews') or 0)) / math.log10(1 + 100000),
            math.log10(1 + (r.get('watchers') or 0)) / math.log10(1 + 30000),
            0.75 if 'default' in r.get('sources', []) else 0.0,
        )
        feats = features(hand, counts, media, r.get('episodes'))
        out.append({
            't': r['title'], 'y': r.get('year'), 'm': media, 'f': feats, 'ep': r.get('episodes'),
            's': r.get('score'), 'n': r.get('reviews'),
            'p': round(min(1.0, pop), 2), 'i': round(info, 2), 'v': vec,
            'g': shown[:5], 'syn': (r.get('synopsis') or '')[:110],
            'img': r.get('image'), 'fm': r.get('filmarks_url'),
            'an': r.get('annict_id'), 'se': r.get('series'),
            'vod': r.get('vod') or [], 'src': ''.join(sorted({'default': 'd', 'annict': 'a', 'filmarks': 'f'}[s]
                                                               for s in r.get('sources', []))),
        })
    # 画像が無い作品は、同じシリーズ（franchise_key）で画像がある作品から借りる。
    # Annict と Filmarks でタイトルの区切り方が違い（「Season 3 Part.1」と「Season3」など）、
    # 同じ作品なのにマージが一致せず画像だけ欠けることがあるため
    by_franchise = {}
    for a in out:
        by_franchise.setdefault(franchise_key(a['t']), []).append(a)
    for group in by_franchise.values():
        borrowed = next((a['img'] for a in group if a.get('img')), None)
        if borrowed:
            for a in group:
                if not a.get('img'):
                    a['img'] = borrowed
    out.sort(key=lambda a: (-a['p'], a['t']))
    for i, a in enumerate(out):
        a['id'] = i
    return out


def log(*a):
    print(*a, file=sys.stderr, flush=True)


def load_dotenv(path=HERE / '.env'):
    """.env（KEY=値 を 1 行ずつ）を読んで環境変数にする。すでに入っている値は上書きしない。
    値の前後の空白と "" '' は外す。# で始まる行は飛ばす"""
    path = Path(path)
    if not path.exists():
        return []
    got = []
    for line in path.read_text(encoding='utf-8-sig').splitlines():
        line = line.strip()
        if not line or line.startswith('#') or '=' not in line:
            continue
        k, v = line.split('=', 1)
        k = k.strip().removeprefix('export ').strip()
        v = v.strip().strip('"').strip("'")
        if k and v and k not in os.environ:
            os.environ[k] = v
            got.append(k)
    return got


def check_env(session=None):
    """トークンが入っているか、Annict のトークンが通るかを見る。値そのものは出さない"""
    ok = True
    for k, need in (('SCRAPEDO_TOKEN', 'Filmarks を scrape.do 経由で取る時'), ('ANNICT_TOKEN', '--annict を使う時だけ')):
        v = os.environ.get(k, '')
        print(f'{k}: ' + (f'入っている（{len(v)} 文字・末尾 …{v[-4:]}）' if v else f'入っていない（要るのは {need}）'))
    if not os.environ.get('SCRAPEDO_TOKEN'):
        print('→ scrape.do を使わないなら、Filmarks に直接取りに行く')
    tok = os.environ.get('ANNICT_TOKEN')
    if tok:
        try:
            if session is None:
                import requests
                session = requests.Session()
            r = session.post(ANNICT_GQL, timeout=30, json={'query': '{ viewer { username } }'},
                             headers={'Authorization': f'Bearer {tok}', 'Content-Type': 'application/json'})
            if r.status_code == 200 and (r.json().get('data') or {}).get('viewer'):
                print(f"Annict: 通った（{r.json()['data']['viewer']['username']} さんのトークン）")
            else:
                print(f'Annict: 通らない（{r.status_code}）。トークンを作り直して .env を書き直す')
                ok = False
        except Exception as e:  # noqa: BLE001
            print(f'Annict: 確かめられない（{e.__class__.__name__}）。ネットに繋がっているか見る')
            ok = False
    return ok


def probe_debug(html):
    """SEL を直すための手がかりを出す。ページの本文は出しすぎない（各 80 字まで）"""
    from bs4 import BeautifulSoup
    soup = BeautifulSoup(html, 'html.parser')
    print('\n==== JSON-LD ====')
    for sc in soup.find_all('script', type='application/ld+json'):
        print((sc.string or '').strip()[:1500])
    print('\n==== meta ====')
    for prop in ('og:title', 'og:description', 'description'):
        print(f'{prop}: {_meta(soup, prop)[:120]}')
    print('\n==== class に目印がある要素（class / 文字の頭 80 字）====')
    marks = ('synopsis', 'outline', 'story', 'score', 'rating', 'rate', 'star', 'mark', 'review', 'count',
             'other-info', 'info', 'date', 'year', 'release', 'season', 'vod', 'title')
    seen, n = set(), 0
    for el in soup.find_all(class_=True):
        cls = ' '.join(el.get('class'))
        if not any(m in cls.lower() for m in marks) or cls in seen:
            continue
        seen.add(cls)
        text = re.sub(r'\s+', ' ', el.get_text(' ', strip=True))[:80]
        if text:
            print(f'{el.name}.{cls.replace(" ", ".")}  |  {text}')
            n += 1
        if n >= 120:
            print('…（多いので 120 件で切った）')
            break


def find_filmarks_url(f, title):
    """Filmarks で作品名を検索して、最初に出てきたアニメ作品ページの URL を返す"""
    search = f'{FM}/search/animes?q={quote(title)}'
    if not f.allowed(search):
        log('robots.txt で止められている / 読めない: ' + search)
        return None
    text, status = f.get(search, fresh=True)
    for href in re.findall(r'href="(/animes/\d+/\d+)/?[^"]*"', text):
        return urljoin(FM, href)
    log(f'検索で作品ページが見つからなかった（{status}）: {search}')
    return None


def main(argv=None):
    loaded = load_dotenv()
    if loaded:
        log('.env から読んだ: ' + ', '.join(loaded))
    ap = argparse.ArgumentParser(description='all_anime_db.json を作る')
    ap.add_argument('--out', default=str(HERE / 'all_anime_db.json'))
    ap.add_argument('--annict', action='store_true', help='Annict から全作品を足す（ANNICT_TOKEN が要る）')
    ap.add_argument('--annict-since', type=int, default=1960)
    ap.add_argument('--annict-min-watchers', type=int, default=30,
                    help='Annict のレビューを取るのは、見ている人がこの数以上の作品だけ')
    ap.add_argument('--no-annict-reviews', action='store_true', help='--annict で作品だけ取り、レビューは取らない')
    ap.add_argument('--annict-reviews-only', action='store_true',
                    help='作品は取り直さず（取ってある分を使う）、Annict のレビューだけ取る')
    ap.add_argument('--keep-series-movies', action='store_true',
                    help='シリーズものの劇場版（ドラえもん・コナンの映画など）も入れる。既定では外す')
    ap.add_argument('--filmarks', action='store_true',
                    help='Filmarks のアニメを取る。取ったことのある作品は飛ばす（毎期の追加はこれだけ）')
    ap.add_argument('--refresh-since', type=int, default=None,
                    help='この年より後の作品は取り直す（★やレビュー数の更新。例 --refresh-since 2025）')
    ap.add_argument('--refresh-all', action='store_true', help='全部取り直す')
    ap.add_argument('--limit', type=int, default=None, help='取る数の上限（試す時に）')
    ap.add_argument('--sleep', type=float, default=1.5, help='Filmarks の間隔（秒。1.5 より短くはならない）')
    ap.add_argument('--min-info', type=float, default=0.25, help='軸を決める手がかりがこれより少ない作品は落とす')
    ap.add_argument('--probe', metavar='URL か 作品名',
                    help='Filmarks の作品ページ 1 枚だけ取って、読めた中身を見せる（何も書かない）。'
                         '作品名を渡すと、Filmarks で検索して最初に出た作品を見る')
    ap.add_argument('--probe-debug', action='store_true',
                    help='--probe と一緒に。スコア・あらすじ・年・レビューらしい所の class と文字を並べる（SEL を直す手がかり）')
    ap.add_argument('--check-env', action='store_true', help='トークンが入っているか確かめる（値は出さない）')
    args = ap.parse_args(argv)

    if args.check_env:
        return 0 if check_env() else 1

    if args.probe:
        f = Fetcher(args.sleep, os.environ.get('SCRAPEDO_TOKEN'))
        url = args.probe
        if not url.startswith('http'):
            url = find_filmarks_url(f, url)
            if not url:
                return 1
        if not f.allowed(url):
            log('robots.txt で止められている / 読めない')
            return 1
        text, status = f.get(url, fresh=True)
        log(f'見たページ: {url}（{status}）')
        item = parse_filmarks(text, url) if status == 200 else None
        print(json.dumps({'status': status, 'parsed': item, 'sitemaps': f.sitemaps(FM)},
                         ensure_ascii=False, indent=1))
        if args.probe_debug and status == 200:
            probe_debug(text)
        missing = [k for k in ('title', 'score', 'reviews', 'synopsis', 'year') if not (item or {}).get(k)]
        log('読めなかった項目: ' + (', '.join(missing) if missing else 'なし') +
            ('  → SEL を直す' if missing else ''))
        return 0

    defaults = load_defaults()
    log(f'手元の一覧: {len(defaults)} 作')

    annict_store = load_store(ANNICT_STORE)
    annict = []
    if args.annict or args.annict_reviews_only:
        token = os.environ.get('ANNICT_TOKEN')
        if not token:
            log('ANNICT_TOKEN が無いので Annict は飛ばす')
        else:
            if not args.annict_reviews_only:
                try:
                    annict = fetch_annict(token, since=args.annict_since, limit=args.limit)
                except Exception as e:  # noqa: BLE001
                    log('Annict で止まった:', e)
            if annict:   # API は速いので、取れたら丸ごと入れ替える
                ANNICT_STORE.parent.mkdir(parents=True, exist_ok=True)
                ANNICT_STORE.write_text(''.join(json.dumps(a, ensure_ascii=False) + '\n' for a in annict),
                                        encoding='utf-8')
                annict_store = load_store(ANNICT_STORE)
            if not args.no_annict_reviews and annict_store:
                try:
                    fetch_annict_reviews(token, list(annict_store.values()),
                                         min_watchers=args.annict_min_watchers, limit=args.limit)
                except Exception as e:  # noqa: BLE001
                    log('Annict のレビューで止まった（取れた分は残っている。もう一度打てば続きから）:', e)
    annict = attach_annict_reviews(list(annict_store.values()))
    log(f"Annict のレビュー: {sum(1 for a in annict if a.get('counts'))} 作に手がかりあり")
    log(f'Annict: {len(annict)} 作（{ANNICT_STORE.name}）')

    store = load_store(FILMARKS_STORE)
    if args.filmarks:
        tok = os.environ.get('SCRAPEDO_TOKEN')
        log('Filmarks: 直接取りに行く' + ('（ブロックされたら scrape.do に切り替える）' if tok else '（scrape.do トークンなし）')
            + f'。取ってある {len(store)} 作は飛ばす')
        extra = [u for u, r in store.items()
                 if args.refresh_all or (args.refresh_since and (r.get('year') or 0) >= args.refresh_since)]
        try:
            fetch_filmarks(Fetcher(args.sleep, tok), args.limit, FILMARKS_STORE,
                           skip=frozenset(store), extra=extra)
        except Exception as e:  # noqa: BLE001
            log('Filmarks で止まった:', e)
        store = load_store(FILMARKS_STORE)
        # 取り直しで同じ作品が何行にもなるので、1 作 1 行に詰め直す
        FILMARKS_STORE.write_text(''.join(json.dumps(r, ensure_ascii=False) + '\n' for r in store.values()),
                                  encoding='utf-8')
    filmarks = list(store.values())
    log(f'Filmarks: {len(filmarks)} 作（{FILMARKS_STORE.name}）')

    rows = merge(defaults, annict, filmarks)
    if not args.keep_series_movies:
        rows, dropped_movies = drop_series_movies(rows)
        log(f'シリーズものの劇場版を外した: {len(dropped_movies)} 作（--keep-series-movies で入れられる）')
    works = finish(rows)
    before = len(works)
    works = [w for w in works if w['i'] >= args.min_info]
    for i, w in enumerate(works):
        w['id'] = i
    src = 'default'
    if filmarks or annict:
        src = '+'.join(x for x, on in (('annict', annict), ('filmarks', filmarks)) if on) + '+default'
    data = {
        'meta': {
            'generated_at': dt.datetime.now(dt.timezone.utc).isoformat(timespec='seconds'),
            'source': src, 'count': len(works),
            'from_annict': len(annict), 'from_filmarks': len(filmarks),
            'dropped_no_info': before - len(works),
            'axes': [f'{k}:{AXIS_LETTERS[k][0]}/{AXIS_LETTERS[k][1]}' for k in AXES],
            'keys': {'t': 'タイトル', 'y': '年', 'm': '媒体', 's': 'Filmarks★（取れた作品だけ）',
                     'n': 'Filmarks のレビュー数', 'p': '人気 0〜1', 'i': '軸の手がかりの多さ 0〜1',
                     'v': '6軸（+ が R/D/C/P/V/M）', 'f': '好みの要素の強さ 0〜1（キーは FEATURES）',
                     'ep': '話数（Annict）', 'g': 'タグ', 'syn': 'あらすじ（冒頭）',
                     'img': '画像', 'fm': 'Filmarks の URL', 'an': 'Annict の id',
                     'se': 'Filmarks のシリーズ id', 'vod': '配信（Filmarks 取得時点）',
                     'src': 'd=手元 a=Annict f=Filmarks'},
        },
        'works': works,
    }
    Path(args.out).write_text(json.dumps(data, ensure_ascii=False, separators=(',', ':')) + '\n', encoding='utf-8')
    size = Path(args.out).stat().st_size
    log(f'{args.out}: {len(works)} 作（Annict {len(annict)} / Filmarks {len(filmarks)} / '
        f'手がかり不足で落とした {before - len(works)}）{size / 1024:.0f} KB')


if __name__ == '__main__':
    sys.exit(main())
