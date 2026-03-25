(function () {
  const U = window.AuraUtils;
  let progressInterval = null, currentProgressMs = 0, currentDurationMs = 0, isPlaying = false;

  function fmt(ms) {
    if (!ms || ms < 0) return "0:00";
    const s = Math.floor(ms / 1000);
    return Math.floor(s / 60) + ":" + String(s % 60).padStart(2, "0");
  }

  function stopTimer() { if (progressInterval) { clearInterval(progressInterval); progressInterval = null; } }

  function renderProgress() {
    const tp = document.getElementById("trackProgress");
    const tc = document.getElementById("trackCurrentTime");
    const td = document.getElementById("trackDuration");
    if (!tp || !tc || !td) return;
    const dur = currentDurationMs > 0 ? currentDurationMs : 0;
    const prg = Math.max(0, Math.min(currentProgressMs, dur));
    const pct = dur > 0 ? (prg / dur) * 100 : 0;
    tp.value = String(pct);
    const track = tp.closest(".player-progress-track");
    if (track) track.style.setProperty("--progress-pct", pct.toFixed(1) + "%");
    tc.textContent = fmt(prg);
    td.textContent = fmt(dur);
  }

  function startTimer() {
    stopTimer();
    if (!isPlaying || !currentDurationMs) return;
    progressInterval = setInterval(() => {
      currentProgressMs += 1000;
      if (currentProgressMs >= currentDurationMs) { currentProgressMs = currentDurationMs; stopTimer(); }
      renderProgress();
    }, 1000);
  }

  // Пушим трек на сервер + геолокация → появляемся на радаре других
  async function pushNowPlaying(track) {
    if (!track) return;
    try {
      const pos = await new Promise((res, rej) =>
        navigator.geolocation?.getCurrentPosition(res, rej, { timeout:5000 }) || rej()
      ).catch(() => null);
      await fetch("/api/now-playing", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          track:  track.name    || "",
          artist: track.artists || "",
          album:  track.album   || "",
          image:  track.image   || "",
          url:    track.url     || "",
          source: track.source  || "spotify",
          lat:    pos ? pos.coords.latitude  : null,
          lng:    pos ? pos.coords.longitude : null,
        })
      });
    } catch (_) {}
  }

  function showEmpty(title, text, action = "Подключить музыку") {
    stopTimer();
    document.getElementById("trackEmptyState")?.classList.remove("hidden");
    document.getElementById("trackCard")?.classList.add("hidden");
    const t = document.getElementById("spotifyBlockTitle");
    const x = document.getElementById("spotifyBlockText");
    const a = document.getElementById("spotifyAction");
    if (t) t.textContent = title;
    if (x) x.textContent = text;
    if (a) a.textContent = action;
  }

  function showTrack(track, playing) {
    document.getElementById("trackEmptyState")?.classList.add("hidden");
    document.getElementById("trackCard")?.classList.remove("hidden");
    const img = document.getElementById("trackImage");
    if (img) { img.src = track.image || ""; img.alt = track.name || ""; }
    const nm = document.getElementById("trackName");
    const ar = document.getElementById("trackArtists");
    const lk = document.getElementById("trackLink");
    if (nm) nm.textContent = track.name    || "Без названия";
    if (ar) ar.textContent = track.artists || "Неизвестный исполнитель";
    if (lk) { if (track.url) { lk.href = track.url; lk.classList.remove("hidden"); } else lk.classList.add("hidden"); }
    currentProgressMs = Number(track.progressMs || 0);
    currentDurationMs = Number(track.durationMs || 0);
    isPlaying = !!playing;
    renderProgress();
    startTimer();
    pushNowPlaying(track);
  }

  async function loadTrack(user) {
    const notice = document.getElementById("trackNotice");
    if (notice) { notice.textContent = ""; notice.classList.add("hidden"); }

    // Last.fm — приоритет
    if (user.lastfmConnected && user.lastfmUsername) {
      showEmpty("Загрузка трека...", "Получаем трек из Last.fm...", "Переподключить музыку");
      try {
        const r = await fetch(`/api/lastfm/current-track?username=${encodeURIComponent(user.lastfmUsername)}`);
        const d = await r.json();
        if (!r.ok || !d.ok) { showEmpty("Не удалось получить трек", d.error||"Ошибка Last.fm.", "Подключить музыку"); return; }
        if (!d.track || !d.isPlaying) { showEmpty("Сейчас ничего не играет", "Включи музыку — трек появится здесь.", "Подключить музыку"); return; }
        showTrack(d.track, true);
      } catch (e) { showEmpty("Ошибка загрузки", "Не удалось связаться с Last.fm.", "Подключить музыку"); }
      return;
    }

    // Spotify fallback
    if (!user.spotifyConnected) {
      showEmpty("Музыка не подключена", "Подключи Last.fm или Spotify, чтобы активировать музыкальный сигнал.", "Подключить музыку");
      return;
    }
    showEmpty("Загрузка трека...", "Получаем текущий трек из Spotify.", "Переподключить Spotify");
    try {
      const r = await fetch("/api/spotify/current-track");
      const d = await r.json();
      if (!r.ok || !d.ok) {
        if (r.status === 401) { showEmpty("Сессия Spotify истекла", "Нужно заново подключить Spotify.", "Переподключить Spotify"); return; }
        showEmpty("Не удалось получить трек", "Spotify подключён, но трек недоступен.", "Переподключить Spotify");
        if (d.error && notice) { notice.textContent = d.error; notice.classList.remove("hidden"); }
        return;
      }
      if (!d.track) { showEmpty("Сейчас ничего не играет", "Включи музыку в Spotify — трек появится здесь.", "Переподключить Spotify"); return; }
      showTrack(d.track, d.isPlaying);
    } catch (e) { showEmpty("Ошибка загрузки", "Не удалось связаться со Spotify.", "Переподключить Spotify"); }
  }

  async function init() {
    const user = await U.requireAuth();
    if (!user) return;

    const nm = document.getElementById("homeName");
    const ct = document.getElementById("homeCity");
    const bi = document.getElementById("homeBio");
    if (nm) nm.textContent = user.name || "Пользователь";
    if (ct) ct.textContent = user.city || "Город не указан";
    if (bi) bi.textContent = user.bio  || "";

    const av  = document.getElementById("homeAvatar");
    const avp = document.getElementById("homeAvatarPlaceholder");
    if (user.avatar && av) { av.src = user.avatar; av.style.display = "block"; if (avp) avp.style.display = "none"; }

    document.getElementById("logoutBtn")?.addEventListener("click", async () => {
      stopTimer(); await U.clearSession(); U.go("/login");
    });

    document.getElementById("miniMapBtn")?.addEventListener("click", () => U.go("/map"));

    loadTrack(user);
  }

  init();
})();
