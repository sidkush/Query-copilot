import { useState, useEffect, Suspense, Component, lazy } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { api } from "../api";
import behaviorEngine from "../lib/behaviorEngine";
import UserDropdown from "../components/UserDropdown";
import { StaggerContainer, StaggerItem } from "../components/animation/StaggerContainer";

import AnimatedBackground from "../components/animation/AnimatedBackground";
import { GPUTierProvider } from "../lib/gpuDetect";
const PageBackground3D = lazy(() => import("../components/animation/PageBackground3D"));
class _WebGLBound extends Component { constructor(p){super(p);this.state={e:false};} static getDerivedStateFromError(){return{e:true};} render(){return this.state.e?this.props.fallback:this.props.children;} }

const AVATAR_COLORS = [
  { id: "indigo", bg: "bg-indigo-600", ring: "ring-indigo-400" },
  { id: "blue", bg: "bg-blue-600", ring: "ring-blue-400" },
  { id: "green", bg: "bg-green-600", ring: "ring-green-400" },
  { id: "red", bg: "bg-red-600", ring: "ring-red-400" },
  { id: "purple", bg: "bg-purple-600", ring: "ring-purple-400" },
  { id: "pink", bg: "bg-pink-600", ring: "ring-pink-400" },
  { id: "orange", bg: "bg-orange-600", ring: "ring-orange-400" },
  { id: "cyan", bg: "bg-cyan-600", ring: "ring-cyan-400" },
];

const TIMEZONE_GROUPS = {
  "Americas": ["America/New_York", "America/Chicago", "America/Denver", "America/Los_Angeles", "America/Toronto", "America/Sao_Paulo"],
  "Europe": ["Europe/London", "Europe/Paris", "Europe/Berlin", "Europe/Moscow"],
  "Asia & Middle East": ["Asia/Dubai", "Asia/Kolkata", "Asia/Singapore", "Asia/Tokyo", "Asia/Shanghai"],
  "Oceania": ["Australia/Sydney", "Pacific/Auckland"],
};

