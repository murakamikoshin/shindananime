"""build_anime_db.py の検査。外へは出ない（通信は作り物に差し替える）。
    python3 -m unittest discover tests
"""
import json
import sys
import tempfile
import unittest
from pathlib import Path
from urllib.parse import parse_qs, urlparse

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import build_anime_db as b  # noqa: E402

DETAIL = '''<html><head>
<meta property="og:title" content="アニメ『{title}』の感想・レビュー[{count}件] | Filmarks">
<meta property="og:description" content="レビュー数：{count}件 ／ 平均スコア：★★★★{score}点">
<meta property="og:image" content="https://img.example/{n}.jpg">
<script type="application/ld+json">{{"@context":["http://schema.org/",{{"title":"name","releaseDate":"datePublished","outline":"description"}}],"@type":"{kind}","title":"{title}","outline":"{syn}","releaseDate":"{year}-09-29T21:00:00+09:00"}}</script>
<script type="application/ld+json">{{"@context":"http://schema.org","@type":"BreadcrumbList","itemListElement":[]}}</script>
</head><body>
<h2 class="p-content-detail__title"><span>{title}</span> （ {year}年 製作のアニメ）</h2>
<div class="p-content-detail__primary-info"><h3>公開日：{year}年09月29日</h3> 製作国・地域： 日本 制作会社： {studio} 再生時間：{minutes}分</div>
<div class="c2-rating-l"><div class="c2-rating-l__text">{score}</div></div>
<div class="p-content-detail__synopsis"><h3 class="p-content-detail__synopsis-term">あらすじ</h3></div>
<div class="p-content-detail-related-info"><div class="p-content-detail-related-info__box-vod-services">
  <div class="c2-list-vod__content-header-text-title">U-NEXT</div><div class="c2-list-vod__content-header-text-title">DMM TV</div></div></div>
<div class="p-mark-histogram__total-count">{count}件のレビュー</div>
<div class="p-mark"><div class="c-rating__score">3.1</div><div class="p-mark-review">伏線の回収がすごい。考察がはかどる。神作画</div></div>
<div class="p-mark"><div class="c-rating__score">2.0</div><div class="p-mark-review">絶望と復讐。救いがない</div></div>
</body></html>'''

DETAIL_WITH_LD_IMAGE = DETAIL.replace(
    '"outline":"description"}}],"@type":"{kind}"',
    '"outline":"description"}}],"image":{{"@type":"ImageObject","url":"https://img.example/poster/{n}.jpg"}},"@type":"{kind}"')


class Resp:
    def __init__(self, text='', status=200, js=None):
        self.content = text.encode()
        self.status_code = status
        self.encoding = 'utf-8'
        self._js = js

    def json(self):
        return self._js

    def raise_for_status(self):
        if self.status_code >= 400:
            raise RuntimeError(self.status_code)


class FakeFilmarks:
    """robots.txt → sitemap index → sitemap → 作品ページ を返す"""

    def __init__(self, robots='User-agent: *\nAllow: /\nSitemap: https://filmarks.com/sitemap_index.xml\n'):
        self.headers = {}
        self.asked = []
        self.robots = robots

    def get(self, url, timeout=None):
        self.asked.append(url)
        if 'api.scrape.do' in url:
            url = parse_qs(urlparse(url).query)['url'][0]
        if url.endswith('/robots.txt'):
            return Resp(self.robots)
        if url.endswith('sitemap_index.xml'):
            return Resp('<sitemapindex><sitemap><loc>https://filmarks.com/sitemap_movies.xml</loc></sitemap>'
                        '<sitemap><loc>https://filmarks.com/sitemap_animes.xml</loc></sitemap></sitemapindex>')
        if url.endswith('sitemap_animes.xml'):
            return Resp('<urlset><url><loc>https://filmarks.com/animes/10/20</loc></url>'
                        '<url><loc>https://filmarks.com/animes/11/21</loc></url>'
                        '<url><loc>https://filmarks.com/movies/1</loc></url></urlset>')
        if url.endswith('sitemap_movies.xml'):
            return Resp('<urlset><url><loc>https://filmarks.com/movies/2</loc></url></urlset>')
        if '/search/animes?q=' in url:
            return Resp('<a href="/animes/10/20?mark_id=1">進撃の巨人</a><a href="/animes/11/21">x</a>')
        if url.endswith('/animes/10/20'):
            return Resp(DETAIL.format(n=10, title='進撃の巨人', score='4.3', count='123456', year=2013, kind='TVSeason',
                                      syn='壁の外の巨人と戦う。人類は壁の中で暮らしていた。', studio='WIT STUDIO', minutes=24))
        if url.endswith('/animes/11/21'):
            return Resp(DETAIL.format(n=11, title='まだ知らないアニメ', score='3.8', count='900', year=2024, kind='Movie',
                                      syn='東京の高校に通う少年が、ある事件の真相を追う。', studio='どこか', minutes=5))
        return Resp('', 404)


