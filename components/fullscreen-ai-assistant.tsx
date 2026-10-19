"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import {
  Check,
  Copy,
  History,
  MessageCircle,
  Plus,
  Save,
  Send,
  Sparkles,
  Trash2,
  X,
} from "lucide-react";

type MessageRole = "user" | "assistant";
type Message = { id: string; role: MessageRole; content: string };

type HistoryEntry = {
  id: string;
  title: string;
  messages: Message[];
  savedAt: number;
};

const welcome: Message = {
  id: "welcome",
  role: "assistant",
  content:
    "Halo! Saya Asisten AI SALVIAN AI MUSIC. Saya siap membantu ide musik, lirik, genre, vokal, prompt, dan penggunaan Studio. Ketik bebas apa pun yang ingin kamu buat atau tanyakan.",
};

const CONVERSATION_KEY = "salvian-ai-music-assistant-conversation-v3";
const HISTORY_KEY = "salvian-ai-music-assistant-history-v3";
const MAX_STORED_MESSAGES = 60;
const MAX_HISTORY = 30;

const lyricHeadingPattern =
  /^(?:\*{0,2}\s*)?(?:\[|\()?\s*(judul|intro|verse(?:\s*\d+)?|pre[- ]?chorus|chorus|refrain|bridge|interlude|outro|ending)\b[^\n]*?(?:\]|\))?\s*(?:\*{0,2})\s*:?\s*$/i;
const inlineHeadingPattern =
  /\s*\*{0,2}\s*[\[(]\s*(judul|intro|verse(?:\s*\d+)?|pre[- ]?chorus|chorus|refrain|bridge|interlude|outro|ending)\b[^\])]*[\])]\s*\*{0,2}\s*/gi;
const boldHeadingPattern =
  /\s*\*{2}\s*(judul|intro|verse(?:\s*\d+)?|pre[- ]?chorus|chorus|refrain|bridge|interlude|outro|ending)\b[^*]*\*{2}\s*/gi;

function createId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function cleanHeading(value: string): string {
  return value.replace(/[()[\]]/g, "").replace(/^\*+|\*+$/g, "").trim();
}

function cleanAssistantText(text: string): string {
  let value = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n").trim();
  value = value.replace(
    inlineHeadingPattern,
    (_, heading: string) => `\n\n[${cleanHeading(heading)}]\n\n`,
  );
  value = value.replace(
    boldHeadingPattern,
    (_, heading: string) => `\n\n[${cleanHeading(heading)}]\n\n`,
  );
  return value.replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
}

function renderAssistantText(text: string) {
  const normalized = cleanAssistantText(text);
  const blocks = normalized
    .split(/\n\s*\n/)
    .map((block) => block.trim())
    .filter(Boolean);

  return blocks.map((block, blockIndex) => {
    const lines = block
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);
    if (!lines.length) return null;

    const heading = cleanHeading(lines[0]);
    if (lyricHeadingPattern.test(lines[0])) {
      return (
        <div
          key={`${blockIndex}-${lines[0]}`}
          className="mt-4 rounded-2xl border border-violet-400/15 bg-violet-500/5 px-4 py-3 first:mt-0"
        >
          <div className="mb-2 text-sm font-extrabold uppercase tracking-[0.12em] text-violet-200">
            {heading}
          </div>
          <div className="space-y-1.5">
            {lines.slice(1).map((line, index) => (
              <div key={index} className="leading-7 text-zinc-100">
                {line.replace(/^\*+|\*+$/g, "").trim()}
              </div>
            ))}
          </div>
        </div>
      );
    }

    return (
      <div key={`${blockIndex}-${lines[0]}`} className="mb-3 last:mb-0">
        {lines.map((line, index) => (
          <div key={index} className="min-h-[1.75rem] leading-7 text-zinc-200">
            {line.replace(/^\*+|\*+$/g, "").trim() || "\u00a0"}
          </div>
        ))}
      </div>
    );
  });
}

function loadMessages(): Message[] {
  try {
    const raw = window.localStorage.getItem(CONVERSATION_KEY);
    if (!raw) return [welcome];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [welcome];

    const valid = parsed.filter((item: unknown): item is Message => {
      if (!item || typeof item !== "object") return false;
      const value = item as Partial<Message>;
      return (
        typeof value.id === "string" &&
        (value.role === "user" || value.role === "assistant") &&
        typeof value.content === "string"
      );
    });

    return valid.length ? valid.slice(-MAX_STORED_MESSAGES) : [welcome];
  } catch {
    return [welcome];
  }
}

