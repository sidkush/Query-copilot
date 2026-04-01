import { useNavigate } from "react-router-dom";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence, useInView } from "framer-motion";
import { useStore } from "../store";
import AnimatedCounter from "../components/animation/AnimatedCounter";
import AnimatedBackground from "../components/animation/AnimatedBackground";
import MotionButton from "../components/animation/MotionButton";
import { useScrollReveal } from "../components/animation/useScrollReveal";
import demoMultidb from "../assets/demo_multidb.gif";
import demoSwitching from "../assets/demo_switching.gif";
import demoER from "../assets/demo_er.gif";
import demoBilling from "../assets/demo_billing.gif";

const DEMO_SLIDES = [
  {
    id: "multidb",
    label: "Multi-DB Connect",
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
      </svg>
    ),
    gif: demoMultidb,
    title: "Connect 16 Databases",
    desc: "PostgreSQL, MySQL, Snowflake, BigQuery, DuckDB, SQL Server, Oracle, Redshift, and more. Fill in credentials and go \u2014 schema discovery is automatic.",
  },
  {
    id: "switching",
    label: "Switch Databases",
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 21L3 16.5m0 0L7.5 12M3 16.5h13.5m0-13.5L21 7.5m0 0L16.5 12M21 7.5H7.5" />
      </svg>
    ),
    gif: demoSwitching,
    title: "Switch Between Databases Instantly",
    desc: "Use the in-chat database selector to query different databases without leaving the conversation. Results stay scoped to the active connection.",
  },
  {
    id: "er",
    label: "ER Diagram",
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6A2.25 2.25 0 016 3.75h2.25A2.25 2.25 0 0110.5 6v2.25a2.25 2.25 0 01-2.25 2.25H6a2.25 2.25 0 01-2.25-2.25V6zM3.75 15.75A2.25 2.25 0 016 13.5h2.25a2.25 2.25 0 012.25 2.25V18a2.25 2.25 0 01-2.25 2.25H6A2.25 2.25 0 013.75 18v-2.25zM13.5 6a2.25 2.25 0 012.25-2.25H18A2.25 2.25 0 0120.25 6v2.25A2.25 2.25 0 0118 10.5h-2.25a2.25 2.25 0 01-2.25-2.25V6z" />
      </svg>
    ),
    gif: demoER,
    title: "Interactive ER Diagrams",
    desc: "One click to visualise your entire schema. Drag tables to rearrange, see primary keys, foreign keys, and relationships at a glance.",
  },
  {
    id: "billing",
    label: "Easy Billing",
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 8.25h19.5M2.25 9h19.5m-16.5 5.25h6m-6 2.25h3m-3.75 3h15a2.25 2.25 0 002.25-2.25V6.75A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25v10.5A2.25 2.25 0 004.5 19.5z" />
      </svg>
    ),
    gif: demoBilling,
    title: "Simple, Transparent Billing",
    desc: "Free, Pro, or Enterprise \u2014 upgrade or downgrade in one click. Powered by Stripe for secure payments with no surprises.",
  },
];

const PAYMENT_LINKS = {
  weekly: "https://buy.stripe.com/test_5kQbJ30oo8bJ7oEaqF4c800",
  monthly: "https://buy.stripe.com/test_14A6oJ3AAgIf38ocyN4c801",
  yearly: "https://buy.stripe.com/test_eVqbJ38UUfEb24keGV4c802",
};

const FEATURES = [
  { icon: "ai", title: "AI-Powered SQL Generation", desc: "Claude AI reads your schema via ChromaDB RAG and writes precise SQL for any business question \u2014 aggregations, date ranges, joins \u2014 all handled automatically.", tags: ["Claude Haiku", "Claude Sonnet", "Smart Routing"], span: "col-span-2" },
  { icon: "speed", title: "Average Response", num: "3s", desc: "From question to chart", span: "" },
  { icon: "shield", title: "Secure by Design", desc: "Read-only connections. PII masking. SQL validation. bcrypt auth. Zero raw data stored.", tags: ["Read-Only", "bcrypt", "PII Masking"], span: "" },
  { icon: "chart", title: "Auto-Charts", desc: "Detects the best visualisation \u2014 line, bar or pie \u2014 for every result set. Powered by Recharts.", tags: ["Recharts", "Line", "Bar", "Pie"], span: "col-span-2" },
  { icon: "database", title: "Databases", num: "16", desc: "PG \u00B7 MySQL \u00B7 Snowflake \u00B7 BigQuery \u00B7 DuckDB \u00B7 SQL Server & more", span: "" },
  { icon: "export", title: "One-Click Export", desc: "CSV, Excel or Slack \u2014 results wherever your team works.", tags: ["CSV", "Excel", "JSON"], span: "" },
  { icon: "brain", title: "Accuracy", num: "90%", desc: "Improves with feedback", span: "" },
];

