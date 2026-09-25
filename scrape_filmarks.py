#!/usr/bin/env python3
"""Filmarks からアニメの情報を集めて anime_data.json に書く。

    pip install -r requirements.txt
    python3 scrape_filmarks.py                 # 取れるだけ取る。駄目ならフォールバック
    python3 scrape_filmarks.py --fallback-only # 取りに行かず、手元の 50 作だけで作る
    python3 scrape_filmarks.py --limit 80 --sleep 2.0

守っていること
  - robots.txt を先に読み、許されていない道には行かない。
    robots.txt が読めなければ、それ自体を「行かない理由」として扱う
  - 1 リクエストごとに --sleep 秒（既定 2.0、下限 1.5）待つ
  - 何を取りに来たか分かる User-Agent を名乗る
  - 取れた数が少なければ、手元のフォールバック（主要 50 作）で埋める

何を書くか（anime_data.json）
  meta   … いつ・どこから作ったか。source は "filmarks" / "mixed" / "fallback"
  anime  … 作品ごとに
      title, year, score（Filmarks の★。取れなかった作品は null）,
      synopsis, tags, image, vod, filmarks_url, source,
      axes（診断の 6 軸。-1〜+1。+ が R/D/C/G/P/V、- が F/H/S/I/A/L）

軸の値について
  フォールバックの 50 作は、こちらで作品ごとに付けた値（編集判断）。
  Filmarks から新しく取れた作品は、レビュー本文に出てくる言葉の数から
  見積もる（TAG_AXES）。知っている作品なら、手で付けた値の方を使う。

Filmarks の構造は予告なく変わる。セレクタ（SEL）は取れなくなったら直す前提。
取ったデータ、とくに画像とあらすじには権利がある。公開する画面に何を出すかは
README の「データの出し方」を読んでから決めること。
"""
from __future__ import annotations

import argparse
import datetime as dt
import json
import re
import sys
import time
import urllib.robotparser
from pathlib import Path
from urllib.parse import quote, urljoin

BASE = 'https://filmarks.com'
# 一覧の入口。人気順のアニメ一覧。変わっていたらここを直す
LIST_PATHS = ['/list-anime/popular', '/list-anime/trend']
DETAIL_RE = re.compile(r'^/animes/\d+/\d+/?$')
UA = ('shindananime-collector/1.0 (+https://koshinstudio.com/works/shindananime/; '
      'polite; 1 req per 2s)')
MIN_SLEEP = 1.5
MIN_SCRAPED = 10   # これより少なければフォールバックで埋める

# レビューのタグ。本文にこの言葉（のどれか）が出てきたら 1 と数える
TAG_WORDS = {
    '胸糞': ['胸糞', '胸くそ', 'むなくそ', '後味が悪', '鬱'],
    '絶望': ['絶望', '救いがな', '救いのな'],
    '伏線回収': ['伏線', '回収'],
    '考察': ['考察', '謎', '深読み'],
    '作画神': ['作画', '神作画', '映像美', '作画が良', '作画がすご'],
    '泣ける': ['泣け', '泣いた', '号泣', '涙'],
    '爽快': ['爽快', 'スカッと', 'スッキリ', 'カタルシス'],
    '心理戦': ['心理戦', '頭脳戦', '駆け引き', '騙し合い'],
    'スローライフ': ['スローライフ', 'のんびり', 'まったり'],
    '癒し': ['癒し', '癒され', 'ほっこり'],
    '熱い': ['熱い', 'アツい', '胸熱', '燃え'],
    'ギャグ': ['ギャグ', '笑った', '爆笑', '腹筋'],
    '群像劇': ['群像劇', '群像'],
    '推し': ['推し', 'キャラが良', 'キャラが最高'],
    '異世界': ['異世界', '転生'],
    '日常': ['日常'],
    '会話劇': ['会話劇', '掛け合い', 'セリフ回し'],
}

