import { useNavigate } from "react-router-dom";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence, useInView } from "framer-motion";
import { useStore } from "../store";
import React, { Suspense, Component, lazy } from "react";
import AnimatedCounter from "../components/animation/AnimatedCounter";
import AnimatedBackground from "../components/animation/AnimatedBackground";
import MotionButton from "../components/animation/MotionButton";
import { GPUTierProvider, useGPUTier } from "../lib/gpuDetect";
import useScrollParallax from "../components/animation/useScrollParallax";
import useVisibilityMount from "../components/animation/useVisibilityMount";
import TiltCard from "../components/animation/TiltCard";
import AnimatedBorderGradient from "../components/animation/AnimatedBorderGradient";
import CursorGlow from "../components/animation/CursorGlow";
import ScrollProgress from "../components/animation/ScrollProgress";
import LoadingScreen from "../components/animation/LoadingScreen";

// WebGL Fallback Error Boundary
class WebGLErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }
  static getDerivedStateFromError(error) { return { hasError: true }; }
  componentDidCatch(error, errorInfo) {
    console.warn("WebGL failed, falling back to 2D background.", error, errorInfo);
  }
  render() {
    return this.state.hasError ? this.props.fallback : this.props.children;
  }
}

const Background3D = lazy(() => import("../components/animation/Background3D"));
const SectionBackground3D = lazy(() => import("../components/animation/SectionBackground3D"));
const DeviceFrame3D = lazy(() => import("../components/animation/DeviceFrame3D"));
import { useScrollReveal } from "../components/animation/useScrollReveal";
import ScrollReveal from "../components/animation/ScrollReveal";
import demoChat from "../assets/chat_to_chart.webp";
import demoAssembly from "../assets/dashboard_assembly.webp";
import demoFilter from "../assets/dashboard_filter.webp";
import demoMultiDB from "../assets/multi_db_er.webp";

const DEMO_SLIDES = [
  {
    id: "chat_to_chart",
    label: "AI Agent",
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
      </svg>
    ),
    gif: demoChat,
    title: "Autonomous Multi-Step Analysis",
    desc: "Watch the AI agent find tables, validate queries, and generate the right chart \u2014 all from a single natural language question.",
  },
  {
    id: "dashboard_assembly",
    label: "Dashboard Builder",
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6A2.25 2.25 0 016 3.75h2.25A2.25 2.25 0 0110.5 6v2.25a2.25 2.25 0 01-2.25 2.25H6a2.25 2.25 0 01-2.25-2.25V6zM3.75 15.75A2.25 2.25 0 016 13.5h2.25a2.25 2.25 0 012.25 2.25V18a2.25 2.25 0 01-2.25 2.25H6A2.25 2.25 0 013.75 18v-2.25zM13.5 6a2.25 2.25 0 012.25-2.25H18A2.25 2.25 0 0120.25 6v2.25A2.25 2.25 0 0118 10.5h-2.25a2.25 2.25 0 01-2.25-2.25V6z" />
      </svg>
    ),
    gif: demoAssembly,
    title: "Drag-Drop Intelligence Grid",
    desc: "Pin any insight to a responsive grid. Drag, resize, add KPI tiles, and configure global filters that sync every chart.",
  },
  {
    id: "dashboard_filter",
    label: "Global Filtering",
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 3c2.755 0 5.455.232 8.083.678.533.09.917.556.917 1.096v1.044a2.25 2.25 0 01-.659 1.591l-5.432 5.432a2.25 2.25 0 00-.659 1.591v2.927a2.25 2.25 0 01-1.244 2.013L9.75 21v-6.568a2.25 2.25 0 00-.659-1.591L3.659 7.409A2.25 2.25 0 013 5.818V4.774c0-.54.384-1.006.917-1.096A48.32 48.32 0 0112 3z" />
      </svg>
    ),
    gif: demoFilter,
    title: "Cross-Database Sync",
    desc: "Apply a date range or category filter once. DataLens understands the underlying schemas and updates every connected chart simultaneously.",
  },
  {
    id: "multi_db",
    label: "Unified Data",
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M20.25 6.375c0 2.278-3.694 4.125-8.25 4.125S3.75 8.653 3.75 6.375m16.5 0c0-2.278-3.694-4.125-8.25-4.125S3.75 4.097 3.75 6.375" />
      </svg>
    ),
    gif: demoMultiDB,
    title: "18 Engines, One Ecosystem",
    desc: "Connect Postgres, MySQL, Snowflake, BigQuery, Databricks, ClickHouse, and more. Explore interactive ER diagrams across all your data sources.",
  },
];

