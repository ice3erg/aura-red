(function () {
  const U = window.AuraUtils;

  async function applyConnectStatus() {
    const statusNode = document.getElementById("musicStatus");
    const errorBox   = document.getElementById("errorBox");
    const params     = new URLSearchParams(window.location.search);
    const error      = params.get("error");

    if (!statusNode) return;

    const user = await U.fetchMe();
    if (!user) { U.go("/login"); return; }

    if (user.spotifyConnected) {
      statusNode.textContent = `Spotify подключён: ${user.spotifyName || "аккаунт найден"}`;
    } else {
      statusNode.textContent = "Spotify пока не подключён.";
    }

    if (error && errorBox) {
      errorBox.classList.remove("hidden");
      errorBox.textContent = "Ошибка подключения Spotify: " + error;
    }
  }

  async function finishConnectPage() {
    const user = await U.fetchMe();
    if (!user) { U.go("/login"); return; }

    const params = new URLSearchParams(window.location.search);

    // Если пришли токены через URL (пользователь не был залогинен при OAuth)
    // сохраняем spotifyConnected флаг через profile API
    if (params.get("spotifyConnected") === "true") {
      const accessToken  = params.get("accessToken");
      const refreshToken = params.get("refreshToken");
      const spotifyName  = params.get("spotifyName") || "";

      // Если токены переданы через URL — шлём их на сервер
      if (accessToken) {
        await fetch("/api/profile", {
          method:  "PATCH",
          headers: { "Content-Type": "application/json" },
          body:    JSON.stringify({
            spotifyConnected:    true,
            spotifyName,
            spotifyAccessToken:  accessToken,
            spotifyRefreshToken: refreshToken || ""
          })
        });
      }
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

  applyConnectStatus();
})();
