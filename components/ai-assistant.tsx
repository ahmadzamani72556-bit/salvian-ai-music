"use client";

import { FormEvent, useEffect, useState } from "react";
import { Check, Copy, MessageCircle, Save, Send, Sparkles, Trash2, X } from "lucide-react";

type Message = { role: "user" | "assistant"; content: string; id: string };

const welcome: Message = {
  id: "welcome",
  role: "assistant",
  content: "Halo! Saya Asisten AI SALVIAN AI MUSIC. Saya bisa membantu ide musik, lirik, genre, vokal, prompt, dan penggunaan Studio. Ketik bebas apa pun yang ingin kamu buat atau tanyakan.",
};

const SAVED_KEY = "salvian-ai-music-assistant-saved";

export default function AiAssistant() {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [savedIds, setSavedIds] = useState<string[]>([]);
  const [messages, setMessages] = useState<Message[]>([welcome]);

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(SAVED_KEY);
      if (stored) setSavedIds(JSON.parse(stored));
    } catch {}
  }, []);

  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = previousOverflow; };
  }, [open]);

  const ask = async (event?: FormEvent) => {
    event?.preventDefault();
    const message = input.trim();
    if (!message || busy) return;
    const history = messages.slice(-10).map(({ role, content }) => ({ role, content }));
    const userMessage: Message = { id: crypto.randomUUID(), role: "user", content: message };
    setInput("");
    setMessages(prev => [...prev, userMessage]);
    setBusy(true);
    try {
      const res = await fetch("/api/assistant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message, history }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Asisten AI sedang tidak tersedia.");
      setMessages(prev => [...prev, { id: crypto.randomUUID(), role: "assistant", content: String(data.answer || "Maaf, saya belum dapat menjawab.") }]);
    } catch (error) {
      setMessages(prev => [...prev, { id: crypto.randomUUID(), role: "assistant", content: error instanceof Error ? error.message : "Terjadi kesalahan saat menghubungkan ke Asisten AI." }]);
    } finally { setBusy(false); }
  };

  const copyReply = async (content: string, id: string) => {
    try {
      await navigator.clipboard.writeText(content);
    } catch {
      const textarea = document.createElement("textarea");
      textarea.value = content;
      textarea.style.position = "fixed";
      textarea.style.opacity = "0";
      document.body.appendChild(textarea);
      textarea.focus();
      textarea.select();
      document.execCommand("copy");
      textarea.remove();
    }
    setCopiedId(id);
    window.setTimeout(() => setCopiedId(current => current === id ? null : current), 1600);
  };

  const toggleSave = (message: Message) => {
    setSavedIds(previous => {
      const next = previous.includes(message.id)
        ? previous.filter(id => id !== message.id)
        : [...previous, message.id];
      try { window.localStorage.setItem(SAVED_KEY, JSON.stringify(next)); } catch {}
      return next;
    });
  };

  const deleteMessage = (id: string) => {
    setMessages(previous => previous.filter(message => message.id !== id));
    setSavedIds(previous => {
      const next = previous.filter(savedId => savedId !== id);
      try { window.localStorage.setItem(SAVED_KEY, JSON.stringify(next)); } catch {}
      return next;
    });
  };

  const closeAssistant = () => {
    if (busy) return;
    setOpen(false);
  };

  return <>
    <button type="button" onClick={() => setOpen(true)} aria-label="Buka Asisten AI SALVIAN AI MUSIC" className="fixed bottom-24 right-4 z-40 flex items-center gap-2 rounded-full border border-violet-400/30 bg-violet-600 px-4 py-3 text-sm font-extrabold text-white shadow-2xl shadow-violet-900/30 transition hover:scale-[1.02] sm:right-6">
      <MessageCircle size={18}/> Asisten AI
    </button>

    {open && <div className="fixed inset-0 z-[100] h-[100dvh] w-screen overflow-hidden bg-[#08080d] text-white">
      <div className="flex h-full min-h-0 w-full flex-col">
        <header className="flex shrink-0 items-center justify-between border-b border-white/10 bg-[#0c0c13] px-4 py-3 sm:px-6 sm:py-4">
          <div className="flex min-w-0 items-center gap-3">
            <div className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-violet-500/15 text-violet-200"><Sparkles size={20}/></div>
            <div className="min-w-0"><div className="font-extrabold">Asisten AI</div><div className="truncate text-xs text-zinc-500">SALVIAN AI MUSIC · Ruang kerja penuh</div></div>
          </div>
          <button type="button" onClick={closeAssistant} aria-label="Kembali ke Studio Musik" className="inline-flex shrink-0 items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm font-semibold text-zinc-200 hover:bg-white/10">
            <X size={18}/> Kembali
          </button>
        </header>

        <main className="flex min-h-0 flex-1 flex-col overflow-hidden lg:flex-row">
          <section className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8">
            <div className="mx-auto w-full max-w-5xl space-y-4 pb-8">
              {messages.map((item) => <div key={item.id} className={item.role === "user" ? "flex justify-end" : "flex justify-start"}>
                <div className={item.role === "user" ? "w-full max-w-4xl rounded-3xl bg-violet-500/15 px-5 py-4 text-sm leading-7 text-violet-50" : "w-full max-w-4xl rounded-3xl border border-white/10 bg-[#111119] px-5 py-4 text-sm leading-7 text-zinc-200 shadow-xl shadow-black/10"}>
                  <div className="whitespace-pre-wrap break-words">{item.content}</div>
                  {item.role === "assistant" && <div className="mt-4 flex flex-wrap gap-2 border-t border-white/8 pt-3">
                    <button type="button" onClick={() => copyReply(item.content, item.id)} className="inline-flex items-center gap-1.5 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs font-semibold text-zinc-300 hover:bg-white/10">
                      {copiedId === item.id ? <Check size={14}/> : <Copy size={14}/>} {copiedId === item.id ? "Tersalin" : "Salin"}
                    </button>
                    <button type="button" onClick={() => toggleSave(item)} className="inline-flex items-center gap-1.5 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs font-semibold text-zinc-300 hover:bg-white/10">
                      <Save size={14}/> {savedIds.includes(item.id) ? "Tersimpan" : "Simpan"}
                    </button>
                    <button type="button" onClick={() => deleteMessage(item.id)} className="inline-flex items-center gap-1.5 rounded-xl border border-red-400/15 bg-red-500/5 px-3 py-2 text-xs font-semibold text-red-300 hover:bg-red-500/10">
                      <Trash2 size={14}/> Hapus
                    </button>
                  </div>}
                </div>
              </div>)}
              {busy && <div className="rounded-2xl border border-white/8 bg-white/[0.03] px-4 py-3 text-sm text-zinc-500">Asisten sedang menulis…</div>}
            </div>
          </section>

          <aside className="flex shrink-0 border-t border-white/10 bg-[#0c0c13] p-3 sm:p-4 lg:w-[420px] lg:border-l lg:border-t-0 lg:p-6">
            <form onSubmit={ask} className="flex w-full flex-col gap-3">
              <div className="flex items-center justify-between"><div className="text-sm font-bold text-zinc-200">Tulis bebas</div><div className="text-[11px] text-zinc-600">{input.length}/2000</div></div>
              <textarea value={input} onChange={event => setInput(event.target.value)} maxLength={2000} rows={5} autoFocus placeholder="Ketik lirik lagu, ide musik, genre, prompt, atau apa saja…" className="min-h-[120px] w-full resize-y rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-sm leading-6 text-white outline-none placeholder:text-zinc-600 focus:border-violet-400/40 lg:min-h-[220px]"/>
              <button type="submit" disabled={busy || !input.trim()} className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-violet-600 px-4 text-sm font-extrabold text-white disabled:cursor-not-allowed disabled:opacity-40 hover:bg-violet-500">
                <Send size={18}/> Kirim ke Asisten AI
              </button>
              <p className="px-1 text-[11px] leading-5 text-zinc-600">Gunakan ruang ini sebebas mungkin untuk lirik, konsep lagu, revisi, struktur, atau pertanyaan musik. Jangan kirim password, API key, token, atau data rahasia.</p>
            </form>
          </aside>
        </main>
      </div>
    </div>}
  </>;
}
