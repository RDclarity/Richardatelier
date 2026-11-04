#!/usr/bin/env python3
"""Sitewide-Prüfung: interne Links/Assets, Titel, Canonical, hreflang-Gegenseitigkeit, Sitemap.
Aufruf: python3 tools/check_links.py
"""
import os, re, html, sys
from urllib.parse import urlparse, unquote
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SITE = "https://richardatelier.com"
SKIP_DIRS = ("/.git", "/admin", "/content", "/node_modules", "/supabase", "/tools", "/.claude")

pages = []
for dp, dn, fn in os.walk(ROOT):
    if any(x in dp for x in SKIP_DIRS): continue
    for f in fn:
        if f.endswith(".html"): pages.append(os.path.join(dp, f))
pages.sort()
broken, issues = [], []
hreflang = {}
for p in pages:
    s = open(p, encoding="utf-8", errors="replace").read()
    rel = os.path.relpath(p, ROOT)
    url = "/" + (rel[:-10] if rel.endswith("index.html") else rel)
    if not re.search(r"<title>.+</title>", s): issues.append((rel, "kein title"))
    if 'name="description"' not in s: issues.append((rel, "keine description"))
    can = re.search(r'rel="canonical" href="([^"]+)"', s)
    if can and can.group(1) != SITE + url and "noindex" not in s and rel != "404.html":
        issues.append((rel, f"canonical weicht ab: {can.group(1)}"))
    hl = dict(re.findall(r'hreflang="(\w+(?:-\w+)?)" href="([^"]+)"', s))
    hreflang[url] = hl
    for m in re.finditer(r'(?:href|src|data-src|poster)="([^"]+)"', s):
        u = html.unescape(m.group(1))
        if u.startswith(("mailto:", "tel:", "javascript:", "data:", "#")): continue
        if u.startswith(("http://", "https://")):
            if SITE in u: u = urlparse(u).path
            else: continue
        u = u.split("?")[0].split("#")[0]
        if not u: continue
        target = os.path.join(ROOT, unquote(u).lstrip("/")) if u.startswith("/") else os.path.normpath(os.path.join(os.path.dirname(p), unquote(u)))
        if os.path.isdir(target): target = os.path.join(target, "index.html")
        if not os.path.exists(target): broken.append((rel, m.group(1)))
# hreflang-Gegenseitigkeit
recip = []
for url, hl in hreflang.items():
    for lang, href in hl.items():
        if lang == "x-default": continue
        other = urlparse(href).path
        if other == url: continue
        if other in hreflang and SITE + url not in hreflang[other].values():
            recip.append((url, lang, other))
# Sitemap
sm = open(os.path.join(ROOT, "sitemap.xml"), encoding="utf-8").read()
locs = re.findall(r"<loc>(.*?)</loc>", sm)
existing = set("/" + (os.path.relpath(p, ROOT)[:-10] if p.endswith("index.html") else os.path.relpath(p, ROOT)) for p in pages)
sm_missing = [l for l in locs if urlparse(l).path not in existing]
noindex_in_sm = []
for l in locs:
    path = urlparse(l).path
    f = os.path.join(ROOT, path.lstrip("/"), "index.html")
    if os.path.exists(f) and "noindex" in open(f, encoding="utf-8", errors="replace").read(): noindex_in_sm.append(l)
print(f"Seiten: {len(pages)} | tote Links/Assets: {len(broken)} | Hinweise: {len(issues)} | hreflang nicht gegenseitig: {len(recip)} | Sitemap-URLs: {len(locs)} (fehlende Dateien: {len(sm_missing)}, noindex in Sitemap: {len(noindex_in_sm)}) | Duplikate in Sitemap: {len(locs)-len(set(locs))}")
for b in broken[:40]: print("  tot:", b)
for i in issues[:40]: print("  hinweis:", i)
for r in recip[:20]: print("  hreflang:", r)
for m in sm_missing[:20]: print("  sitemap->fehlt:", m)
for n in noindex_in_sm[:20]: print("  noindex in sitemap:", n)
sys.exit(1 if (broken or sm_missing or recip) else 0)
