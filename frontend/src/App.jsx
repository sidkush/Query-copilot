import { BrowserRouter, Routes, Route, Navigate, useLocation } from "react-router-dom";
import { AnimatePresence } from "framer-motion";
import { useStore } from "./store";
import Landing from "./pages/Landing";
import Login from "./pages/Login";
import OAuthCallback from "./pages/OAuthCallback";
import Tutorial from "./pages/Tutorial";
import Dashboard from "./pages/Dashboard";
import SchemaView from "./pages/SchemaView";
import Chat from "./pages/Chat";
import Profile from "./pages/Profile";
import Account from "./pages/Account";
import Billing from "./pages/Billing";
import AppLayout from "./components/AppLayout";
import AdminLogin from "./pages/AdminLogin";
import AdminDashboard from "./pages/AdminDashboard";
import DashboardBuilder from "./pages/DashboardBuilder";
import PageTransition from "./components/animation/PageTransition";

function ProtectedRoute({ children }) {
  const token = useStore((s) => s.token);
  return token ? children : <Navigate to="/login" replace />;
}

function AppPage({ children }) {
  return (
    <ProtectedRoute>
      <AppLayout>{children}</AppLayout>
    </ProtectedRoute>
  );
}

function AnimatedRoutes() {
  const location = useLocation();

  return (
    <AnimatePresence mode="wait">
      <Routes location={location} key={location.pathname}>
        {/* Public */}
        <Route path="/" element={<PageTransition><Landing /></PageTransition>} />
        <Route path="/login" element={<PageTransition><Login /></PageTransition>} />
        <Route path="/auth/callback" element={<OAuthCallback />} />

        {/* Protected — no sidebar */}
        <Route path="/tutorial" element={<ProtectedRoute><PageTransition><Tutorial /></PageTransition></ProtectedRoute>} />

        {/* Protected — with sidebar */}
        <Route path="/dashboard" element={<AppPage><PageTransition><Dashboard /></PageTransition></AppPage>} />
        <Route path="/schema" element={<AppPage><PageTransition><SchemaView /></PageTransition></AppPage>} />
        <Route path="/chat" element={<AppPage><PageTransition><Chat /></PageTransition></AppPage>} />
        <Route path="/profile" element={<AppPage><PageTransition><Profile /></PageTransition></AppPage>} />
        <Route path="/account" element={<AppPage><PageTransition><Account /></PageTransition></AppPage>} />
        <Route path="/billing" element={<AppPage><PageTransition><Billing /></PageTransition></AppPage>} />
        <Route path="/analytics" element={<AppPage><PageTransition><DashboardBuilder /></PageTransition></AppPage>} />

        {/* Admin */}
        <Route path="/admin/login" element={<PageTransition><AdminLogin /></PageTransition>} />
        <Route path="/admin" element={<PageTransition><AdminDashboard /></PageTransition>} />

        {/* Fallback */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </AnimatePresence>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AnimatedRoutes />
    </BrowserRouter>
  );
}
