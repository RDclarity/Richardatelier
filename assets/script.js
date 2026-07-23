/* ============================================================
   RICHARD ATELIER — Landingpage
   Vanilla JS, keine Abhängigkeiten.
   Intro · Slide-Navigation (eased) · Parallax · Uhren · Form
   ============================================================ */
(function () {
  "use strict";

  var deck = document.querySelector(".deck");
  var slides = Array.prototype.slice.call(document.querySelectorAll(".slide"));
  var dots = Array.prototype.slice.call(document.querySelectorAll(".ui-dots li"));
  var reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var pointerFine =
    window.matchMedia("(pointer: fine)").matches &&
    window.matchMedia("(hover: hover)").matches;

  var current = 0;
  var targetIndex = 0;
  var targetTop = 0;
  var navRAF = null;

  /* ----------------------------------------------------------
     1 | Intro: Strich fährt von links ein, Fläche öffnet sich
     ---------------------------------------------------------- */
  var intro = document.querySelector(".intro");

  function runIntro() {
    if (!intro || reduced) {
      if (intro) intro.remove();
      startObserver();
      return;
    }
    document.body.classList.add("intro-active");
    /* Doppel-rAF: Startzustand sicher rendern, dann animieren */
    requestAnimationFrame(function () {
      requestAnimationFrame(function () {
        intro.classList.add("is-line");      /* Strich zeichnet sich  */
      });
    });
    setTimeout(function () {
      intro.classList.add("is-open");        /* Fläche öffnet sich    */
    }, 1050);
    setTimeout(function () {
      startObserver();                       /* Hero-Reveal beginnt,
                                                während sich die
                                                Fläche noch öffnet    */
    }, 1400);
    setTimeout(function () {
      intro.remove();
      document.body.classList.remove("intro-active");
    }, 2300);
  }

  /* ----------------------------------------------------------
     2 | Slide-Reveal + aktive Slide (IntersectionObserver)
     ---------------------------------------------------------- */
  function startObserver() {
    if ("IntersectionObserver" in window) {
      var io = new IntersectionObserver(
        function (entries) {
          entries.forEach(function (entry) {
            if (entry.isIntersecting) {
              entry.target.classList.add("is-visible");
              setActive(slides.indexOf(entry.target));
            }
          });
        },
        { root: deck, threshold: 0.55 }
      );
      slides.forEach(function (s) { io.observe(s); });
    } else {
      slides.forEach(function (s) { s.classList.add("is-visible"); });
    }
    startThread();
  }

  function setActive(index) {
    if (index < 0) return;
    current = index;
    /* Wenn keine Fahrt läuft, Ziel mit der sichtbaren Folie gleichziehen,
       damit der nächste Scroll von der richtigen Stelle aus zählt. */
    if (navRAF == null) targetIndex = index;
    dots.forEach(function (li, i) {
      li.setAttribute("data-active", i === index ? "true" : "false");
    });
    document.body.setAttribute(
      "data-theme",
      slides[index].getAttribute("data-theme") || "light"
    );
  }

  /* ----------------------------------------------------------
     3 | Folien-Übergänge — ruhige, zeitbasierte Fahrt mit
     weicher Ease-Kurve. Jederzeit umlenkbar: ein neues Ziel
     startet eine neue Fahrt von der aktuellen Position aus.
     Touch-Geräte behalten natives Scroll-Snap.
     ---------------------------------------------------------- */
  var navFrom = 0, navStart = 0, navDur = 1150;

  function easeInOutCubic(t) {
    return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
  }

  function navTick(now) {
    var k = Math.min(1, (now - navStart) / navDur);
    var e = easeInOutCubic(k);
    deck.scrollTop = navFrom + (targetTop - navFrom) * e;
    if (k < 1) {
      navRAF = requestAnimationFrame(navTick);
    } else {
      deck.scrollTop = targetTop;
      navRAF = null;
    }
  }

  function goTo(index) {
    index = Math.max(0, Math.min(slides.length - 1, index));
    targetIndex = index;
    setActive(index);
    if (pointerFine && !reduced) {
      targetTop = slides[index].offsetTop;
      navFrom = deck.scrollTop;
      navStart = performance.now();
      /* Dauer an Distanz koppeln: kurze Wege etwas schneller,
         weite (Dot-Sprünge) ruhig, aber nicht zäh */
      var spans = Math.abs(targetTop - navFrom) / deck.clientHeight;
      navDur = Math.max(900, Math.min(1700, 950 + spans * 320));
      if (navRAF == null) navRAF = requestAnimationFrame(navTick);
    } else {
      slides[index].scrollIntoView({ behavior: reduced ? "auto" : "smooth" });
    }
  }

  if (pointerFine && !reduced) {
    document.body.classList.add("js-snap");   /* CSS-Snap aus, JS übernimmt */
    deck.style.scrollBehavior = "auto";
    targetTop = deck.scrollTop;

    /* Eingabe-Sperre: kein Mehrfachsprung pro Wisch. Die Sperre muss
       mindestens so lange halten wie die Folienfahrt selbst dauert
       (navDur, ~900–1700ms) — sonst lösen nachlaufende Wheel-Events
       vom Trackpad-Momentum-Scrolling (die oft länger als 500ms
       nachlaufen) eine zweite Fahrt aus, während die erste noch
       läuft, und eine Folie wird übersprungen. */
    var wheelLock = 0;
    deck.addEventListener(
      "wheel",
      function (e) {
        e.preventDefault();
        if (Math.abs(e.deltaY) < 6) return;
        var now = performance.now();
        if (now < wheelLock) return;
        goTo(targetIndex + (e.deltaY > 0 ? 1 : -1));
        wheelLock = now + navDur;
      },
      { passive: false }
    );

    window.addEventListener("keydown", function (e) {
      if (e.target && /^(input|textarea|button|select)$/i.test(e.target.tagName)) return;
      if (e.key === "ArrowDown" || e.key === "PageDown" || e.key === " ") {
        e.preventDefault(); goTo(targetIndex + 1);
      } else if (e.key === "ArrowUp" || e.key === "PageUp") {
        e.preventDefault(); goTo(targetIndex - 1);
      } else if (e.key === "Home") {
        e.preventDefault(); goTo(0);
      } else if (e.key === "End") {
        e.preventDefault(); goTo(slides.length - 1);
      }
    });

    /* Ziel nach Größenänderung an neue Folienhöhe anpassen */
    window.addEventListener("resize", function () {
      targetTop = slides[targetIndex].offsetTop;
    });
  }

  dots.forEach(function (li, i) {
    var btn = li.querySelector("button");
    if (btn) btn.addEventListener("click", function () { goTo(i); });
  });

  /* ----------------------------------------------------------
     4 | Parallax: Texte und Bilder bewegen sich beim Übergang
     unterschiedlich schnell ([data-px]-Faktor pro Element)
     ---------------------------------------------------------- */
  var pxTicking = false;

  function parallax() {
    pxTicking = false;
    var st = deck.scrollTop;
    var h = window.innerHeight;
    slides.forEach(function (slide) {
      var p = (slide.offsetTop - st) / h;   /* 0 = im Bild, ±1 = daneben */
      if (p < -1.2 || p > 1.2) return;
      var els = slide.querySelectorAll("[data-px]");
      for (var i = 0; i < els.length; i++) {
        var f = parseFloat(els[i].getAttribute("data-px")) || 0;
        els[i].style.transform =
          "translate3d(0," + (p * f * h).toFixed(1) + "px,0)";
      }
    });
  }

  if (!reduced) {
    deck.addEventListener(
      "scroll",
      function () {
        if (!pxTicking) {
          pxTicking = true;
          requestAnimationFrame(parallax);
        }
      },
      { passive: true }
    );
    parallax();
  }

  /* ----------------------------------------------------------
     5 | VIE / NYC Uhren
     ---------------------------------------------------------- */
  var vieEl = document.querySelector("[data-clock='vie']");
  var nycEl = document.querySelector("[data-clock='nyc']");

  function fmt(tz) {
    try {
      return new Intl.DateTimeFormat("de-AT", {
        hour: "2-digit", minute: "2-digit", hour12: false, timeZone: tz
      }).format(new Date());
    } catch (e) { return "--:--"; }
  }
  function tick() {
    if (vieEl) vieEl.textContent = fmt("Europe/Vienna");
    if (nycEl) nycEl.textContent = fmt("America/New_York");
  }
  tick();
  setInterval(tick, 15000);

  /* ----------------------------------------------------------
     6 | As-You-Rotation
     ---------------------------------------------------------- */
  var wordEl = document.querySelector(".asyou-word");
  if (wordEl) {
    var words = JSON.parse(wordEl.getAttribute("data-words") || "[]");
    var wi = 0;
    if (words.length > 1 && !reduced) {
      setInterval(function () {
        wordEl.classList.add("is-swapping");
        setTimeout(function () {
          wi = (wi + 1) % words.length;
          wordEl.textContent = words[wi];
          wordEl.classList.remove("is-swapping");
        }, 420);
      }, 2800);
    }
  }

  /* ----------------------------------------------------------
     7 | Kontakt-Formular — sendet an Web3Forms (api.web3forms.com)
     Bei Erfolg: Weiterleitung zur Danke-Seite (data-success-url).
     Ohne JS greift der native Form-Post + das "redirect"-Hidden-
     Feld, das Web3Forms serverseitig auswertet.

     Lead-ID: wird beim Laden erzeugt, als Hidden-Feld mitgesendet
     und an die Danke-/Projektinfos-Seite weitergereicht (?lead=…).
     So lassen sich Anfrage und späterer Projektinfos-Fragebogen
     im künftigen CRM derselben Person zuordnen, auch ohne dass
     das CRM heute schon existiert.
     ---------------------------------------------------------- */
  function generateLeadId() {
    if (window.crypto && typeof window.crypto.randomUUID === "function") return window.crypto.randomUUID();
    return Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 10);
  }

  var form = document.querySelector(".contact-form");
  if (form) {
    var endpoint = form.getAttribute("data-endpoint") || "https://api.web3forms.com/submit";
    var successUrl = form.getAttribute("data-success-url") || "danke/";
    var leadInput = form.querySelector("input[name='lead_id']");
    if (leadInput) leadInput.value = generateLeadId();

    form.addEventListener("submit", function (e) {
      e.preventDefault();
      var emailInput = form.querySelector("input[type='email']");
      var phoneInput = form.querySelector("input[type='tel']");
      var note = form.querySelector(".form-note");
      var btn = form.querySelector("button[type='submit']");
      var phoneOk = phoneInput && /^[0-9+()\-\s]{6,}$/.test(phoneInput.value);
      if (!emailInput || !emailInput.value || !emailInput.checkValidity() || !phoneOk) {
        if (note) note.textContent = form.getAttribute("data-msg-invalid") || "";
        return;
      }
      if (note) note.textContent = form.getAttribute("data-msg-sending") || "";
      if (btn) btn.disabled = true;

      var data = new FormData(form);           /* nimmt auch die hidden Web3Forms-Felder mit */
      data.append("lang", document.documentElement.lang || "de");

      fetch(endpoint, { method: "POST", body: data, headers: { "Accept": "application/json" } })
        .then(function (r) { return r.json().catch(function () { return { success: false }; }); })
        .then(function (res) {
          if (res && res.success) {
            var q = new URLSearchParams();
            if (leadInput && leadInput.value) q.set("lead", leadInput.value);
            q.set("email", emailInput.value);
            window.location.href = successUrl + "?" + q.toString();
          } else {
            if (note) note.textContent = form.getAttribute("data-msg-error") || "";
            if (btn) btn.disabled = false;
          }
        })
        .catch(function () {
          if (note) note.textContent = form.getAttribute("data-msg-error") || "";
          if (btn) btn.disabled = false;
        });
    });
  }

  /* ----------------------------------------------------------
     8 | Lebendiger Hintergrund (nur helle Slides)
     Desktop: Cursor — x-Achse: brauner ↔ hellstes Beige,
              y-Achse: Nuance heller/dunkler.
     Mobil:   Lagesensor (Android sofort; iOS 13+ verlangt
              DeviceOrientationEvent.requestPermission() nach
              einer Nutzer-Geste — bei Bedarf hier ergänzen).
     Dezent: max. ~11 % Farbabstand zum Basis-Beige.
     ---------------------------------------------------------- */
  (function () {
    if (reduced) return;
    var BASE  = { r: 247, g: 244, b: 238 };   /* --paper  #F7F4EE */
    var BROWN = { r: 181, g: 156, b: 122 };   /* --sand   #B59C7A */
    var cur = { r: BASE.r, g: BASE.g, b: BASE.b };
    var target = { r: BASE.r, g: BASE.g, b: BASE.b };
    var running = false;

    function setTarget(x, y) {
      x = Math.min(1, Math.max(0, x));
      y = Math.min(1, Math.max(0, y));
      var k = 0.2565 * (1 - x);                 /* links: Richtung Braun   */
      var l = 1 + (0.5 - y) * 0.0824;          /* oben heller, unten dunkler */
      target.r = Math.min(255, (BASE.r * (1 - k) + BROWN.r * k) * l);
      target.g = Math.min(255, (BASE.g * (1 - k) + BROWN.g * k) * l);
      target.b = Math.min(255, (BASE.b * (1 - k) + BROWN.b * k) * l);
      if (!running) { running = true; requestAnimationFrame(loop); }
    }

    function loop() {
      cur.r += (target.r - cur.r) * 0.06;     /* weiches Nachziehen */
      cur.g += (target.g - cur.g) * 0.06;
      cur.b += (target.b - cur.b) * 0.06;
      document.body.style.backgroundColor =
        "rgb(" + cur.r.toFixed(1) + "," + cur.g.toFixed(1) + "," + cur.b.toFixed(1) + ")";
      if (Math.abs(target.r - cur.r) + Math.abs(target.g - cur.g) +
          Math.abs(target.b - cur.b) > 0.15) {
        requestAnimationFrame(loop);
      } else {
        running = false;
      }
    }

    if (pointerFine) {
      window.addEventListener("mousemove", function (e) {
        setTarget(e.clientX / window.innerWidth, e.clientY / window.innerHeight);
      }, { passive: true });
    } else if ("ondeviceorientation" in window) {
      window.addEventListener("deviceorientation", function (e) {
        if (e.gamma == null || e.beta == null) return;
        setTarget(
          (Math.max(-25, Math.min(25, e.gamma)) + 25) / 50,   /* seitlich kippen */
          (Math.max(15, Math.min(65, e.beta)) - 15) / 50       /* vor/zurück      */
        );
      }, true);
    }
  })();

  /* ----------------------------------------------------------
     7b | Roter Faden — EINE durchgehende Linie über die GESAMTE
     Scroll-Höhe aller Folien. Sie verschwindet nie und wird
     nicht pro Folie neu gezeichnet, sondern scrollt als ein
     Strich mit. Beim Scrollen "zieht" sie sich von oben nach
     unten ein (stroke-dashoffset an die Scroll-Position
     gekoppelt, monoton). Unterwegs: Kurven + Schleifen, in
     Folie 3 ein "?" (umkreist seinen Punkt), am Ende ein Kuvert.
     ---------------------------------------------------------- */
  var threadLayer = document.querySelector(".thread-layer");
  var threadSvg = threadLayer ? threadLayer.querySelector("svg") : null;
  var threadPath = document.querySelector(".thread-path");

  function f(n) { return Math.round(n * 10) / 10; }

  /* Zufalls-Modell: bei jedem Neuladen ein komplett neuer Pfad.
     Fix bleiben nur die Seiten (welche Folie links/rechts liegt),
     das Fragezeichen (Folie 3) und das Kuvert (letzte Folie). */
  function rand(a, b) { return a + Math.random() * (b - a); }

  /* Seite je Band: 'L'/'R' = Bildseite (fix), 'q'/'e' = feste Form,
     'free' = freie Lage (Hero, ohne Bild) */
  var SIDE = ["free", "L", "q", "R", "L", "e"];

  function makeThreadModel(n) {
    var bx = [], i;
    for (i = 0; i <= n; i++) bx[i] = rand(0.34, 0.66);
    var bands = [];
    for (i = 0; i < n; i++) {
      var s = SIDE[i] || "free", swing;
      if (s === "L") swing = rand(0.14, 0.34);
      else if (s === "R") swing = rand(0.66, 0.86);
      else swing = rand(0.26, 0.74);
      bands.push({
        swing: swing,
        loopR: rand(0.03, 0.055),
        loopY: rand(0.40, 0.60),
        dir: s === "L" ? -1 : s === "R" ? 1 : (Math.random() < 0.5 ? 1 : -1),
        c1: rand(0.12, 0.22), c2: rand(0.28, 0.40),
        c3: rand(0.60, 0.72), c4: rand(0.80, 0.90)
      });
    }
    return { bx: bx, bands: bands };
  }
  var threadModel = makeThreadModel(slides.length);

  /* Pfad als Token-Modell: absolute Punkte (M/L/C) lassen sich
     pro Frame verschieben, relative Bögen (a, Schleifen) hängen
     am vorherigen Punkt und wandern automatisch mit. */
  function loopTokens(tk, r, dir) {
    tk.push(["a", r, r, 0, 1, dir > 0 ? 1 : 0, 0, 2 * r]);
    tk.push(["a", r, r, 0, 1, dir > 0 ? 1 : 0, 0, -2 * r]);
  }

  function bandWave(tk, i, yTop, w, h) {
    var b = threadModel.bands[i];
    var x0 = threadModel.bx[i] * w, x1 = threadModel.bx[i + 1] * w;
    var swing = b.swing * w;
    var lr = Math.min(w, h) * b.loopR, ly = yTop + h * b.loopY;
    tk.push(["C", x0, yTop + h * b.c1, swing, yTop + h * b.c2, swing, ly - lr]);
    loopTokens(tk, lr, b.dir);
    tk.push(["C", swing, yTop + h * b.c3, x1, yTop + h * b.c4, x1, yTop + h]);
  }

  function bandQuestion(tk, i, yTop, w, h) {
    var x0 = threadModel.bx[i] * w, x1 = threadModel.bx[i + 1] * w;
    var cx = w * 0.5, cy = yTop + h * 0.34, r = Math.min(w, h) * 0.085;
    var dotY = cy + r * 2.0, er = r * 0.34;
    tk.push(["C", x0, yTop + h * 0.08, cx - r * 1.5, cy - r * 0.3, cx - r * 0.95, cy - r * 0.5]);
    tk.push(["C", cx - r * 1.25, cy - r * 1.65, cx + r * 1.25, cy - r * 1.65, cx + r * 0.95, cy - r * 0.4]);
    tk.push(["C", cx + r * 0.78, cy + r * 0.5, cx, cy + r * 0.3, cx, cy + r * 1.0]);
    tk.push(["L", cx, dotY - er]);
    loopTokens(tk, er, 1);
    tk.push(["C", cx, yTop + h * 0.86, x1, yTop + h * 0.95, x1, yTop + h]);
  }

  function bandEnvelope(tk, i, yTop, w, h) {
    var x0 = threadModel.bx[i] * w, cx = w * 0.5, cy = yTop + h * 0.54;
    var ew = Math.min(w * 0.34, 320), eh = ew * 0.62;
    var L = cx - ew / 2, R = cx + ew / 2, T = cy - eh / 2, B = cy + eh / 2;
    var flap = T + eh * 0.5;
    tk.push(["C", x0, yTop + h * 0.18, L, T - h * 0.14, L, T]);
    tk.push(["L", R, T]);
    tk.push(["L", R, B]);
    tk.push(["L", L, B]);
    tk.push(["L", L, T]);
    tk.push(["L", cx, flap]);
    tk.push(["L", R, T]);
  }

  function buildTokens(w, h, n) {
    var tk = [["M", threadModel.bx[0] * w, 0]];
    for (var i = 0; i < n; i++) {
      var yTop = i * h;
      if (i === 2) bandQuestion(tk, i, yTop, w, h);
      else if (i === n - 1) bandEnvelope(tk, i, yTop, w, h);
      else bandWave(tk, i, yTop, w, h);
    }
    return tk;
  }

  /* Token-Liste → d-String, mit optionaler Punkt-Verschiebung */
  function tokensToD(tk, disp) {
    var d = "", i, t;
    for (i = 0; i < tk.length; i++) {
      t = tk[i];
      if (t[0] === "a") {
        d += " a " + f(t[1]) + " " + f(t[2]) + " " + t[3] + " " + t[4] + " " + t[5] + " " + f(t[6]) + " " + f(t[7]);
      } else if (t[0] === "C") {
        var p1 = disp(t[1], t[2]), p2 = disp(t[3], t[4]), p3 = disp(t[5], t[6]);
        d += " C " + f(p1[0]) + " " + f(p1[1]) + ", " + f(p2[0]) + " " + f(p2[1]) + ", " + f(p3[0]) + " " + f(p3[1]);
      } else { /* M or L */
        var p = disp(t[1], t[2]);
        d += " " + t[0] + " " + f(p[0]) + " " + f(p[1]);
      }
    }
    return d;
  }

  var threadTokens = null;
  var threadLen = 0, threadH = 0, threadW = 0, pMax = 0, introReveal = 0, scrollReady = false;

  function layoutThread() {
    if (!threadPath || !threadSvg) return;
    var w = deck.clientWidth, h = deck.clientHeight, n = slides.length;
    threadH = n * h; threadW = w;
    threadLayer.style.height = threadH + "px";
    threadSvg.setAttribute("viewBox", "0 0 " + w + " " + threadH);
    threadSvg.setAttribute("preserveAspectRatio", "none");
    threadSvg.style.height = threadH + "px";
    threadTokens = buildTokens(w, h, n);
    threadPath.setAttribute("d", tokensToD(threadTokens, noDisp));
    threadLen = threadPath.getTotalLength();
    threadPath.style.strokeDasharray = threadLen;
    applyThreadDraw();
  }

  function applyThreadDraw() {
    if (!threadPath) return;
    var p = reduced ? 1 : Math.max(introReveal, pMax);
    threadPath.style.strokeDashoffset = (threadLen * (1 - p)).toFixed(1);
  }

  function onThreadScroll() {
    if (!scrollReady || threadH === 0) return;
    var p = (deck.scrollTop + deck.clientHeight) / threadH;   /* führende Kante = Viewport-Unterkante */
    if (p > pMax) { pMax = Math.min(1, p); applyThreadDraw(); }
  }

  function startThread() {
    if (!threadPath) return;
    layoutThread();
    if (reduced) { applyThreadDraw(); scrollReady = true; return; }
    /* sanftes Einziehen der ersten Folie, dann an Scroll koppeln */
    var p0 = deck.clientHeight / threadH;
    var t0 = performance.now(), dur = 1600;
    (function anim(now) {
      var k = Math.min(1, (now - t0) / dur);
      introReveal = (1 - Math.pow(1 - k, 3)) * p0;   /* easeOutCubic */
      applyThreadDraw();
      if (k < 1) { requestAnimationFrame(anim); }
      else { pMax = p0; scrollReady = true; }
    })(t0);
  }

  deck.addEventListener("scroll", function () {
    if (!threadScrollTicking) {
      threadScrollTicking = true;
      requestAnimationFrame(function () { threadScrollTicking = false; onThreadScroll(); });
    }
  }, { passive: true });
  var threadScrollTicking = false;

  var threadRz;
  window.addEventListener("resize", function () {
    clearTimeout(threadRz);
    threadRz = setTimeout(layoutThread, 150);
  });

  /* ----------------------------------------------------------
     7c | Spinnennetz-Effekt — der Faden schwingt sanft zum
     Cursor/Finger mit. Punkte in der Nähe des (nachlaufenden)
     Zeigers werden minimal zu ihm gezogen; eine gedämpfte Feder
     erzeugt Verzögerung und ein feines Nachschwingen.
     ---------------------------------------------------------- */
  function noDisp(x, y) { return [x, y]; }

  var pointerActive = false;
  var pX = 0, pY = 0;            /* roher Zeiger (Dokument-Koordinaten) */
  var sX = 0, sY = 0;            /* geglätteter Zeiger (Stufe 1) */
  var lX = 0, lY = 0;            /* nachlaufender Punkt (Stufe 2) */
  var webInit = false;
  var webRAF = null;
  var WEB_AMP = 64;              /* Reichweite der Auslenkung in px */
  var WEB_RADIUS = 380;          /* Einflussradius um den Zeiger */
  var WEB_R2 = WEB_RADIUS * WEB_RADIUS;
  var WEB_IN = 0.10;             /* Eingangs-Glättung (kleiner = ruhiger) */
  var WEB_FOLLOW = 0.045;        /* Nachlauf (kleiner = träger, graziöser) */

  function webDisp(x, y) {
    var dx = lX - x, dy = lY - y;
    var d2 = dx * dx + dy * dy;
    if (d2 > WEB_R2) return [x, y];
    var fall = Math.exp(-d2 / (WEB_R2 * 0.5));   /* weicher Gauß-Abfall */
    var dist = Math.sqrt(d2) || 1;
    var mag = WEB_AMP * fall;
    return [x + (dx / dist) * mag, y + (dy / dist) * mag];
  }

  function renderWeb() {
    if (!threadTokens) return;
    threadPath.setAttribute("d", tokensToD(threadTokens, webDisp));
  }

  function webStep() {
    /* Zwei kaskadierte Tiefpässe — gleitet sanft nach, kein
       Überschwingen, kein Zucken (rein monotone Annäherung). */
    sX += (pX - sX) * WEB_IN;
    sY += (pY - sY) * WEB_IN;
    lX += (sX - lX) * WEB_FOLLOW;
    lY += (sY - lY) * WEB_FOLLOW;
    renderWeb();
    var rest = Math.abs(pX - lX) + Math.abs(pY - lY) +
               Math.abs(sX - lX) + Math.abs(sY - lY);
    if (pointerActive || rest > 0.4) {
      webRAF = requestAnimationFrame(webStep);
    } else {
      webRAF = null;
      threadPath.setAttribute("d", tokensToD(threadTokens, noDisp));  /* sauber zurück */
    }
  }

  function ensureWeb() {
    if (webRAF == null) webRAF = requestAnimationFrame(webStep);
  }

  if (threadPath && !reduced && pointerFine) {
    var lastClientY = 0;
    window.addEventListener("mousemove", function (e) {
      pX = e.clientX;
      lastClientY = e.clientY;
      pY = e.clientY + deck.scrollTop;   /* in Dokument-Koordinaten */
      if (!webInit) { sX = lX = pX; sY = lY = pY; webInit = true; }
      pointerActive = true;
      ensureWeb();
    }, { passive: true });
    window.addEventListener("mouseout", function (e) {
      if (!e.relatedTarget) pointerActive = false;
    });
    /* Beim Scrollen folgt der Faden mit: Doku-Y aus letzter Cursor-Höhe neu */
    deck.addEventListener("scroll", function () {
      if (!pointerActive) return;
      pY = lastClientY + deck.scrollTop;
      ensureWeb();
    }, { passive: true });
  }

  runIntro();
})();
