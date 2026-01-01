#!/usr/bin/env node
/*
  optimize_qualitets.js
  Нормализует справочник квалитетов/полей допусков из qualitets.js:
  - исправляет частные ошибки (например, вал 'M' -> 'm')
  - удаляет строки без данных (['','']) (опционально)
  - устраняет дубли, выбирая физически согласованную запись
  - строит индекс для O(1) доступа

  Usage:
    node optimize_qualitets.js ./qualitets.js \
      --out ./qualitets.optimized.js \
      --index ./qualitets.index.json \
      --drop-empty true

  Примечание:
    Исходный qualitets.js содержит "var ..." и набор глобальных переменных.
    Скрипт безопасно исполняет его в VM-песочнице и забирает данные.
*/

const fs = require('fs');
const path = require('path');
const vm = require('vm');

function parseArgs(argv) {
  const args = { _: [] };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith('--')) { args._.push(a); continue; }
    const key = a.slice(2);
    const val = (i + 1 < argv.length && !argv[i + 1].startsWith('--')) ? argv[++i] : 'true';
    args[key] = val;
  }
  return args;
}

function toBool(v, def = false) {
  if (v === undefined) return def;
  if (typeof v === 'boolean') return v;
  const s = String(v).trim().toLowerCase();
  return ['1','true','yes','y','on'].includes(s);
}

function numOrNull(x) {
  if (x === '' || x === null || x === undefined) return null;
  const n = Number(x);
  return Number.isFinite(n) ? n : null;
}

function expectedPattern(kind, zone) {
  // Возвращает ожидаемую знаковую структуру (ES/EI или es/ei) для выбора из дублей.
  // Формат: { upper: 'pos'|'neg'|'zero'|'pos0'|'neg0'|'any', lower: ... }
  const holeNeg = new Set(['A','B','C','D','E','F','G']);
  const holePos = new Set(['K','M','N','P','R','S','T','U']);
  const shaftNeg = new Set(['a','b','c','d','e','f','g']);
  const shaftPos = new Set(['k','m','n','p','r','s','t','u','x','y','z']);

  if (kind === 0) {
    if (holeNeg.has(zone)) return { upper: 'neg0', lower: 'neg0' };
    if (zone === 'H') return { upper: 'pos0', lower: 'zero' };
    if (zone === 'JS') return { upper: 'pos0', lower: 'neg0' };
    if (holePos.has(zone)) return { upper: 'pos0', lower: 'pos0' };
    return { upper: 'any', lower: 'any' };
  }

  if (shaftNeg.has(zone)) return { upper: 'neg0', lower: 'neg0' };
  if (zone === 'h') return { upper: 'zero', lower: 'neg0' };
  if (zone === 'js') return { upper: 'pos0', lower: 'neg0' };
  if (shaftPos.has(zone)) return { upper: 'pos0', lower: 'pos0' };
  return { upper: 'any', lower: 'any' };
}

function matchSign(v, exp) {
  if (v === null) return false;
  switch (exp) {
    case 'any': return true;
    case 'zero': return v === 0;
    case 'pos0': return v >= 0;
    case 'neg0': return v <= 0;
    case 'pos': return v > 0;
    case 'neg': return v < 0;
    default: return false;
  }
}

function scoreRow(kind, zone, upper, lower) {
  if (upper === null || lower === null) return -1e9;
  const exp = expectedPattern(kind, zone);
  let s = 0;
  if (matchSign(upper, exp.upper)) s += 2;
  if (matchSign(lower, exp.lower)) s += 2;
  if (upper >= lower) s += 1; else s -= 2;
  // лёгкий бонус за нули там, где они типичны
  if ((zone === 'H' && lower === 0) || (zone === 'h' && upper === 0)) s += 1;
  return s;
}

