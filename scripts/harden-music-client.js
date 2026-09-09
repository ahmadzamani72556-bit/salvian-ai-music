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
    '  const syncGeneration = useRef(0);',
    '  const syncGeneration = useRef(0);\n  const authIdentity = useRef("");',
  ],
  [
    '          setToken(null); setCredits(null); setUserName("");',
    '          authIdentity.current = ""; setToken(null); setCredits(null); setUserName("");',
  ],
  [
    '      setUserName((user as { name?: string }).name || user.email || "Creator");',
    '      authIdentity.current = String((user as { id?: string }).id || user.email || "");\n      setUserName((user as { name?: string }).name || user.email || "Creator");',
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
  [
    '    const onVisibility = () => { if (document.visibilityState === "visible") void syncSession(); };',
    '    const onVisibility = () => { if (document.visibilityState === "visible") void syncSession(); };\n    const authWatch = window.setInterval(async () => { try { const session = await neon.auth.getSession(); const id = String((session?.data?.user as { id?: string } | undefined)?.id || session?.data?.user?.email || ""); if (id !== authIdentity.current) void syncSession(); } catch {} }, 3000);',
  ],
  [
    '      document.removeEventListener("visibilitychange", onVisibility);\n    };',
    '      document.removeEventListener("visibilitychange", onVisibility);\n      window.clearInterval(authWatch);\n    };',
  ],
];

for (const [from, to] of clientPatches) {
  if (!client.includes(from)) {
    if (from.includes("getJWTToken?.()") && client.includes("getJWTToken?.(false)")) continue;
    throw new Error("Required Music client patch pattern not found. Refusing to build with stale account/UI logic.");
  }
  client = client.replace(from, to);
}

const monitorPatches = [
  ['const CONTROL_LIMIT_SECONDS = 15 * 60;', 'const CONTROL_LIMIT_SECONDS = 5 * 60;'],
  ['const [elapsed, setElapsed] = useState(0);', 'const [elapsed, setElapsed] = useState(0);\n  const [controlReached, setControlReached] = useState(false);'],
  ['const begin = () => { current = { id: "pending", startedAt: Date.now() }; setTaskId("pending"); setStatus("preparing"); setDone(false); setIsFailed(false); setElapsed(0); };', 'const begin = () => { current = { id: "pending", startedAt: Date.now() }; setTaskId("pending"); setStatus("preparing"); setDone(false); setIsFailed(false); setElapsed(0); setControlReached(false); };'],
  ['const attach = (id: string, createdAt = 0) => { if (!id || stopped) return; const startedAt = createdAt > 0 ? createdAt : current?.startedAt || Date.now(); current = { id, startedAt }; setCookie("salvian_generation_task", id); setTaskId(id); setStatus("preparing"); setDone(false); setIsFailed(false); setElapsed(Math.max(0, (Date.now() - startedAt) / 1000)); };', 'const attach = (id: string, createdAt = 0) => { if (!id || stopped) return; const startedAt = createdAt > 0 ? createdAt : current?.startedAt || Date.now(); current = { id, startedAt }; setCookie("salvian_generation_task", id); setTaskId(id); setStatus("preparing"); setDone(false); setIsFailed(false); setControlReached(false); setElapsed(Math.max(0, (Date.now() - startedAt) / 1000)); };'],
  ['if (seconds >= CONTROL_LIMIT_SECONDS && current.id !== "pending") finishAndClear(true, "timeout");', 'if (seconds >= CONTROL_LIMIT_SECONDS && current.id !== "pending") setControlReached(true);'],
  ['{isFailed ? (status === "timeout" ? "Batas kontrol 15 menit tercapai." : "Mesin musik melaporkan proses gagal.") : done ? "Musik selesai dan project diperbarui di Library." : "Proses dipantau otomatis setiap 5 detik."}', '{isFailed ? (status === "timeout" ? "Batas kontrol 5 menit tercapai." : "Mesin musik melaporkan proses gagal.") : done ? "Musik selesai dan project diperbarui di Library." : controlReached ? "Batas kontrol 5 menit tercapai. Mesin Mureka masih memproses; pemantauan tetap berjalan." : "Proses dipantau otomatis setiap 5 detik."}'],
  ['<span>15:00</span>', '<span>05:00</span>'],
];

for (const [from, to] of monitorPatches) {
  if (!monitor.includes(from)) {
    if (from.includes('15 * 60') && monitor.includes('5 * 60')) continue;
    if (from.includes('controlReached') && monitor.includes('controlReached')) continue;
    if (from.includes('Batas kontrol 15 menit') && monitor.includes('Batas kontrol 5 menit')) continue;
    if (from.includes('seconds >= CONTROL_LIMIT_SECONDS') && monitor.includes('setControlReached(true)')) continue;
    if (from.includes('15:00') && monitor.includes('05:00')) continue;
    throw new Error("Required Music monitor patch pattern not found. Refusing to build with stale five-minute control logic.");
  }
  monitor = monitor.replace(from, to);
}

fs.writeFileSync(clientPath, client);
fs.writeFileSync(monitorPath, monitor);
console.log("SALVIAN Music UI hardening applied: automatic parent-account sync, dynamic credit cost, five-minute control warning with continued provider polling");
