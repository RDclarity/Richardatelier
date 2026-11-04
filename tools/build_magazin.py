#!/usr/bin/env python3
"""
Richard Atelier — Magazin-Generator.

Liest content/magazin/<lang>/*.md (Frontmatter + Markdown) und erzeugt:
  /magazin/<slug>/index.html, /en/journal/<slug>/, /it/rivista/<slug>/, /es/revista/<slug>/
  Übersichts- und Kategorieseiten je Sprache, RSS-Feed je Sprache,
  Sitemap-Einträge, llms.txt-Abschnitt, Menü-Links auf allen bestehenden Seiten.

Aufruf:  python3 tools/build_magazin.py            (alles bauen)
         python3 tools/build_magazin.py --check    (nur prüfen, nichts schreiben)
Keine Abhängigkeiten außer der Standardbibliothek.
"""
import json, os, re, sys, html, datetime, subprocess, math
from collections import OrderedDict

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CONTENT = os.path.join(ROOT, "content", "magazin")
SITE = "https://richardatelier.com"
TODAY = datetime.date.today().isoformat()
CHECK_ONLY = "--check" in sys.argv

ENDPOINT = "https://nbnpeoiqiakwnnkorxim.supabase.co/functions/v1/richard-atelier-contact-mail"
PHONE_DISPLAY = "+43 660 3607188"
PHONE_HREF = "tel:+436603607188"
WA_HREF = "https://wa.me/436603607188"
CSS_V = "202611051"

LANGS = ["de", "en", "it", "es"]
PREFIX = {"de": "/magazin", "en": "/en/journal", "it": "/it/rivista", "es": "/es/revista"}
HOME = {"de": "/", "en": "/en/", "it": "/it/", "es": "/es/"}
LOCALE = {"de": "de_AT", "en": "en_US", "it": "it_IT", "es": "es_ES"}
HTML_LANG = {"de": "de", "en": "en", "it": "it", "es": "es"}

# Leistungsseiten je Sprache (für Link-Umschreibung aus den DE-Texten)
SERVICE = {
    "/einbaukuechen/":  {"de": "/einbaukuechen/", "en": "/en/fitted-kitchens/", "it": "/it/cucine-su-misura/", "es": "/es/cocinas-a-medida/"},
    "/badezimmer/":     {"de": "/badezimmer/", "en": "/en/bathroom-renovation/", "it": "/it/ristrutturazione-bagno/", "es": "/es/reforma-bano/"},
    "/badrenovierung/": {"de": "/badrenovierung/", "en": "/en/bathroom-renovation/", "it": "/it/ristrutturazione-bagno/", "es": "/es/reforma-bano/"},
    "/einbauschraenke/": {"de": "/einbauschraenke/", "en": "/en/fitted-wardrobes/", "it": "/it/armadi-su-misura/", "es": "/es/armarios-a-medida/"},
    "/referenzen/":     {"de": "/referenzen/", "en": "/en/references/", "it": "/it/riferimenti/", "es": "/es/referencias/"},
    "/team/":           {"de": "/team/", "en": "/en/team/", "it": "/it/team/", "es": "/es/team/"},
    "/gastronomie/":    {"de": "/gastronomie/", "en": "/en/hospitality/", "it": "/it/commerciale/", "es": "/es/comercial/"},
    "/lokal-einrichten/": {"de": "/lokal-einrichten/", "en": "/en/hospitality/", "it": "/it/commerciale/", "es": "/es/comercial/"},
    "/termin/":         {"de": "/termin/", "en": "/termin/", "it": "/termin/", "es": "/termin/"},
    "/karriere/":       {"de": "/karriere/", "en": "/en/careers/", "it": "/it/carriera/", "es": "/es/carrera/"},
    "/datenschutz/":    {"de": "/datenschutz/", "en": "/en/privacy-policy/", "it": "/it/privacy/", "es": "/es/privacidad/"},
    "/impressum/":      {"de": "/impressum/", "en": "/en/imprint/", "it": "/it/note-legali/", "es": "/es/aviso-legal/"},
    "/danke/":          {"de": "/danke/", "en": "/en/danke/", "it": "/it/danke/", "es": "/es/danke/"},
}
MENU = {
    "de": [("/referenzen/", "Referenzen"), ("/gastronomie/", "Gewerblich"), ("/badrenovierung/", "Bad"), ("/einbaukuechen/", "Küche"), ("/einbauschraenke/", "Schrank"), ("/magazin/", "Magazin"), ("/team/", "Team"), ("/termin/", "Termin buchen"), ("/#kontakt", "Kontakt")],
    "en": [("/en/references/", "References"), ("/en/hospitality/", "Commercial"), ("/en/bathroom-renovation/", "Bath"), ("/en/fitted-kitchens/", "Kitchens"), ("/en/fitted-wardrobes/", "Wardrobes"), ("/en/journal/", "Journal"), ("/en/team/", "Team"), ("/en/#kontakt", "Contact")],
    "it": [("/it/riferimenti/", "Riferimenti"), ("/it/commerciale/", "Commerciale"), ("/it/ristrutturazione-bagno/", "Bagno"), ("/it/cucine-su-misura/", "Cucine"), ("/it/armadi-su-misura/", "Armadi"), ("/it/rivista/", "Rivista"), ("/it/team/", "Team"), ("/it/#kontakt", "Contatto")],
    "es": [("/es/referencias/", "Referencias"), ("/es/comercial/", "Comercial"), ("/es/reforma-bano/", "Baño"), ("/es/cocinas-a-medida/", "Cocinas"), ("/es/armarios-a-medida/", "Armarios"), ("/es/revista/", "Revista"), ("/es/team/", "Team"), ("/es/#kontakt", "Contacto")],
}
CAT_SLUG = {
    "de": {"gesamtkonzept": "gesamtkonzept", "uebergaenge": "raumuebergaenge", "kueche": "kueche", "bad": "bad", "wohnen": "wohnen", "material": "materialien", "marken": "design-handwerk", "licht-technik": "licht-technik", "prozess": "ablauf-kosten", "gewerbe": "gewerbe"},
    "en": {"gesamtkonzept": "whole-home-concept", "uebergaenge": "room-transitions", "kueche": "kitchen", "bad": "bathroom", "wohnen": "living", "material": "materials", "marken": "design-craft", "licht-technik": "light-technology", "prozess": "process-costs", "gewerbe": "commercial"},
    "it": {"gesamtkonzept": "progetto-completo", "uebergaenge": "passaggi-tra-ambienti", "kueche": "cucina", "bad": "bagno", "wohnen": "living", "material": "materiali", "marken": "design-artigianato", "licht-technik": "luce-tecnologia", "prozess": "processo-costi", "gewerbe": "commerciale"},
    "es": {"gesamtkonzept": "proyecto-integral", "uebergaenge": "transiciones", "kueche": "cocina", "bad": "bano", "wohnen": "estar", "material": "materiales", "marken": "diseno-oficio", "licht-technik": "luz-tecnologia", "prozess": "proceso-costes", "gewerbe": "comercial"},
}

