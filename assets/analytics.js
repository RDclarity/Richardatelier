/* ============================================================
   RICHARD ATELIER — Tracking-Vorbereitung
   Google Analytics 4 (gtag), Google-Ads-Conversion-Tracking und
   Meta Pixel, vorbereitet aber inaktiv, bis echte IDs unten in
   CONFIG eingetragen werden. Alles läuft hinter einem DSGVO-
   konformen Cookie-Consent-Banner (Opt-in, nicht Opt-out) — ohne
   Zustimmung wird kein einziges Tracking-Skript nachgeladen.
   Nutzt Google Consent Mode v2 (im EWR seit 2024 verlangt):
   Consent-Default ist "denied", bevor irgendein Google-Tag lädt.
   ============================================================ */
(function () {
  "use strict";

  // Die eigentlichen IDs (GA4/Google Ads/Meta Pixel) liegen NICHT hier im
  // Code, sondern als Supabase-Secrets (GA4_MEASUREMENT_ID, GOOGLE_ADS_ID,
  // GOOGLE_ADS_CONVERSION_LABEL, META_PIXEL_ID) und werden zur Laufzeit von
  // richard-atelier-tracking-config abgerufen — so lassen sie sich jederzeit
  // aktualisieren, ohne die Website neu zu deployen. Bis sie gesetzt sind,
  // liefert der Endpoint leere Strings und es passiert clientseitig nichts
  // (der Consent-Banner erscheint trotzdem schon).
  var CONFIG_ENDPOINT = "https://mlubcxdwwsrvcoufnkaf.supabase.co/functions/v1/ra-tracking-config";
  var CONFIG = { GA4_MEASUREMENT_ID: "", GOOGLE_ADS_ID: "", GOOGLE_ADS_CONVERSION_LABEL: "", META_PIXEL_ID: "" };
  var configReady = fetch(CONFIG_ENDPOINT, { headers: { Accept: "application/json" } })
    .then(function (r) { return r.ok ? r.json() : null; })
    .then(function (data) {
      if (!data) return;
      CONFIG.GA4_MEASUREMENT_ID = data.ga4MeasurementId || "";
      CONFIG.GOOGLE_ADS_ID = data.googleAdsId || "";
      CONFIG.GOOGLE_ADS_CONVERSION_LABEL = data.googleAdsConversionLabel || "";
      CONFIG.META_PIXEL_ID = data.metaPixelId || "";
    })
    .catch(function () { /* Kein Tracking-Config verfügbar — bleibt inaktiv, kein Fehler für den Besucher. */ });
  // -----------------------------------------------------------------

  // ---- First-Party-Besuchszählung (eigenes Backend) ----------------
  // Zählt Seitenaufrufe anonym in die eigene Richard-Atelier-Datenbank
  // (Edge Function ra-track). Bewusst datensparsam: kein Cookie, keine
  // IP, kein Fingerprint, nur Pfad/Referrer/Sprache und eine zufällige,
  // rein anonyme Session-ID im sessionStorage (verfällt beim Schließen
  // des Tabs). Weil keinerlei personenbezogene Daten verarbeitet werden,
  // läuft diese reine Aggregat-Statistik unabhängig vom Consent-Banner.
  var TRACK_ENDPOINT = "https://mlubcxdwwsrvcoufnkaf.supabase.co/functions/v1/ra-track";
  function anonSessionId() {
    try {
      var sid = sessionStorage.getItem("ra-sid");
      if (!sid) {
        sid = (window.crypto && window.crypto.randomUUID)
          ? window.crypto.randomUUID()
          : (Date.now().toString(36) + Math.random().toString(36).slice(2, 10));
        sessionStorage.setItem("ra-sid", sid);
      }
      return sid;
    } catch (e) { return null; }
  }
  function trackPageView() {
    try {
      var payload = JSON.stringify({
        path: location.pathname + location.search,
        referrer: document.referrer || null,
        lang: document.documentElement.lang || null,
        session_id: anonSessionId(),
      });
      // Bewusst als CORS-"simple request" (text/plain, ohne Credentials):
      // kein Preflight, und der Wildcard-CORS-Header des Endpoints greift.
      // Der Server liest den Body unabhängig vom Content-Type als JSON.
      // keepalive überlebt auch einen sofortigen Seitenwechsel.
      fetch(TRACK_ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "text/plain;charset=UTF-8" },
        body: payload,
        keepalive: true,
        credentials: "omit",
        mode: "cors",
      }).catch(function () {});
    } catch (e) { /* Tracking ist best effort — niemals die Seite stören. */ }
  }
  trackPageView();
  // -----------------------------------------------------------------

  var STORAGE_KEY = "ra-consent"; // "granted" | "denied"

  function getConsent() {
    try { return localStorage.getItem(STORAGE_KEY); } catch (e) { return null; }
  }
  function setConsent(value) {
    try { localStorage.setItem(STORAGE_KEY, value); } catch (e) {}
  }

  // Andere Skripte (Formulare) können das lesen, um z. B. ein
  // Hidden-Feld "marketing_consent" mitzuschicken (serverseitiges
  // Meta-CAPI-Event darf nur bei granted feuern).
  window.raConsent = getConsent();

  // ---- Google Consent Mode v2: Default "denied", bevor irgendein
  // Google-Tag lädt. ------------------------------------------------
  window.dataLayer = window.dataLayer || [];
  function gtag() { window.dataLayer.push(arguments); }
  window.gtag = gtag;
  gtag("consent", "default", {
    ad_storage: "denied",
    ad_user_data: "denied",
    ad_personalization: "denied",
    analytics_storage: "denied",
    wait_for_update: 500,
  });

  var scriptsLoaded = false;

  function loadScript(src, onload) {
    var s = document.createElement("script");
    s.async = true;
    s.src = src;
    if (onload) s.onload = onload;
    document.head.appendChild(s);
  }

  function activateTracking() {
    if (scriptsLoaded) return;
    scriptsLoaded = true;

    configReady.then(function () {
      gtag("consent", "update", {
        ad_storage: "granted",
        ad_user_data: "granted",
        ad_personalization: "granted",
        analytics_storage: "granted",
      });

      var gtagId = CONFIG.GA4_MEASUREMENT_ID || CONFIG.GOOGLE_ADS_ID;
      if (gtagId) {
        loadScript("https://www.googletagmanager.com/gtag/js?id=" + gtagId, function () {
          gtag("js", new Date());
          if (CONFIG.GA4_MEASUREMENT_ID) gtag("config", CONFIG.GA4_MEASUREMENT_ID);
          if (CONFIG.GOOGLE_ADS_ID) gtag("config", CONFIG.GOOGLE_ADS_ID);
        });
      }

      if (CONFIG.META_PIXEL_ID) {
        /* eslint-disable */
        (function (f, b, e, v, n, t, s) {
          if (f.fbq) return; n = f.fbq = function () { n.callMethod ? n.callMethod.apply(n, arguments) : n.queue.push(arguments); };
          if (!f._fbq) f._fbq = n; n.push = n; n.loaded = true; n.version = "2.0"; n.queue = [];
          t = b.createElement(e); t.async = true; t.src = v;
          s = b.getElementsByTagName(e)[0]; s.parentNode.insertBefore(t, s);
        })(window, document, "script", "https://connect.facebook.net/en_US/fbevents.js");
        /* eslint-enable */
        window.fbq("init", CONFIG.META_PIXEL_ID);
        window.fbq("track", "PageView");
      }
    });
  }

  // Conversion-Helfer, von den Danke-Seiten aufgerufen (erfolgreiche
  // Formular-Übermittlung = Lead). Kein Effekt ohne Consent und ohne
  // konfigurierte IDs — kann also schon jetzt überall aufgerufen
  // werden, ohne dass etwas passiert, bis CONFIG befüllt ist.
  window.raTrackConversion = function (label) {
    if (getConsent() !== "granted") return;
    configReady.then(function () {
      if (window.gtag) {
        if (CONFIG.GA4_MEASUREMENT_ID) {
          window.gtag("event", "generate_lead", { event_category: label || "lead" });
        }
        if (CONFIG.GOOGLE_ADS_ID && CONFIG.GOOGLE_ADS_CONVERSION_LABEL) {
          window.gtag("event", "conversion", {
            send_to: CONFIG.GOOGLE_ADS_ID + "/" + CONFIG.GOOGLE_ADS_CONVERSION_LABEL,
          });
        }
      }
      if (window.fbq) window.fbq("track", "Lead");
    });
  };

  // ---- Telefon-/E-Mail-/WhatsApp-Klicks als Meta-Lead-Event ------------
  // Auf jeder Seite, in jeder Sprache: ein Klick auf einen tel:-, mailto:-
  // oder wa.me-Link zählt als Kontaktaufnahme, genau wie ein abgesendetes
  // Formular. Feuert sowohl das clientseitige Pixel-Event (fbq) als auch,
  // mit derselben Event-ID zur Deduplizierung, ein serverseitiges
  // Conversions-API-Event (robuster gegen Adblocker/ITP) über
  // ra-meta-click-event. Ohne Einwilligung passiert nichts.
  var META_CLICK_ENDPOINT = "https://mlubcxdwwsrvcoufnkaf.supabase.co/functions/v1/ra-meta-click-event";
  function readCookie(name) {
    var match = document.cookie.match(new RegExp("(?:^|; )" + name + "=([^;]*)"));
    return match ? decodeURIComponent(match[1]) : undefined;
  }
  function trackContactClick(type) {
    if (getConsent() !== "granted") return;
    var eventId = (window.crypto && window.crypto.randomUUID)
      ? window.crypto.randomUUID()
      : (Date.now().toString(36) + Math.random().toString(36).slice(2, 10));
    configReady.then(function () {
      if (window.fbq) {
        window.fbq("track", "Lead", { content_category: type + "_click" }, { eventID: eventId });
      }
      try {
        fetch(META_CLICK_ENDPOINT, {
          method: "POST",
          keepalive: true,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            type: type,
            eventId: eventId,
            url: window.location.href,
            fbp: readCookie("_fbp"),
            fbc: readCookie("_fbc"),
          }),
        }).catch(function () {});
      } catch (e) { /* Tracking ist best effort — darf den Klick nie stören. */ }
    });
  }
  document.addEventListener("click", function (e) {
    var link = e.target.closest
      ? e.target.closest('a[href^="tel:"], a[href^="mailto:"], a[href^="https://wa.me/"]')
      : null;
    if (!link) return;
    var type = link.href.indexOf("mailto:") === 0
      ? "email"
      : (link.href.indexOf("wa.me") > -1 ? "whatsapp" : "phone");
    trackContactClick(type);
  });

  // ---- Consent-Banner (nur einblenden, solange keine Wahl
  // getroffen wurde) --------------------------------------------------
  var LANG = (document.documentElement.lang || "de").slice(0, 2);
  // Root-relative (nicht "../"-basiert), weil analytics.js auf jeder Seite in
  // beliebiger Verzeichnistiefe läuft und die eigene Tiefe nicht kennt —
  // funktioniert unter der eigenen Domain unabhängig von der Aufruftiefe.
  var TXT = {
    de: { text: "Wir verwenden Cookies für Analyse und Marketing, um diese Website zu verbessern. Mehr dazu in unserer ", accept: "Akzeptieren", decline: "Ablehnen", privacyHref: "/datenschutz/", privacyLabel: "Datenschutzerklärung" },
    en: { text: "We use cookies for analytics and marketing to improve this website. More in our ", accept: "Accept", decline: "Decline", privacyHref: "/en/privacy-policy/", privacyLabel: "privacy policy" },
    it: { text: "Utilizziamo cookie per analisi e marketing per migliorare questo sito. Maggiori informazioni nella nostra ", accept: "Accetta", decline: "Rifiuta", privacyHref: "/it/privacy/", privacyLabel: "informativa sulla privacy" },
    es: { text: "Utilizamos cookies con fines analíticos y de marketing para mejorar este sitio. Más información en nuestra ", accept: "Aceptar", decline: "Rechazar", privacyHref: "/es/privacidad/", privacyLabel: "política de privacidad" },
  };
  var t = TXT[LANG] || TXT.de;

  function showBanner() {
    if (document.getElementById("ra-consent-banner")) return;
    var bar = document.createElement("div");
    bar.id = "ra-consent-banner";
    bar.setAttribute("role", "dialog");
    bar.setAttribute("aria-label", "Cookie-Consent");
    bar.style.cssText =
      "position:fixed;left:0;right:0;bottom:0;z-index:9999;background:#211D17;color:#F7F4EE;" +
      "padding:1rem 1.25rem;display:flex;flex-wrap:wrap;align-items:center;gap:0.9rem;" +
      "font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;font-size:0.82rem;line-height:1.5;" +
      "box-shadow:0 -2px 20px rgba(0,0,0,0.25);";

    var p = document.createElement("p");
    p.style.cssText = "margin:0;flex:1 1 260px;min-width:200px;";
    p.appendChild(document.createTextNode(t.text));
    var privacyLink = document.createElement("a");
    privacyLink.href = t.privacyHref;
    privacyLink.textContent = t.privacyLabel;
    privacyLink.style.cssText = "color:inherit;text-decoration:underline;text-underline-offset:0.15em;";
    p.appendChild(privacyLink);
    p.appendChild(document.createTextNode("."));

    var actions = document.createElement("div");
    actions.style.cssText = "display:flex;gap:0.6rem;flex:0 0 auto;";

    var declineBtn = document.createElement("button");
    declineBtn.type = "button";
    declineBtn.textContent = t.decline;
    declineBtn.style.cssText =
      "background:transparent;color:#F7F4EE;border:1px solid rgba(247,244,238,0.4);" +
      "border-radius:999px;padding:0.5em 1.1em;font-size:0.8rem;cursor:pointer;";

    var acceptBtn = document.createElement("button");
    acceptBtn.type = "button";
    acceptBtn.textContent = t.accept;
    acceptBtn.style.cssText =
      "background:#B59C7A;color:#211D17;border:none;border-radius:999px;" +
      "padding:0.5em 1.2em;font-size:0.8rem;font-weight:600;cursor:pointer;";

    actions.appendChild(declineBtn);
    actions.appendChild(acceptBtn);
    bar.appendChild(p);
    bar.appendChild(actions);
    document.body.appendChild(bar);

    acceptBtn.addEventListener("click", function () {
      setConsent("granted");
      window.raConsent = "granted";
      activateTracking();
      bar.remove();
    });
    declineBtn.addEventListener("click", function () {
      setConsent("denied");
      window.raConsent = "denied";
      bar.remove();
    });
  }

  function init() {
    var existing = getConsent();
    if (existing === "granted") {
      activateTracking();
    } else if (existing !== "denied") {
      showBanner();
    }
  }

  if (document.body) init();
  else document.addEventListener("DOMContentLoaded", init);
})();
