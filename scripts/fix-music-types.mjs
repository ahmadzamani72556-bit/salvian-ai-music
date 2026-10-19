import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const componentFile = fileURLToPath(new URL("../components/premium-music-studio.tsx", import.meta.url));
const routeFile = fileURLToPath(new URL("../app/api/music/remix/route.ts", import.meta.url));

const source = readFileSync(componentFile, "utf8");
const fixed = `function headersFor(workspace: string, json = false): Record<string, string> {
  const headers: Record<string, string> = { "X-Music-Workspace": workspace };
  if (json) headers["Content-Type"] = "application/json";
  return headers;
}`;

let component = source;
if (!component.includes(`import { upload } from "@vercel/blob/client";`)) {
  component = component.replace(
    `import { FormEvent, useEffect, useMemo, useRef, useState } from "react";`,
    `import { FormEvent, useEffect, useMemo, useRef, useState } from "react";\nimport { upload } from "@vercel/blob/client";`,
  );
}

const oneLineLegacy = `function headersFor(workspace: string, json = false) { return json ? { "Content-Type": "application/json", "X-Music-Workspace": workspace } : { "X-Music-Workspace": workspace }; }`;
const multilineLegacy = `function headersFor(workspace: string, json = false) {
  return json ? { "Content-Type": "application/json", "X-Music-Workspace": workspace } : { "X-Music-Workspace": workspace };
}`;

if (component.includes(oneLineLegacy)) component = component.replace(oneLineLegacy, fixed);
if (component.includes(multilineLegacy)) component = component.replace(multilineLegacy, fixed);

const oldUpload = `  const uploadFile = async (file: File, purpose: "reference" | "voice") => {
    if (!workspace) return;
    if (!/^audio\\/(mpeg|mp4|x-m4a|aac|wav)$/i.test(file.type) && !/\\.(mp3|m4a|wav|aac)$/i.test(file.name)) {
      setNotice("Format audio tidak didukung. Gunakan MP3 atau M4A."); return;
    }
    if (purpose === "voice" && file.size > 10 * 1024 * 1024) {
      setNotice("Ukuran file Voice & Vocal maksimal 10 MB."); return;
    }
    setBusy(true);
    setNotice(purpose === "reference" ? "Mengunggah Audio Referensi…" : "Mengunggah Voice & Vocal…");
    try {
      const form = new FormData(); form.append("file", file); form.append("purpose", purpose); form.append("engine", musicEngine);
      const res = await fetch("/api/music/upload", { method: "POST", headers: headersFor(workspace), body: form });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Upload gagal.");
      if (purpose === "reference") {
        const nextReferenceId = String(data.id || data.url || "");
        const nextRemixId = String(data.remix_upload_id || "");
        setReferenceId(nextReferenceId);
        setReferenceRemixId(nextRemixId);
        setReferenceName(file.name);
        setReferenceEngine(musicEngine);
        setNotice(nextRemixId ? "Audio Referensi berhasil disimpan untuk Stage-1 dan Remix penuh. Tetap di halaman pembuatan musik." : "Audio Referensi berhasil disimpan. Tetap di halaman pembuatan musik.");
      } else {
        setVocalId(String(data.vocal_id || data.id || "")); setVocalName(file.name); setVocalEngine(musicEngine);
        setNotice("Voice & Vocal berhasil disimpan. Tetap di halaman pembuatan musik.");
      }
    } catch (e) { setNotice(e instanceof Error ? e.message : "Upload gagal."); }
    finally { setBusy(false); }
  };`;

const newUpload = `  const uploadFile = async (file: File, purpose: "reference" | "voice") => {
    if (!workspace) return;
    if (!/^audio\\/(mpeg|mp4|x-m4a|aac|wav)$/i.test(file.type) && !/\\.(mp3|m4a|wav|aac)$/i.test(file.name)) {
      setNotice("Format audio tidak didukung. Gunakan MP3 atau M4A."); return;
    }
    if (file.size > 10 * 1024 * 1024) {
      setNotice(`Ukuran file ${(file.size / 1024 / 1024).toFixed(2)} MB terlalu besar. Batas upload adalah 10 MB.`); return;
    }
    setBusy(true);
    setNotice(purpose === "reference" ? "Mengunggah Audio Referensi…" : "Mengunggah Voice & Vocal…");
    try {
      if (purpose === "reference" && musicEngine === "mureka") {
        const blob = await upload(`music-reference/${crypto.randomUUID()}-${file.name}`, file, {
          access: "public",
          handleUploadUrl: "/api/music/reference-upload",
          clientPayload: JSON.stringify({ workspace }),
          multipart: file.size > 4 * 1024 * 1024,
          onUploadProgress: (event) => setNotice(`Mengunggah Audio Referensi… ${Math.round(event.percentage)}%`),
        });
        const form = new FormData();
        form.append("file_url", blob.url);
        form.append("purpose", "reference");
        form.append("engine", musicEngine);
        const res = await fetch("/api/music/upload", { method: "POST", headers: headersFor(workspace), body: form });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || "Upload gagal.");
        setReferenceId(String(data.reference_url || data.id || blob.url));
        setReferenceRemixId("");
        setReferenceName(file.name);
        setReferenceEngine(musicEngine);
        setNotice("Audio Referensi berhasil disimpan hingga 10 MB. Tetap di halaman pembuatan musik.");
      } else {
        const form = new FormData(); form.append("file", file); form.append("purpose", purpose); form.append("engine", musicEngine);
        const res = await fetch("/api/music/upload", { method: "POST", headers: headersFor(workspace), body: form });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || "Upload gagal.");
        setVocalId(String(data.vocal_id || data.id || "")); setVocalName(file.name); setVocalEngine(musicEngine);
        setNotice("Voice & Vocal berhasil disimpan. Tetap di halaman pembuatan musik.");
      }
    } catch (e) { setNotice(e instanceof Error ? e.message : "Upload gagal."); }
    finally { setBusy(false); }
  };`;

if (component.includes(oldUpload)) {
  component = component.replace(oldUpload, newUpload);
} else if (!component.includes(`handleUploadUrl: "/api/music/reference-upload"`)) {
  throw new Error("Music upload function was not found; refusing to modify the source unexpectedly.");
}

if (component !== source) writeFileSync(componentFile, component, "utf8");

// Keep the source route build-safe even when a legacy deployment contains
// older response inference around Mureka error payloads.
let route = readFileSync(routeFile, "utf8");
if (route.includes(`text(data?.message)`)) {
  route = route.replace(`text(data?.message)`, `text((data as Record<string, unknown>).message)`);
}
if (route.includes(`text(providerData.message||providerData.error||providerData.failed_reason||providerData.detail)`)) {
  route = route.replace(
    `text(providerData.message||providerData.error||providerData.failed_reason||providerData.detail)`,
    `text((providerData as Record<string, unknown>).message||(providerData as Record<string, unknown>).error||(providerData as Record<string, unknown>).failed_reason||(providerData as Record<string, unknown>).detail)`,
  );
}
writeFileSync(routeFile, route, "utf8");
console.log("Normalized Music upload routing and Mureka response typing.");
