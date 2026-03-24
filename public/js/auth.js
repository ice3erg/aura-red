(function () {
  const {
    getUsers,
    saveUsers,
    setSession,
    getCurrentUser,
    showNotice,
    hideNotice,
    go
  } = window.AuraUtils;

  const loginForm = document.querySelector("[data-login-form]");
  const signupForm = document.querySelector("[data-signup-form]");
  const currentUser = getCurrentUser();

  if (currentUser && (location.pathname === "/login" || location.pathname === "/signup")) {
    go("/home");
  }

  if (loginForm) {
    const notice = loginForm.querySelector("[data-form-notice]");

    loginForm.addEventListener("submit", (e) => {
      e.preventDefault();
      hideNotice(notice);

      const formData = new FormData(loginForm);
      const email = String(formData.get("email") || "").trim().toLowerCase();
      const password = String(formData.get("password") || "").trim();

      const user = getUsers().find((u) => u.email === email && u.password === password);

      if (!user) {
        showNotice(notice, "Неверная почта или пароль.");
        return;
      }

      setSession({ userId: user.id });

      if (!user.name || !user.city) {
        go("/onboarding");
      } else {
        go("/home");
      }
    });
  }

  if (signupForm) {
    const notice = signupForm.querySelector("[data-form-notice]");

    signupForm.addEventListener("submit", (e) => {
      e.preventDefault();
      hideNotice(notice);

      const formData = new FormData(signupForm);
      const email = String(formData.get("email") || "").trim().toLowerCase();
      const password = String(formData.get("password") || "").trim();
      const confirmPassword = String(formData.get("confirmPassword") || "").trim();

      if (!email || !password) {
        showNotice(notice, "Заполни все поля.");
        return;
      }

      if (password.length < 6) {
        showNotice(notice, "Пароль должен быть не короче 6 символов.");
        return;
      }

      if (password !== confirmPassword) {
        showNotice(notice, "Пароли не совпадают.");
        return;
      }

      const users = getUsers();

      if (users.some((u) => u.email === email)) {
        showNotice(notice, "Пользователь с такой почтой уже существует.");
        return;
      }

      const user = {
        id: "u_" + Date.now(),
        email,
        password,
        name: "",
        age: "",
        city: "",
        bio: "",
        spotifyConnected: false,
        spotifyName: "",
        spotifyId: ""
      };

      users.push(user);
      saveUsers(users);
      setSession({ userId: user.id });

      go("/onboarding");
    });
  }
})();