const STEPS = [
  { num: 1, title: "Connect your database", desc: "Enter your credentials once. QueryCopilot auto-discovers your schema and trains on it in seconds. Read-only \u2014 it can never modify your data.", icon: <svg className="w-7 h-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M20.25 6.375c0 2.278-3.694 4.125-8.25 4.125S3.75 8.653 3.75 6.375m16.5 0c0-2.278-3.694-4.125-8.25-4.125S3.75 4.097 3.75 6.375m16.5 0v11.25c0 2.278-3.694 4.125-8.25 4.125s-8.25-1.847-8.25-4.125V6.375" /></svg> },
  { num: 2, title: "Ask in plain English", desc: "Type any business question in the chat. The AI understands your column names, business logic, and time ranges \u2014 no SQL knowledge needed.", icon: <svg className="w-7 h-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" /></svg> },
  { num: 3, title: "Get results instantly", desc: "A plain-English summary, interactive table, auto-generated chart and downloadable CSV \u2014 all in under 3 seconds.", icon: <svg className="w-7 h-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z" /></svg> },
];

const STATS = [
  { value: 3, suffix: "s", label: "Average query time" },
  { value: 90, suffix: "%", label: "SQL accuracy out of the box" },
  { value: 31, suffix: "+", label: "SQL dialects supported" },
  { value: 16, suffix: " DBs", label: "Connectors ready to use" },
];

const TESTIMONIALS = [
  { name: "Sarah Johnson", role: "Head of Growth \u00B7 Nexora", avatar: "SJ", quote: "Our marketing team now self-serves 80% of their data requests. QueryCopilot paid for itself in the first week." },
  { name: "Marcus Chen", role: "Senior Data Engineer \u00B7 TechFlow", avatar: "MC", quote: "I was skeptical about NL-to-SQL accuracy, but QueryCopilot nails our complex schemas. The RAG approach is a game changer." },
  { name: "Aisha Patel", role: "VP Operations \u00B7 DataSync", avatar: "AP", quote: "Setup took 15 minutes. My entire ops team was querying our Postgres DB by end of day. Incredible product." },
];

const PLANS = [
  { name: "Weekly", price: "$9", period: "per week", badge: null, featured: false, features: ["50 queries / week", "PostgreSQL & MySQL", "CSV & Excel export", "Auto-charts"], link: PAYMENT_LINKS.weekly, cta: "Start Weekly" },
  { name: "Monthly", price: "$29", period: "per month", badge: "Most Popular", featured: true, features: ["Unlimited queries", "All 16 databases", "CSV, Excel & PDF", "Auto-charts + Plotly", "Slack bot", "PII masking"], link: PAYMENT_LINKS.monthly, cta: "Start Monthly" },
  { name: "Yearly", price: "$199", period: "per year \u00B7 save 43%", badge: null, featured: false, features: ["Unlimited queries", "All 16 databases", "CSV, Excel & PDF", "Auto-charts + Plotly", "Slack bot", "PII masking", "Priority support (24h SLA)", "Up to 10 team seats"], link: PAYMENT_LINKS.yearly, cta: "Start Yearly \u2014 Best Value" },
];

const TRUST = ["Acme Corp", "TechFlow", "DataSync", "Nexora", "PulseAI", "Velotech"];


