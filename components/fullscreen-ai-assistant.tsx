"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { Check, Copy, MessageCircle, Save, Send, Sparkles, Trash2, X } from "lucide-react";

type Message = { role: "user" | "assistant"; content: string; id: string };
type SavedMessage = { role: "assistant"; content: string; id: string; savedAt: number };

const welcome: Message = {
  id: "welcome",
  role: "assistant",
  content: "Halo! Saya Asisten AI SALVIAN AI MUSIC. Saya siap membantu ide musik, lirik, genre, vokal, prompt, dan penggunaan Studio. Ketik bebas apa pun yang ingin kamu buat atau tanyakan.",
};

const CONVERSATION_KEY = "salvian-ai-music-assistant-conversation-v2";
const SAVED_KEY = "salvian-ai-music-assistant-saved-v2";
const MAX_STORED_MESSAGES = 40;
const MAX_SAVED_MESSAGES = 50;

const lyricHeadingPattern = /^(?:\*{0,2}\s*)?(?:\[|\()?\s*(judul|intro|verse(?:\s*\d+)?|pre[- ]?chorus|chorus|refrain|bridge|interlude|outro|ending)\b[^\n]*?(?:\]|\))?\s*(?:\*{0,2})\s*:?[\s]*$/i;
const inlineHeadingPattern = /\s*\*{0,2}\s*(\((?:judul|intro|verse(?:\s*\d+)?|pre[- ]?chorus|chorus|refrain|bridge|interlude|outro|ending)[^)]*\))\s*\*{0,2}\s*/gi;

function createId() {
  return typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function cleanAssistantText(text: string) {
  let value = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n").trim();
  value = value.replace(inlineHeadingPattern, "\n\n$1\n");
  value = value.replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n");
  return value.trim();
}

function renderAssistantText(text: string) {
  const normalized = cleanAssistantText(text);
  const blocks = normalized.split(/\n\s*\n/).map(block => block.trim()).filter(Boolean);

  return blocks.map((block, blockIndex) => {
    const lines = block.split("\n").map(line => line.trim()).filter(Boolean);
    if (!lines.length) return null;

    const heading = lines.length === 1 ? lines[0].replace(/^\*+|\*+$/g, "").trim() : lines[0].replace(/^\*+|\*+$/g, "").trim();
    if (lyricHeadingPattern.test(lines[0])) {
      return (
        <div key={`${blockIndex}-${lines[0]}`} className="mt-4 first:mt-0 rounded-2xl border border-violet-400/15 bg-violet-500/5 px-4 py-3">
          <div className="mb-2 text-sm font-extrabold uppercase tracking-[0.12em] text-violet-200">{heading.replace(/[()[\]]/g, "")}</div>
          {lines.slice(1).map((line, index) => (
            <div key={index} className="leading-7 text-zinc-100">{line.replace(/^\*+|\*+$/g, "").trim()}</div>
          ))}
        </div>
      );
    }

    return (
      <div key={`${blockIndex}-${lines[0]}`} className="mb-3 last:mb-0">
        {lines.map((line, index) => {
          const cleanLine = line.replace(/^\*+|\*+$/g, "").trim();
          return <div key={index} className="min-h-[1.75rem] leading-7 text-zinc-200">{cleanLine || "\u00a0"}</div>;
        })}
      </div>
    );
  });
}

function loadMessages(): Message[] {
  try {
    const stored = window.localStorage.getItem(CONVERSATION_KEY);
    if (!stored) return [welcome];
    const parsed = JSON.parse(stored);
    if (!Array.isArray(parsed)) return [welcome];
    const valid = parsed.filter((item: unknown): item is Message => {
      if (!item || typeof item !== "object") return false;
      const value = item as Partial<Message>;
      return (value.role === "user" || value.role === "assistant") && typeof value.content === "string" && typeof value.id === "string";
    });
    return valid.length ? valid.slice(-MAX_STORED_MESSAGES) : [welcome];
  } catch {
    return [welcome];
  }
}

function loadSaved(): SavedMessage[] {
  try {
    const stored = window.localStorage.getItem(SAVED_KEY);
    if (!stored) return [];
    const parsed = JSON.parse(stored);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item: unknown): item is SavedMessage => {
      if (!item || typeof item !== "object") return false;
      const value = item as Partial<SavedMessage>;
      return value.role === "assistant" && typeof value.content === "string" && typeof value.id === "string" && typeof value.savedAt === "number";
    }).slice(-MAX_SAVED_MESSAGES);
  } catch {
    return [];
  }
}

