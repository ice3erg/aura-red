(function () {
  const {
    getCurrentUser,
    clearSession,
    go
  } = window.AuraUtils;

  const user = getCurrentUser();

  if (!user) {
    go("/login");
    return;
  }

  const homeName = document.getElementById("homeName");
  const homeCity = document.getElementById("homeCity");
  const homeBio = document.getElementById("homeBio");
  const spotifyBlockTitle = document.getElementById("spotifyBlockTitle");
  const spotifyBlockText = document.getElementById("spotifyBlockText");
  const spotifyAction = document.getElementById("spotifyAction");
  const logoutBtn = document.getElementById("logoutBtn");

  const trackEmptyState = document.getElementById("trackEmptyState");
  const trackCard = document.getElementById("trackCard");
  const trackImage = document.getElementById("trackImage");
  const trackName = document.getElementById("trackName");
  const trackArtists = document.getElementById("trackArtists");
  const trackLink = document.getElementById("trackLink");
  const trackNotice = document.getElementById("trackNotice");

  if (homeName) homeName.textContent = user.name || "Пользователь";
  if (homeCity) homeCity.textContent = user.city || "Город не указан";
  if (homeBio) homeBio.textContent = user.bio || "О себе пока ничего не указано.";

  function showNotice(text) {
    if (!trackNotice) return;
    trackNotice.textContent = text;
    trackNotice.classList.remove("hidden");
  }

  function hideNotice() {
    if (!trackNotice) return;
    trackNotice.textContent = "";
    trackNotice.classList.add("hidden");
  }

  function showEmpty(title, text, actionText = "Подключить Spotify") {
    if (trackEmptyState) trackEmptyState.classList.remove("hidden");
    if (trackCard) trackCard.classList.add("hidden");

    if (spotifyBlockTitle) spotifyBlockTitle.textContent = title;
    if (spotifyBlockText) spotifyBlockText.textContent = text;
    if (spotifyAction) spotifyAction.textContent = actionText;
  }

  function showTrack(track) {
    if (!track) return;

    if (trackEmptyState) trackEmptyState.classList.add("hidden");
    if (trackCard) trackCard.classList.remove("hidden");

    if (trackImage) {
      trackImage.src = track.image || "";
      trackImage.alt = track.name || "Обложка трека";
    }

    if (trackName) trackName.textContent = track.name || "Без названия";
    if (trackArtists) trackArtists.textContent = track.artists || "Неизвестный исполнитель";

    if (trackLink) {
      if (track.url) {
        trackLink.href = track.url;
        trackLink.classList.remove("hidden");
      } else {
        trackLink.classList.add("hidden");
      }
    }
  }

  async function loadCurrentTrack() {
    hideNotice();

    if (!user.spotifyConnected) {
      showEmpty(
        "Spotify не подключён",
        "Подключи Spotify, чтобы активировать музыкальный сигнал."
      );
      return;
    }

    const accessToken = localStorage.getItem("spotifyAccessToken");

    if (!accessToken) {
      showEmpty(
        "Spotify подключён не полностью",
        "Нужно переподключить Spotify, чтобы получить доступ к трекам.",
        "Переподключить Spotify"
      );
      return;
    }

    try {
      showEmpty(
        "Загрузка трека...",
        "Пробуем получить текущий трек из Spotify.",
        "Переподключить Spotify"
      );

      const res = await fetch(
        `/api/spotify/current-track?accessToken=${encodeURIComponent(accessToken)}`
      );

      const data = await res.json();

      if (!res.ok || !data.ok) {
        if (res.status === 401) {
          showEmpty(
            "Сессия Spotify истекла",
            "Нужно заново подключить Spotify.",
            "Переподключить Spotify"
          );
          return;
        }

        showEmpty(
          "Не удалось получить трек",
          "Spotify подключён, но текущий трек сейчас недоступен.",
          "Переподключить Spotify"
        );

        if (data.error) {
          showNotice(data.error);
        }
        return;
      }

      if (!data.isPlaying || !data.track) {
        showEmpty(
          "Сейчас ничего не играет",
          "Включи музыку в Spotify, и трек появится здесь.",
          "Переподключить Spotify"
        );
        return;
      }

      showTrack(data.track);
    } catch (error) {
      showEmpty(
        "Ошибка загрузки",
        "Не удалось связаться со Spotify.",
        "Переподключить Spotify"
      );
      showNotice("Ошибка при загрузке текущего трека.");
      console.error(error);
    }
  }

  if (logoutBtn) {
    logoutBtn.addEventListener("click", () => {
      clearSession();
      go("/login");
    });
  }

  loadCurrentTrack();
})();
