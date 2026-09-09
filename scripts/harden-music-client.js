const fs = require("fs");
const path = require("path");

const clientPath = path.join(process.cwd(), "components/premium-music-studio.tsx");
const monitorPath = path.join(process.cwd(), "components/generation-monitor-v3.tsx");
if (!fs.existsSync(clientPath)) throw new Error("Required Music client component not found.");
if (!fs.existsSync(monitorPath)) throw new Error("Required Music generation monitor not found.");

let client = fs.readFileSync(clientPath, "utf8");
let monitor = fs.readFileSync(monitorPath, "utf8");

const clientPatches = [
  [
    '  const [credits, setCredits] = useState<number | null>(null);',
    '  const [credits, setCredits] = useState<number | null>(null);\n  const [creditCost, setCreditCost] = useState(100);',
  ],
  [
    '        setCredits(Number(data.credits));\n        setPlan(String(data.plan || "FREE"));',
    '        setCredits(Number(data.credits));\n        setCreditCost(Math.max(1, Number(data.creditCost || 100)));\n        setPlan(String(data.plan || "FREE"));',
  ],
  [
    '    if (credits !== null && credits < 100) { setNotice("Kredit tidak cukup. Pembuatan musik membutuhkan 100 kredit."); setActive("monetize"); return; }',
    '    if (credits !== null && credits < creditCost) { setNotice(`Kredit tidak cukup. Pembuatan musik membutuhkan ${creditCost} kredit.`); setActive("monetize"); return; }',
  ],
  [
    'try { jwt = await auth.getJWTToken?.(); } catch {}',
    'try { jwt = await auth.getJWTToken?.(false); } catch {}',
  ],
];

for (const [from, to] of clientPatches) {
  if (!client.includes(from)) {
    if (from.includes("getJWTToken?.()") && client.includes("getJWTToken?.(false)")) continue;
    throw new Error("Required Music client patch pattern not found. Refusing to build with stale UI.");
  }
  client = client.replace(from, to);
}

const monitorPatches = [
  ['const CONTROL_LIMIT_SECONDS = 15 * 60;', 'const CONTROL_LIMIT_SECONDS = 5 * 60;'],
  ['Batas kontrol 15 menit tercapai.', 'Batas kontrol 5 menit tercapai.'],
  ['<span>15:00</span>', '<span>05:00</span>'],
];

for (const [from, to] of monitorPatches) {
  if (!monitor.includes(from)) {
    if (from.includes('15 * 60') && monitor.includes('5 * 60')) continue;
    if (from.includes('15 menit') && monitor.includes('5 menit')) continue;
    if (from.includes('15:00') && monitor.includes('05:00')) continue;
    throw new Error("Required Music monitor patch pattern not found. Refusing to build with old 15-minute control limit.");
  }
  monitor = monitor.replace(from, to);
}

fs.writeFileSync(clientPath, client);
fs.writeFileSync(monitorPath, monitor);
console.log("SALVIAN Music UI hardening applied: parent JWT mode, dynamic credit cost, 5-minute generation control");
