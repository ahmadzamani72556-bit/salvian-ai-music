"use client";

import { type ReactNode, useEffect } from "react";

type Props = { children: ReactNode };
type Draft = {
  prompt?: string;
  lyrics?: string;
  gender?: string;
  instrumental?: boolean;
  tempo?: number;
  language?: string;
  musicEngine?: string;
  model?: string;
  referenceId?: string;
  referenceName?: string;
  referenceEngine?: string;
};

const DRAFT_KEY = "salvian_music_stage2_draft";

function urlOf(input: RequestInfo | URL) {
  if (typeof input === "string") return input;
  if (input instanceof URL) return input.toString();
  return input.url;
}

function readDraft(): Draft {
  try {
    const raw = window.localStorage.getItem(DRAFT_KEY);
    return raw ? JSON.parse(raw) as Draft : {};
  } catch {
    return {};
  }
}

function writeDraft(patch: Draft) {
  try {
    const next = { ...readDraft(), ...patch };
    window.localStorage.setItem(DRAFT_KEY, JSON.stringify(next));
  } catch {
    // Local persistence is best-effort; never block the music studio.
  }
}

/**
 * Stage-2 adapter only. It leaves the proven Studio and Stage-1 /api/music
 * flow untouched. Reference audio goes browser -> Blob, while the completed
 * Mureka reference request goes through the dedicated Remix route.
 *
 * This adapter also keeps the Stage-2 draft locally so a normal browser
 * refresh does not erase the reference, lyrics, concept, or controls.
 */