T = {
 "de": dict(
    mag="Magazin", mag_title="Magazin: Wohnen, Küche, Bad und Gesamtkonzepte — Richard Atelier",
    mag_h1="Das Magazin: <strong>Wie möchten Sie leben?</strong>",
    mag_intro="Geschichten, Leitfäden und ehrliche Antworten zu Gesamtkonzepten, neuen Küchen, Bädern, Raumübergängen und Materialien. Geschrieben aus der Praxis eines Wiener Studios, das plant und baut.",
    mag_desc="Leitfäden und Geschichten zu Gesamtkonzept, Einbauküche, Badrenovierung, Raumübergängen und Materialien. Aus der Praxis von Richard Atelier, Wien.",
    start="Zum Einstieg", all_in="Alle Artikel in", read="Min. Lesezeit", by="Von", updated="Aktualisiert am",
    toc="Inhalt", summary_prefixes=["Kurz gesagt"], faq_heads=["Häufige Fragen", "FAQ"], next_heads=["Wie es weitergeht"],
    cta_primary="Kostenloses Erstgespräch buchen", cta_primary_href="/termin/", cta_secondary="Anfrage senden", call="Anrufen",
    phone_label="Oder direkt anrufen:",
    box_title={"gesamtkonzept": "Stellen Sie sich vor, <strong>alles passt endlich zusammen.</strong>", "kueche": "Ihre neue Küche beginnt <strong>mit einem Gespräch.</strong>", "bad": "Ihr neuer Morgen beginnt <strong>mit einem Anruf.</strong>", "uebergaenge": "Aus getrennten Zimmern wird <strong>ein Zuhause, das atmet.</strong>", "wohnen": "Dieser Raum kann <strong>viel mehr für Sie tun.</strong>", "gewerbe": "Räume, in denen <strong>Gäste und Kunden bleiben wollen.</strong>"},
    box_text="30 Minuten, kostenlos und unverbindlich. Sie erzählen uns, wie Sie leben möchten. Sie bekommen eine ehrliche erste Einschätzung und wissen danach, was bei Ihnen möglich ist und wie es weitergeht. Wiener Tischlertradition seit 1935, ein Ansprechpartner vom ersten Strich bis zur Übergabe.",
    read_label="Lesen Sie auch", related="Verwandte Artikel", prev="Vorheriger Artikel", next="Nächster Artikel", back="Zurück zum Magazin",
    form_h2="Wie möchten Sie <strong>leben?</strong> Erzählen Sie es uns.",
    form_p="Hinterlassen Sie E-Mail und Telefonnummer, das dauert keine Minute. Richard meldet sich persönlich, in der Regel innerhalb eines Werktags. Kostenlos, unverbindlich, ohne Verkaufsgespräch.",
    form_interest="Ich interessiere mich für", chips=[("wohnraum", "Private Räume"), ("gastronomie", "Gewerblich")],
    ph_email="Ihre E-Mail-Adresse", ph_phone="Ihre Telefonnummer", submit="Erstgespräch anfragen",
    msg_sending="Wird gesendet …", msg_error="Senden fehlgeschlagen. Bitte später erneut versuchen oder direkt anrufen.", msg_invalid="Bitte geben Sie E-Mail und Telefonnummer korrekt ein.",
    privacy="Mit dem Absenden stimmen Sie der Verarbeitung Ihrer Angaben zur Kontaktaufnahme zu. Details in der <a href=\"/datenschutz/\">Datenschutzerklärung</a>.",
    alt_book="Lieber gleich einen Termin wählen?", alt_book_link="Erstgespräch online buchen",
    author="Richard Dobrohruschka", crumbs_home="Richard Atelier", lang_switch="Sprache", menu_label="Hauptmenü", open_menu="Menü öffnen", brand_aria="Richard Atelier — zur Startseite",
    footer_links=[("/lieferanten/", "Lieferanten"), ("/karriere/", "Karriere"), ("/impressum/", "Impressum"), ("/datenschutz/", "Datenschutz")],
    cat_intro={
        "gesamtkonzept": "Ein Gesamtkonzept denkt Wohnung oder Haus als Ganzes: Grundriss, Licht, Material, Einbauten und Möblierung aus einer Hand. Hier lesen Sie, wie das abläuft, was es kostet und für wen es sich lohnt.",
        "uebergaenge": "Die Schwelle ist wichtiger als der Raum: Wie Küche, Essen und Wohnen zusammenwachsen, wann eine Wand fallen darf und wie Schiebetüren, Böden und Licht Räume verbinden.",
        "kueche": "Von der Kochinsel bis zur Arbeitsplatte, vom Grundriss bis zu den Elektrogeräten: alles zur neuen Einbauküche, geplant vom Kochen und Leben her.",
        "bad": "Badewanne raus, Dusche rein, Licht am Spiegel, Keramik ohne Fugen: Leitfäden zur Badrenovierung in Wien, vom Gäste-WC bis zum Wellnessbad.",
        "wohnen": "Wohnzimmer, Schlafzimmer, Ankleide, Homeoffice: Räume, die aus dem Alltag entstehen, nicht aus dem Katalog.",
        "material": "Dekton, Echtholz, Terrazzo, Keramik, Mikrozement: Was Materialien können, wie sie altern und welche nach fünf Jahren noch gut aussehen.",
        "marken": "Schiebetüren, Sofas, Leuchten, Keramik, Schranksysteme: Woran man gute Gestaltung und saubere Verarbeitung erkennt, jenseits des Namens.",
        "licht-technik": "Lichtplanung, Akustik, Smart Home, Heizen und Kühlen: Technik, die man spürt, aber nicht sieht.",
        "prozess": "Ablauf, Kosten, Zeitplan, Genehmigungen: Was Sie vor einem Projekt wissen sollten, ehrlich erklärt.",
        "gewerbe": "Gastronomie, Büro, Praxis, Boutique-Hotel: Räume, in denen Gäste und Kunden länger bleiben.",
    },
    featured=["gesamtkonzept-wohnung-was-bedeutet-das", "neue-einbaukueche-planen-wien-leitfaden", "badezimmer-renovieren-wien-leitfaden"],
    feed_title="Richard Atelier Magazin",
 ),
 "en": dict(
    mag="Journal", mag_title="Journal: Living, Kitchen, Bath and Whole-Home Concepts — Richard Atelier",
    mag_h1="The Journal: <strong>How do you want to live?</strong>",
    mag_intro="Stories, guides and honest answers on whole-home concepts, new kitchens, bathrooms, room transitions and materials. Written from the practice of a Vienna studio that plans and builds.",
    mag_desc="Guides and stories on whole-home concepts, fitted kitchens, bathroom renovation, room transitions and materials. From the practice of Richard Atelier, Vienna and New York.",
    start="Start here", all_in="All articles in", read="min read", by="By", updated="Updated",
    toc="Contents", summary_prefixes=["In short", "In brief"], faq_heads=["Frequently asked questions", "FAQ", "Common questions"], next_heads=["What happens next", "Next steps"],
    cta_primary="Book a free consultation", cta_primary_href="#anfrage", cta_secondary="Send an enquiry", call="Call",
    phone_label="Or call directly:",
    box_title={"gesamtkonzept": "Imagine <strong>everything finally fitting together.</strong>", "kueche": "Your new kitchen starts <strong>with a conversation.</strong>", "bad": "Your new morning starts <strong>with one call.</strong>", "uebergaenge": "Separate rooms become <strong>a home that breathes.</strong>", "wohnen": "This room can <strong>do far more for you.</strong>", "gewerbe": "Spaces where <strong>guests and clients want to stay.</strong>"},
    box_text="30 minutes, free and without obligation. You tell us how you want to live. You get an honest first assessment and know what is possible for you and what happens next. A Viennese joinery tradition since 1935, one contact from the first sketch to handover.",
    read_label="Read next", related="Related articles", prev="Previous article", next="Next article", back="Back to the journal",
    form_h2="How do you want <strong>to live?</strong> Tell us.",
    form_p="Leave your e-mail and phone number, it takes less than a minute. Richard gets back to you personally, usually within one working day. Free, no obligation, no sales pitch.",
    form_interest="I am interested in", chips=[("wohnraum", "Private spaces"), ("gastronomie", "Commercial")],
    ph_email="Your e-mail address", ph_phone="Your phone number", submit="Request a consultation",
    msg_sending="Sending …", msg_error="Sending failed. Please try again later or call us directly.", msg_invalid="Please enter a valid e-mail address and phone number.",
    privacy="By sending you agree that we process your details to get in touch. See our <a href=\"/en/privacy-policy/\">privacy policy</a>.",
    alt_book="Prefer to pick a time slot right away?", alt_book_link="Book online (German booking page)",
    author="Richard Dobrohruschka", crumbs_home="Richard Atelier", lang_switch="Language", menu_label="Main menu", open_menu="Open menu", brand_aria="Richard Atelier — back to home",
    footer_links=[("/en/suppliers/", "Suppliers"), ("/en/careers/", "Careers"), ("/en/imprint/", "Imprint"), ("/en/privacy-policy/", "Privacy")],
    cat_intro={
        "gesamtkonzept": "A whole-home concept treats an apartment or house as one: floor plan, light, materials, built-ins and furniture from a single source. Read how it works, what it costs and who it is for.",
        "uebergaenge": "The threshold matters more than the room: how kitchen, dining and living grow together, when a wall may come down and how sliding doors, floors and light connect spaces.",
        "kueche": "From the island to the worktop, from the layout to the appliances: everything about a new fitted kitchen, planned around cooking and living.",
        "bad": "Bathtub out, shower in, light at the mirror, ceramics without joints: guides to bathroom renovation, from the guest toilet to the wellness bath.",
        "wohnen": "Living room, bedroom, dressing room, home office: rooms that grow out of everyday life, not out of a catalogue.",
        "material": "Dekton, solid wood, terrazzo, ceramics, microcement: what materials can do, how they age and which still look good after five years.",
        "marken": "Sliding doors, sofas, lighting, ceramics, wardrobe systems: how to recognise good design and sound workmanship, beyond the name.",
        "licht-technik": "Lighting design, acoustics, smart home, heating and cooling: technology you feel but do not see.",
        "prozess": "Process, costs, timeline, permits: what you should know before a project, explained honestly.",
        "gewerbe": "Restaurants, offices, practices, boutique hotels: spaces where guests and clients stay longer.",
    },
    featured=["gesamtkonzept-wohnung-was-bedeutet-das", "neue-einbaukueche-planen-wien-leitfaden", "badezimmer-renovieren-wien-leitfaden"],
    feed_title="Richard Atelier Journal",
 ),
 "it": dict(
    mag="Rivista", mag_title="Rivista: abitare, cucina, bagno e progetti completi — Richard Atelier",
    mag_h1="La rivista: <strong>come desidera vivere?</strong>",
    mag_intro="Storie, guide e risposte oneste su progetti completi, nuove cucine, bagni, passaggi tra ambienti e materiali. Scritte dalla pratica di uno studio viennese che progetta e realizza.",
    mag_desc="Guide e storie su progetto completo, cucine su misura, ristrutturazione del bagno, passaggi tra ambienti e materiali. Dalla pratica di Richard Atelier, Vienna.",
    start="Da dove iniziare", all_in="Tutti gli articoli in", read="min di lettura", by="Di", updated="Aggiornato il",
    toc="Indice", summary_prefixes=["In breve", "In sintesi"], faq_heads=["Domande frequenti", "FAQ"], next_heads=["Come si prosegue", "Prossimi passi"],
    cta_primary="Prenota una consulenza gratuita", cta_primary_href="#anfrage", cta_secondary="Invia una richiesta", call="Chiama",
    phone_label="Oppure chiami direttamente:",
    box_title={"gesamtkonzept": "Immagini che <strong>finalmente tutto stia insieme.</strong>", "kueche": "La sua nuova cucina inizia <strong>con una conversazione.</strong>", "bad": "Il suo nuovo mattino inizia <strong>con una telefonata.</strong>", "uebergaenge": "Stanze separate diventano <strong>una casa che respira.</strong>", "wohnen": "Questa stanza può <strong>fare molto di più per Lei.</strong>", "gewerbe": "Spazi in cui <strong>ospiti e clienti vogliono restare.</strong>"},
    box_text="30 minuti, gratuiti e senza impegno. Ci racconta come desidera vivere. Riceve una prima valutazione onesta e sa che cosa è possibile nel suo caso e come si prosegue. Tradizione falegnameria viennese dal 1935, un solo interlocutore dal primo schizzo alla consegna.",
    read_label="Da leggere", related="Articoli correlati", prev="Articolo precedente", next="Articolo successivo", back="Torna alla rivista",
    form_h2="Come desidera <strong>vivere?</strong> Ce lo racconti.",
    form_p="Lasci e-mail e numero di telefono, basta meno di un minuto. Richard la ricontatta personalmente, di norma entro un giorno lavorativo. Gratuito, senza impegno, senza pressioni di vendita.",
    form_interest="Sono interessato a", chips=[("wohnraum", "Spazi privati"), ("gastronomie", "Commerciale")],
    ph_email="Il suo indirizzo e-mail", ph_phone="Il suo numero di telefono", submit="Richiedi una consulenza",
    msg_sending="Invio in corso …", msg_error="Invio non riuscito. Riprovi più tardi o ci chiami direttamente.", msg_invalid="Inserisca un indirizzo e-mail e un numero di telefono validi.",
    privacy="Inviando acconsente al trattamento dei suoi dati per essere ricontattato. Dettagli nell'<a href=\"/it/privacy/\">informativa sulla privacy</a>.",
    alt_book="Preferisce scegliere subito un orario?", alt_book_link="Prenota online (pagina in tedesco)",
    author="Richard Dobrohruschka", crumbs_home="Richard Atelier", lang_switch="Lingua", menu_label="Menu principale", open_menu="Apri il menu", brand_aria="Richard Atelier — alla pagina iniziale",
    footer_links=[("/it/fornitori/", "Fornitori"), ("/it/carriera/", "Carriera"), ("/it/note-legali/", "Note legali"), ("/it/privacy/", "Privacy")],
    cat_intro={
        "gesamtkonzept": "Un progetto completo considera appartamento o casa come un insieme: pianta, luce, materiali, arredi su misura e mobili da un unico interlocutore. Come funziona, quanto costa e per chi ha senso.",
        "uebergaenge": "La soglia conta più della stanza: come cucina, pranzo e living crescono insieme, quando una parete può cadere e come porte scorrevoli, pavimenti e luce collegano gli spazi.",
        "kueche": "Dall'isola al piano di lavoro, dalla pianta agli elettrodomestici: tutto sulla nuova cucina su misura, progettata a partire dal cucinare e dal vivere.",
        "bad": "Via la vasca, dentro la doccia, luce allo specchio, ceramica senza fughe: guide alla ristrutturazione del bagno, dal bagno degli ospiti alla zona wellness.",
        "wohnen": "Soggiorno, camera, cabina armadio, home office: stanze che nascono dalla vita quotidiana, non dal catalogo.",
        "material": "Dekton, legno massello, terrazzo, ceramica, microcemento: cosa sanno fare i materiali, come invecchiano e quali restano belli dopo cinque anni.",
        "marken": "Porte scorrevoli, divani, luci, ceramiche, sistemi armadio: come riconoscere il buon design e una lavorazione accurata, al di là del nome.",
        "licht-technik": "Progetto della luce, acustica, domotica, riscaldamento e raffrescamento: tecnologia che si sente ma non si vede.",
        "prozess": "Processo, costi, tempi, permessi: cosa sapere prima di un progetto, spiegato con onestà.",
        "gewerbe": "Ristoranti, uffici, studi medici, boutique hotel: spazi in cui ospiti e clienti restano più a lungo.",
    },
    featured=["gesamtkonzept-wohnung-was-bedeutet-das", "neue-einbaukueche-planen-wien-leitfaden", "badezimmer-renovieren-wien-leitfaden"],
    feed_title="Richard Atelier Rivista",
 ),
 "es": dict(
    mag="Revista", mag_title="Revista: vivienda, cocina, baño y proyectos integrales — Richard Atelier",
    mag_h1="La revista: <strong>¿cómo quiere vivir?</strong>",
    mag_intro="Historias, guías y respuestas honestas sobre proyectos integrales, cocinas nuevas, baños, transiciones entre espacios y materiales. Escritas desde la práctica de un estudio vienés que proyecta y construye.",
    mag_desc="Guías e historias sobre proyecto integral, cocinas a medida, reforma de baño, transiciones entre espacios y materiales. Desde la práctica de Richard Atelier, Viena.",
    start="Para empezar", all_in="Todos los artículos de", read="min de lectura", by="Por", updated="Actualizado el",
    toc="Contenido", summary_prefixes=["En resumen", "En breve"], faq_heads=["Preguntas frecuentes", "FAQ"], next_heads=["Cómo continuar", "Próximos pasos"],
    cta_primary="Reservar una consulta gratuita", cta_primary_href="#anfrage", cta_secondary="Enviar una consulta", call="Llamar",
    phone_label="O llame directamente:",
    box_title={"gesamtkonzept": "Imagine que <strong>por fin todo encaja.</strong>", "kueche": "Su nueva cocina empieza <strong>con una conversación.</strong>", "bad": "Sus nuevas mañanas empiezan <strong>con una llamada.</strong>", "uebergaenge": "Las habitaciones separadas se convierten en <strong>un hogar que respira.</strong>", "wohnen": "Este espacio puede <strong>hacer mucho más por usted.</strong>", "gewerbe": "Espacios donde <strong>huéspedes y clientes quieren quedarse.</strong>"},
    box_text="30 minutos, gratis y sin compromiso. Nos cuenta cómo quiere vivir. Recibe una primera valoración honesta y sabe qué es posible en su caso y cómo seguir. Tradición carpintera vienesa desde 1935, un solo interlocutor del primer trazo a la entrega.",
    read_label="Lea también", related="Artículos relacionados", prev="Artículo anterior", next="Artículo siguiente", back="Volver a la revista",
    form_h2="¿Cómo quiere <strong>vivir?</strong> Cuéntenoslo.",
    form_p="Deje su correo y su teléfono, no lleva ni un minuto. Richard le responde personalmente, normalmente en un día laborable. Gratis, sin compromiso y sin discurso comercial.",
    form_interest="Me interesa", chips=[("wohnraum", "Espacios privados"), ("gastronomie", "Comercial")],
    ph_email="Su correo electrónico", ph_phone="Su número de teléfono", submit="Solicitar una consulta",
    msg_sending="Enviando …", msg_error="No se pudo enviar. Inténtelo más tarde o llámenos directamente.", msg_invalid="Introduzca un correo y un teléfono válidos.",
    privacy="Al enviar acepta que tratemos sus datos para ponernos en contacto. Detalles en la <a href=\"/es/privacidad/\">política de privacidad</a>.",
    alt_book="¿Prefiere elegir ya una hora?", alt_book_link="Reservar en línea (página en alemán)",
    author="Richard Dobrohruschka", crumbs_home="Richard Atelier", lang_switch="Idioma", menu_label="Menú principal", open_menu="Abrir el menú", brand_aria="Richard Atelier — volver al inicio",
    footer_links=[("/es/proveedores/", "Proveedores"), ("/es/carrera/", "Carrera"), ("/es/aviso-legal/", "Aviso legal"), ("/es/privacidad/", "Privacidad")],
    cat_intro={
        "gesamtkonzept": "Un proyecto integral entiende el piso o la casa como un todo: planta, luz, materiales, carpintería a medida y mobiliario de una sola mano. Cómo funciona, cuánto cuesta y para quién tiene sentido.",
        "uebergaenge": "El umbral importa más que la habitación: cómo cocina, comedor y salón crecen juntos, cuándo puede caer una pared y cómo puertas correderas, suelos y luz conectan los espacios.",
        "kueche": "De la isla a la encimera, de la planta a los electrodomésticos: todo sobre la nueva cocina a medida, pensada desde cocinar y vivir.",
        "bad": "Fuera la bañera, dentro la ducha, luz en el espejo, cerámica sin juntas: guías para reformar el baño, del aseo de invitados al baño wellness.",
        "wohnen": "Salón, dormitorio, vestidor, despacho en casa: espacios que nacen del día a día, no del catálogo.",
        "material": "Dekton, madera maciza, terrazo, cerámica, microcemento: qué pueden los materiales, cómo envejecen y cuáles siguen bien a los cinco años.",
        "marken": "Puertas correderas, sofás, luminarias, cerámica, sistemas de armario: cómo reconocer el buen diseño y una ejecución cuidada, más allá del nombre.",
        "licht-technik": "Iluminación, acústica, domótica, calefacción y refrigeración: tecnología que se siente pero no se ve.",
        "prozess": "Proceso, costes, plazos, permisos: lo que conviene saber antes de un proyecto, explicado con honestidad.",
        "gewerbe": "Restaurantes, oficinas, consultas, hoteles boutique: espacios en los que huéspedes y clientes se quedan más tiempo.",
    },
    featured=["gesamtkonzept-wohnung-was-bedeutet-das", "neue-einbaukueche-planen-wien-leitfaden", "badezimmer-renovieren-wien-leitfaden"],
    feed_title="Richard Atelier Revista",
 ),
}

