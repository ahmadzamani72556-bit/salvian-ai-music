import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const file = path.join(root, "app", "page.tsx");
let source = fs.readFileSync(file, "utf8");

const oldBlock = `      const res = await fetch(\`${AUTH}/sign-in/email\`, { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: authEmail.trim(), password: authPassword }) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.message || data.error || "Login gagal. Periksa email dan password.");`;

const newBlock = `      const authClient = neon.auth as unknown as { signIn?: { email?: (input: { email: string; password: string }) => Promise<{ data?: unknown; error?: { message?: string } | null }> } };
      const signInEmail = authClient.signIn?.email;
      if (typeof signInEmail !== "function") throw new Error("Metode login Neon Auth tidak tersedia pada SDK saat ini.");
      const result = await signInEmail({ email: authEmail.trim(), password: authPassword });
      if (result?.error) throw new Error(result.error.message || "Login gagal. Periksa email dan password.");`;

if (source.includes(newBlock)) process.exit(0);
if (!source.includes(oldBlock)) {
  throw new Error("Target login block tidak ditemukan; build dihentikan agar tidak mengubah source secara salah.");
}

source = source.replace(oldBlock, newBlock);
fs.writeFileSync(file, source);
console.log("SALVIAN AUTH: switched Music login to neon.auth.signIn.email");