class FastFetcher(b.Fetcher):
    MIN_SLEEP = 0


class FilmarksTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()

    def tearDown(self):
        self.tmp.cleanup()

    def fetcher(self, session, token=None):
        return FastFetcher(sleep=0, scrapedo_token=token, cache=self.tmp.name, session=session)

    @property
    def store(self):
        return Path(self.tmp.name) / 'store.jsonl'

    def crawl(self, session, **kw):
        return b.fetch_filmarks(self.fetcher(session, kw.pop('token', None)), store=self.store, **kw)

    def test_sitemap_to_details(self):
        s = FakeFilmarks()
        got = self.crawl(s)
        self.assertEqual([g['title'] for g in got], ['進撃の巨人', 'まだ知らないアニメ'])
        a = got[0]
        self.assertEqual((a['score'], a['reviews'], a['year'], a['series']), (4.3, 123456, 2013, 10),
                         '作品の★（レビューした人の★ 3.1 ではない）・レビュー数・年')
        self.assertEqual(a['synopsis'], '壁の外の巨人と戦う。人類は壁の中で暮らしていた。', '見出しの「あらすじ」ではなく本文')
        self.assertEqual((a['media'], a['studios'], a['minutes']), ('TV', ['WIT STUDIO'], 24))
        self.assertEqual(got[1]['media'], 'MOVIE')
        works = {w['t']: w for w in b.finish(b.merge([], [], got))}
        self.assertIn('short', works['まだ知らないアニメ']['f'], '1 話 10 分以下はショート')
        self.assertNotIn('short', works['進撃の巨人']['f'])
        self.assertGreater(works['進撃の巨人']['p'], 0.9, 'レビュー数 12 万 → 人気が高い')
        self.assertEqual(a['vod'], ['unext', 'dmmtv'])
        self.assertFalse(any('movies' in u for u in s.asked), '映画の sitemap にも頁にも行かない')
        self.assertEqual(a['image'], 'https://img.example/10.jpg', 'JSON-LD に image が無ければ og:image に戻す')

    def test_image_prefers_json_ld_over_og_image(self):
        # og:image は SNS 用の 240x240 正方形サムネで、ポスターが正方形でない
        # 作品は余白に Filmarks のロゴが入る。JSON-LD の image（元の比率）が
        # あればロゴの入らないそちらを使う
        html = DETAIL_WITH_LD_IMAGE.format(n=10, title='進撃の巨人', score='4.3', count='123456', year=2013,
                                            kind='TVSeason', syn='壁の外の巨人と戦う。人類は壁の中で暮らしていた。',
                                            studio='WIT STUDIO', minutes=24)
        got = b.parse_filmarks(html, 'https://filmarks.com/animes/10/20')
        self.assertEqual(got['image'], 'https://img.example/poster/10.jpg',
                          'ロゴ入りの og:image ではなく、比率そのままの JSON-LD image を使う')

    def test_direct_even_with_token_when_not_blocked(self):
        s = FakeFilmarks()
        self.crawl(s, token='TKN')
        self.assertTrue(s.asked)
        self.assertFalse(any('api.scrape.do' in u for u in s.asked), 'ブロックされていなければ直接取りに行く')

    def test_falls_back_to_scrapedo_when_blocked(self):
        class Blocked(FakeFilmarks):
            def get(self, url, timeout=None):
                if url.endswith('/animes/10/20'):  # scrape.do 経由なら endswith にならない
                    self.asked.append(url)
                    return Resp('', 403)
                return super().get(url, timeout)
        s = Blocked()
        b_sleep = b.time.sleep
        b.time.sleep = lambda x: None
        try:
            got = self.crawl(s, token='TKN')
        finally:
            b.time.sleep = b_sleep
        self.assertEqual([g['title'] for g in got], ['進撃の巨人', 'まだ知らないアニメ'],
                         '直接がブロックされても scrape.do に切り替えて取り切る')
        self.assertTrue(any('api.scrape.do' in u for u in s.asked), '403 が続いたら scrape.do に切り替える')
        self.assertEqual(sum(1 for u in s.asked if u.endswith('/animes/10/20')), 3, '3 回だけ直接を試す')

    def test_robots_disallow_stops(self):
        s = FakeFilmarks(robots='User-agent: *\nDisallow: /\n')
        self.assertEqual(self.crawl(s), [])
        self.assertEqual(len(s.asked), 1, 'robots.txt 以外は取りに行かない')

    def test_robots_unreadable_stops(self):
        class Down(FakeFilmarks):
            def get(self, url, timeout=None):
                self.asked.append(url)
                raise ConnectionError('proxy')
        s = Down()
        self.assertEqual(self.crawl(s), [])
        self.assertEqual(len(s.asked), 1)

    def test_cache_resumes(self):
        s = FakeFilmarks()
        self.crawl(s)
        first = len(s.asked)
        s2 = FakeFilmarks()
        self.crawl(s2)
        self.assertLess(len(s2.asked), first, '2 回目は取ったページを使い回す')
        self.assertFalse(any('/animes/' in u for u in s2.asked))

    def test_store_and_skip(self):
        self.crawl(FakeFilmarks())
        stored = b.load_store(self.store)
        self.assertEqual(len(stored), 2, '1 作取るごとに store に残る')
        rec = stored['https://filmarks.com/animes/10/20']
        self.assertNotIn('review_text', rec, 'レビュー本文そのものは残さない')
        self.assertGreater(rec['counts'].get('伏線', 0), 0, '言葉の数は残す')
        s = FakeFilmarks()
        got = self.crawl(s, skip=frozenset(stored))
        self.assertEqual(got, [], '取ったことのある作品は飛ばす')
        self.assertFalse(any('/animes/' in u for u in s.asked))

    def test_refresh_bypasses_cache(self):
        self.crawl(FakeFilmarks())
        stored = b.load_store(self.store)
        s = FakeFilmarks()
        got = self.crawl(s, skip=frozenset(stored), extra=['https://filmarks.com/animes/10/20'])
        self.assertEqual([g['title'] for g in got], ['進撃の巨人'])
        self.assertIn('https://filmarks.com/animes/10/20', s.asked, '取り直しは .cache を使わない')

    def test_stop_keeps_what_was_taken(self):
        class Dies(FakeFilmarks):
            def get(self, url, timeout=None):
                if url.endswith('/animes/11/21'):
                    return Resp('', 429)
                return super().get(url, timeout)
        b_sleep = b.time.sleep
        b.time.sleep = lambda x: None
        try:
            self.crawl(Dies())
        finally:
            b.time.sleep = b_sleep
        self.assertEqual(list(b.load_store(self.store)), ['https://filmarks.com/animes/10/20'],
                         '429 で止まっても、それまでの分は残る')

    def test_probe_by_title(self):
        f = self.fetcher(FakeFilmarks())
        self.assertEqual(b.find_filmarks_url(f, '進撃の巨人'), 'https://filmarks.com/animes/10/20')

    def test_min_sleep(self):
        self.assertEqual(b.Fetcher(sleep=0.1, session=FakeFilmarks()).sleep, 1.5)


