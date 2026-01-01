"use strict";

const el = (id) => document.getElementById(id);

const state = {
  lastResult: null,
  view: "mm",        // "mm" | "mkm"
  showFormulas: false,
  auto: false,
  batchCsvText: null,
  batchResults: null,
  batchOutCsv: null
};

function setStatus(msg) { el("status").textContent = msg || ""; }
function setBatchStatus(msg) { el("batchStatus").textContent = msg || ""; }

function setTab(view) {
  state.view = view;
  el("tabMM").classList.toggle("active", view === "mm");
  el("tabMKM").classList.toggle("active", view === "mkm");
  renderResult(state.lastResult);
}

function setShowFormulas(v) {
  state.showFormulas = !!v;
  renderResult(state.lastResult);
}

function optPlaceholder(select, text = "") {
  select.innerHTML = "";
  const o = document.createElement("option");
  o.value = "";
  o.textContent = text;
  select.appendChild(o);
}

function fillSelect(select, values, preferred) {
  const clean = Array.from(new Set((values || [])
    .map(v => (v == null ? "" : String(v)).trim())
    .filter(v => v && v !== "-" && v !== "—")
  ));

  optPlaceholder(select, "");
  for (const v of clean) {
    const o = document.createElement("option");
    o.value = v;
    o.textContent = v;
    select.appendChild(o);
  }

  if (preferred && clean.includes(preferred)) select.value = preferred;
  else if (clean.length) select.value = clean[0];
  else select.value = "";
}

function updateFitStr() {
  const hz = el("holeZone").value || "";
  const hi = el("holeIT").value || "";
  const sz = el("shaftZone").value || "";
  const si = el("shaftIT").value || "";
  el("fitStr").value = (hz && hi && sz && si) ? `${hz}${hi}/${sz}${si}` : "";
}

async function refreshZonesAndDefaultIT() {
  const D = el("D").value.trim();
  if (!D) return;

  const z = await window.fitApi.options({ D, mode: "zones" });

  // зоны
  fillSelect(el("holeZone"), z.holeZones || [], "H");
  fillSelect(el("shaftZone"), z.shaftZones || [], "g");

  // IT по выбранным зонам
  await refreshIT("hole", "H", "7");
  await refreshIT("shaft", "g", "6");

  updateFitStr();
}

async function refreshIT(kind, preferredZone, preferredIT) {
  const D = el("D").value.trim();
  const zone = (kind === "hole") ? el("holeZone").value : el("shaftZone").value;

  const z = zone || preferredZone || "";
  if (!D || !z) {
    if (kind === "hole") fillSelect(el("holeIT"), [], "");
    else fillSelect(el("shaftIT"), [], "");
    return;
  }

  const r = await window.fitApi.options({ D, mode: "it", kind, zone: z });
  const its = r.its || [];

  if (kind === "hole") fillSelect(el("holeIT"), its, preferredIT);
  else fillSelect(el("shaftIT"), its, preferredIT);
}

function toTableKV(obj, title, formulas) {
  const rows = Object.entries(obj).map(([k, v]) => {
    const f = formulas?.[k] ? `<td class="formula">${formulas[k]}</td>` : (state.showFormulas ? `<td class="formula"></td>` : "");
    return state.showFormulas
      ? `<tr><th>${k}</th><td>${String(v)}</td>${f}</tr>`
      : `<tr><th>${k}</th><td>${String(v)}</td></tr>`;
  }).join("");

  const head = state.showFormulas ? `<thead><tr><th>Параметр</th><th>Значение</th><th>Формула</th></tr></thead>` : "";
  return `
    <div class="blk">
      <div class="small" style="margin-top:8px">${title}</div>
      <table>${head}<tbody>${rows}</tbody></table>
    </div>
  `;
}

function formulasMap(unit) {
  // unit: "mm" | "mkm"
  // формулы  как в вашем примере (текстом)
  const f = {
    Dmax: "ES + D",
    Dmin: "EI + D",
    Dm: "Em + D = (Dmax + Dmin) / 2",
    dmax: "es + D",
    dmin: "ei + D",
    dm: "em + D = (dmax + dmin) / 2",
    ES: "Dmax - D",
    EI: "Dmin - D",
    Em: "(ES + EI) / 2",
    es: "dmax - D",
    ei: "dmin - D",
    em: "(es + ei) / 2",
    Smax: "Dmax - dmin = ES - ei",
    Smin: "Dmin - dmax = EI - es",
    Sm: "Dm - dm = Em - em = (Smax + Smin) / 2",
    Nmax: "dmax - Dmin = es - EI = -Smin",
    Nmin: "dmin - Dmax = ei - ES = -Smax",
    Nm: "dm - Dm = em - Em = (Nmax + Nmin) / 2",
    TD: "Dmax - Dmin = ES - EI",
    Td: "dmax - dmin = es - ei",
    Ts: "Smax - Smin = TD - Td",
    TN: "Nmax - Nmin = TD - Td"
  };
  return f;
}

