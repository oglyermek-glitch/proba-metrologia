"use strict";

const path = require("path");
const { app, BrowserWindow, ipcMain } = require("electron");

const { computeFit } = require(path.join(__dirname, "..", "src", "fitcalc"));

const idx = require(path.join(__dirname, "..", "data", "qualitets.index.json"));
const data = require(path.join(__dirname, "..", "data", "qualitets.optimized.js"));

function buildZoneMaps(tolZones) {
  const tz = tolZones || {};
  const keys = Object.keys(tz);
  const isNumericKeys = keys.length > 0 && keys.every(k => /^\d+$/.test(String(k)));

  if (isNumericKeys) {
    const codeToZone = Object.fromEntries(Object.entries(tz).map(([c, z]) => [String(c), String(z).trim()]));
    const zoneToCode = Object.fromEntries(Object.entries(tz).map(([c, z]) => [String(z).trim(), String(c)]));
    return { codeToZone, zoneToCode };
  }

  const zoneToCode = Object.fromEntries(Object.entries(tz).map(([z, c]) => [String(z).trim(), String(c)]));
  const codeToZone = Object.fromEntries(Object.entries(tz).map(([z, c]) => [String(c), String(z).trim()]));
  return { codeToZone, zoneToCode };
}

const { codeToZone, zoneToCode } = buildZoneMaps(data.tol_zones);

function nomCodeFromD(D) {
  const x = Number(D);
  if (!Number.isFinite(x) || x <= 0) throw new Error("D must be > 0");

  const bounds = [
    [0, 1],[1, 3],[3, 6],[6, 10],[10, 18],[18, 30],[30, 50],[50, 80],[80, 120],
    [120, 180],[180, 250],[250, 315],[315, 400],[400, 500],[500, 630],[630, 800],[800, 1000]
  ];

  for (let i = 0; i < bounds.length; i++) {
    const [a, b] = bounds[i];
    if (x > a && x <= b) return String(i + 1);
  }
  throw new Error("D out of supported range");
}

// ISO 286: отверстия  верхний регистр (12 буквы), включая JS, ZA/ZB/ZC
function isHoleZone(z) {
  return typeof z === "string" && /^[A-Z]{1,2}$/.test(z);
}

// ISO 286: валы  нижний регистр (12 буквы), включая cd/ef/fg/js/za...
function isShaftZone(z) {
  return typeof z === "string" && /^[a-z]{1,2}$/.test(z);
}

function listZones(kind, nomCode) {
  const k = (kind === "hole") ? "0" : "1";
  const byZoneCode = idx[k] || {};
  const zones = [];

  for (const zCode of Object.keys(byZoneCode)) {
    const byNom = byZoneCode[zCode];
    if (!byNom || !byNom[String(nomCode)]) continue;

    const zRaw = codeToZone[String(zCode)];
    const z = (zRaw == null) ? "" : String(zRaw).trim();
    if (!z) continue;

    if (kind === "hole") {
      if (isHoleZone(z)) zones.push(z);
    } else {
      if (isShaftZone(z)) zones.push(z);
    }
  }

  // уникализация
  const uniq = Array.from(new Set(zones));
  uniq.sort((a, b) => a.localeCompare(b));
  return uniq;
}

function parseIT(s) {
  if (s === "01") return 0.5;
  const n = Number(s);
  return Number.isFinite(n) ? n : 1e9;
}

function listIT(kind, zone, nomCode) {
  if (!zone) return [];
  const zCode = zoneToCode[String(zone)];
  if (zCode === undefined) return [];

  const k = (kind === "hole") ? "0" : "1";
  const set = idx[k]?.[String(zCode)]?.[String(nomCode)];
  if (!set) return [];

  const its = [];
  const seen = new Set();

  // ключи set  внутренние ID; реальный IT берём через data.qualitets[ID]
  for (const key of Object.keys(set)) {
    const q = data.qualitets?.[String(key)];
    if (q === undefined || q === null) continue;
    const it = String(q).trim();
    if (!it) continue;
    if (!seen.has(it)) { seen.add(it); its.push(it); }
  }

  its.sort((a, b) => parseIT(a) - parseIT(b));
  return its;
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1180,
    height: 780,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  win.loadFile(path.join(__dirname, "index.html"));
}

app.whenReady().then(() => {
  ipcMain.handle("fit:compute", (_evt, payload) => computeFit(payload));

  ipcMain.handle("fit:options", (_evt, payload) => {
    const D = payload?.D;
    const nomCode = nomCodeFromD(D);

    if (!payload?.mode || payload.mode === "zones") {
      return {
        nomCode,
        holeZones: listZones("hole", nomCode),
        shaftZones: listZones("shaft", nomCode)
      };
    }

    if (payload.mode === "it") {
      const kind = payload.kind;   // "hole" | "shaft"
      const zone = payload.zone;   // "H" или "g"
      return { nomCode, its: listIT(kind, zone, nomCode) };
    }

    return { nomCode };
  });

  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