# ------------------------------------------------------------------ Helfer

def esc(s):
    return html.escape(s or "", quote=True)

def read(p):
    with open(p, encoding="utf-8") as f:
        return f.read()

def write(p, s):
    if CHECK_ONLY:
        return
    os.makedirs(os.path.dirname(p), exist_ok=True)
    with open(p, "w", encoding="utf-8") as f:
        f.write(s)

_img_dims = {}
def img_dims(name):
    if name in _img_dims:
        return _img_dims[name]
    p = os.path.join(ROOT, "assets", "img", name)
    w = h = None
    try:
        out = subprocess.run(["sips", "-g", "pixelWidth", "-g", "pixelHeight", p], capture_output=True, text=True).stdout
        w = int(re.search(r"pixelWidth: (\d+)", out).group(1)); h = int(re.search(r"pixelHeight: (\d+)", out).group(1))
    except Exception:
        pass
    _img_dims[name] = (w, h)
    return w, h

# ------------------------------------------------------------------ Frontmatter + Markdown

def parse_frontmatter(text, path):
    m = re.match(r"^﻿?---\s*\n(.*?)\n---\s*\n(.*)$", text, re.S)
    if not m:
        raise ValueError(f"Kein Frontmatter: {path}")
    meta = {}
    for line in m.group(1).splitlines():
        if not line.strip() or line.strip().startswith("#"):
            continue
        k, _, v = line.partition(":")
        meta[k.strip()] = v.strip().strip('"').strip("'")
    return meta, m.group(2)

