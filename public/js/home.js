(function () {
  const U = window.AuraUtils;
  let progressInterval = null, currentProgressMs = 0, currentDurationMs = 0, isPlaying = false;

  function fmt(ms) {
    if (!ms || ms < 0) return "0:00";
    const s = Math.floor(ms / 1000);
    return Math.floor(s / 60) + ":" + String(s % 60).padStart(2, "0");
  }

  function stopTimer() {
    if (progressInterval) { clearInterval(progressInterval); progressInterval = null; }
  }

  function renderProgress() {
    const fill = document.getElementById("progressFill");
    const tc   = document.getElementById("trackCurrentTime");
    const td   = document.getElementById("trackDuration");
    const dur  = currentDurationMs > 0 ? currentDurationMs : 0;
    const prg  = Math.max(0, Math.min(currentProgressMs, dur));
    const pct  = dur > 0 ? (prg / dur) * 100 : 0;
    if (fill) fill.style.setProperty("--progress-pct", pct.toFixed(1) + "%");
    if (tc) tc.textContent = fmt(prg);
    if (td) td.textContent = fmt(dur);
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
        navigator.geolocation?.getCurrentPosition(res, rej, { timeout: 5000 }) || rej()
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

  function showEmpty(title, text, actionText = "Подключить музыку") {
    stopTimer();
    const empty = document.getElementById("trackEmptyState");
    const card  = document.getElementById("trackCard");
    if (empty) empty.style.display = "flex";
    if (card)  card.classList.add("hidden");
    const t = document.getElementById("spotifyBlockTitle");
    const x = document.getElementById("spotifyBlockText");
    const a = document.getElementById("spotifyAction");
    if (t) t.textContent = title;
    if (x) x.textContent = text;
    if (a) { a.textContent = actionText; a.href = "/connect-music"; }
  }

  function showTrack(track, playing) {
    const empty = document.getElementById("trackEmptyState");
    const card  = document.getElementById("trackCard");
    if (empty) empty.style.display = "none";
    if (card)  card.classList.remove("hidden");

    // Арт + blur-фон
    const img = document.getElementById("trackImage");
    const bg  = document.getElementById("trackBg");
    const ph  = document.getElementById("trackArtPh");
    if (track.image) {
      if (img) { img.src = track.image; img.style.display = ""; }
      if (ph)  ph.style.display = "none";
      if (bg)  bg.style.backgroundImage = `url(${track.image})`;
    } else {
      if (img) img.style.display = "none";
      if (ph)  ph.style.display = "flex";
      if (bg)  bg.style.backgroundImage = "";
    }

    const nm = document.getElementById("trackName");
    const ar = document.getElementById("trackArtists");
    const lk = document.getElementById("trackLink");
    if (nm) nm.textContent = track.name    || "Без названия";
    if (ar) ar.textContent = track.artists || "Неизвестный исполнитель";
    if (lk) {
      if (track.url) { lk.href = track.url; lk.style.display = "flex"; }
      else lk.style.display = "none";
    }

    // Прогресс-бар (только для Spotify у которого есть длительность)
    currentProgressMs = Number(track.progressMs || 0);
    currentDurationMs = Number(track.durationMs || 0);
    isPlaying = !!playing;
    const pw = document.getElementById("progressWrap");
    if (pw) pw.style.display = currentDurationMs > 0 ? "" : "none";
    renderProgress();
    startTimer();

    pushNowPlaying(track);

    // Обновляем ленту активности с актуальным треком
    if (window.__reloadRadarFeed) window.__reloadRadarFeed(track);
  }

  async function loadTrack(user) {
    const notice = document.getElementById("trackNotice");
    if (notice) { notice.textContent = ""; notice.classList.add("hidden"); }

    // Last.fm — приоритет (открытый, без лимитов)
    if (user.lastfmConnected && user.lastfmUsername) {
      showEmpty("Загрузка...", "Получаем трек из Last.fm...", "Переподключить");
      try {
        const r = await fetch(`/api/lastfm/current-track?username=${encodeURIComponent(user.lastfmUsername)}`);
        const d = await r.json();
        if (!r.ok || !d.ok) { showEmpty("Ошибка Last.fm", d.error || "Попробуй позже", "Настройки музыки"); return; }
        if (!d.track || !d.isPlaying) { showEmpty("Ничего не играет", "Включи музыку — трек появится здесь.", "Настройки музыки"); return; }
        showTrack(d.track, true);
      } catch { showEmpty("Ошибка сети", "Не удалось связаться с Last.fm.", "Настройки музыки"); }
      return;
    }

    // Spotify fallback
    if (!user.spotifyConnected) {
      showEmpty("Музыка не подключена", "Подключи Last.fm или Spotify чтобы активировать сигнал.", "Подключить музыку");
      return;
    }
    showEmpty("Загрузка...", "Получаем трек из Spotify...", "Переподключить Spotify");
    try {
      const r = await fetch("/api/spotify/current-track");
      const d = await r.json();
      if (!r.ok || !d.ok) {
        if (r.status === 401) { showEmpty("Сессия Spotify истекла", "Нужно переподключить Spotify.", "Переподключить"); return; }
        showEmpty("Spotify недоступен", d.error || "Трек не удалось получить.", "Переподключить");
        if (d.error && notice) { notice.textContent = d.error; notice.classList.remove("hidden"); }
        return;
      }
      if (!d.track) { showEmpty("Ничего не играет", "Включи музыку в Spotify — трек появится здесь.", "Настройки"); return; }
      showTrack(d.track, d.isPlaying);
    } catch { showEmpty("Ошибка сети", "Не удалось связаться со Spotify.", "Переподключить"); }
  }

  async function init() {
    const user = await U.requireAuth();
    if (!user) return;

    // Identity
    const nm  = document.getElementById("homeName");
    const ct  = document.getElementById("homeCity");
    const av  = document.getElementById("homeAvatar");
    const avp = document.getElementById("homeAvatarPh");
    if (nm) nm.textContent = user.name || "Пользователь";
    if (ct) ct.textContent = user.city ? `📍 ${user.city}` : "";
    if (user.avatar && av) {
      av.src = user.avatar;
      av.style.display = "block";
      if (avp) avp.style.display = "none";
    }

    // Logout
    document.getElementById("logoutBtn")?.addEventListener("click", async () => {
      stopTimer();
      await fetch("/api/auth/logout", { method: "POST" });
      U.go("/login");
    });

    // Mini radar → полная карта (только если подключена музыка)
    document.getElementById("miniMapBtn")?.addEventListener("click", () => {
      const hasMusic = user.lastfmConnected || user.spotifyConnected;
      if (hasMusic) U.go("/map");
    });

    // Показываем/скрываем no-signal overlay на радаре
    const hasMusic = user.lastfmConnected || user.spotifyConnected;
    const noSignalOverlay = document.getElementById("noSignalOverlay");
    const activitySection = document.getElementById("activitySection");
    if (!hasMusic) {
      if (noSignalOverlay) noSignalOverlay.style.display = "flex";
      if (activitySection) activitySection.style.display = "none";
    } else {
      if (noSignalOverlay) noSignalOverlay.style.display = "none";
      if (activitySection) activitySection.style.display = "";
    }

    // Загружаем трек
    loadTrack(user);

    // Обновляем трек каждые 30 сек
    setInterval(() => loadTrack(user), 30000);
  }

  init();
})();