# タグ 1 つが、どの軸をどちらへ押すか（+ が R/D/C/G/P/V）
TAG_AXES = {
    '胸糞':        {'mood': +1.0},
    '絶望':        {'mood': +0.8},
    '伏線回収':    {'structure': +1.0, 'watch': +0.3},
    '考察':        {'structure': +0.8, 'taste': +0.3, 'watch': +0.7},
    '作画神':      {'taste': -0.5, 'structure': -0.2, 'watch': +0.9},
    '泣ける':      {'taste': +0.4},
    '爽快':        {'mood': -1.0, 'structure': -0.3, 'watch': -0.4},
    '心理戦':      {'taste': +1.0, 'structure': +0.4},
    'スローライフ': {'mood': -0.6, 'world': +0.3, 'taste': +0.3},
    '癒し':        {'mood': -0.8},
    '熱い':        {'taste': -0.8, 'mood': -0.3, 'bond': +0.3},
    'ギャグ':      {'taste': -0.7, 'mood': -0.7, 'structure': -0.6, 'watch': -0.7},
    '群像劇':      {'bond': +1.0},
    '推し':        {'bond': -0.8},
    '異世界':      {'world': -1.0},
    '日常':        {'world': +0.8, 'mood': -0.4},
    '会話劇':      {'taste': +0.7},
}
AXIS_KEYS = ['world', 'mood', 'structure', 'bond', 'taste', 'watch']

# 配信サービス。詳細ページの画像の alt や文言にこの名前が出たら「配信あり」
VOD_NAMES = {
    'unext': ['U-NEXT', 'U‐NEXT', 'UNEXT'],
    'danime': ['dアニメストア'],
    'prime': ['Prime Video', 'プライム・ビデオ', 'Amazon'],
    'netflix': ['Netflix'],
    'abema': ['ABEMA', 'AbemaTV'],
    'dmmtv': ['DMM TV'],
    'hulu': ['Hulu'],
    'disney': ['Disney+', 'ディズニープラス'],
}

# 取れなくなったら、ここを直す
SEL = {
    'title': ['h2.p-content-detail__title span', 'h2.p-content-detail__title', 'h1'],
    'score': ['.p-content-detail__main .c-rating__score', '.c-rating__score'],
    'synopsis': ['.p-content-detail__synopsis-desc', '.p-content-detail__synopsis',
                 '#js-content-detail-synopsis'],
    'review': ['.p-mark__review', '.c-content-card__review', '.p-mark-review'],
    'vod': ['.p-content-detail-related-info', '.p-content-detail__vod', '.c-vod'],
}


def log(*a):
    print(*a, file=sys.stderr)


def filmarks_search_url(title: str) -> str:
    return f'{BASE}/search/animes?q={quote(title)}'


# ---------------------------------------------------------------- 取りに行く

class Polite:
    """robots.txt を守り、毎回あいだを空ける取り手。"""

    def __init__(self, sleep: float):
        import requests  # 取りに行く時だけ要る
        self.requests = requests
        self.sleep = max(sleep, MIN_SLEEP)
        self.s = requests.Session()
        self.s.headers.update({'User-Agent': UA, 'Accept-Language': 'ja,en;q=0.5'})
        self.robots = urllib.robotparser.RobotFileParser()
        self.last = 0.0

    def load_robots(self) -> bool:
        try:
            r = self.get(BASE + '/robots.txt', check=False)
        except Exception as e:  # noqa: BLE001 — 何であれ「読めない」
            log(f'robots.txt が読めない（{e.__class__.__name__}）。取りに行かない')
            return False
        if r.status_code >= 400:
            log(f'robots.txt が {r.status_code}。取りに行かない')
            return False
        self.robots.parse(r.text.splitlines())
        return True

    def allowed(self, url: str) -> bool:
        return self.robots.can_fetch(UA, url)

    def get(self, url: str, check: bool = True):
        if check and not self.allowed(url):
            raise PermissionError('robots.txt で止められている: ' + url)
        wait = self.last + self.sleep - time.monotonic()
        if wait > 0:
            time.sleep(wait)
        try:
            r = self.s.get(url, timeout=20)
        finally:
            self.last = time.monotonic()
        if r.status_code == 429:
            raise RuntimeError('429 Too Many Requests。ここで止める')
        return r


def first(soup, selectors):
    for sel in selectors:
        el = soup.select_one(sel)
        if el and el.get_text(strip=True):
            return el
    return None


def meta(soup, prop):
    el = soup.find('meta', attrs={'property': prop}) or soup.find('meta', attrs={'name': prop})
    return el.get('content', '').strip() if el else ''


def json_ld(soup):
    out = []
    for s in soup.find_all('script', type='application/ld+json'):
        try:
            d = json.loads(s.string or '')
        except (ValueError, TypeError):
            continue
        out.extend(d if isinstance(d, list) else [d])
    return out