INLINE_LINK = re.compile(r"\[([^\]]+)\]\(([^)\s]+)\)")

def inline(text, linkmap):
    """Inline-Markdown → HTML (escaped). linkmap(url) → url."""
    out = []
    pos = 0
    # Links zuerst, damit Escaping den Linktext nicht zerstört
    for m in INLINE_LINK.finditer(text):
        out.append(_inline_plain(text[pos:m.start()]))
        url = linkmap(m.group(2))
        ext = url.startswith("http") and SITE not in url
        attrs = ' target="_blank" rel="noopener"' if ext else ""
        out.append(f'<a href="{esc(url)}"{attrs}>{_inline_plain(m.group(1))}</a>')
        pos = m.end()
    out.append(_inline_plain(text[pos:]))
    return "".join(out)

def _inline_plain(t):
    t = esc(t)
    t = re.sub(r"\*\*(.+?)\*\*", r"<strong>\1</strong>", t)
    t = re.sub(r"(?<![\w*])\*(?!\s)(.+?)(?<!\s)\*(?![\w*])", r"<em>\1</em>", t)
    t = re.sub(r"`([^`]+)`", r"<code>\1</code>", t)
    return t

def slugify_anchor(s, used):
    a = re.sub(r"<[^>]+>", "", s).lower()
    a = a.replace("ä", "ae").replace("ö", "oe").replace("ü", "ue").replace("ß", "ss")
    a = re.sub(r"[^a-z0-9]+", "-", a).strip("-")[:60] or "abschnitt"
    base, i = a, 2
    while a in used:
        a = f"{base}-{i}"; i += 1
    used.add(a)
    return a

def md_to_blocks(md):
    """Markdown → Liste von Blöcken (type, payload)."""
    lines = md.replace("\r\n", "\n").split("\n")
    blocks, i, n = [], 0, len(lines)
    while i < n:
        line = lines[i]
        if not line.strip():
            i += 1; continue
        m = re.match(r"^(#{1,6})\s+(.*)$", line)
        if m:
            blocks.append(("h", len(m.group(1)), m.group(2).strip())); i += 1; continue
        if re.match(r"^(-{3,}|\*{3,})\s*$", line):
            blocks.append(("hr",)); i += 1; continue
        if line.lstrip().startswith(">"):
            buf = []
            while i < n and lines[i].lstrip().startswith(">"):
                buf.append(re.sub(r"^\s*>\s?", "", lines[i])); i += 1
            blocks.append(("quote", "\n".join(buf))); continue
        if "|" in line and i + 1 < n and re.match(r"^\s*\|?\s*:?-{2,}", lines[i + 1]):
            rows = []
            while i < n and "|" in lines[i] and lines[i].strip():
                rows.append(lines[i]); i += 1
            blocks.append(("table", rows)); continue
        if re.match(r"^\s*[-*+]\s+", line):
            items = []
            while i < n and (re.match(r"^\s*[-*+]\s+", lines[i]) or (lines[i].startswith("  ") and lines[i].strip() and items)):
                if re.match(r"^\s*[-*+]\s+", lines[i]):
                    items.append(re.sub(r"^\s*[-*+]\s+", "", lines[i]))
                else:
                    items[-1] += " " + lines[i].strip()
                i += 1
            blocks.append(("ul", items)); continue
        if re.match(r"^\s*\d+[.)]\s+", line):
            items = []
            while i < n and (re.match(r"^\s*\d+[.)]\s+", lines[i]) or (lines[i].startswith("  ") and lines[i].strip() and items)):
                if re.match(r"^\s*\d+[.)]\s+", lines[i]):
                    items.append(re.sub(r"^\s*\d+[.)]\s+", "", lines[i]))
                else:
                    items[-1] += " " + lines[i].strip()
                i += 1
            blocks.append(("ol", items)); continue
        buf = []
        while i < n and lines[i].strip() and not re.match(r"^(#{1,6}\s|\s*[-*+]\s|\s*\d+[.)]\s|\s*>|-{3,}\s*$)", lines[i]) and not ("|" in lines[i] and i + 1 < n and re.match(r"^\s*\|?\s*:?-{2,}", lines[i + 1])):
            buf.append(lines[i].strip()); i += 1
        if buf:
            blocks.append(("p", " ".join(buf)))
        else:
            i += 1
    return blocks

def render_table(rows, linkmap):
    def cells(r):
        r = r.strip()
        if r.startswith("|"): r = r[1:]
        if r.endswith("|"): r = r[:-1]
        return [c.strip() for c in r.split("|")]
    head = cells(rows[0]); body = [cells(r) for r in rows[2:]]
    h = "<table><thead><tr>" + "".join(f"<th>{inline(c, linkmap)}</th>" for c in head) + "</tr></thead><tbody>"
    for r in body:
        h += "<tr>" + "".join(f"<td>{inline(c, linkmap)}</td>" for c in r) + "</tr>"
    return h + "</tbody></table>"

# ------------------------------------------------------------------ Artikel laden

def load_articles():
    topics = json.load(open(os.path.join(CONTENT, "topics.json"), encoding="utf-8"))
    order = [t["slug"] for t in topics["topics"]]
    tmap = {t["slug"]: t for t in topics["topics"]}
    arts = {l: {} for l in LANGS}   # arts[lang][de_slug] = article dict
    problems = []
    for lang in LANGS:
        d = os.path.join(CONTENT, lang)
        if not os.path.isdir(d):
            continue
        for fn in sorted(os.listdir(d)):
            if not fn.endswith(".md"):
                continue
            p = os.path.join(d, fn)
            try:
                meta, body = parse_frontmatter(read(p), p)
            except ValueError as e:
                problems.append(str(e)); continue
            de_slug = meta.get("source_slug") or meta.get("slug") or fn[:-3]
            if lang == "de":
                de_slug = meta.get("slug") or fn[:-3]
            if de_slug not in tmap:
                problems.append(f"{lang}/{fn}: slug '{de_slug}' nicht in topics.json"); continue
            local_slug = meta.get("slug") or de_slug
            words = len(re.findall(r"\w+", body))
            arts[lang][de_slug] = dict(meta=meta, body=body, de_slug=de_slug, slug=local_slug, lang=lang,
                                       cat=tmap[de_slug]["cat"], cta=meta.get("cta") or tmap[de_slug]["cta"],
                                       words=words, file=p)
    return topics, order, tmap, arts, problems

# ------------------------------------------------------------------ URLs

def art_url(arts, lang, de_slug):
    """URL eines Artikels in Sprache lang; Fallback DE."""
    if de_slug in arts[lang]:
        return f"{PREFIX[lang]}/{arts[lang][de_slug]['slug']}/"
    if de_slug in arts["de"]:
        return f"{PREFIX['de']}/{arts['de'][de_slug]['slug']}/"
    return None

def cat_url(lang, cat):
    return f"{PREFIX[lang]}/{CAT_SLUG[lang][cat]}/"

def make_linkmap(arts, lang):
    def lm(url):
        m = re.match(r"^/magazin/([a-z0-9\-]+)/?(#.*)?$", url)
        if m:
            u = art_url(arts, lang, m.group(1))
            return (u + (m.group(2) or "")) if u else PREFIX[lang] + "/"
        if url in SERVICE:
            return SERVICE[url][lang]
        if url.startswith("/") and url.rstrip("/") + "/" in SERVICE:
            return SERVICE[url.rstrip("/") + "/"][lang]
        return url
    return lm