class AnnictTest(unittest.TestCase):
    def test_pages_and_seasons(self):
        calls = []

        class S:
            def post(self, url, headers=None, json=None, timeout=None):
                calls.append(json['variables'])
                self.auth = headers['Authorization']
                season, after = json['variables']['seasons'][0], json['variables']['after']
                if season == '2024-spring' and after is None:
                    nodes = [{'annictId': 1, 'title': 'A', 'seasonYear': 2024, 'media': 'TV',
                              'watchersCount': 5000, 'reviewsCount': 3, 'image': {'recommendedImageUrl': 'x'}},
                             {'annictId': 9, 'title': 'CM', 'seasonYear': 2024, 'media': 'OTHER',
                              'watchersCount': 1, 'reviewsCount': 0, 'image': None}]
                    return Resp(js={'data': {'searchWorks': {'pageInfo': {'hasNextPage': True, 'endCursor': 'c1'},
                                                             'nodes': nodes}}})
                if season == '2024-spring':
                    nodes = [{'annictId': 2, 'title': 'B', 'seasonYear': 2024, 'media': 'MOVIE',
                              'watchersCount': 10, 'reviewsCount': 0, 'image': None}]
                    return Resp(js={'data': {'searchWorks': {'pageInfo': {'hasNextPage': False, 'endCursor': None},
                                                             'nodes': nodes}}})
                return Resp(js={'data': {'searchWorks': {'pageInfo': {'hasNextPage': False}, 'nodes': []}}})

        s = S()
        got = b.fetch_annict('TOKEN', since=2024, until=2024, session=s, sleep=0)
        self.assertEqual([g['title'] for g in got], ['A', 'B'], 'OTHER（CM など）は落とす')
        self.assertEqual(s.auth, 'Bearer TOKEN')
        self.assertEqual(len(calls), 5, '4 シーズン + 2 頁目')


