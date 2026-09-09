const fs = require("fs");
const path = require("path");

// SALVIAN AI MUSIC uses the real SALVIAN AI CREATOR parent account.
// This build-time patch only touches Music-side client files; Creator and Video
// are separate applications and are never modified here.
const targets = [
  path.join(process.cwd(), "components", "premium-music-studio.tsx"),
  path.join(process.cwd(), "components", "generation-monitor-v3.tsx"),
];

for (const file of targets) {
  if (!fs.existsSync(file)) continue;
  let source = fs.readFileSync(file, "utf8");

  source = source.replace(/getJWTToken\?\.\(\)/g, "getJWTToken?.(false)");
  source = source.replace(/getJWTToken\(\)/g, "getJWTToken(false)");
  source = source.replace(/jwt = await auth\.getJWTToken\?\.\(false\);/g, "jwt = (await auth.getJWTToken?.(false)) ?? null;");

  if (file.endsWith("premium-music-studio.tsx")) {
    const askPattern = /  const ask = async \(event\?: FormEvent\) => \{[\s\S]*?\n  \};/;
    const match = source.match(askPattern);
    if (!match) throw new Error("Music assistant ask() block not found; refusing unsafe build rewrite.");
    const newBlock = [
      "  const ask = async (event?: FormEvent) => {",
      "    event?.preventDefault();",
      "    const message = chatInput.trim();",
      "    if (!message || chatBusy) return;",
      "    const history = messages.slice(-10);",
      "    setChatInput(\"\");",
      "    setMessages(prev => [...prev, { role: \"user\", content: message }]);",
      "    setChatBusy(true);",
      "    try {",
      "      let jwt = token;",
      "      if (!jwt) {",
      "        await syncSession();",
      "        try {",
      "          const auth = neon.auth as unknown as { getJWTToken?: (allowAnonymous?: boolean) => Promise<string | null> };",
      "          jwt = (await auth.getJWTToken?.(false)) || null;",
      "        } catch {}",
      "      }",
      "      if (!jwt) throw new Error(\"Akun SALVIAN AI belum siap. Silakan buka Akun lalu kembali ke SALVIAN AI MUSIC.\");",
      "      const res = await fetch(\"/api/assistant\", {",
      "        method: \"POST\",",
      "        headers: { \"Content-Type\": \"application/json\", Authorization: \"Bearer \" + jwt },",
      "        body: JSON.stringify({ message, history }),",
      "        cache: \"no-store\",",
      "      });",
      "      const data = await res.json().catch(() => ({}));",
      "      if (!res.ok) throw new Error(data.error || (\"Asisten AI gagal (\" + res.status + \").\"));",
      "      setMessages(prev => [...prev, { role: \"assistant\", content: String(data.answer || \"Maaf, saya belum dapat menjawab.\") }]);",
      "    } catch (e) {",
      "      setMessages(prev => [...prev, { role: \"assistant\", content: e instanceof Error ? e.message : \"Terjadi kesalahan saat menghubungkan ke Asisten AI.\" }]);",
      "    } finally {",
      "      setChatBusy(false);",
      "    }",
      "  };"
    ].join("\n");
    source = source.replace(askPattern, newBlock);
  }

  fs.writeFileSync(file, source);
}

console.log("SALVIAN AI MUSIC parent-account JWT and assistant patch applied");
