/* ============================================================
   RICHARD ATELIER — Fragebogen
   Klickbare Chip-Fragen, Datei-Vorschau, Absenden an Web3Forms.
   Vanilla JS, keine Abhängigkeiten.
   ============================================================ */
(function () {
  "use strict";

  /* Chip-Gruppen: data-multi="true" erlaubt Mehrfachauswahl,
     sonst wirkt die Gruppe wie Radiobuttons. Auswahl landet als
     kommagetrennter Text im begleitenden Hidden-Input. */
  var groups = Array.prototype.slice.call(document.querySelectorAll(".qgroup"));
  groups.forEach(function (group) {
    var multi = group.getAttribute("data-multi") === "true";
    var hidden = group.querySelector("input[type='hidden']");
    var chips = Array.prototype.slice.call(group.querySelectorAll(".chip"));
    var selected = [];
    chips.forEach(function (chip) {
      chip.setAttribute("aria-pressed", "false");
      chip.addEventListener("click", function () {
        var val = chip.getAttribute("data-value");
        if (multi) {
          var i = selected.indexOf(val);
          if (i > -1) {
            selected.splice(i, 1);
            chip.setAttribute("aria-pressed", "false");
          } else {
            selected.push(val);
            chip.setAttribute("aria-pressed", "true");
          }
        } else {
          selected = [val];
          chips.forEach(function (c) {
            c.setAttribute("aria-pressed", c === chip ? "true" : "false");
          });
        }
        if (hidden) hidden.value = selected.join(", ");
      });
    });
  });

  /* Dateiname(n) unter dem Upload-Feld anzeigen */
  var fileInputs = Array.prototype.slice.call(document.querySelectorAll("input[type='file']"));
  fileInputs.forEach(function (input) {
    input.addEventListener("change", function () {
      var field = input.closest(".file-field");
      var label = field ? field.querySelector(".file-name") : null;
      if (!label) return;
      label.textContent = input.files.length
        ? Array.prototype.map.call(input.files, function (f) { return f.name; }).join(", ")
        : "Keine Datei ausgewählt";
    });
  });

  /* E-Mail aus dem Link vorbefüllen (?email=…), falls von der
     Danke-Seite / Bestätigungsmail mitgegeben */
  var params = new URLSearchParams(window.location.search);
  var emailParam = params.get("email");
  if (emailParam) {
    var emailInput = document.getElementById("qemail");
    if (emailInput) emailInput.value = emailParam;
  }

  /* Absenden — gleiches Muster wie das Kontaktformular:
     progressive enhancement, Web3Forms per fetch, bei Erfolg
     Weiterleitung zur Danke-Seite. */
  var form = document.querySelector(".questionnaire-form");
  if (form) {
    var endpoint = form.getAttribute("data-endpoint") || "https://api.web3forms.com/submit";
    var successUrl = form.getAttribute("data-success-url") || "../danke/?type=fragebogen";
    form.addEventListener("submit", function (e) {
      e.preventDefault();
      var note = form.querySelector(".form-note");
      var btn = form.querySelector("button[type='submit']");
      var emailInput = form.querySelector("input[type='email']");
      if (!emailInput || !emailInput.value || !emailInput.checkValidity()) {
        if (note) note.textContent = form.getAttribute("data-msg-invalid") || "";
        return;
      }
      if (note) note.textContent = form.getAttribute("data-msg-sending") || "";
      if (btn) btn.disabled = true;

      var data = new FormData(form);

      fetch(endpoint, { method: "POST", body: data, headers: { "Accept": "application/json" } })
        .then(function (r) { return r.json().catch(function () { return { success: false }; }); })
        .then(function (res) {
          if (res && res.success) {
            window.location.href = successUrl;
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
})();