class AnnictReviewsTest(unittest.TestCase):
    BODY = '伏線の回収が見事で考察がはかどる。絶望的な展開、復讐。作画も神作画'

    def session(self):
        test = self

        class S:
            def __init__(self):
                self.calls = []

            def post(self, url, headers=None, json=None, timeout=None):
                ids = json['variables']['ids']
                self.calls.append(ids)
                test.assertIn('reviews(first:', json['query'])
                nodes = [{'annictId': i, 'reviews': {'nodes': [{'body': test.BODY}, {'body': ''}]}}
                         for i in ids if i != 3]   # 3 は返ってこない作品
                return Resp(js={'data': {'searchWorks': {'nodes': nodes}}})
        return S()

    def test_counts_only_and_resume(self):
        works = [{'annict_id': i, 'title': f'w{i}', 'watchers': 1000 - i} for i in range(1, 6)]
        works.append({'annict_id': 99, 'title': 'マイナー', 'watchers': 2})
        with tempfile.TemporaryDirectory() as t:
            store = Path(t) / 'rev.jsonl'
            s = self.session()
            b.fetch_annict_reviews('T', works, store=store, session=s, batch=2, sleep=0)
            self.assertEqual(s.calls, [[1, 2], [3, 4], [5]], '人気順に 2 作ずつ。見ている人が少ない作品は飛ばす')
            text = store.read_text(encoding='utf-8')
            self.assertNotIn('回収が見事', text, 'レビュー本文そのものは残さない')
            rows = b.load_store(store)
            self.assertEqual(rows[1]['n'], 1, '空のレビューは数えない')
            self.assertGreater(rows[1]['counts']['伏線'], 0)
            self.assertEqual(rows[3]['counts'], {}, '返ってこなかった作品にも印を残す')
            s2 = self.session()
            b.fetch_annict_reviews('T', works, store=store, session=s2, batch=2, sleep=0)
            self.assertEqual(s2.calls, [], '2 回目は取ってある作品を飛ばす')

    def test_annict_only_work_becomes_usable(self):
        with tempfile.TemporaryDirectory() as t:
            store = Path(t) / 'rev.jsonl'
            works = [{'annict_id': 1, 'title': 'Annict にしか無い作品', 'year': 2024, 'media': 'TV',
                      'watchers': 5000, 'sources': ['annict']}]
            b.fetch_annict_reviews('T', works, store=store, session=self.session(), sleep=0)
            before = b.finish(b.merge([], [dict(w) for w in works], []))[0]
            after = b.finish(b.merge([], b.attach_annict_reviews([dict(w) for w in works], store), []))[0]
            self.assertLess(before['i'], 0.25, 'タイトルだけでは手がかり不足')
            self.assertGreaterEqual(after['i'], 0.25, 'レビューの言葉で診断に使えるようになる')
            self.assertGreater(after['v'][2], 0, '伏線・考察 → C 側')
            self.assertGreater(after['v'][1], 0, '絶望・復讐 → D 側')

    def test_counts_add_up_across_sources(self):
        an = [{'title': 'X', 'year': 2020, 'counts': {'伏線': 2}, 'sources': ['annict']}]
        fm = [{'title': 'X', 'year': 2020, 'counts': {'伏線': 3, '作画神': 1}, 'sources': ['filmarks']}]
        row = b.merge([], an, fm)[0]
        self.assertEqual(row['counts'], {'伏線': 5, '作画神': 1})