export default function Stage2ReferenceFlow({ children }: Props) {
  useEffect(() => {
    const nativeFetch = window.fetch.bind(window);

    // Restore controlled Studio fields after React mounts. We deliberately
    // use real DOM events so the existing controlled inputs update their
    // React state instead of creating a second state system.
    const draft = readDraft();
    const restore = window.setTimeout(() => {
      const textareas = Array.from(document.querySelectorAll<HTMLTextAreaElement>("[data-premium-studio] textarea"));
      if (draft.prompt !== undefined && textareas[0]) {
        textareas[0].value = draft.prompt;
        textareas[0].dispatchEvent(new Event("input", { bubbles: true }));
      }
      if (draft.lyrics !== undefined && textareas[1]) {
        textareas[1].value = draft.lyrics;
        textareas[1].dispatchEvent(new Event("input", { bubbles: true }));
      }
      const selects = Array.from(document.querySelectorAll<HTMLSelectElement>("[data-premium-studio] select"));
      if (draft.language && selects[0]) {
        selects[0].value = draft.language;
        selects[0].dispatchEvent(new Event("change", { bubbles: true }));
      }
      if (draft.gender && selects[1]) {
        selects[1].value = draft.gender;
        selects[1].dispatchEvent(new Event("change", { bubbles: true }));
      }
      const range = document.querySelector<HTMLInputElement>("[data-premium-studio] input[type=range]");
      if (typeof draft.tempo === "number" && range) {
        range.value = String(draft.tempo);
        range.dispatchEvent(new Event("input", { bubbles: true }));
      }
      const checkbox = document.querySelector<HTMLInputElement>("[data-premium-studio] input[type=checkbox]");
      if (typeof draft.instrumental === "boolean" && checkbox) {
        checkbox.checked = draft.instrumental;
        checkbox.dispatchEvent(new Event("change", { bubbles: true }));
      }
      if (draft.referenceName) {
        window.dispatchEvent(new CustomEvent("salvian-stage2-reference-restored", { detail: draft }));
      }
    }, 0);

    // Save user typing/control changes immediately so a refresh preserves the
    // work in progress. The file itself cannot be persisted in localStorage;
    // its Blob URL/id is persisted after the upload succeeds.
    const onInput = (event: Event) => {
      const target = event.target as HTMLInputElement | HTMLTextAreaElement | null;
      if (!target) return;
      const textareas = Array.from(document.querySelectorAll<HTMLTextAreaElement>("[data-premium-studio] textarea"));
      if (target === textareas[0]) writeDraft({ prompt: target.value });
      if (target === textareas[1]) writeDraft({ lyrics: target.value });
      if (target instanceof HTMLInputElement && target.type === "range") writeDraft({ tempo: Number(target.value) });
    };
    const onChange = (event: Event) => {
      const target = event.target as HTMLInputElement | HTMLSelectElement | null;
      if (!target) return;
      if (target instanceof HTMLSelectElement) {
        const selects = Array.from(document.querySelectorAll<HTMLSelectElement>("[data-premium-studio] select"));
        if (target === selects[0]) writeDraft({ language: target.value });
        if (target === selects[1]) writeDraft({ gender: target.value });
      }
      if (target instanceof HTMLInputElement && target.type === "checkbox") writeDraft({ instrumental: target.checked });
    };
    document.addEventListener("input", onInput, true);
    document.addEventListener("change", onChange, true);

    window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = urlOf(input);

      if (url.endsWith("/api/music/upload") && init?.body instanceof FormData) {
        const form = init.body;
        const purpose = String(form.get("purpose") || "").toLowerCase();
        const engine = String(form.get("engine") || "").toLowerCase();
        const file = form.get("file");

        if (purpose === "reference" && engine === "mureka" && file instanceof File) {
          const headers = new Headers(init.headers || {});
          const workspace = headers.get("x-music-workspace") || "";
          if (!workspace) return new Response(JSON.stringify({ success: false, error: "Workspace Music belum siap." }), { status: 400, headers: { "Content-Type": "application/json" } });

          try {
            const sign = await nativeFetch("/api/music/reference-presign", {
              method: "POST",
              headers: { "Content-Type": "application/json", "X-Music-Workspace": workspace },
              body: JSON.stringify({ filename: file.name, contentType: file.type || "audio/mpeg", size: file.size }),
            });
            const signData = await sign.json().catch(() => ({}));
            if (!sign.ok || !signData.presignedUrl) throw new Error(signData.error || "Gagal menyiapkan penyimpanan Audio Referensi.");

            const put = await nativeFetch(signData.presignedUrl, {
              method: "PUT",
              headers: { "Content-Type": file.type || "audio/mpeg" },
              body: file,
            });
            if (!put.ok) throw new Error("Upload Audio Referensi ke Blob gagal.");

            writeDraft({ referenceId: String(signData.url), referenceName: file.name, referenceEngine: "mureka" });
            return new Response(JSON.stringify({ success: true, id: signData.url, url: signData.url, purpose: "reference", engine: "mureka", largeReferenceUpload: true }), {
              status: 200,
              headers: { "Content-Type": "application/json" },
            });
          } catch (error) {
            return new Response(JSON.stringify({ success: false, error: error instanceof Error ? error.message : "Upload Audio Referensi gagal." }), {
              status: 500,
              headers: { "Content-Type": "application/json" },
            });
          }
        }
      }

      if (url.endsWith("/api/music") && typeof init?.body === "string") {
        try {
          const body = JSON.parse(init.body) as Record<string, unknown>;
          const engine = String(body.musicEngine || body.engine || "").toLowerCase();
          const stored = readDraft();
          const referenceUrl = (typeof body.reference_id === "string" ? body.reference_id.trim() : "") || stored.referenceId || "";

          writeDraft({
            lyrics: String(body.lyrics || ""),
            musicEngine: engine,
            model: String(body.model || ""),
            gender: String(body.gender || ""),
            language: String(body.language || ""),
            tempo: Number(body.tempo || 0),
            instrumental: Boolean(body.instrumental),
          });

          if (engine === "mureka" && /^https:\/\//i.test(referenceUrl)) {
            const headers = new Headers(init.headers || {});
            headers.set("Content-Type", "application/json");
            return nativeFetch("/api/music/remix", {
              method: "POST",
              headers,
              body: JSON.stringify({
                reference_url: referenceUrl,
                lyrics: String(body.lyrics || ""),
                prompt: String(body.style || "").slice(0, 1024),
                title: String(body.title || "Salvian AI Music — Reference Remix").slice(0, 160),
                n: Number.isFinite(Number(body.n)) ? Math.min(3, Math.max(1, Math.floor(Number(body.n)))) : 1,
              }),
            });
          }
        } catch {
          // Preserve the original request when it is not the Stage-2 path.
        }
      }

      return nativeFetch(input, init);
    };

    return () => {
      window.clearTimeout(restore);
      document.removeEventListener("input", onInput, true);
      document.removeEventListener("change", onChange, true);
      window.fetch = nativeFetch;
    };
  }, []);

  return <>{children}</>;
}