def count_tags(texts):
    counts = {}
    for text in texts:
        for tag, words in TAG_WORDS.items():
            if any(w in text for w in words):
                counts[tag] = counts.get(tag, 0) + 1
    return counts


def axes_from_tags(counts):
    total = sum(counts.values()) or 1
    acc = {k: 0.0 for k in AXIS_KEYS}
    for tag, n in counts.items():
        for k, v in TAG_AXES.get(tag, {}).items():
            acc[k] += v * n / total
    # 数の少ない言葉に引っ張られすぎないよう、ゆるく丸める
    return {k: round(max(-1.0, min(1.0, v * 2.2)), 2) for k, v in acc.items()}


def parse_detail(html: str, url: str):
    from bs4 import BeautifulSoup
    soup = BeautifulSoup(html, 'html.parser')
    ld = next((d for d in json_ld(soup) if isinstance(d, dict) and d.get('name')), {})

    title_el = first(soup, SEL['title'])
    title = (ld.get('name') or (title_el.get_text(strip=True) if title_el else '')
             or meta(soup, 'og:title').split('|')[0].strip())
    if not title:
        return None

    score = None
    agg = ld.get('aggregateRating') or {}
    for raw in (agg.get('ratingValue'),
                (first(soup, SEL['score']) or soup.new_tag('x')).get_text(strip=True)):
        try:
            score = round(float(raw), 1)
            break
        except (TypeError, ValueError):
            continue

    syn_el = first(soup, SEL['synopsis'])
    synopsis = (syn_el.get_text(' ', strip=True) if syn_el else '') or meta(soup, 'og:description')

    image = meta(soup, 'og:image') or (ld.get('image') if isinstance(ld.get('image'), str) else '')

    reviews = [el.get_text(' ', strip=True) for sel in SEL['review'] for el in soup.select(sel)]
    counts = count_tags(reviews)
    tags = [t for t, _ in sorted(counts.items(), key=lambda kv: -kv[1])][:6]

    vod_text = ' '.join(
        [el.get_text(' ', strip=True) for sel in SEL['vod'] for el in soup.select(sel)]
        + [img.get('alt', '') for sel in SEL['vod'] for el in soup.select(sel)
           for img in el.find_all('img')])
    vod = [k for k, names in VOD_NAMES.items() if any(n in vod_text for n in names)]

    year = None
    m = re.search(r'(19|20)\d{2}', ld.get('dateCreated', '') or ld.get('datePublished', '') or '')
    if m:
        year = int(m.group(0))

    return {
        'title': title, 'year': year, 'score': score, 'synopsis': synopsis[:400],
        'tags': tags, 'tag_counts': counts, 'image': image or None, 'vod': vod,
        'filmarks_url': url, 'source': 'filmarks', 'axes': axes_from_tags(counts),
    }


def scrape(limit: int, sleep: float):
    try:
        import bs4  # noqa: F401
        import requests  # noqa: F401
    except ImportError:
        log('requests / beautifulsoup4 が無い。pip install -r requirements.txt')
        return []
    p = Polite(sleep)
    if not p.load_robots():
        return []

    links = []
    for path in LIST_PATHS:
        for page in range(1, 6):
            url = f'{BASE}{path}?page={page}'
            if not p.allowed(url):
                log('止められている一覧:', url)
                break
            try:
                r = p.get(url)
            except Exception as e:  # noqa: BLE001
                log('一覧で止まった:', url, e)
                break
            if r.status_code != 200:
                log('一覧', r.status_code, url)
                break
            from bs4 import BeautifulSoup
            soup = BeautifulSoup(r.text, 'html.parser')
            got = 0
            for a in soup.find_all('a', href=True):
                href = a['href'].split('?')[0]
                if DETAIL_RE.match(href):
                    full = urljoin(BASE, href)
                    if full not in links:
                        links.append(full)
                        got += 1
            log(f'一覧 {url}: {got} 件')
            if not got or len(links) >= limit:
                break
        if len(links) >= limit:
            break

    out = []
    for url in links[:limit]:
        try:
            r = p.get(url)
        except PermissionError as e:
            log(e)
            continue
        except Exception as e:  # noqa: BLE001
            log('詳細で止まった:', url, e)
            if '429' in str(e):
                break
            continue
        if r.status_code != 200:
            log('詳細', r.status_code, url)
            continue
        item = parse_detail(r.text, url)
        if item:
            out.append(item)
            log(f'  {len(out):>3} {item["title"]}  ★{item["score"]}  {",".join(item["tags"])}')
    return out