class WordsTest(unittest.TestCase):
    def test_negative_phrases_are_not_counted(self):
        self.assertEqual(b.text_tags('作画崩壊がひどい。紙芝居だった。泣けなかった。伏線が回収されないまま'), {})

    def test_no_double_count(self):
        self.assertEqual(b.text_tags('神作画')['作画神'], 1, '「神作画」を「作画」と二重に数えない')

    def test_studio_boost(self):
        self.assertGreater(b.studio_boost(['京都アニメーション']), 0.3)
        self.assertEqual(b.studio_boost(['知らない会社']), 0)
        rows = b.merge([], [{'title': 'A', 'year': 2020, 'studios': ['ufotable'], 'counts': {'バトル': 5},
                             'sources': ['annict']},
                            {'title': 'B', 'year': 2020, 'counts': {'バトル': 5}, 'sources': ['annict']}], [])
        a, bb = sorted(b.finish(rows), key=lambda w: w['t'])
        self.assertGreater(a['v'][4], bb['v'][4], '映像に定評のあるスタジオの作品は V が上がる')

    def test_annict_reviews_keep_studios(self):
        class S:
            def post(self, url, headers=None, json=None, timeout=None):
                assert 'staffs(first:' in json['query']
                return Resp(js={'data': {'searchWorks': {'nodes': [{
                    'annictId': 1, 'reviews': {'nodes': []},
                    'staffs': {'nodes': [{'name': '京都アニメーション', 'roleText': 'アニメーション制作'},
                                         {'name': '誰か', 'roleText': '監督'}]}}]}}})
        with tempfile.TemporaryDirectory() as t:
            store = Path(t) / 'r.jsonl'
            b.fetch_annict_reviews('T', [{'annict_id': 1, 'watchers': 100}], store=store, session=S(), sleep=0)
            self.assertEqual(b.load_store(store)[1]['studios'], ['京都アニメーション'], '制作会社だけ残す')