const PAYMENT_LINKS = {
  weekly: "https://buy.stripe.com/test_5kQbJ30oo8bJ7oEaqF4c800",
  monthly: "https://buy.stripe.com/test_14A6oJ3AAgIf38ocyN4c801",
  yearly: "https://buy.stripe.com/test_eVqbJ38UUfEb24keGV4c802",
};

const FEATURES = [
  { icon: "ai", title: "Agentic Analysis", desc: "Ask a question \u2014 the AI agent finds tables, validates SQL, and picks the right chart. Autonomously.", tags: ["Multi-Step AI", "Tool-Use Agent"], span: "col-span-2" },
  { icon: "database", title: "18 Database Engines", num: "18", desc: "Postgres, Snowflake, BigQuery, and 15 more. One platform, every source.", span: "" },
  { icon: "shield", title: "3-Layer Read-Only Security", desc: "Driver-level + SQL validation + connector re-check. Your data is never modified.", tags: ["Read-Only", "PII Masking", "OTP Auth"], span: "col-span-2" },
  { icon: "chart", title: "NL Dashboards", desc: "Question \u2192 chart \u2192 drag-drop grid with global filters and live KPIs.", tags: ["Drag & Drop", "Global Filters"], span: "" },
  { icon: "brain", title: "Self-Improving RAG", desc: "Every feedback loop retrains the system. Queries get smarter over time.", span: "" },
  { icon: "speed", title: "Instant to Boardroom", desc: "One-click 16:9 slides, PDF export, or Slack push.", tags: ["PDF", "Slack", "Presentation Mode"], span: "" },
  { icon: "export", title: "Alerts & Digests", desc: "Define conditions in plain English. Get Slack/Teams webhooks and scheduled emails.", tags: ["Slack", "Teams", "Email"], span: "" },
];

const STEPS = [
  { num: 1, title: "Connect any database", desc: "Securely connect PostgreSQL, Snowflake, BigQuery, or any of 18 supported engines. Your schema is auto-discovered and indexed \u2014 your data is never copied or modified.", icon: <svg className="w-7 h-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M20.25 6.375c0 2.278-3.694 4.125-8.25 4.125S3.75 8.653 3.75 6.375m16.5 0c0-2.278-3.694-4.125-8.25-4.125S3.75 4.097 3.75 6.375m16.5 0v11.25c0 2.278-3.694 4.125-8.25 4.125s-8.25-1.847-8.25-4.125V6.375" /></svg> },
  { num: 2, title: "Ask your AI agent", desc: "Describe what you need in plain English. The agent autonomously finds relevant tables, validates SQL, executes queries, and suggests the optimal visualization.", icon: <svg className="w-7 h-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" /></svg> },
  { num: 3, title: "Build, present, automate", desc: "Pin insights to drag-drop dashboards with global filters. Auto-layout into presentation slides. Set up NL alerts and scheduled digests to stay ahead.", icon: <svg className="w-7 h-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z" /></svg> },
];

const STATS = [
  { value: 18, suffix: "+", label: "Supported databases" },
  { value: 6, suffix: "-layer", label: "SQL security pipeline" },
  { value: 100, suffix: "%", label: "Read-only enforcement" },
  { value: 0, suffix: "", label: "Write access \u2014 ever" },
];

const TESTIMONIALS = [
  { name: "Sarah Johnson", role: "Head of Data \u00B7 Nexora", avatar: "SJ", quote: "We replaced three BI tools with DataLens. The AI agent handles 80% of our ad-hoc analysis, and the 3-layer security model got us past our CISO\u2019s review in a single meeting." },
  { name: "Marcus Chen", role: "VP Engineering \u00B7 TechFlow", avatar: "MC", quote: "Connecting Snowflake, Postgres, and BigQuery into one dashboard took 10 minutes. The agent even figured out the join logic across databases." },
  { name: "Aisha Patel", role: "VP Operations \u00B7 DataSync", avatar: "AP", quote: "The presentation engine turned our weekly ops review into a one-click workflow. NL alerts in Slack catch anomalies before our team even logs in." },
];

