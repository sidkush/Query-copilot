import { useEffect, lazy, Suspense } from "react";
import { BrowserRouter, Routes, Route, Navigate, useLocation } from "react-router-dom";
import { AnimatePresence } from "framer-motion";
import { useStore } from "./store";
import { api } from "./api";
import behaviorEngine from "./lib/behaviorEngine";
import useThemeInit from "./hooks/useThemeInit";
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
import SharedDashboard from "./pages/SharedDashboard";
import PageTransition from "./components/animation/PageTransition";

const Onboarding = lazy(() => import("./pages/Onboarding"));

function ProtectedRoute({ children }) {
  const token = useStore((s) => s.token);
  const onboardingComplete = useStore((s) => s.onboardingComplete);
  const location = useLocation();

  if (!token) return <Navigate to="/login" replace />;

  // Allow /onboarding route itself
  if (location.pathname === "/onboarding") return children;

  // New users: full onboarding
  if (!onboardingComplete) return <Navigate to="/onboarding" replace />;

  // BYOK users without a key see the AppLayout banner (not a redirect gate).
  // A previous redirect here caused an infinite loop: skip→/dashboard→gate→/onboarding→skip…

  return children;
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
  const token = useStore((s) => s.token);

  // Initialize theme (light/dark/system)
  useThemeInit();

  // Initialize behavior engine with user's consent level
  useEffect(() => {
    if (token) {
      api.getBehaviorConsent()
        .then((data) => behaviorEngine.init(data.consent_level || 0))
        .catch(() => behaviorEngine.init(0)); // Feature disabled or error — no tracking
    } else {
      behaviorEngine.stop();
    }
    return () => behaviorEngine.stop();
  }, [token]);

  // Track page navigation
  useEffect(() => {
    const page = location.pathname.replace(/^\//, "") || "landing";
    behaviorEngine.trackNavigation(page);
  }, [location.pathname]);

  return (
    <AnimatePresence mode="wait">
      <Routes location={location} key={location.pathname}>
        {/* Public */}
        <Route path="/" element={<PageTransition><Landing /></PageTransition>} />
        <Route path="/login" element={<PageTransition><Login /></PageTransition>} />
        <Route path="/auth/callback" element={<OAuthCallback />} />
        <Route path="/shared/:token" element={<PageTransition><SharedDashboard /></PageTransition>} />

        {/* Protected — no sidebar */}
        <Route path="/onboarding" element={<ProtectedRoute><Suspense fallback={<div className="flex-1" style={{ background: 'var(--bg-page)' }} />}><PageTransition><Onboarding /></PageTransition></Suspense></ProtectedRoute>} />

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
