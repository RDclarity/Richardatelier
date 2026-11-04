/* ============================================================
   RICHARD ATELIER — Magazin
   Lesefortschritt · Interesse-Chips · Anfrage-Formular (Supabase)
   Keine Scroll-Reveal-Logik: alles ist sofort sichtbar.
   ============================================================ */
(function () {
  "use strict";

  /* Sprachwahl merken (wie script.js) */
  Array.prototype.slice.call(document.querySelectorAll(".ui-lang a[lang]")).forEach(function (a) {
    a.addEventListener("click", function () {
      try { localStorage.setItem("ra-lang-pref", a.getAttribute("lang")); } catch (e) {}
    });
  });

  /* Lesefortschritt */
  var bar = document.querySelector(".mag-progress");
  var article = document.querySelector("article");
  if (bar && article) {
    var ticking = false;
    function update() {
      ticking = false;
      var rect = article.getBoundingClientRect();
      var total = rect.height - window.innerHeight;
      var done = Math.min(1, Math.max(0, (-rect.top) / (total > 0 ? total : 1)));
      bar.style.width = (done * 100).toFixed(1) + "%";
    }
    window.addEventListener("scroll", function () {
      if (!ticking) { ticking = true; requestAnimationFrame(update); }
    }, { passive: true });
    update();
  }

  function generateLeadId() {
    if (window.crypto && typeof window.crypto.randomUUID === "function") return window.crypto.randomUUID();
    return Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 10);
  }

  Array.prototype.slice.call(document.querySelectorAll(".contact-form")).forEach(function (form) {
    var endpoint = form.getAttribute("data-endpoint");
    var successUrl = form.getAttribute("data-success-url") || "/danke/";
    var leadInput = form.querySelector("input[name='lead_id']");
    if (leadInput) leadInput.value = generateLeadId();

    var interesseInput = form.querySelector("input[name='interesse']");
    var chips = Array.prototype.slice.call(form.querySelectorAll(".chip"));
    chips.forEach(function (chip) {
      chip.addEventListener("click", function () {
        chips.forEach(function (c) { c.setAttribute("aria-pressed", c === chip ? "true" : "false"); });
        if (interesseInput) interesseInput.value = chip.getAttribute("data-value") || "";
      });
    });

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

      var data = new FormData(form);
      data.append("lang", document.documentElement.lang || "de");
      data.append("marketing_consent", window.raConsent || "");
      data.append("source", "magazin:" + location.pathname);

      fetch(endpoint, { method: "POST", body: data, headers: { "Accept": "application/json" } })
        .then(function (r) { return r.json().catch(function () { return { success: false }; }); })
        .then(function (res) {
          if (res && res.success) {
            var q = new URLSearchParams();
            if (leadInput && leadInput.value) q.set("lead", leadInput.value);
            q.set("email", emailInput.value);
            if (interesseInput && interesseInput.value) q.set("interesse", interesseInput.value);
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
  });
})();
