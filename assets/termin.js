/* ============================================================
   RICHARD ATELIER — Erstgespräch buchen (/termin/)
   Kostenloses 15-Minuten-Erstgespräch, telefonisch oder per Video.
   Drei Schritte: Gesprächsart + Tag + Uhrzeit → Daten → Bestätigung.
   Kein Kalender-Anschluss: freie Slots = feste Zeitfenster minus bereits
   gebuchte Termine (GET auf die Edge Function). Vanilla JS.

   ACHTUNG: Die Slot-Logik (Zeitfenster, Vorlauf, Takt) existiert zweimal,
   inhaltlich identisch — hier und serverseitig in
   HRD-Dashboard/supabase/functions/_shared/raTerminZeiten.ts. Bei einer
   Änderung BEIDE anpassen.
   ============================================================ */
(function () {
  "use strict";

  var ENDPOINT = "https://nbnpeoiqiakwnnkorxim.supabase.co/functions/v1/richard-atelier-termin";
  var ZEITZONE = "Europe/Vienna";
  var DAUER = 15;            /* Minuten je Gespräch = Raster der Startzeiten */
  var VORLAUF = 120;         /* frühestens so viele Minuten ab jetzt */
  var BUCHBAR_TAGE = 42;     /* so weit ist der Kalender offen */
  var ZEITFENSTER = { 1: [["08:00", "20:00"]], 2: [["08:00", "20:00"]], 3: [["08:00", "20:00"]], 4: [["08:00", "20:00"]], 5: [["08:00", "20:00"]] };
  var MONATE = ["Jänner", "Februar", "März", "April", "Mai", "Juni", "Juli", "August", "September", "Oktober", "November", "Dezember"];
  var WOCHENTAGE = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"];

  /* ---------- Wiener Ortszeit ---------- */
  var FMT = new Intl.DateTimeFormat("en-US", { timeZone: ZEITZONE, year: "numeric", month: "numeric", day: "numeric", hour: "numeric", minute: "numeric", hourCycle: "h23" });
  function wienTeile(d) {
    var t = {};
    FMT.formatToParts(d).forEach(function (p) { if (p.type !== "literal") t[p.type] = Number(p.value); });
    return { jahr: t.year, monat: t.month, tag: t.day, stunde: t.hour % 24, minute: t.minute };
  }
  function wienOffsetMs(d) {
    var t = wienTeile(d);
    var minuteGenau = Math.floor(d.getTime() / 60000) * 60000;
    return Date.UTC(t.jahr, t.monat - 1, t.tag, t.stunde, t.minute) - minuteGenau;
  }
  function wienZuDate(tag, hhmm) {
    var p = hhmm.split(":").map(Number);
    var naiv = Date.UTC(tag.jahr, tag.monat - 1, tag.tag, p[0], p[1]);
    var erster = naiv - wienOffsetMs(new Date(naiv));
    return new Date(naiv - wienOffsetMs(new Date(erster)));
  }
  function tagInWien(d) { var t = wienTeile(d || new Date()); return { jahr: t.jahr, monat: t.monat, tag: t.tag }; }
  function uhrzeitInWien(d) { var t = wienTeile(d); return (t.stunde < 10 ? "0" : "") + t.stunde + ":" + (t.minute < 10 ? "0" : "") + t.minute; }
  function wochentag(tag) { return new Date(Date.UTC(tag.jahr, tag.monat - 1, tag.tag)).getUTCDay(); }
  function tagPlus(tag, n) { var d = new Date(Date.UTC(tag.jahr, tag.monat - 1, tag.tag + n)); return { jahr: d.getUTCFullYear(), monat: d.getUTCMonth() + 1, tag: d.getUTCDate() }; }
  function tageZwischen(a, b) { return Math.round((Date.UTC(b.jahr, b.monat - 1, b.tag) - Date.UTC(a.jahr, a.monat - 1, a.tag)) / 86400000); }
  function tagKey(tag) { return tag.jahr + "-" + (tag.monat < 10 ? "0" : "") + tag.monat + "-" + (tag.tag < 10 ? "0" : "") + tag.tag; }

  function slotsFuerTag(tag) {
    var jetzt = new Date();
    var abstand = tageZwischen(tagInWien(jetzt), tag);
    if (abstand < 0 || abstand > BUCHBAR_TAGE) return [];
    var fruehestens = jetzt.getTime() + VORLAUF * 60000;
    var slots = [];
    (ZEITFENSTER[wochentag(tag)] || []).forEach(function (f) {
      var ende = wienZuDate(tag, f[1]).getTime();
      for (var t = wienZuDate(tag, f[0]).getTime(); t + DAUER * 60000 <= ende; t += DAUER * 60000) {
        if (t >= fruehestens) slots.push(new Date(t));
      }
    });
    return slots;
  }

  /* ---------- Zustand ---------- */
  var root = document.querySelector("[data-termin]");
  if (!root) return;
  var $ = function (sel) { return root.querySelector(sel); };
  var belegt = {};                 /* ms → true */
  var art = "telefon";
  var gewaehlterTag = null;
  var gewaehlterSlot = null;
  var heute = tagInWien();
  var monatAnzeige = { jahr: heute.jahr, monat: heute.monat };
  var letzterTag = tagPlus(heute, BUCHBAR_TAGE);

  function freieSlots(tag) {
    return slotsFuerTag(tag).filter(function (s) { return !belegt[s.getTime()]; });
  }

  /* ---------- Schritt 1: Art ---------- */
  Array.prototype.slice.call(root.querySelectorAll("[data-art] .chip")).forEach(function (chip) {
    chip.addEventListener("click", function () {
      art = chip.getAttribute("data-value");
      Array.prototype.slice.call(root.querySelectorAll("[data-art] .chip")).forEach(function (c) { c.setAttribute("aria-pressed", c === chip ? "true" : "false"); });
      $("[data-art-hinweis]").textContent = art === "video"
        ? "Den Teams-Link schicken wir Ihnen nach der Buchung per E-Mail — Sie brauchen keine App."
        : "Wir rufen Sie zum vereinbarten Zeitpunkt unter Ihrer Nummer an.";
    });
  });

  /* ---------- Kalender ---------- */
  function renderKalender() {
    var grid = $("[data-kalender]");
    grid.innerHTML = "";
    $("[data-monat]").textContent = MONATE[monatAnzeige.monat - 1] + " " + monatAnzeige.jahr;
    var vorher = monatAnzeige.jahr * 12 + monatAnzeige.monat > heute.jahr * 12 + heute.monat;
    var nachher = monatAnzeige.jahr * 12 + monatAnzeige.monat < letzterTag.jahr * 12 + letzterTag.monat;
    $("[data-monat-zurueck]").disabled = !vorher;
    $("[data-monat-vor]").disabled = !nachher;

    WOCHENTAGE.forEach(function (w) {
      var el = document.createElement("div"); el.className = "termin-wt"; el.textContent = w; grid.appendChild(el);
    });
    var erster = { jahr: monatAnzeige.jahr, monat: monatAnzeige.monat, tag: 1 };
    var leer = (wochentag(erster) + 6) % 7;   /* Montag = 0 */
    for (var i = 0; i < leer; i++) { var l = document.createElement("div"); grid.appendChild(l); }
    var tageImMonat = new Date(Date.UTC(monatAnzeige.jahr, monatAnzeige.monat, 0)).getUTCDate();
    for (var d = 1; d <= tageImMonat; d++) {
      (function (tag) {
        var b = document.createElement("button");
        b.type = "button"; b.className = "termin-tag"; b.textContent = String(tag.tag);
        var frei = freieSlots(tag).length;
        var vergangen = tageZwischen(heute, tag) < 0;
        if (!frei) { b.disabled = true; b.setAttribute("aria-label", tag.tag + ". " + MONATE[tag.monat - 1] + (vergangen ? "" : " — nicht verfügbar")); }
        if (gewaehlterTag && tagKey(gewaehlterTag) === tagKey(tag)) b.setAttribute("aria-pressed", "true");
        if (tagKey(tag) === tagKey(heute)) b.classList.add("is-heute");
        b.addEventListener("click", function () { gewaehlterTag = tag; gewaehlterSlot = null; renderKalender(); renderSlots(); });
        grid.appendChild(b);
      })({ jahr: monatAnzeige.jahr, monat: monatAnzeige.monat, tag: d });
    }
  }
  $("[data-monat-zurueck]").addEventListener("click", function () {
    monatAnzeige = monatAnzeige.monat === 1 ? { jahr: monatAnzeige.jahr - 1, monat: 12 } : { jahr: monatAnzeige.jahr, monat: monatAnzeige.monat - 1 }; renderKalender();
  });
  $("[data-monat-vor]").addEventListener("click", function () {
    monatAnzeige = monatAnzeige.monat === 12 ? { jahr: monatAnzeige.jahr + 1, monat: 1 } : { jahr: monatAnzeige.jahr, monat: monatAnzeige.monat + 1 }; renderKalender();
  });

  /* ---------- Uhrzeiten ---------- */
  function renderSlots() {
    var box = $("[data-slots]");
    var titel = $("[data-slots-titel]");
    box.innerHTML = "";
    $("[data-weiter]").disabled = !gewaehlterSlot;
    if (!gewaehlterTag) { titel.textContent = "Bitte zuerst einen Tag wählen."; return; }
    var slots = freieSlots(gewaehlterTag);
    titel.textContent = WOCHENTAGE[(wochentag(gewaehlterTag) + 6) % 7] + ", " + gewaehlterTag.tag + ". " + MONATE[gewaehlterTag.monat - 1] + " — Uhrzeit wählen";
    if (!slots.length) { box.innerHTML = '<p class="section-note">An diesem Tag ist leider nichts mehr frei.</p>'; return; }
    var gruppen = [["Vormittag", 8, 12], ["Nachmittag", 12, 17], ["Abend", 17, 20]];
    gruppen.forEach(function (g) {
      var inGruppe = slots.filter(function (s) { var h = wienTeile(s).stunde; return h >= g[1] && h < g[2]; });
      if (!inGruppe.length) return;
      var h = document.createElement("div"); h.className = "termin-gruppe"; h.textContent = g[0]; box.appendChild(h);
      var row = document.createElement("div"); row.className = "chip-row"; box.appendChild(row);
      inGruppe.forEach(function (s) {
        var c = document.createElement("button"); c.type = "button"; c.className = "chip chip--slot"; c.textContent = uhrzeitInWien(s);
        c.setAttribute("aria-pressed", gewaehlterSlot && gewaehlterSlot.getTime() === s.getTime() ? "true" : "false");
        c.addEventListener("click", function () { gewaehlterSlot = s; renderSlots(); });
        row.appendChild(c);
      });
    });
  }

  /* ---------- Belegung laden ---------- */
  function ladeBelegung() {
    var von = wienZuDate(heute, "00:00"), bis = wienZuDate(tagPlus(heute, BUCHBAR_TAGE + 1), "00:00");
    return fetch(ENDPOINT + "?von=" + encodeURIComponent(von.toISOString()) + "&bis=" + encodeURIComponent(bis.toISOString()), { headers: { Accept: "application/json" } })
      .then(function (r) { return r.ok ? r.json() : { belegt: [] }; })
      .then(function (res) { belegt = {}; (res.belegt || []).forEach(function (iso) { belegt[new Date(iso).getTime()] = true; }); })
      .catch(function () { belegt = {}; });
  }

  /* ---------- Schritte ---------- */
  function zeige(schritt) {
    Array.prototype.slice.call(root.querySelectorAll("[data-schritt]")).forEach(function (el) { el.hidden = el.getAttribute("data-schritt") !== schritt; });
    Array.prototype.slice.call(root.querySelectorAll("[data-schritt-punkt]")).forEach(function (el) {
      var n = el.getAttribute("data-schritt-punkt"), reihenfolge = ["termin", "daten", "fertig"];
      el.setAttribute("data-state", n === schritt ? "aktiv" : reihenfolge.indexOf(n) < reihenfolge.indexOf(schritt) ? "fertig" : "");
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }
  function terminZusammenfassung() {
    var d = gewaehlterSlot;
    return d.toLocaleDateString("de-AT", { timeZone: ZEITZONE, weekday: "long", day: "numeric", month: "long", year: "numeric" }) +
      ", " + uhrzeitInWien(d) + "–" + uhrzeitInWien(new Date(d.getTime() + DAUER * 60000)) + " Uhr · " + (art === "video" ? "Video-Call (Microsoft Teams)" : "Telefonat");
  }

  $("[data-weiter]").addEventListener("click", function () {
    if (!gewaehlterSlot) return;
    $("[data-zusammenfassung]").textContent = terminZusammenfassung();
    zeige("daten");
    var first = $("#t-vorname"); if (first) first.focus();
  });
  $("[data-zurueck]").addEventListener("click", function () { zeige("termin"); });

  /* Erreichbarkeits-Chips */
  var erreichbar = "telefon";
  Array.prototype.slice.call(root.querySelectorAll("[data-erreichbar] .chip")).forEach(function (chip) {
    chip.addEventListener("click", function () {
      erreichbar = chip.getAttribute("data-value");
      Array.prototype.slice.call(root.querySelectorAll("[data-erreichbar] .chip")).forEach(function (c) { c.setAttribute("aria-pressed", c === chip ? "true" : "false"); });
    });
  });

  /* ---------- Absenden ---------- */
  var form = $("form");
  var leadId = (window.crypto && window.crypto.randomUUID) ? window.crypto.randomUUID() : (Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 10));
  form.addEventListener("submit", function (e) {
    e.preventDefault();
    var note = form.querySelector(".form-note");
    var btn = form.querySelector("button[type='submit']");
    var v = function (n) { var el = form.querySelector("[name='" + n + "']"); return el ? el.value.trim() : ""; };
    var fehler = null;
    if (!v("vorname")) fehler = "Bitte Vornamen angeben.";
    else if (!v("nachname")) fehler = "Bitte Nachnamen angeben.";
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v("email"))) fehler = "Bitte eine gültige E-Mail-Adresse angeben.";
    else if (!/^[0-9+()\-\s]{6,}$/.test(v("telefon"))) fehler = "Bitte eine gültige Telefonnummer angeben.";
    else if (!form.querySelector("[name='datenschutz']").checked) fehler = "Bitte der Datenschutzerklärung zustimmen.";
    else if (!gewaehlterSlot) fehler = "Bitte zuerst einen Termin wählen.";
    if (fehler) { note.textContent = fehler; return; }

    note.textContent = "Wird gebucht …";
    btn.disabled = true;
    fetch(ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({
        beginn: gewaehlterSlot.toISOString(),
        art: art,
        erreichbar_per: erreichbar,
        vorname: v("vorname"), nachname: v("nachname"), email: v("email"), telefon: v("telefon"), wuensche: v("wuensche"),
        datenschutz: true,
        company: v("company"),
        lead_id: leadId,
        marketing_consent: window.raConsent || "",
        quelle: document.referrer || "direkt",
      }),
    })
      .then(function (r) { return r.json().then(function (j) { return { status: r.status, body: j }; }).catch(function () { return { status: r.status, body: {} }; }); })
      .then(function (res) {
        if (res.body && res.body.success) {
          $("[data-fertig-termin]").textContent = res.body.wann || terminZusammenfassung();
          $("[data-fertig-hinweis]").textContent = art === "video"
            ? "Den Teams-Link erhalten Sie in einer separaten Einladung per E-Mail — eine Bestätigung mit Kalenderdatei ist bereits unterwegs an " + v("email") + "."
            : "Wir rufen Sie zum vereinbarten Zeitpunkt unter " + v("telefon") + " an. Eine Bestätigung mit Kalenderdatei ist unterwegs an " + v("email") + ".";
          var ics = $("[data-ics]");
          if (res.body.ics && ics) {
            ics.hidden = false;
            ics.addEventListener("click", function () {
              var url = URL.createObjectURL(new Blob([res.body.ics], { type: "text/calendar;charset=utf-8" }));
              var a = document.createElement("a"); a.href = url; a.download = "Erstgespraech-Richard-Atelier.ics"; document.body.appendChild(a); a.click(); a.remove();
              setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
            });
          }
          if (typeof window.raTrackConversion === "function") window.raTrackConversion("termin");
          zeige("fertig");
        } else if (res.status === 409) {
          note.textContent = "";
          btn.disabled = false;
          belegt[gewaehlterSlot.getTime()] = true;
          gewaehlterSlot = null;
          window.alert("Dieser Termin wurde leider gerade vergeben. Bitte wählen Sie eine andere Uhrzeit.");
          zeige("termin"); renderKalender(); renderSlots();
        } else {
          note.textContent = (res.body && res.body.error) || "Das hat leider nicht geklappt. Bitte erneut versuchen oder rufen Sie uns an: +43 660 3607188.";
          btn.disabled = false;
        }
      })
      .catch(function () {
        note.textContent = "Das hat leider nicht geklappt. Bitte erneut versuchen oder rufen Sie uns an: +43 660 3607188.";
        btn.disabled = false;
      });
  });

  /* ---------- Start ---------- */
  $("[data-slots-titel]").textContent = "Freie Termine werden geladen …";
  ladeBelegung().then(function () { renderKalender(); renderSlots(); });
  zeige("termin");
})();