# ------------------------------------------------------------------ Seitenrahmen

def head_block(lang, title, desc, url, image, alternates, extra_ld, og_type="website", published=None, modified=None, noindex=False):
    t = T[lang]
    alt_links = "".join(f'\n  <link rel="alternate" hreflang="{l}" href="{SITE}{u}">' for l, u in alternates)
    xdef = dict(alternates).get("en") or dict(alternates).get("de") or url
    ld = "\n".join(f'<script type="application/ld+json">\n{json.dumps(x, ensure_ascii=False, indent=1)}\n</script>' for x in extra_ld)
    art_meta = ""
    if og_type == "article":
        art_meta = f'\n  <meta property="article:published_time" content="{published}">\n  <meta property="article:modified_time" content="{modified}">\n  <meta property="article:author" content="{SITE}/team/">'
    robots = '\n  <meta name="robots" content="noindex, follow">' if noindex else '\n  <meta name="robots" content="index, follow, max-image-preview:large, max-snippet:-1">'
    return f"""<!DOCTYPE html>
<html lang="{HTML_LANG[lang]}">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>{esc(title)}</title>
  <meta name="description" content="{esc(desc)}">{robots}
  <link rel="canonical" href="{SITE}{url}">{alt_links}
  <link rel="alternate" hreflang="x-default" href="{SITE}{xdef}">
  <link rel="alternate" type="application/rss+xml" title="{esc(t['feed_title'])}" href="{SITE}{PREFIX[lang]}/feed.xml">
  <link rel="icon" href="/assets/favicon-32.png?v=202609253" sizes="32x32">
  <link rel="icon" href="/assets/favicon-512.png?v=202609253" sizes="512x512">
  <link rel="apple-touch-icon" href="/assets/apple-touch-icon.png?v=202609253">
  <meta property="og:site_name" content="Richard Atelier">
  <meta property="og:type" content="{og_type}">
  <meta property="og:title" content="{esc(title)}">
  <meta property="og:description" content="{esc(desc)}">
  <meta property="og:image" content="{SITE}/assets/img/{image}">
  <meta property="og:url" content="{SITE}{url}">
  <meta property="og:locale" content="{LOCALE[lang]}">{art_meta}
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="{esc(title)}">
  <meta name="twitter:description" content="{esc(desc)}">
  <meta name="twitter:image" content="{SITE}/assets/img/{image}">
  <link rel="preload" as="image" href="/assets/img/{image}">
  <link rel="stylesheet" href="/assets/styles.css?v=202609253">
  <link rel="stylesheet" href="/assets/magazin.css?v={CSS_V}">
  <script src="/assets/analytics.js?v=202610081"></script>
{ld}
</head>
"""

def chrome_top(lang, lang_links, current_menu=None):
    t = T[lang]
    menu_items = []
    for h, lbl in MENU[lang]:
        cur = ' aria-current="page"' if h == current_menu else ""
        cls = ' class="ui-menu-termin"' if "termin" in h else (' class="ui-menu-contact"' if "#kontakt" in h else "")
        menu_items.append('    <a href="' + esc(h) + '"' + cur + cls + '>' + esc(lbl) + '</a>')
    menu = "\n".join(menu_items)
    langs = []
    for l in LANGS:
        u, fb = lang_links[l]
        if l == lang:
            langs.append(f'    <span aria-current="true" lang="{l}">{l.upper()}</span>')
        else:
            fbcls = ' class="is-fallback"' if fb else ""
            langs.append('    <a href="' + esc(u) + '" hreflang="' + l + '" lang="' + l + '"' + fbcls + '>' + l.upper() + '</a>')
    termin_href = "/termin/" if lang == "de" else "#anfrage"
    termin_label = "Video-Beratung" if lang == "de" else t["cta_primary"]
    return f"""<body data-theme="light" class="static-page magazin has-sticky-cta">
  <div class="mag-progress" aria-hidden="true"></div>
  <a class="ui-brand" href="{HOME[lang]}" aria-label="{esc(t['brand_aria'])}">
    <span class="brand-line" aria-hidden="true"></span>
    <span class="brand-word">Richard</span>
  </a>
  <a class="ui-termin" href="{termin_href}">{esc(termin_label)}</a>

  <input type="checkbox" id="nav-toggle" class="nav-toggle-input">
  <label for="nav-toggle" class="nav-toggle-btn" aria-label="{esc(t['open_menu'])}">
    <span></span><span></span><span></span>
  </label>

  <nav class="ui-menu" aria-label="{esc(t['menu_label'])}">
{menu}
  </nav>

  <nav class="ui-lang" aria-label="{esc(t['lang_switch'])}">
{chr(10).join(langs)}
  </nav>
"""

def chrome_bottom(lang):
    t = T[lang]
    links = "\n".join(f'      <a href="{esc(h)}">{esc(l)}</a>' for h, l in t["footer_links"])
    primary_href = "/termin/" if lang == "de" else "#anfrage"
    return f"""
  <div class="static-footer">
    <span class="footer-address">Royerstraße 7, 2482 Münchendorf</span><br>Vienna &middot; New York<br><a class="footer-contact" href="{PHONE_HREF}">{PHONE_DISPLAY}</a><span class="footer-contact-sep">&middot;</span><a class="footer-contact" href="mailto:richard@richardsatelier.at">richard@richardsatelier.at</a><span class="footer-contact-sep">&middot;</span><a class="footer-contact" href="{WA_HREF}" target="_blank" rel="noopener">WhatsApp</a>
    <nav class="footer-links" aria-label="{esc(t['menu_label'])}">
      <a href="{PREFIX[lang]}/">{esc(t['mag'])}</a>
{links}
    </nav>
  </div>

  <div class="lp-sticky-cta" aria-label="CTA">
    <a class="call" href="{PHONE_HREF}">{esc(t['call'])}</a>
    <a class="whatsapp" href="{primary_href}">{esc(t['cta_primary'])}</a>
  </div>

  <script src="/assets/magazin.js?v={CSS_V}"></script>
</body>
</html>
"""

def cta_actions(lang, cls_primary="mag-btn mag-btn--sand"):
    t = T[lang]
    return (f'<a class="{cls_primary}" href="{t["cta_primary_href"]}">{esc(t["cta_primary"])}</a>'
            f'<a class="mag-phone" href="{PHONE_HREF}">{esc(t["phone_label"])} {PHONE_DISPLAY}</a>')

def cta_box(lang, cta_variant):
    t = T[lang]
    title = t["box_title"].get(cta_variant) or t["box_title"]["gesamtkonzept"]
    return f"""<aside class="mag-cta-box" aria-label="CTA">
  <p class="mag-cta-box-title">{title}</p>
  <p>{esc(t['box_text'])}</p>
  <div class="mag-cta-actions">{cta_actions(lang)}<a href="#anfrage">{esc(t['cta_secondary'])}</a></div>
</aside>"""

def read_box(lang, items):
    t = T[lang]
    if not items:
        return ""
    links = "".join(f'<a href="{esc(u)}">{esc(title)}<span>{esc(desc)}</span></a>' for u, title, desc in items)
    return f'<aside class="mag-read-box"><p class="mag-read-label">{esc(t["read_label"])}</p>{links}</aside>'

def form_block(lang, cta_variant):
    t = T[lang]
    default_chip = "gastronomie" if cta_variant == "gewerbe" else "wohnraum"
    chips = "".join(f'<button type="button" class="chip" data-value="{v}" aria-pressed="{"true" if v == default_chip else "false"}">{esc(l)}</button>' for v, l in t["chips"])
    alt = f'<p class="mag-form-alt"><span>{esc(t["alt_book"])}</span><a href="/termin/">{esc(t["alt_book_link"])}</a></p>'
    return f"""<section class="mag-form" id="anfrage" aria-label="{esc(t['cta_secondary'])}">
  <h2>{t['form_h2']}</h2>
  <p>{esc(t['form_p'])}</p>
  <form class="contact-form" novalidate action="{ENDPOINT}" method="post" data-endpoint="{ENDPOINT}" data-success-url="{SERVICE['/danke/'][lang]}"
        data-msg-sending="{esc(t['msg_sending'])}" data-msg-error="{esc(t['msg_error'])}" data-msg-invalid="{esc(t['msg_invalid'])}">
    <input type="hidden" name="lead_id" value="">
    <input type="hidden" name="interesse" value="{default_chip}">
    <div class="hp-field" aria-hidden="true"><label for="mag-company">Firma (bitte leer lassen)</label><input id="mag-company" type="text" name="company" tabindex="-1" autocomplete="off"></div>
    <span class="mag-privacy">{esc(t['form_interest'])}</span>
    <div class="chip-row" role="group" aria-label="{esc(t['form_interest'])}">{chips}</div>
    <input type="email" name="email" placeholder="{esc(t['ph_email'])}" autocomplete="email" inputmode="email" required aria-label="{esc(t['ph_email'])}">
    <input type="tel" name="phone" placeholder="{esc(t['ph_phone'])}" autocomplete="tel" inputmode="tel" required aria-label="{esc(t['ph_phone'])}">
    <button type="submit">{esc(t['submit'])}</button>
    <p class="form-note" aria-live="polite"></p>
    <p class="mag-privacy">{t['privacy']}</p>
  </form>
  <p class="mag-form-alt"><a href="{PHONE_HREF}">{PHONE_DISPLAY}</a><a href="{WA_HREF}" target="_blank" rel="noopener">WhatsApp</a></p>
  {alt}
</section>"""

