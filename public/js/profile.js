(function () {
  const U = window.AuraUtils;
  async function init() {
    const user = await U.requireAuth();
    if (!user) return;
    const form              = document.getElementById("profileForm");
    const notice            = document.getElementById("profileNotice");
    const avatarInput       = document.getElementById("avatarInput");
    const avatarPreview     = document.getElementById("avatarPreview");
    const avatarPlaceholder = document.getElementById("avatarPlaceholder");
    const removeAvatarBtn   = document.getElementById("removeAvatarBtn");
    const fieldName = document.getElementById("fieldName");
    const fieldAge  = document.getElementById("fieldAge");
    const fieldCity = document.getElementById("fieldCity");
    const fieldBio  = document.getElementById("fieldBio");

    if (fieldName) fieldName.value = user.name || "";
    if (fieldAge)  fieldAge.value  = user.age  || "";
    if (fieldCity) fieldCity.value = user.city || "";
    if (fieldBio)  fieldBio.value  = user.bio  || "";

    function showAvatar(src) {
      if (avatarPreview)     { avatarPreview.src = src; avatarPreview.classList.remove("hidden"); }
      if (avatarPlaceholder) avatarPlaceholder.classList.add("hidden");
      if (removeAvatarBtn)   removeAvatarBtn.classList.remove("hidden");
    }
    function showPlaceholder() {
      if (avatarPreview)     { avatarPreview.src = ""; avatarPreview.classList.add("hidden"); }
      if (avatarPlaceholder) avatarPlaceholder.classList.remove("hidden");
      if (removeAvatarBtn)   removeAvatarBtn.classList.add("hidden");
    }
    if (user.avatar) showAvatar(user.avatar); else showPlaceholder();

    if (avatarInput) {
      avatarInput.addEventListener("change", e => {
        const file = e.target.files[0];
        if (!file) return;
        if (file.size > 3 * 1024 * 1024) { showMsg("Фото до 3 МБ."); return; }
        const r = new FileReader();
        r.onload = ev => showAvatar(ev.target.result);
        r.readAsDataURL(file);
      });
    }
    if (removeAvatarBtn) removeAvatarBtn.addEventListener("click", () => { showPlaceholder(); if (avatarInput) avatarInput.value = ""; });

    function showMsg(text, type = "error") {
      if (!notice) return;
      notice.textContent = text;
      notice.className = "notice " + type;
    }

    if (form) {
      form.addEventListener("submit", async e => {
        e.preventDefault();
        showMsg("", "notice hidden");
        const name = fieldName?.value.trim() || "";
        const age  = fieldAge?.value.trim()  || "";
        const city = fieldCity?.value.trim() || "";
        const bio  = fieldBio?.value.trim()  || "";
        if (!name) { showMsg("Введи имя."); return; }
        if (!city) { showMsg("Введи город."); return; }
        const avatar = avatarPreview?.classList.contains("hidden") ? null : (avatarPreview?.src || null);
        const btn = form.querySelector("[type=submit]");
        if (btn) btn.disabled = true;
        const updated = await U.updateCurrentUser({ name, age, city, bio, avatar });
        if (btn) btn.disabled = false;
        if (updated) { showMsg("Профиль сохранён!", "success"); setTimeout(() => U.go("/home"), 1500); }
        else showMsg("Ошибка сохранения. Попробуй ещё раз.");
      });
    }
  }
  init();
})();