function loadHistory(): HistoryEntry[] {
  try {
    const raw = window.localStorage.getItem(HISTORY_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];

    return parsed
      .filter((item: unknown): item is HistoryEntry => {
        if (!item || typeof item !== "object") return false;
        const value = item as Partial<HistoryEntry>;
        return (
          typeof value.id === "string" &&
          typeof value.title === "string" &&
          typeof value.savedAt === "number" &&
          Array.isArray(value.messages)
        );
      })
      .slice(-MAX_HISTORY);
  } catch {
    return [];
  }
}

function historyTitle(messages: Message[]): string {
  const firstUser = messages.find(
    (message) => message.role === "user" && message.content.trim(),
  );
  const title = firstUser?.content.trim() || "Percakapan Asisten AI";
  return title.length > 52 ? `${title.slice(0, 52)}…` : title;
}

export default function FullscreenAiAssistant() {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([welcome]);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [hydrated, setHydrated] = useState(false);
  const [showHistory, setShowHistory] = useState(false);

  useEffect(() => {
    setMessages(loadMessages());
    setHistory(loadHistory());
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    try {
      window.localStorage.setItem(
        CONVERSATION_KEY,
        JSON.stringify(messages.slice(-MAX_STORED_MESSAGES)),
      );
    } catch {}
  }, [messages, hydrated]);

  useEffect(() => {
    if (!hydrated) return;
    try {
      window.localStorage.setItem(
        HISTORY_KEY,
        JSON.stringify(history.slice(-MAX_HISTORY)),
      );
    } catch {}
  }, [history, hydrated]);

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
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [open]);

  useEffect(() => {
    const style = document.createElement("style");
    style.setAttribute("data-salvian-fullscreen-assistant", "true");
    style.textContent =
      `[data-premium-studio] > .relative > .fixed.bottom-4.right-4.z-50 { display: none !important; }`;
    document.head.appendChild(style);
    return () => style.remove();
  }, []);

  const hasConversation = useMemo(
    () => messages.some((message) => message.id !== "welcome" && message.content.trim()),
    [messages],
  );

  const saveConversation = () => {
    if (!hasConversation) return;

    const snapshot: HistoryEntry = {
      id: createId(),
      title: historyTitle(messages),
      messages: messages
        .filter((message) => message.content.trim())
        .slice(-MAX_STORED_MESSAGES),
      savedAt: Date.now(),
    };

    setHistory((previous) => {
      const withoutDuplicate = previous.filter(
        (item) => JSON.stringify(item.messages) !== JSON.stringify(snapshot.messages),
      );
      return [...withoutDuplicate, snapshot].slice(-MAX_HISTORY);
    });
  };

  const newConversation = () => {
    if (busy) return;
    saveConversation();
    setMessages([welcome]);
    setInput("");
    setShowHistory(false);
  };

  const ask = async (event?: FormEvent) => {
    event?.preventDefault();
    const message = input.trim();
    if (!message || busy) return;

    const historyForRequest = messages
      .filter((item) => item.id !== "welcome")
      .slice(-6)
      .map(
        ({ role, content }): { role: MessageRole; content: string } => ({
          role,
          content: content.slice(0, 1600),
        }),
      );

    const userMessage: Message = {
      id: createId(),
      role: "user",
      content: message,
    };
    const assistantMessage: Message = {
      id: createId(),
      role: "assistant",
      content: "",
    };

    setInput("");
    setMessages((previous) =>
      [...previous, userMessage, assistantMessage].slice(-MAX_STORED_MESSAGES),
    );
    setBusy(true);

    try {
      const workspace =
        window.localStorage.getItem("salvian_music_workspace") || "";
      const response = await fetch("/api/assistant", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Music-Workspace": workspace,
        },
        body: JSON.stringify({
          message,
          history: historyForRequest,
        }),
      });

      const data: { answer?: unknown; error?: unknown } = await response
        .json()
        .catch(() => ({}));

      if (!response.ok) {
        throw new Error(
          typeof data.error === "string"
            ? data.error
            : "Asisten AI sedang tidak tersedia.",
        );
      }

      const answer =
        typeof data.answer === "string" ? data.answer.trim() : "";
      if (!answer) {
        throw new Error(
          typeof data.error === "string"
            ? data.error
            : "Asisten AI belum menghasilkan jawaban.",
        );
      }

      setMessages((previous) =>
        previous.map((item) =>
          item.id === assistantMessage.id
            ? { ...item, content: answer }
            : item,
        ),
      );
    } catch (error) {
      const errorMessage =
        error instanceof Error
          ? error.message
          : "Terjadi kesalahan saat menghubungkan ke Asisten AI.";

      setMessages((previous) =>
        previous.map((item) =>
          item.id === assistantMessage.id
            ? { ...item, content: errorMessage }
            : item,
        ),
      );
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
    window.setTimeout(
      () => setCopiedId((current) => (current === id ? null : current)),
      1600,
    );
  };

  const deleteMessage = (id: string) => {
    const target = messages.find((message) => message.id === id);
    if (!target || !target.content.trim()) return;

    // Hapus dari layar, tetapi simpan seluruh percakapan sebelum penghapusan.
    saveConversation();
    setMessages((previous) =>
      previous.filter((message) => message.id !== id),
    );
  };

  const loadHistoryEntry = (entry: HistoryEntry) => {
    setMessages(entry.messages.length ? entry.messages : [welcome]);
    setShowHistory(false);
  };

  const deleteHistoryEntry = (id: string) => {
    setHistory((previous) => previous.filter((entry) => entry.id !== id));
  };

  return open ? (
    <div
      className="fixed inset-0 z-[9999] h-[100dvh] w-screen overflow-hidden bg-[#08080d] text-white"
      role="dialog"
      aria-modal="true"
      aria-label="Asisten AI SALVIAN AI MUSIC"
    >
      <div className="flex h-full min-h-0 w-full flex-col">
        <header className="flex shrink-0 items-center justify-between gap-3 border-b border-white/10 bg-[#0c0c13] px-3 py-3 sm:px-6 sm:py-4">
          <div className="flex min-w-0 items-center gap-3">
            <div className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-violet-500/15 text-violet-200">
              <Sparkles size={20} />
            </div>
            <div className="min-w-0">
              <div className="font-extrabold text-base sm:text-lg">Asisten AI</div>
              <div className="truncate text-xs text-zinc-500">
                SALVIAN AI MUSIC · Ruang kerja
              </div>
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-2">
            <button
              type="button"
              onClick={() => setShowHistory(true)}
              className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm font-semibold text-zinc-200 hover:bg-white/10"
            >
              <History size={17} />
              <span className="hidden sm:inline">Riwayat</span>
              <span className="rounded-full bg-white/10 px-1.5 text-[11px]">
                {history.length}
              </span>
            </button>

            <button
              type="button"
              onClick={newConversation}
              disabled={busy}
              className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-violet-400/20 bg-violet-500/10 px-3 py-2 text-sm font-semibold text-violet-200 hover:bg-violet-500/15 disabled:opacity-40"
            >
              <Plus size={17} />
              <span className="hidden sm:inline">Percakapan baru</span>
            </button>

            <button
              type="button"
              onClick={() => {
                if (!busy) setOpen(false);
              }}
              className="inline-flex min-h-10 shrink-0 items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm font-semibold text-zinc-200 hover:bg-white/10"
            >
              <X size={18} />
              <span className="hidden sm:inline">Kembali</span>
            </button>
          </div>
        </header>

        <main className="flex min-h-0 flex-1 overflow-hidden">
          <section className="min-h-0 flex-1 overflow-y-auto">
            <div className="mx-auto w-full max-w-4xl px-3 pb-36 pt-4 sm:px-6 sm:pt-8">
              {messages.map((item) => (
                <div
                  key={item.id}
                  className={
                    item.role === "user"
                      ? "mb-6 flex justify-end"
                      : "mb-8 flex justify-start"
                  }
                >
                  <div
                    className={
                      item.role === "user"
                        ? "w-fit max-w-[92%] rounded-3xl bg-violet-600/20 px-4 py-3 text-sm leading-7 text-violet-50 sm:max-w-3xl sm:px-5"
                        : "w-full max-w-4xl px-1 text-sm leading-7 text-zinc-200"
                    }
                  >
                    {item.role === "assistant" && item.content && (
                      <div className="mb-3 flex items-center gap-2 text-xs font-bold uppercase tracking-[0.12em] text-violet-200">
                        <Sparkles size={14} />
                        Asisten AI
                      </div>
                    )}

                    <div className="break-words">
                      {item.content
                        ? item.role === "assistant"
                          ? renderAssistantText(item.content)
                          : <div className="whitespace-pre-wrap">{item.content}</div>
                        : busy && item.role === "assistant"
                          ? "Menjawab…"
                          : null}
                    </div>

                    {item.role === "assistant" && item.content.trim() && (
                      <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-white/8 pt-3">
                        <button
                          type="button"
                          onClick={() => void copyMessage(item.content, item.id)}
                          className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-bold text-zinc-300 hover:bg-white/10"
                        >
                          {copiedId === item.id ? <Check size={14} /> : <Copy size={14} />}
                          {copiedId === item.id ? "Tersalin" : "Salin"}
                        </button>

                        <button
                          type="button"
                          onClick={saveConversation}
                          className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-bold text-zinc-300 hover:bg-white/10"
                        >
                          <Save size={14} />
                          Simpan
                        </button>

                        <button
                          type="button"
                          onClick={() => deleteMessage(item.id)}
                          className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-red-400/15 bg-red-500/5 px-3 py-1.5 text-xs font-bold text-red-300 hover:bg-red-500/10"
                        >
                          <Trash2 size={14} />
                          Hapus
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </section>
        </main>

        <footer className="absolute inset-x-0 bottom-0 z-10 border-t border-white/10 bg-gradient-to-t from-[#08080d] via-[#08080d] to-transparent px-3 pb-3 pt-5 sm:px-6 sm:pb-5">
          <form
            onSubmit={ask}
            className="mx-auto flex w-full max-w-4xl items-end gap-2 rounded-3xl border border-white/10 bg-[#111119] p-2 shadow-2xl shadow-black/40"
          >
            <textarea
              value={input}
              onChange={(event) => setInput(event.target.value)}
              maxLength={6000}
              rows={1}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  void ask();
                }
              }}
              placeholder="Ketik lirik, ide lagu, pertanyaan, atau perintah…"
              className="max-h-36 min-h-12 flex-1 resize-none bg-transparent px-3 py-3 text-sm leading-6 text-white outline-none placeholder:text-zinc-600"
            />
            <button
              type="submit"
              disabled={busy || !input.trim()}
              aria-label="Kirim"
              className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-violet-600 text-white hover:bg-violet-500 disabled:cursor-not-allowed disabled:opacity-35"
            >
              <Send size={18} />
            </button>
          </form>
          <div className="mx-auto mt-2 max-w-4xl px-2 text-[10px] text-zinc-600">
            Enter untuk kirim · Shift+Enter untuk baris baru · Riwayat tersimpan di perangkat ini
          </div>
        </footer>

        {showHistory && (
          <div
            className="absolute inset-0 z-30 flex bg-black/65"
            role="dialog"
            aria-modal="true"
            aria-label="Riwayat percakapan"
          >
            <aside className="flex h-full w-[88%] max-w-sm flex-col border-r border-white/10 bg-[#0c0c13] shadow-2xl sm:w-[380px]">
              <div className="flex items-center justify-between border-b border-white/10 px-4 py-4">
                <div>
                  <div className="flex items-center gap-2 font-extrabold">
                    <History size={18} />
                    Riwayat percakapan
                  </div>
                  <div className="mt-1 text-xs text-zinc-500">
                    Tetap ada walaupun percakapan di layar dihapus.
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setShowHistory(false)}
                  className="rounded-xl border border-white/10 bg-white/5 p-2 text-zinc-300 hover:bg-white/10"
                >
                  <X size={18} />
                </button>
              </div>

              <div className="min-h-0 flex-1 overflow-y-auto p-3">
                {history.length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-white/10 px-4 py-10 text-center text-sm text-zinc-500">
                    Belum ada riwayat tersimpan.
                  </div>
                ) : (
                  <div className="space-y-2">
                    {[...history].reverse().map((entry) => (
                      <div
                        key={entry.id}
                        className="rounded-2xl border border-white/8 bg-white/[0.03] p-3"
                      >
                        <button
                          type="button"
                          onClick={() => loadHistoryEntry(entry)}
                          className="w-full text-left"
                        >
                          <div className="line-clamp-2 text-sm font-semibold text-zinc-200">
                            {entry.title}
                          </div>
                          <div className="mt-1 text-[11px] text-zinc-600">
                            {new Date(entry.savedAt).toLocaleString("id-ID")}
                          </div>
                        </button>

                        <div className="mt-2 flex gap-2">
                          <button
                            type="button"
                            onClick={() => loadHistoryEntry(entry)}
                            className="inline-flex min-h-9 flex-1 items-center justify-center gap-1.5 rounded-lg bg-violet-500/10 px-2 py-1.5 text-xs font-bold text-violet-200 hover:bg-violet-500/15"
                          >
                            <MessageCircle size={14} />
                            Buka
                          </button>
                          <button
                            type="button"
                            onClick={() => deleteHistoryEntry(entry.id)}
                            className="grid min-h-9 w-10 place-items-center rounded-lg border border-red-400/10 bg-red-500/5 text-red-300 hover:bg-red-500/10"
                            aria-label="Hapus riwayat"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </aside>

            <button
              type="button"
              className="min-w-0 flex-1 cursor-default"
              onClick={() => setShowHistory(false)}
              aria-label="Tutup riwayat"
            />
          </div>
        )}
      </div>
    </div>
  ) : null;
}
