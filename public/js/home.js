(function () {
  const {
    getCurrentUser,
    clearSession,
    go
  } = window.AuraUtils;

  const user = getCurrentUser();

  if (!user) {
    go("/login");
  }

  const homeName = document.getElementById("homeName");
  const homeCity = document.getElementById("homeCity");
  const homeBio = document.getElementById("homeBio");
  const spotifyBlockTitle = document.getElementById("spotifyBlockTitle");
  const spotifyBlockText = document.getElementById("spotifyBlockText");
  const spotifyAction = document.getElementById("spotifyAction");
  const logoutBtn = document.getElementById("logoutBtn");

  if (user && homeName) homeName.textContent = user.name || "Пользователь";
  if (user && homeCity) homeCity.textContent = user.city || "Город не указан";
  if (user && homeBio) homeBio.textContent = user.bio || "О себе пока ничего не указано.";

  if (user?.spotifyConnected) {
    spotifyBlockTitle.textContent = "Spotify подключён";
    spotifyBlockText.textContent = user.spotifyName
      ? `Подключённый аккаунт: ${user.spotifyName}`
      : "Музыкальный аккаунт подключён.";
    spotifyAction.textContent = "Переподключить Spotify";
  } else {
    spotifyBlockTitle.textContent = "Spotify не подключён";
    spotifyBlockText.textContent = "Подключи Spotify, чтобы активировать музыкальный сигнал.";
    spotifyAction.textContent = "Подключить Spotify";
  }

  if (logoutBtn) {
    logoutBtn.addEventListener("click", () => {
      clearSession();
      go("/login");
    });
  }
})();
