(function () {
  const { getCurrentUser, updateCurrentUser, go } = window.AuraUtils;

  const user = getCurrentUser();
  if (!user) { go("/login"); return; }

  // Элементы
  const form             = document.getElementById("profileForm");
  const notice           = document.getElementById("profileNotice");
  const avatarInput      = document.getElementById("avatarInput");
  const avatarPreview    = document.getElementById("avatarPreview");
  const avatarPlaceholder = document.getElementById("avatarPlaceholder");
  const removeAvatarBtn  = document.getElementById("removeAvatarBtn");

  const fieldName = document.getElementById("fieldName");
  const fieldAge  = document.getElementById("fieldAge");
  const fieldCity = document.getElementById("fieldCity");
  const fieldBio  = document.getElementById("fieldBio");

  // Заполняем поля из текущего пользователя
  fieldName.value = user.name || "";
  fieldAge.value  = user.age  || "";
  fieldCity.value = user.city || "";
  fieldBio.value  = user.bio  || "";

  // Показываем аватар если есть
  function showAvatar(src) {
    avatarPreview.src = src;
    avatarPreview.classList.remove("hidden");
    avatarPlaceholder.classList.add("hidden");
    removeAvatarBtn.classList.remove("hidden");
  }

  function showPlaceholder() {
    avatarPreview.src = "";
    avatarPreview.classList.add("hidden");
    avatarPlaceholder.classList.remove("hidden");
    removeAvatarBtn.classList.add("hidden");
  }

  if (user.avatar) {
    showAvatar(user.avatar);
  }

  // Загрузка фото — конвертируем в base64
  avatarInput.addEventListener("change", (e) => {
    const file = e.target.files[0];
    if (!file) return;

    if (file.size > 3 * 1024 * 1024) {
      showNoticeMsg("Фото слишком большое. Максимум 3 МБ.", "error");
      return;
    }

    const reader = new FileReader();
    reader.onload = (ev) => {
      showAvatar(ev.target.result);
    };
    reader.readAsDataURL(file);
  });

  // Удалить аватар
  removeAvatarBtn.addEventListener("click", () => {
    showPlaceholder();
    avatarInput.value = "";
  });

  // Уведомления
  function showNoticeMsg(text, type = "error") {
    notice.textContent = text;
    notice.className = "notice " + type;
  }

  function hideNoticeMsg() {
    notice.textContent = "";
    notice.className = "notice hidden";
  }

  // Сохранение
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    hideNoticeMsg();

    const name = fieldName.value.trim();
    const age  = fieldAge.value.trim();
    const city = fieldCity.value.trim();
    const bio  = fieldBio.value.trim();

    if (!name) {
      showNoticeMsg("Введи имя.");
      return;
    }
    if (!city) {
      showNoticeMsg("Введи город.");
      return;
    }

    // Аватар: если preview видим — берём его src (base64), иначе null = удалить
    let avatar = user.avatar || null;
    if (!avatarPreview.classList.contains("hidden")) {
      avatar = avatarPreview.src || null;
    } else {
      avatar = null;
    }

    updateCurrentUser({ name, age, city, bio, avatar });

    showNoticeMsg("Профиль сохранён!", "success");

    // Через 1.5с возвращаем на главную
    setTimeout(() => { go("/home"); }, 1500);
  });
})();
