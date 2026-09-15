/* ============================================================
   RICHARD ATELIER — Mitarbeiter-Stundenerfassung
   Tag-für-Tag-Erfassung mit Mittagspause, Autosave in
   localStorage, Export als Excel (SheetJS) und PDF (jsPDF +
   autoTable). Vanilla JS, keine Build-Abhängigkeiten.
   ============================================================ */
(function () {
  "use strict";

  var STORAGE_PREFIX = "ra-zeit-";
  var META_KEY = "ra-zeit-meta";
  var WEEKDAYS = ["So", "Mo", "Di", "Mi", "Do", "Fr", "Sa"];
  var MONTH_NAMES = ["Januar", "Februar", "März", "April", "Mai", "Juni", "Juli", "August", "September", "Oktober", "November", "Dezember"];

  var nameInput = document.getElementById("ra-name");
  var monthInput = document.getElementById("ra-month");
  var defaultPauseInput = document.getElementById("ra-default-pause");
  var applyPauseBtn = document.getElementById("ra-reset-pause");
  var clearBtn = document.getElementById("ra-clear");
  var tbody = document.getElementById("ra-days-body");
  var totalHoursEl = document.getElementById("ra-total-hours");
  var totalDaysEl = document.getElementById("ra-total-days");
  var exportExcelBtn = document.getElementById("ra-export-excel");
  var exportPdfBtn = document.getElementById("ra-export-pdf");

  if (!tbody || !monthInput) return;

  var currentDays = [];

  function pad(n) { return String(n).padStart(2, "0"); }

  function todayMonthValue() {
    var d = new Date();
    return d.getFullYear() + "-" + pad(d.getMonth() + 1);
  }

  function formatDateDisplay(iso) {
    var parts = iso.split("-");
    return parts[2] + "." + parts[1] + "." + parts[0];
  }

  function monthLabel(monthValue) {
    var parts = monthValue.split("-");
    var idx = Number(parts[1]) - 1;
    return (MONTH_NAMES[idx] || "") + " " + parts[0];
  }

  /* ---- Persistenz ---- */
  function loadMeta() {
    try {
      var raw = window.localStorage.getItem(META_KEY);
      return raw ? JSON.parse(raw) : {};
    } catch (e) { return {}; }
  }
  function saveMeta(meta) {
    try { window.localStorage.setItem(META_KEY, JSON.stringify(meta)); } catch (e) {}
  }
  function saveMetaField(field, value) {
    var meta = loadMeta();
    meta[field] = value;
    saveMeta(meta);
  }

  function loadStoredDays(monthValue) {
    try {
      var raw = window.localStorage.getItem(STORAGE_PREFIX + monthValue);
      return raw ? JSON.parse(raw) : null;
    } catch (e) { return null; }
  }
  function saveDays(monthValue, days) {
    try { window.localStorage.setItem(STORAGE_PREFIX + monthValue, JSON.stringify(days)); } catch (e) {}
  }

  /* ---- Tage für einen Monat erzeugen, bestehende Einträge übernehmen ---- */
  function buildDaysForMonth(monthValue) {
    var parts = monthValue.split("-");
    var year = Number(parts[0]);
    var monthIndex = Number(parts[1]) - 1;
    var daysInMonth = new Date(year, monthIndex + 1, 0).getDate();
    var stored = loadStoredDays(monthValue);
    var storedByDate = {};
    if (stored) {
      stored.forEach(function (d) { storedByDate[d.date] = d; });
    }
    var defaultPause = defaultPauseInput.value || "30";
    var days = [];
    for (var day = 1; day <= daysInMonth; day++) {
      var dateIso = year + "-" + pad(monthIndex + 1) + "-" + pad(day);
      var weekdayIdx = new Date(year, monthIndex, day).getDay();
      var existing = storedByDate[dateIso];
      days.push({
        date: dateIso,
        weekday: WEEKDAYS[weekdayIdx],
        isWeekend: weekdayIdx === 0 || weekdayIdx === 6,
        start: existing ? existing.start : "",
        end: existing ? existing.end : "",
        pause: existing ? existing.pause : defaultPause,
        note: existing ? existing.note : ""
      });
    }
    return days;
  }

  /* ---- Stundenberechnung ---- */
  function toMinutes(hhmm) {
    var p = hhmm.split(":");
    return (Number(p[0]) * 60) + Number(p[1]);
  }
  function calcNet(day) {
    if (!day.start || !day.end) return { minutes: 0, invalid: false };
    var diff = toMinutes(day.end) - toMinutes(day.start);
    if (diff <= 0) return { minutes: 0, invalid: true };
    var pause = Number(day.pause) || 0;
    var net = diff - pause;
    if (net < 0) net = 0;
    return { minutes: net, invalid: false };
  }
  function formatHours(minutes) {
    return (minutes / 60).toLocaleString("de-AT", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  /* ---- Rendering ---- */
  function buildRow(day) {
    var tr = document.createElement("tr");
    tr.dataset.date = day.date;
    if (day.isWeekend) tr.classList.add("is-weekend");

    var tdDate = document.createElement("td");
    tdDate.className = "zeit-col-date";
    tdDate.textContent = formatDateDisplay(day.date);
    var wd = document.createElement("span");
    wd.className = "zeit-weekday";
    wd.textContent = day.weekday;
    tdDate.appendChild(wd);
    tr.appendChild(tdDate);

    var tdStart = document.createElement("td");
    tdStart.className = "zeit-col-time";
    var inStart = document.createElement("input");
    inStart.type = "time";
    inStart.dataset.field = "start";
    inStart.value = day.start || "";
    tdStart.appendChild(inStart);
    tr.appendChild(tdStart);

    var tdEnd = document.createElement("td");
    tdEnd.className = "zeit-col-time";
    var inEnd = document.createElement("input");
    inEnd.type = "time";
    inEnd.dataset.field = "end";
    inEnd.value = day.end || "";
    tdEnd.appendChild(inEnd);
    tr.appendChild(tdEnd);

    var tdPause = document.createElement("td");
    tdPause.className = "zeit-col-pause";
    var inPause = document.createElement("input");
    inPause.type = "number";
    inPause.min = "0";
    inPause.step = "5";
    inPause.dataset.field = "pause";
    inPause.value = (day.pause === "" || day.pause == null) ? "" : day.pause;
    tdPause.appendChild(inPause);
    tr.appendChild(tdPause);

    var tdHours = document.createElement("td");
    tdHours.className = "zeit-col-hours";
    tr.appendChild(tdHours);

    var tdNote = document.createElement("td");
    tdNote.className = "zeit-col-note";
    var inNote = document.createElement("input");
    inNote.type = "text";
    inNote.dataset.field = "note";
    inNote.value = day.note || "";
    inNote.setAttribute("list", "ra-note-suggestions");
    tdNote.appendChild(inNote);
    tr.appendChild(tdNote);

    updateRowHours(tr, day);
    return tr;
  }

  function updateRowHours(tr, day) {
    var net = calcNet(day);
    var tdHours = tr.querySelector(".zeit-col-hours");
    if (net.invalid) {
      tdHours.textContent = "–";
      tdHours.title = "Ende muss nach Beginn liegen.";
      tr.classList.add("is-invalid");
    } else {
      tdHours.textContent = net.minutes > 0 ? formatHours(net.minutes) : "";
      tdHours.removeAttribute("title");
      tr.classList.remove("is-invalid");
    }
  }

  function renderTable() {
    tbody.innerHTML = "";
    var fragment = document.createDocumentFragment();
    currentDays.forEach(function (day) {
      fragment.appendChild(buildRow(day));
    });
    tbody.appendChild(fragment);
    updateSummary();
  }

  function updateSummary() {
    var totalMinutes = 0;
    var workedDays = 0;
    currentDays.forEach(function (day) {
      var net = calcNet(day);
      if (!net.invalid && net.minutes > 0) {
        totalMinutes += net.minutes;
        workedDays += 1;
      }
    });
    totalHoursEl.textContent = formatHours(totalMinutes);
    totalDaysEl.textContent = String(workedDays);
  }

  function persistCurrentDays() {
    saveDays(monthInput.value, currentDays);
  }

  /* ---- Eingaben in der Tabelle ---- */
  tbody.addEventListener("input", function (e) {
    var field = e.target.dataset.field;
    if (!field) return;
    var tr = e.target.closest("tr");
    var date = tr.dataset.date;
    var day = currentDays.find(function (d) { return d.date === date; });
    if (!day) return;
    day[field] = e.target.value;
    updateRowHours(tr, day);
    updateSummary();
    persistCurrentDays();
  });

  /* ---- Steuerung: Name, Monat, Standardpause ---- */
  function loadMonth(monthValue, keepScroll) {
    currentDays = buildDaysForMonth(monthValue);
    renderTable();
    persistCurrentDays();
    saveMetaField("month", monthValue);
  }

  nameInput.addEventListener("input", function () {
    saveMetaField("name", nameInput.value);
  });

  monthInput.addEventListener("change", function () {
    if (!monthInput.value) return;
    loadMonth(monthInput.value);
  });

  defaultPauseInput.addEventListener("change", function () {
    saveMetaField("defaultPause", defaultPauseInput.value);
  });

  applyPauseBtn.addEventListener("click", function () {
    var value = defaultPauseInput.value || "0";
    currentDays.forEach(function (day) { day.pause = value; });
    renderTable();
    persistCurrentDays();
  });

  clearBtn.addEventListener("click", function () {
    var label = monthLabel(monthInput.value);
    if (!window.confirm("Alle Einträge für " + label + " wirklich zurücksetzen?")) return;
    currentDays.forEach(function (day) {
      day.start = "";
      day.end = "";
      day.note = "";
    });
    renderTable();
    persistCurrentDays();
  });

  /* ---- Export: Excel ---- */
  function sanitizeFileFragment(text) {
    return (text || "Mitarbeiter")
      .trim()
      .replace(/[\\/:*?"<>|]+/g, "")
      .replace(/\s+/g, "_") || "Mitarbeiter";
  }

  function buildExportRows() {
    var rows = [];
    currentDays.forEach(function (day) {
      var net = calcNet(day);
      rows.push([
        formatDateDisplay(day.date),
        day.weekday,
        day.start || "",
        day.end || "",
        day.pause === "" || day.pause == null ? "" : Number(day.pause),
        net.invalid ? "" : (net.minutes > 0 ? Number((net.minutes / 60).toFixed(2)) : ""),
        day.note || ""
      ]);
    });
    return rows;
  }

  function totalHoursDecimal() {
    var totalMinutes = 0;
    currentDays.forEach(function (day) {
      var net = calcNet(day);
      if (!net.invalid) totalMinutes += net.minutes;
    });
    return Number((totalMinutes / 60).toFixed(2));
  }

  exportExcelBtn.addEventListener("click", function () {
    if (typeof window.XLSX === "undefined") {
      window.alert("Die Excel-Bibliothek konnte nicht geladen werden. Bitte Internetverbindung prüfen und erneut versuchen.");
      return;
    }
    var name = nameInput.value || "Mitarbeiter";
    var label = monthLabel(monthInput.value);
    var header = ["Datum", "Wochentag", "Beginn", "Ende", "Pause (Min.)", "Stunden", "Notiz"];
    var aoa = [
      ["Stundenzettel — Richard Atelier"],
      ["Mitarbeiter/in:", name],
      ["Monat:", label],
      [],
      header
    ].concat(buildExportRows());
    aoa.push([]);
    aoa.push(["", "", "", "", "Gesamt", totalHoursDecimal(), ""]);

    var ws = window.XLSX.utils.aoa_to_sheet(aoa);
    ws["!cols"] = [{ wch: 12 }, { wch: 10 }, { wch: 8 }, { wch: 8 }, { wch: 13 }, { wch: 10 }, { wch: 26 }];
    var wb = window.XLSX.utils.book_new();
    window.XLSX.utils.book_append_sheet(wb, ws, "Stundenzettel");
    window.XLSX.writeFile(wb, "Stundenzettel_" + sanitizeFileFragment(name) + "_" + monthInput.value + ".xlsx");
  });

  /* ---- Export: PDF ---- */
  exportPdfBtn.addEventListener("click", function () {
    if (typeof window.jspdf === "undefined" || typeof window.jspdf.jsPDF === "undefined") {
      window.alert("Die PDF-Bibliothek konnte nicht geladen werden. Bitte Internetverbindung prüfen und erneut versuchen.");
      return;
    }
    var name = nameInput.value || "Mitarbeiter";
    var label = monthLabel(monthInput.value);
    var doc = new window.jspdf.jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });

    doc.setFontSize(14);
    doc.setTextColor(33, 29, 23);
    doc.text("Stundenzettel — Richard Atelier", 14, 16);
    doc.setFontSize(10);
    doc.setTextColor(69, 62, 50);
    doc.text("Mitarbeiter/in: " + name, 14, 23);
    doc.text("Monat: " + label, 14, 28);

    doc.autoTable({
      startY: 33,
      head: [["Datum", "Tag", "Beginn", "Ende", "Pause (Min.)", "Stunden", "Notiz"]],
      body: buildExportRows().map(function (row) {
        return row.map(function (v) { return v === "" || v == null ? "" : String(v); });
      }),
      foot: [["", "", "", "", "Gesamt", totalHoursDecimal().toLocaleString("de-AT", { minimumFractionDigits: 2, maximumFractionDigits: 2 }), ""]],
      styles: { font: "helvetica", fontSize: 8.5, cellPadding: 1.8 },
      headStyles: { fillColor: [169, 142, 111], textColor: [255, 255, 255] },
      footStyles: { fillColor: [239, 234, 224], textColor: [33, 29, 23], fontStyle: "bold" },
      alternateRowStyles: { fillColor: [247, 244, 238] }
    });

    doc.save("Stundenzettel_" + sanitizeFileFragment(name) + "_" + monthInput.value + ".pdf");
  });

  /* ---- Init ---- */
  var meta = loadMeta();
  if (meta.name) nameInput.value = meta.name;
  if (meta.defaultPause) defaultPauseInput.value = meta.defaultPause;
  monthInput.value = meta.month || todayMonthValue();
  loadMonth(monthInput.value);
})();