# ---------------------------------------------------------------- 手元の 50 作

# (タイトル, 年, 一行紹介, タグ, (world, mood, structure, bond, taste, watch))
# 軸は + が R/D/C/G/P/V、- が F/H/S/I/A/L。こちらで付けた編集上の見立て。
# 一行紹介はこのリポジトリで書いたもの（公式のあらすじの写しではない）。
SEED = [
    ('進撃の巨人', 2013, '壁の外に何があるのか。巨人と戦う物語が、話数を追うごとに別の顔を見せていく。',
     ['伏線回収', '絶望', '考察', '作画神', '群像劇'], (-0.9, 0.9, 0.9, 0.5, -0.2, 0.8)),
    ('DEATH NOTE', 2006, '名前を書けば人が死ぬノートを拾った秀才と、正体を追う名探偵の読み合い。',
     ['心理戦', '頭脳戦', '考察'], (0.3, 0.7, 0.7, -0.8, 1.0, 0.3)),
    ('コードギアス 反逆のルルーシュ', 2006, '人に命令を下せる力を得た皇子が、仮面を被って帝国に挑む。',
     ['心理戦', '伏線回収', 'ロボット'], (-0.7, 0.5, 0.6, -0.6, 0.6, 0.2)),
    ('魔法少女まどか☆マギカ', 2011, '願いと引き換えに魔法少女になる。その約束の裏側を、少女たちは知らない。',
     ['胸糞', '伏線回収', '考察', '泣ける'], (-0.7, 0.9, 0.8, 0.0, 0.4, 0.8)),
    ('STEINS;GATE', 2011, '秋葉原の小さな研究所で生まれた、過去へメールを送る発明。軽い遊びが取り返しのつかない所へ転がる。',
     ['伏線回収', '考察', 'SF'], (0.2, 0.3, 1.0, 0.3, 0.7, 0.6)),
    ('鋼の錬金術師 FULLMETAL ALCHEMIST', 2009, '失った体を取り戻すため、兄弟は国の奥に隠された秘密へ近づいていく。',
     ['伏線回収', '王道', '熱い', '群像劇'], (-0.9, -0.2, 0.6, 0.6, -0.5, 0.2)),
    ('呪術廻戦', 2020, '呪いを祓う学校に入った少年が、仲間とともに容赦のない戦いに踏み込む。',
     ['作画神', 'バトル', '熱い'], (-0.3, 0.5, -0.3, 0.3, -0.8, 0.3)),
    ('鬼滅の刃', 2019, '鬼にされた妹を人に戻すため、少年は刀を取る。',
     ['作画神', '泣ける', '熱い'], (-0.7, 0.1, -0.6, 0.5, -0.9, 0.4)),
    ('チェンソーマン', 2022, '借金まみれの少年が悪魔の力を得て、欲望まっすぐに生きのびていく。',
     ['胸糞', '作画神', 'バトル'], (-0.2, 0.8, -0.4, -0.3, -0.6, 0.5)),
    ('SPY×FAMILY', 2022, 'スパイ、殺し屋、心を読む子ども。正体を隠した三人の、にせものの家族。',
     ['爽快', 'ギャグ', '家族'], (-0.3, -0.9, -0.7, 0.6, -0.4, -0.8)),
    ('葬送のフリーレン', 2023, '魔王を倒した後の、長命なエルフの旅。人を知ろうとする時間の物語。',
     ['泣ける', '作画神', 'スローライフ'], (-1.0, -0.3, 0.4, 0.3, 0.8, 0.8)),
    ('【推しの子】', 2023, '芸能界の光と影。生まれ変わった兄妹が、ひとつの事件の真相を追う。',
     ['考察', '胸糞', '芸能'], (0.8, 0.6, 0.6, -0.4, 0.6, 0.5)),
    ('四月は君の嘘', 2014, 'ピアノが弾けなくなった少年と、自由奔放なヴァイオリニストの春。',
     ['泣ける', '音楽', '青春'], (1.0, 0.3, 0.0, -0.5, 0.7, 0.5)),
    ('ヴァイオレット・エヴァーガーデン', 2018, '戦場しか知らなかった少女が、手紙の代筆を通して「愛してる」の意味を探す。',
     ['泣ける', '作画神'], (-0.5, -0.3, 0.2, -0.6, 0.9, 1.0)),
    ('ハイキュー!!', 2014, '背の低い少年が「高さ」の競技で頂点を目指す。チームで飛ぶバレーボール。',
     ['熱い', '爽快', 'スポーツ', '群像劇'], (0.9, -0.9, -0.5, 1.0, -0.8, -0.3)),
    ('3月のライオン', 2016, '居場所のない若き棋士と、下町で暮らす三姉妹。静かで、あたたかい。',
     ['泣ける', '心理戦', '日常'], (1.0, 0.0, 0.3, 0.1, 0.9, 0.6)),
    ('響け！ユーフォニアム', 2015, '全国を目指す吹奏楽部。音にかける本気が、部の人間関係を揺らしていく。',
     ['音楽', '青春', '作画神', '群像劇'], (1.0, -0.2, 0.2, 0.9, 0.6, 0.8)),
    ('けいおん!', 2009, '軽音部の女の子たちの、お茶とお菓子と、ときどき演奏の日々。',
     ['日常', '癒し', '音楽', 'スローライフ'], (0.9, -1.0, -0.8, 0.9, -0.3, -0.5)),
    ('ゆるキャン△', 2018, '冬の山梨でキャンプ。焚き火とカップ麺と、ゆるい友だち。',
     ['スローライフ', '癒し', '日常'], (1.0, -1.0, -0.3, 0.5, 0.3, -0.2)),
    ('銀魂', 2006, '宇宙人がやってきた江戸で、何でも屋が騒ぎ、笑わせ、たまに泣かせる。',
     ['ギャグ', '熱い', '群像劇'], (-0.4, -0.7, -0.8, 0.8, -1.0, -0.8)),
    ('ワンパンマン', 2015, '強くなりすぎて、どんな敵も一撃で終わってしまうヒーローの退屈。',
     ['爽快', '作画神', 'ギャグ'], (-0.5, -0.8, -0.9, -0.9, -1.0, -0.4)),
    ('モブサイコ100', 2016, '強すぎる超能力を持つ、ごく普通でいたい中学生の成長。',
     ['作画神', '爽快', '泣ける'], (0.0, -0.6, -0.4, -0.3, -0.8, 0.3)),
    ('カウボーイビバップ', 1998, '宇宙を渡る賞金稼ぎたち。ジャズの流れる、乾いた大人の群像。',
     ['大人', '音楽', 'SF'], (-0.8, 0.3, -0.2, 0.2, 0.3, 0.5)),
    ('新世紀エヴァンゲリオン', 1995, '謎の敵「使徒」と戦うため、少年は巨大な人型兵器に乗せられる。',
     ['考察', '胸糞', 'ロボット'], (-0.7, 0.9, 0.9, -0.5, 0.7, 1.0)),
    ('PSYCHO-PASS サイコパス', 2012, '心の状態を数値で測り、犯罪を未然に裁く社会。その正しさを刑事たちが問う。',
     ['考察', '心理戦', 'SF'], (-0.6, 0.7, 0.6, 0.2, 0.7, 0.4)),
    ('約束のネバーランド', 2019, '幸せな孤児院の、本当の姿を知った子どもたちの脱出計画。',
     ['心理戦', '伏線回収', '脱出'], (-0.6, 0.6, 0.6, 0.5, 0.9, 0.2)),
    ('賭ケグルイ', 2017, 'ギャンブルの強さが序列を決める学園に、賭けに狂う転校生がやってくる。',
     ['心理戦', 'ギャンブル'], (0.4, 0.4, -0.3, -0.7, 0.8, -0.6)),
    ('逆境無頼カイジ', 2007, '借金を背負った男が、命がけのギャンブルに挑む。ざわ…ざわ…。',
     ['心理戦', 'ギャンブル', '胸糞'], (0.9, 0.8, 0.3, -0.7, 1.0, -0.3)),
    ('夏目友人帳', 2008, '妖怪が見える少年が、祖母の遺した「友人帳」の名を返していく。',
     ['泣ける', '癒し'], (0.0, -0.6, -0.3, -0.2, 0.8, 0.0)),
    ('氷菓', 2012, '省エネ主義の高校生が、好奇心のかたまりに振り回されて日常の謎を解く。',
     ['考察', '日常', '作画神'], (1.0, -0.4, 0.5, -0.5, 0.9, 0.7)),
    ('化物語', 2009, '怪異に出会った少女たちと、少年の会話劇。言葉の応酬そのものが見どころ。',
     ['会話劇', '考察'], (0.2, 0.2, 0.5, -0.7, 1.0, 0.8)),
    ('僕だけがいない街', 2016, '事件の直前に時間が巻き戻る男が、子ども時代の誘拐事件に向き合う。',
     ['伏線回収', '考察', 'サスペンス'], (0.6, 0.6, 0.8, -0.4, 0.8, 0.2)),
    ('Re:ゼロから始める異世界生活', 2016, '死ぬと時間が巻き戻る。異世界で、少年は何度も絶望をやり直す。',
     ['胸糞', '絶望', '異世界'], (-1.0, 0.8, 0.6, -0.4, 0.4, 0.4)),
    ('この素晴らしい世界に祝福を！', 2016, '異世界に転生したら、仲間がみんなポンコツだった。',
     ['ギャグ', '異世界'], (-1.0, -0.9, -0.9, 0.8, -0.9, -1.0)),
    ('メイドインアビス', 2017, '底知れぬ大穴へ降りていく少女とロボットの冒険。美しく、容赦がない。',
     ['胸糞', '絶望', '作画神', '冒険'], (-1.0, 1.0, 0.5, -0.3, 0.3, 0.9)),
    ('宇宙よりも遠い場所', 2018, '女子高生四人が、南極を目指す。行きたい場所に、本気で行く話。',
     ['泣ける', '青春', '爽快', '群像劇'], (0.9, -0.8, -0.3, 0.9, 0.4, 0.3)),
    ('ジョジョの奇妙な冒険', 2012, '血統をめぐる奇妙な戦いが、世代を越えて受け継がれていく。',
     ['熱い', '頭脳戦', 'バトル'], (-0.5, -0.4, -0.5, 0.3, -0.5, -0.2)),
    ('天元突破グレンラガン', 2007, '地下で暮らしていた少年たちが、ドリル一本で天を突き破る。',
     ['熱い', '爽快', 'ロボット'], (-1.0, -0.8, -0.9, 0.6, -1.0, -0.3)),
    ('蟲師', 2005, '命の根源に近いもの「蟲」をめぐる、旅の蟲師の一話完結譚。',
     ['癒し', '大人'], (-0.4, 0.2, 0.2, -0.6, 1.0, 0.8)),
    ('ブルーロック', 2022, '日本一のエゴイストを作る、300人のストライカーのサバイバル。',
     ['スポーツ', '熱い'], (0.6, 0.1, -0.7, -0.8, -0.4, -0.4)),
    ('ぼっち・ざ・ろっく！', 2022, '極度の人見知りのギター少女が、バンドを組んでライブハウスに立つ。',
     ['ギャグ', '音楽', '日常'], (1.0, -0.9, -0.6, 0.4, -0.7, -0.3)),
    ('Dr.STONE', 2019, '全人類が石になった数千年後。科学の力で文明をゼロから作り直す。',
     ['爽快', '頭脳戦', '冒険'], (-0.7, -0.9, 0.2, 0.8, 0.4, -0.6)),
    ('かぐや様は告らせたい', 2019, '好きと言ったら負け。天才ふたりの、恋の頭脳戦。',
     ['心理戦', 'ギャグ', 'ラブコメ'], (0.9, -0.9, -0.5, -0.3, 0.3, -0.7)),
    ('ヴィンランド・サガ', 2019, '父の仇を追う少年が、戦いの果てに「本当の戦士」の意味を問う。',
     ['胸糞', '大人', '歴史'], (0.4, 0.7, 0.5, -0.5, -0.2, 0.5)),
    ('ダンジョン飯', 2024, '迷宮の魔物を料理して食べながら、仲間を助けに深層へ潜る。',
     ['グルメ', '異世界', 'ギャグ'], (-1.0, -0.7, 0.1, 0.7, -0.2, -0.2)),
    ('SHIROBAKO', 2014, 'アニメ制作の現場で働く五人の、仕事と夢と締め切り。',
     ['群像劇', 'お仕事', '泣ける'], (1.0, -0.6, -0.1, 1.0, 0.5, 0.1)),
    ('ひぐらしのなく頃に', 2006, '山あいの村で毎年起きる怪死事件。仲の良い日常が、少しずつ軋んでいく。',
     ['考察', '胸糞', '伏線回収'], (0.5, 1.0, 0.9, 0.6, 0.6, 0.7)),
    ('サマータイムレンダ', 2022, '故郷の島に帰った少年が、繰り返す夏の中で「影」の正体に迫る。',
     ['伏線回収', '考察', 'サスペンス'], (0.6, 0.6, 0.9, 0.4, 0.5, 0.3)),
    ('NANA', 2006, '同じ名前の二人のナナ。東京での共同生活と、恋と夢と、すれ違い。',
     ['泣ける', '恋愛', '大人'], (1.0, 0.5, 0.0, -0.4, 0.8, 0.2)),
    ('ONE PIECE', 1999, '海賊王を目指す少年と仲間たちの、終わらない大航海。',
     ['熱い', '泣ける', '冒険', '群像劇'], (-0.9, -0.6, 0.3, 1.0, -0.8, -0.3)),
]


