const fs = require("fs");
const path = require("path");

const file = path.join(process.cwd(), "components", "premium-music-studio.tsx");
const source = fs.readFileSync(file, "utf8");

const oldBlock = `  const ask = async (event?: FormEvent) => {
    event?.preventDefault(); const message = chatInput.trim(); if (!message || chatBusy) return;
    if (!token) { setNotice("Akun belum tersinkron. Silakan tunggu sebentar atau buka Akun."); void syncSession(); return; }
    const history = messages.slice(-10); setChatInput(""); setMessages(prev => [...prev, { role: "user", content: message }]); setChatBusy(true);
    try {
      const res = await fetch("/api/assistant", { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` }, body: JSON.stringify({ message, history }) });
      const data = await res.json().catch(() => ({})); if (!res.ok) throw new Error(data.error || "Asisten AI sedang tidak tersedia.");
      setMessages(prev => [...prev, { role: "assistant", content: String(data.answer || "Maaf, saya belum dapat menjawab.") }]);
    } catch (e) { setMessages(prev => [...prev, { role: "assistant", content: e instanceof Error ? e.message : "Terjadi kesalahan." }]); } finally { setChatBusy(false); }
  };`;

const newBlock = `  const ask = async (event?: FormEvent) => {
    event?.preventDefault();
    const message = chatInput.trim();
    if (!message || chatBusy) return;

    const history = messages.slice(-10);
    setChatInput("");
    setMessages(prev => [...prev, { role: "user", content: message }]);
    setChatBusy(true);

    try {
      let jwt = token;
      if (!jwt) {
        await syncSession();
        try {
          const auth = neon.auth as unknown as { getJWTToken?: (allowAnonymous?: boolean) => Promise<string | null> };
          jwt = await auth.getJWTToken?.(false) || null;
        } catch {}
      }
      if (!jwt) throw new Error("Akun SALVIAN AI belum siap. Silakan buka Akun lalu kembali ke SALVIAN AI MUSIC.");

      const res = await fetch("/api/assistant", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${jwt}` },
        body: JSON.stringify({ message, history }),
        cache: "no-store",
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `Asisten AI gagal (${res.status}).`);
      setMessages(prev => [...prev, { role: "assistant", content: String(data.answer || "Maaf, saya belum dapat menjawab.") }]);
    } catch (e) {
      setMessages(prev => [...prev, { role: "assistant", content: e instanceof Error ? e.message : "Terjadi kesalahan saat menghubungkan ke Asisten AI." }]);
    } finally {
      setChatBusy(false);
    }
  };`;

if (!source.includes(oldBlock)) {
  if (source.includes("const ask = async (event?: FormEvent)")) {
    throw new Error("Music assistant ask() exists but does not match the expected safe patch; refusing to rewrite blindly.");
  }
  throw new Error("Music assistant ask() block not found.");
}

fs.writeFileSync(file, source.replace(oldBlock, newBlock), "utf8");
console.log("Hardened Music assistant input/session handling.");
