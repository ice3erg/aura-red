(function () {
  const U = window.AuraUtils;

  async function checkSession() {
    const user = await U.fetchMe();
    if (!user) return;
    const p = location.pathname;
    if (p === "/login" || p === "/signup")
      U.go(user.name && user.city ? "/home" : "/onboarding");
  }

  const loginForm = document.querySelector("[data-login-form]");
  if (loginForm) {
    checkSession();
    const notice = loginForm.querySelector("[data-form-notice]");
    loginForm.addEventListener("submit", async e => {
      e.preventDefault();
      U.hideNotice(notice);
      const fd = new FormData(loginForm);
      const email    = String(fd.get("email")    || "").trim();
      const password = String(fd.get("password") || "").trim();
      if (!email || !password) { U.showNotice(notice, "Заполни все поля."); return; }
      const btn = loginForm.querySelector("[type=submit]");
      btn.disabled = true;
      try {
        const r = await fetch("/api/auth/login", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email, password })
        });
        const d = await r.json();
        if (!r.ok || !d.ok) { U.showNotice(notice, d.error || "Ошибка входа."); return; }
        U.go(d.needsOnboarding ? "/onboarding" : "/home");
      } catch (_) { U.showNotice(notice, "Ошибка сети. Попробуй ещё раз."); }
      finally { btn.disabled = false; }
    });
  }

  const signupForm = document.querySelector("[data-signup-form]");
  if (signupForm) {
    checkSession();
    const notice = signupForm.querySelector("[data-form-notice]");
    signupForm.addEventListener("submit", async e => {
      e.preventDefault();
      U.hideNotice(notice);
      const fd = new FormData(signupForm);
      const email    = String(fd.get("email")           || "").trim();
      const password = String(fd.get("password")        || "").trim();
      const confirm  = String(fd.get("confirmPassword") || "").trim();
      if (!email || !password)  { U.showNotice(notice, "Заполни все поля."); return; }
      if (password.length < 6)  { U.showNotice(notice, "Пароль не короче 6 символов."); return; }
      if (password !== confirm)  { U.showNotice(notice, "Пароли не совпадают."); return; }
      const btn = signupForm.querySelector("[type=submit]");
      btn.disabled = true;
      try {
        const r = await fetch("/api/auth/signup", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email, password })
        });
        const d = await r.json();
        if (!r.ok || !d.ok) { U.showNotice(notice, d.error || "Ошибка регистрации."); return; }
        U.go("/onboarding");
      } catch (_) { U.showNotice(notice, "Ошибка сети. Попробуй ещё раз."); }
      finally { btn.disabled = false; }
    });
  }
})();
