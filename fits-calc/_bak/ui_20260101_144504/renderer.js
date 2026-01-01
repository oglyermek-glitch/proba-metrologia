"use strict";

const el = (id) => document.getElementById(id);

const state = {
  lastResult: null,
  view: "mm",      // "mm" | "mkm"
  showFormulas: false,

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

function safeNum(x) {
  const n = Number(String(x).replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

function setSelectOptions(select, items, placeholder = "") {
  select.innerHTML = "";
  const opt0 = document.createElement("option");
  opt0.value = "";
  opt0.textContent = placeholder;
  select.appendChild(opt0);

  for (const v of items) {
    const o = document.createElement("option");
    o.value = v;
    o.textContent = v;
    select.appendChild(o);
  }
}

function setSelectedIfExists(select, value) {
  if (!value) return false;
  const opt = Array.from(select.options).find(o => o.value === value);
  if (opt) { select.value = value; return true; }
  return false;
}

function composeFitStr() {
  const hz = el("holeZone").value.trim();
  const hi = el("holeIT").value.trim();
  const sz = el("shaftZone").value.trim();
  const si = el("shaftIT").value.trim();

  const hole = (hz && hi) ? (hz + hi) : "";
  const shaft = (sz && si) ? (sz + si) : "";
  el("fitStr").value = (hole && shaft) ? `${hole}/${shaft}` : "";
}

async function refreshZones() {
  const D = safeNum(el("D").value);
  if (D === null) {
    setSelectOptions(el("holeZone"), []);
    setSelectOptions(el("shaftZone"), []);
    setSelectOptions(el("holeIT"), []);
    setSelectOptions(el("shaftIT"), []);
    composeFitStr();
    return;
  }

  const r = await window.fitApi.options({ D, mode: "zones" });

  const holeZones = r.holeZones || [];
  const shaftZones = r.shaftZones || [];

  const prevHZ = el("holeZone").value;
  const prevSZ = el("shaftZone").value;

  setSelectOptions(el("holeZone"), holeZones);
  setSelectOptions(el("shaftZone"), shaftZones);

  // дефолты: отверстие H, вал g
  if (!setSelectedIfExists(el("holeZone"), prevHZ)) setSelectedIfExists(el("holeZone"), "H");
  if (!setSelectedIfExists(el("shaftZone"), prevSZ)) setSelectedIfExists(el("shaftZone"), "g");

  await refreshIT("hole");
  await refreshIT("shaft");

  composeFitStr();
}

async function refreshIT(kind) {
  const D = safeNum(el("D").value);
  if (D === null) return;

  const zoneSel = (kind === "hole") ? el("holeZone") : el("shaftZone");
  const itSel   = (kind === "hole") ? el("holeIT")   : el("shaftIT");

  const zone = zoneSel.value.trim();
  if (!zone) {
    setSelectOptions(itSel, []);
    composeFitStr();
    return;
  }

  const r = await window.fitApi.options({ D, mode: "it", kind, zone });
  const its = r.its || [];

  const prevIT = itSel.value;

  setSelectOptions(itSel, its);

  // дефолты: отверстие 7, вал 6
  if (!setSelectedIfExists(itSel, prevIT)) {
    if (kind === "hole") setSelectedIfExists(itSel, "7");
    if (kind === "shaft") setSelectedIfExists(itSel, "6");
  }

  composeFitStr();
}

function fmt3(x) {
  const n = Number(x);
  if (!Number.isFinite(n)) return String(x);
  return n.toFixed(3);
}

function toTableKV(obj, title, formulasMap) {
  const rows = Object.entries(obj || {}).map(([k, v]) => {
    const f = formulasMap?.[k];
    const val = String(v);
    if (state.showFormulas && f) {
      return `<tr><th>${k}</th><td>${val}</td><td class="fml">${f}</td></tr>`;
    }
    return `<tr><th>${k}</th><td>${val}</td></tr>`;
  }).join("");

  const cols = (state.showFormulas)
    ? `<table><thead><tr><th>Параметр</th><th>Значение</th><th>Формула</th></tr></thead><tbody>${rows}</tbody></table>`
    : `<table><tbody>${rows}</tbody></table>`;

  return `
    <div class="blk">
      <div class="small" style="margin-top:8px">${title}</div>
      ${cols}
    </div>
  `;
}

function renderResult(res) {
  if (!res) { el("out").innerHTML = ""; return; }

  // вкладка мм: все в мм
  const mm = {
    deviations: res["deviations_мм"],
    limits: res["limits_мм"],
    means: res["means_мм"],
    tolerances: res["tolerances_мм"],
    fit_tolerance: res["fit_tolerance_мм"],
    clearance: res["clearance_мм"],
    interference: res["interference_мм"]
  };

  // вкладка мкм: все в мкм, но абсолютные размеры оставить в мм:
  // limits: Dmax/Dmin/dmax/dmin -> мм
  // means: Dm/dm -> мм, а Em/em/Sm/Nm -> мкм
  const mkm = {
    deviations: res["deviations_мкм"],
    limits: mm.limits,
    means: {
      Dm: mm.means?.Dm,
      dm: mm.means?.dm,
      Em: res["means_мкм"]?.Em,
      em: res["means_мкм"]?.em,
      Sm: res["means_мкм"]?.Sm,
      Nm: res["means_мкм"]?.Nm
    },
    tolerances: res["tolerances_мкм"],
    fit_tolerance: res["fit_tolerance_мкм"],
    clearance: res["clearance_мкм"],
    interference: res["interference_мкм"]
  };

  const src = (state.view === "mm") ? mm : mkm;

  const unitLabel = (state.view === "mm")
    ? "мм"
    : "мкм (абсолютные размеры Dmax/Dmin/dmax/dmin и Dm/dm  в мм)";

  const head = `
    <div class="small">
      D=${res.input.D} ${res.input.hole}/${res.input.shaft} | nomCode=${res.nomCode}<br>
      Посадка: ${res.classification.fitType}; Система: ${res.classification.system}<br>
      Единицы: ${unitLabel}
    </div>
  `;

  // Формулы (как в вашем примере)
  const F = {
    // Отклонения
    ES: "Dmax - D",
    EI: "Dmin - D",
    Em: "Dm - D = (ES + EI) / 2",
    es: "dmax - D",
    ei: "dmin - D",
    em: "dm - D = (es + ei) / 2",

    // Предельные / средние размеры
    Dmax: "D + ES",
    Dmin: "D + EI",
    Dm: "(Dmax + Dmin) / 2",
    dmax: "D + es",
    dmin: "D + ei",
    dm: "(dmax + dmin) / 2",

    // Допуски деталей
    TD: "Dmax - Dmin = ES - EI",
    Td: "dmax - dmin = es - ei",

    // Зазоры/натяги
    Smax: "Dmax - dmin = ES - ei = -Nmin",
    Smin: "Dmin - dmax = EI - es = -Nmax",
    Sm: "(Smax + Smin) / 2 = Dm - dm = -Nm",

    Nmax: "dmax - Dmin = es - EI = -Smin",
    Nmin: "dmin - Dmax = ei - ES = -Smax",
    Nm: "(Nmax + Nmin) / 2 = dm - Dm = -Sm",

    // Допуски посадки
    Ts: "Smax - Smin = TD - Td",
    TN: "Nmax - Nmin = TD - Td"
  };

  el("out").innerHTML =
    head +
    toTableKV(src.deviations, (state.view === "mm") ? "Отклонения (мм)" : "Отклонения (мкм)", F) +
    toTableKV(src.limits, "Предельные размеры (мм)", F) +
    toTableKV(src.means, (state.view === "mm") ? "Средние (мм)" : "Средние (Dm/dm мм; Em/em/Sm/Nm мкм)", F) +
    toTableKV(src.tolerances, (state.view === "mm") ? "Допуски деталей (мм)" : "Допуски деталей (мкм)", F) +
    toTableKV(src.fit_tolerance, (state.view === "mm") ? "Допуски посадки (мм)" : "Допуски посадки (мкм)", F) +
    toTableKV(src.clearance, (state.view === "mm") ? "Зазоры (мм)" : "Зазоры (мкм)", F) +
    toTableKV(src.interference, (state.view === "mm") ? "Натяги (мм)" : "Натяги (мкм)", F);
}

async function doCalc() {
  setStatus("");
  const D = safeNum(el("D").value);
  if (D === null) { setStatus("ERROR: D не число"); return; }

  const hz = el("holeZone").value.trim();
  const hi = el("holeIT").value.trim();
  const sz = el("shaftZone").value.trim();
  const si = el("shaftIT").value.trim();

  if (!hz || !hi || !sz || !si) {
    setStatus("ERROR: выберите поле допуска и квалитет для отверстия и вала");
    return;
  }

  const hole = hz + hi;
  const shaft = sz + si;

  try {
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

function saveJson() {
  if (!state.lastResult) return;
  downloadText("fit_result.json", JSON.stringify(state.lastResult, null, 2));
}

// CSV batch (оставлено как было, работает в мм-строках)
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
    rows.push({ D: safeNum(D), hole, shaft });
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
    } catch (_e) {
      fail++;
    }
  }

  state.batchResults = results;
  state.batchOutCsv = out.join("\r\n");

  el("btnDownloadCsv").disabled = (ok === 0);
  el("btnDownloadJsonBatch").disabled = (ok === 0);

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
el("btnCopyJson").addEventListener("click", copyJson);
el("btnSaveJson").addEventListener("click", saveJson);

el("tabMM").addEventListener("click", () => setTab("mm"));
el("tabMKM").addEventListener("click", () => setTab("mkm"));

el("chkFormulas").addEventListener("change", () => {
  state.showFormulas = el("chkFormulas").checked;
  renderResult(state.lastResult);
});

el("D").addEventListener("input", async () => {
  if (!el("chkAuto").checked) return;
  try { await refreshZones(); } catch (e) { setStatus("ERROR: " + (e?.message || String(e))); }
});

el("holeZone").addEventListener("change", async () => {
  try { await refreshIT("hole"); if (el("chkAuto").checked) await doCalc(); } catch (e) { setStatus("ERROR: " + (e?.message || String(e))); }
});
el("shaftZone").addEventListener("change", async () => {
  try { await refreshIT("shaft"); if (el("chkAuto").checked) await doCalc(); } catch (e) { setStatus("ERROR: " + (e?.message || String(e))); }
});

el("holeIT").addEventListener("change", async () => { composeFitStr(); if (el("chkAuto").checked) await doCalc(); });
el("shaftIT").addEventListener("change", async () => { composeFitStr(); if (el("chkAuto").checked) await doCalc(); });

el("csvFile").addEventListener("change", async (e) => {
  const f = e.target.files?.[0];
  state.batchCsvText = null;
  state.batchResults = null;
  state.batchOutCsv = null;

  el("btnRunBatch").disabled = true;
  el("btnDownloadCsv").disabled = true;
  el("btnDownloadJsonBatch").disabled = true;

  if (!f) return;

  const text = await f.text();
  state.batchCsvText = text;
  el("btnRunBatch").disabled = false;
  setBatchStatus(`Файл загружен: ${f.name}`);
});

el("btnRunBatch").addEventListener("click", runBatch);
el("btnDownloadCsv").addEventListener("click", downloadBatchCsv);
el("btnDownloadJsonBatch").addEventListener("click", downloadBatchJson);

// init
(async () => {
  setTab("mm");
  try {
    await refreshZones();
    composeFitStr();
  } catch (e) {
    setStatus("ERROR: " + (e?.message || String(e)));
  }
})();
