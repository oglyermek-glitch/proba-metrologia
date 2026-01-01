"use strict";

const path = require("path");
const { app, BrowserWindow, ipcMain } = require("electron");

const { computeFit } = require(path.join(__dirname, "..", "src", "fitcalc"));

const idx = require(path.join(__dirname, "..", "data", "qualitets.index.json"));
const data = require(path.join(__dirname, "..", "data", "qualitets.optimized.js"));

// tol_zones в вашей базе: code -> zone (пример: "10":"g").
// Делаем мапы в обе стороны, устойчиво к любому направлению.
const tolZonesRaw = data.tol_zones || {};
const codeToZone = {};
const zoneToCode = {};

for (const [k, v] of Object.entries(tolZonesRaw)) {
  const ks = String(k);
  const vs = String(v);

  const kIsNum = /^\d+$/.test(ks);
  const vIsNum = /^\d+$/.test(vs);

  if (kIsNum && !vIsNum) {
    // code -> zone
    codeToZone[ks] = vs;
    zoneToCode[vs] = ks;
  } else if (!kIsNum && vIsNum) {
    // zone -> code
    zoneToCode[ks] = vs;
    codeToZone[vs] = ks;
  } else {
    // На всякий случай
    // если оба нечисловые  считаем k=zone, v=code (или наоборот не важно, но заполним)
    zoneToCode[ks] = vs;
    codeToZone[vs] = ks;
  }
}

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

function listZones(kind, nomCode) {
  const k = (kind === "hole") ? "0" : "1";
  const byZoneCode = idx[k] || {};
  const zones = [];

  for (const zCode of Object.keys(byZoneCode)) {
    const byNom = byZoneCode[zCode];
    if (byNom && byNom[String(nomCode)]) {
      const z = codeToZone[String(zCode)];
      if (z) zones.push(z);
    }
  }

  zones.sort((a, b) => {
    const A = a.charCodeAt(0), B = b.charCodeAt(0);
    const aUp = (A >= 65 && A <= 90), bUp = (B >= 65 && B <= 90);
    if (aUp !== bUp) return aUp ? -1 : 1;
    return a.localeCompare(b);
  });

  return zones;
}

function listIT(kind, zone, nomCode) {
  if (!zone) return [];
  const zCode = zoneToCode[String(zone)];
  if (zCode === undefined) return [];

  const k = (kind === "hole") ? "0" : "1";
  const set = idx[k]?.[String(zCode)]?.[String(nomCode)];
  if (!set) return [];

  // IT берем как ключи таблицы (это и есть IT-коды из базы)
  let its = Object.keys(set).map(s => String(s).trim()).filter(s => s !== "");

  // Фильтр: временно игнорируем 19/20, оставляем "01" и 0..18
  its = its.filter(s => {
    if (s === "01") return true;
    const n = Number(s);
    return Number.isFinite(n) && n >= 0 && n <= 18;
  });

  its.sort((a, b) => {
    const na = (a === "01") ? -1 : Number(a);
    const nb = (b === "01") ? -1 : Number(b);
    return na - nb;
  });

  return its;
}

function createWindow() {
  const win = new BrowserWindow({
    width: 980,
    height: 760,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  win.loadFile(path.join(__dirname, "index.html"));

  // По желанию для отладки:
  // win.webContents.openDevTools();
}

app.whenReady().then(() => {
  ipcMain.handle("fit:compute", (_evt, payload) => computeFit(payload));

  ipcMain.handle("fit:options", (_evt, payload) => {
    const D = payload?.D;
    const nomCode = nomCodeFromD(D);

    // зоны
    if (!payload?.mode || payload.mode === "zones") {
      return {
        nomCode,
        holeZones: listZones("hole", nomCode),
        shaftZones: listZones("shaft", nomCode)
      };
    }

    // IT по зоне
    if (payload.mode === "it") {
      const kind = payload.kind; // "hole" | "shaft"
      const zone = payload.zone; // "H" | "g" | ...
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
