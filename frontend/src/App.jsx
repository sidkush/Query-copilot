import { useEffect, lazy, Suspense } from "react";
import { BrowserRouter, Routes, Route, Navigate, useLocation } from "react-router-dom";
import { AnimatePresence } from "framer-motion";
import { useStore } from "./store";
import { api } from "./api";
import behaviorEngine from "./lib/behaviorEngine";
import useThemeInit from "./hooks/useThemeInit";
import AppLayout from "./components/AppLayout";
import PageTransition from "./components/animation/PageTransition";

// Route-based code splitting — each page loads only when navigated to
const Landing = lazy(() => import("./pages/Landing"));
const Login = lazy(() => import("./pages/Login"));
const OAuthCallback = lazy(() => import("./pages/OAuthCallback"));
const Tutorial = lazy(() => import("./pages/Tutorial"));
const Dashboard = lazy(() => import("./pages/Dashboard"));
const SchemaView = lazy(() => import("./pages/SchemaView"));
const Chat = lazy(() => import("./pages/Chat"));
const Profile = lazy(() => import("./pages/Profile"));
const Account = lazy(() => import("./pages/Account"));
const Billing = lazy(() => import("./pages/Billing"));
const AdminLogin = lazy(() => import("./pages/AdminLogin"));
const AdminDashboard = lazy(() => import("./pages/AdminDashboard"));
const AnalyticsShell = lazy(() => import("./pages/AnalyticsShell"));
const SharedDashboard = lazy(() => import("./pages/SharedDashboard"));
const Onboarding = lazy(() => import("./pages/Onboarding"));
const MLEngine = lazy(() => import("./pages/MLEngine"));
const SemanticSettingsPage = lazy(() => import("./pages/SemanticSettingsPage"));
const ChartTypeComposerPage = lazy(() => import("./pages/ChartTypeComposerPage"));
const GalleryPage = lazy(() => import("./pages/GalleryPage"));

// Dev-only routes — tree-shaken in production builds (import.meta.env.DEV === false).
const DevChartEditor = import.meta.env.DEV
  ? lazy(() => import("./pages/DevChartEditor"))
  : null;
const DevDashboardShell = import.meta.env.DEV
  ? lazy(() => import("./pages/DevDashboardShell"))
  : null;

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
  const setFeatureFlags = useStore((s) => s.setFeatureFlags);

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

  // Hydrate dashboard feature flags on boot. Defaults all-false so a
  // missing or failing endpoint leaves the legacy routes in place.
  useEffect(() => {
    if (!token) return;
    api
      .getDashboardFeatureFlags()
      .then((flags) => setFeatureFlags(flags || {}))
      .catch(() => {
        // Stay on legacy routes if the flag endpoint is unreachable.
        setFeatureFlags({ NEW_CHART_EDITOR_ENABLED: false });
      });
  }, [token, setFeatureFlags]);

  // Track page navigation
  useEffect(() => {
    const page = location.pathname.replace(/^\//, "") || "landing";
    behaviorEngine.trackNavigation(page);
  }, [location.pathname]);

  return (
    <Suspense fallback={<div className="min-h-screen" style={{ background: 'var(--bg-page)' }} />}>
      <AnimatePresence mode="wait">
        <Routes location={location} key={location.pathname}>
          {/* Public */}
          <Route path="/" element={<PageTransition><Landing /></PageTransition>} />
          <Route path="/login" element={<PageTransition><Login /></PageTransition>} />
          <Route path="/auth/callback" element={<OAuthCallback />} />
          <Route path="/shared/:token" element={<PageTransition><SharedDashboard /></PageTransition>} />

          {/* Protected — no sidebar */}
          <Route path="/onboarding" element={<ProtectedRoute><PageTransition><Onboarding /></PageTransition></ProtectedRoute>} />

          {/* Protected — with sidebar */}
          <Route path="/dashboard" element={<AppPage><PageTransition><Dashboard /></PageTransition></AppPage>} />
          <Route path="/schema" element={<AppPage><PageTransition><SchemaView /></PageTransition></AppPage>} />
          <Route path="/chat" element={<AppPage><PageTransition><Chat /></PageTransition></AppPage>} />
          <Route path="/profile" element={<AppPage><PageTransition><Profile /></PageTransition></AppPage>} />
          <Route path="/account" element={<AppPage><PageTransition><Account /></PageTransition></AppPage>} />
          <Route path="/billing" element={<AppPage><PageTransition><Billing /></PageTransition></AppPage>} />
          <Route path="/analytics" element={<AppPage><PageTransition><AnalyticsShell /></PageTransition></AppPage>} />
          <Route path="/ml-engine" element={<AppPage><PageTransition><MLEngine /></PageTransition></AppPage>} />
          <Route path="/semantic-settings" element={<AppPage><PageTransition><SemanticSettingsPage /></PageTransition></AppPage>} />
          <Route path="/chart-types/new" element={<AppPage><PageTransition><ChartTypeComposerPage /></PageTransition></AppPage>} />
          <Route path="/gallery" element={<AppPage><PageTransition><GalleryPage /></PageTransition></AppPage>} />

          {/* Admin */}
          <Route path="/admin/login" element={<PageTransition><AdminLogin /></PageTransition>} />
          <Route path="/admin" element={<PageTransition><AdminDashboard /></PageTransition>} />

          {/* Dev-only — A Phase 1 editor shell smoke-test route */}
          {import.meta.env.DEV && DevChartEditor && (
            <Route path="/dev/chart-editor" element={<DevChartEditor />} />
          )}

          {/* Dev-only — A Phase 4b dashboard shell smoke-test route */}
          {import.meta.env.DEV && DevDashboardShell && (
            <Route path="/dev/dashboard-shell" element={<DevDashboardShell />} />
          )}

          {/* Fallback */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </AnimatePresence>
    </Suspense>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AnimatedRoutes />
    </BrowserRouter>
  );
}