def card(lang, a, arts, topics):
    t = T[lang]
    cat = topics["categories"][a["cat"]][lang]
    hero = a["meta"].get("hero") or topics["hero_pool"][a["cat"]][0]
    return f"""<a class="mag-card" href="{art_url(arts, lang, a['de_slug'])}">
  <img src="/assets/img/{hero}" alt="" loading="lazy" width="800" height="500">
  <div class="mag-card-body">
    <span class="mag-card-cat">{esc(cat)}</span>
    <h3>{esc(a['meta'].get('title',''))}</h3>
    <p>{esc(a['meta'].get('description',''))}</p>
    <span class="mag-card-meta">{a['meta'].get('reading_minutes') or max(3, math.ceil(a['words']/220))} {esc(t['read'])}</span>
  </div>
</a>"""

# ------------------------------------------------------------------ Artikelseite

def related_for(a, arts, lang, order, tmap, n=6):
    kw = set(w.lower() for w in re.split(r"[,\s]+", a["meta"].get("keywords", "") + " " + tmap[a["de_slug"]]["kw"]) if len(w) > 3)
    cands = []
    for s in order:
        if s == a["de_slug"] or s not in arts[lang]:
            continue
        b = arts[lang][s]
        kb = set(w.lower() for w in re.split(r"[,\s]+", b["meta"].get("keywords", "") + " " + tmap[s]["kw"]) if len(w) > 3)
        score = (3 if b["cat"] == a["cat"] else 0) + len(kw & kb)
        cands.append((score, s))
    cands.sort(key=lambda x: -x[0])
    return [arts[lang][s] for _, s in cands[:n]]

def build_article(a, arts, lang, order, tmap, topics):
    t = T[lang]
    meta = a["meta"]
    lm = make_linkmap(arts, lang)
    url = art_url(arts, lang, a["de_slug"])
    cat_name = topics["categories"][a["cat"]][lang]
    hero = meta.get("hero") or topics["hero_pool"][a["cat"]][0]
    if not os.path.exists(os.path.join(ROOT, "assets", "img", hero)):
        hero = topics["hero_pool"][a["cat"]][0]
    w, h = img_dims(hero)
    minutes = int(meta.get("reading_minutes") or max(3, math.ceil(a["words"] / 220)))
    date = meta.get("date") or TODAY

    blocks = md_to_blocks(a["body"])
    # H1 entfernen (kommt aus meta.title)
    title = meta.get("title") or next((b[2] for b in blocks if b[0] == "h" and b[1] == 1), a["de_slug"])
    blocks = [b for b in blocks if not (b[0] == "h" and b[1] == 1)]

    # Abschnitte nach H2 gruppieren
    sections, cur = [], {"h": None, "blocks": []}
    for b in blocks:
        if b[0] == "h" and b[1] == 2:
            sections.append(cur); cur = {"h": b[2], "blocks": []}
        else:
            cur["blocks"].append(b)
    sections.append(cur)

    def is_head(hd, names):
        return hd and any(hd.strip().lower().startswith(n.lower()) for n in names)

    faq_sec = next((s for s in sections if is_head(s["h"], t["faq_heads"])), None)
    next_sec = next((s for s in sections if is_head(s["h"], t["next_heads"])), None)
    body_secs = [s for s in sections if s is not faq_sec and s is not next_sec]

    used_anchors = set()
    toc = []
    out = []
    summary_html = ""
    mid_cta_done = 0
    related = related_for(a, arts, lang, order, tmap, 8)
    read_items = [(art_url(arts, lang, r["de_slug"]), r["meta"].get("title", ""), topics["categories"][r["cat"]][lang]) for r in related]

    def render_blocks(bl):
        h = []
        for b in bl:
            if b[0] == "h":
                lvl = min(6, max(3, b[1]))
                anchor = slugify_anchor(b[2], used_anchors)
                h.append(f'<h{lvl} id="{anchor}">{inline(b[2], lm)}</h{lvl}>')
            elif b[0] == "p":
                h.append(f"<p>{inline(b[1], lm)}</p>")
            elif b[0] == "ul":
                h.append("<ul>" + "".join(f"<li>{inline(i, lm)}</li>" for i in b[1]) + "</ul>")
            elif b[0] == "ol":
                h.append("<ol>" + "".join(f"<li>{inline(i, lm)}</li>" for i in b[1]) + "</ol>")
            elif b[0] == "quote":
                paras = [p for p in b[1].split("\n\n") if p.strip()] or [b[1]]
                h.append("<blockquote>" + "".join(f"<p>{inline(p.replace(chr(10), ' '), lm)}</p>" for p in paras) + "</blockquote>")
            elif b[0] == "table":
                h.append(render_table(b[1], lm))
            elif b[0] == "hr":
                h.append("<hr>")
        return "\n".join(h)

    # Intro-Abschnitt (vor erstem H2): Kurz gesagt herauslösen
    intro = body_secs[0]["blocks"] if body_secs and body_secs[0]["h"] is None else []
    rest = body_secs[1:] if body_secs and body_secs[0]["h"] is None else body_secs
    intro_html = []
    for b in intro:
        if b[0] == "p" and not summary_html and any(b[1].lstrip("*").lower().startswith(p.lower()) for p in t["summary_prefixes"]):
            summary_html = f'<div class="mag-summary">{inline(b[1], lm)}</div>'
        else:
            intro_html.append(render_blocks([b]))

    n_secs = len(rest)
    for idx, s in enumerate(rest):
        anchor = slugify_anchor(s["h"], used_anchors)
        toc.append((anchor, s["h"]))
        out.append(f'<h2 id="{anchor}">{inline(s["h"], lm)}</h2>')
        out.append(render_blocks(s["blocks"]))
        # CTA nach dem 2. Abschnitt, Lesetipp nach dem 4., zweiter CTA nach dem 7. (bei langen Texten)
        if idx == 1:
            out.append(cta_box(lang, a["cta"])); mid_cta_done += 1
        elif idx == 3:
            out.append(read_box(lang, read_items[:3]))
        elif idx == 6 and n_secs >= 9:
            out.append(cta_box(lang, a["cta"])); mid_cta_done += 1

    # FAQ
    faq_html, faq_ld = "", []
    if faq_sec:
        qa, q, ans = [], None, []
        for b in faq_sec["blocks"]:
            if b[0] == "h":
                if q: qa.append((q, ans))
                q, ans = b[2], []
            elif q and b[0] == "p":
                ans.append(b[1])
            elif q and b[0] in ("ul", "ol"):
                ans.append(" ".join(b[1]))
        if q: qa.append((q, ans))
        anchor = slugify_anchor(faq_sec["h"], used_anchors)
        toc.append((anchor, faq_sec["h"]))
        items = "".join(f'<details><summary>{inline(qq, lm)}</summary><p class="answer">{inline(" ".join(aa), lm)}</p></details>' for qq, aa in qa)
        faq_html = f'<section class="mag-faq"><h2 id="{anchor}">{inline(faq_sec["h"], lm)}</h2><div class="lp-faq">{items}</div></section>'
        for qq, aa in qa:
            faq_ld.append({"@type": "Question", "name": re.sub(r"[*_`]", "", qq), "acceptedAnswer": {"@type": "Answer", "text": re.sub(r"\[([^\]]+)\]\([^)]+\)", r"\1", re.sub(r"[*_`]", "", " ".join(aa)))}})

    next_html = ""
    if next_sec:
        anchor = slugify_anchor(next_sec["h"], used_anchors)
        toc.append((anchor, next_sec["h"]))
        next_html = f'<section class="mag-next-step"><h2 id="{anchor}">{inline(next_sec["h"], lm)}</h2>{render_blocks(next_sec["blocks"])}<div class="mag-cta-actions">{cta_actions(lang)}<a class="mag-btn mag-btn--ghost" href="#anfrage">{esc(t["cta_secondary"])}</a></div></section>'
    else:
        next_html = f'<section class="mag-next-step"><div class="mag-cta-actions">{cta_actions(lang)}<a class="mag-btn mag-btn--ghost" href="#anfrage">{esc(t["cta_secondary"])}</a></div></section>'

    toc_html = ""
    if len(toc) >= 3:
        toc_html = f'<details class="mag-toc" open><summary>{esc(t["toc"])}</summary><ol>' + "".join(f'<li><a href="#{an}">{inline(tt, lm)}</a></li>' for an, tt in toc) + "</ol></details>"

    # hreflang
    alternates = [(l, art_url(arts, l, a["de_slug"])) for l in LANGS if a["de_slug"] in arts[l]]
    lang_links = {l: ((art_url(arts, l, a["de_slug"]), False) if a["de_slug"] in arts[l] else (PREFIX[l] + "/", True)) for l in LANGS}

    # Verwandte Karten, vor/zurück
    rel_cards = "".join(card(lang, r, arts, topics) for r in related[:6])
    pos = order.index(a["de_slug"])
    prev_s = next((s for s in reversed(order[:pos]) if s in arts[lang]), None)
    next_s = next((s for s in order[pos + 1:] if s in arts[lang]), None)
    pn = ""
    if prev_s or next_s:
        pn = '<nav class="mag-prevnext" aria-label="Navigation">'
        if prev_s:
            pn += f'<a class="prev" href="{art_url(arts, lang, prev_s)}"><span>{esc(t["prev"])}</span><strong>{esc(arts[lang][prev_s]["meta"].get("title",""))}</strong></a>'
        else:
            pn += "<span></span>"
        if next_s:
            pn += f'<a class="next" href="{art_url(arts, lang, next_s)}"><span>{esc(t["next"])}</span><strong>{esc(arts[lang][next_s]["meta"].get("title",""))}</strong></a>'
        pn += "</nav>"

    desc = meta.get("description", "")
    page_title = f"{title} — Richard Atelier"
    ld = [{
        "@context": "https://schema.org", "@type": "BlogPosting",
        "headline": title, "description": desc, "image": [f"{SITE}/assets/img/{hero}"],
        "datePublished": date, "dateModified": date, "inLanguage": HTML_LANG[lang],
        "wordCount": a["words"], "articleSection": cat_name,
        "keywords": meta.get("keywords", ""),
        "author": {"@type": "Person", "name": t["author"], "url": f"{SITE}/team/", "jobTitle": "Kurator, Human-Centered Living Design"},
        "publisher": {"@type": "Organization", "name": "Richard Atelier", "url": SITE, "logo": {"@type": "ImageObject", "url": f"{SITE}/assets/favicon-512.png"}},
        "mainEntityOfPage": {"@type": "WebPage", "@id": f"{SITE}{url}"},
        "isPartOf": {"@type": "Blog", "name": t["feed_title"], "url": f"{SITE}{PREFIX[lang]}/"},
    }, {
        "@context": "https://schema.org", "@type": "BreadcrumbList",
        "itemListElement": [
            {"@type": "ListItem", "position": 1, "name": "Richard Atelier", "item": f"{SITE}{HOME[lang]}"},
            {"@type": "ListItem", "position": 2, "name": t["mag"], "item": f"{SITE}{PREFIX[lang]}/"},
            {"@type": "ListItem", "position": 3, "name": cat_name, "item": f"{SITE}{cat_url(lang, a['cat'])}"},
            {"@type": "ListItem", "position": 4, "name": title, "item": f"{SITE}{url}"},
        ],
    }]
    if faq_ld:
        ld.append({"@context": "https://schema.org", "@type": "FAQPage", "mainEntity": faq_ld})

    html_out = head_block(lang, page_title, desc, url, hero, alternates, ld, og_type="article", published=date, modified=date)
    html_out += chrome_top(lang, lang_links, current_menu=PREFIX[lang] + "/")
    html_out += f"""
  <main class="mag-main">
    <article>
      <header class="mag-hero">
        <nav class="mag-crumbs" aria-label="Breadcrumb"><a href="{HOME[lang]}">{esc(t['crumbs_home'])}</a><span aria-hidden="true">/</span><a href="{PREFIX[lang]}/">{esc(t['mag'])}</a><span aria-hidden="true">/</span><a href="{cat_url(lang, a['cat'])}">{esc(cat_name)}</a></nav>
        <p class="eyebrow">{esc(cat_name)} · {minutes} {esc(t['read'])}</p>
        <h1>{inline(title, lm)}</h1>
        <p class="mag-meta"><span>{esc(t['by'])} <a href="{SERVICE['/team/'][lang]}">{esc(t['author'])}</a></span><span>{esc(t['updated'])} {date}</span></p>
        <div class="mag-cta-top">{cta_actions(lang)}</div>
        <figure class="mag-hero-img"><img src="/assets/img/{hero}" alt="{esc(meta.get('hero_alt', title))}" width="{w or 1600}" height="{h or 1000}" fetchpriority="high" decoding="async"></figure>
      </header>
      {summary_html}
      {"".join(intro_html)}
      {toc_html}
      <div class="mag-body">
        {chr(10).join(out)}
      </div>
      {faq_html}
      {next_html}
    </article>

    {form_block(lang, a['cta'])}

    <h2 class="mag-section-title">{esc(t['related'])}</h2>
    <div class="mag-grid">{rel_cards}</div>
    {pn}
    <p style="margin-top:2rem"><a class="static-cta" href="{PREFIX[lang]}/">{esc(t['back'])}</a></p>
  </main>
"""
    html_out += chrome_bottom(lang)
    return url, html_out, dict(title=title, desc=desc, date=date, hero=hero, alternates=alternates)

