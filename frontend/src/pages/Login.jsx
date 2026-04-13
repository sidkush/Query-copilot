import { useState, useEffect, useRef, Suspense, Component, lazy } from "react";
import { useNavigate } from "react-router-dom";
// eslint-disable-next-line no-unused-vars
import { motion, AnimatePresence } from "framer-motion";
import { api } from "../api";
import { useStore } from "../store";
import MotionButton from "../components/animation/MotionButton";
import AskDBLogo from "../components/AskDBLogo";

import AnimatedBackground from "../components/animation/AnimatedBackground";
import { GPUTierProvider } from "../lib/gpuDetect";

function ThemeToggleBtn() {
  const theme = useStore((s) => s.theme);
  const setTheme = useStore((s) => s.setTheme);
  const cycle = () => { const next = { light: "dark", dark: "system", system: "light" }; setTheme(next[theme] || "light"); };
  return (
    <button onClick={cycle} className="absolute top-6 right-6 w-8 h-8 rounded-lg flex items-center justify-center transition-colors duration-200 cursor-pointer z-10" style={{ color: 'var(--text-muted)', background: 'var(--overlay-subtle)' }} aria-label={`Theme: ${theme}`}>
      {theme === "light" ? (
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" /></svg>
      ) : theme === "dark" ? (
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" /></svg>
      ) : (
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg>
      )}
    </button>
  );
}
const PageBackground3D = lazy(() => import("../components/animation/PageBackground3D"));
class _WebGLBound extends Component { constructor(p){super(p);this.state={e:false};} static getDerivedStateFromError(){return{e:true};} render(){return this.state.e?this.props.fallback:this.props.children;} }