class MovieTest(unittest.TestCase):
    def test_series_movies_are_dropped(self):
        rows = [{'title': t, 'media': m} for t, m in [
            ('ドラえもん', 'TV'), ('映画ドラえもん のび太の恐竜', 'MOVIE'), ('名探偵コナン', 'TV'),
            ('名探偵コナン 緋色の弾丸', 'MOVIE'), ('君の名は。', 'MOVIE'), ('銀河鉄道999', 'TV'),
            ('銀河鉄道の夜', 'MOVIE'), ('ONE PIECE', 'TV'), ('ONE PUNCH MAN', 'TV'), ('ONE PIECE FILM RED', 'MOVIE'),
            ('劇場版 ヴァイオレット・エヴァーガーデン', 'MOVIE')]]
        keep, dropped = b.drop_series_movies(rows)
        self.assertEqual([r['title'] for r in keep if r['media'] == 'MOVIE'], ['君の名は。', '銀河鉄道の夜'])
        self.assertEqual(len(dropped), 4)
        self.assertTrue(all(r['media'] == 'TV' for r in keep if r['title'] in ('ドラえもん', '名探偵コナン')),
                        'TV シリーズそのものは残す')


class EnvTest(unittest.TestCase):
    def test_dotenv(self):
        import os
        with tempfile.TemporaryDirectory() as t:
            f = Path(t) / '.env'
            f.write_text('\ufeff# コメント\nSCRAPEDO_TOKEN = "abc123"\nexport ANNICT_TOKEN=xyz\nEMPTY=\n', encoding='utf-8')
            for k in ('SCRAPEDO_TOKEN', 'ANNICT_TOKEN'):
                os.environ.pop(k, None)
            os.environ['ANNICT_TOKEN'] = 'already'
            try:
                got = b.load_dotenv(f)
                self.assertEqual(got, ['SCRAPEDO_TOKEN'])
                self.assertEqual(os.environ['SCRAPEDO_TOKEN'], 'abc123', '引用符と空白を外す')
                self.assertEqual(os.environ['ANNICT_TOKEN'], 'already', '入っている値は上書きしない')
            finally:
                os.environ.pop('SCRAPEDO_TOKEN', None)
                os.environ.pop('ANNICT_TOKEN', None)

    def test_check_env_never_prints_token(self):
        import io, os, contextlib
        os.environ['ANNICT_TOKEN'] = 'SECRET-TOKEN-1234'
        os.environ['SCRAPEDO_TOKEN'] = 'SCRAPE-SECRET-9999'

        class S:
            def post(self, *a, **k):
                return Resp(js={'data': {'viewer': {'username': 'koshin'}}})
        out = io.StringIO()
        try:
            with contextlib.redirect_stdout(out):
                self.assertTrue(b.check_env(S()))
        finally:
            os.environ.pop('ANNICT_TOKEN'); os.environ.pop('SCRAPEDO_TOKEN')
        text = out.getvalue()
        self.assertNotIn('SECRET-TOKEN', text)
        self.assertNotIn('SCRAPE-SECRET', text)
        self.assertIn('koshin', text)