function renderResult(res) {
  if (!res) { el("out").innerHTML = ""; return; }

  const mm = {
    deviations: res["deviations_мм"],
    limits: res["limits_мм"],
    means: res["means_мм"],
    tolerances: res["tolerances_мм"],
    fit_tolerance: res["fit_tolerance_мм"],
    clearance: res["clearance_мм"],
    interference: res["interference_мм"]
  };

  const mkm = {
    deviations: res["deviations_мкм"],
    limits: res["limits_мкм"],
    means: res["means_мкм"],
    tolerances: res["tolerances_мкм"],
    fit_tolerance: res["fit_tolerance_мкм"],
    clearance: res["clearance_мкм"],
    interference: res["interference_мкм"]
  };

  // Вкладка "мкм": абсолютные размеры оставить в мм (как вы просили)
  // limits: мм
  // means: Dm/dm в мм, остальное (Em/em/Sm/Nm) в мкм
  const view = state.view;
  const src = (view === "mm") ? mm : {
    deviations: mkm.deviations,
    limits: mm.limits,
    means: {
      Dm: mm.means.Dm,
      dm: mm.means.dm,
      Em: mkm.means.Em,
      em: mkm.means.em,
      Sm: mkm.means.Sm,
      Nm: mkm.means.Nm
    },
    tolerances: mkm.tolerances,
    fit_tolerance: mkm.fit_tolerance,
    clearance: mkm.clearance,
    interference: mkm.interference
  };

  const unitLabel = (view === "mm")
    ? "мм"
    : "мкм (Dmax/Dmin/dmax/dmin и Dm/dm  мм)";

  const head = `
    <div class="small">
      D=${res.input.D} ${res.input.hole}/${res.input.shaft} | nomCode=${res.nomCode}<br>
      Посадка: ${res.classification.fitType}; Система: ${res.classification.system}<br>
      Единицы: ${unitLabel}
    </div>
  `;

  const fm = formulasMap(view);

  el("out").innerHTML =
    head +
    toTableKV(src.deviations, view === "mm" ? "Отклонения (мм)" : "Отклонения (мкм)", fm) +
    toTableKV(src.limits, "Предельные размеры (мм)", fm) +
    toTableKV(src.means, view === "mm" ? "Средние (мм)" : "Средние (Dm/dm мм; Em/em/Sm/Nm мкм)", fm) +
    toTableKV(src.tolerances, view === "mm" ? "Допуски деталей (мм)" : "Допуски деталей (мкм)", fm) +
    toTableKV(src.fit_tolerance, view === "mm" ? "Допуски посадки (мм)" : "Допуски посадки (мкм)", fm) +
    toTableKV(src.clearance, view === "mm" ? "Зазоры (мм)" : "Зазоры (мкм)", fm) +
    toTableKV(src.interference, view === "mm" ? "Натяги (мм)" : "Натяги (мкм)", fm);
}

