(function () {
  const U = window.AuraUtils;

  async function init() {
    const user = await U.requireAuth();
    if (!user) return;

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

    fieldName.value = user.name || "";
    fieldAge.value  = user.age  || "";
    fieldCity.value = user.city || "";
    fieldBio.value  = user.bio  || "";

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

    if (user.avatar) showAvatar(user.avatar);

    avatarInput.addEventListener("change", (e) => {
      const file = e.target.files[0];
      if (!file) return;
      if (file.size > 3 * 1024 * 1024) {
        showMsg("Фото слишком большое. Максимум 3 МБ.", "error");
        return;
      }
      const reader = new FileReader();
      reader.onload = (ev) => showAvatar(ev.target.result);
      reader.readAsDataURL(file);
    });

    removeAvatarBtn.addEventListener("click", () => {
      showPlaceholder();
      avatarInput.value = "";
    });

    function showMsg(text, type = "error") {
      notice.textContent = text;
      notice.className = "notice " + type;
    }

    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      showMsg("", "notice hidden");

      const name = fieldName.value.trim();
      const age  = fieldAge.value.trim();
      const city = fieldCity.value.trim();
      const bio  = fieldBio.value.trim();

      if (!name) { showMsg("Введи имя."); return; }
      if (!city) { showMsg("Введи город."); return; }

      const avatar = avatarPreview.classList.contains("hidden") ? null : (avatarPreview.src || null);

      const btn = form.querySelector("[type=submit]");
      btn.disabled = true;

      const updated = await U.updateCurrentUser({ name, age, city, bio, avatar });
      btn.disabled = false;

      if (updated) {
        showMsg("Профиль сохранён!", "success");
        setTimeout(() => U.go("/home"), 1500);
      } else {
        showMsg("Ошибка сохранения. Попробуй ещё раз.");
      }
    });
  }

  init();
})();
