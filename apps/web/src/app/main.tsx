import React from "react";
import ReactDOM from "react-dom/client";
import { RouterProvider } from "react-router-dom";
import { router } from "./router";
import { useAuthStore } from "../features/auth/store";

function Bootstrap() {
  const init = useAuthStore((s) => s.init);
  const initialized = useAuthStore((s) => s.initialized);

  React.useEffect(() => {
    void init();
  }, [init]);

  if (!initialized) {
    return <div style={{ padding: 24 }}>Инициализация...</div>;
  }

  return <RouterProvider router={router} />;
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <Bootstrap />
  </React.StrictMode>
);
