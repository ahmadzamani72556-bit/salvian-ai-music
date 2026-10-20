import fs from "node:fs";
import path from "node:path";

const file = path.join(process.cwd(), "app", "api", "music", "route.ts");
let source = fs.readFileSync(file, "utf8");

// Normalize the status query and add a history fallback. The provider's current
// query endpoint expects a comma-separated string; if that endpoint rejects a
// valid song id, the account song-history endpoint can still resolve the same
// completed/processing song without changing the generation flow.
const old = 'const q = await sunoRequest(SUNO_STATUS_PATH, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ song_ids: [taskId], model: "suno-v6" }) });';
const oldString = 'const q = await sunoRequest(SUNO_STATUS_PATH, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ song_ids: taskId, model: "suno-v6" }) });';
const replacement = `let q = await sunoRequest(SUNO_STATUS_PATH, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ song_ids: String(taskId), model: "suno-v6" }) });
      if (!q.response.ok) {
        const history = await sunoRequest("/api/music/songs", { method: "GET" });
        if (history.response.ok) {
          const rawSongs = Array.isArray(history.data) ? history.data : ((history.data as any)?.data || (history.data as any)?.songs || (history.data as any)?.results || []);
          const songs = Array.isArray(rawSongs) ? rawSongs : [];
          const match = songs.find((song: any) => String(song?.song_id || song?.songId || song?.id || "").trim() === String(taskId).trim());
          if (match) {
            q = { response: new Response(JSON.stringify([match]), { status: 200, headers: { "Content-Type": "application/json" } }), data: [match] };
          }
        }
      }`;

if (source.includes(old)) {
  source = source.replace(old, replacement);
} else if (source.includes(oldString)) {
  source = source.replace(oldString, replacement);
} else if (source.includes('let q = await sunoRequest(SUNO_STATUS_PATH')) {
  throw new Error("Suno status query already patched but fallback marker was not found; refusing to alter unknown route shape.");
} else {
  throw new Error("Suno status query anchor not found; refusing to patch an unknown route shape.");
}

if (!source.includes('sunoRequest("/api/music/songs", { method: "GET" })')) {
  throw new Error("Suno status fallback verification failed.");
}

fs.writeFileSync(file, source, "utf8");
console.log("Suno status hardened: string song_ids + account-song-history fallback applied.");
