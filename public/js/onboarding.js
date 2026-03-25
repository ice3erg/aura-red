(function () {
  const { getCurrentUser, updateCurrentUser, showNotice, hideNotice, go } = window.AuraUtils;

  const form = document.querySelector("[data-onboarding-form]");
  const user = getCurrentUser();

  if (!user) { go("/login"); return; }

  if (form) {
    // Предзаполняем если уже есть данные
    if (form.elements.name)  form.elements.name.value  = user.name  || "";
    if (form.elements.age)   form.elements.age.value   = user.age   || "";
    if (form.elements.city)  form.elements.city.value  = user.city  || "";
    if (form.elements.bio)   form.elements.bio.value   = user.bio   || "";

    const notice = form.querySelector("[data-form-notice]");

    form.addEventListener("submit", (e) => {
      e.preventDefault();
      hideNotice(notice);

      const data = new FormData(form);
      const name = String(data.get("name") || "").trim();
      const age  = String(data.get("age")  || "").trim();
      const city = String(data.get("city") || "").trim();
      const bio  = String(data.get("bio")  || "").trim();

      if (!name || !city) {
        showNotice(notice, "Заполни имя и город.");
        return;
      }

      updateCurrentUser({ name, age, city, bio });
      go("/connect-music");
    });
  }
})();
