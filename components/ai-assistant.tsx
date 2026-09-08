"use client";

import { FormEvent, useState } from "react";
import { MessageCircle, Send, Sparkles, X } from "lucide-react";
import { neon } from "@neondatabase/neon-js";
import { BetterAuthVanillaAdapter } from "@neondatabase/neon-js/auth/adapter";

type Message = { role: "user" | "assistant"; content: string };

const welcome: Message = {
  role: "assistant",
  content: "Halo! Saya Asisten AI SALVIAN AI MUSIC. Saya bisa membantu soal daftar/login akun, kredit, Library, cara membuat lagu, atau masalah di aplikasi.",
};

const neonClient = neon({
  auth: {
    url: process.env.NEXT_PUBLIC_NEON_AUTH_URL!,
    adapter: BetterAuthVanillaAdapter(),
  },
  dataApi: { url: process.env.NEXT_PUBLIC_NEON_DATA_API_URL! },
});

export default function AiAssistant() {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [messages, setMessages] = useState<Message[]>([welcome]);

  const ask = async (event?: FormEvent) => {
    event?.preventDefault();
    const message = input.trim();
    if (!message || busy) return;

    const history = messages.slice(-10);
    setInput("");
    setMessages(prev => [...prev, { role: "user", content: message }]);
    setBusy(true);

    try {
      const token = await neonClient.auth.getJWTToken();
      if (!token) throw new Error("Silakan masuk melalui Akun SALVIAN AI CREATOR terlebih dahulu.");

      const res = await fetch("/api/assistant", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ message, history }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Asisten AI sedang tidak tersedia.");
      setMessages(prev => [...prev, { role: "assistant", content: String(data.answer || "Maaf, saya belum dapat menjawab.") }]);
    } catch (error) {
      setMessages(prev => [...prev, { role: "assistant", content: error instanceof Error ? error.message : "Terjadi kesalahan saat menghubungkan ke Asisten AI." }]);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Buka Asisten AI SALVIAN AI MUSIC"
        className="fixed bottom-24 right-4 z-40 flex items-center gap-2 rounded-full border border-violet-400/30 bg-violet-600 px-4 py-3 text-sm font-extrabold text-white shadow-2xl shadow-violet-900/30 transition hover:scale-[1.02] sm:right-6"
      >
        <MessageCircle size={18} />
        Asisten AI
      </button>

      {open && (
        <div className="fixed inset-0 z-50 bg-black/70 p-3 backdrop-blur-sm sm:p-6">
          <div className="mx-auto flex h-full max-h-[760px] w-full max-w-2xl flex-col overflow-hidden rounded-3xl border border-white/10 bg-[#111116] shadow-2xl">
            <div className="flex items-center justify-between border-b border-white/8 px-4 py-4 sm:px-6">
              <div className="flex items-center gap-3">
                <div className="grid h-10 w-10 place-items-center rounded-2xl bg-violet-500/15 text-violet-200"><Sparkles size={20} /></div>
                <div><div className="font-extrabold">Asisten AI</div><div className="text-xs text-zinc-500">Bantuan SALVIAN AI MUSIC</div></div>
              </div>
              <button type="button" onClick={() => setOpen(false)} aria-label="Tutup Asisten AI" className="rounded-xl p-2 text-zinc-400 hover:bg-white/5"><X size={20} /></button>
            </div>

            <div className="flex-1 space-y-3 overflow-y-auto p-4 sm:p-6">
              {messages.map((item, index) => (
                <div key={index} className={item.role === "user" ? "flex justify-end" : "flex justify-start"}>
                  <div className={item.role === "user" ? "max-w-[88%] rounded-2xl rounded-br-md bg-violet-500/20 px-4 py-3 text-sm leading-6 text-violet-50" : "max-w-[92%] rounded-2xl rounded-bl-md border border-white/8 bg-black/20 px-4 py-3 text-sm leading-6 text-zinc-200"}>
                    {item.content}
                  </div>
                </div>
              ))}
              {busy && <div className="text-sm text-zinc-500">Asisten sedang mengetik…</div>}
            </div>

            <form onSubmit={ask} className="border-t border-white/8 p-3 sm:p-4">
              <div className="flex gap-2">
                <input value={input} onChange={event => setInput(event.target.value)} maxLength={2000} placeholder="Contoh: bagaimana cara daftar akun?" className="min-w-0 flex-1 rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-white outline-none placeholder:text-zinc-600" />
                <button type="submit" disabled={busy || !input.trim()} aria-label="Kirim pertanyaan" className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-white text-black disabled:opacity-40"><Send size={18} /></button>
              </div>
              <p className="mt-2 px-1 text-[11px] text-zinc-600">Jangan kirim password, API key, token, atau data rahasia.</p>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