export default function FullscreenAiAssistant() {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [savedMessages, setSavedMessages] = useState<SavedMessage[]>([]);
  const [messages, setMessages] = useState<Message[]>([welcome]);
  const [hydrated, setHydrated] = useState(false);
  const [showSaved, setShowSaved] = useState(false);

  useEffect(() => {
    setMessages(loadMessages());
    setSavedMessages(loadSaved());
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    try {
      window.localStorage.setItem(CONVERSATION_KEY, JSON.stringify(messages.slice(-MAX_STORED_MESSAGES)));
    } catch {}
  }, [messages, hydrated]);

  useEffect(() => {
    if (!hydrated) return;
    try {
      window.localStorage.setItem(SAVED_KEY, JSON.stringify(savedMessages.slice(-MAX_SAVED_MESSAGES)));
    } catch {}
  }, [savedMessages, hydrated]);

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

  const savedIds = useMemo(() => new Set(savedMessages.map(item => item.id)), [savedMessages]);

  const ask = async (event?: FormEvent) => {
    event?.preventDefault();
    const message = input.trim();
    if (!message || busy) return;

    const history = messages
      .filter(item => item.id !== "welcome")
      .slice(-4)
      .map(({ role, content }) => ({ role, content: content.slice(0, 1600) }));
    const userMessage: Message = { id: createId(), role: "user", content: message };
    const assistantId = createId();

    setInput("");
    setMessages(prev => [...prev, userMessage, { id: assistantId, role: "assistant", content: "" }].slice(-MAX_STORED_MESSAGES));
    setBusy(true);

    try {
      const workspace = window.localStorage.getItem("salvian_music_workspace") || "";
      const res = await fetch("/api/assistant", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Music-Workspace": workspace },
        body: JSON.stringify({ message, history }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Asisten AI sedang tidak tersedia.");
      const answer = typeof data.answer === "string" ? data.answer.trim() : "";
      if (!answer) throw new Error(data.error || "Asisten AI belum menghasilkan jawaban.");

      setMessages(prev => prev.map(item => item.id === assistantId ? { ...item, content: answer } : item));
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
    if (message.role !== "assistant" || !message.content.trim()) return;
    setSavedMessages(previous => {
      const exists = previous.some(item => item.id === message.id);
      if (exists) return previous.filter(item => item.id !== message.id);
      return [...previous, { id: message.id, role: "assistant", content: message.content, savedAt: Date.now() }].slice(-MAX_SAVED_MESSAGES);
    });
  };

  const deleteMessage = (id: string) => {
    // Hapus hanya dari tampilan percakapan. Jika sebelumnya disimpan,
    // salinan tetap berada di Riwayat Tersimpan.
    setMessages(previous => previous.filter(message => message.id !== id));
  };

  const restoreSaved = (item: SavedMessage) => {
    setMessages(previous => [...previous, { id: createId(), role: "assistant", content: item.content }].slice(-MAX_STORED_MESSAGES));
    setShowSaved(false);
  };

  return open ? (
    <div className="fixed inset-0 z-[9999] h-[100dvh] w-screen overflow-hidden bg-[#08080d] text-white" role="dialog" aria-modal="true" aria-label="Asisten AI SALVIAN AI MUSIC">
      <div className="flex h-full min-h-0 w-full flex-col">
        <header className="flex shrink-0 items-center justify-between gap-3 border-b border-white/10 bg-[#0c0c13] px-4 py-3 sm:px-7 sm:py-4">
          <div className="flex min-w-0 items-center gap-3">
            <div className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-violet-500/15 text-violet-200"><Sparkles size={20}/></div>
            <div className="min-w-0"><div className="font-extrabold text-base sm:text-lg">Asisten AI</div><div className="truncate text-xs text-zinc-500">SALVIAN AI MUSIC · Ruang kerja penuh</div></div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <button type="button" onClick={() => setShowSaved(true)} className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm font-semibold text-zinc-200 hover:bg-white/10">
              <Save size={17}/> <span className="hidden sm:inline">Riwayat</span><span className="sm:hidden">{savedMessages.length}</span>
            </button>
            <button type="button" onClick={() => { if (!busy) setOpen(false); }} className="inline-flex shrink-0 items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm font-semibold text-zinc-200 hover:bg-white/10">
              <X size={18}/> Kembali
            </button>
          </div>
        </header>

        <main className="flex min-h-0 flex-1 flex-col overflow-hidden lg:flex-row">
          <section className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8">
            <div className="mx-auto w-full max-w-5xl space-y-4 pb-8">
              {messages.map(item => (
                <div key={item.id} className={item.role === "user" ? "flex justify-end" : "flex justify-start"}>
                  <div className={item.role === "user" ? "w-full max-w-4xl rounded-3xl bg-violet-500/15 px-5 py-4 text-sm leading-7 text-violet-50" : "w-full max-w-4xl rounded-3xl border border-white/10 bg-[#111119] px-5 py-4 text-sm leading-7 text-zinc-200 shadow-xl shadow-black/10"}>
                    <div className="break-words">
                      {item.content ? (item.role === "assistant" ? renderAssistantText(item.content) : <div className="whitespace-pre-wrap">{item.content}</div>) : (busy && item.role === "assistant" ? "Menjawab…" : "")}
                    </div>
                    {item.content && item.role === "assistant" && <div className="mt-4 flex flex-wrap gap-2 border-t border-white/8 pt-3">
                      <button type="button" onClick={() => void copyMessage(item.content, item.id)} className="inline-flex items-center gap-1.5 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs font-semibold text-zinc-300 hover:bg-white/10">
                        {copiedId === item.id ? <Check size={14}/> : <Copy size={14}/>} {copiedId === item.id ? "Tersalin" : "Salin"}
                      </button>
                      <button type="button" onClick={() => toggleSave(item)} className="inline-flex items-center gap-1.5 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs font-semibold text-zinc-300 hover:bg-white/10">
                        <Save size={14}/> {savedIds.has(item.id) ? "Tersimpan" : "Simpan"}
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
              <div className="flex items-center justify-between"><div className="text-sm font-bold text-zinc-200">Tulis bebas</div><div className="text-[11px] text-zinc-600">{input.length}/6000</div></div>
              <textarea value={input} onChange={event => setInput(event.target.value)} maxLength={6000} autoFocus placeholder="Ketik lirik lagu, ide musik, genre, prompt, revisi, atau apa saja…" className="min-h-[240px] w-full flex-1 resize-none rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-sm leading-6 text-white outline-none placeholder:text-zinc-600 focus:border-violet-400/40 lg:min-h-[420px]"/>
              <button type="submit" disabled={busy || !input.trim()} className="inline-flex h-12 w-full shrink-0 items-center justify-center gap-2 rounded-2xl bg-violet-600 px-4 text-sm font-extrabold text-white disabled:cursor-not-allowed disabled:opacity-40 hover:bg-violet-500">
                <Send size={18}/> {busy ? "Menjawab…" : "Kirim ke Asisten AI"}
              </button>
            </form>
          </aside>
        </main>

        {showSaved && (
          <div className="absolute inset-0 z-20 flex items-end justify-center bg-black/65 p-3 sm:items-center sm:p-6" role="dialog" aria-modal="true" aria-label="Riwayat tersimpan">
            <div className="flex max-h-[85dvh] w-full max-w-3xl flex-col overflow-hidden rounded-3xl border border-white/10 bg-[#111119] shadow-2xl">
              <div className="flex items-center justify-between border-b border-white/10 px-4 py-4 sm:px-6">
                <div><div className="font-extrabold">Riwayat Tersimpan</div><div className="text-xs text-zinc-500">Tetap tersimpan walaupun pesan dihapus dari tampilan.</div></div>
                <button type="button" onClick={() => setShowSaved(false)} className="rounded-xl border border-white/10 bg-white/5 p-2 text-zinc-300 hover:bg-white/10"><X size={18}/></button>
              </div>
              <div className="min-h-0 overflow-y-auto p-4 sm:p-6">
                {savedMessages.length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-white/10 px-5 py-10 text-center text-sm text-zinc-500">Belum ada jawaban yang disimpan. Tekan <span className="text-zinc-300">Simpan</span> pada jawaban yang ingin dipertahankan.</div>
                ) : (
                  <div className="space-y-4">
                    {[...savedMessages].reverse().map(item => (
                      <div key={item.id} className="rounded-2xl border border-white/10 bg-black/20 p-4">
                        <div className="max-h-72 overflow-y-auto text-sm leading-7">{renderAssistantText(item.content)}</div>
                        <div className="mt-3 flex flex-wrap gap-2 border-t border-white/8 pt-3">
                          <button type="button" onClick={() => void copyMessage(item.content, item.id)} className="inline-flex items-center gap-1.5 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs font-semibold text-zinc-300 hover:bg-white/10">{copiedId === item.id ? <Check size={14}/> : <Copy size={14}/>} {copiedId === item.id ? "Tersalin" : "Salin"}</button>
                          <button type="button" onClick={() => restoreSaved(item)} className="inline-flex items-center gap-1.5 rounded-xl border border-violet-400/15 bg-violet-500/10 px-3 py-2 text-xs font-semibold text-violet-200 hover:bg-violet-500/15"><MessageCircle size={14}/> Kembalikan ke percakapan</button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  ) : null;
}
