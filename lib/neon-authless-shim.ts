// SALVIAN AI MUSIC deliberately has no login/authentication flow.
// This compatibility shim keeps legacy client components working without
// connecting to Neon Auth. It creates a local, anonymous workspace identity
// stored only in the browser so Library/task ownership can continue to work.

const STORAGE_KEY = "salvian_music_workspace_id";

function base64Url(value: unknown) {
  const json = JSON.stringify(value);
  if (typeof window === "undefined") return Buffer.from(json).toString("base64url");
  return btoa(unescape(encodeURIComponent(json)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function randomId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, c => {
    const r = Math.random() * 16 | 0;
    const v = c === "x" ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

function workspaceId() {
  if (typeof window === "undefined") return "00000000-0000-4000-8000-000000000000";
  let id = window.localStorage.getItem(STORAGE_KEY);
  if (!id) {
    id = randomId();
    window.localStorage.setItem(STORAGE_KEY, id);
  }
  return id;
}

function anonymousJwt() {
  const id = workspaceId();
  return `${base64Url({ alg: "none", typ: "JWT" })}.${base64Url({ sub: id, anonymous: true })}.anonymous`;
}

export function BetterAuthVanillaAdapter() {
  return {};
}

export function createClient(_options?: unknown) {
  const user = () => ({ id: workspaceId(), name: "Music Workspace", email: null, anonymous: true });
  return {
    auth: {
      async getSession() {
        return { data: { user: user() } };
      },
      async getJWTToken(_allowAnonymous = true) {
        return anonymousJwt();
      },
      async signIn() {
        return { data: { user: user() }, error: null };
      },
      async signOut() {
        return { error: null };
      },
    },
  } as any;
}
