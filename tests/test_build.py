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
<meta property="og:image" content="https://img.example/{n}.jpg">
<script type="application/ld+json">{{"name":"{title}","aggregateRating":{{"ratingValue":"{score}","ratingCount":"{count}"}},"dateCreated":"{year}-04-01"}}</script>
</head><body>
<div class="p-content-detail__synopsis-desc">{syn}</div>
<div class="p-mark__review">伏線の回収がすごい。考察がはかどる。作画も神作画</div>
<div class="p-mark__review">絶望と復讐。救いがない</div>
<div class="p-content-detail-related-info"><img alt="U-NEXT"><img alt="DMM TV"></div>
</body></html>'''


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
        if url.endswith('/animes/10/20'):
            return Resp(DETAIL.format(n=10, title='進撃の巨人', score='4.3', count='123,456', year=2013,
                                      syn='壁の外の巨人と戦う。'))
        if url.endswith('/animes/11/21'):
            return Resp(DETAIL.format(n=11, title='まだ知らないアニメ', score='3.8', count='900', year=2024,
                                      syn='東京の高校に通う少年が、ある事件の真相を追う。'))
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

    def test_sitemap_to_details(self):
        s = FakeFilmarks()
        got = b.fetch_filmarks(self.fetcher(s))
        self.assertEqual([g['title'] for g in got], ['進撃の巨人', 'まだ知らないアニメ'])
        a = got[0]
        self.assertEqual((a['score'], a['reviews'], a['year'], a['series']), (4.3, 123456, 2013, 10))
        self.assertEqual(a['vod'], ['unext', 'dmmtv'])
        self.assertFalse(any('movies' in u for u in s.asked), '映画の sitemap にも頁にも行かない')

    def test_scrapedo_wraps_every_request(self):
        s = FakeFilmarks()
        b.fetch_filmarks(self.fetcher(s, token='TKN'))
        self.assertTrue(s.asked)
        for u in s.asked:
            q = parse_qs(urlparse(u).query)
            self.assertTrue(u.startswith('https://api.scrape.do/?'), u)
            self.assertEqual(q['token'], ['TKN'])
        self.assertIn('https://filmarks.com/robots.txt', [parse_qs(urlparse(u).query)['url'][0] for u in s.asked])

    def test_robots_disallow_stops(self):
        s = FakeFilmarks(robots='User-agent: *\nDisallow: /\n')
        self.assertEqual(b.fetch_filmarks(self.fetcher(s)), [])
        self.assertEqual(len(s.asked), 1, 'robots.txt 以外は取りに行かない')

    def test_robots_unreadable_stops(self):
        class Down(FakeFilmarks):
            def get(self, url, timeout=None):
                self.asked.append(url)
                raise ConnectionError('proxy')
        s = Down()
        self.assertEqual(b.fetch_filmarks(self.fetcher(s)), [])
        self.assertEqual(len(s.asked), 1)

    def test_cache_resumes(self):
        s = FakeFilmarks()
        f = self.fetcher(s)
        b.fetch_filmarks(f)
        first = len(s.asked)
        s2 = FakeFilmarks()
        b.fetch_filmarks(self.fetcher(s2))
        self.assertLess(len(s2.asked), first, '2 回目は取ったページを使い回す')
        self.assertFalse(any('/animes/' in u for u in s2.asked))

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


class MergeTest(unittest.TestCase):
    def test_defaults_are_500_with_known_tags(self):
        d = b.load_defaults()
        self.assertGreaterEqual(len(d), 500)

    def test_merge_and_finish(self):
        d = [x for x in b.load_defaults() if x['title'] == '進撃の巨人']
        an = [{'title': '進撃の巨人', 'year': 2013, 'media': 'TV', 'watchers': 20000, 'annict_id': 7,
               'image': 'an.jpg', 'sources': ['annict']}]
        fm = [{'title': '進撃の巨人', 'year': 2013, 'score': 4.3, 'reviews': 100000, 'synopsis': 's',
               'review_text': '', 'vod': ['unext'], 'image': 'fm.jpg', 'filmarks_url': 'https://filmarks.com/animes/1/2',
               'series': 1, 'sources': ['filmarks']},
              {'title': '知らない作品', 'year': 2020, 'score': 3.5, 'reviews': 10,
               'synopsis': '異世界に転生した少年が魔王を倒す冒険。爆笑のギャグ', 'review_text': '笑った 爽快',
               'vod': [], 'image': None, 'filmarks_url': 'https://filmarks.com/animes/3/4', 'series': 3,
               'sources': ['filmarks']},
              {'title': '手がかり無し', 'year': 2020, 'synopsis': '', 'review_text': '', 'sources': ['filmarks']}]
        works = b.finish(b.merge(d, an, fm))
        self.assertEqual(len(works), 3)
        shingeki = next(w for w in works if w['t'] == '進撃の巨人')
        self.assertEqual((shingeki['s'], shingeki['an'], shingeki['src']), (4.3, 7, 'adf'))
        self.assertEqual(shingeki['img'], 'fm.jpg')
        other = next(w for w in works if w['t'] == '知らない作品')
        self.assertLess(other['v'][0], 0, '異世界・転生・魔王 → F 側')
        self.assertLess(other['v'][1], 0, 'ギャグ・爽快 → H 側')
        empty = next(w for w in works if w['t'] == '手がかり無し')
        self.assertEqual(empty['i'], 0)

    def test_cli_default_only(self):
        with tempfile.TemporaryDirectory() as t:
            out = Path(t) / 'db.json'
            b.main(['--out', str(out)])
            data = json.loads(out.read_text())
            self.assertGreaterEqual(data['meta']['count'], 500)
            self.assertEqual(len(data['works'][0]['v']), 6)


if __name__ == '__main__':
    unittest.main()
