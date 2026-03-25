(function () {
  const U = window.AuraUtils;

  // ── connect-music.html — Last.fm кнопка ───────────────
  const lastfmBtn = document.getElementById("lastfmConnectBtn");
  if (lastfmBtn) {
    lastfmBtn.addEventListener("click", async () => {
      const input    = document.getElementById("lastfmUsername");
      const errorBox = document.getElementById("errorBox");
      const username = (input?.value || "").trim().toLowerCase();

      if (!username) {
        if (errorBox) { errorBox.textContent = "Введи Last.fm username."; errorBox.classList.remove("hidden"); }
        return;
      }

      if (errorBox) errorBox.classList.add("hidden");
      lastfmBtn.disabled = true;
      lastfmBtn.textContent = "Проверяем...";

      try {
        // Проверяем что такой пользователь существует
        const check = await fetch(`/api/lastfm/current-track?username=${encodeURIComponent(username)}`);
        const data  = await check.json();

        if (!check.ok || !data.ok) {
          if (errorBox) {
            errorBox.textContent = data.error || "Пользователь Last.fm не найден. Проверь username.";
            errorBox.classList.remove("hidden");
          }
          lastfmBtn.disabled = false;
          lastfmBtn.textContent = "Подключить Last.fm";
          return;
        }

        // Сохраняем username в профиль
        const updated = await U.updateCurrentUser({
          lastfmConnected: true,
          lastfmUsername:  username
        });

        if (updated) {
          U.go("/home");
        } else {
          if (errorBox) { errorBox.textContent = "Ошибка сохранения. Попробуй ещё раз."; errorBox.classList.remove("hidden"); }
          lastfmBtn.disabled = false;
          lastfmBtn.textContent = "Подключить Last.fm";
        }
      } catch (e) {
        if (errorBox) { errorBox.textContent = "Ошибка сети. Попробуй ещё раз."; errorBox.classList.remove("hidden"); }
        lastfmBtn.disabled = false;
        lastfmBtn.textContent = "Подключить Last.fm";
      }
    });
  }

  // ── connect-music.html — статус ────────────────────────
  async function applyConnectStatus() {
    const statusNode = document.getElementById("musicStatus");
    if (!statusNode) return;

    const user = await U.fetchMe();
    if (!user) { U.go("/login"); return; }

    if (user.lastfmConnected && user.lastfmUsername) {
      statusNode.textContent = `Last.fm подключён: ${user.lastfmUsername}`;
    } else if (user.spotifyConnected) {
      statusNode.textContent = `Spotify подключён: ${user.spotifyName || "аккаунт найден"}`;
    } else {
      statusNode.textContent = "Музыка пока не подключена.";
    }

    const err = new URLSearchParams(location.search).get("error");
    const errorBox = document.getElementById("errorBox");
    if (err && errorBox) {
      errorBox.classList.remove("hidden");
      errorBox.textContent = "Ошибка: " + decodeURIComponent(err);
    }
  }

  // ── connect-success.html (Spotify fallback) ────────────
  async function finishConnectPage() {
    const user = await U.fetchMe();
    if (!user) { U.go("/login"); return; }

    const params = new URLSearchParams(location.search);
    if (params.get("spotifyConnected") === "true" && params.get("accessToken")) {
      await fetch("/api/profile", {
        method:  "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          spotifyConnected:    true,
          spotifyName:         params.get("spotifyName")  || "",
          spotifyId:           params.get("spotifyId")    || "",
          spotifyAccessToken:  params.get("accessToken"),
          spotifyRefreshToken: params.get("refreshToken") || ""
        })
      });
    }

    const nameText = document.getElementById("spotifyNameText");
    const spotName = params.get("spotifyName");
    if (nameText) {
      nameText.textContent = spotName
        ? `Подключён аккаунт: ${spotName}`
        : "Подключение прошло успешно.";
    }

    const btn = document.getElementById("continueBtn");
    if (btn) btn.addEventListener("click", () => U.go("/home"));
  }

  window.AuraMusic = { applyConnectStatus, finishConnectPage };

  if (document.getElementById("musicStatus")) applyConnectStatus();
})();
