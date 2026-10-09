"""AniList で引いた英語題名を data/en_titles.json にまとめる（build.mjs が dist/en-titles.json に写す）。
   使い方: python3 tools/make_en_titles.py <titles.jsonl>
   採るのは、AniList の放送年が、こちらの年と ±1 で合ったものだけ（違う作品を当てないため）。
   形: { "<作品の id>": [英語題名, AniList の番号, MAL の番号] } """
import json, sys, glob, re, os, unicodedata, difflib
args = [a for a in sys.argv[1:] if not a.startswith('--native=')]
nat = [a.split('=', 1)[1] for a in sys.argv[1:] if a.startswith('--native=')]
srcs = [f for a in args for f in glob.glob(a)]
NATIVE = json.load(open(nat[0], encoding='utf8')) if nat else None
def norm(t):
    t = unicodedata.normalize('NFKC', t).lower()
    return re.sub(r'[\s\W_]+', '', t)
def base(t):
    t = re.sub(r'[（(][^）)]*[）)]', ' ', t)
    t = re.sub(r'\s*(第?\d+期|第?[0-9]+(st|nd|rd|th)? ?(Season|シーズン)|Season ?\d+|シーズン\d+|劇場版|Part ?\d+|[0-9]+(st|nd|rd|th) Season)\s*', ' ', t)
    return re.sub(r'\s+', ' ', t).strip() or t
def plausible(r):
    """AniList 上の日本語原題（と別名）が、こちらの題名とほぼ同じか。違う作品を当てていないかの検査"""
    if NATIVE is None: return True
    n = NATIVE.get(str(r['al']))
    if n is None: return True          # 取れなかったものは、年の一致だけで採る
    a = norm(base(r['jp'])) or norm(r['jp'])
    cands = [n['native'], r.get('en') or '', r.get('ro') or ''] + list(n['syn'])
    for c in cands:
        b = norm(c)
        if not a or not b: continue
        if a in b or b in a: return True
        if difflib.SequenceMatcher(None, a, b).ratio() >= 0.6: return True
    return False
out = {}
total = ok = 0
seen = {}
for src in srcs:
    for line in open(src, encoding='utf8'):
        try: r = json.loads(line)
        except Exception: continue
        seen[r['id']] = r
fr = 0
drop = []
for r in seen.values():
    total += 1
    if r.get('al') and not plausible(r):
        drop.append((r['jp'], r.get('en') or r.get('ro'))); continue
    if not r.get('ok'):
        # 2期・3期は、AniList では最初の期の題名で当たることが多い。
        # 題名に期の印があり、AniList の年が同じかそれより前（最大15年）なら、シリーズの英語題名を使う
        y, ay = r.get('y'), r.get('ay')
        if not (r.get('al') and y and ay and 0 <= y - ay <= 15 and base(r['jp']) != r['jp']): continue
        fr += 1
    t = (r.get('en') or r.get('ro') or '').strip()
    if not t: continue
    ok += 1
    out[str(r['id'])] = [t, r.get('al'), r.get('mal')]
json.dump(out, open('data/en_titles.json', 'w', encoding='utf8'), ensure_ascii=False, separators=(',', ':'))
print(f'題名が合わず除いたもの {len(drop)}'); [print('   除く:', a, '→', b) for a, b in drop[:12]]
print(f'{ok} / {total} 作に英語題名（うちシリーズの題名で補ったもの {fr}）')
