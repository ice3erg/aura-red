(function () {
  const { go } = window.AuraUtils;

  // Если уже залогинен через сессию — редиректим
  async function checkSession() {
    try {
      const res = await fetch("/api/auth/me");
      if (res.ok) {
        const data = await res.json();
        if (data.ok) {
          const path = location.pathname;
          if (path === "/login" || path === "/signup") {
            go(data.user.name && data.user.city ? "/home" : "/onboarding");
          }
        }
      }
    } catch (_) {}
  }

  // ── Login form ──────────────────────────────────────────
  const loginForm = document.querySelector("[data-login-form]");
  if (loginForm) {
    checkSession();
    const notice = loginForm.querySelector("[data-form-notice]");

    loginForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      window.AuraUtils.hideNotice(notice);

      const fd       = new FormData(loginForm);
      const email    = String(fd.get("email")    || "").trim();
      const password = String(fd.get("password") || "").trim();

      if (!email || !password) {
        window.AuraUtils.showNotice(notice, "Заполни все поля.");
        return;
      }

      const btn = loginForm.querySelector("[type=submit]");
      btn.disabled = true;

      try {
        const res  = await fetch("/api/auth/login", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email, password })
        });
        const data = await res.json();

        if (!res.ok || !data.ok) {
          window.AuraUtils.showNotice(notice, data.error || "Ошибка входа.");
          return;
        }

        go(data.needsOnboarding ? "/onboarding" : "/home");
      } catch (_) {
        window.AuraUtils.showNotice(notice, "Ошибка сети. Попробуй ещё раз.");
      } finally {
        btn.disabled = false;
      }
    });
  }

  // ── Signup form ─────────────────────────────────────────
  const signupForm = document.querySelector("[data-signup-form]");
  if (signupForm) {
    checkSession();
    const notice = signupForm.querySelector("[data-form-notice]");

    signupForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      window.AuraUtils.hideNotice(notice);

      const fd              = new FormData(signupForm);
      const email           = String(fd.get("email")           || "").trim();
      const password        = String(fd.get("password")        || "").trim();
      const confirmPassword = String(fd.get("confirmPassword") || "").trim();

      if (!email || !password) {
        window.AuraUtils.showNotice(notice, "Заполни все поля.");
        return;
      }
      if (password.length < 6) {
        window.AuraUtils.showNotice(notice, "Пароль не короче 6 символов.");
        return;
      }
      if (password !== confirmPassword) {
        window.AuraUtils.showNotice(notice, "Пароли не совпадают.");
        return;
      }

      const btn = signupForm.querySelector("[type=submit]");
      btn.disabled = true;

      try {
        const res  = await fetch("/api/auth/signup", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email, password })
        });
        const data = await res.json();

        if (!res.ok || !data.ok) {
          window.AuraUtils.showNotice(notice, data.error || "Ошибка регистрации.");
          return;
        }

        go("/onboarding");
      } catch (_) {
        window.AuraUtils.showNotice(notice, "Ошибка сети. Попробуй ещё раз.");
      } finally {
        btn.disabled = false;
      }
    });
  }
})();
