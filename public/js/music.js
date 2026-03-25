(function () {
  const U = window.AuraUtils;

  // ── connect-music.html ─────────────────────────────────
  async function applyConnectStatus() {
    const statusNode = document.getElementById("musicStatus");
    if (!statusNode) return; // не на этой странице

    const errorBox = document.getElementById("errorBox");
    const user = await U.fetchMe();
    if (!user) { U.go("/login"); return; }

    statusNode.textContent = user.spotifyConnected
      ? `Spotify подключён: ${user.spotifyName || "аккаунт найден"}`
      : "Spotify пока не подключён.";

    const err = new URLSearchParams(location.search).get("error");
    if (err && errorBox) {
      errorBox.classList.remove("hidden");
      errorBox.textContent = "Ошибка подключения Spotify: " + decodeURIComponent(err);
    }
  }

  // ── connect-success.html ───────────────────────────────
  async function finishConnectPage() {
    const user = await U.fetchMe();
    if (!user) { U.go("/login"); return; }

    const params = new URLSearchParams(location.search);

    // Случай когда сессия была, но токены не сохранились на сервере
    // (пользователь не был залогинен в момент OAuth) — сохраняем через API
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

  // Авто-вызов только на connect-music
  if (document.getElementById("musicStatus")) {
    applyConnectStatus();
  }
})();
