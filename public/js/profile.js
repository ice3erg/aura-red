(function () {
  const {
    getCurrentUser,
    updateCurrentUser,
    showNotice,
    hideNotice,
    go
  } = window.AuraUtils;

  const form = document.querySelector("[data-onboarding-form]");
  const currentUser = getCurrentUser();

  if (!currentUser) {
    go("/login");
  }

  if (form && currentUser) {
    form.elements.name.value = currentUser.name || "";
    form.elements.age.value = currentUser.age || "";
    form.elements.city.value = currentUser.city || "";
    form.elements.bio.value = currentUser.bio || "";

    const notice = form.querySelector("[data-form-notice]");

    form.addEventListener("submit", (e) => {
      e.preventDefault();
      hideNotice(notice);

      const formData = new FormData(form);

      const name = String(formData.get("name") || "").trim();
      const age = String(formData.get("age") || "").trim();
      const city = String(formData.get("city") || "").trim();
      const bio = String(formData.get("bio") || "").trim();

      if (!name || !age || !city) {
        showNotice(notice, "Заполни имя, возраст и город.");
        return;
      }

      updateCurrentUser({ name, age, city, bio });
      go("/connect-music");
    });
  }
})();