# ------------------------------------------------------------------ Übersicht + Kategorien

def build_index(lang, arts, order, topics):
    t = T[lang]
    url = PREFIX[lang] + "/"
    alternates = [(l, PREFIX[l] + "/") for l in LANGS]
    lang_links = {l: (PREFIX[l] + "/", False) for l in LANGS}
    cats_nav = "".join(f'<a href="{cat_url(lang, c)}">{esc(topics["categories"][c][lang])}</a>' for c in topics["categories"] if any(arts[lang][s]["cat"] == c for s in arts[lang]))
    featured = "".join(card(lang, arts[lang][s], arts, topics) for s in t["featured"] if s in arts[lang])
    sections = ""
    for c in topics["categories"]:
        items = [arts[lang][s] for s in order if s in arts[lang] and arts[lang][s]["cat"] == c]
        if not items:
            continue
        sections += f'<h2 class="mag-section-title" id="{CAT_SLUG[lang][c]}">{esc(topics["categories"][c][lang])}</h2><p class="mag-cat-intro">{esc(t["cat_intro"][c])} <a href="{cat_url(lang, c)}">{esc(t["all_in"])} {esc(topics["categories"][c][lang])} →</a></p><div class="mag-grid">' + "".join(card(lang, a, arts, topics) for a in items[:6]) + "</div>"
    ld = [{"@context": "https://schema.org", "@type": "Blog", "name": t["feed_title"], "url": f"{SITE}{url}", "description": t["mag_desc"], "inLanguage": HTML_LANG[lang],
           "publisher": {"@type": "Organization", "name": "Richard Atelier", "url": SITE},
           "blogPost": [{"@type": "BlogPosting", "headline": arts[lang][s]["meta"].get("title", ""), "url": f"{SITE}{art_url(arts, lang, s)}"} for s in order if s in arts[lang]]},
          {"@context": "https://schema.org", "@type": "BreadcrumbList", "itemListElement": [
              {"@type": "ListItem", "position": 1, "name": "Richard Atelier", "item": f"{SITE}{HOME[lang]}"},
              {"@type": "ListItem", "position": 2, "name": t["mag"], "item": f"{SITE}{url}"}]}]
    h = head_block(lang, t["mag_title"], t["mag_desc"], url, "homepage-hero.jpg", alternates, ld)
    h += chrome_top(lang, lang_links, current_menu=url)
    h += f"""
  <main class="mag-main mag-main--wide">
    <header class="mag-index-hero">
      <nav class="mag-crumbs" aria-label="Breadcrumb"><a href="{HOME[lang]}">{esc(t['crumbs_home'])}</a><span aria-hidden="true">/</span><span>{esc(t['mag'])}</span></nav>
      <h1>{t['mag_h1']}</h1>
      <p>{esc(t['mag_intro'])}</p>
      <div class="mag-cta-top" style="margin-top:1.4rem">{cta_actions(lang)}</div>
      <nav class="mag-cats" aria-label="{esc(t['mag'])}">{cats_nav}</nav>
    </header>
    <h2 class="mag-section-title">{esc(t['start'])}</h2>
    <div class="mag-featured">{featured}</div>
    {sections}
    {form_block(lang, 'gesamtkonzept')}
  </main>
"""
    h += chrome_bottom(lang)
    return url, h

def build_category(lang, cat, arts, order, topics):
    t = T[lang]
    url = cat_url(lang, cat)
    name = topics["categories"][cat][lang]
    items = [arts[lang][s] for s in order if s in arts[lang] and arts[lang][s]["cat"] == cat]
    if not items:
        return None
    alternates = [(l, cat_url(l, cat)) for l in LANGS if any(arts[l][s]["cat"] == cat for s in arts[l])]
    lang_links = {l: ((cat_url(l, cat), False) if any(arts[l][s]["cat"] == cat for s in arts[l]) else (PREFIX[l] + "/", True)) for l in LANGS}
    cats_nav = "".join('<a href="' + cat_url(lang, c) + '"' + (' aria-current="page"' if c == cat else "") + '>' + esc(topics["categories"][c][lang]) + '</a>' for c in topics["categories"] if any(arts[lang][s]["cat"] == c for s in arts[lang]))
    title = f"{name}: {t['mag']} — Richard Atelier"
    desc = t["cat_intro"][cat][:155]
    ld = [{"@context": "https://schema.org", "@type": "CollectionPage", "name": title, "url": f"{SITE}{url}", "description": desc, "inLanguage": HTML_LANG[lang],
           "hasPart": [{"@type": "BlogPosting", "headline": a["meta"].get("title", ""), "url": f"{SITE}{art_url(arts, lang, a['de_slug'])}"} for a in items]},
          {"@context": "https://schema.org", "@type": "BreadcrumbList", "itemListElement": [
              {"@type": "ListItem", "position": 1, "name": "Richard Atelier", "item": f"{SITE}{HOME[lang]}"},
              {"@type": "ListItem", "position": 2, "name": t["mag"], "item": f"{SITE}{PREFIX[lang]}/"},
              {"@type": "ListItem", "position": 3, "name": name, "item": f"{SITE}{url}"}]}]
    hero = items[0]["meta"].get("hero") or topics["hero_pool"][cat][0]
    h = head_block(lang, title, desc, url, hero, alternates, ld)
    h += chrome_top(lang, lang_links, current_menu=PREFIX[lang] + "/")
    cta_variant = items[0]["cta"]
    h += f"""
  <main class="mag-main mag-main--wide">
    <header class="mag-index-hero">
      <nav class="mag-crumbs" aria-label="Breadcrumb"><a href="{HOME[lang]}">{esc(t['crumbs_home'])}</a><span aria-hidden="true">/</span><a href="{PREFIX[lang]}/">{esc(t['mag'])}</a><span aria-hidden="true">/</span><span>{esc(name)}</span></nav>
      <h1>{esc(name)}</h1>
      <p>{esc(t['cat_intro'][cat])}</p>
      <div class="mag-cta-top" style="margin-top:1.4rem">{cta_actions(lang)}</div>
      <nav class="mag-cats" aria-label="{esc(t['mag'])}">{cats_nav}</nav>
    </header>
    <div class="mag-grid">{"".join(card(lang, a, arts, topics) for a in items)}</div>
    {form_block(lang, cta_variant)}
    <p style="margin-top:2rem"><a class="static-cta" href="{PREFIX[lang]}/">{esc(t['back'])}</a></p>
  </main>
"""
    h += chrome_bottom(lang)
    return url, h