function main() {
  const args = parseArgs(process.argv);
  const input = args._[0] || args.input || './qualitets.js';
  const out = args.out || './qualitets.optimized.js';
  const indexOut = args.index || './qualitets.index.json';
  const dropEmpty = toBool(args['drop-empty'], true);
  const noModule = toBool(args['no-module'], false);

  const code = fs.readFileSync(input, 'utf8');
  const sandbox = {};
  vm.createContext(sandbox);
  vm.runInContext(code, sandbox, { filename: path.basename(input) });

  const nom_zones = sandbox.nom_zones;
  const qualitets = sandbox.qualitets;
  const tol_zones = sandbox.tol_zones;
  const variations = sandbox.variations;

  if (!nom_zones || !qualitets || !tol_zones || !variations) {
    throw new Error('Не удалось извлечь nom_zones/qualitets/tol_zones/variations из входного файла.');
  }

  // Обратное отображение: зона -> ключ
  const keyByZone = {};
  for (const [k, v] of Object.entries(tol_zones)) keyByZone[v] = Number(k);

  const keyM = keyByZone['M'];
  const keym = keyByZone['m'];

  let fixedM = 0;
  let droppedEmptyCount = 0;
  let droppedInvalidCount = 0;
  let duplicatesResolved = 0;

  const best = new Map(); // key -> {row, score}

  for (const row of variations) {
    if (!Array.isArray(row) || row.length < 5) { droppedInvalidCount++; continue; }

    let [kind, nomCode, IT, tolKey, dev] = row;
    kind = Number(kind);
    nomCode = Number(nomCode);
    IT = Number(IT);
    tolKey = Number(tolKey);

    // исправление аномалии: вал с полем допуска 'M' -> 'm'
    if (kind === 1 && tolKey === keyM && Number.isFinite(keym)) {
      tolKey = keym;
      fixedM++;
    }

    const zone = tol_zones[tolKey];

    const upper = numOrNull(dev?.[0]);
    const lower = numOrNull(dev?.[1]);

    const isEmpty = (upper === null || lower === null);
    if (isEmpty && dropEmpty) { droppedEmptyCount++; continue; }

    const score = scoreRow(kind, zone, upper, lower);
    const k = `${kind}|${nomCode}|${IT}|${tolKey}`;

    const candidate = [kind, nomCode, IT, tolKey, [upper, lower]];

    if (!best.has(k)) {
      best.set(k, { row: candidate, score });
    } else {
      const cur = best.get(k);
      // выбрать более согласованную запись
      if (score > cur.score) {
        best.set(k, { row: candidate, score });
        duplicatesResolved++;
      } else {
        duplicatesResolved++;
      }
    }
  }

  const outVariations = [...best.values()].map(x => x.row)
    .sort((a,b) => (a[0]-b[0]) || (a[1]-b[1]) || (a[2]-b[2]) || (a[3]-b[3]));

  // Индекс: kind -> nomCode -> IT -> tolKey -> [upper, lower]
  const index = {};
  for (const [kind, nomCode, IT, tolKey, dev] of outVariations) {
    index[kind] ??= {};
    index[kind][nomCode] ??= {};
    index[kind][nomCode][IT] ??= {};
    index[kind][nomCode][IT][tolKey] = dev;
  }

  const stamp = new Date().toISOString();

  const header = `// Auto-generated by optimize_qualitets.js\n// source: ${path.basename(input)}\n// generated: ${stamp}\n\n`;

  const js = header
    + `const nom_zones = ${JSON.stringify(nom_zones, null, 2)};\n\n`
    + `const qualitets = ${JSON.stringify(qualitets, null, 2)};\n\n`
    + `const tol_zones = ${JSON.stringify(tol_zones, null, 2)};\n\n`
    + `const variations = ${JSON.stringify(outVariations, null, 2)};\n\n`
    + (noModule ? '' : `module.exports = { nom_zones, qualitets, tol_zones, variations };\n`);

  fs.writeFileSync(out, js, 'utf8');
  fs.writeFileSync(indexOut, JSON.stringify(index), 'utf8');

  const report = {
    input: path.resolve(input),
    out: path.resolve(out),
    index: path.resolve(indexOut),
    inputRows: variations.length,
    outputRows: outVariations.length,
    fixedM,
    droppedEmpty: droppedEmptyCount,
    droppedInvalid: droppedInvalidCount,
    duplicatesResolved
  };

  console.log(JSON.stringify(report, null, 2));
}

if (require.main === module) {
  main();
}