const PLANS = [
  { name: "Starter", price: "$0", period: "forever free", badge: null, featured: false, features: ["10 AI queries per day", "2 connectors (Postgres & MySQL)", "1 dashboard with basic charts", "Community support"], link: PAYMENT_LINKS.weekly, cta: "Start Free" },
  { name: "Professional", price: "$29", period: "per month", badge: "Most Popular", featured: true, features: ["Unlimited AI queries", "All 18 database connectors", "Global filters, KPIs & drag-drop", "NL alerts + Slack/Teams webhooks", "PDF & Slack export", "Priority support"], link: PAYMENT_LINKS.monthly, cta: "Start Monthly" },
  { name: "Enterprise", price: "$199", period: "per year \u00B7 save 43%", badge: null, featured: false, features: ["Everything in Professional", "16:9 presentation auto-layout", "Scheduled email digests", "White-label dashboards", "Up to 10 team seats", "Dedicated account manager"], link: PAYMENT_LINKS.yearly, cta: "Start Yearly \u2014 Best Value" },
];

const TRUST = [
  { name: "PostgreSQL", color: "text-blue-400/80" },
  { name: "Snowflake", color: "text-cyan-400/80" },
  { name: "BigQuery", color: "text-yellow-400/80" },
  { name: "Databricks", color: "text-red-400/80" },
  { name: "MySQL", color: "text-orange-400/80" },
  { name: "ClickHouse", color: "text-amber-400/80" },
  { name: "+ 12 more", color: "text-gray-400" },
];


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

