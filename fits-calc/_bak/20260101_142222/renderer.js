"use strict";

const el = (id) => document.getElementById(id);

const state = {
  lastResult: null,
  view: "mm",          // "mm" | "mkm"
  showFormulas: false,
  auto: false,
  batchCsvText: null,
  batchResults: null,
  batchOutCsv: null
};

function setStatus(msg) {
  el("status").textContent = msg || "";
}
function setBatchStatus(msg) {
  el("batchStatus").textContent = msg || "";
}

function normNum(s) {
  return String(s ?? "").trim().replace(",", ".");
}
function getD() {
  const x = Number(normNum(el("D").value));
  if (!Number.isFinite(x) || x <= 0) throw new Error("D должен быть > 0");
  return x;
}

function fillSelect(id, values, preferValue) {
  const sel = el(id);
  const cur = sel.value;

  sel.innerHTML = "";
  const opt0 = document.createElement("option");
  opt0.value = "";
  opt0.textContent = "";
  sel.appendChild(opt0);

  for (const v of values || []) {
    const o = document.createElement("option");
    o.value = String(v);
    o.textContent = String(v);
    sel.appendChild(o);
  }

  // приоритет выбора: prefer -> текущее -> первое реальное
  if (preferValue && (values || []).includes(preferValue)) {
    sel.value = preferValue;
    return;
  }
  if (cur && (values || []).includes(cur)) {
    sel.value = cur;
    return;
  }
  // если есть хотя бы 1 реальный вариант  выбираем его
  if (sel.options.length > 1) sel.selectedIndex = 1;
}

function updateFitStr() {
  const hz = el("holeZone").value;
  const hi = el("holeIT").value;
  const sz = el("shaftZone").value;
  const si = el("shaftIT").value;

  const fit = `${hz || ""}${hi || ""}/${sz || ""}${si || ""}`;
  el("fitStr").value = fit;

  return fit;
}

async function refreshZonesAndIT() {
  const D = getD();

  // 1) зоны
  const z = await window.fitApi.options({ D, mode: "zones" });
  fillSelect("holeZone", z.holeZones || [], "H");
  fillSelect("shaftZone", z.shaftZones || [], "h");

  // 2) IT по выбранным зонам
  await refreshIT("hole");
  await refreshIT("shaft");

  updateFitStr();
}

async function refreshIT(kind) {
  const D = getD();
  const zone = el(kind === "hole" ? "holeZone" : "shaftZone").value;

  if (!zone) {
    fillSelect(kind === "hole" ? "holeIT" : "shaftIT", [], null);
    return;
  }

  const r = await window.fitApi.options({ D, mode: "it", kind, zone });
  const its = r.its || [];

  // предпочтения по умолчанию (если в списке есть)
  const prefer = (kind === "hole") ? "7" : "6";
  fillSelect(kind === "hole" ? "holeIT" : "shaftIT", its, prefer);
}

function buildFitForCompute() {
  const hz = el("holeZone").value;
  const hi = el("holeIT").value;
  const sz = el("shaftZone").value;
  const si = el("shaftIT").value;

  if (!hz || !hi || !sz || !si) throw new Error("Выберите зону и IT для отверстия и вала.");

  return {
    D: getD(),
    hole: `${hz}${hi}`,
    shaft: `${sz}${si}`
  };
}

// ---------- Табличный вывод ----------
const FORMULAS = {
  // размеры (мм)
  Dmax: "D + ES",
  Dmin: "D + EI",
  Dm: "(Dmax + Dmin) / 2",
  dmax: "D + es",
  dmin: "D + ei",
  dm: "(dmax + dmin) / 2",

  // отклонения
  ES: "Dmax - D",
  EI: "Dmin - D",
  Em: "(ES + EI) / 2",
  es: "dmax - D",
  ei: "dmin - D",
  em: "(es + ei) / 2",

  // зазоры/натяги
  Smax: "Dmax - dmin",
  Smin: "Dmin - dmax",
  Sm: "(Smax + Smin) / 2",
  Nmax: "dmax - Dmin",
  Nmin: "dmin - Dmax",
  Nm: "(Nmax + Nmin) / 2",

  // допуски
  TD: "Dmax - Dmin",
  Td: "dmax - dmin",
  Ts: "Smax - Smin = TD - Td",
  TN: "Nmax - Nmin = TD - Td"
};