# ------------------------------------------------------------------ Feed, Sitemap, llms.txt, Menüs

def build_feed(lang, arts, order):
    t = T[lang]
    items = ""
    for s in order:
        if s not in arts[lang]:
            continue
        a = arts[lang][s]
        u = f"{SITE}{art_url(arts, lang, s)}"
        d = a["meta"].get("date") or TODAY
        items += f"""
  <item>
    <title>{esc(a['meta'].get('title',''))}</title>
    <link>{u}</link>
    <guid isPermaLink="true">{u}</guid>
    <pubDate>{datetime.datetime.strptime(d, '%Y-%m-%d').strftime('%a, %d %b %Y 09:00:00 +0100')}</pubDate>
    <description>{esc(a['meta'].get('description',''))}</description>
  </item>"""
    return f"""<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
<channel>
  <title>{esc(t['feed_title'])}</title>
  <link>{SITE}{PREFIX[lang]}/</link>
  <description>{esc(t['mag_desc'])}</description>
  <language>{HTML_LANG[lang]}</language>
  <atom:link href="{SITE}{PREFIX[lang]}/feed.xml" rel="self" type="application/rss+xml"/>{items}
</channel>
</rss>
"""

def update_sitemap(entries):
    """entries: list of (url, lastmod, [(lang, url), ...])"""
    p = os.path.join(ROOT, "sitemap.xml")
    sm = read(p)
    # bestehende Magazin-Einträge entfernen
    def is_mag(block):
        return any(f"<loc>{SITE}{PREFIX[l]}/" in block for l in LANGS)
    blocks = re.findall(r"\s*<url>.*?</url>", sm, re.S)
    keep = [b for b in blocks if not is_mag(b)]
    new = []
    for url, lastmod, alts in entries:
        x = f"\n  <url>\n    <loc>{SITE}{url}</loc>\n    <lastmod>{lastmod}</lastmod>"
        for l, u in alts:
            x += f'\n    <xhtml:link rel="alternate" hreflang="{l}" href="{SITE}{u}"/>'
        if alts:
            xd = dict(alts).get("en") or dict(alts).get("de")
            x += f'\n    <xhtml:link rel="alternate" hreflang="x-default" href="{SITE}{xd}"/>'
        x += "\n  </url>"
        new.append(x)
    head = sm[:sm.index("<url>")].rstrip() if "<url>" in sm else sm
    head = re.sub(r"\s*$", "", head)
    out = head + "".join(keep) + "".join(new) + "\n</urlset>\n"
    write(p, out)
    return len(keep), len(new)

def update_llms(arts, order, topics):
    p = os.path.join(ROOT, "llms.txt")
    s = read(p)
    start, end = "<!-- magazin:start -->", "<!-- magazin:end -->"
    lines = [start, "", "## Magazin (Ratgeber und Geschichten aus der Praxis)", "",
             f"Rund {len(arts['de'])} ausführliche Artikel zu Gesamtkonzepten, Küche, Bad, Raumübergängen, Materialien und Marken: [Magazin-Übersicht]({SITE}/magazin/). Englisch: [Journal]({SITE}/en/journal/), Italienisch: [Rivista]({SITE}/it/rivista/), Spanisch: [Revista]({SITE}/es/revista/). RSS: {SITE}/magazin/feed.xml", ""]
    for c in topics["categories"]:
        items = [arts["de"][x] for x in order if x in arts["de"] and arts["de"][x]["cat"] == c]
        if not items:
            continue
        lines.append(f"### {topics['categories'][c]['de']}")
        for a in items:
            lines.append(f"- [{a['meta'].get('title','')}]({SITE}{art_url(arts, 'de', a['de_slug'])}): {a['meta'].get('description','')}")
        lines.append("")
    lines.append(end)
    block = "\n".join(lines)
    if start in s and end in s:
        s = s[:s.index(start)] + block + s[s.index(end) + len(end):]
    elif "## Sprachen" in s:
        s = s.replace("## Sprachen", block + "\n\n## Sprachen", 1)
    else:
        s = s.rstrip() + "\n\n" + block + "\n"
    write(p, s)

def update_menus():
    """Fügt den Magazin-Link in .ui-menu und .footer-links aller bestehenden Seiten ein (idempotent)."""
    label = {"de": ("magazin", "Magazin"), "en": ("journal", "Journal"), "it": ("rivista", "Rivista"), "es": ("revista", "Revista")}
    changed = 0
    for dp, dn, fn in os.walk(ROOT):
        if any(x in dp for x in ("/.git", "/admin", "/content", "/node_modules", "/supabase", "/tools")):
            continue
        for f in fn:
            if not f.endswith(".html"):
                continue
            p = os.path.join(dp, f)
            rel = os.path.relpath(p, ROOT)
            # Magazinseiten selbst überspringen
            if rel.startswith(("magazin/", "en/journal/", "it/rivista/", "es/revista/")):
                continue
            s = read(p)
            m = re.search(r'<html lang="(\w\w)', s)
            lang = m.group(1) if m else "de"
            if lang not in label:
                lang = "de"
            seg, lbl = label[lang]
            if f'>{lbl}</a>' in s and f'{seg}/"' in s:
                continue
            # Tiefe relativ zum Sprachstamm: aus dem Team-Link ableiten
            tm = re.search(r'<a href="((?:\.\./)*)team/">Team</a>', s)
            if not tm:
                continue
            prefix = tm.group(1)
            new = s.replace(tm.group(0), f'<a href="{prefix}{seg}/">{lbl}</a>\n    {tm.group(0)}', 1)
            fl = re.search(r'(<nav class="footer-links"[^>]*>\s*\n)', new)
            if fl:
                new = new.replace(fl.group(1), fl.group(1) + f'      <a href="{prefix}{seg}/">{lbl}</a>\n', 1)
            if new != s:
                write(p, new); changed += 1
    return changed

# ------------------------------------------------------------------ Main

def main():
    topics, order, tmap, arts, problems = load_articles()
    counts = {l: len(arts[l]) for l in LANGS}
    print("Artikel je Sprache:", counts)
    if problems:
        print("Probleme:"); [print("  -", x) for x in problems]
    if not arts["de"]:
        print("Keine deutschen Artikel gefunden, Abbruch."); sys.exit(1)

    sitemap_entries = []
    written = 0
    for lang in LANGS:
        if not arts[lang]:
            continue
        for s in order:
            if s not in arts[lang]:
                continue
            url, h, info = build_article(arts[lang][s], arts, lang, order, tmap, topics)
            write(os.path.join(ROOT, url.strip("/"), "index.html"), h); written += 1
            if lang == "de" or True:
                sitemap_entries.append((url, info["date"], info["alternates"]))
        url, h = build_index(lang, arts, order, topics)
        write(os.path.join(ROOT, url.strip("/"), "index.html"), h); written += 1
        sitemap_entries.append((url, TODAY, [(l, PREFIX[l] + "/") for l in LANGS if arts[l]]))
        for c in topics["categories"]:
            r = build_category(lang, c, arts, order, topics)
            if r:
                write(os.path.join(ROOT, r[0].strip("/"), "index.html"), r[1]); written += 1
                sitemap_entries.append((r[0], TODAY, [(l, cat_url(l, c)) for l in LANGS if any(arts[l][x]["cat"] == c for x in arts[l])]))
        write(os.path.join(ROOT, PREFIX[lang].strip("/"), "feed.xml"), build_feed(lang, arts, order))
    kept, new = update_sitemap(sitemap_entries)
    update_llms(arts, order, topics)
    menus = update_menus()
    print(f"Geschrieben: {written} Seiten, Sitemap: {kept} bestehende + {new} Magazin-URLs, Menüs aktualisiert: {menus} Seiten" + (" (CHECK-Modus, nichts geschrieben)" if CHECK_ONLY else ""))

if __name__ == "__main__":
    main()
