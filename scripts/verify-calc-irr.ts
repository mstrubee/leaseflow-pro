// Verificación de calcIRR (ejecutar con: bun run scripts/verify-calc-irr.ts)
// 1) Flujos normales: el valor nuevo debe ser idéntico al de la implementación anterior.
// 2) Flujos no recuperables / sin solución razonable: debe devolver null.
import { calcIRR, calcNPV } from "../src/lib/businessCase/model";

// Copia literal de la implementación anterior (Newton sin validar), solo para comparar.
function legacyIRR(cfs: number[], guess = 0.3): number | null {
  const hasPos = cfs.some((f) => f > 0);
  const hasNeg = cfs.some((f) => f < 0);
  if (!hasPos || !hasNeg) return null;
  let r = guess;
  for (let iter = 0; iter < 300; iter++) {
    let npv = 0, d = 0;
    cfs.forEach((cf, t) => {
      const disc = Math.pow(1 + r, t);
      npv += cf / disc;
      d += (-t * cf) / (disc * (1 + r));
    });
    if (Math.abs(d) < 1e-12) break;
    const delta = npv / d;
    r -= delta;
    if (Math.abs(delta) < 1e-8) break;
  }
  return Number.isFinite(r) ? r : null;
}

let failures = 0;
const check = (ok: boolean, msg: string) => { if (!ok) failures++; console.log(`${ok ? "✅" : "❌"} ${msg}`); };

// ---- 1) Flujos normales: idénticos a antes ----
const normal: number[][] = [
  [-343, 160.61, 160.61, 160.61, 160.61, 160.61],
  [-1000, 300, 350, 400, 450, 500],
  [-500, 100, 150, 200, 250, 300],
  [-250, 80, 90, 100, 110, 120],
  [-100, 20, 30, 40, 50, 60],
  [-1200, 0, 0, 0, 0, 2400],
  [-800, 250, 250, 250, 250, 250, 250, 250, 250, 250, 250],
  [-343, 50, 50, 50, 50, 50],            // TIR negativa pero razonable
  [-10, 1, 1, 1, 1, 1, 12],
];
console.log("— Flujos normales (nuevo vs. anterior) —");
for (const cfs of normal) {
  const a = calcIRR(cfs), b = legacyIRR(cfs);
  check(a === b && a !== null && Math.abs(calcNPV(cfs, a)) < 1e-4,
    `[${cfs.slice(0, 3).join(", ")}…] nuevo=${a?.toFixed(6)} anterior=${b?.toFixed(6)}`);
}
// Barrido aleatorio determinista: todo flujo que antes convergía bien debe dar exactamente lo mismo.
let seed = 42; const rnd = () => (seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296;
let compared = 0, diff = 0;
for (let i = 0; i < 5000; i++) {
  const inv = -(100 + rnd() * 900);
  const cfs = [inv, ...Array.from({ length: 5 }, () => rnd() * 400)];
  const b = legacyIRR(cfs);
  if (b === null || !(b > -0.99 && b < 100)) continue;
  const resid = Math.abs(calcNPV(cfs, b));
  if (resid > 1e-4) continue; // el anterior no había convergido de verdad
  compared++;
  if (calcIRR(cfs) !== b) diff++;
}
check(diff === 0, `barrido aleatorio: ${compared} flujos que ya convergían, ${diff} difieren`);

// ---- 2) Casos sin TIR razonable → null ----
console.log("— Casos no recuperables —");
const bad: [string, number[]][] = [
  ["solo egresos", [-100, -50, -20]],
  ["solo ingresos", [100, 50, 20]],
  ["inversión sin retorno real (TIR < -99%)", [-1e6, 0, 0, 0, 0, 0.00001]],
  ["inversión sin retorno real, flujo ínfimo al final", [-343, 0, 0, 0, 0, 1e-9]],
];
for (const [name, cfs] of bad) {
  const a = calcIRR(cfs);
  console.log(`   ${name}: anterior=${legacyIRR(cfs)} nuevo=${a}`);
  check(a === null, `${name} → null`);
}
// Todo valor devuelto, en cualquier flujo, debe ser finito, estar en rango y ser raíz real del VAN
// (el VAN cambia de signo en ±1e-9 alrededor de la TIR; con TIR cercanas a -99% el VAN es muy empinado).
let outOfRange = 0, legacyAbsurd = 0, nowNull = 0;
for (let i = 0; i < 20000; i++) {
  const cfs = [-(50 + rnd() * 1000), ...Array.from({ length: 5 }, () => (rnd() - 0.6) * 60)];
  const old = legacyIRR(cfs);
  if (old !== null && !(old > -0.99 && old < 100)) legacyAbsurd++;
  const a = calcIRR(cfs);
  if (a === null) { nowNull++; continue; }
  if (!Number.isFinite(a) || a <= -0.99 || a >= 100 || calcNPV(cfs, a - 1e-9) * calcNPV(cfs, a + 1e-9) > 0) outOfRange++;
}
console.log(`   barrido de flujos pobres: anterior fuera de rango=${legacyAbsurd}, nuevo null=${nowNull}`);
check(outOfRange === 0, `ningún valor devuelto fuera de rango ni que deje de ser raíz real (${outOfRange})`);

if (failures) { console.log(`\n${failures} verificación(es) fallida(s)`); process.exit(1); }
console.log("\nTodo OK");