const FEATURE_ICONS = {
  ai: (
    <div className="w-12 h-12 rounded-xl bg-indigo-500/15 flex items-center justify-center mb-4 group-hover:bg-indigo-500/25 transition-colors duration-300">
      <svg className="w-6 h-6 text-indigo-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.455 2.456L21.75 6l-1.036.259a3.375 3.375 0 00-2.455 2.456z" />
      </svg>
    </div>
  ),
  speed: (
    <div className="w-12 h-12 rounded-xl bg-amber-500/15 flex items-center justify-center mb-4 group-hover:bg-amber-500/25 transition-colors duration-300">
      <svg className="w-6 h-6 text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z" />
      </svg>
    </div>
  ),
  shield: (
    <div className="w-12 h-12 rounded-xl bg-emerald-500/15 flex items-center justify-center mb-4 group-hover:bg-emerald-500/25 transition-colors duration-300">
      <svg className="w-6 h-6 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
      </svg>
    </div>
  ),
  chart: (
    <div className="w-12 h-12 rounded-xl bg-violet-500/15 flex items-center justify-center mb-4 group-hover:bg-violet-500/25 transition-colors duration-300">
      <svg className="w-6 h-6 text-violet-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" />
      </svg>
    </div>
  ),
  database: (
    <div className="w-12 h-12 rounded-xl bg-cyan-500/15 flex items-center justify-center mb-4 group-hover:bg-cyan-500/25 transition-colors duration-300">
      <svg className="w-6 h-6 text-cyan-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M20.25 6.375c0 2.278-3.694 4.125-8.25 4.125S3.75 8.653 3.75 6.375m16.5 0c0-2.278-3.694-4.125-8.25-4.125S3.75 4.097 3.75 6.375m16.5 0v11.25c0 2.278-3.694 4.125-8.25 4.125s-8.25-1.847-8.25-4.125V6.375m16.5 0v3.75m-16.5-3.75v3.75m16.5 0v3.75C20.25 16.153 16.556 18 12 18s-8.25-1.847-8.25-4.125v-3.75m16.5 0c0 2.278-3.694 4.125-8.25 4.125s-8.25-1.847-8.25-4.125" />
      </svg>
    </div>
  ),
  export: (
    <div className="w-12 h-12 rounded-xl bg-rose-500/15 flex items-center justify-center mb-4 group-hover:bg-rose-500/25 transition-colors duration-300">
      <svg className="w-6 h-6 text-rose-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
      </svg>
    </div>
  ),
  brain: (
    <div className="w-12 h-12 rounded-xl bg-pink-500/15 flex items-center justify-center mb-4 group-hover:bg-pink-500/25 transition-colors duration-300">
      <svg className="w-6 h-6 text-pink-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M4.26 10.147a60.438 60.438 0 00-.491 6.347A48.62 48.62 0 0112 20.904a48.62 48.62 0 018.232-4.41 60.46 60.46 0 00-.491-6.347m-15.482 0a50.636 50.636 0 00-2.658-.813A59.906 59.906 0 0112 3.493a59.903 59.903 0 0110.399 5.84c-.896.248-1.783.52-2.658.814m-15.482 0A50.717 50.717 0 0112 13.489a50.702 50.702 0 017.74-3.342" />
      </svg>
    </div>
  ),
};

/* ── Spring animation variants ── */
const springIn = {
  hidden: { opacity: 0, y: 40 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { type: "spring", stiffness: 100, damping: 15, mass: 0.8 },
  },
};

const staggerContainer = {
  hidden: {},
  visible: {
    transition: { staggerChildren: 0.08, delayChildren: 0.1 },
  },
};

const staggerItem = {
  hidden: { opacity: 0, y: 30 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { type: "spring", stiffness: 120, damping: 14 },
  },
};

const fadeScale = {
  hidden: { opacity: 0, scale: 0.92 },
  visible: {
    opacity: 1,
    scale: 1,
    transition: { type: "spring", stiffness: 100, damping: 18 },
  },
};

/* ── Section wrapper with scroll-reveal ── */
function RevealSection({ children, className = "", ...props }) {
  const { ref, isInView } = useScrollReveal({ once: true, margin: "-60px", amount: 0.08 });
  return (
    <motion.div
      ref={ref}
      initial="hidden"
      animate={isInView ? "visible" : "hidden"}
      variants={staggerContainer}
      className={className}
      {...props}
    >
      {children}
    </motion.div>
  );
}

