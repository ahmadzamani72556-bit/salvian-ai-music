const fs = require("fs");
const path = require("path");

const file = path.join(process.cwd(), "components/premium-music-studio.tsx");
if (!fs.existsSync(file)) throw new Error("Required Music client component not found.");
let source = fs.readFileSync(file, "utf8");

const old = `  const ask = async (event?: FormEvent) => {
    event?.preventDefault(); const message = chatInput.trim(); if (!message || chatBusy) return;
    if (!token) { setNotice("Akun belum tersinkron. Silakan tunggu sebentar atau buka Akun."); void syncSession(); return; }
    const history = messages.slice(-10); setChatInput(""); setMessages(prev => [...prev, { role: "user", content: message }]); setChatBusy(true);
    try {
      const res = await fetch("/api/assistant", { method: "POST", headers: { "Content-Type": "application/json", Authorization: \`Bearer \${token}\` }, body: JSON.stringify({ message, history }) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Asisten AI sedang tidak tersedia.");
      setMessages(prev => [...prev, { role: "assistant", content: String(data.answer || "Maaf, saya belum dapat menjawab.") }]);
    } catch (e) { setMessages(prev => [...prev, { role: "assistant", content: e instanceof Error ? e.message : "Terjadi kesalahan." }]); } finally { setChatBusy(false); }
  };`;

const replacement = `  const ask = async (event?: FormEvent) => {
    event?.preventDefault();
    const message = chatInput.trim();
    if (!message || chatBusy) return;
    setChatInput("");
    setMessages(prev => [...prev, { role: "user", content: message }]);
    setChatBusy(true);
    try {
      let jwt = token;
      if (!jwt) {
        await syncSession();
        const auth = neon.auth as unknown as { getJWTToken?: (allowAnonymous?: boolean) => Promise<string | null> };
        try { jwt = (await auth.getJWTToken?.(false)) ?? null; } catch {}
      }
      if (!jwt) throw new Error("Akun belum tersinkron. Buka Akun SALVIAN AI CREATOR, lalu kembali ke SALVIAN AI MUSIC.");
      const history = messages.slice(-10);
      const res = await fetch("/api/assistant", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: \`Bearer \${jwt}\` },
        body: JSON.stringify({ message, history }),
        cache: "no-store",
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Asisten AI sedang tidak tersedia.");
      setMessages(prev => [...prev, { role: "assistant", content: String(data.answer || "Maaf, saya belum dapat menjawab.") }]);
    } catch (e) {
      setMessages(prev => [...prev, { role: "assistant", content: e instanceof Error ? e.message : "Terjadi kesalahan saat menghubungkan ke Asisten AI." }]);
    } finally {
      setChatBusy(false);
    }
  };`;

if (source.includes(replacement)) {
  console.log("SALVIAN Music assistant already hardened");
} else {
  if (!source.includes(old)) throw new Error("Required Music assistant handler pattern not found. Refusing to build with stale assistant logic.");
  source = source.replace(old, replacement);
  fs.writeFileSync(file, source);
  console.log("SALVIAN Music assistant hardened: accepts feedback after automatic parent-account JWT recovery");
}