/* ─── Country list with dial codes + flag emojis ─────────── */
const COUNTRIES = [
  { name: "United States", code: "US", dial: "+1", flag: "\u{1F1FA}\u{1F1F8}", format: "(XXX) XXX-XXXX" },
  { name: "United Kingdom", code: "GB", dial: "+44", flag: "\u{1F1EC}\u{1F1E7}", format: "XXXX XXXXXX" },
  { name: "India", code: "IN", dial: "+91", flag: "\u{1F1EE}\u{1F1F3}", format: "XXXXX XXXXX" },
  { name: "Canada", code: "CA", dial: "+1", flag: "\u{1F1E8}\u{1F1E6}", format: "(XXX) XXX-XXXX" },
  { name: "Australia", code: "AU", dial: "+61", flag: "\u{1F1E6}\u{1F1FA}", format: "XXX XXX XXX" },
  { name: "Germany", code: "DE", dial: "+49", flag: "\u{1F1E9}\u{1F1EA}", format: "XXXX XXXXXXX" },
  { name: "France", code: "FR", dial: "+33", flag: "\u{1F1EB}\u{1F1F7}", format: "X XX XX XX XX" },
  { name: "Japan", code: "JP", dial: "+81", flag: "\u{1F1EF}\u{1F1F5}", format: "XX-XXXX-XXXX" },
  { name: "China", code: "CN", dial: "+86", flag: "\u{1F1E8}\u{1F1F3}", format: "XXX XXXX XXXX" },
  { name: "Brazil", code: "BR", dial: "+55", flag: "\u{1F1E7}\u{1F1F7}", format: "(XX) XXXXX-XXXX" },
  { name: "Mexico", code: "MX", dial: "+52", flag: "\u{1F1F2}\u{1F1FD}", format: "XX XXXX XXXX" },
  { name: "South Korea", code: "KR", dial: "+82", flag: "\u{1F1F0}\u{1F1F7}", format: "XX-XXXX-XXXX" },
  { name: "Italy", code: "IT", dial: "+39", flag: "\u{1F1EE}\u{1F1F9}", format: "XXX XXX XXXX" },
  { name: "Spain", code: "ES", dial: "+34", flag: "\u{1F1EA}\u{1F1F8}", format: "XXX XX XX XX" },
  { name: "Netherlands", code: "NL", dial: "+31", flag: "\u{1F1F3}\u{1F1F1}", format: "X XXXXXXXX" },
  { name: "Russia", code: "RU", dial: "+7", flag: "\u{1F1F7}\u{1F1FA}", format: "XXX XXX-XX-XX" },
  { name: "South Africa", code: "ZA", dial: "+27", flag: "\u{1F1FF}\u{1F1E6}", format: "XX XXX XXXX" },
  { name: "Nigeria", code: "NG", dial: "+234", flag: "\u{1F1F3}\u{1F1EC}", format: "XXX XXX XXXX" },
  { name: "Argentina", code: "AR", dial: "+54", flag: "\u{1F1E6}\u{1F1F7}", format: "XX XXXX-XXXX" },
  { name: "Saudi Arabia", code: "SA", dial: "+966", flag: "\u{1F1F8}\u{1F1E6}", format: "XX XXX XXXX" },
  { name: "UAE", code: "AE", dial: "+971", flag: "\u{1F1E6}\u{1F1EA}", format: "XX XXX XXXX" },
  { name: "Singapore", code: "SG", dial: "+65", flag: "\u{1F1F8}\u{1F1EC}", format: "XXXX XXXX" },
  { name: "Malaysia", code: "MY", dial: "+60", flag: "\u{1F1F2}\u{1F1FE}", format: "XX-XXX XXXX" },
  { name: "Indonesia", code: "ID", dial: "+62", flag: "\u{1F1EE}\u{1F1E9}", format: "XXX-XXXX-XXXX" },
  { name: "Thailand", code: "TH", dial: "+66", flag: "\u{1F1F9}\u{1F1ED}", format: "XX XXX XXXX" },
  { name: "Philippines", code: "PH", dial: "+63", flag: "\u{1F1F5}\u{1F1ED}", format: "XXX XXX XXXX" },
  { name: "Vietnam", code: "VN", dial: "+84", flag: "\u{1F1FB}\u{1F1F3}", format: "XXX XXX XXXX" },
  { name: "Pakistan", code: "PK", dial: "+92", flag: "\u{1F1F5}\u{1F1F0}", format: "XXX XXXXXXX" },
  { name: "Bangladesh", code: "BD", dial: "+880", flag: "\u{1F1E7}\u{1F1E9}", format: "XXXX XXXXXX" },
  { name: "Egypt", code: "EG", dial: "+20", flag: "\u{1F1EA}\u{1F1EC}", format: "XX XXXX XXXX" },
  { name: "Turkey", code: "TR", dial: "+90", flag: "\u{1F1F9}\u{1F1F7}", format: "XXX XXX XXXX" },
  { name: "Poland", code: "PL", dial: "+48", flag: "\u{1F1F5}\u{1F1F1}", format: "XXX XXX XXX" },
  { name: "Sweden", code: "SE", dial: "+46", flag: "\u{1F1F8}\u{1F1EA}", format: "XX-XXX XX XX" },
  { name: "Switzerland", code: "CH", dial: "+41", flag: "\u{1F1E8}\u{1F1ED}", format: "XX XXX XX XX" },
  { name: "Belgium", code: "BE", dial: "+32", flag: "\u{1F1E7}\u{1F1EA}", format: "XXX XX XX XX" },
  { name: "Austria", code: "AT", dial: "+43", flag: "\u{1F1E6}\u{1F1F9}", format: "XXX XXXXXXX" },
  { name: "Portugal", code: "PT", dial: "+351", flag: "\u{1F1F5}\u{1F1F9}", format: "XXX XXX XXX" },
  { name: "Ireland", code: "IE", dial: "+353", flag: "\u{1F1EE}\u{1F1EA}", format: "XX XXX XXXX" },
  { name: "New Zealand", code: "NZ", dial: "+64", flag: "\u{1F1F3}\u{1F1FF}", format: "XX XXX XXXX" },
  { name: "Israel", code: "IL", dial: "+972", flag: "\u{1F1EE}\u{1F1F1}", format: "XX-XXX-XXXX" },
  { name: "Kenya", code: "KE", dial: "+254", flag: "\u{1F1F0}\u{1F1EA}", format: "XXX XXXXXX" },
  { name: "Colombia", code: "CO", dial: "+57", flag: "\u{1F1E8}\u{1F1F4}", format: "XXX XXX XXXX" },
  { name: "Chile", code: "CL", dial: "+56", flag: "\u{1F1E8}\u{1F1F1}", format: "X XXXX XXXX" },
  { name: "Peru", code: "PE", dial: "+51", flag: "\u{1F1F5}\u{1F1EA}", format: "XXX XXX XXX" },
  { name: "Ukraine", code: "UA", dial: "+380", flag: "\u{1F1FA}\u{1F1E6}", format: "XX XXX XXXX" },
  { name: "Czech Republic", code: "CZ", dial: "+420", flag: "\u{1F1E8}\u{1F1FF}", format: "XXX XXX XXX" },
  { name: "Romania", code: "RO", dial: "+40", flag: "\u{1F1F7}\u{1F1F4}", format: "XXX XXX XXX" },
  { name: "Denmark", code: "DK", dial: "+45", flag: "\u{1F1E9}\u{1F1F0}", format: "XX XX XX XX" },
  { name: "Norway", code: "NO", dial: "+47", flag: "\u{1F1F3}\u{1F1F4}", format: "XXX XX XXX" },
  { name: "Finland", code: "FI", dial: "+358", flag: "\u{1F1EB}\u{1F1EE}", format: "XX XXX XXXX" },
].sort((a, b) => a.name.localeCompare(b.name));