function toTable(obj, title, showFormulas) {
  const entries = Object.entries(obj || {});
  const rows = entries.map(([k, v]) => {
    const f = showFormulas ? (FORMULAS[k] || "") : "";
    return `
      <tr>
        <th>${k}</th>
        <td>${String(v)}</td>
        ${showFormulas ? `<td class="small mono">${f}</td>` : ""}
      </tr>
    `;
  }).join("");

  const head = `
    <div class="blk">
      <div class="small" style="margin-top:8px">${title}</div>
      <table>
        <tbody>${rows}</tbody>
      </table>
    </div>
  `;

  return head;
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

  // Требование: во вкладке "мкм" абсолютные размеры оставить в мм:
  // - Предельные размеры: Dmax/Dmin/dmax/dmin -> мм
  // - Средние размеры: Dm/dm -> мм; остальное (Em/em/Sm/Nm) -> мкм
  let src = (state.view === "mm") ? mm : mkm;

  if (state.view === "mkm") {
    src = {
      ...mkm,
      limits: mm.limits,
      means: {
        Dm: mm.means.Dm,
        dm: mm.means.dm,
        Em: mkm.means.Em,
        em: mkm.means.em,
        Sm: mkm.means.Sm,
        Nm: mkm.means.Nm
      }
    };
  }

  const unitLabel = (state.view === "mm")
    ? "мм"
    : "мкм (Dmax/Dmin/dmax/dmin и Dm/dm  мм)";

  const head = `
    <div class="small">
      D=${res.input.D} ${res.input.hole}/${res.input.shaft} | nomCode=${res.nomCode}<br>
      Посадка: ${res.classification.fitType}; Система: ${res.classification.system}<br>
      Единицы: ${unitLabel}
    </div>
  `;

  // В "мкм" таблично подписываем как в требовании
  el("out").innerHTML =
    head +
    toTable(src.deviations, (state.view === "mkm" ? "Отклонения (мкм)" : "Отклонения (мм)"), state.showFormulas) +
    toTable(src.limits, "Предельные размеры (мм)", state.showFormulas) +
    toTable(src.means, (state.view === "mkm" ? "Средние (Dm/dm  мм; Em/em/Sm/Nm  мкм)" : "Средние (мм)"), state.showFormulas) +
    toTable(src.tolerances, (state.view === "mkm" ? "Допуски деталей (мкм)" : "Допуски деталей (мм)"), state.showFormulas) +
    toTable(src.fit_tolerance, (state.view === "mkm" ? "Допуски посадки (мкм)" : "Допуски посадки (мм)"), state.showFormulas) +
    toTable(src.clearance, (state.view === "mkm" ? "Зазоры (мкм)" : "Зазоры (мм)"), state.showFormulas) +
    toTable(src.interference, (state.view === "mkm" ? "Натяги (мкм)" : "Натяги (мм)"), state.showFormulas);
}

// ---------- Действия ----------
async function doCalc() {
  setStatus("");
  try {
    const payload = buildFitForCompute();
    const res = await window.fitApi.compute(payload);
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
    setStatus("ERROR: " + (e && e.message ? e.message : String(e)));
  }
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

async function copyJson() {
  if (!state.lastResult) return;
  await navigator.clipboard.writeText(JSON.stringify(state.lastResult, null, 2));
  setStatus("JSON скопирован в буфер.");
}

function saveJson() {
  if (!state.lastResult) return;
  downloadText("fit_result.json", JSON.stringify(state.lastResult, null, 2));
}

// ---------- Пакет CSV ----------
function parseCsvLines(text) {
  const lines = String(text || "").split(/\r?\n/);
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

// ---------- UI wiring ----------
function setTab(view) {
  state.view = view;
  el("tabMM").classList.toggle("active", view === "mm");
  el("tabMKM").classList.toggle("active", view === "mkm");
  renderResult(state.lastResult);
}

// debounce для ввода D
let tD = null;
function onDChanged() {
  clearTimeout(tD);
  tD = setTimeout(async () => {
    try {
      await refreshZonesAndIT();
      if (state.auto) await doCalc();
      setStatus("OK");
    } catch (e) {
      setStatus("ERROR: " + (e && e.message ? e.message : String(e)));
    }
  }, 200);
}

async function onZoneChanged(kind) {
  try {
    await refreshIT(kind);
    updateFitStr();
    if (state.auto) await doCalc();
  } catch (e) {
    setStatus("ERROR: " + (e && e.message ? e.message : String(e)));
  }
}

function onITChanged() {
  updateFitStr();
  if (state.auto) doCalc();
}

el("btnCalc").addEventListener("click", doCalc);
el("tabMM").addEventListener("click", () => setTab("mm"));
el("tabMKM").addEventListener("click", () => setTab("mkm"));

el("btnCopyJson").addEventListener("click", copyJson);
el("btnSaveJson").addEventListener("click", saveJson);

el("chkAuto").addEventListener("change", (e) => { state.auto = !!e.target.checked; });
el("chkFormulas").addEventListener("change", (e) => { state.showFormulas = !!e.target.checked; renderResult(state.lastResult); });

el("D").addEventListener("input", onDChanged);

el("holeZone").addEventListener("change", () => onZoneChanged("hole"));
el("shaftZone").addEventListener("change", () => onZoneChanged("shaft"));

el("holeIT").addEventListener("change", onITChanged);
el("shaftIT").addEventListener("change", onITChanged);

el("csvFile").addEventListener("change", async (e) => {
  const f = e.target.files && e.target.files[0];
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
  try {
    await refreshZonesAndIT();
    updateFitStr();
    setTab("mm");
    setStatus("OK");
  } catch (e) {
    setStatus("ERROR: " + (e && e.message ? e.message : String(e)));
  }
})();
"@ | Set-Content -Encoding UTF8 .\ui\renderer.js
