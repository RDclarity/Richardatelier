#!/usr/bin/env python3
"""Qualitätsprüfung der Magazin-Quelltexte (content/magazin/<lang>/*.md).
Aufruf: python3 tools/check_magazin.py [de|en|it|es]
"""
import os, re, sys, json

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CONTENT = os.path.join(ROOT, "content", "magazin")
topics = json.load(open(os.path.join(CONTENT, "topics.json"), encoding="utf-8"))
slugs = {t["slug"]: t for t in topics["topics"]}
SERVICE_OK = {"/einbaukuechen/", "/badezimmer/", "/badrenovierung/", "/einbauschraenke/", "/referenzen/", "/team/", "/gastronomie/", "/termin/", "/lokal-einrichten/", "/karriere/", "/datenschutz/", "/impressum/", "/lieferanten/", "/"}
HEADS = {
    "de": ("Kurz gesagt", "Häufige Fragen", "Wie es weitergeht", "Weiterlesen"),
    "en": ("In short", "Frequently asked questions", "What happens next", "Read next"),
    "it": ("In breve", "Domande frequenti", "Come si prosegue", "Da leggere"),
    "es": ("En resumen", "Preguntas frecuentes", "Cómo continuar", "Lea también"),
}
FORBIDDEN = [r"€", r"\b[Ee]uros?\b", r"\bEUR\b", r"\b(Honorar|fee|onorario|honorarios?)\b[^.\n]{0,60}\d+\s?(%|Prozent|percent|per cent|per cento|por ciento)", r"SERVICE\s?&\s?MORE", r"Einkaufsverband",
    r"\b(Rimadesio|Minotti|Dada|Molteni|Aran|Cesar|Lema|Flos|BORA|Antoniolupi|Agape|Falper|Gessi|Fantini|Poliform|Boffi|Flexform|B&B Italia|Cassina|Artemide|Foscarini|Florim|Mutina|Salvatori)\b",
    r"\bLaufen\b(?! Sie)", r"\+43\s?660", r"\b\d[.,]\d\s?/\s?5\b", r"Sterne?bewertung", r"\d+\s+(Bewertungen|reviews|recensioni|reseñas)", r"★", r"\bTODO\b", r"\bLorem\b", r"\[\.\.\.\]"]

def fm(text):
    m = re.match(r"^﻿?---\s*\n(.*?)\n---\s*\n(.*)$", text, re.S)
    if not m: return None, text
    meta = {}
    for line in m.group(1).splitlines():
        k, _, v = line.partition(":"); meta[k.strip()] = v.strip()
    return meta, m.group(2)

