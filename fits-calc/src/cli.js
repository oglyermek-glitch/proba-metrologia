"use strict";

const fs = require("fs");
const path = require("path");
const { computeFit } = require("./fitcalc");

function parseArgs(argv) {
  const args = {};
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--D") args.D = argv[++i];
    else if (a === "--hole") args.hole = argv[++i];
    else if (a === "--shaft") args.shaft = argv[++i];
    else if (a === "--json") args.json = true;
    else if (a === "--batch") args.batch = argv[++i];
    else if (a === "--out") args.out = argv[++i];
    else if (a === "--out-json") args.outJson = argv[++i];
    else if (a === "--help" || a === "-h") args.help = true;
  }
  return args;
}

function printHuman(res) {
  const dev = res.deviations_мм;
  const lim = res.limits_мм;
  const mean = res.means_мм;
  const tol = res.tolerances_мм;
  const ftol = res.fit_tolerance_мм;
  const clr = res.clearance_мм;
  const inf = res.interference_мм;

  console.log(`D = ${res.input.D} мм`);
  console.log(`Отверстие: ${res.input.hole} | Вал: ${res.input.shaft}`);
  console.log(`nomCode = ${res.nomCode}`);
  console.log("");

  console.log("Отклонения (мм):");
  console.log(`  ES = ${dev.ES}  EI = ${dev.EI}`);
  console.log(`  es = ${dev.es}  ei = ${dev.ei}`);
  console.log(`  Em = ${mean.Em}  em = ${mean.em}`);
  console.log("");

  console.log("Предельные размеры (мм):");
  console.log(`  Dmax = ${lim.Dmax}  Dmin = ${lim.Dmin}`);
  console.log(`  dmax = ${lim.dmax}  dmin = ${lim.dmin}`);
  console.log("");

  console.log("Средние размеры (мм):");
  console.log(`  Dm = ${mean.Dm}  dm = ${mean.dm}`);
  console.log(`  Sm = ${mean.Sm}  Nm = ${mean.Nm}`);
  console.log("");

  console.log("Допуски (мм):");
  console.log(`  TD = ${tol.TD}  Td = ${tol.Td}`);
  console.log(`  Ts = ${ftol.Ts}  TN = ${ftol.TN}`);
  console.log("");

  console.log("Зазоры (мм):");
  console.log(`  Smax = ${clr.Smax}  Smin = ${clr.Smin}`);
  console.log("");

  console.log("Натяги (мм):");
  console.log(`  Nmax = ${inf.Nmax}  Nmin = ${inf.Nmin}`);
  console.log("");

  console.log("Классификация:");
  console.log(`  Посадка:  ${res.classification.fitType}`);
  console.log(`  Система:  ${res.classification.system}`);
}

function usage() {
  console.log("Single расчет:");
  console.log("  npm run calc -- --D 25 --hole H7 --shaft g6");
  console.log("  npm run calc -- --D 25 --hole H7 --shaft g6 --json");
  console.log("");
  console.log("Пакетный режим CSV:");
  console.log("  npm run calc -- --batch .\\in.csv --out .\\out.csv --out-json .\\out.json");
  console.log("CSV формат строк: D;hole;shaft  (разделитель ; или ,). Заголовок допускается.");
}

function parseCsvLine(line) {
  const t = line.trim();
  if (!t || t.startsWith("#")) return null;

  const parts = t.includes(";") ? t.split(";") : t.split(",");
  if (parts.length < 3) return null;

  const D = parts[0].trim();
  const hole = parts[1].trim();
  const shaft = parts[2].trim();

  if (D.toLowerCase() === "d" && hole.toLowerCase().includes("hole")) return null;

  return { D, hole, shaft };
}

function toCsvRow(res) {
  const dev = res.deviations_мм;
  const lim = res.limits_мм;
  const mean = res.means_мм;
  const tol = res.tolerances_мм;
  const ftol = res.fit_tolerance_мм;
  const clr = res.clearance_мм;
  const inf = res.interference_мм;
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

function batchMode(batchPath, outPath, outJsonPath) {
  const absIn = path.resolve(batchPath);
  const text = fs.readFileSync(absIn, "utf8");
  const lines = text.split(/\r?\n/);

  const header = [
    "D","hole","shaft",
    "ES","EI","es","ei",
    "Dmax","Dmin","dmax","dmin",
    "Em","em","Dm","dm",
    "Smax","Smin","Sm",
    "Nmax","Nmin","Nm",
    "TD","Td","Ts","TN",
    "fitType","system"
  ].join(";");

  const results = [];
  const outLines = [header];

  for (const ln of lines) {
    const rec = parseCsvLine(ln);
    if (!rec) continue;

    const res = computeFit(rec);
    results.push(res);
    outLines.push(toCsvRow(res));
  }

  const absOut = path.resolve(outPath || ".\\out.csv");
  fs.writeFileSync(absOut, outLines.join("\r\n"), "utf8");

  if (outJsonPath) {
    const absJ = path.resolve(outJsonPath);
    fs.writeFileSync(absJ, JSON.stringify(results, null, 2), "utf8");
  }

  console.log(`OK: ${results.length} rows -> ${absOut}` + (outJsonPath ? ` and ${path.resolve(outJsonPath)}` : ""));
}

function main() {
  const args = parseArgs(process.argv);

  if (args.help) { usage(); process.exit(0); }

  if (args.batch) {
    batchMode(args.batch, args.out, args.outJson);
    return;
  }

  if (!args.D || !args.hole || !args.shaft) {
    usage();
    process.exit(2);
  }

  try {
    const res = computeFit({ D: args.D, hole: args.hole, shaft: args.shaft });
    if (args.json) console.log(JSON.stringify(res, null, 2));
    else printHuman(res);
  } catch (e) {
    console.error("ERROR:", e.message);
    process.exit(1);
  }
}

main();
