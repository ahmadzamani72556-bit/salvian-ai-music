const fs = require("fs");
const path = require("path");

const filePath = path.join(process.cwd(), "components/premium-music-studio.tsx");
if (!fs.existsSync(filePath)) throw new Error("Required Music client component not found.");
let source = fs.readFileSync(filePath, "utf8");

const patches = [
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
];

for (const [from, to] of patches) {
  if (!source.includes(from)) throw new Error("Required Music client patch pattern not found. Refusing to build with stale credit-cost UI.");
  source = source.replace(from, to);
}

fs.writeFileSync(filePath, source);
console.log("SALVIAN Music client credit cost sync verified and applied");