/* ── Section wrapper with scroll-reveal + parallax ── */
function RevealSection({ children, className = "", parallaxSpeed, ...props }) {
  const { ref, isInView } = useScrollReveal({ once: true, margin: "-60px", amount: 0.08 });
  const parallax = useScrollParallax({ speed: parallaxSpeed || 0 });

  const content = (
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

  // Wrap in parallax if speed specified
  if (parallaxSpeed) {
    return (
      <motion.div ref={parallax.ref} style={{ y: parallax.parallaxY }}>
        {content}
      </motion.div>
    );
  }
  return content;
}

/* ── Visibility-gated section background (unmounts off-screen Canvases) ── */
function VisibleSectionBg({ children }) {
  const { ref, isVisible } = useVisibilityMount({ rootMargin: "300px" });
  return (
    <div ref={ref}>
      {isVisible ? children : null}
    </div>
  );
}

/* ── Demo Carousel Component ── */
function DemoCarousel() {
  const [active, setActive] = useState(0);
  const nav = useNavigate();
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
            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium transition-all duration-300 cursor-pointer ${i === active
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
              <p className="text-gray-400 leading-relaxed mb-5">{slide.desc}</p>
              <button
                onClick={() => nav("/login")}
                className="inline-flex items-center gap-2 text-sm font-semibold text-indigo-400 hover:text-indigo-300 transition-colors duration-200 mb-6 cursor-pointer group"
              >
                Try this feature
                <svg className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" /></svg>
              </button>

              {/* Progress dots */}
              <div className="flex items-center gap-3">
                {DEMO_SLIDES.map((_, i) => (
                  <button
                    key={i}
                    onClick={() => setActive(i)}
                    className={`h-1.5 rounded-full transition-all duration-300 cursor-pointer ${i === active ? "w-8 bg-indigo-500" : "w-4 bg-gray-700 hover:bg-gray-600"
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
            hidden: { opacity: 0, y: 20, filter: "blur(4px)", scale: 1.03 },
            visible: {
              opacity: 1,
              y: 0,
              filter: "blur(0px)",
              scale: 1,
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

function LandingInner() {
  const navigate = useNavigate();
  const token = useStore((s) => s.token);
  const tier = useGPUTier();
  const scrollTo = (id) => document.getElementById(id)?.scrollIntoView({ behavior: "smooth" });
  const [scrolled, setScrolled] = useState(false);
  const [showScrollTop, setShowScrollTop] = useState(false);
  const [heroLoaded, setHeroLoaded] = useState(tier === "low");

  useEffect(() => {
    const handler = () => {
      setScrolled(window.scrollY > 20);
      setShowScrollTop(window.scrollY > 100);
    };
    window.addEventListener("scroll", handler, { passive: true });
    return () => window.removeEventListener("scroll", handler);
  }, []);

  // Auto-dismiss loading screen after timeout (in case Canvas never fires onCreated)
  useEffect(() => {
    if (heroLoaded) return;
    const timer = setTimeout(() => setHeroLoaded(true), 3000);
    return () => clearTimeout(timer);
  }, [heroLoaded]);

  return (
    <div className="min-h-screen bg-[#06060e] text-gray-100 overflow-x-hidden relative noise-overlay">
      <LoadingScreen visible={!heroLoaded} />
      <ScrollProgress />
      <CursorGlow />
      {/* ── Navbar (Glassmorphism) ── */}
      <nav className={`sticky top-0 z-50 transition-all duration-500 ${scrolled ? "glass-navbar shadow-lg" : "bg-transparent border-b border-transparent"}`}>
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
          <span className="text-xl font-extrabold tracking-tight font-poppins">Data<span style={{ color: '#A855F7' }}>Lens</span></span>
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

      {/* ── Hero (with 3D Background & Fallback) ── */}
      <section className="relative min-h-[92vh] flex flex-col items-center justify-center text-center px-6 overflow-hidden">
        {/* 3D glassmorphism tech background with 2D fallback */}
        <WebGLErrorBoundary fallback={<AnimatedBackground />}>
          <Suspense fallback={<AnimatedBackground />}>
            <Background3D onCreated={() => setHeroLoaded(true)} />
          </Suspense>
        </WebGLErrorBoundary>

        {/* Mesh gradient overlay */}
        <div className="absolute inset-0 mesh-gradient pointer-events-none" />

        <div className="relative z-10 max-w-4xl">
          <motion.div
            className="inline-flex items-center gap-2 glass rounded-full px-5 py-2 text-sm font-semibold text-indigo-400 mb-8 shadow-lg shadow-indigo-500/10"
            initial={{ opacity: 0, y: 20, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ type: "spring", stiffness: 120, damping: 14, delay: 0.1 }}
          >
            <svg className="w-4 h-4 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" /></svg>
            The Agentic Data Intelligence Platform
          </motion.div>

          <motion.h1
            className="text-5xl sm:text-6xl lg:text-8xl font-extrabold tracking-tight leading-[1.04] mb-6"
            initial={{ opacity: 0, y: 50 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ type: "spring", stiffness: 80, damping: 16, delay: 0.25 }}
          >
            Your AI Analyst Across{" "}
            <span className="bg-gradient-to-r from-indigo-400 via-violet-400 to-pink-400 bg-clip-text text-transparent text-shimmer">
              Every Database
            </span>
          </motion.h1>

          <motion.p
            className="text-lg sm:text-xl text-gray-400 max-w-2xl mx-auto mb-10 leading-relaxed"
            initial="hidden"
            animate="visible"
          >
            <StaggeredText
              text="One AI agent. 18 databases. Enterprise-grade security. DataLens autonomously explores your data, generates insights, and builds presentation-ready dashboards — no SQL required."
            />
          </motion.p>

          <motion.div
            className="flex items-center justify-center gap-4 flex-wrap"
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ type: "spring", stiffness: 100, damping: 16, delay: 0.7 }}
          >
            <MotionButton onClick={() => navigate("/login")} className="px-8 py-3.5 bg-gradient-to-r from-indigo-500 to-violet-500 text-white font-bold rounded-full shadow-xl shadow-indigo-500/30 hover:shadow-2xl hover:shadow-indigo-500/40 transition-all duration-300 cursor-pointer btn-glow">Start for free</MotionButton>
            <MotionButton onClick={() => scrollTo("demo")} className="px-8 py-3.5 glass text-white font-bold rounded-full hover:border-indigo-500/40 transition-all duration-300 cursor-pointer">Watch it work</MotionButton>
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
      <section className="glass-navbar py-5">
        <div className="max-w-7xl mx-auto px-6 flex items-center justify-center gap-3 sm:gap-4 flex-wrap">
          <span className="text-xs text-gray-500 uppercase tracking-widest font-semibold mr-2">Connects to</span>
          {TRUST.map((db) => (
            <span key={db.name} className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-semibold tracking-wide border border-white/[0.06] bg-white/[0.03] hover:bg-white/[0.07] transition-colors duration-200 ${db.color}`}>
              <span className="w-1.5 h-1.5 rounded-full bg-current opacity-60" />
              {db.name}
            </span>
          ))}
        </div>
      </section>

      {/* ── Features Bento (Glassmorphism Cards) ── */}
      <section id="features" className="py-24 sm:py-32 relative overflow-hidden">
        <VisibleSectionBg><Suspense fallback={null}><SectionBackground3D mode="features" /></Suspense></VisibleSectionBg>
        <RevealSection className="max-w-7xl mx-auto px-6" parallaxSpeed={0.15}>
          <motion.div className="text-center mb-16" variants={staggerItem}>
            <p className="text-sm font-bold text-indigo-400 uppercase tracking-widest mb-3">Features</p>
            <ScrollReveal textClassName="text-3xl sm:text-5xl font-extrabold tracking-tight mb-4 text-white font-heading">Intelligence, security, and scale — in one platform</ScrollReveal>
            <p className="text-gray-400 max-w-xl mx-auto">From ad-hoc questions to automated monitoring, DataLens replaces your entire BI stack.</p>
          </motion.div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {FEATURES.map((f, i) => {
              const isWide = f.span?.includes("col-span-2");
              return (
                <motion.div
                  key={i}
                  className={f.span || ""}
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
                  <AnimatedBorderGradient active={isWide} borderRadius="1rem">
                    <TiltCard className="h-full">
                      <div className="glass-card rounded-2xl p-6 sm:p-8 h-full relative overflow-hidden group">
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
                      </div>
                    </TiltCard>
                  </AnimatedBorderGradient>
                </motion.div>
              );
            })}
          </div>
        </RevealSection>
      </section>

      {/* ── How It Works (Glassmorphism) ── */}
      <section id="how" className="py-24 sm:py-32 relative overflow-hidden">
        <div className="absolute inset-0 mesh-gradient opacity-50 pointer-events-none" />
        <VisibleSectionBg><Suspense fallback={null}><SectionBackground3D mode="howItWorks" /></Suspense></VisibleSectionBg>
        <RevealSection className="max-w-7xl mx-auto px-6 relative z-10" parallaxSpeed={0.1}>
          <motion.div className="text-center mb-16" variants={staggerItem}>
            <p className="text-sm font-bold text-indigo-400 uppercase tracking-widest mb-3">How It Works</p>
            <ScrollReveal textClassName="text-3xl sm:text-5xl font-extrabold tracking-tight text-white font-heading">From connection to intelligence in 3 steps</ScrollReveal>
          </motion.div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {STEPS.map((s) => (
              <motion.div
                key={s.num}
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
                <TiltCard className="h-full">
                  <div className="text-center glass-card rounded-2xl p-8 h-full">
                    <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-indigo-500 to-violet-500 text-white flex items-center justify-center mx-auto mb-6 shadow-lg shadow-indigo-500/30">
                      {s.icon}
                    </div>
                    <div className="inline-flex items-center justify-center w-8 h-8 rounded-full glass text-indigo-400 text-sm font-bold mb-4">{s.num}</div>
                    <h3 className="text-lg font-bold text-white mb-3">{s.title}</h3>
                    <p className="text-sm text-gray-400 leading-relaxed">{s.desc}</p>
                  </div>
                </TiltCard>
              </motion.div>
            ))}
          </div>
        </RevealSection>
      </section>

      {/* ── Live Demo Carousel ── */}
      <section id="demo" className="py-24 sm:py-32 relative overflow-hidden">
        <VisibleSectionBg><Suspense fallback={null}><SectionBackground3D mode="demo" /></Suspense></VisibleSectionBg>
        <RevealSection className="max-w-7xl mx-auto px-6">
          <motion.div className="text-center mb-10" variants={staggerItem}>
            <p className="text-sm font-bold text-indigo-400 uppercase tracking-widest mb-3">Live Demo</p>
            <ScrollReveal textClassName="text-3xl sm:text-5xl font-extrabold tracking-tight mb-4 text-white font-heading">See agentic intelligence in action</ScrollReveal>
            <p className="text-gray-400">Click a tab to explore how DataLens works end to end.</p>
          </motion.div>
          <motion.div variants={fadeScale}>
            <DemoCarousel />
          </motion.div>
        </RevealSection>
      </section>

      {/* ── Stats ── */}
      <section className="py-20 relative overflow-hidden">
        <div className="absolute inset-0 mesh-gradient opacity-30 pointer-events-none" />
        <VisibleSectionBg><Suspense fallback={null}><SectionBackground3D mode="stats" /></Suspense></VisibleSectionBg>
        <RevealSection className="max-w-5xl mx-auto px-6 relative z-10" parallaxSpeed={0.12}>
          <TiltCard maxTilt={4}>
            <div className="glass-card rounded-2xl relative overflow-hidden">
              <div className="absolute inset-0 bg-gradient-to-r from-indigo-500/[0.03] via-transparent to-violet-500/[0.03] pointer-events-none" />
              <div className="relative grid grid-cols-2 md:grid-cols-4">
                {STATS.map((s, i) => (
                  <motion.div
                    key={s.label}
                    className={`flex flex-col items-center justify-center py-8 sm:py-10 px-4 sm:px-6${
                      i < 2 ? " border-b border-white/[0.06] md:border-b-0" : ""
                    }${i % 2 === 0 ? " border-r border-white/[0.06]" : ""
                    }${i === 1 ? " md:border-r md:border-white/[0.06]" : ""
                    }${i === 2 ? " md:border-r md:border-white/[0.06]" : ""
                    }${i === 3 ? " border-r-0" : ""}`}
                    variants={{
                      hidden: { opacity: 0, y: 20 },
                      visible: {
                        opacity: 1,
                        y: 0,
                        transition: { type: "spring", stiffness: 120, damping: 14, delay: i * 0.12 },
                      },
                    }}
                  >
                    <div className="mb-3 w-full text-center">
                      <AnimatedCounter
                        value={s.value}
                        suffix={s.suffix}
                        duration={2}
                        className="text-3xl sm:text-4xl md:text-[2.75rem] font-extrabold bg-gradient-to-r from-indigo-400 to-violet-400 bg-clip-text text-transparent leading-none tracking-tight"
                      />
                    </div>
                    <p className="text-xs sm:text-sm text-gray-400 leading-relaxed text-center max-w-[140px]">{s.label}</p>
                  </motion.div>
                ))}
              </div>
            </div>
          </TiltCard>
        </RevealSection>
      </section>

      {/* ── Testimonials (Glassmorphism + TiltCard) ── */}
      <section className="py-24 sm:py-32 relative overflow-hidden">
        <VisibleSectionBg><Suspense fallback={null}><SectionBackground3D mode="testimonials" /></Suspense></VisibleSectionBg>
        <RevealSection className="max-w-7xl mx-auto px-6" parallaxSpeed={0.1}>
          <motion.div className="text-center mb-16" variants={staggerItem}>
            <p className="text-sm font-bold text-indigo-400 uppercase tracking-widest mb-3">Testimonials</p>
            <ScrollReveal textClassName="text-3xl sm:text-5xl font-extrabold tracking-tight text-white font-heading">Trusted by security-conscious data teams</ScrollReveal>
          </motion.div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {TESTIMONIALS.map((t, i) => (
              <motion.div
                key={t.name}
                variants={{
                  hidden: { opacity: 0, y: 40, scale: 0.95, rotateY: -5 },
                  visible: {
                    opacity: 1,
                    y: 0,
                    scale: 1,
                    rotateY: 0,
                    transition: { type: "spring", stiffness: 100, damping: 14, delay: i * 0.12 },
                  },
                }}
              >
                <TiltCard className="h-full">
                  <div className="glass-card rounded-2xl p-6 sm:p-8 h-full relative">
                    {/* Floating quote mark */}
                    <motion.span
                      className="absolute -top-2 -left-1 text-4xl text-indigo-500/20 font-serif select-none pointer-events-none"
                      animate={{ y: [0, -6, 0] }}
                      transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
                    >
                      &ldquo;
                    </motion.span>
                    <div className="text-yellow-400 text-lg mb-4">&#9733;&#9733;&#9733;&#9733;&#9733;</div>
                    <p className="text-gray-300 italic leading-relaxed mb-6">&ldquo;{t.quote}&rdquo;</p>
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-gradient-to-br from-indigo-500 to-violet-500 flex items-center justify-center text-white text-sm font-bold flex-shrink-0 shadow-lg shadow-indigo-500/20">{t.avatar}</div>
                      <div>
                        <p className="text-sm font-semibold text-white">{t.name}</p>
                        <p className="text-xs text-gray-500">{t.role}</p>
                      </div>
                    </div>
                  </div>
                </TiltCard>
              </motion.div>
            ))}
          </div>
        </RevealSection>
      </section>

      {/* ── Pricing (Glassmorphism + TiltCard + AnimatedBorder) ── */}
      <section id="pricing" className="py-24 sm:py-32 relative overflow-hidden">
        <div className="absolute inset-0 mesh-gradient opacity-40 pointer-events-none" />
        <VisibleSectionBg><Suspense fallback={null}><SectionBackground3D mode="pricing" /></Suspense></VisibleSectionBg>
        <RevealSection className="max-w-7xl mx-auto px-6 relative z-10" parallaxSpeed={0.08}>
          <motion.div className="text-center mb-16" variants={staggerItem}>
            <p className="text-sm font-bold text-indigo-400 uppercase tracking-widest mb-3">Pricing</p>
            <ScrollReveal textClassName="text-3xl sm:text-5xl font-extrabold tracking-tight mb-4 text-white font-heading">Simple, transparent pricing</ScrollReveal>
            <p className="text-gray-400 max-w-md mx-auto">Start free with 2 databases. Unlock the full ecosystem when you&apos;re ready.</p>
          </motion.div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-5xl mx-auto">
            {PLANS.map((plan, i) => (
              <motion.div
                key={plan.name}
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
                <AnimatedBorderGradient active={plan.featured} borderRadius="1rem">
                  <TiltCard className="h-full">
                    <div className={`relative rounded-2xl p-8 h-full ${plan.featured ? "glass-card border-indigo-500/40 shadow-xl shadow-indigo-500/10" : "glass-card"}`}>
                      {plan.badge && <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-gradient-to-r from-indigo-500 to-violet-500 text-white text-xs font-bold px-4 py-1 rounded-full shadow-lg shadow-indigo-500/30">{plan.badge}</div>}
                      <h3 className="text-lg font-bold text-white mb-1">{plan.name}</h3>
                      <div className="mb-1"><span className="text-5xl font-extrabold text-white">{plan.price}</span></div>
                      <p className="text-sm text-gray-500 mb-6">{plan.period}</p>
                      <ul className="space-y-3 mb-8">
                        {plan.features.map((f) => (
                          <li key={f} className="flex items-start gap-2 text-sm text-gray-300"><span className="text-green-400 mt-0.5 flex-shrink-0">&#10003;</span>{f}</li>
                        ))}
                      </ul>
                      <a href={plan.link} target="_blank" rel="noopener noreferrer" className={`block text-center py-3 rounded-full font-bold text-sm transition-all duration-300 cursor-pointer ${plan.featured ? "bg-gradient-to-r from-indigo-500 to-violet-500 text-white shadow-lg shadow-indigo-500/30 hover:-translate-y-0.5 btn-glow shine-sweep" : "glass text-white hover:border-indigo-500/40 hover:-translate-y-0.5"}`}>{plan.cta}</a>
                    </div>
                  </TiltCard>
                </AnimatedBorderGradient>
              </motion.div>
            ))}
          </div>
        </RevealSection>
      </section>

      {/* ── CTA Banner (Glassmorphism) ── */}
      <section className="py-24 sm:py-32 relative overflow-hidden">
        <VisibleSectionBg><Suspense fallback={null}><SectionBackground3D mode="cta" /></Suspense></VisibleSectionBg>
        <RevealSection className="max-w-4xl mx-auto px-6 text-center">
          <motion.div variants={fadeScale}>
            <TiltCard maxTilt={4}>
              <div className="glass-card rounded-3xl p-12 sm:p-16 relative overflow-hidden">
                <div className="absolute top-[-50px] right-[-50px] w-[200px] h-[200px] rounded-full bg-indigo-500/20 blur-[60px] pointer-events-none" />
                <div className="absolute bottom-[-50px] left-[-50px] w-[200px] h-[200px] rounded-full bg-violet-500/15 blur-[60px] pointer-events-none" />
                <div className="relative z-10">
                  <ScrollReveal textClassName="text-3xl sm:text-5xl font-extrabold tracking-tight mb-6 text-white font-heading">Your data is waiting. Your AI agent is ready.</ScrollReveal>
              <p className="text-gray-400 max-w-xl mx-auto mb-10">Connect any database in under 60 seconds. Enterprise-grade security from day one. No credit card needed.</p>
              <div className="flex items-center justify-center gap-4 flex-wrap">
                <MotionButton onClick={() => navigate("/login")} className="px-8 py-3.5 bg-gradient-to-r from-indigo-500 to-violet-500 text-white font-bold rounded-full shadow-xl shadow-indigo-500/30 hover:shadow-2xl transition-all duration-300 cursor-pointer btn-glow">Get started free</MotionButton>
                <MotionButton onClick={() => scrollTo("pricing")} className="px-8 py-3.5 glass text-white font-bold rounded-full hover:border-indigo-500/40 transition-all duration-300 cursor-pointer">View plans</MotionButton>
              </div>
                </div>
              </div>
            </TiltCard>
          </motion.div>
        </RevealSection>
      </section>

      {/* ── Footer ── */}
      <footer className="border-t border-gray-800/50 py-16">
        <div className="max-w-7xl mx-auto px-6">
          <div className="grid grid-cols-2 md:grid-cols-5 gap-8 mb-12">
            <div className="col-span-2">
              <span className="text-xl font-extrabold font-poppins">Data<span style={{ color: '#A855F7' }}>Lens</span></span>
              <p className="text-sm text-gray-500 mt-3 max-w-xs leading-relaxed">The agentic data intelligence platform &mdash; one AI, every database, zero-trust security.</p>
            </div>
            <div>
              <h4 className="text-sm font-semibold text-gray-300 mb-4">Product</h4>
              <ul className="space-y-2 text-sm text-gray-500">
                <li><button onClick={() => scrollTo("features")} className="hover:text-gray-300 transition cursor-pointer">Features</button></li>
                <li><button onClick={() => scrollTo("pricing")} className="hover:text-gray-300 transition cursor-pointer">Pricing</button></li>
                <li><button onClick={() => scrollTo("how")} className="hover:text-gray-300 transition cursor-pointer">How It Works</button></li>
                <li><button onClick={() => scrollTo("demo")} className="hover:text-gray-300 transition cursor-pointer">Live Demo</button></li>
              </ul>
            </div>
            <div>
              <h4 className="text-sm font-semibold text-gray-300 mb-4">Resources</h4>
              <ul className="space-y-2 text-sm text-gray-500">
                <li><span className="text-gray-600">Documentation <span className="text-[10px] text-indigo-400/60 ml-1">Soon</span></span></li>
                <li><span className="text-gray-600">Changelog <span className="text-[10px] text-indigo-400/60 ml-1">Soon</span></span></li>
                <li><span className="text-gray-600">API Reference <span className="text-[10px] text-indigo-400/60 ml-1">Soon</span></span></li>
              </ul>
            </div>
            <div>
              <h4 className="text-sm font-semibold text-gray-300 mb-4">Contact</h4>
              <ul className="space-y-2 text-sm text-gray-500">
                <li><span className="text-gray-400">hello@datalens.ai</span></li>
                <li><span className="text-gray-400">@DataLens</span></li>
              </ul>
            </div>
          </div>
          <div className="border-t border-gray-800/50 pt-8 flex flex-col sm:flex-row items-center justify-between gap-4">
            <p className="text-xs text-gray-600">&copy; 2026 DataLens. All rights reserved.</p>
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

/* ── Wrap in GPUTierProvider so all 3D components can read the tier ── */
export default function Landing() {
  return (
    <GPUTierProvider>
      <LandingInner />
    </GPUTierProvider>
  );
}
