"use strict";

const path = require("path");

function loadData() {
  const optimized = require(path.join(__dirname, "..", "data", "qualitets.optimized.js"));
  const index = require(path.join(__dirname, "..", "data", "qualitets.index.json"));

  const { nom_zones, tol_zones } = optimized;

  const zoneToKey = new Map();
  for (const [k, v] of Object.entries(tol_zones)) zoneToKey.set(v, Number(k));

  return { nom_zones, tol_zones, zoneToKey, index };
}

function discoverNomCode(Dmm, nom_zones) {
  if (!Number.isFinite(Dmm) || Dmm <= 0) throw new Error("D must be a positive number (mm).");

  const [low0, high0, code0] = nom_zones[0];
  if (Dmm >= low0 && Dmm <= high0) return code0;

  for (let i = 1; i < nom_zones.length; i++) {
    const [low, high, code] = nom_zones[i];
    if (Dmm > low && Dmm <= high) return code;
  }
  throw new Error(`D=${Dmm} mm is out of supported nominal ranges.`);
}

function parseDesignation(str) {
  if (typeof str !== "string") throw new Error("Designation must be a string like H7 or g6.");
  const s = str.trim();
  const m = s.match(/^([A-Za-z]{1,2})(\d{1,2})$/);
  if (!m) throw new Error(`Invalid designation: "${str}". Expected e.g. H7, g6, JS7, js6`);

  const zone = m[1];
  const IT = Number(m[2]);
  if (!Number.isFinite(IT) || IT <= 0) throw new Error(`Invalid IT in "${str}".`);

  const isHole = zone === zone.toUpperCase();
  const kind = isHole ? 0 : 1;
  return { zone, IT, kind };
}

// мм -> мкм (целое), допускает до 3 знаков
function mmToMkmExact(x) {
  if (typeof x === "number") x = String(x);
  if (typeof x !== "string") throw new Error("D must be a number or numeric string.");

  const s = x.trim().replace(",", ".");
  const m = s.match(/^([+-])?(\d+)(?:\.(\d{1,3})\d*)?$/);
  if (!m) throw new Error(`Invalid D="${x}". Use number with up to 3 decimals.`);

  const sign = (m[1] === "-") ? -1 : 1;
  const intPart = m[2];
  const fracPart = (m[3] || "").padEnd(3, "0").slice(0, 3);

  const mkm = sign * (Number(intPart) * 1000 + Number(fracPart));
  if (!Number.isFinite(mkm)) throw new Error(`Invalid D="${x}".`);
  return mkm;
}

// мкм -> "мм" строкой с 3 знаками (без float)
function mkmToMmStr(mkm) {
  const sgn = mkm < 0 ? "-" : "";
  const a = Math.abs(mkm);
  const ip = Math.floor(a / 1000);
  const fp = String(a % 1000).padStart(3, "0");
  return `${sgn}${ip}.${fp}`;
}

// ROUND half away from zero для /2 в мкм
function roundHalfAwayFromZeroDiv2(sumInt) {
  if (sumInt >= 0) return Math.floor((sumInt + 1) / 2);
  return -Math.floor((Math.abs(sumInt) + 1) / 2);
}

function extractUpperLower(rec) {
  // {upper,lower} OR [upper,lower] OR {0,1}
  if (rec == null) return null;

  let upper, lower;
  if (Array.isArray(rec) && rec.length >= 2) {
    upper = rec[0]; lower = rec[1];
  } else if (typeof rec === "object") {
    if ("upper" in rec && "lower" in rec) { upper = rec.upper; lower = rec.lower; }
    else if (("0" in rec) && ("1" in rec)) { upper = rec[0]; lower = rec[1]; }
  }

  const u = Number(upper);
  const l = Number(lower);
  if (!Number.isFinite(u) || !Number.isFinite(l)) return null;
  return { upper: Math.trunc(u), lower: Math.trunc(l) }; // мкм int
}

function getDeviationMkm(index, kind, nomCode, IT, tolKey) {
  const rec = index?.[String(kind)]?.[String(nomCode)]?.[String(IT)]?.[String(tolKey)];
  return extractUpperLower(rec);
}

function classifyFit(Smin_mkm, Smax_mkm) {
  if (Smin_mkm >= 0) return (Smin_mkm === 0) ? "скользящая (нулевой min зазор)" : "с гарантированным зазором";
  if (Smax_mkm <= 0) return (Smax_mkm === 0) ? "легко прессовая (нулевой max зазор)" : "с гарантированным натягом";
  return "переходная";
}

