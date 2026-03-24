(function () {
  const {
    getCurrentUser,
    updateCurrentUser,
    go
  } = window.AuraUtils;

  const currentUser = getCurrentUser();

  function applyConnectStatus() {
    const statusNode = document.getElementById("musicStatus");
    const errorBox = document.getElementById("errorBox");
    const params = new URLSearchParams(window.location.search);
    const error = params.get("error");

    if (!statusNode) return;

    if (!currentUser) {
      statusNode.textContent = "Сначала нужно войти в аккаунт.";
      return;
    }

    if (currentUser.spotifyConnected) {
      statusNode.textContent = `Spotify уже подключён: ${currentUser.spotifyName || "аккаунт найден"}`;
    } else {
      statusNode.textContent = "Spotify пока не подключён.";
    }

    if (error && errorBox) {
      errorBox.classList.remove("hidden");
      errorBox.textContent = "Ошибка подключения Spotify: " + error;
    }
  }

  function finishConnectPage() {
    if (!currentUser) {
      go("/login");
      return;
    }

    const params = new URLSearchParams(window.location.search);
    const spotifyConnected = params.get("spotifyConnected");
    const spotifyName = params.get("spotifyName");
    const spotifyId = params.get("spotifyId");
    const accessToken = params.get("accessToken");
    const refreshToken = params.get("refreshToken");

    if (spotifyConnected === "true") {
      updateCurrentUser({
        spotifyConnected: true,
        spotifyName: spotifyName || "",
        spotifyId: spotifyId || ""
      });

      localStorage.setItem("spotifyAccessToken", accessToken || "");
      localStorage.setItem("spotifyRefreshToken", refreshToken || "");
    }

    const nameText = document.getElementById("spotifyNameText");
    if (nameText) {
      nameText.textContent = spotifyName
        ? `Подключён аккаунт: ${spotifyName}`
        : "Подключение прошло успешно.";
    }

    const btn = document.getElementById("continueBtn");
    if (btn) {
      btn.addEventListener("click", () => {
        go("/home");
      });
    }
  }

  window.AuraMusic = {
    applyConnectStatus,
    finishConnectPage
  };

  applyConnectStatus();
})();
