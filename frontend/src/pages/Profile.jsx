import { useState, useEffect } from "react";
import { AnimatePresence } from "framer-motion";
import { api } from "../api";
import UserDropdown from "../components/UserDropdown";
import { StaggerContainer, StaggerItem } from "../components/animation/StaggerContainer";
import MotionButton from "../components/animation/MotionButton";
import AnimatedBackground from "../components/animation/AnimatedBackground";

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
    <div className="flex-1 overflow-y-auto bg-[#06060e] relative">
      <div className="fixed inset-0 mesh-gradient opacity-30 pointer-events-none" />
      <AnimatedBackground className="fixed inset-0 pointer-events-none" />
      <header className="glass-navbar sticky top-0 z-20 flex items-center justify-between px-6 py-3">
        <div>
          <h1 className="text-xl font-bold text-white">Profile</h1>
          <p className="text-xs text-gray-400">Manage your personal information</p>
        </div>
        <UserDropdown />
      </header>

      <div className="max-w-xl mx-auto px-4 py-8 relative z-10">
        {loading ? (
          <div className="flex items-center gap-3 text-gray-500 text-sm">
            <div className="w-5 h-5 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
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

            {/* Avatar + Color Picker */}
            <StaggerItem>
              <div className="glass-card rounded-2xl p-6">
                <div className="flex items-center gap-6">
                  <motion.div
                    layout
                    className={`w-20 h-20 rounded-full ${avatarBg} flex items-center justify-center text-white text-2xl font-bold shadow-lg`}
                    transition={{ type: "spring", stiffness: 300, damping: 25 }}
                  >
                    {initials}
                  </motion.div>
                  <div>
                    <label className="block text-sm text-gray-400 mb-2">Avatar Color</label>
                    <div className="flex gap-2">
                      {AVATAR_COLORS.map((c) => (
                        <motion.button
                          key={c.id}
                          onClick={() => setAvatarColor(c.id)}
                          whileHover={{ scale: 1.15 }}
                          whileTap={{ scale: 0.9 }}
                          className={`w-7 h-7 rounded-full ${c.bg} cursor-pointer transition-all ${avatarColor === c.id ? `ring-2 ${c.ring} ring-offset-2 ring-offset-[#06060e] scale-110` : "opacity-70"}`}
                        />
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </StaggerItem>

            {/* Personal Info */}
            <StaggerItem>
              <div className="glass-card rounded-2xl p-6 space-y-5">
                <h2 className="text-sm font-semibold text-white">Personal Information</h2>

                <div>
                  <label className="block text-sm text-gray-400 mb-1">Display Name</label>
                  <input type="text" value={displayName} onChange={(e) => setDisplayName(e.target.value)}
                    className="w-full glass-input rounded-lg px-4 py-2.5 text-white placeholder-gray-600 input-glow transition" placeholder="Your display name" />
                </div>

                <div>
                  <label className="block text-sm text-gray-400 mb-1 flex items-center gap-1.5">
                    Email
                    <svg className="w-3 h-3 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" /></svg>
                  </label>
                  <input type="email" value={profile?.email || ""} readOnly aria-label="Email (read-only)"
                    className="w-full glass-input rounded-lg px-4 py-2.5 text-gray-500 cursor-not-allowed opacity-60" />
                  <p className="text-xs text-gray-600 mt-1">Contact support to change your email</p>
                </div>

                {(profile?.phone || profile?.country_code) && (
                  <div>
                    <label className="block text-sm text-gray-400 mb-1">Phone</label>
                    <input type="text" value={`${profile.country_code || ""} ${profile.phone || ""}`.trim() || "Not provided"} readOnly
                      className="w-full glass-input rounded-lg px-4 py-2.5 text-gray-500 cursor-not-allowed opacity-60" />
                  </div>
                )}

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm text-gray-400 mb-1">Company</label>
                    <input type="text" value={company} onChange={(e) => setCompany(e.target.value)}
                      className="w-full glass-input rounded-lg px-4 py-2.5 text-white placeholder-gray-600 input-glow transition" placeholder="Your company" />
                  </div>
                  <div>
                    <label className="block text-sm text-gray-400 mb-1">Role</label>
                    <input type="text" value={role} onChange={(e) => setRole(e.target.value)}
                      className="w-full glass-input rounded-lg px-4 py-2.5 text-white placeholder-gray-600 input-glow transition" placeholder="e.g. Data Analyst" />
                  </div>
                </div>

                <div>
                  <label className="block text-sm text-gray-400 mb-1">Timezone</label>
                  <select value={timezone} onChange={(e) => setTimezone(e.target.value)}
                    className="w-full glass-input rounded-lg px-4 py-2.5 text-white input-glow transition cursor-pointer" aria-label="Timezone">
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
                <h2 className="text-sm font-semibold text-white">Account Details</h2>
                <div>
                  <label className="block text-sm text-gray-400 mb-2">Authentication Method</label>
                  {authBadge(profile?.oauth_provider || "email")}
                </div>
                {profile?.created_at && (
                  <div>
                    <label className="block text-sm text-gray-400 mb-1">Member Since</label>
                    <p className="text-sm text-gray-300">{new Date(profile.created_at).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}</p>
                  </div>
                )}
              </div>
            </StaggerItem>

            {/* Notifications */}
            <StaggerItem>
              <div className="glass-card rounded-2xl p-6">
                <h2 className="text-sm font-semibold text-white mb-4">Notification Preferences</h2>
                <label className="flex items-center justify-between cursor-pointer">
                  <div>
                    <p className="text-sm text-gray-200">Email Notifications</p>
                    <p className="text-xs text-gray-500">Receive query results and alerts via email</p>
                  </div>
                  <div className="relative">
                    <input type="checkbox" checked={emailNotifications} onChange={(e) => setEmailNotifications(e.target.checked)} className="sr-only peer" />
                    <div className="w-11 h-6 bg-gray-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-indigo-600" />
                  </div>
                </label>
              </div>
            </StaggerItem>

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
              <MotionButton onClick={handleSave} disabled={saving || !isDirty}
                className={`w-full py-3 bg-gradient-to-r from-indigo-600 to-violet-600 text-white font-bold rounded-xl shadow-lg shadow-indigo-500/25 transition cursor-pointer btn-glow ${!isDirty && !saving ? "opacity-50 cursor-not-allowed" : ""} disabled:opacity-50`}>
                {saving ? "Saving..." : isDirty ? "Save Changes" : "No Changes"}
              </MotionButton>
            </StaggerItem>
          </StaggerContainer>
        )}
      </div>
    </div>
  );
}