def fallback():
    out = []
    for title, year, blurb, tags, (w, m, s, b, t, v) in SEED:
        out.append({
            'title': title, 'year': year, 'score': None, 'synopsis': blurb,
            'tags': tags, 'image': None, 'vod': [],
            'filmarks_url': filmarks_search_url(title), 'source': 'fallback',
            'axes': {'world': w, 'mood': m, 'structure': s, 'bond': b, 'taste': t, 'watch': v},
        })
    return out


def norm(title: str) -> str:
    return re.sub(r'[\s　・!！?？:：「」【】()（）☆\-]', '', title).lower()


def merge(scraped, seed):
    """取れた作品を主にして、知っている作品は手で付けた軸とタグを使う。
    取れた数が少なければ、残りを手元の作品で埋める。"""
    known = {norm(a['title']): a for a in seed}
    out, seen = [], set()
    for a in scraped:
        k = norm(a['title'])
        base = next((v for kk, v in known.items() if kk and (kk in k or k in kk)), None)
        if base:
            a = {**a, 'axes': base['axes'],
                 'tags': list(dict.fromkeys(base['tags'] + a['tags']))[:6],
                 'synopsis': a['synopsis'] or base['synopsis']}
            seen.add(norm(base['title']))
        out.append(a)
    if len(scraped) < MIN_SCRAPED:
        out += [a for a in seed if norm(a['title']) not in seen]
    return out


