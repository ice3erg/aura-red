(function () {
  const U    = window.AuraUtils;
  const form = document.querySelector("[data-onboarding-form]");

  async function init() {
    const user = await U.requireAuth();
    if (!user || !form) return;
    if (form.elements.name)  form.elements.name.value  = user.name  || "";
    if (form.elements.age)   form.elements.age.value   = user.age   || "";
    if (form.elements.city)  form.elements.city.value  = user.city  || "";
    if (form.elements.bio)   form.elements.bio.value   = user.bio   || "";
    const notice = form.querySelector("[data-form-notice]");
    form.addEventListener("submit", async e => {
      e.preventDefault();
      U.hideNotice(notice);
      const fd   = new FormData(form);
      const name = String(fd.get("name") || "").trim();
      const city = String(fd.get("city") || "").trim();
      if (!name || !city) { U.showNotice(notice, "Заполни имя и город."); return; }
      const btn = form.querySelector("[type=submit]");
      btn.disabled = true;
      const updated = await U.updateCurrentUser({
        name, city,
        age: String(fd.get("age") || "").trim(),
        bio: String(fd.get("bio") || "").trim()
      });
      btn.disabled = false;
      if (updated) U.go("/connect-music");
      else U.showNotice(notice, "Ошибка сохранения. Попробуй ещё раз.");
    });
  }
  init();
})();