function classifySystem(EI_mkm, es_mkm) {
  if (EI_mkm === 0) return "система отверстия (EI=0)";
  if (es_mkm === 0) return "система вала (es=0)";
  return "не базовая (не H/h)";
}

function computeFit({ D, hole, shaft }) {
  const { nom_zones, zoneToKey, index } = loadData();

  const Dmm = Number(String(D).replace(",", "."));
  if (!Number.isFinite(Dmm)) throw new Error("D must be numeric (mm).");

  const D_mkm = mmToMkmExact(String(D));

  const h = parseDesignation(hole);
  const s = parseDesignation(shaft);

  if (h.kind !== 0) throw new Error(`"${hole}" must be a hole designation (uppercase).`);
  if (s.kind !== 1) throw new Error(`"${shaft}" must be a shaft designation (lowercase).`);

  const nomCode = discoverNomCode(Dmm, nom_zones);

  const holeKey = zoneToKey.get(h.zone);
  const shaftKey = zoneToKey.get(s.zone);
  if (holeKey == null) throw new Error(`Unknown hole zone "${h.zone}".`);
  if (shaftKey == null) throw new Error(`Unknown shaft zone "${s.zone}".`);

  const devH = getDeviationMkm(index, 0, nomCode, h.IT, holeKey);
  const devS = getDeviationMkm(index, 1, nomCode, s.IT, shaftKey);
  if (!devH) throw new Error(`No table entry for hole ${h.zone}${h.IT} at nomCode=${nomCode}.`);
  if (!devS) throw new Error(`No table entry for shaft ${s.zone}${s.IT} at nomCode=${nomCode}.`);

  const ES = devH.upper, EI = devH.lower;
  const es = devS.upper, ei = devS.lower;

  const Dmax = D_mkm + ES;
  const Dmin = D_mkm + EI;
  const dmax = D_mkm + es;
  const dmin = D_mkm + ei;

  const TD = ES - EI;
  const Td = es - ei;

  const Smax = Dmax - dmin;
  const Smin = Dmin - dmax;

  const Nmax = dmax - Dmin;
  const Nmin = dmin - Dmax;

  // Табличные средние (в мкм)
  const Em = roundHalfAwayFromZeroDiv2(ES + EI);
  const em = roundHalfAwayFromZeroDiv2(es + ei);

  const Dm = D_mkm + Em;
  const dm = D_mkm + em;

  const Sm = Em - em;
  const Nm = -Sm;

  const Ts = Smax - Smin;
  const TN = Nmax - Nmin;

  const fitType = classifyFit(Smin, Smax);
  const system = classifySystem(EI, es);

  return {
    input: { D: Dmm, hole: `${h.zone}${h.IT}`, shaft: `${s.zone}${s.IT}` },
    nomCode,

    deviations_мкм: { ES, EI, es, ei },
    limits_мкм: { Dmax, Dmin, dmax, dmin },
    means_мкм: { Dm, dm, Em, em, Sm, Nm },
    tolerances_мкм: { TD, Td },
    fit_tolerance_мкм: { Ts, TN },
    clearance_мкм: { Smax, Smin },
    interference_мкм: { Nmax, Nmin },

    classification: { fitType, system },

    // Табличный вид в мм (строки с 3 знаками, без float-хвостов)
    deviations_мм: { ES: mkmToMmStr(ES), EI: mkmToMmStr(EI), es: mkmToMmStr(es), ei: mkmToMmStr(ei) },
    limits_мм: { Dmax: mkmToMmStr(Dmax), Dmin: mkmToMmStr(Dmin), dmax: mkmToMmStr(dmax), dmin: mkmToMmStr(dmin) },
    means_мм: { Dm: mkmToMmStr(Dm), dm: mkmToMmStr(dm), Em: mkmToMmStr(Em), em: mkmToMmStr(em), Sm: mkmToMmStr(Sm), Nm: mkmToMmStr(Nm) },
    tolerances_мм: { TD: mkmToMmStr(TD), Td: mkmToMmStr(Td) },
    fit_tolerance_мм: { Ts: mkmToMmStr(Ts), TN: mkmToMmStr(TN) },
    clearance_мм: { Smax: mkmToMmStr(Smax), Smin: mkmToMmStr(Smin) },
    interference_мм: { Nmax: mkmToMmStr(Nmax), Nmin: mkmToMmStr(Nmin) }
  };
}

module.exports = { computeFit };
