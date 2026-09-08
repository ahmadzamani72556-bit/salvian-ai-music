"use client";

import { FormEvent, useEffect, useState } from "react";
import { BetterAuthVanillaAdapter, createClient } from "@neondatabase/neon-js";

const AUTH = "https://ep-ancient-bonus-b37vykrs.neonauth.c-4.ap-southeast-1.aws.neon.tech/neondb/auth";
const DATA = "https://ep-ancient-bonus-b37vykrs.apirest.c-4.ap-southeast-1.aws.neon.tech/neondb/rest/v1";
const neon = createClient({ auth: { url: AUTH, adapter: BetterAuthVanillaAdapter() }, dataApi: { url: DATA } });

type Mode = "signin" | "signup";
type User = { name?: string | null; email?: string | null };

export default function AccountGateway() {
  const [mode, setMode] = useState<Mode>("signin");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [user, setUser] = useState<User | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  const refresh = async () => {
    try {
      const result = await neon.auth.getSession();
      setUser((result?.data?.user as User | undefined) || null);
    } catch {
      setUser(null);
    }
  };

  useEffect(() => { void refresh(); }, []);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    try {
      if (mode === "signup") {
        const result = await neon.auth.signUp.email({
          email: email.trim(),
          password,
          name: name.trim() || undefined,
        });
        if (result.error) throw new Error(result.error.message || "Pendaftaran akun gagal.");
      } else {
        const result = await neon.auth.signIn.email({ email: email.trim(), password });
        if (result.error) throw new Error(result.error.message || "Email atau password tidak benar.");
      }
      await refresh();
      window.location.assign("/");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Autentikasi gagal.");
    } finally {
      setBusy(false);
    }
  };

  const signOut = async () => {
    setBusy(true);
    setMessage("");
    try {
      const result = await neon.auth.signOut();
      if (result?.error) throw new Error(result.error.message || "Tidak dapat keluar dari akun.");
      setUser(null);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Gagal keluar dari akun.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="min-h-screen bg-[#02030a] px-4 py-8 text-white sm:px-6">
      <div className="mx-auto max-w-md rounded-[28px] border border-violet-400/20 bg-[#080912] p-6 shadow-2xl sm:p-8">
        <div className="mb-7">
          <div className="text-xs font-bold uppercase tracking-[.28em] text-violet-300">SALVIAN AI MUSIC</div>
          <h1 className="mt-2 text-3xl font-black">Akun SALVIAN AI</h1>
          <p className="mt-2 text-sm leading-6 text-white/55">Gunakan akun induk yang sama untuk SALVIAN AI MUSIC dan SALVIAN AI CREATOR.</p>
        </div>

        {user ? (
          <>
            <div className="rounded-2xl border border-emerald-400/20 bg-emerald-500/5 p-4">
              <div className="text-xs uppercase tracking-widest text-emerald-300">Akun aktif</div>
              <div className="mt-2 text-lg font-black">{user.name || "SALVIAN AI User"}</div>
              <div className="text-sm text-white/50">{user.email}</div>
            </div>
            <div className="mt-5 grid gap-3">
              <button onClick={() => window.location.assign("/")} className="rounded-xl bg-violet-600 px-4 py-3 font-black hover:bg-violet-500">Kembali ke SALVIAN AI MUSIC</button>
              <button onClick={() => void signOut()} disabled={busy} className="rounded-xl border border-white/10 bg-white/5 px-4 py-3 font-bold text-white/75 hover:bg-white/10 disabled:opacity-50">{busy ? "Memproses…" : "Keluar / Ganti akun"}</button>
            </div>
          </>
        ) : (
          <>
            <div className="mb-5 grid grid-cols-2 rounded-xl border border-white/10 bg-black/20 p-1">
              <button type="button" onClick={() => { setMode("signin"); setMessage(""); }} className={`rounded-lg px-3 py-2 text-sm font-bold ${mode === "signin" ? "bg-violet-600 text-white" : "text-white/50"}`}>Masuk</button>
              <button type="button" onClick={() => { setMode("signup"); setMessage(""); }} className={`rounded-lg px-3 py-2 text-sm font-bold ${mode === "signup" ? "bg-violet-600 text-white" : "text-white/50"}`}>Daftar akun</button>
            </div>
            <form onSubmit={submit} className="space-y-4">
              {mode === "signup" && <label className="block"><span className="mb-2 block text-xs font-bold uppercase tracking-wider text-white/50">Nama</span><input value={name} onChange={e => setName(e.target.value)} className="w-full rounded-xl border border-white/10 bg-black/30 px-4 py-3 outline-none focus:border-violet-400/60" placeholder="Nama Anda" /></label>}
              <label className="block"><span className="mb-2 block text-xs font-bold uppercase tracking-wider text-white/50">Email</span><input type="email" value={email} onChange={e => setEmail(e.target.value)} required className="w-full rounded-xl border border-white/10 bg-black/30 px-4 py-3 outline-none focus:border-violet-400/60" placeholder="nama@email.com" /></label>
              <label className="block"><span className="mb-2 block text-xs font-bold uppercase tracking-wider text-white/50">Password</span><input type="password" value={password} onChange={e => setPassword(e.target.value)} required minLength={8} className="w-full rounded-xl border border-white/10 bg-black/30 px-4 py-3 outline-none focus:border-violet-400/60" placeholder="Minimal 8 karakter" /></label>
              {message && <div className="rounded-xl border border-red-400/20 bg-red-500/10 p-3 text-sm text-red-200">{message}</div>}
              <button disabled={busy} className="w-full rounded-xl bg-violet-600 px-4 py-3 font-black hover:bg-violet-500 disabled:opacity-50">{busy ? "Memproses…" : mode === "signin" ? "Masuk" : "Buat akun"}</button>
              <button type="button" onClick={() => window.location.assign("/")} className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 font-bold text-white/70 hover:bg-white/10">Kembali ke Music</button>
            </form>
          </>
        )}
      </div>
    </main>
  );
}