def check(lang):
    d = os.path.join(CONTENT, lang)
    files = sorted(f for f in os.listdir(d) if f.endswith(".md")) if os.path.isdir(d) else []
    de_dir = os.path.join(CONTENT, "de")
    issues, ok = [], 0
    present = set()
    for f in files:
        p = os.path.join(d, f); s = open(p, encoding="utf-8").read()
        meta, body = fm(s)
        name = f[:-3]; probs = []
        if meta is None: issues.append((f, ["kein Frontmatter"])); continue
        src = meta.get("source_slug") if lang != "de" else meta.get("slug")
        if lang == "de" and meta.get("slug") != name: probs.append(f"slug≠Dateiname ({meta.get('slug')})")
        if lang != "de" and src != name: probs.append(f"source_slug≠Dateiname ({src})")
        if name not in slugs: probs.append("Slug nicht in topics.json")
        present.add(name)
        for k in ("title", "description", "category", "cta", "keywords", "hero", "hero_alt", "date"):
            if not meta.get(k): probs.append(f"Frontmatter fehlt: {k}")
        if name in slugs and meta.get("category") != slugs[name]["cat"]: probs.append("category≠topics.json")
        if meta.get("cta") not in topics["cta_variants"]: probs.append(f"cta ungültig: {meta.get('cta')}")
        if meta.get("hero") and not os.path.exists(os.path.join(ROOT, "assets", "img", meta["hero"])): probs.append(f"hero fehlt: {meta['hero']}")
        dl = len(meta.get("description", ""))
        if not (110 <= dl <= 170): probs.append(f"description {dl} Zeichen")
        words = len(re.findall(r"\w+", body))
        if lang == "de" and words < 1500: probs.append(f"nur {words} Wörter")
        if lang != "de" and words < 1100: probs.append(f"nur {words} Wörter")
        h1 = re.findall(r"^# ", body, re.M)
        if len(h1) != 1: probs.append(f"{len(h1)} H1")
        h2 = re.findall(r"^## (.*)$", body, re.M)
        if len(h2) < 5: probs.append(f"nur {len(h2)} H2")
        summ, faq, nxt, more = HEADS[lang]
        if not re.search(r"\*\*" + re.escape(summ), body): probs.append(f"'{summ}' fehlt")
        if not any(h.strip().lower().startswith(faq.lower()) for h in h2): probs.append(f"'{faq}' fehlt")
        if not any(h.strip().lower().startswith(nxt.lower()) for h in h2): probs.append(f"'{nxt}' fehlt")
        if more.lower() not in body.lower(): probs.append(f"'{more}' fehlt")
        # FAQ-Fragen zählen
        fi = next((i for i, h in enumerate(h2) if h.strip().lower().startswith(faq.lower())), None)
        if fi is not None:
            sec = body.split("\n## ")[fi + 1] if fi + 1 < len(body.split("\n## ")) else ""
            nq = len(re.findall(r"^### ", sec, re.M))
            if nq < 4: probs.append(f"FAQ nur {nq} Fragen")
        links = re.findall(r"\]\(([^)\s]+)\)", body)
        internal = [l for l in links if l.startswith("/magazin/")]
        bad = [l for l in internal if re.sub(r"^/magazin/|/?(#.*)?$", "", l) not in slugs]
        if bad: probs.append(f"ungültige Artikel-Links: {bad[:3]}")
        if lang == "de" and len(set(internal)) < 5: probs.append(f"nur {len(set(internal))} Artikel-Links")
        svc = [l for l in links if l.startswith("/") and not l.startswith("/magazin/")]
        badsvc = [l for l in svc if l.split("#")[0] not in SERVICE_OK]
        if badsvc: probs.append(f"unbekannte interne Links: {badsvc[:3]}")
        ext = [l for l in links if l.startswith("http")]
        if ext: probs.append(f"externe Links: {ext[:2]}")
        for m in re.finditer(r"\\b\\d{1,3}[.,]\\d{3}\\b", body):
            ctx = body[m.end():m.end()+40].lower()
            if not re.search(r"kelvin|\\bk\\b|lux|lumen|\\blm\\b|mm\\b", ctx):
                probs.append("grosse Zahl ohne Einheit (Preis?): " + body[max(0,m.start()-25):m.end()+25].replace("\\n"," "))
        for pat in FORBIDDEN:
            flags = re.I if pat.startswith(r"\+43") or "Bewertung" in pat or "reviews" in pat else 0
            if re.search(pat, s, flags): probs.append(f"verboten: /{pat}/")
        if "<" in body and re.search(r"<[a-z]+[^>]*>", body): probs.append("HTML im Text")
        if "…" in body and body.count("…") > 6: probs.append(f"{body.count('…')}× Auslassungszeichen")
        if lang != "de":
            dp = os.path.join(de_dir, f)
            if os.path.exists(dp):
                dmeta, dbody = fm(open(dp, encoding="utf-8").read())
                dl = re.findall(r"\]\(([^)\s]+)\)", dbody)
                if sorted(dl) != sorted(links): probs.append(f"Links weichen vom Original ab ({len(dl)} vs {len(links)})")
                if len(re.findall(r"^## ", dbody, re.M)) != len(h2): probs.append("H2-Anzahl ≠ Original")
                plain = re.sub(r"\]\([^)]*\)", "]()", body)
                hits = re.findall(r"\b(nicht|wird|werden|können|zwischen|außerdem|dafür|sondern)\b", plain)
                if len(hits) >= 3 and lang in ("en", "it", "es"):
                    probs.append(f"deutsche Wörter im Text? ({', '.join(hits[:4])})")
            else:
                probs.append("kein deutsches Original")
        if probs: issues.append((f, probs))
        else: ok += 1
    missing = [s for s in slugs if s not in present]
    print(f"[{lang}] {len(files)} Dateien, {ok} ohne Befund, {len(issues)} mit Hinweisen, {len(missing)} fehlen")
    for f, probs in issues: print("  -", f, "→", "; ".join(probs))
    if missing: print("  fehlend:", ", ".join(missing))
    return len(issues) + len(missing)

if __name__ == "__main__":
    langs = sys.argv[1:] or ["de", "en", "it", "es"]
    total = sum(check(l) for l in langs)
    sys.exit(1 if total else 0)
