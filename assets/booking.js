/* ==========================================================
   Buchungsfenster — New-York-Seite (/en/new-york/)

   Ablauf: 1 Termin (Kalender, New-York-Zeit) → 2 Name, E-Mail,
   Telefon, Rechnungsadresse → 3 Zusammenfassung mit Preis →
   verbindlich buchen. Der Preis erscheint bewusst erst in Schritt 3.

   data-api am #booking-Element = Adresse des Buchungs-Backends
   (Projekt tischlerkultur-nyc, Angebot "ra-consultation"). Freie
   Termine kommen dann aus Richards Kalender; die Buchung legt den
   Teams-Termin an und schickt automatisch die Rechnung (PDF,
   fortlaufende Nummer, Zahlung per Überweisung).
   Ist data-api leer, läuft derselbe Ablauf als Terminanfrage über
   das Kontaktformular, und Richard schickt Termin und Rechnung.
   ========================================================== */
(function () {
  "use strict";

  var root = document.getElementById("booking");
  if (!root) return;

  var API = (root.getAttribute("data-api") || "").replace(/\/$/, "");
  var LIVE = !!API;
  var PRICE = root.getAttribute("data-price") || "";
  var CONTACT_ENDPOINT = root.getAttribute("data-contact-endpoint");
  var OFFER = "ra-consultation";
  var TZ = "America/New_York";
  // Nur für die Anfrage-Variante; live bestimmt der Server die Zeiten.
  var FALLBACK_TIMES = ["8:00 AM", "9:30 AM", "11:00 AM", "12:30 PM", "2:00 PM"];
  var STEPS = ["Time", "Details", "Confirm"];

  var panel = root.querySelector(".bk-panel");
  var body = root.querySelector(".bk-body");
  var stepsEl = root.querySelector(".bk-steps");

  var state = {
    step: 0, date: "", time: "", name: "", email: "", phone: "", billing: "",
    slots: null, slotsFailed: false, notice: "", busy: false, booked: null
  };

  var store = {
    get: function (k) { try { return sessionStorage.getItem(k); } catch (e) { return null; } },
    set: function (k, v) { try { sessionStorage.setItem(k, v); } catch (e) {} },
    del: function (k) { try { sessionStorage.removeItem(k); } catch (e) {} }
  };
  var esc = function (s) {
    return String(s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; });
  };
  var api = function (path, data) {
    return fetch(API + path, data ? { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) } : undefined)
      .then(function (r) { return r.json().catch(function () { return {}; }).then(function (d) { return { ok: r.ok, status: r.status, data: d }; }); });
  };
  var track = function (label) { if (window.raTrackConversion) window.raTrackConversion(label); };

  /* ---------- Datum & Zeit (immer New York) ---------- */
  function nyParts(d) {
    var p = new Intl.DateTimeFormat("en-US", { timeZone: TZ, hourCycle: "h23", year: "numeric", month: "numeric", day: "numeric", hour: "numeric", minute: "numeric" }).formatToParts(d);
    var get = function (t) { return +p.find(function (x) { return x.type === t; }).value; };
    return { y: get("year"), m: get("month"), d: get("day"), h: get("hour"), min: get("minute") };
  }
  function nyToUtc(dateStr, label) {
    var m = /^(\d{1,2}):(\d{2}) (AM|PM)$/.exec(label);
    var h = (+m[1] % 12) + (m[3] === "PM" ? 12 : 0);
    var ymd = dateStr.split("-").map(Number);
    var wanted = Date.UTC(ymd[0], ymd[1] - 1, ymd[2], h, +m[2]);
    var guess = wanted;
    for (var i = 0; i < 2; i++) {
      var p = nyParts(new Date(guess));
      guess += wanted - Date.UTC(p.y, p.m - 1, p.d, p.h, p.min);
    }
    return new Date(guess);
  }
  var noon = function (iso) { return new Date(iso + "T12:00:00Z"); };
  var fmt = function (iso, o) { return noon(iso).toLocaleDateString("en-US", Object.assign({ timeZone: "UTC" }, o)); };
  var longDate = function (iso) { return fmt(iso, { weekday: "long", month: "long", day: "numeric" }); };
  var viewerTz = (function () { try { return Intl.DateTimeFormat().resolvedOptions().timeZone; } catch (e) { return TZ; } })();
  var nyOffset = function (d) { var p = nyParts(d); return Date.UTC(p.y, p.m - 1, p.d, p.h, p.min) - Math.floor(d.getTime() / 60000) * 60000; };
  function localLabel(dateStr, label) {
    var at = nyToUtc(dateStr, label);
    if (viewerTz === TZ || new Date(at).getTimezoneOffset() * -60000 === nyOffset(at)) return "";
    return at.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }) + " your time";
  }

  function fallbackSlots() {
    var p = nyParts(new Date());
    var d = new Date(Date.UTC(p.y, p.m - 1, p.d, 12));
    var out = [], skip = 3;
    while (out.length < 15) {
      d.setUTCDate(d.getUTCDate() + 1);
      if (d.getUTCDay() % 6 === 0) continue;
      if (skip > 0) { skip--; continue; }
      out.push({ date: d.toISOString().slice(0, 10), times: FALLBACK_TIMES.slice() });
    }
    return out;
  }
  function loadSlots() {
    if (!LIVE) { state.slots = fallbackSlots(); return Promise.resolve(); }
    state.slots = null; state.slotsFailed = false;
    return api("/api/slots").then(function (r) {
      if (!r.ok) throw new Error();
      state.slots = r.data.slots || [];
    }).catch(function () { state.slots = []; state.slotsFailed = true; }).then(function () { if (state.step === 0) render(); });
  }
  var timesFor = function (date) {
    var s = (state.slots || []).find(function (x) { return x.date === date; });
    return s ? s.times : [];
  };

  /* ---------- Ansichten ---------- */
  // Nur die buchbaren Wochen, über den Monatswechsel hinweg — kein halb leerer Monat.
  function calendarHtml() {
    var slots = state.slots || [];
    if (!slots.length) return "";
    if (!timesFor(state.date).length) state.date = slots[0].date;
    var open = {};
    slots.forEach(function (s) { open[s.date] = true; });
    var day = noon(slots[0].date);
    day.setUTCDate(day.getUTCDate() - day.getUTCDay());
    var end = noon(slots[slots.length - 1].date);
    end.setUTCDate(end.getUTCDate() + 6 - end.getUTCDay());
    var cells = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"].map(function (d) { return '<span class="dow" aria-hidden="true">' + d + "</span>"; });
    for (var first = true; day <= end; day.setUTCDate(day.getUTCDate() + 1), first = false) {
      var iso = day.toISOString().slice(0, 10);
      var isOpen = open[iso];
      var mon = first || day.getUTCDate() === 1 ? "<small>" + fmt(iso, { month: "short" }) + "</small>" : "";
      cells.push('<button type="button" class="bk-day' + (isOpen ? " open" : "") + (iso === state.date ? " sel" : "") + '"' +
        (isOpen ? ' data-date="' + iso + '" aria-label="' + esc(longDate(iso)) + (iso === state.date ? ", selected" : "") + '"' : ' disabled aria-hidden="true"') + ">" + mon + day.getUTCDate() + "</button>");
    }
    var range = fmt(slots[0].date, { month: "short", day: "numeric" }) + " – " + fmt(slots[slots.length - 1].date, { month: "short", day: "numeric" });
    return '<div class="bk-cal"><p class="bk-month">' + range + '</p><div class="bk-grid" role="group" aria-label="Available days">' + cells.join("") + "</div></div>";
  }

  function timesHtml() {
    if (!state.date) return '<p class="bk-sub">Pick a day with a dot to see the open times.</p>';
    var times = timesFor(state.date);
    if (!times.length) return '<p class="bk-empty">That day just filled up. Please pick another.</p>';
    return '<div class="bk-times"><p class="bk-times-head">' + esc(longDate(state.date)) + " <span>· New York time (ET)</span></p>" +
      '<div class="bk-time-row">' + times.map(function (t) {
        var local = localLabel(state.date, t);
        return '<button type="button" class="bk-time' + (t === state.time ? " sel" : "") + '" data-time="' + esc(t) + '">' + esc(t) + (local ? "<small>" + esc(local) + "</small>" : "") + "</button>";
      }).join("") + "</div></div>";
  }

  function chosenHtml() {
    return '<div class="bk-chosen"><div><b>' + esc(longDate(state.date)) + "</b><span>" + esc(state.time) + " ET · 45-min video call</span></div>" +
      '<button type="button" data-goto="0">Change</button></div>';
  }

  function field(id, label, attrs) {
    return '<div class="bk-field"><label for="bk-' + id + '">' + label + '</label><input id="bk-' + id + '" name="' + id + '" value="' + esc(state[id]) + '" ' + attrs + '>' +
      '<p class="bk-err" data-err="' + id + '" hidden></p></div>';
  }

  var views = [
    function () {
      var loading = state.slots === null;
      var call = ' <a href="tel:+12126604027">(212) 660-4027</a>';
      return '<h2 tabindex="-1">Choose <strong>a time.</strong></h2>' +
        (state.notice ? '<p class="bk-notice">' + esc(state.notice) + "</p>" : "") +
        (loading ? '<p class="bk-sub">Loading times …</p>'
          : state.slotsFailed ? '<p class="bk-empty">Times could not load. Reload, or call' + call + ".</p>"
          : !state.slots.length ? '<p class="bk-empty">Fully booked right now. Call' + call + ".</p>"
          : calendarHtml() + timesHtml());
    },
    function () {
      return chosenHtml() +
        '<h2 tabindex="-1">Your <strong>details.</strong></h2>' +
        '<form class="bk-form" novalidate>' +
        '<div style="display:grid;gap:14px">' +
        field("name", "Name", 'autocomplete="name" autocapitalize="words"') +
        field("email", "Email", 'type="email" autocomplete="email" inputmode="email"') +
        field("phone", "Phone", 'type="tel" autocomplete="tel" inputmode="tel"') +
        field("billing", "Billing address", 'autocomplete="street-address" placeholder="Street, city, state, ZIP"') +
        '<div class="bk-hp" aria-hidden="true"><label for="bk-website">Website</label><input id="bk-website" name="website" tabindex="-1" autocomplete="off"></div>' +
        '<button class="bk-go" type="submit">Continue</button>' +
        "</div></form>";
    },
    function () {
      return '<h2 tabindex="-1">Almost there, <strong>' + esc(state.name.split(/\s+/)[0]) + ".</strong></h2>" +
        (state.notice ? '<p class="bk-notice">' + esc(state.notice) + "</p>" : "") +
        '<ul class="bk-summary">' +
        "<li><span>" + esc(fmt(state.date, { weekday: "short", month: "short", day: "numeric" })) + "</span><span>" + esc(state.time) + " ET</span></li>" +
        '<li class="total"><span>Total</span><span>' + esc(PRICE) + "</span></li></ul>" +
        // Vor dem verbindlichen Klick unmissverständlich: kostenpflichtig, Betrag, Rechnung.
        '<p class="bk-fee"><strong>Paid consultation: ' + esc(PRICE) + ".</strong> Invoice by email, payable by bank transfer.</p>" +
        '<p class="bk-err" data-err="form" hidden></p>' +
        '<button class="bk-go" type="button" data-pay' + (state.busy ? " disabled" : "") + ">" + (state.busy ? "Booking …" : "Book for " + esc(PRICE)) + "</button>" +
        '<button class="bk-back" type="button" data-goto="1">Back</button>';
    }
  ];

  function doneHtml() {
    var b = state.booked || {};
    return '<h2 tabindex="-1">Booked, <strong>' + esc(state.name.split(/\s+/)[0]) + ".</strong></h2>" +
      '<div class="bk-chosen"><div><b>' + esc(longDate(state.date)) + "</b><span>" + esc(state.time) + " ET · 45-min video call</span></div></div>" +
      '<p class="bk-sub">' + (LIVE
        ? "Your Teams link and invoice " + esc(b.invoiceNumber || "") + " are on their way to " + esc(state.email) + ". Reply to that email with photos of your space."
        : "Richard confirms by email. Your invoice follows.") + "</p>" +
      '<button class="bk-go" type="button" data-close>Done</button>';
  }

  function render(focus) {
    var done = state.step === 3;
    stepsEl.innerHTML = done ? "" : STEPS.map(function (s, i) {
      return '<li class="' + (i === state.step ? "on" : i < state.step ? "done" : "") + '"' + (i === state.step ? ' aria-current="step"' : "") + "><b>" + (i < state.step ? "✓" : i + 1) + "</b>" + s + "</li>";
    }).join("");
    body.innerHTML = done ? doneHtml() : views[state.step]();
    if (focus) { panel.scrollTop = 0; var h = body.querySelector("h2"); if (h) h.focus({ preventScroll: true }); }
  }
  function setErr(name, msg) {
    var e = body.querySelector('[data-err="' + name + '"]');
    if (e) { e.textContent = msg; e.hidden = !msg; }
    var f = body.querySelector('[name="' + name + '"]');
    if (f) f.setAttribute("aria-invalid", msg ? "true" : "false");
  }

  /* ---------- Fixierte Leiste am Handy ----------
     Erscheint nur, wenn gerade kein anderer Buchungs-Button zu sehen
     ist, und sitzt über dem Cookie-Banner, solange es offen ist. */
  var bar = document.querySelector(".book-bar");
  if (bar) {
    var seen = [];
    if ("IntersectionObserver" in window) {
      var io = new IntersectionObserver(function (entries) {
        entries.forEach(function (en) {
          var i = seen.indexOf(en.target);
          if (en.isIntersecting && i < 0) seen.push(en.target);
          if (!en.isIntersecting && i >= 0) seen.splice(i, 1);
        });
        bar.classList.toggle("show", !seen.length);
      });
      Array.prototype.forEach.call(document.querySelectorAll("main .book-cta"), function (b) { io.observe(b); });
    } else bar.classList.add("show");
    var lift = function () {
      var c = document.getElementById("ra-consent-banner");
      bar.style.setProperty("--bk-lift", c ? c.offsetHeight + "px" : "0px");
    };
    new MutationObserver(lift).observe(document.body, { childList: true });
    lift();
    document.body.classList.add("has-book-bar");
  }

  /* ---------- Öffnen & Schließen ---------- */
  var lastFocus = null;
  function open() {
    lastFocus = document.activeElement;
    root.hidden = false;
    document.body.classList.add("bk-open");
    if (state.slots === null || (!LIVE && !state.slots.length)) loadSlots().then(function () { render(); });
    render(true);
  }
  function close() {
    root.hidden = true;
    document.body.classList.remove("bk-open");
    if (lastFocus && lastFocus.focus) lastFocus.focus();
  }
  Array.prototype.forEach.call(document.querySelectorAll("[data-book]"), function (b) { b.addEventListener("click", function (e) { e.preventDefault(); open(); }); });
  root.querySelector(".bk-close").addEventListener("click", close);
  root.addEventListener("click", function (e) { if (e.target === root) close(); });
  document.addEventListener("keydown", function (e) { if (e.key === "Escape" && !root.hidden) close(); });

  /* ---------- Bedienung ---------- */
  body.addEventListener("click", function (e) {
    var t = e.target.closest("button");
    if (!t) return;
    if (t.hasAttribute("data-date")) {
      state.date = t.getAttribute("data-date");
      if (timesFor(state.date).indexOf(state.time) < 0) state.time = "";
      render();
      var first = body.querySelector(".bk-time");
      if (first) first.focus();
      return;
    }
    if (t.hasAttribute("data-time")) {
      state.time = t.getAttribute("data-time");
      state.notice = "";
      state.step = 1;
      render(true);
      var nameField = body.querySelector("#bk-name");
      if (nameField && !nameField.value) nameField.focus();
      return;
    }
    if (t.hasAttribute("data-goto")) { state.notice = ""; state.step = +t.getAttribute("data-goto"); render(true); return; }
    if (t.hasAttribute("data-pay")) { submit(); return; }
    if (t.hasAttribute("data-close")) { close(); return; }
  });

  body.addEventListener("submit", function (e) {
    e.preventDefault();
    var f = e.target;
    ["name", "email", "phone", "billing"].forEach(function (k) { state[k] = f.elements[k].value.trim(); });
    state.website = f.elements.website.value;
    var bad = null;
    var check = function (k, ok, msg) { setErr(k, ok ? "" : msg); if (!ok && !bad) bad = k; };
    check("name", state.name.length > 1, "Please enter your name.");
    check("email", /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(state.email), "Please enter a valid email, like name@example.com.");
    check("phone", state.phone.replace(/\D/g, "").length >= 10, "Please enter a phone number with area code.");
    check("billing", state.billing.length > 8, "Please enter your billing address.");
    if (bad) { f.elements[bad].focus(); return; }
    state.step = 2;
    render(true);
  });
  body.addEventListener("input", function (e) { if (e.target.name) setErr(e.target.name, ""); });

  function setBusy(on) { state.busy = on; var b = body.querySelector("[data-pay]"); if (b) { b.disabled = on; } if (on) render(); }

  function submit() {
    setErr("form", "");
    setBusy(true);
    if (!LIVE) return requestByForm();
    var form = { offer: OFFER, date: state.date, time: state.time, name: state.name, email: state.email, phone: state.phone, billing: state.billing, website: state.website || "" };
    api("/api/book", form).then(function (r) {
      state.busy = false;
      if (r.ok) {
        state.booked = r.data; state.step = 3;
        track("new-york-booking");
        render(true);
        return;
      }
      render();
      if (r.status === 409) {
        state.notice = r.data.message || "That time was just taken. Please choose another.";
        state.step = 0; state.time = "";
        loadSlots().then(function () { render(true); });
        return;
      }
      if (r.status === 422 && r.data.errors) {
        state.step = r.data.errors.date ? 0 : 1;
        state.notice = r.data.errors.date || "";
        render(true);
        Object.keys(r.data.errors).forEach(function (k) { setErr(k, r.data.errors[k]); });
        return;
      }
      setErr("form", r.data.message || "Booking failed. Please try again, or call (212) 660-4027.");
    }).catch(function () {
      state.busy = false; render();
      setErr("form", "No connection. Please try again, or call (212) 660-4027.");
    });
  }

  // Ohne Backend: dieselben Angaben als Anfrage an das bestehende Kontaktformular.
  function requestByForm() {
    var data = new FormData();
    data.append("lead_id", window.crypto && crypto.randomUUID ? crypto.randomUUID() : String(Date.now()));
    data.append("interesse", "new-york");
    data.append("name", state.name);
    data.append("email", state.email);
    data.append("phone", state.phone);
    data.append("company", state.website || "");
    data.append("nachricht", "New York design consultation (" + PRICE + ", invoice). Video call: " + longDate(state.date) + ", " + state.time + " New York time. Billing address: " + state.billing);
    data.append("lang", "en");
    data.append("marketing_consent", window.raConsent || "");
    fetch(CONTACT_ENDPOINT, { method: "POST", body: data, headers: { Accept: "application/json" } })
      .then(function (r) { return r.json().catch(function () { return {}; }); })
      .then(function (res) {
        if (!res || !res.success) throw new Error();
        state.busy = false; state.step = 3;
        track("new-york-booking");
        render(true);
      })
      .catch(function () {
        setBusy(false); render();
        setErr("form", "Sending failed. Please try again, or call (212) 660-4027.");
      });
  }

})();
