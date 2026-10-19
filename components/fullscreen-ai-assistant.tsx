"use client";

import { FormEvent, useEffect, useState } from "react";
import { Check, Copy, MessageCircle, Save, Send, Sparkles, Trash2, X } from "lucide-react";

type Message = { role: "user" | "assistant"; content: string; id: string };

const welcome: Message = {
  id: "welcome",
  role: "assistant",
  content: "Halo! Saya Asisten AI SALVIAN AI MUSIC. Saya siap membantu ide musik, lirik, genre, vokal, prompt, dan penggunaan Studio. Ketik bebas apa pun yang ingin kamu buat atau tanyakan.",
};

const SAVED_KEY = "salvian-ai-music-assistant-saved";

export default function FullscreenAiAssistant() {
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
    const onClick = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null;
      const button = target?.closest("button");
      if (!button) return;
      const label = (button.textContent || "").replace(/\s+/g, " ").trim();
      if (!label.includes("Asisten AI")) return;
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      setOpen(true);
    };
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, []);

  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = previousOverflow; };
  }, [open]);

  useEffect(() => {
    const style = document.createElement("style");
    style.setAttribute("data-salvian-fullscreen-assistant", "true");
    style.textContent = `[data-premium-studio] > .relative > .fixed.bottom-4.right-4.z-50 { display: none !important; }`;
    document.head.appendChild(style);
    return () => style.remove();
  }, []);

  const ask = async (event?: FormEvent) => {
    event?.preventDefault();
    const message = input.trim();
    if (!message || busy) return;

    const history = messages
      .filter(item => item.id !== "welcome")
      .slice(-6)
      .map(({ role, content }) => ({ role, content: content.slice(0, 2500) }));
    const userMessage: Message = { id: crypto.randomUUID(), role: "user", content: message };
    const assistantId = crypto.randomUUID();

    setInput("");
    setMessages(prev => [...prev, userMessage, { id: assistantId, role: "assistant", content: "" }]);
    setBusy(true);

    try {
      const workspace = window.localStorage.getItem("salvian_music_workspace") || "";
      const res = await fetch("/api/assistant", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Music-Workspace": workspace },
        body: JSON.stringify({ message, history }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Asisten AI sedang tidak tersedia.");
      }

      if (!res.body) throw new Error("Koneksi streaming Asisten AI tidak tersedia.");

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let receivedText = false;

      const processChunk = (chunk: string) => {
        buffer += chunk;
        const events = buffer.split("\n\n");
        buffer = events.pop() || "";
        for (const event of events) {
          const line = event.split("\n").find(item => item.startsWith("data: "));
          if (!line) continue;
          const payload = line.slice(6).trim();
          if (payload === "[DONE]") continue;
          try {
            const data = JSON.parse(payload) as { type?: string; text?: string; error?: string };
            if (data.type === "delta" && data.text) {
              receivedText = true;
              setMessages(prev => prev.map(item => item.id === assistantId ? { ...item, content: item.content + data.text } : item));
            } else if (data.type === "error") {
              throw new Error(data.error || "Terjadi kesalahan pada Asisten AI.");
            }
          } catch (parseError) {
            if (parseError instanceof Error && parseError.message !== "Unexpected end of JSON input") throw parseError;
          }
        }
      };

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        processChunk(decoder.decode(value, { stream: true }));
      }
      processChunk(decoder.decode());

      if (!receivedText) throw new Error("Asisten AI belum menghasilkan jawaban.");
    } catch (error) {
      setMessages(prev => prev.map(item => item.id === assistantId ? { ...item, content: error instanceof Error ? error.message : "Terjadi kesalahan saat menghubungkan ke Asisten AI." } : item));
    } finally {
      setBusy(false);
    }
  };

  const copyMessage = async (content: string, id: string) => {
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

  return open ? (
    <div className="fixed inset-0 z-[9999] h-[100dvh] w-screen overflow-hidden bg-[#08080d] text-white" role="dialog" aria-modal="true" aria-label="Asisten AI SALVIAN AI MUSIC">
      <div className="flex h-full min-h-0 w-full flex-col">
        <header className="flex shrink-0 items-center justify-between border-b border-white/10 bg-[#0c0c13] px-4 py-3 sm:px-7 sm:py-4">
          <div className="flex min-w-0 items-center gap-3">
            <div className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-violet-500/15 text-violet-200"><Sparkles size={20}/></div>
            <div className="min-w-0"><div className="font-extrabold text-base sm:text-lg">Asisten AI</div><div className="truncate text-xs text-zinc-500">SALVIAN AI MUSIC · Ruang kerja penuh</div></div>
          </div>
          <button type="button" onClick={() => { if (!busy) setOpen(false); }} className="inline-flex shrink-0 items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm font-semibold text-zinc-200 hover:bg-white/10">
            <X size={18}/> Kembali
          </button>
        </header>

        <main className="flex min-h-0 flex-1 flex-col overflow-hidden lg:flex-row">
          <section className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8">
            <div className="mx-auto w-full max-w-5xl space-y-4 pb-8">
              {messages.map(item => (
                <div key={item.id} className={item.role === "user" ? "flex justify-end" : "flex justify-start"}>
                  <div className={item.role === "user" ? "w-full max-w-4xl rounded-3xl bg-violet-500/15 px-5 py-4 text-sm leading-7 text-violet-50" : "w-full max-w-4xl rounded-3xl border border-white/10 bg-[#111119] px-5 py-4 text-sm leading-7 text-zinc-200 shadow-xl shadow-black/10"}>
                    <div className="whitespace-pre-wrap break-words">{item.content || (busy && item.role === "assistant" ? "Menjawab…" : "")}</div>
                    {item.content && <div className="mt-4 flex flex-wrap gap-2 border-t border-white/8 pt-3">
                      <button type="button" onClick={() => void copyMessage(item.content, item.id)} className="inline-flex items-center gap-1.5 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs font-semibold text-zinc-300 hover:bg-white/10">
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
                </div>
              ))}
            </div>
          </section>

          <aside className="flex shrink-0 border-t border-white/10 bg-[#0c0c13] p-3 sm:p-4 lg:w-[440px] lg:border-l lg:border-t-0 lg:p-6">
            <form onSubmit={ask} className="flex w-full flex-col gap-3">
              <div className="flex items-center justify-between"><div className="text-sm font-bold text-zinc-200">Tulis bebas</div><div className="text-[11px] text-zinc-600">{input.length}/5000</div></div>
              <textarea value={input} onChange={event => setInput(event.target.value)} maxLength={5000} autoFocus placeholder="Ketik lirik lagu, ide musik, genre, prompt, revisi, atau apa saja…" className="min-h-[240px] w-full flex-1 resize-none rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-sm leading-6 text-white outline-none placeholder:text-zinc-600 focus:border-violet-400/40 lg:min-h-[420px]"/>
              <button type="submit" disabled={busy || !input.trim()} className="inline-flex h-12 w-full shrink-0 items-center justify-center gap-2 rounded-2xl bg-violet-600 px-4 text-sm font-extrabold text-white disabled:cursor-not-allowed disabled:opacity-40 hover:bg-violet-500">
                <Send size={18}/> {busy ? "Menjawab…" : "Kirim ke Asisten AI"}
              </button>
            </form>
          </aside>
        </main>
      </div>
    </div>
  ) : null;
}