/* ─── Helper: format seconds to mm:ss ────────────────────── */
function formatTime(seconds) {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

/* ─── Helper: auto-format phone number based on country format pattern ── */
function formatPhone(raw, pattern) {
  const digits = raw.replace(/\D/g, "");
  if (!pattern) return digits;
  let result = "";
  let di = 0;
  for (let i = 0; i < pattern.length && di < digits.length; i++) {
    if (pattern[i] === "X") {
      result += digits[di++];
    } else {
      result += pattern[i];
      // If the user's digit matches the separator, skip — otherwise insert separator
    }
  }
  return result;
}

/* ─── Registration steps ─────────────────────────────────── */
const REG_STEPS = [
  { id: "info", label: "Your Info" },
  { id: "password", label: "Password" },
  { id: "verify", label: "Verify Email" },
];

/* ─── Animation variants ─────────────────────────────────── */
const stepTransition = {
  initial: { opacity: 0, x: 20 },
  animate: { opacity: 1, x: 0, transition: { duration: 0.3, ease: "easeOut" } },
  exit: { opacity: 0, x: -20, transition: { duration: 0.2, ease: "easeIn" } },
};

const fieldStagger = {
  animate: { transition: { staggerChildren: 0.05 } },
};

const fieldItem = {
  initial: { opacity: 0, y: 12 },
  animate: { opacity: 1, y: 0, transition: { duration: 0.3, ease: "easeOut" } },
};

const shakeAnimation = { x: [0, -8, 8, -4, 4, 0] };

/* ─── OTP Input Component ─────────────────────────────────── */
function OTPInput({ length = 6, value, onChange }) {
  const refs = useRef([]);
  const digits = Array.from({ length }, (_, i) => value[i] || "");

  const handleChange = (i, val) => {
    if (val.length > 1) val = val.slice(-1);
    if (val && !/^\d$/.test(val)) return;
    const next = [...digits];
    next[i] = val;
    onChange(next.join(""));
    if (val && i < length - 1) refs.current[i + 1]?.focus();
  };

  const handleKeyDown = (i, e) => {
    if (e.key === "Backspace" && !digits[i] && i > 0) {
      refs.current[i - 1]?.focus();
    }
  };

  const handlePaste = (e) => {
    e.preventDefault();
    const pasted = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, length);
    onChange(pasted);
    const focusIdx = Math.min(pasted.length, length - 1);
    refs.current[focusIdx]?.focus();
  };

  return (
    <div className="flex gap-2 justify-center">
      {digits.map((d, i) => (
        <motion.input
          key={i}
          ref={(el) => (refs.current[i] = el)}
          type="text"
          inputMode="numeric"
          maxLength={1}
          value={d}
          onChange={(e) => handleChange(i, e.target.value)}
          onKeyDown={(e) => handleKeyDown(i, e)}
          onPaste={i === 0 ? handlePaste : undefined}
          className="w-11 h-13 text-center text-xl font-bold glass-input rounded-lg focus:outline-none input-glow transition-all duration-200"
          style={{ color: 'var(--text-primary)' }}
          whileFocus={{ scale: 1.08 }}
          transition={{ type: "spring", stiffness: 400, damping: 20 }}
        />
      ))}
    </div>
  );
}

