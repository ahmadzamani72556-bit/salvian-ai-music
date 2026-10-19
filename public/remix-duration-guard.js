(function () {
  if (typeof window === "undefined" || window.__salvianRemixGuardInstalled) return;
  window.__salvianRemixGuardInstalled = true;

  var originalFetch = window.fetch.bind(window);
  var lamePromise = null;

  function loadLame() {
    if (window.lamejs && window.lamejs.Mp3Encoder) return Promise.resolve(window.lamejs);
    if (lamePromise) return lamePromise;
    lamePromise = new Promise(function (resolve, reject) {
      var script = document.createElement("script");
      script.src = "https://cdn.jsdelivr.net/npm/lamejs@1.2.1/lame.min.js";
      script.async = true;
      script.onload = function () {
        if (window.lamejs && window.lamejs.Mp3Encoder) resolve(window.lamejs);
        else reject(new Error("MP3 encoder tidak tersedia."));
      };
      script.onerror = function () { reject(new Error("MP3 encoder gagal dimuat.")); };
      document.head.appendChild(script);
    });
    return lamePromise;
  }

  function decodeAudio(file) {
    var AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return Promise.reject(new Error("Browser tidak mendukung pemrosesan audio."));
    var ctx = new AudioCtx();
    return file.arrayBuffer()
      .then(function (data) { return ctx.decodeAudioData(data.slice(0)); })
      .finally(function () { try { ctx.close(); } catch (_) {} });
  }

  function clamp16(v) {
    var n = Math.round(v * 32767);
    return n < -32768 ? -32768 : n > 32767 ? 32767 : n;
  }

  function encodeMp3(buffer, targetSeconds, lame) {
    var sourceRate = buffer.sampleRate;
    var rate = [32000, 44100, 48000].indexOf(sourceRate) >= 0 ? sourceRate : 44100;
    var channels = Math.min(2, Math.max(1, buffer.numberOfChannels || 1));
    var targetFrames = Math.max(1, Math.ceil(targetSeconds * rate));
    var encoder = new lame.Mp3Encoder(channels, rate, 96);
    var block = 1152;
    var chunks = [];
    var left = buffer.getChannelData(0);
    var right = channels === 2 ? buffer.getChannelData(1) : null;
    var sourceFrames = buffer.length;

    for (var offset = 0; offset < targetFrames; offset += block) {
      var count = Math.min(block, targetFrames - offset);
      var l = new Int16Array(count);
      var r = channels === 2 ? new Int16Array(count) : null;
      for (var i = 0; i < count; i++) {
        var src = offset + i;
        l[i] = src < sourceFrames ? clamp16(left[src]) : 0;
        if (r) r[i] = src < sourceFrames ? clamp16(right[src]) : 0;
      }
      var encoded = r ? encoder.encodeBuffer(l, r) : encoder.encodeBuffer(l);
      if (encoded.length) chunks.push(new Int8Array(encoded));
    }
    var tail = encoder.flush();
    if (tail.length) chunks.push(new Int8Array(tail));
    return new File(chunks, "salvian-remix-10-350.mp3", { type: "audio/mpeg" });
  }

  async function normalizeReferenceFile(file) {
    var buffer = await decodeAudio(file);
    var duration = Number(buffer.duration || 0);
    if (!Number.isFinite(duration) || duration <= 0) throw new Error("Durasi audio tidak dapat dibaca.");
    if (duration < 10) {
      throw new Error("Audio terlalu pendek. Audio Remix harus minimal 10 detik.");
    }

    var target = Math.min(350, Math.max(30, duration));
    var needsReencode = duration > 350 || duration < 30 || file.size > 4 * 1024 * 1024;
    if (!needsReencode) return file;

    var lame = await loadLame();
    var output = encodeMp3(buffer, target, lame);
    if (output.size > 4.4 * 1024 * 1024) {
      // 350 seconds at 96 kbps is normally below the Vercel 4.5 MB function limit.
      throw new Error("Audio Remix hasil pemrosesan masih terlalu besar. Coba gunakan file sumber dengan bitrate lebih rendah.");
    }
    return output;
  }

  window.fetch = async function (input, init) {
    try {
      var url = typeof input === "string" ? input : (input && input.url) || "";
      var method = (init && init.method) || (input && input.method) || "GET";
      var body = init && init.body;
      if (method.toUpperCase() === "POST" && /\/api\/music\/upload(?:\?|$)/.test(url) && body instanceof FormData) {
        var purpose = String(body.get("purpose") || "reference").toLowerCase();
        var engine = String(body.get("engine") || "mureka").toLowerCase();
        var file = body.get("file");
        if (engine === "mureka" && purpose === "reference" && file instanceof File) {
          var normalized = await normalizeReferenceFile(file);
          if (normalized !== file) {
            var next = new FormData();
            body.forEach(function (value, key) {
              next.append(key, key === "file" ? normalized : value);
            });
            init = Object.assign({}, init, { body: next });
          }
        }
      }
    } catch (error) {
      return Promise.reject(error);
    }
    return originalFetch(input, init);
  };
})();