class MergeTest(unittest.TestCase):
    def test_defaults_are_500_with_known_tags(self):
        d = b.load_defaults()
        self.assertGreaterEqual(len(d), 500)

    def test_merge_and_finish(self):
        d = [x for x in b.load_defaults() if x['title'] == '進撃の巨人']
        an = [{'title': '進撃の巨人', 'year': 2013, 'media': 'TV', 'watchers': 20000, 'annict_id': 7,
               'image': 'https://an.example/a.jpg', 'sources': ['annict']}]
        fm = [{'title': '進撃の巨人', 'year': 2013, 'score': 4.3, 'reviews': 100000, 'synopsis': 's',
               'counts': {}, 'vod': ['unext'], 'image': 'https://fm.example/f.jpg', 'filmarks_url': 'https://filmarks.com/animes/1/2',
               'series': 1, 'sources': ['filmarks']},
              {'title': '知らない作品', 'year': 2020, 'score': 3.5, 'reviews': 10,
               'synopsis': '異世界に転生した少年が魔王を倒す冒険。爆笑のギャグ', 'counts': {'爽快': 3, 'ギャグ': 2},
               'vod': [], 'image': None, 'filmarks_url': 'https://filmarks.com/animes/3/4', 'series': 3,
               'sources': ['filmarks']},
              {'title': '手がかり無し', 'year': 2020, 'synopsis': '', 'sources': ['filmarks']}]
        works = b.finish(b.merge(d, an, fm))
        self.assertEqual(len(works), 3)
        shingeki = next(w for w in works if w['t'] == '進撃の巨人')
        self.assertEqual((shingeki['s'], shingeki['an'], shingeki['src']), (4.3, 7, 'adf'))
        self.assertEqual(shingeki['img'], 'https://an.example/a.jpg', 'Annict の画像が Filmarks より優先される')
        other = next(w for w in works if w['t'] == '知らない作品')
        self.assertEqual(other['img'], None, 'Annict に画像が無ければ Filmarks（image: None）のまま')
        self.assertLess(other['v'][0], 0, '異世界・転生・魔王 → F 側')
        self.assertLess(other['v'][1], 0, 'ギャグ・爽快 → H 側')
        empty = next(w for w in works if w['t'] == '手がかり無し')
        self.assertEqual(empty['i'], 0)

    def test_image_falls_back_to_filmarks_when_annict_has_none(self):
        an = [{'title': 'まだ知らないアニメ', 'year': 2024, 'media': 'TV', 'watchers': 100,
               'annict_id': 99, 'image': None, 'sources': ['annict']}]
        fm = [{'title': 'まだ知らないアニメ', 'year': 2024, 'score': 3.8, 'reviews': 900,
               'synopsis': 's', 'counts': {}, 'vod': [], 'image': 'https://fm.example/f2.jpg',
               'filmarks_url': 'https://filmarks.com/animes/11/21', 'series': 11, 'sources': ['filmarks']}]
        works = b.finish(b.merge([], an, fm))
        w = next(x for x in works if x['t'] == 'まだ知らないアニメ')
        self.assertEqual(w['img'], 'https://fm.example/f2.jpg', 'Annict に画像が無ければ Filmarks で補う')

    def test_image_http_is_rejected_in_favor_of_filmarks_https(self):
        # アルプスの少女ハイジで実際に踏んだやつ: Annict の画像が http（証明書の無い
        # 公式サイトなど）だと、https のページからは混在コンテンツでブロックされて出ない
        an = [{'title': 'ハイジもどき', 'year': 2024, 'media': 'TV', 'watchers': 100,
               'annict_id': 100, 'image': 'http://old-site.example/thumb.png', 'sources': ['annict']}]
        fm = [{'title': 'ハイジもどき', 'year': 2024, 'score': 4.0, 'reviews': 500,
               'synopsis': 's', 'counts': {}, 'vod': [], 'image': 'https://fm.example/heidi.jpg',
               'filmarks_url': 'https://filmarks.com/animes/12/22', 'series': 12, 'sources': ['filmarks']}]
        works = b.finish(b.merge([], an, fm))
        w = next(x for x in works if x['t'] == 'ハイジもどき')
        self.assertEqual(w['img'], 'https://fm.example/heidi.jpg', 'http の画像は弾いて、Filmarks の https を使う')

    def test_cli_default_only(self):
        with tempfile.TemporaryDirectory() as t:
            out = Path(t) / 'db.json'
            saved = (b.FILMARKS_STORE, b.ANNICT_STORE)
            b.FILMARKS_STORE, b.ANNICT_STORE = Path(t) / 'f.jsonl', Path(t) / 'a.jsonl'
            try:
                b.main(['--out', str(out)])
            finally:
                b.FILMARKS_STORE, b.ANNICT_STORE = saved
            data = json.loads(out.read_text())
            self.assertGreaterEqual(data['meta']['count'], 500)
            self.assertEqual(len(data['works'][0]['v']), 6)


if __name__ == '__main__':
    unittest.main()
