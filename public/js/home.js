(function () {
  const U = window.AuraUtils;

  let progressInterval  = null;
  let currentProgressMs = 0;
  let currentDurationMs = 0;
  let isCurrentlyPlaying = false;

  function formatTime(ms) {
    if (!ms || ms < 0) return "0:00";
    const s = Math.floor(ms / 1000);
    return Math.floor(s / 60) + ":" + String(s % 60).padStart(2, "0");
  }

  function stopProgressTimer() {
    if (progressInterval) { clearInterval(progressInterval); progressInterval = null; }
  }

  function renderProgress() {
    const trackProgress    = document.getElementById("trackProgress");
    const trackCurrentTime = document.getElementById("trackCurrentTime");
    const trackDuration    = document.getElementById("trackDuration");
    if (!trackProgress || !trackCurrentTime || !trackDuration) return;

    const duration = currentDurationMs > 0 ? currentDurationMs : 0;
    const progress = Math.max(0, Math.min(currentProgressMs, duration));
    const percent  = duration > 0 ? (progress / duration) * 100 : 0;

    trackProgress.value = String(percent);
    const track = trackProgress.closest(".player-progress-track");
    if (track) track.style.setProperty("--progress-pct", percent.toFixed(1) + "%");
    trackCurrentTime.textContent = formatTime(progress);
    trackDuration.textContent    = formatTime(duration);
  }

  function startProgressTimer() {
    stopProgressTimer();
    if (!isCurrentlyPlaying || !currentDurationMs) return;
    progressInterval = setInterval(() => {
      currentProgressMs += 1000;
      if (currentProgressMs >= currentDurationMs) { currentProgressMs = currentDurationMs; stopProgressTimer(); }
      renderProgress();
    }, 1000);
  }

  function showNotice(text) {
    const el = document.getElementById("trackNotice");
    if (!el) return;
    el.textContent = text;
    el.classList.remove("hidden");
  }

  function hideNotice() {
    const el = document.getElementById("trackNotice");
    if (!el) return;
    el.textContent = "";
    el.classList.add("hidden");
  }

  function showEmpty(title, text, actionText = "Подключить Spotify") {
    stopProgressTimer();
    const es = document.getElementById("trackEmptyState");
    const tc = document.getElementById("trackCard");
    if (es) es.classList.remove("hidden");
    if (tc) tc.classList.add("hidden");
    const t  = document.getElementById("spotifyBlockTitle");
    const tx = document.getElementById("spotifyBlockText");
    const a  = document.getElementById("spotifyAction");
    if (t)  t.textContent  = title;
    if (tx) tx.textContent = text;
    if (a)  a.textContent  = actionText;
  }

  function showTrack(track, isPlaying) {
    if (!track) return;
    const es = document.getElementById("trackEmptyState");
    const tc = document.getElementById("trackCard");
    if (es) es.classList.add("hidden");
    if (tc) tc.classList.remove("hidden");

    const img = document.getElementById("trackImage");
    const nm  = document.getElementById("trackName");
    const ar  = document.getElementById("trackArtists");
    const lk  = document.getElementById("trackLink");
    if (img) { img.src = track.image || ""; img.alt = track.name || ""; }
    if (nm)  nm.textContent  = track.name    || "Без названия";
    if (ar)  ar.textContent  = track.artists || "Неизвестный исполнитель";
    if (lk) {
      if (track.url) { lk.href = track.url; lk.classList.remove("hidden"); }
      else             lk.classList.add("hidden");
    }

    currentProgressMs  = Number(track.progressMs  || 0);
    currentDurationMs  = Number(track.durationMs  || 0);
    isCurrentlyPlaying = !!isPlaying;
    renderProgress();
    startProgressTimer();
  }

  async function loadCurrentTrack(user) {
    hideNotice();
    if (!user.spotifyConnected) {
      showEmpty("Spotify не подключён", "Подключи Spotify, чтобы активировать музыкальный сигнал.");
      return;
    }

    showEmpty("Загрузка трека...", "Получаем текущий трек из Spotify.", "Переподключить Spotify");

    try {
      // Токены теперь на сервере — просто делаем запрос
      const res  = await fetch("/api/spotify/current-track");
      const data = await res.json();

      if (!res.ok || !data.ok) {
        if (res.status === 401) {
          showEmpty("Сессия Spotify истекла", "Нужно заново подключить Spotify.", "Переподключить Spotify");
          return;
        }
        showEmpty("Не удалось получить трек", "Spotify подключён, но трек сейчас недоступен.", "Переподключить Spotify");
        if (data.error) showNotice(data.error);
        return;
      }

      if (!data.track) {
        showEmpty("Сейчас ничего не играет", "Включи музыку в Spotify — трек появится здесь.", "Переподключить Spotify");
        return;
      }

      showTrack(data.track, data.isPlaying);
    } catch (err) {
      showEmpty("Ошибка загрузки", "Не удалось связаться со Spotify.", "Переподключить Spotify");
      showNotice("Ошибка при загрузке текущего трека.");
      console.error(err);
    }
  }

  async function init() {
    const user = await U.requireAuth();
    if (!user) return;

    // Заполняем UI
    const nm = document.getElementById("homeName");
    const ct = document.getElementById("homeCity");
    const bi = document.getElementById("homeBio");
    if (nm) nm.textContent = user.name || "Пользователь";
    if (ct) ct.textContent = user.city || "Город не указан";
    if (bi) bi.textContent = user.bio  || "О себе пока ничего не указано.";

    const homeAvatar      = document.getElementById("homeAvatar");
    const homeAvatarPlaceholder = document.getElementById("homeAvatarPlaceholder");
    if (user.avatar && homeAvatar) {
      homeAvatar.src = user.avatar;
      homeAvatar.style.display = "block";
      if (homeAvatarPlaceholder) homeAvatarPlaceholder.style.display = "none";
    }

    const logoutBtn = document.getElementById("logoutBtn");
    if (logoutBtn) {
      logoutBtn.addEventListener("click", async () => {
        stopProgressTimer();
        await U.clearSession();
        U.go("/login");
      });
    }

    loadCurrentTrack(user);
  }

  init();
})();