/* ─── Country Selector Dropdown (with flags) ──────────────── */
function CountrySelect({ value, onChange }) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const ref = useRef(null);
  // value is the country code (e.g. "US"), not the dial code
  const selected = COUNTRIES.find((c) => c.code === value) || COUNTRIES.find((c) => c.code === "US");

  useEffect(() => {
    const handler = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const filtered = COUNTRIES.filter(
    (c) =>
      c.name.toLowerCase().includes(search.toLowerCase()) ||
      c.dial.includes(search) ||
      c.code.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => { setOpen(!open); setSearch(""); }}
        className="flex items-center gap-2 glass-input rounded-lg px-3 py-2.5 hover:border-blue-500/30 transition-all duration-200 cursor-pointer min-w-[140px]"
        style={{ color: 'var(--text-primary)' }}
      >
        <span className="text-lg leading-none">{selected.flag}</span>
        <span className="text-sm font-mono text-blue-400">{selected.dial}</span>
        <span className="text-xs truncate max-w-[60px]" style={{ color: 'var(--text-secondary)' }}>{selected.name}</span>
        <svg className={`w-3 h-3 ml-auto transition-transform ${open ? "rotate-180" : ""}`} style={{ color: 'var(--text-muted)' }} fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && (
        <div className="absolute left-0 top-full mt-1 w-80 glass-card rounded-xl shadow-2xl shadow-black/50 z-50 overflow-hidden">
          <div className="p-2 border-b" style={{ borderColor: 'var(--border-default)' }}>
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search country..."
              className="w-full glass-input rounded-lg px-3 py-2 text-sm placeholder-gray-500 focus:outline-none input-glow"
              style={{ color: 'var(--text-primary)' }}
              autoFocus
            />
          </div>
          <div className="max-h-52 overflow-y-auto">
            {filtered.map((c) => (
              <button
                key={`${c.code}-${c.dial}`}
                type="button"
                onClick={() => { onChange(c.code); setOpen(false); }}
                className={`w-full flex items-center gap-3 px-3 py-2 text-sm transition cursor-pointer ${c.code === value ? "bg-blue-600/20" : ""
                  }`}
                style={{ color: c.code === value ? 'var(--text-primary)' : 'var(--text-secondary)' }}
              >
                <span className="text-lg leading-none">{c.flag}</span>
                <span className="font-mono text-blue-400 w-14 text-right">{c.dial}</span>
                <span className="flex-1 text-left">{c.name}</span>
                <span className="text-xs" style={{ color: 'var(--text-muted)' }}>{c.code}</span>
              </button>
            ))}
            {filtered.length === 0 && (
              <p className="text-center text-xs py-4" style={{ color: 'var(--text-muted)' }}>No countries found</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/* ─── Main Login / Register Component ─────────────────────── */
export default function Login() {
  // Mode
  const [isRegister, setIsRegister] = useState(false);
  const [regStep, setRegStep] = useState(0); // 0=info, 1=password, 2=verify email

  // Fields
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [selectedCountry, setSelectedCountry] = useState("US"); // country code, default US
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  // Derive dial code from selected country
  const countryObj = COUNTRIES.find((c) => c.code === selectedCountry) || COUNTRIES.find((c) => c.code === "US");
  const countryCode = countryObj.dial;

  // OTP (email only)
  const [emailOTP, setEmailOTP] = useState("");
  const [emailOTPSent, setEmailOTPSent] = useState(false);
  const [emailVerified, setEmailVerified] = useState(false);
  const [otpCountdown, setOtpCountdown] = useState(0);       // resend cooldown
  const [emailExpiryCountdown, setEmailExpiryCountdown] = useState(0);  // OTP validity timer
  const [emailOtpExpired, setEmailOtpExpired] = useState(false);

  // UI
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const navigate = useNavigate();
  const setAuth = useStore((s) => s.setAuth);
  const _tutorialComplete = useStore((s) => s.tutorialComplete);
  const setTutorialComplete = useStore((s) => s.setTutorialComplete);
  const setOnboardingComplete = useStore((s) => s.setOnboardingComplete);

  // Countdown timer for resend cooldown
  useEffect(() => {
    if (otpCountdown <= 0) return;
    const t = setTimeout(() => setOtpCountdown(otpCountdown - 1), 1000);
    return () => clearTimeout(t);
  }, [otpCountdown]);

  // OTP expiry countdown timer
  useEffect(() => {
    if (emailExpiryCountdown <= 0) {
      if (emailOTPSent && !emailVerified) setEmailOtpExpired(true);
      return;
    }
    setEmailOtpExpired(false);
    const t = setTimeout(() => setEmailExpiryCountdown(emailExpiryCountdown - 1), 1000);
    return () => clearTimeout(t);
  }, [emailExpiryCountdown, emailOTPSent, emailVerified]);

  // Password strength
  const getPasswordStrength = (pwd) => {
    if (!pwd) return { score: 0, label: "", color: "" };
    let score = 0;
    if (pwd.length >= 8) score++;
    if (pwd.length >= 12) score++;
    if (/[A-Z]/.test(pwd)) score++;
    if (/[0-9]/.test(pwd)) score++;
    if (/[^A-Za-z0-9]/.test(pwd)) score++;
    if (score <= 1) return { score, label: "Weak", color: "bg-red-500" };
    if (score <= 2) return { score, label: "Fair", color: "bg-orange-500" };
    if (score <= 3) return { score, label: "Good", color: "bg-yellow-500" };
    if (score <= 4) return { score, label: "Strong", color: "bg-green-500" };
    return { score, label: "Very Strong", color: "bg-emerald-400" };
  };

  const pwdStrength = getPasswordStrength(password);
  const passwordsMatch = confirmPassword && password === confirmPassword;
  const passwordsMismatch = confirmPassword && password !== confirmPassword;

  /* ─── Login handler (email only) ─────────────────────────── */
  const [loginSuccess, setLoginSuccess] = useState(false);

  const handleLogin = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const data = await api.login({ email, password });
      setAuth(data.user, data.access_token);
      if (data.user?.tutorial_completed) {
        setOnboardingComplete(true);
        setTutorialComplete(true);
      }
      setLoginSuccess(true);
      setTimeout(() => navigate("/dashboard"), 600);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  /* ─── Demo test user login (remove before production) ─────── */
  const [demoLoading, setDemoLoading] = useState(false);
  const handleDemoLogin = async () => {
    setError("");
    setDemoLoading(true);
    try {
      const data = await api.demoLogin();
      setAuth(data.user, data.access_token);
      if (data.user?.tutorial_completed) {
        setOnboardingComplete(true);
        setTutorialComplete(true);
      }
      // ProtectedRoute will redirect to /onboarding if needed
      navigate("/dashboard");
    } catch (err) {
      setError(err.message || "Demo login failed");
    } finally {
      setDemoLoading(false);
    }
  };

  /* ─── Step validators ─────────────────────────────────────── */
  const validateStep0 = () => {
    if (!name.trim()) return "Full name is required";
    if (!email.trim()) return "Email is required";
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return "Invalid email format";
    if (!phone.trim()) return "Phone number is required";
    const digits = phone.replace(/[\s\-()]/g, "");
    if (digits.length < 4 || digits.length > 15) return "Phone must be 4-15 digits";
    return null;
  };

  const validateStep1 = () => {
    if (!password) return "Password is required";
    if (password.length < 8) return "Password must be at least 8 characters";
    if (!confirmPassword) return "Please confirm your password";
    if (password !== confirmPassword) return "Passwords do not match";
    return null;
  };

  /* ─── Step navigation ─────────────────────────────────────── */
  const handleNext = () => {
    setError("");
    setSuccess("");
    if (regStep === 0) {
      const err = validateStep0();
      if (err) { setError(err); return; }
      setRegStep(1);
    } else if (regStep === 1) {
      const err = validateStep1();
      if (err) { setError(err); return; }
      // Move to verify step and auto-send OTP
      setRegStep(2);
      handleSendEmailOTP();
    }
  };

  const handleBack = () => {
    setError("");
    setSuccess("");
    if (regStep > 0) setRegStep(regStep - 1);
  };

  /* ─── OTP handlers (email only) ──────────────────────────── */
  const handleSendEmailOTP = async () => {
    setError("");
    setLoading(true);
    try {
      const res = await api.sendEmailOTP(email);
      setEmailOTPSent(true);
      setEmailOTP("");
      setEmailOtpExpired(false);
      setOtpCountdown(res.resend_after || 60);
      setEmailExpiryCountdown(res.expires_in || 600);
      setSuccess("OTP sent to your email. Check your inbox.");
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyEmailOTP = async () => {
    if (emailOTP.length !== 6) { setError("Enter a 6-digit code"); return; }
    setError("");
    setLoading(true);
    try {
      const res = await api.verifyEmailOTP(email, emailOTP);
      if (res.verified) {
        setEmailVerified(true);
        setSuccess("Email verified! Creating your account...");
        setTimeout(() => handleRegister(), 1000);
      } else {
        setError(`Invalid OTP. ${res.remaining_attempts} attempts remaining.`);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  /* ─── Final registration ──────────────────────────────────── */
  const handleRegister = async () => {
    setError("");
    setLoading(true);
    try {
      const digits = phone.replace(/[\s\-()]/g, "");
      const data = await api.register({
        email,
        password,
        confirm_password: confirmPassword,
        name,
        phone: digits,
        country_code: countryCode,
      });
      setAuth(data.user, data.access_token);
      navigate("/onboarding");
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  /* ─── Reset registration state ────────────────────────────── */
  const switchMode = (toRegister) => {
    setIsRegister(toRegister);
    setRegStep(0);
    setError("");
    setSuccess("");
    setEmailOTP("");
    setEmailOTPSent(false);
    setEmailVerified(false);
    setEmailOtpExpired(false);
    setEmailExpiryCountdown(0);
    setOtpCountdown(0);
    setPassword("");
    setConfirmPassword("");
  };

  /* ─── Derive a stable key for AnimatePresence step views ── */
  const _viewKey = isRegister ? `reg-${regStep}` : "login";

  /* ─── Render ──────────────────────────────────────────────── */
  return (
    <div className="min-h-screen flex items-center justify-center px-4 relative overflow-hidden noise-overlay" style={{ background: 'var(--bg-page)' }}>
      {/* 3D background with 2D fallback */}
      <GPUTierProvider>
        <_WebGLBound fallback={<AnimatedBackground />}>
          <Suspense fallback={<AnimatedBackground />}>
            <PageBackground3D mode="auth" />
          </Suspense>
        </_WebGLBound>
      </GPUTierProvider>

      {/* Mesh gradient */}
      <div className="absolute inset-0 mesh-gradient pointer-events-none" />

      {/* Theme toggle */}
      <ThemeToggleBtn />

      {/* Back to home */}
      <button
        onClick={() => navigate("/")}
        className="absolute top-6 left-6 flex items-center gap-2 text-sm hover:text-white transition-all duration-200 cursor-pointer group z-10"
        style={{ color: 'var(--text-muted)' }}
      >
        <svg className="w-4 h-4 group-hover:-translate-x-1 transition-transform duration-200" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
        </svg>
        Back to home
      </button>

      <div className="w-full max-w-md relative z-10 fade-scale-in">
        <div className="text-center mb-8 flex flex-col items-center">
          <div style={{ color: 'var(--text-primary)' }}>
            <AskDBLogo size="lg" />
          </div>
          <p className="mt-3" style={{ color: 'var(--text-secondary)' }}>The agentic data intelligence platform</p>
        </div>

        <div className="glass-card rounded-2xl p-8 relative overflow-hidden">
          {/* Login success overlay */}
          <AnimatePresence>
            {loginSuccess && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="absolute inset-0 z-20 flex flex-col items-center justify-center rounded-2xl"
                style={{ background: 'var(--glass-bg-card-elevated)', backdropFilter: 'blur(8px)' }}
              >
                <motion.div
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ type: "spring", stiffness: 200, damping: 15 }}
                  className="w-16 h-16 rounded-full flex items-center justify-center mb-4"
                  style={{ background: 'rgba(34,197,94,0.1)', border: '2px solid #22c55e' }}
                >
                  <svg className="w-8 h-8 text-green-400 check-draw" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
                    <path d="M5 13l4 4L19 7" />
                  </svg>
                </motion.div>
                <motion.p
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.2 }}
                  className="text-sm font-medium"
                  style={{ color: 'var(--text-primary)' }}
                >Welcome back</motion.p>
              </motion.div>
            )}
          </AnimatePresence>
          <h2 className="text-xl font-semibold mb-2" style={{ color: 'var(--text-primary)' }}>
            {isRegister ? "Create Account" : "Sign In"}
          </h2>

          {/* Registration step indicator */}
          {isRegister && (
            <div className="flex items-center gap-1 mb-6 mt-3">
              {REG_STEPS.map((s, i) => (
                <div key={s.id} className="flex items-center flex-1">
                  <div className="flex flex-col items-center flex-1">
                    <div
                      className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold transition-all duration-300 ${i < regStep
                          ? "bg-green-500 text-white shadow-lg shadow-green-500/30"
                          : i === regStep
                            ? "bg-blue-600 text-white ring-2 ring-blue-400/30 shadow-lg shadow-blue-600/20"
                            : "glass"
                        }`}
                      style={i >= regStep ? { color: 'var(--text-muted)' } : undefined}
                    >
                      {i < regStep ? (
                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                        </svg>
                      ) : (
                        i + 1
                      )}
                    </div>
                    <span className={`text-[10px] mt-1 ${i === regStep ? "text-blue-400" : ""}`} style={i !== regStep ? { color: 'var(--text-muted)' } : undefined}>
                      {s.label}
                    </span>
                  </div>
                  {i < REG_STEPS.length - 1 && (
                    <div className={`h-px flex-1 mx-1 mb-4 transition-colors duration-300 ${i < regStep ? "bg-green-500" : ""}`} style={i >= regStep ? { background: 'var(--border-default)' } : undefined} />
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Error / Success with shake animation */}
          <AnimatePresence mode="wait">
            {error && (
              <motion.div
                key="error"
                initial={{ opacity: 0, y: -8 }}
                animate={{ opacity: 1, y: 0, ...shakeAnimation }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.4 }}
                className="bg-red-900/20 border border-red-800/50 text-red-400 rounded-lg p-3 mb-4 text-sm flex items-start gap-2 backdrop-blur-sm"
                role="alert"
              >
                <svg className="w-4 h-4 mt-0.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
                </svg>
                {error}
              </motion.div>
            )}
          </AnimatePresence>
          {success && (
            <div className="bg-green-900/20 border border-green-800/50 text-green-400 rounded-lg p-3 mb-4 text-sm flex items-start gap-2 backdrop-blur-sm" role="status">
              <svg className="w-4 h-4 mt-0.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              {success}
            </div>
          )}

          {/* Step transitions */}
          <AnimatePresence mode="wait">
            {/* ============ SIGN IN FORM (email only) ============ */}
            {!isRegister && (
              <motion.form
                key="login"
                variants={stepTransition}
                initial="initial"
                animate="animate"
                exit="exit"
                onSubmit={handleLogin}
              >
                <motion.div variants={fieldStagger} initial="initial" animate="animate">
                  <motion.div variants={fieldItem} className="mb-4">
                    <label className="block text-sm mb-1" style={{ color: 'var(--text-secondary)' }}>Email</label>
                    <input
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="w-full glass-input rounded-lg px-4 py-2.5 focus:outline-none input-glow transition" style={{ color: 'var(--text-primary)' }}
                      placeholder="you@example.com"
                      required
                    />
                  </motion.div>

                  <motion.div variants={fieldItem} className="mb-6">
                    <label className="block text-sm mb-1" style={{ color: 'var(--text-secondary)' }}>Password</label>
                    <input
                      type="password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="w-full glass-input rounded-lg px-4 py-2.5 focus:outline-none input-glow transition" style={{ color: 'var(--text-primary)' }}
                      placeholder="Enter your password"
                      required
                    />
                  </motion.div>

                  <motion.div variants={fieldItem}>
                    <button
                      type="submit"
                      disabled={loading}
                      className="w-full bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-semibold rounded-full py-3 pl-6 pr-2 cursor-pointer ease-spring transition flex items-center justify-between group"
                    >
                      <span className="ml-auto">{loading ? "Signing in..." : "Sign in"}</span>
                      <span className="btn-nested-arrow ml-auto">
                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
                        </svg>
                      </span>
                    </button>
                  </motion.div>
                </motion.div>
              </motion.form>
            )}

            {/* ============ REGISTRATION STEP 0: Info ============ */}
            {isRegister && regStep === 0 && (
              <motion.div
                key="reg-0"
                variants={stepTransition}
                initial="initial"
                animate="animate"
                exit="exit"
              >
                <motion.div variants={fieldStagger} initial="initial" animate="animate" className="space-y-4">
                  <motion.div variants={fieldItem}>
                    <label className="block text-sm mb-1" style={{ color: 'var(--text-secondary)' }}>Full Name <span className="text-red-400">*</span></label>
                    <input
                      type="text"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      className="w-full glass-input rounded-lg px-4 py-2.5 focus:outline-none input-glow transition" style={{ color: 'var(--text-primary)' }}
                      placeholder="Your full name"
                    />
                  </motion.div>
                  <motion.div variants={fieldItem}>
                    <label className="block text-sm mb-1" style={{ color: 'var(--text-secondary)' }}>Email Address <span className="text-red-400">*</span></label>
                    <input
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="w-full glass-input rounded-lg px-4 py-2.5 focus:outline-none input-glow transition" style={{ color: 'var(--text-primary)' }}
                      placeholder="you@example.com"
                    />
                  </motion.div>
                  <motion.div variants={fieldItem}>
                    <label className="block text-sm mb-1" style={{ color: 'var(--text-secondary)' }}>Mobile Number <span className="text-red-400">*</span></label>
                    <div className="flex gap-2">
                      <CountrySelect value={selectedCountry} onChange={setSelectedCountry} />
                      <input
                        type="tel"
                        value={phone}
                        onChange={(e) => setPhone(formatPhone(e.target.value, countryObj.format))}
                        className="flex-1 glass-input rounded-lg px-4 py-2.5 focus:outline-none input-glow transition" style={{ color: 'var(--text-primary)' }}
                        placeholder={countryObj.format || "Phone number"}
                      />
                    </div>
                    <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>
                      {countryObj.flag} {countryCode} will be added automatically
                    </p>
                  </motion.div>
                  <motion.div variants={fieldItem}>
                    <button
                      onClick={handleNext}
                      className="w-full bg-blue-600 hover:bg-blue-500 text-white font-semibold rounded-full py-3 pl-6 pr-2 cursor-pointer ease-spring transition flex items-center justify-between group"
                    >
                      <span className="ml-auto">Continue</span>
                      <span className="btn-nested-arrow ml-auto">
                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
                        </svg>
                      </span>
                    </button>
                  </motion.div>
                </motion.div>
              </motion.div>
            )}

            {/* ============ REGISTRATION STEP 1: Password ============ */}
            {isRegister && regStep === 1 && (
              <motion.div
                key="reg-1"
                variants={stepTransition}
                initial="initial"
                animate="animate"
                exit="exit"
              >
                <motion.div variants={fieldStagger} initial="initial" animate="animate" className="space-y-4">
                  <motion.div variants={fieldItem}>
                    <label className="block text-sm mb-1" style={{ color: 'var(--text-secondary)' }}>Password <span className="text-red-400">*</span></label>
                    <div className="relative">
                      <input
                        type={showPassword ? "text" : "password"}
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        className="w-full glass-input rounded-lg px-4 py-2.5 pr-10 focus:outline-none input-glow transition" style={{ color: 'var(--text-primary)' }}
                        placeholder="Min 8 characters"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300 cursor-pointer"
                      >
                        {showPassword ? (
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" /></svg>
                        ) : (
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>
                        )}
                      </button>
                    </div>
                    {/* Strength bar */}
                    {password && (
                      <div className="mt-2">
                        <div className="flex gap-1 mb-1">
                          {[1, 2, 3, 4, 5].map((i) => (
                            <div
                              key={i}
                              className={`h-1 flex-1 rounded-full transition-colors ${i <= pwdStrength.score ? pwdStrength.color : "bg-gray-700"
                                }`}
                            />
                          ))}
                        </div>
                        <p className={`text-xs ${pwdStrength.color.replace("bg-", "text-")}`}>
                          {pwdStrength.label}
                        </p>
                      </div>
                    )}
                  </motion.div>

                  <motion.div variants={fieldItem}>
                    <label className="block text-sm mb-1" style={{ color: 'var(--text-secondary)' }}>Confirm Password <span className="text-red-400">*</span></label>
                    <div className="relative">
                      <input
                        type={showConfirm ? "text" : "password"}
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        className={`w-full glass-input rounded-lg px-4 py-2.5 pr-10 focus:outline-none transition ${passwordsMismatch
                            ? "!border-red-500 focus:!border-red-500"
                            : passwordsMatch
                              ? "!border-green-500 focus:!border-green-500"
                              : ""
                          }`}
                        placeholder="Re-enter password"
                      />
                      <button
                        type="button"
                        onClick={() => setShowConfirm(!showConfirm)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300 cursor-pointer"
                      >
                        {showConfirm ? (
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" /></svg>
                        ) : (
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>
                        )}
                      </button>
                      {/* Match indicator */}
                      {passwordsMatch && (
                        <span className="absolute right-10 top-1/2 -translate-y-1/2 text-green-400">
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                          </svg>
                        </span>
                      )}
                    </div>
                    {passwordsMismatch && (
                      <p className="text-xs text-red-400 mt-1">Passwords do not match</p>
                    )}
                  </motion.div>

                  <motion.div variants={fieldItem} className="flex gap-3">
                    <MotionButton
                      onClick={handleBack}
                      className="flex-1 glass hover:bg-white/10 font-medium rounded-lg py-2.5 transition-all duration-200 cursor-pointer" style={{ color: 'var(--text-secondary)' }}
                    >
                      Back
                    </MotionButton>
                    <MotionButton
                      onClick={handleNext}
                      disabled={!passwordsMatch}
                      className="flex-1 bg-blue-600 hover:bg-blue-700 disabled:opacity-40 text-white font-medium rounded-lg py-2.5 transition cursor-pointer"
                    >
                      Continue
                    </MotionButton>
                  </motion.div>
                </motion.div>
              </motion.div>
            )}

            {/* ============ REGISTRATION STEP 2: Verify Email ============ */}
            {isRegister && regStep === 2 && (
              <motion.div
                key="reg-2"
                variants={stepTransition}
                initial="initial"
                animate="animate"
                exit="exit"
                className="space-y-5"
              >
                <div className="text-center">
                  <div className="w-14 h-14 rounded-full bg-blue-600/20 flex items-center justify-center mx-auto mb-3">
                    <svg className="w-7 h-7 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                    </svg>
                  </div>
                  <h3 className="font-semibold mb-1" style={{ color: 'var(--text-primary)' }}>Verify Your Email</h3>
                  <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                    We sent a 6-digit code to <span className="text-blue-400 font-medium">{email}</span>
                  </p>
                </div>

                {emailVerified ? (
                  <div className="text-center py-4">
                    <div className="w-12 h-12 rounded-full bg-green-500/20 flex items-center justify-center mx-auto mb-2">
                      <svg className="w-6 h-6 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                      </svg>
                    </div>
                    <p className="text-green-400 font-medium">Email Verified</p>
                    <p className="text-sm mt-1" style={{ color: 'var(--text-muted)' }}>Creating your account...</p>
                    <div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mt-3" />
                  </div>
                ) : emailOtpExpired ? (
                  <div className="text-center py-4 space-y-3">
                    <div className="w-12 h-12 rounded-full bg-red-500/20 flex items-center justify-center mx-auto mb-2">
                      <svg className="w-6 h-6 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                    </div>
                    <p className="text-red-400 font-medium">OTP Expired</p>
                    <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>Your verification code has expired.</p>
                    <MotionButton onClick={handleSendEmailOTP} disabled={loading}
                      className="w-full bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-white font-semibold rounded-lg py-2.5 transition-all duration-300 cursor-pointer shadow-lg shadow-blue-600/15 btn-glow">
                      {loading ? "Sending..." : "Send New OTP"}
                    </MotionButton>
                  </div>
                ) : (
                  <>
                    {emailExpiryCountdown > 0 && (
                      <div className="flex items-center justify-center gap-2 text-sm">
                        <svg className="w-4 h-4 text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        <span className={`font-mono ${emailExpiryCountdown <= 60 ? "text-red-400" : emailExpiryCountdown <= 180 ? "text-amber-400" : "text-gray-400"}`}>
                          Code expires in {formatTime(emailExpiryCountdown)}
                        </span>

                      </div>
                    )}
                    <OTPInput value={emailOTP} onChange={setEmailOTP} />
                    <MotionButton onClick={handleVerifyEmailOTP} disabled={loading || emailOTP.length !== 6}
                      className="w-full bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-white font-semibold rounded-lg py-2.5 transition-all duration-300 cursor-pointer shadow-lg shadow-blue-600/15 btn-glow">
                      {loading ? "Verifying..." : "Verify Email"}
                    </MotionButton>
                    <p className="text-center text-sm" style={{ color: 'var(--text-muted)' }}>
                      {otpCountdown > 0 ? (
                        <>Resend in <span className="text-blue-400 font-mono">{otpCountdown}s</span></>
                      ) : (
                        <button onClick={handleSendEmailOTP} disabled={loading}
                          className="text-blue-400 hover:text-blue-300 cursor-pointer">Resend OTP</button>
                      )}
                    </p>
                  </>
                )}

                {/* Back button */}
                <MotionButton
                  onClick={handleBack}
                  className="w-full glass hover:bg-white/10 text-sm rounded-lg py-2 transition-all duration-200 cursor-pointer" style={{ color: 'var(--text-secondary)' }}
                >
                  Back
                </MotionButton>
              </motion.div>
            )}
          </AnimatePresence>

          {/* ============ Divider + OAuth (login mode & step 0 of register) ============ */}
          {(!isRegister || (isRegister && regStep === 0)) && (
            <>
              <div className="flex items-center gap-3 my-6">
                <div className="flex-1 h-px" style={{ background: 'var(--border-default)' }} />
                <span className="text-xs uppercase" style={{ color: 'var(--text-muted)' }}>or continue with</span>
                <div className="flex-1 h-px" style={{ background: 'var(--border-default)' }} />
              </div>

              <div className="flex gap-3">
                <MotionButton
                  onClick={async () => {
                    try {
                      const data = await api.getOAuthURL("google");
                      localStorage.setItem("oauth_provider", "google");
                      window.location.href = data.url;
                    } catch (err) { setError(err.message); }
                  }}
                  className="flex-1 flex items-center justify-center gap-2 glass-light rounded-lg py-2.5 text-sm hover:bg-white/10 hover:border-gray-500/30 transition-all duration-200 cursor-pointer" style={{ color: 'var(--text-secondary)' }}
                >
                  <svg className="w-4 h-4" viewBox="0 0 24 24">
                    <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4" />
                    <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
                    <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
                    <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
                  </svg>
                  Google
                </MotionButton>
                <MotionButton
                  onClick={async () => {
                    try {
                      const data = await api.getOAuthURL("github");
                      localStorage.setItem("oauth_provider", "github");
                      window.location.href = data.url;
                    } catch (err) { setError(err.message); }
                  }}
                  className="flex-1 flex items-center justify-center gap-2 glass-light rounded-lg py-2.5 text-sm hover:bg-white/10 hover:border-gray-500/30 transition-all duration-200 cursor-pointer" style={{ color: 'var(--text-secondary)' }}
                >
                  <svg className="w-4 h-4 fill-current" viewBox="0 0 24 24">
                    <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z" />
                  </svg>
                  GitHub
                </MotionButton>
              </div>
            </>
          )}

          {/* Toggle sign in / register */}
          <p className="text-center text-sm mt-5" style={{ color: 'var(--text-muted)' }}>
            {isRegister ? "Already have an account?" : "Don't have an account?"}{" "}
            <button
              type="button"
              onClick={() => switchMode(!isRegister)}
              className="text-blue-400 hover:text-blue-300 cursor-pointer"
            >
              {isRegister ? "Sign In" : "Register"}
            </button>
          </p>
        </div>

        {/* Dev hint for OTP */}
        {isRegister && regStep === 2 && (
          <p className="text-center text-[11px] mt-3" style={{ color: 'var(--text-muted)' }}>
            Dev mode: OTPs are logged in backend/.data/sent_otps.log
          </p>
        )}

        {/* Demo test user — remove before production */}
        <div className="mt-4 pt-4" style={{ borderTop: '1px dashed var(--border-default)' }}>
          <button
            type="button"
            onClick={handleDemoLogin}
            disabled={demoLoading}
            className="w-full py-2.5 rounded-xl text-sm font-medium transition-all duration-200 cursor-pointer"
            style={{
              background: 'linear-gradient(135deg, rgba(245,158,11,0.15), rgba(239,68,68,0.15))',
              border: '1px solid rgba(245,158,11,0.3)',
              color: '#fbbf24',
              opacity: demoLoading ? 0.6 : 1,
            }}
          >
            {demoLoading ? 'Logging in...' : 'Demo Test User'}
          </button>
          <p className="text-center text-[10px] mt-1.5" style={{ color: 'var(--text-muted)' }}>
            Instant login with a pre-made test account
          </p>
        </div>
      </div>
    </div>
  );
}