export default function Profile() {
  const [profile, setProfile] = useState(null);
  const [displayName, setDisplayName] = useState("");
  const [company, setCompany] = useState("");
  const [role, setRole] = useState("");
  const [timezone, setTimezone] = useState("");
  const [avatarColor, setAvatarColor] = useState("indigo");
  const [emailNotifications, setEmailNotifications] = useState(true);
  const [consentLevel, setConsentLevel] = useState(0); // 0=off, 1=personal, 2=collaborative
  const [consentFeatureEnabled, setConsentFeatureEnabled] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.getProfile()
      .then((data) => {
        setProfile(data);
        setDisplayName(data.display_name || data.name || "");
        setCompany(data.company || "");
        setRole(data.role || "");
        setTimezone(data.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC");
        setAvatarColor(data.avatar_color || "indigo");
        setEmailNotifications(data.notification_preferences?.email_notifications ?? true);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
    // Fetch behavior consent level
    api.getBehaviorConsent()
      .then((data) => {
        setConsentLevel(data.consent_level || 0);
        setConsentFeatureEnabled(data.feature_enabled || false);
      })
      .catch(() => {}); // Feature may be disabled
  }, []);

  const handleSave = async () => {
    setSaving(true); setError(""); setSaved(false);
    try {
      await api.updateProfile({
        display_name: displayName,
        company,
        role,
        timezone,
        avatar_color: avatarColor,
        notification_preferences: { email_notifications: emailNotifications },
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (err) { setError(err.message); }
    finally { setSaving(false); }
  };

  const isDirty = profile && (
    displayName !== (profile.display_name || profile.name || "") ||
    company !== (profile.company || "") ||
    role !== (profile.role || "") ||
    timezone !== (profile.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC") ||
    avatarColor !== (profile.avatar_color || "indigo") ||
    emailNotifications !== (profile.notification_preferences?.email_notifications ?? true)
  );

  useEffect(() => {
    if (!isDirty) return;
    const handler = (e) => { e.preventDefault(); e.returnValue = ""; };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [isDirty]);

  const initials = displayName ? displayName.split(" ").map((w) => w[0]).join("").toUpperCase().slice(0, 2) : "U";
  const avatarBg = AVATAR_COLORS.find((c) => c.id === avatarColor)?.bg || "bg-indigo-600";

  const authBadge = (provider) => {
    const map = {
      email: { label: "Email", color: "bg-gray-700 text-gray-300" },
      google: { label: "Google", color: "bg-blue-900/50 text-blue-300 border border-blue-700/50" },
      github: { label: "GitHub", color: "bg-gray-700 text-gray-300 border border-gray-600" },
    };
    const info = map[provider] || map.email;
    return <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium ${info.color}`}>{info.label}</span>;
  };

  return (
    <div className="flex-1 overflow-y-auto relative" style={{ background: 'var(--bg-page)' }}>
      <div className="fixed inset-0 mesh-gradient opacity-30 pointer-events-none" />
      <GPUTierProvider>
        <_WebGLBound fallback={<AnimatedBackground className="fixed inset-0 pointer-events-none" />}>
          <Suspense fallback={<AnimatedBackground className="fixed inset-0 pointer-events-none" />}>
            <PageBackground3D mode="profile" className="fixed inset-0" />
          </Suspense>
        </_WebGLBound>
      </GPUTierProvider>
      <header className="glass-navbar sticky top-0 z-20 flex items-center justify-between px-6 py-3">
        <div className="page-hero" style={{ gap: 2 }}>
          <span className="page-hero__eyebrow">
            <span className="eyebrow-dot" aria-hidden="true" />
            Account · Profile
          </span>
          <h1 style={{
            fontSize: 20,
            fontWeight: 800,
            color: 'var(--text-primary)',
            fontFamily: "'Outfit', system-ui, sans-serif",
            letterSpacing: '-0.022em',
            lineHeight: 1.1,
            margin: 0,
          }}>Profile</h1>
        </div>
        <UserDropdown />
      </header>

      <div className="max-w-xl mx-auto px-4 py-16 relative z-10">
        {loading ? (
          <div className="flex items-center gap-3 text-sm" style={{ color: 'var(--text-muted)' }}>
            <div className="w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
            Loading profile...
          </div>
        ) : (
          <StaggerContainer className="space-y-6">
            <AnimatePresence>
              {error && (
                <motion.div
                  initial={{ opacity: 0, y: -8, x: 0 }}
                  animate={{ opacity: 1, y: 0, x: [0, -8, 8, -4, 4, 0] }}
                  exit={{ opacity: 0, y: -8 }}
                  transition={{ duration: 0.4 }}
                  role="alert"
                  className="bg-red-900/20 border border-red-800/50 text-red-400 rounded-lg p-3 text-sm backdrop-blur-sm"
                >
                  {error}
                </motion.div>
              )}
              {saved && (
                <motion.div
                  initial={{ opacity: 0, y: -8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  role="status"
                  className="bg-green-900/20 border border-green-800/50 text-green-400 rounded-lg p-3 text-sm backdrop-blur-sm"
                >
                  Profile updated successfully.
                </motion.div>
              )}
            </AnimatePresence>

            {/* Avatar + Color Picker — Double-Bezel hero card */}
            <StaggerItem>
              <div className="bezel-shell">
                <div className="bezel-core glass-card p-8" style={{ borderRadius: 'calc(2rem - 6px)' }}>
                  <div className="flex items-center gap-6">
                    <motion.div
                      layout
                      className={`w-20 h-20 rounded-full ${avatarBg} flex items-center justify-center text-white text-2xl font-bold shadow-lg`}
                      transition={{ type: "spring", stiffness: 300, damping: 25 }}
                    >
                      {initials}
                    </motion.div>
                    <div>
                      <label className="block text-sm mb-2" style={{ color: 'var(--text-secondary)' }}>Avatar color</label>
                      <div className="flex gap-2">
                        {AVATAR_COLORS.map((c) => (
                          <motion.button
                            key={c.id}
                            onClick={() => setAvatarColor(c.id)}
                            whileHover={{ scale: 1.15 }}
                            whileTap={{ scale: 0.9 }}
                            transition={{ type: "spring", stiffness: 400, damping: 20 }}
                            className={`w-7 h-7 rounded-full ${c.bg} cursor-pointer ease-spring ${avatarColor === c.id ? `ring-2 ${c.ring} ring-offset-2 ring-offset-[var(--bg-page)] scale-110` : "opacity-70"}`}
                          />
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </StaggerItem>

            {/* Personal Info */}
            <StaggerItem>
              <div className="glass-card rounded-2xl p-6 space-y-5">
                <h2 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>Personal information</h2>

                <div>
                  <label className="block text-sm mb-1" style={{ color: 'var(--text-secondary)' }}>Display Name</label>
                  <input type="text" value={displayName} onChange={(e) => setDisplayName(e.target.value)}
                    className="w-full glass-input rounded-lg px-4 py-2.5 placeholder-gray-600 input-glow transition" style={{ color: 'var(--text-primary)' }} placeholder="Your display name" />
                </div>

                <div>
                  <label className="block text-sm mb-1 flex items-center gap-1.5" style={{ color: 'var(--text-secondary)' }}>
                    Email
                    <svg className="w-3 h-3" style={{ color: 'var(--text-muted)' }} fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" /></svg>
                  </label>
                  <input type="email" value={profile?.email || ""} readOnly aria-label="Email (read-only)"
                    className="w-full glass-input rounded-lg px-4 py-2.5 text-gray-500 cursor-not-allowed opacity-60" />
                  <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>Contact support to change your email</p>
                </div>

                {(profile?.phone || profile?.country_code) && (
                  <div>
                    <label className="block text-sm mb-1" style={{ color: 'var(--text-secondary)' }}>Phone</label>
                    <input type="text" value={`${profile.country_code || ""} ${profile.phone || ""}`.trim() || "Not provided"} readOnly
                      className="w-full glass-input rounded-lg px-4 py-2.5 text-gray-500 cursor-not-allowed opacity-60" />
                  </div>
                )}

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm mb-1" style={{ color: 'var(--text-secondary)' }}>Company</label>
                    <input type="text" value={company} onChange={(e) => setCompany(e.target.value)} aria-label="Company"
                      className="w-full glass-input rounded-lg px-4 py-2.5 placeholder-gray-600 input-glow transition" style={{ color: 'var(--text-primary)' }} placeholder="Your company" />
                  </div>
                  <div>
                    <label className="block text-sm mb-1" style={{ color: 'var(--text-secondary)' }}>Role</label>
                    <input type="text" value={role} onChange={(e) => setRole(e.target.value)} aria-label="Role"
                      className="w-full glass-input rounded-lg px-4 py-2.5 placeholder-gray-600 input-glow transition" style={{ color: 'var(--text-primary)' }} placeholder="e.g. Data Analyst" />
                  </div>
                </div>

                <div>
                  <label className="block text-sm mb-1" style={{ color: 'var(--text-secondary)' }}>Timezone</label>
                  <select value={timezone} onChange={(e) => setTimezone(e.target.value)}
                    className="w-full glass-input rounded-lg px-4 py-2.5 input-glow transition cursor-pointer" style={{ color: 'var(--text-primary)' }} aria-label="Timezone">
                    <option value="UTC">UTC</option>
                    {Object.entries(TIMEZONE_GROUPS).map(([group, tzs]) => (
                      <optgroup key={group} label={group}>
                        {tzs.map((tz) => <option key={tz} value={tz}>{tz.replace(/_/g, " ")}</option>)}
                      </optgroup>
                    ))}
                  </select>
                </div>
              </div>
            </StaggerItem>

            {/* Auth & Meta */}
            <StaggerItem>
              <div className="glass-card rounded-2xl p-6 space-y-4">
                <h2 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>Account details</h2>
                <div>
                  <label className="block text-sm mb-2" style={{ color: 'var(--text-secondary)' }}>Authentication Method</label>
                  {authBadge(profile?.oauth_provider || "email")}
                </div>
                {profile?.created_at && (
                  <div>
                    <label className="block text-sm mb-1" style={{ color: 'var(--text-secondary)' }}>Member Since</label>
                    <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>{new Date(profile.created_at).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}</p>
                  </div>
                )}
              </div>
            </StaggerItem>

            {/* Notifications */}
            <StaggerItem>
              <div className="glass-card rounded-2xl p-6">
                <h2 className="text-sm font-semibold mb-4" style={{ color: 'var(--text-primary)' }}>Notification preferences</h2>
                <label className="flex items-center justify-between cursor-pointer">
                  <div>
                    <p className="text-sm" style={{ color: 'var(--text-primary)' }}>Email Notifications</p>
                    <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Receive query results and alerts via email</p>
                  </div>
                  <div className="relative">
                    <input type="checkbox" checked={emailNotifications} onChange={(e) => setEmailNotifications(e.target.checked)} className="sr-only peer" />
                    <div className="w-11 h-6 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600" style={{ background: 'var(--bg-hover)' }} />
                  </div>
                </label>
              </div>
            </StaggerItem>

            {/* Behavior Intelligence Consent */}
            {consentFeatureEnabled && (
              <StaggerItem>
                <div className="glass-card rounded-2xl p-6">
                  <h2 className="text-sm font-semibold mb-1" style={{ color: 'var(--text-primary)' }}>Predictive intelligence</h2>
                  <p className="text-xs mb-4" style={{ color: 'var(--text-muted)' }}>Control how AskDB learns from your usage to improve suggestions. Raw interaction data never leaves your browser — only abstract patterns are stored.</p>

                  <div className="space-y-3">
                    <label className="flex items-center justify-between cursor-pointer">
                      <div>
                        <p className="text-sm" style={{ color: 'var(--text-primary)' }}>Personal Predictions</p>
                        <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Learn from your query patterns to suggest better next steps</p>
                      </div>
                      <div className="relative">
                        <input type="checkbox" checked={consentLevel >= 1}
                          onChange={(e) => {
                            const newLevel = e.target.checked ? 1 : 0;
                            setConsentLevel(newLevel);
                            api.updateBehaviorConsent(newLevel).then(() => {
                              behaviorEngine.init(newLevel);
                            }).catch(() => {});
                          }}
                          className="sr-only peer" />
                        <div className="w-11 h-6 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600" style={{ background: 'var(--bg-hover)' }} />
                      </div>
                    </label>

                    <label className={`flex items-center justify-between ${consentLevel >= 1 ? "cursor-pointer" : "opacity-40 cursor-not-allowed"}`}>
                      <div>
                        <p className="text-sm" style={{ color: 'var(--text-primary)' }}>Collaborative Intelligence</p>
                        <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Contribute anonymous patterns to improve predictions for your team</p>
                      </div>
                      <div className="relative">
                        <input type="checkbox" checked={consentLevel >= 2} disabled={consentLevel < 1}
                          onChange={(e) => {
                            const newLevel = e.target.checked ? 2 : 1;
                            setConsentLevel(newLevel);
                            api.updateBehaviorConsent(newLevel).then(() => {
                              behaviorEngine.init(newLevel);
                            }).catch(() => {});
                          }}
                          className="sr-only peer" />
                        <div className="w-11 h-6 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600" style={{ background: 'var(--bg-hover)' }} />
                      </div>
                    </label>
                  </div>

                  {consentLevel === 0 && (
                    <p className="text-xs mt-3 italic" style={{ color: 'var(--text-muted)' }}>No interaction data is captured while this is off.</p>
                  )}
                </div>
              </StaggerItem>
            )}

            {/* Save */}
            <AnimatePresence>
              {isDirty && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  exit={{ opacity: 0, height: 0 }}
                  className="flex items-center gap-2 text-sm text-amber-400 bg-amber-900/20 border border-amber-700/50 rounded-lg px-3 py-2 backdrop-blur-sm overflow-hidden"
                >
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
                  You have unsaved changes
                </motion.div>
              )}
            </AnimatePresence>
            <StaggerItem>
              <motion.button
                onClick={handleSave}
                disabled={saving || !isDirty}
                whileTap={{ scale: 0.98 }}
                transition={{ type: "spring", stiffness: 400, damping: 25 }}
                className={`group w-full flex items-center justify-between py-3 pl-6 pr-2 bg-blue-600 hover:bg-blue-500 text-white font-semibold rounded-full shadow-lg shadow-blue-600/20 ease-spring cursor-pointer ${!isDirty && !saving ? "opacity-50 cursor-not-allowed" : ""}`}
                aria-label={saving ? "Saving profile" : isDirty ? "Save profile changes" : "No changes to save"}
              >
                <span className="text-sm">{saving ? "Saving..." : isDirty ? "Save changes" : "No changes"}</span>
                <span className="flex items-center justify-center w-9 h-9 rounded-full bg-white/15 ease-spring transition-transform duration-300 group-hover:translate-x-1 group-hover:-translate-y-[1px]">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M5 12h14M13 5l7 7-7 7" />
                  </svg>
                </span>
              </motion.button>
            </StaggerItem>
          </StaggerContainer>
        )}
      </div>
    </div>
  );
}
