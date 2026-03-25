(function () {
  const U = window.AuraUtils;

  async function applyConnectStatus() {
    const statusNode = document.getElementById("musicStatus");
    const errorBox   = document.getElementById("errorBox");
    if (!statusNode) return;
    const user = await U.fetchMe();
    if (!user) { U.go("/login"); return; }
    statusNode.textContent = user.spotifyConnected
      ? `Spotify подключён: ${user.spotifyName || "аккаунт найден"}`
      : "Spotify пока не подключён.";
    const err = new URLSearchParams(location.search).get("error");
    if (err && errorBox) {
      errorBox.classList.remove("hidden");
      errorBox.textContent = "Ошибка подключения Spotify: " + err;
    }
  }

  async function finishConnectPage() {
    const user = await U.fetchMe();
    if (!user) { U.go("/login"); return; }
    const params = new URLSearchParams(location.search);
    if (params.get("spotifyConnected") === "true") {
      const accessToken  = params.get("accessToken");
      const refreshToken = params.get("refreshToken");
      const spotifyName  = params.get("spotifyName") || "";
      if (accessToken) {
        await fetch("/api/profile", {
          method: "PATCH", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            spotifyConnected: true, spotifyName,
            spotifyAccessToken: accessToken, spotifyRefreshToken: refreshToken || ""
          })
        });
      }
    }
    const nameText = document.getElementById("spotifyNameText");
    const spotName = params.get("spotifyName");
    if (nameText) nameText.textContent = spotName ? `Подключён аккаунт: ${spotName}` : "Подключение прошло успешно.";
    const btn = document.getElementById("continueBtn");
    if (btn) btn.addEventListener("click", () => U.go("/home"));
  }

  window.AuraMusic = { applyConnectStatus, finishConnectPage };
  applyConnectStatus();
})();