def main():
    ap = argparse.ArgumentParser(description=__doc__.split('\n')[0])
    ap.add_argument('--out', default=str(Path(__file__).with_name('anime_data.json')))
    ap.add_argument('--limit', type=int, default=50)
    ap.add_argument('--sleep', type=float, default=2.0, help=f'リクエストの間隔（秒、下限 {MIN_SLEEP}）')
    ap.add_argument('--fallback-only', action='store_true', help='取りに行かず、手元の 50 作で作る')
    args = ap.parse_args()

    seed = fallback()
    scraped = [] if args.fallback_only else scrape(args.limit, args.sleep)
    anime = merge(scraped, seed)
    n_live = sum(1 for a in anime if a['source'] == 'filmarks')
    source = 'filmarks' if n_live == len(anime) else 'mixed' if n_live else 'fallback'

    for i, a in enumerate(anime):
        a['id'] = f'a{i:03d}'
        a.pop('tag_counts', None)
    data = {
        'meta': {
            'generated_at': dt.datetime.now(dt.timezone.utc).isoformat(timespec='seconds'),
            'source': source,
            'count': len(anime),
            'from_filmarks': n_live,
            'axes': {
                'world': '+ R 現実・現代 / - F 異世界・SF',
                'mood': '+ D ダーク / - H ハッピー',
                'structure': '+ C 伏線・考察 / - S テンポ・直感',
                'bond': '+ G 群像・絆 / - I 孤高・推し',
                'taste': '+ P 心理・ドラマ / - A アクション・ギャグ',
                'watch': '+ V 映像美・じっくり没入 / - L 気軽・一気見',
            },
            'note': ('score は Filmarks の★（取得時点）。source が fallback の作品は取得できて'
                     'いないため null。axes は診断用の見立てで、Filmarks の値ではない。'),
        },
        'anime': [{k: a[k] for k in ('id', 'title', 'year', 'score', 'synopsis', 'tags',
                                     'image', 'vod', 'filmarks_url', 'source', 'axes')}
                  for a in anime],
    }
    Path(args.out).write_text(json.dumps(data, ensure_ascii=False, indent=1) + '\n', encoding='utf-8')
    log(f'{args.out}: {len(anime)} 作（Filmarks から {n_live} / 手元 {len(anime) - n_live}）source={source}')


if __name__ == '__main__':
    main()
