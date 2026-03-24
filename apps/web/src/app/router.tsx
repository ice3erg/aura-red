import {
  createBrowserRouter,
  Navigate,
  Outlet,
} from "react-router-dom";
import { useAuthStore } from "../features/auth/store";
import LoginPage from "../pages/LoginPage";
import SignupPage from "../pages/SignupPage";
import HomePage from "../pages/HomePage";
import ConnectMusicPage from "../pages/ConnectMusicPage";
import ConnectSuccessPage from "../pages/ConnectSuccessPage";
import ProfilePage from "../pages/ProfilePage";

function ProtectedLayout() {
  const { initialized, user } = useAuthStore();

  if (!initialized) {
    return <div style={{ padding: 24 }}>Загрузка...</div>;
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  return <Outlet />;
}

export const router = createBrowserRouter([
  {
    path: "/",
    element: <Navigate to="/home" replace />,
  },
  {
    path: "/login",
    element: <LoginPage />,
  },
  {
    path: "/signup",
    element: <SignupPage />,
  },
  {
    element: <ProtectedLayout />,
    children: [
      {
        path: "/home",
        element: <HomePage />,
      },
      {
        path: "/connect-music",
        element: <ConnectMusicPage />,
      },
      {
        path: "/connect-success",
        element: <ConnectSuccessPage />,
      },
      {
        path: "/profile",
        element: <ProfilePage />,
      },
    ],
  },
]);