/* ── Demo Carousel Component ── */
function DemoCarousel() {
  const [active, setActive] = useState(0);
  const slide = DEMO_SLIDES[active];

  return (
    <div className="max-w-5xl mx-auto">
      {/* Tab bar */}
      <div className="flex flex-wrap justify-center gap-2 mb-8">
        {DEMO_SLIDES.map((s, i) => (
          <motion.button
            key={s.id}
            onClick={() => setActive(i)}
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.96 }}
            transition={{ type: "spring", stiffness: 400, damping: 17 }}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium transition-all duration-300 cursor-pointer ${
              i === active
                ? "bg-indigo-600 text-white shadow-lg shadow-indigo-500/30"
                : "glass-light text-gray-400 hover:text-white hover:border-gray-600"
            }`}
          >
            {s.icon}
            <span className="hidden sm:inline">{s.label}</span>
          </motion.button>
        ))}
      </div>

      {/* Content area */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6 items-start">
        {/* GIF panel with crossfade */}
        <div className="lg:col-span-3 rounded-2xl overflow-hidden glass-card relative" style={{ minHeight: 300 }}>
          <AnimatePresence mode="wait">
            <motion.img
              key={slide.id}
              src={slide.gif}
              alt={slide.title}
              className="w-full h-auto"
              loading="lazy"
              initial={{ opacity: 0, scale: 0.97 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 1.02 }}
              transition={{ duration: 0.4, ease: "easeInOut" }}
            />
          </AnimatePresence>
        </div>

        {/* Info panel */}
        <div className="lg:col-span-2 flex flex-col justify-center">
          <AnimatePresence mode="wait">
            <motion.div
              key={slide.id}
              className="glass-card rounded-2xl p-6 sm:p-8"
              initial={{ opacity: 0, x: 30 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -30 }}
              transition={{ type: "spring", stiffness: 200, damping: 22 }}
            >
              <div className="w-12 h-12 rounded-xl bg-indigo-500/15 flex items-center justify-center mb-5 text-indigo-400">
                {slide.icon}
              </div>
              <h3 className="text-xl sm:text-2xl font-bold text-white mb-3">{slide.title}</h3>
              <p className="text-gray-400 leading-relaxed mb-6">{slide.desc}</p>

              {/* Progress dots */}
              <div className="flex items-center gap-3">
                {DEMO_SLIDES.map((_, i) => (
                  <button
                    key={i}
                    onClick={() => setActive(i)}
                    className={`h-1.5 rounded-full transition-all duration-300 cursor-pointer ${
                      i === active ? "w-8 bg-indigo-500" : "w-4 bg-gray-700 hover:bg-gray-600"
                    }`}
                  />
                ))}
                <span className="text-xs text-gray-600 ml-auto">{active + 1} / {DEMO_SLIDES.length}</span>
              </div>
            </motion.div>
          </AnimatePresence>

          {/* Nav arrows */}
          <div className="flex gap-2 mt-4 justify-end">
            <MotionButton
              onClick={() => setActive((active - 1 + DEMO_SLIDES.length) % DEMO_SLIDES.length)}
              className="w-10 h-10 rounded-xl glass-light flex items-center justify-center text-gray-400 hover:text-white transition cursor-pointer"
              aria-label="Previous demo"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
              </svg>
            </MotionButton>
            <MotionButton
              onClick={() => setActive((active + 1) % DEMO_SLIDES.length)}
              className="w-10 h-10 rounded-xl glass-light flex items-center justify-center text-gray-400 hover:text-white transition cursor-pointer"
              aria-label="Next demo"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
              </svg>
            </MotionButton>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ── Staggered subtitle words ── */
function StaggeredText({ text, className = "" }) {
  const words = text.split(" ");
  return (
    <motion.span
      className={className}
      variants={staggerContainer}
      initial="hidden"
      animate="visible"
    >
      {words.map((word, i) => (
        <motion.span
          key={i}
          className="inline-block mr-[0.3em]"
          variants={{
            hidden: { opacity: 0, y: 20, filter: "blur(4px)" },
            visible: {
              opacity: 1,
              y: 0,
              filter: "blur(0px)",
              transition: { type: "spring", stiffness: 150, damping: 15, delay: i * 0.06 },
            },
          }}
        >
          {word}
        </motion.span>
      ))}
    </motion.span>
  );
}

export default function Landing() {
  const navigate = useNavigate();
  const token = useStore((s) => s.token);
  const scrollTo = (id) => document.getElementById(id)?.scrollIntoView({ behavior: "smooth" });
  const [scrolled, setScrolled] = useState(false);
  const [showScrollTop, setShowScrollTop] = useState(false);

  useEffect(() => {
    const handler = () => {
      setScrolled(window.scrollY > 20);
      setShowScrollTop(window.scrollY > 100);
    };
    window.addEventListener("scroll", handler, { passive: true });
    return () => window.removeEventListener("scroll", handler);
  }, []);

  return (
    <div className="min-h-screen bg-[#06060e] text-gray-100 overflow-x-hidden relative noise-overlay">
      {/* ── Navbar (Glassmorphism) ── */}
      <nav className={`sticky top-0 z-50 transition-all duration-500 ${scrolled ? "glass-navbar shadow-lg" : "bg-transparent border-b border-transparent"}`}>
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
          <span className="text-xl font-extrabold tracking-tight">Query<span className="text-indigo-400">Copilot</span></span>
          <div className="hidden md:flex items-center gap-8">
            <button onClick={() => scrollTo("features")} className="text-sm text-gray-400 hover:text-white transition-colors duration-200 cursor-pointer">Features</button>
            <button onClick={() => scrollTo("how")} className="text-sm text-gray-400 hover:text-white transition-colors duration-200 cursor-pointer">How It Works</button>
            <button onClick={() => scrollTo("pricing")} className="text-sm text-gray-400 hover:text-white transition-colors duration-200 cursor-pointer">Pricing</button>
          </div>
          <div className="flex items-center gap-3">
            {token ? (
              <MotionButton onClick={() => navigate("/dashboard")} className="px-5 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-semibold rounded-full transition-all duration-300 shadow-lg shadow-indigo-500/25 cursor-pointer btn-glow">Go to Dashboard</MotionButton>
            ) : (
              <>
                <button onClick={() => navigate("/login")} className="text-sm text-gray-400 hover:text-white transition-colors duration-200 cursor-pointer">Sign In</button>
                <MotionButton onClick={() => navigate("/login")} className="px-5 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-semibold rounded-full transition-all duration-300 shadow-lg shadow-indigo-500/25 cursor-pointer btn-glow">Get Started</MotionButton>
              </>
            )}
          </div>
        </div>
      </nav>

      {/* ── Hero (with AnimatedBackground) ── */}
      <section className="relative min-h-[92vh] flex flex-col items-center justify-center text-center px-6 overflow-hidden">
        {/* Animated floating gradient orbs */}
        <AnimatedBackground />

        {/* Mesh gradient overlay */}
        <div className="absolute inset-0 mesh-gradient pointer-events-none" />

        <div className="relative z-10 max-w-4xl">
          <motion.div
            className="inline-flex items-center gap-2 glass rounded-full px-5 py-2 text-sm font-semibold text-indigo-400 mb-8 shadow-lg shadow-indigo-500/10"
            initial={{ opacity: 0, y: 20, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ type: "spring", stiffness: 120, damping: 14, delay: 0.1 }}
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" /></svg>
            Powered by Claude AI + ChromaDB RAG
          </motion.div>

          <motion.h1
            className="text-5xl sm:text-6xl lg:text-8xl font-extrabold tracking-tight leading-[1.04] mb-6"
            initial={{ opacity: 0, y: 50 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ type: "spring", stiffness: 80, damping: 16, delay: 0.25 }}
          >
            Your data answers{" "}
            <span className="bg-gradient-to-r from-indigo-400 via-violet-400 to-pink-400 bg-clip-text text-transparent text-shimmer">
              in plain English
            </span>
          </motion.h1>

          <motion.p
            className="text-lg sm:text-xl text-gray-400 max-w-2xl mx-auto mb-10 leading-relaxed"
            initial="hidden"
            animate="visible"
          >
            <StaggeredText
              text="QueryCopilot turns any business question into SQL, charts and insights in seconds — no analyst required, no SQL skills needed."
            />
          </motion.p>

          <motion.div
            className="flex items-center justify-center gap-4 flex-wrap"
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ type: "spring", stiffness: 100, damping: 16, delay: 0.7 }}
          >
            <MotionButton onClick={() => navigate("/login")} className="px-8 py-3.5 bg-gradient-to-r from-indigo-500 to-violet-500 text-white font-bold rounded-full shadow-xl shadow-indigo-500/30 hover:shadow-2xl hover:shadow-indigo-500/40 transition-all duration-300 cursor-pointer btn-glow">Start for free</MotionButton>
            <MotionButton onClick={() => scrollTo("pricing")} className="px-8 py-3.5 glass text-white font-bold rounded-full hover:border-indigo-500/40 transition-all duration-300 cursor-pointer">See pricing</MotionButton>
          </motion.div>

          <motion.p
            className="mt-10 text-sm text-gray-600 animate-bounce"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 1.2, duration: 0.6 }}
          >
            &#x2193; Scroll to explore
          </motion.p>
        </div>
      </section>

      {/* ── Trust Strip (Glassmorphism) ── */}
      <section className="glass-navbar py-6">
        <div className="max-w-7xl mx-auto px-6 flex items-center justify-center gap-8 sm:gap-16 flex-wrap">
          <span className="text-xs text-gray-500 uppercase tracking-widest font-semibold">Trusted by</span>
          {TRUST.map((name) => (
            <span key={name} className="text-sm font-bold text-gray-600 uppercase tracking-wider hover:text-gray-300 transition-colors duration-300">{name}</span>
          ))}
        </div>
      </section>

      {/* ── Features Bento (Glassmorphism Cards) ── */}
      <section id="features" className="py-24 sm:py-32">
        <RevealSection className="max-w-7xl mx-auto px-6">
          <motion.div className="text-center mb-16" variants={staggerItem}>
            <p className="text-sm font-bold text-indigo-400 uppercase tracking-widest mb-3">Features</p>
            <h2 className="text-3xl sm:text-5xl font-extrabold tracking-tight mb-4">Everything your team needs</h2>
            <p className="text-gray-400 max-w-xl mx-auto">Built for the speed of modern business &mdash; from question to insight in under 3 seconds.</p>
          </motion.div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {FEATURES.map((f, i) => (
              <motion.div
                key={i}
                className={`${f.span} glass-card rounded-2xl p-6 sm:p-8 hover:-translate-y-1 transition-all duration-300 relative overflow-hidden group`}
                variants={{
                  hidden: { opacity: 0, y: 40, scale: 0.95 },
                  visible: {
                    opacity: 1,
                    y: 0,
                    scale: 1,
                    transition: { type: "spring", stiffness: 100, damping: 14, delay: i * 0.07 },
                  },
                }}
              >
                <div className="absolute -top-10 -right-10 w-32 h-32 rounded-full bg-gradient-to-br from-indigo-500/20 to-violet-500/10 blur-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
                <div className="relative z-10">
                  {FEATURE_ICONS[f.icon]}
                  {f.num && <span className="text-4xl sm:text-5xl font-extrabold bg-gradient-to-r from-indigo-400 to-violet-400 bg-clip-text text-transparent block mb-1">{f.num}</span>}
                  <h3 className="text-lg font-bold text-white mb-2">{f.title}</h3>
                  <p className="text-sm text-gray-400 leading-relaxed">{f.desc}</p>
                  {f.tags && (
                    <div className="flex gap-2 mt-4 flex-wrap">
                      {f.tags.map((tag) => (
                        <span key={tag} className="text-xs bg-indigo-500/10 text-indigo-300 border border-indigo-500/20 rounded-full px-3 py-1 font-medium">{tag}</span>
                      ))}
                    </div>
                  )}
                </div>
              </motion.div>
            ))}
          </div>
        </RevealSection>
      </section>

      {/* ── How It Works (Glassmorphism) ── */}
      <section id="how" className="py-24 sm:py-32 relative">
        <div className="absolute inset-0 mesh-gradient opacity-50 pointer-events-none" />
        <RevealSection className="max-w-7xl mx-auto px-6 relative z-10">
          <motion.div className="text-center mb-16" variants={staggerItem}>
            <p className="text-sm font-bold text-indigo-400 uppercase tracking-widest mb-3">How It Works</p>
            <h2 className="text-3xl sm:text-5xl font-extrabold tracking-tight">From question to insight in 3 steps</h2>
          </motion.div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {STEPS.map((s) => (
              <motion.div
                key={s.num}
                className="text-center glass-card rounded-2xl p-8 hover:-translate-y-1 transition-all duration-300"
                variants={{
                  hidden: { opacity: 0, y: 50, scale: 0.9 },
                  visible: {
                    opacity: 1,
                    y: 0,
                    scale: 1,
                    transition: { type: "spring", stiffness: 100, damping: 14, delay: s.num * 0.12 },
                  },
                }}
              >
                <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-indigo-500 to-violet-500 text-white flex items-center justify-center mx-auto mb-6 shadow-lg shadow-indigo-500/30">
                  {s.icon}
                </div>
                <div className="inline-flex items-center justify-center w-8 h-8 rounded-full glass text-indigo-400 text-sm font-bold mb-4">{s.num}</div>
                <h3 className="text-lg font-bold text-white mb-3">{s.title}</h3>
                <p className="text-sm text-gray-400 leading-relaxed">{s.desc}</p>
              </motion.div>
            ))}
          </div>
        </RevealSection>
      </section>

      {/* ── Live Demo Carousel ── */}
      <section className="py-24 sm:py-32">
        <RevealSection className="max-w-7xl mx-auto px-6">
          <motion.div className="text-center mb-10" variants={staggerItem}>
            <p className="text-sm font-bold text-indigo-400 uppercase tracking-widest mb-3">Live Demo</p>
            <h2 className="text-3xl sm:text-5xl font-extrabold tracking-tight mb-4">See every feature in action</h2>
            <p className="text-gray-400">Click a tab to explore how QueryCopilot works end to end.</p>
          </motion.div>
          <motion.div variants={fadeScale}>
            <DemoCarousel />
          </motion.div>
        </RevealSection>
      </section>

      {/* ── Stats (Glassmorphism + AnimatedCounter) ── */}
      <section className="py-20 relative">
        <div className="absolute inset-0 mesh-gradient opacity-30 pointer-events-none" />
        <RevealSection className="max-w-5xl mx-auto px-6 relative z-10">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
            {STATS.map((s, i) => (
              <motion.div
                key={s.label}
                className="text-center glass-card rounded-2xl p-6 hover:border-indigo-500/30 transition-all duration-300"
                variants={{
                  hidden: { opacity: 0, y: 30, scale: 0.9 },
                  visible: {
                    opacity: 1,
                    y: 0,
                    scale: 1,
                    transition: { type: "spring", stiffness: 120, damping: 14, delay: i * 0.1 },
                  },
                }}
              >
                <div className="text-4xl sm:text-5xl font-extrabold bg-gradient-to-r from-indigo-400 to-violet-400 bg-clip-text text-transparent mb-2">
                  <AnimatedCounter
                    value={s.value}
                    suffix={s.suffix}
                    duration={2}
                    className="text-4xl sm:text-5xl font-extrabold bg-gradient-to-r from-indigo-400 to-violet-400 bg-clip-text text-transparent"
                  />
                </div>
                <p className="text-sm text-gray-400">{s.label}</p>
              </motion.div>
            ))}
          </div>
        </RevealSection>
      </section>

      {/* ── Testimonials (Glassmorphism) ── */}
      <section className="py-24 sm:py-32">
        <RevealSection className="max-w-7xl mx-auto px-6">
          <motion.div className="text-center mb-16" variants={staggerItem}>
            <p className="text-sm font-bold text-indigo-400 uppercase tracking-widest mb-3">Testimonials</p>
            <h2 className="text-3xl sm:text-5xl font-extrabold tracking-tight">Loved by data-driven teams</h2>
          </motion.div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {TESTIMONIALS.map((t, i) => (
              <motion.div
                key={t.name}
                className="glass-card rounded-2xl p-6 sm:p-8 hover:-translate-y-1 transition-all duration-300"
                variants={{
                  hidden: { opacity: 0, y: 40, scale: 0.95 },
                  visible: {
                    opacity: 1,
                    y: 0,
                    scale: 1,
                    transition: { type: "spring", stiffness: 100, damping: 14, delay: i * 0.12 },
                  },
                }}
              >
                <div className="text-yellow-400 text-lg mb-4">&#9733;&#9733;&#9733;&#9733;&#9733;</div>
                <p className="text-gray-300 italic leading-relaxed mb-6">&ldquo;{t.quote}&rdquo;</p>
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-gradient-to-br from-indigo-500 to-violet-500 flex items-center justify-center text-white text-sm font-bold flex-shrink-0 shadow-lg shadow-indigo-500/20">{t.avatar}</div>
                  <div>
                    <p className="text-sm font-semibold text-white">{t.name}</p>
                    <p className="text-xs text-gray-500">{t.role}</p>
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        </RevealSection>
      </section>

      {/* ── Pricing (Glassmorphism) ── */}
      <section id="pricing" className="py-24 sm:py-32 relative">
        <div className="absolute inset-0 mesh-gradient opacity-40 pointer-events-none" />
        <RevealSection className="max-w-7xl mx-auto px-6 relative z-10">
          <motion.div className="text-center mb-16" variants={staggerItem}>
            <p className="text-sm font-bold text-indigo-400 uppercase tracking-widest mb-3">Pricing</p>
            <h2 className="text-3xl sm:text-5xl font-extrabold tracking-tight mb-4">Simple, transparent pricing</h2>
            <p className="text-gray-400 max-w-md mx-auto">Start free, upgrade when you&apos;re ready. No hidden fees. 7-day trial on all plans.</p>
          </motion.div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-5xl mx-auto">
            {PLANS.map((plan, i) => (
              <motion.div
                key={plan.name}
                className={`relative rounded-2xl p-8 transition-all duration-300 hover:-translate-y-1 ${plan.featured ? "glass-card border-indigo-500/40 shadow-xl shadow-indigo-500/10 scale-[1.03]" : "glass-card"}`}
                variants={{
                  hidden: { opacity: 0, y: 50, scale: 0.9 },
                  visible: {
                    opacity: 1,
                    y: 0,
                    scale: plan.featured ? 1.03 : 1,
                    transition: { type: "spring", stiffness: 100, damping: 14, delay: i * 0.12 },
                  },
                }}
              >
                {plan.badge && <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-gradient-to-r from-indigo-500 to-violet-500 text-white text-xs font-bold px-4 py-1 rounded-full shadow-lg shadow-indigo-500/30">{plan.badge}</div>}
                <h3 className="text-lg font-bold text-white mb-1">{plan.name}</h3>
                <div className="mb-1"><span className="text-5xl font-extrabold text-white">{plan.price}</span></div>
                <p className="text-sm text-gray-500 mb-6">{plan.period}</p>
                <ul className="space-y-3 mb-8">
                  {plan.features.map((f) => (
                    <li key={f} className="flex items-start gap-2 text-sm text-gray-300"><span className="text-green-400 mt-0.5 flex-shrink-0">&#10003;</span>{f}</li>
                  ))}
                </ul>
                <a href={plan.link} target="_blank" rel="noopener noreferrer" className={`block text-center py-3 rounded-full font-bold text-sm transition-all duration-300 cursor-pointer ${plan.featured ? "bg-gradient-to-r from-indigo-500 to-violet-500 text-white shadow-lg shadow-indigo-500/30 hover:-translate-y-0.5 btn-glow" : "glass text-white hover:border-indigo-500/40 hover:-translate-y-0.5"}`}>{plan.cta}</a>
              </motion.div>
            ))}
          </div>
        </RevealSection>
      </section>

      {/* ── CTA Banner (Glassmorphism) ── */}
      <section className="py-24 sm:py-32">
        <RevealSection className="max-w-4xl mx-auto px-6 text-center">
          <motion.div
            className="glass-card rounded-3xl p-12 sm:p-16 relative overflow-hidden"
            variants={fadeScale}
          >
            <div className="absolute top-[-50px] right-[-50px] w-[200px] h-[200px] rounded-full bg-indigo-500/20 blur-[60px] pointer-events-none" />
            <div className="absolute bottom-[-50px] left-[-50px] w-[200px] h-[200px] rounded-full bg-violet-500/15 blur-[60px] pointer-events-none" />
            <div className="relative z-10">
              <h2 className="text-3xl sm:text-5xl font-extrabold tracking-tight mb-6">Start querying your data today</h2>
              <p className="text-gray-400 max-w-xl mx-auto mb-10">Join hundreds of teams who&apos;ve eliminated the data bottleneck. Free to start, no credit card needed.</p>
              <div className="flex items-center justify-center gap-4 flex-wrap">
                <MotionButton onClick={() => navigate("/login")} className="px-8 py-3.5 bg-gradient-to-r from-indigo-500 to-violet-500 text-white font-bold rounded-full shadow-xl shadow-indigo-500/30 hover:shadow-2xl transition-all duration-300 cursor-pointer btn-glow">Get started free</MotionButton>
                <MotionButton onClick={() => scrollTo("pricing")} className="px-8 py-3.5 glass text-white font-bold rounded-full hover:border-indigo-500/40 transition-all duration-300 cursor-pointer">View plans</MotionButton>
              </div>
            </div>
          </motion.div>
        </RevealSection>
      </section>

      {/* ── Footer ── */}
      <footer className="border-t border-gray-800/50 py-16">
        <div className="max-w-7xl mx-auto px-6">
          <div className="grid grid-cols-2 md:grid-cols-5 gap-8 mb-12">
            <div className="col-span-2">
              <span className="text-xl font-extrabold">Query<span className="text-indigo-400">Copilot</span></span>
              <p className="text-sm text-gray-500 mt-3 max-w-xs leading-relaxed">The AI analytics assistant that makes your entire team data-fluent &mdash; no SQL required.</p>
            </div>
            <div>
              <h4 className="text-sm font-semibold text-gray-300 mb-4">Product</h4>
              <ul className="space-y-2 text-sm text-gray-500">
                <li><button onClick={() => scrollTo("features")} className="hover:text-gray-300 transition cursor-pointer">Features</button></li>
                <li><button onClick={() => scrollTo("pricing")} className="hover:text-gray-300 transition cursor-pointer">Pricing</button></li>
                <li><span className="text-gray-600">Changelog</span></li>
                <li><span className="text-gray-600">Roadmap</span></li>
              </ul>
            </div>
            <div>
              <h4 className="text-sm font-semibold text-gray-300 mb-4">Company</h4>
              <ul className="space-y-2 text-sm text-gray-500">
                <li><span className="text-gray-600">About</span></li>
                <li><span className="text-gray-600">Blog</span></li>
                <li><span className="text-gray-600">Careers</span></li>
                <li><span className="text-gray-600">Press</span></li>
              </ul>
            </div>
            <div>
              <h4 className="text-sm font-semibold text-gray-300 mb-4">Support</h4>
              <ul className="space-y-2 text-sm text-gray-500">
                <li><span className="text-gray-600">Docs</span></li>
                <li><span className="text-gray-600">Status</span></li>
                <li><span className="text-gray-600">hello@querycopilot.ai</span></li>
                <li><span className="text-gray-600">@QueryCopilot</span></li>
              </ul>
            </div>
          </div>
          <div className="border-t border-gray-800/50 pt-8 flex flex-col sm:flex-row items-center justify-between gap-4">
            <p className="text-xs text-gray-600">&copy; 2026 QueryCopilot. All rights reserved.</p>
            <div className="flex gap-6 text-xs text-gray-600"><span>Privacy</span><span>Terms</span></div>
          </div>
        </div>
      </footer>

      {/* Scroll to top — portaled to body to escape PageTransition's transform/willChange containing block */}
      {createPortal(
        <button
          onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
          className={`scroll-top-btn ${showScrollTop ? "visible" : ""}`}
          aria-label="Scroll to top"
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 15l7-7 7 7" />
          </svg>
        </button>,
        document.body
      )}
    </div>
  );
}