function downloadText(filename, text) {
  const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

async function doCalc() {
  setStatus("");
  try {
    updateFitStr();
    const D = el("D").value.trim();
    const fitStr = el("fitStr").value.trim();
    if (!fitStr) throw new Error("Выберите поле и IT для отверстия и вала.");

    const [hole, shaft] = fitStr.split("/");
    const res = await window.fitApi.compute({ D, hole, shaft });

    state.lastResult = res;
    renderResult(res);

    el("btnCopyJson").disabled = false;
    el("btnSaveJson").disabled = false;

    setStatus("OK");
  } catch (e) {
    state.lastResult = null;
    renderResult(null);
    el("btnCopyJson").disabled = true;
    el("btnSaveJson").disabled = true;
    setStatus("ERROR: " + (e?.message || String(e)));
  }
}

async function copyJson() {
  if (!state.lastResult) return;
  await navigator.clipboard.writeText(JSON.stringify(state.lastResult, null, 2));
  setStatus("JSON скопирован в буфер.");
}

function saveJson() {
  if (!state.lastResult) return;
  downloadText("fit_result.json", JSON.stringify(state.lastResult, null, 2));
}

function parseCsvLines(text) {
  const lines = text.split(/\r?\n/);
  const rows = [];
  for (const ln of lines) {
    const t = ln.trim();
    if (!t || t.startsWith("#")) continue;

    const parts = t.includes(";") ? t.split(";") : t.split(",");
    if (parts.length < 3) continue;

    const D = parts[0].trim();
    const hole = parts[1].trim();
    const shaft = parts[2].trim();

    if (D.toLowerCase() === "d" && hole.toLowerCase().includes("hole")) continue;
    rows.push({ D, hole, shaft });
  }
  return rows;
}

function batchHeader() {
  return [
    "D","hole","shaft",
    "ES","EI","es","ei",
    "Dmax","Dmin","dmax","dmin",
    "Em","em","Dm","dm",
    "Smax","Smin","Sm",
    "Nmax","Nmin","Nm",
    "TD","Td","Ts","TN",
    "fitType","system"
  ].join(";");
}

function batchRow(res) {
  const dev = res["deviations_мм"];
  const lim = res["limits_мм"];
  const mean = res["means_мм"];
  const tol = res["tolerances_мм"];
  const ftol = res["fit_tolerance_мм"];
  const clr = res["clearance_мм"];
  const inf = res["interference_мм"];
  const c = res.classification;

  const cols = [
    String(res.input.D),
    res.input.hole,
    res.input.shaft,

    dev.ES, dev.EI, dev.es, dev.ei,
    lim.Dmax, lim.Dmin, lim.dmax, lim.dmin,
    mean.Em, mean.em, mean.Dm, mean.dm,
    clr.Smax, clr.Smin, mean.Sm,
    inf.Nmax, inf.Nmin, mean.Nm,
    tol.TD, tol.Td,
    ftol.Ts, ftol.TN,

    c.fitType, c.system
  ];

  return cols.join(";");
}

async function runBatch() {
  if (!state.batchCsvText) return;
  setBatchStatus("Выполняется...");

  const rows = parseCsvLines(state.batchCsvText);
  const results = [];
  const out = [batchHeader()];

  let ok = 0, fail = 0;
  for (const r of rows) {
    try {
      const res = await window.fitApi.compute(r);
      results.push(res);
      out.push(batchRow(res));
      ok++;
    } catch {
      fail++;
    }
  }

  state.batchResults = results;
  state.batchOutCsv = out.join("\r\n");

  el("btnDownloadCsv").disabled = ok === 0;
  el("btnDownloadJsonBatch").disabled = ok === 0;

  setBatchStatus(`Готово. OK=${ok}, Ошибки=${fail}`);
}

function downloadBatchCsv() {
  if (!state.batchOutCsv) return;
  downloadText("out.csv", state.batchOutCsv);
}

function downloadBatchJson() {
  if (!state.batchResults) return;
  downloadText("out.json", JSON.stringify(state.batchResults, null, 2));
}

// Wiring
el("btnCalc").addEventListener("click", doCalc);
el("tabMM").addEventListener("click", () => setTab("mm"));
el("tabMKM").addEventListener("click", () => setTab("mkm"));
el("chkFormulas").addEventListener("change", (e) => setShowFormulas(e.target.checked));
el("btnCopyJson").addEventListener("click", copyJson);
el("btnSaveJson").addEventListener("click", saveJson);

el("chkAuto").addEventListener("change", (e) => { state.auto = e.target.checked; });

el("D").addEventListener("change", async () => {
  try { await refreshZonesAndDefaultIT(); if (state.auto) await doCalc(); }
  catch (e) { setStatus("ERROR: " + (e?.message || String(e))); }
});

el("holeZone").addEventListener("change", async () => {
  await refreshIT("hole", "", "");
  updateFitStr();
  if (state.auto) await doCalc();
});
el("shaftZone").addEventListener("change", async () => {
  await refreshIT("shaft", "", "");
  updateFitStr();
  if (state.auto) await doCalc();
});
el("holeIT").addEventListener("change", async () => { updateFitStr(); if (state.auto) await doCalc(); });
el("shaftIT").addEventListener("change", async () => { updateFitStr(); if (state.auto) await doCalc(); });

el("csvFile").addEventListener("change", async (e) => {
  const f = e.target.files?.[0];

  state.batchCsvText = null;
  state.batchResults = null;
  state.batchOutCsv = null;

  el("btnRunBatch").disabled = true;
  el("btnDownloadCsv").disabled = true;
  el("btnDownloadJsonBatch").disabled = true;

  if (!f) return;
  state.batchCsvText = await f.text();
  el("btnRunBatch").disabled = false;
  setBatchStatus(`Файл загружен: ${f.name}`);
});

el("btnRunBatch").addEventListener("click", runBatch);
el("btnDownloadCsv").addEventListener("click", downloadBatchCsv);
el("btnDownloadJsonBatch").addEventListener("click", downloadBatchJson);

// init
(async () => {
  optPlaceholder(el("holeZone"));
  optPlaceholder(el("shaftZone"));
  optPlaceholder(el("holeIT"));
  optPlaceholder(el("shaftIT"));

  await refreshZonesAndDefaultIT();
  updateFitStr();
  setTab("mm");
})();

