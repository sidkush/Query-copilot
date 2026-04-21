import { useNavigate } from "react-router-dom";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import { useStore } from "../store";
import React, { Suspense, Component } from "react";
import AnimatedCounter from "../components/animation/AnimatedCounter";
import AnimatedBackground from "../components/animation/AnimatedBackground";
import MotionButton from "../components/animation/MotionButton";
import { GPUTierProvider } from "../lib/gpuDetect.jsx";
import { useGPUTier } from "../lib/gpuDetect.js";
import useScrollParallax from "../components/animation/useScrollParallax";
import TiltCard from "../components/animation/TiltCard";
import AnimatedBorderGradient from "../components/animation/AnimatedBorderGradient";
import CursorGlow from "../components/animation/CursorGlow";
import ScrollProgress from "../components/animation/ScrollProgress";
// LoadingScreen removed — Canvas backgrounds load instantly
import AuroraBg from "../components/animation/AuroraBg";
import SectionBg from "../components/animation/SectionBg";
import AskDBLogo from "../components/AskDBLogo";

// WebGL Fallback Error Boundary
class WebGLErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }
  static getDerivedStateFromError(_error) { return { hasError: true }; }
  componentDidCatch(error, errorInfo) {
    console.warn("WebGL failed, falling back to 2D background.", error, errorInfo);
  }
  render() {
    return this.state.hasError ? this.props.fallback : this.props.children;
  }
}

// 3D backgrounds replaced with lightweight Canvas alternatives (AuroraBg, SectionBg)
import { useScrollReveal } from "../components/animation/useScrollReveal";
import ScrollReveal from "../components/animation/ScrollReveal";
// Static images replaced with animated React mockups (DemoVisual component below)

const DEMO_SLIDES = [
  {
    id: "chat_to_chart",
    label: "AI Agent",
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
      </svg>
    ),
    visual: "agent",
    title: "Autonomous Multi-Step Agent",
    desc: "Ask a complex question in plain English. The agent generates an execution plan, discovers relevant tables, writes dialect-aware SQL (BigQuery, Snowflake, PostgreSQL), auto-retries on errors, and delivers a formatted markdown summary with row count estimates \u2014 all before you click Execute.",
    highlights: ["Plan \u2192 Discover \u2192 Query \u2192 Summarize", "Session memory across conversations", "Safe mode or autonomous mode"],
  },
  {
    id: "dashboard_assembly",
    label: "Dashboard Builder",
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6A2.25 2.25 0 016 3.75h2.25A2.25 2.25 0 0110.5 6v2.25a2.25 2.25 0 01-2.25 2.25H6a2.25 2.25 0 01-2.25-2.25V6zM3.75 15.75A2.25 2.25 0 016 13.5h2.25a2.25 2.25 0 012.25 2.25V18a2.25 2.25 0 01-2.25 2.25H6A2.25 2.25 0 013.75 18v-2.25zM13.5 6a2.25 2.25 0 012.25-2.25H18A2.25 2.25 0 0120.25 6v2.25A2.25 2.25 0 0118 10.5h-2.25a2.25 2.25 0 01-2.25-2.25V6z" />
      </svg>
    ),
    visual: "dashboard",
    title: "Agent-Built + Hand-Crafted Dashboards",
    desc: "Tell the agent \u2018build me a revenue dashboard\u2019 and it plans tiles, writes queries, and creates the layout. Or build manually: drag-drop tiles, resize charts, add KPI cards with conditional formatting, organize into tabs and sections, apply custom themes.",
    highlights: ["Agent creates dashboards end-to-end", "Drag-drop grid + freeform canvas", "KPI cards, reference lines, bookmarks"],
  },
  {
    id: "dashboard_filter",
    label: "Filters & Export",
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 3c2.755 0 5.455.232 8.083.678.533.09.917.556.917 1.096v1.044a2.25 2.25 0 01-.659 1.591l-5.432 5.432a2.25 2.25 0 00-.659 1.591v2.927a2.25 2.25 0 01-1.244 2.013L9.75 21v-6.568a2.25 2.25 0 00-.659-1.591L3.659 7.409A2.25 2.25 0 013 5.818V4.774c0-.54.384-1.006.917-1.096A48.32 48.32 0 0112 3z" />
      </svg>
    ),
    visual: "filters",
    title: "Global Filters, Cross-Tile Sync & Export",
    desc: "Apply a date range or category filter once \u2014 every tile updates simultaneously. Click any chart element to cross-filter related tiles. Export to CSV, JSON, PDF, or PNG. Auto-generate 16:9 presentation slides. Push insights to Slack or schedule email digests.",
    highlights: ["One filter syncs all charts", "Click-through cross-filtering", "PDF, Slack, email digests, presentations"],
  },
  {
    id: "multi_db",
    label: "18 Databases",
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M20.25 6.375c0 2.278-3.694 4.125-8.25 4.125S3.75 8.653 3.75 6.375m16.5 0c0-2.278-3.694-4.125-8.25-4.125S3.75 4.097 3.75 6.375" />
      </svg>
    ),
    visual: "databases",
    title: "18 Engines, BYOK, Turbo Mode",
    desc: "Connect PostgreSQL, MySQL, Snowflake, BigQuery, Databricks, ClickHouse, DuckDB, and 11 more. Bring your own Anthropic API key and choose your model. Enable DuckDB Turbo Mode for sub-100ms analytical queries on a local replica \u2014 your production database stays untouched.",
    highlights: ["Dialect-aware SQL for every engine", "BYOK: Haiku, Sonnet, or Opus", "Turbo Mode: <100ms local replica"],
  },
];

const PAYMENT_LINKS = {
  free: null,
  pro: "https://buy.stripe.com/test_14A6oJ3AAgIf38ocyN4c801",
  team: "https://buy.stripe.com/test_eVqbJ38UUfEb24keGV4c802",
};

const FEATURES = [
  { icon: "ai", title: "Autonomous AI agent", desc: "Ask in plain English. The agent finds tables, writes SQL, picks the chart, and builds dashboards \u2014 all in one conversation.", primary: true },
  { icon: "chart", title: "Agent-built dashboards", desc: "Tell the agent what you need. It plans tiles, writes queries, and creates the layout. Edit manually with drag-drop or let it run.", primary: true },
  { icon: "database", title: "18 database engines", desc: "PostgreSQL, MySQL, Snowflake, BigQuery, Databricks, ClickHouse, DuckDB, and 11 more." },
  { icon: "speed", title: "Sub-100ms turbo mode", desc: "Local DuckDB replica for instant analytical queries. Your production database stays untouched." },
  { icon: "shield", title: "Enterprise security", desc: "6-layer SQL validation, automatic PII masking, read-only enforcement. JWT, OAuth, and OTP built in." },
  { icon: "export", title: "Export and share", desc: "CSV, PDF, PNG, Slack webhooks, email digests, and one-click 16:9 presentation slides." },
];

const STEPS = [
  { num: 1, title: "Connect & bring your key", desc: "Add your Anthropic API key, pick your model (Haiku, Sonnet, or Opus), and connect any of 18 database engines. Schema is auto-discovered and indexed. Your data stays read-only.", icon: <svg className="w-7 h-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M20.25 6.375c0 2.278-3.694 4.125-8.25 4.125S3.75 8.653 3.75 6.375m16.5 0c0-2.278-3.694-4.125-8.25-4.125S3.75 4.097 3.75 6.375m16.5 0v11.25c0 2.278-3.694 4.125-8.25 4.125s-8.25-1.847-8.25-4.125V6.375" /></svg> },
  { num: 2, title: "Ask anything in plain English", desc: "The autonomous agent finds relevant tables, writes validated SQL, handles errors, and suggests the optimal chart. Multi-step reasoning, not just text-to-SQL.", icon: <svg className="w-7 h-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" /></svg> },
  { num: 3, title: "Dashboards, alerts, presentations", desc: "Pin insights to drag-drop dashboards with global filters and KPIs. Define alerts in natural language. Auto-generate 16:9 slides. Push to Slack or schedule email digests.", icon: <svg className="w-7 h-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z" /></svg> },
];

const STATS = [
  { value: 18, suffix: "+", label: "Database engines supported" },
  { value: 100, suffix: "ms", label: "Turbo Mode query speed" },
  { value: 6, suffix: "-layer", label: "SQL security pipeline" },
  { value: 0, suffix: "", label: "AI markup \u2014 you pay Anthropic directly" },
];

const TESTIMONIALS = [
  { name: "Rina Kobayashi", role: "Head of Analytics, 340-person fintech", avatar: "RK", quote: "We replaced Metabase and two internal tools. The AI agent handles around 80% of ad-hoc requests, and BYOK means we control costs at the API level. The security model passed our CISO review in a single meeting." },
  { name: "James Okafor", role: "VP Engineering, Series B e-commerce", avatar: "JO", quote: "Connecting Snowflake, Postgres, and BigQuery into one dashboard took about 10 minutes. DuckDB Turbo Mode makes our standups instant \u2014 queries that took 8 seconds now return in under 100ms." },
  { name: "Lena Weiss", role: "VP Operations, mid-market logistics", avatar: "LW", quote: "The presentation engine turned our weekly ops review into a one-click workflow. NL alerts in Slack catch anomalies before the team logs in. Switching to Haiku for routine queries cut our API costs by 60%." },
];

const PLANS = [
  { name: "Free", price: "$0", period: "forever", badge: null, featured: false, features: ["10 AI agent queries per day", "2 database connectors", "1 dashboard with basic charts", "Haiku, Sonnet & Opus models", "Community support"], link: PAYMENT_LINKS.free, cta: "Start Free" },
  { name: "Pro", price: "$29", period: "per month", badge: "Most Popular", featured: true, features: ["Unlimited AI agent queries", "All 18 database connectors", "Unlimited dashboards + global filters", "DuckDB Turbo Mode (<100ms)", "NL alerts + Slack/Teams webhooks", "CSV, JSON, PDF, PNG export", "Scheduled email digests", "Priority support"], link: PAYMENT_LINKS.pro, cta: "Start Pro" },
  { name: "Team", price: "$79", period: "per seat / month", badge: "For Teams", featured: false, features: ["Everything in Pro", "Unlimited team seats", "SSO / SAML authentication", "Shared dashboards & query memory", "16:9 presentation engine", "White-label dashboards", "Dedicated account manager"], link: PAYMENT_LINKS.team, cta: "Start Team" },
];

const TRUST = [
  { name: "PostgreSQL", color: "text-blue-400/80" },
  { name: "Snowflake", color: "text-cyan-400/80" },
  { name: "BigQuery", color: "text-yellow-400/80" },
  { name: "Databricks", color: "text-red-400/80" },
  { name: "MySQL", color: "text-orange-400/80" },
  { name: "ClickHouse", color: "text-amber-400/80" },
  { name: "DuckDB", color: "text-green-400/80" },
  { name: "+ 11 more", color: "" },
];


const FEATURE_ICONS = {
  ai: (
    <div className="w-12 h-12 rounded-xl bg-blue-500/10 flex items-center justify-center mb-4 transition-colors duration-300">
      <svg className="w-6 h-6 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.455 2.456L21.75 6l-1.036.259a3.375 3.375 0 00-2.455 2.456z" />
      </svg>
    </div>
  ),
  speed: (
    <div className="w-12 h-12 rounded-xl bg-amber-500/15 flex items-center justify-center mb-4 transition-colors duration-300">
      <svg className="w-6 h-6 text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z" />
      </svg>
    </div>
  ),
  shield: (
    <div className="w-12 h-12 rounded-xl bg-emerald-500/15 flex items-center justify-center mb-4 transition-colors duration-300">
      <svg className="w-6 h-6 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
      </svg>
    </div>
  ),
  chart: (
    <div className="w-12 h-12 rounded-xl bg-violet-500/15 flex items-center justify-center mb-4 transition-colors duration-300">
      <svg className="w-6 h-6 text-violet-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" />
      </svg>
    </div>
  ),
  database: (
    <div className="w-12 h-12 rounded-xl bg-cyan-500/15 flex items-center justify-center mb-4 transition-colors duration-300">
      <svg className="w-6 h-6 text-cyan-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M20.25 6.375c0 2.278-3.694 4.125-8.25 4.125S3.75 8.653 3.75 6.375m16.5 0c0-2.278-3.694-4.125-8.25-4.125S3.75 4.097 3.75 6.375m16.5 0v11.25c0 2.278-3.694 4.125-8.25 4.125s-8.25-1.847-8.25-4.125V6.375m16.5 0v3.75m-16.5-3.75v3.75m16.5 0v3.75C20.25 16.153 16.556 18 12 18s-8.25-1.847-8.25-4.125v-3.75m16.5 0c0 2.278-3.694 4.125-8.25 4.125s-8.25-1.847-8.25-4.125" />
      </svg>
    </div>
  ),
  export: (
    <div className="w-12 h-12 rounded-xl bg-rose-500/15 flex items-center justify-center mb-4 transition-colors duration-300">
      <svg className="w-6 h-6 text-rose-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
      </svg>
    </div>
  ),
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

/* ── Parallax wrapper child — owns its own parallax binding so the parent
       does not access `parallax.ref` / `parallax.parallaxY` during render
       (which trips react-hooks/refs). ── */
function ParallaxWrapper({ speed, children }) {
  const parallax = useScrollParallax({ speed });
  return (
    // framer-motion's transform helpers expose `.ref` and `.parallaxY` for
    // direct binding into JSX — standard library API, not a stale ref read.
    // eslint-disable-next-line react-hooks/refs
    <motion.div ref={parallax.ref} style={{ y: parallax.parallaxY }}>
      {children}
    </motion.div>
  );
}

/* ── Section wrapper with scroll-reveal + parallax ── */
function RevealSection({ children, className = "", parallaxSpeed, ...props }) {
  const { ref, isInView } = useScrollReveal({ once: true, margin: "-60px", amount: 0.08 });

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

  if (parallaxSpeed) {
    return <ParallaxWrapper speed={parallaxSpeed}>{content}</ParallaxWrapper>;
  }
  return content;
}

// VisibleSectionBg removed — Canvas backgrounds are lightweight, no need to unmount

/* ── Animated Demo Visuals ── */
function DemoVisual({ type }) {
  const cardBg = 'var(--bg-elevated)';
  const borderCol = 'var(--border-default)';
  const textP = 'var(--text-primary)';
  const textS = 'var(--text-secondary)';
  const textM = 'var(--text-muted)';
  const surfBg = 'var(--bg-surface)';

  if (type === "agent") {
    const steps = [
      { label: "Planning execution strategy", icon: "plan", delay: 1.0 },
      { label: "Discovering tables: orders, regions, products", icon: "search", delay: 1.8 },
      { label: "Writing SQL (PostgreSQL dialect)", icon: "code", delay: 2.6 },
      { label: "Executing — 847 rows returned", icon: "run", delay: 3.4 },
      { label: "Generating summary with chart", icon: "chart", delay: 4.0 },
    ];
    return (
      <div className="p-5 space-y-3" style={{ background: cardBg }}>
        {/* Chat-like input with typing animation */}
        <div className="rounded-xl p-3.5" style={{ background: surfBg, border: `1px solid ${borderCol}` }}>
          <div className="flex items-center gap-2 mb-2">
            <div className="w-5 h-5 rounded-full bg-blue-600 flex items-center justify-center flex-shrink-0">
              <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0z" /></svg>
            </div>
            <span className="text-[10px] font-semibold" style={{ color: textM }}>You</span>
          </div>
          <motion.div className="text-[13px] font-medium leading-relaxed" style={{ color: textP }}
            initial={{ width: 0 }} animate={{ width: '100%' }} transition={{ duration: 1.8, ease: "easeOut" }}>
            <span style={{ overflow: 'hidden', display: 'inline-block', whiteSpace: 'nowrap', borderRight: '2px solid var(--accent)' }}>
              Show me revenue by region with growth rates
            </span>
          </motion.div>
        </div>
        {/* Agent execution steps */}
        <div className="space-y-1">
          {steps.map((step, i) => (
            <motion.div key={i} className="flex items-center gap-2.5 px-3.5 py-2 rounded-lg text-[11px]"
              initial={{ opacity: 0, x: -16 }} animate={{ opacity: 1, x: 0 }}
              transition={{ delay: step.delay, duration: 0.35, ease: "easeOut" }}>
              <motion.div className="w-4.5 h-4.5 rounded-full flex items-center justify-center flex-shrink-0"
                style={{ width: 18, height: 18 }}
                initial={{ background: 'var(--overlay-light)' }}
                animate={{ background: '#22c55e' }}
                transition={{ delay: step.delay + 0.4 }}>
                <svg className="w-2.5 h-2.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" /></svg>
              </motion.div>
              <span style={{ color: textS }}>{step.label}</span>
            </motion.div>
          ))}
        </div>
        {/* Result: summary + chart */}
        <motion.div className="rounded-xl overflow-hidden" style={{ border: `1px solid ${borderCol}` }}
          initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 4.6 }}>
          <div className="px-3.5 pt-3 pb-1">
            <motion.div className="text-[11px] leading-relaxed" style={{ color: textS }}
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 5.0 }}>
              Revenue grew <span className="font-semibold" style={{ color: '#22c55e' }}>+12.3%</span> overall.
              North America leads at <span className="font-semibold" style={{ color: textP }}>$1.2M</span>, followed by Europe and APAC.
            </motion.div>
          </div>
          <div className="px-3.5 pb-3 pt-2">
            <div className="flex items-end gap-1 h-20">
              {[28, 45, 38, 62, 52, 70, 58, 82, 68, 90, 75, 95].map((h, i) => (
                <motion.div key={i} className="flex-1 rounded-t"
                  style={{ background: i >= 10 ? '#2563EB' : i >= 6 ? '#3B82F6' : '#60A5FA' }}
                  initial={{ height: 0 }} animate={{ height: `${h}%` }}
                  transition={{ delay: 5.2 + i * 0.06, duration: 0.4, ease: "easeOut" }} />
              ))}
            </div>
          </div>
        </motion.div>
      </div>
    );
  }

  if (type === "dashboard") {
    return (
      <div className="p-5" style={{ background: cardBg }}>
        {/* Dashboard header mockup */}
        <motion.div className="flex items-center justify-between mb-3"
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.2 }}>
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-emerald-400" />
            <span className="text-[12px] font-bold" style={{ color: textP, fontFamily: "'Outfit', system-ui, sans-serif" }}>Revenue Dashboard</span>
          </div>
          <div className="flex gap-1">
            {["Theme", "Share", "Export"].map((b, i) => (
              <motion.span key={b} className="text-[8px] px-2 py-0.5 rounded" style={{ background: surfBg, color: textM, border: `1px solid ${borderCol}` }}
                initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.4 + i * 0.1 }}>{b}</motion.span>
            ))}
          </div>
        </motion.div>
        {/* KPI row — agent builds these first */}
        <div className="grid grid-cols-3 gap-2 mb-3">
          {[
            { label: "Total Revenue", val: "$2.4M", trend: "+12.3%", color: "#2563EB" },
            { label: "Active Users", val: "18.7K", trend: "+8.1%", color: "#22C55E" },
            { label: "Avg Order", val: "$127", trend: "+3.2%", color: "#06B6D4" },
          ].map((kpi, i) => (
            <motion.div key={i} className="rounded-lg p-2.5 relative overflow-hidden" style={{ background: surfBg, border: `1px solid ${borderCol}` }}
              initial={{ opacity: 0, y: 20, scale: 0.9 }} animate={{ opacity: 1, y: 0, scale: 1 }}
              transition={{ delay: 0.6 + i * 0.15, type: "spring", stiffness: 200 }}>
              <div className="absolute top-0 left-0 right-0 h-[3px]" style={{ background: kpi.color }} />
              <div className="text-[8px] uppercase tracking-wider font-semibold mt-0.5" style={{ color: textM }}>{kpi.label}</div>
              <div className="flex items-end justify-between mt-1">
                <motion.div className="text-[18px] font-bold" style={{ color: textP, fontFamily: "'Outfit', system-ui, sans-serif" }}
                  initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 1.0 + i * 0.15 }}>{kpi.val}</motion.div>
                <motion.span className="text-[9px] font-semibold px-1 py-0.5 rounded" style={{ color: '#22c55e', background: 'rgba(34,197,94,0.1)' }}
                  initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 1.2 + i * 0.15 }}>{kpi.trend}</motion.span>
              </div>
            </motion.div>
          ))}
        </div>
        {/* Chart tiles — 2-column layout */}
        <div className="grid grid-cols-5 gap-2">
          <motion.div className="col-span-3 rounded-lg p-3" style={{ background: surfBg, border: `1px solid ${borderCol}` }}
            initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 1.5 }}>
            <div className="text-[9px] font-semibold mb-2" style={{ color: textM }}>Revenue by quarter</div>
            <div className="flex items-end gap-0.5 h-24">
              {[30, 45, 35, 55, 48, 65, 58, 78, 68, 85, 75, 92].map((h, i) => (
                <motion.div key={i} className="flex-1 rounded-t"
                  style={{ background: i >= 10 ? '#2563EB' : i >= 6 ? '#3B82F6' : '#60A5FA' }}
                  initial={{ height: 0 }} animate={{ height: `${h}%` }}
                  transition={{ delay: 1.8 + i * 0.05, duration: 0.35, ease: "easeOut" }} />
              ))}
            </div>
          </motion.div>
          <motion.div className="col-span-2 rounded-lg p-3 flex flex-col items-center justify-center" style={{ background: surfBg, border: `1px solid ${borderCol}` }}
            initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 1.8 }}>
            <div className="text-[9px] font-semibold mb-2 self-start" style={{ color: textM }}>By region</div>
            <svg viewBox="0 0 100 100" className="w-20 h-20">
              {[
                { d: "M50 10 A40 40 0 0 1 90 50 L50 50Z", fill: "#2563EB" },
                { d: "M90 50 A40 40 0 0 1 50 90 L50 50Z", fill: "#22c55e" },
                { d: "M50 90 A40 40 0 0 1 10 50 L50 50Z", fill: "#f59e0b" },
                { d: "M10 50 A40 40 0 0 1 50 10 L50 50Z", fill: "#06b6d4" },
              ].map((seg, i) => (
                <motion.path key={i} d={seg.d} fill={seg.fill}
                  initial={{ opacity: 0, scale: 0 }} animate={{ opacity: 1, scale: 1 }}
                  style={{ transformOrigin: '50px 50px' }}
                  transition={{ delay: 2.1 + i * 0.12, duration: 0.35 }} />
              ))}
            </svg>
          </motion.div>
        </div>
      </div>
    );
  }

  if (type === "filters") {
    const tileColors = ['#2563EB', '#22c55e', '#06b6d4', '#f59e0b'];
    const tileData = [
      { title: "Revenue by Region", heights: [65, 48, 72, 55, 80, 42] },
      { title: "Monthly Trends", heights: [30, 45, 55, 48, 68, 75] },
      { title: "Top Products", heights: [85, 72, 60, 45, 38, 28] },
      { title: "Customer Segments", heights: [50, 62, 40, 75, 58, 45] },
    ];
    return (
      <div className="p-5 space-y-3" style={{ background: cardBg }}>
        {/* Global filter bar */}
        <motion.div className="rounded-xl px-3.5 py-2.5 flex items-center gap-2 flex-wrap"
          style={{ background: surfBg, border: `1px solid ${borderCol}` }}
          initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
          <svg className="w-3 h-3 flex-shrink-0" style={{ color: '#2563EB' }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 3c2.755 0 5.455.232 8.083.678.533.09.917.556.917 1.096v1.044a2.25 2.25 0 01-.659 1.591l-5.432 5.432a2.25 2.25 0 00-.659 1.591v2.927a2.25 2.25 0 01-1.244 2.013L9.75 21v-6.568a2.25 2.25 0 00-.659-1.591L3.659 7.409A2.25 2.25 0 013 5.818V4.774c0-.54.384-1.006.917-1.096A48.32 48.32 0 0112 3z" />
          </svg>
          <motion.span className="text-[10px] px-2 py-0.5 rounded-md font-medium" style={{ background: 'rgba(37,99,235,0.08)', color: '#3B82F6', border: '1px solid rgba(37,99,235,0.15)' }}
            initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.5 }}>
            2024-01-01 → today
          </motion.span>
          <motion.span className="text-[10px] px-2 py-0.5 rounded-md font-medium" style={{ background: 'rgba(37,99,235,0.08)', color: '#3B82F6', border: '1px solid rgba(37,99,235,0.15)' }}
            initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.8 }}>
            region = North America
          </motion.span>
          <motion.div className="ml-auto px-3 py-1 rounded-md text-[9px] font-bold text-white"
            style={{ background: '#2563EB' }}
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 1.1 }}>Apply</motion.div>
        </motion.div>
        {/* 4 tiles update simultaneously with flash effect */}
        <div className="grid grid-cols-2 gap-2">
          {tileData.map((tile, i) => (
            <motion.div key={i} className="rounded-lg p-2.5 relative overflow-hidden"
              style={{ background: surfBg, border: `1px solid ${borderCol}` }}
              initial={{ opacity: 0.3 }} animate={{ opacity: 1 }} transition={{ delay: 1.4 + i * 0.15 }}>
              <div className="text-[9px] font-semibold mb-1.5" style={{ color: textM }}>{tile.title}</div>
              <div className="flex items-end gap-0.5 h-14">
                {tile.heights.map((h, j) => (
                  <motion.div key={j} className="flex-1 rounded-t"
                    style={{ background: tileColors[i] }}
                    initial={{ height: `${h * 0.2}%` }} animate={{ height: `${h}%` }}
                    transition={{ delay: 1.5 + i * 0.15 + j * 0.04, duration: 0.5, ease: "easeOut" }} />
                ))}
              </div>
              {/* Cascade flash on filter apply */}
              <motion.div className="absolute inset-0 rounded-lg pointer-events-none"
                style={{ background: `${tileColors[i]}` }}
                initial={{ opacity: 0 }} animate={{ opacity: [0, 0.12, 0] }}
                transition={{ delay: 1.4 + i * 0.15, duration: 0.5 }} />
            </motion.div>
          ))}
        </div>
        {/* Export + presentation row */}
        <motion.div className="flex items-center gap-2 pt-1"
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 2.8 }}>
          <span className="text-[9px] font-semibold uppercase tracking-wider" style={{ color: textM }}>Export</span>
          {["CSV", "PDF", "PNG", "Slides", "Slack"].map((fmt, i) => (
            <motion.span key={fmt} className="text-[9px] font-medium px-2 py-1 rounded-md cursor-pointer"
              style={{ background: surfBg, color: textS, border: `1px solid ${borderCol}` }}
              initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 3.0 + i * 0.08 }}>{fmt}</motion.span>
          ))}
        </motion.div>
      </div>
    );
  }

  if (type === "databases") {
    const dbs = [
      { name: "PostgreSQL", color: "#336791" }, { name: "BigQuery", color: "#4285F4" },
      { name: "Snowflake", color: "#29B5E8" }, { name: "MySQL", color: "#4479A1" },
      { name: "Databricks", color: "#FF3621" }, { name: "ClickHouse", color: "#FFCC00" },
      { name: "DuckDB", color: "#FFC300" }, { name: "Redshift", color: "#8C4FFF" },
      { name: "MSSQL", color: "#CC2927" },
    ];
    return (
      <div className="p-5 space-y-3" style={{ background: cardBg }}>
        <div className="text-[10px] font-semibold flex items-center gap-2 mb-1" style={{ color: textM }}>
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M20.25 6.375c0 2.278-3.694 4.125-8.25 4.125S3.75 8.653 3.75 6.375m16.5 0c0-2.278-3.694-4.125-8.25-4.125S3.75 4.097 3.75 6.375m16.5 0v11.25c0 2.278-3.694 4.125-8.25 4.125s-8.25-1.847-8.25-4.125V6.375" />
          </svg>
          18 engines supported
        </div>
        {/* Database grid — each connects with a staggered animation */}
        <div className="grid grid-cols-3 gap-1.5">
          {dbs.map((db, i) => (
            <motion.div key={db.name} className="rounded-lg px-2.5 py-2 flex items-center gap-2"
              style={{ background: surfBg, border: `1px solid ${borderCol}` }}
              initial={{ opacity: 0, scale: 0.85 }} animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.3 + i * 0.08, type: "spring", stiffness: 300, damping: 20 }}>
              <motion.div className="w-2 h-2 rounded-full flex-shrink-0"
                initial={{ background: 'var(--overlay-medium)' }} animate={{ background: '#22c55e' }}
                transition={{ delay: 0.6 + i * 0.08 }} />
              <span className="text-[10px] font-medium truncate" style={{ color: textP }}>{db.name}</span>
            </motion.div>
          ))}
        </div>
        {/* BYOK model selector */}
        <motion.div className="rounded-xl p-3" style={{ background: surfBg, border: `1px solid ${borderCol}` }}
          initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 1.4 }}>
          <div className="text-[9px] font-semibold uppercase tracking-wider mb-2" style={{ color: textM }}>Your API key — model selection</div>
          <div className="flex gap-1.5">
            {[
              { name: "Haiku", desc: "Fast · $0.25/M", active: false },
              { name: "Sonnet", desc: "Balanced · $3/M", active: true },
              { name: "Opus", desc: "Powerful · $15/M", active: false },
            ].map((m, i) => (
              <motion.div key={m.name} className="flex-1 rounded-lg px-2 py-2 text-center"
                style={{
                  background: m.active ? 'rgba(37,99,235,0.08)' : 'transparent',
                  border: `1px solid ${m.active ? '#2563EB' : borderCol}`,
                }}
                initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 1.7 + i * 0.1 }}>
                <div className="text-[11px] font-bold" style={{ color: m.active ? '#2563EB' : textP }}>{m.name}</div>
                <div className="text-[8px]" style={{ color: textM }}>{m.desc}</div>
              </motion.div>
            ))}
          </div>
        </motion.div>
        {/* Turbo Mode activation */}
        <motion.div className="rounded-xl p-3 flex items-center gap-3"
          style={{ background: 'rgba(34,197,94,0.04)', border: '1px solid rgba(34,197,94,0.15)' }}
          initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 2.3 }}>
          <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: 'rgba(34,197,94,0.1)' }}>
            <svg className="w-5 h-5 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z" /></svg>
          </div>
          <div className="flex-1">
            <div className="text-[11px] font-bold text-emerald-400">Turbo Mode</div>
            <div className="text-[9px]" style={{ color: textM }}>Local DuckDB replica for instant queries</div>
          </div>
          <motion.div className="text-[18px] font-bold text-emerald-400" style={{ fontFamily: "'Outfit', system-ui, sans-serif" }}
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 2.7 }}>94<span className="text-[11px] font-medium">ms</span></motion.div>
        </motion.div>
      </div>
    );
  }

  return null;
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
                ? "bg-blue-600 text-white shadow-lg shadow-blue-600/20"
                : "glass-light hover:border-blue-400/30"
              }`}
          >
            {s.icon}
            <span className="hidden sm:inline">{s.label}</span>
          </motion.button>
        ))}
      </div>

      {/* Content area */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6 items-start">
        {/* Animated visual panel */}
        <div className="lg:col-span-3 rounded-2xl overflow-hidden glass-card relative" style={{ minHeight: 340 }}>
          <AnimatePresence mode="wait">
            <motion.div
              key={slide.id}
              initial={{ opacity: 0, scale: 0.97 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 1.02 }}
              transition={{ duration: 0.4, ease: "easeInOut" }}
            >
              <DemoVisual type={slide.visual} />
            </motion.div>
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
              <div className="w-12 h-12 rounded-xl bg-blue-500/10 flex items-center justify-center mb-5 text-blue-400">
                {slide.icon}
              </div>
              <h3 className="text-xl sm:text-2xl font-bold mb-3" style={{ color: 'var(--text-primary)' }}>{slide.title}</h3>
              <p className="leading-relaxed mb-4" style={{ color: 'var(--text-secondary)' }}>{slide.desc}</p>
              {slide.highlights && (
                <div className="flex flex-wrap gap-2 mb-5">
                  {slide.highlights.map((h, hi) => (
                    <span key={hi} className="inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1 rounded-full bg-blue-500/10 text-blue-300 border border-blue-500/20">
                      <svg className="w-3 h-3 text-emerald-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" /></svg>
                      {h}
                    </span>
                  ))}
                </div>
              )}
              <button
                onClick={() => nav("/login")}
                className="inline-flex items-center gap-2 text-sm font-semibold text-blue-400 hover:text-blue-300 transition-colors duration-200 mb-6 cursor-pointer group"
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
                    className={`h-1.5 rounded-full ease-spring transition cursor-pointer ${i === active ? "w-8 bg-blue-500" : "w-4 dot-inactive"}`}
                    style={i !== active ? { background: 'var(--overlay-medium)' } : undefined}
                    aria-label={`Slide ${i + 1}`}
                  />
                ))}
                <span className="text-xs ml-auto" style={{ color: 'var(--text-muted)' }}>{active + 1} / {DEMO_SLIDES.length}</span>
              </div>
            </motion.div>
          </AnimatePresence>

          {/* Nav arrows */}
          <div className="flex gap-2 mt-4 justify-end">
            <MotionButton
              onClick={() => setActive((active - 1 + DEMO_SLIDES.length) % DEMO_SLIDES.length)}
              className="w-10 h-10 rounded-xl glass-light flex items-center justify-center transition cursor-pointer" style={{ color: 'var(--text-muted)' }}
              aria-label="Previous demo"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
              </svg>
            </MotionButton>
            <MotionButton
              onClick={() => setActive((active + 1) % DEMO_SLIDES.length)}
              className="w-10 h-10 rounded-xl glass-light flex items-center justify-center transition cursor-pointer" style={{ color: 'var(--text-muted)' }}
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

function ThemeToggle() {
  const theme = useStore((s) => s.theme);
  const setTheme = useStore((s) => s.setTheme);
  const cycle = () => {
    const next = { light: "dark", dark: "system", system: "light" };
    setTheme(next[theme] || "light");
  };
  return (
    <button
      onClick={cycle}
      className="w-8 h-8 rounded-lg flex items-center justify-center transition-colors duration-200 cursor-pointer"
      style={{ color: 'var(--text-muted)', background: 'var(--overlay-subtle)' }}
      aria-label={`Theme: ${theme}`}
      title={`Theme: ${theme}`}
    >
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

function LandingInner() {
  const navigate = useNavigate();
  const token = useStore((s) => s.token);
  useGPUTier();
  const scrollTo = (id) => document.getElementById(id)?.scrollIntoView({ behavior: "smooth" });
  const [, setScrolled] = useState(false);
  const [showScrollTop, setShowScrollTop] = useState(false);

  // Section backgrounds — locked in
  const sectionBgs = { features: 'constellation', how: 'particleRise', demo: 'pulseRings', stats: 'particleRise', testimonials: 'softWaves', pricing: 'softWaves', cta: 'softWaves' };

  useEffect(() => {
    const handler = () => {
      setScrolled(window.scrollY > 20);
      setShowScrollTop(window.scrollY > 100);
    };
    window.addEventListener("scroll", handler, { passive: true });
    return () => window.removeEventListener("scroll", handler);
  }, []);

  // No loading screen needed — Canvas backgrounds load instantly

  return (
    <div className="min-h-screen overflow-x-hidden relative noise-overlay" style={{ background: 'var(--bg-page)', color: 'var(--text-primary)' }}>
      {/* No loading screen — Canvas backgrounds are instant */}
      <ScrollProgress />
      <CursorGlow />
      {/* ── Fluid Island Navbar — floating pill with bounce drop-in + idle float ── */}
      <div className="fixed top-5 left-0 right-0 z-50 px-4 pointer-events-none">
        <motion.nav
          initial={{ y: -56, opacity: 0, scale: 0.92 }}
          animate={{ y: 0, opacity: 1, scale: 1 }}
          transition={{
            // Soft bounce: slight overshoot + settle. Stiff enough to feel
            // confident, damped enough to avoid the "elastic band" look.
            type: "spring",
            stiffness: 260,
            damping: 13,
            mass: 0.9,
            delay: 0.2,
          }}
          className="nav-island nav-island-float rounded-full mx-auto flex items-center gap-1.5 pl-5 pr-1.5 py-1.5 pointer-events-auto"
          style={{ width: 'max-content', maxWidth: 'calc(100% - 2rem)' }}
        >
          <div className="inline-flex items-center mr-3" style={{ color: 'var(--text-primary)' }}>
            <AskDBLogo size="sm" />
          </div>
          <div className="hidden md:flex items-center gap-0.5">
            <button onClick={() => scrollTo("features")} className="nav-pill">Features</button>
            <button onClick={() => scrollTo("how")} className="nav-pill">How it works</button>
            <button onClick={() => scrollTo("pricing")} className="nav-pill">Pricing</button>
          </div>
          <div className="flex items-center gap-1.5 ml-2 pl-2" style={{ borderLeft: '1px solid var(--border-default)' }}>
            <ThemeToggle />
            {token ? (
              <button onClick={() => navigate("/dashboard")} className="text-sm font-semibold px-4 py-2 rounded-full bg-blue-600 text-white cursor-pointer ease-spring transition hover:bg-blue-500 hover:-translate-y-0.5 active:scale-[0.96]">
                Dashboard
              </button>
            ) : (
              <>
                <button onClick={() => navigate("/login")} className="nav-pill hidden sm:inline-flex">Sign in</button>
                <button onClick={() => navigate("/login")} className="text-sm font-semibold px-4 py-2 rounded-full bg-blue-600 text-white cursor-pointer ease-spring transition hover:bg-blue-500 hover:-translate-y-0.5 active:scale-[0.96]">
                  Get started
                </button>
              </>
            )}
          </div>
        </motion.nav>
      </div>

      {/* ── Hero (Split Layout: Text Left + Visual Right) ── */}
      <section className="relative min-h-[100dvh] flex items-center px-6 pt-32 pb-24 overflow-hidden">
        {/* Aurora background */}
        <AuroraBg />
        <div className="absolute inset-0 mesh-gradient pointer-events-none" />

        <div className="relative z-10 max-w-7xl mx-auto w-full grid grid-cols-1 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)] gap-16 lg:gap-24 items-center">
          {/* ── Left: Text ── */}
          <div>
            {/* ── Hero badge — warm amber to break away from blue brand.
                Dual-tone editorial treatment: glass pill with an amber dot
                and a subtle "Now Live" status tail. ── */}
            <motion.div
              className="inline-flex items-center gap-2.5 rounded-full pl-3.5 pr-4 py-1.5 mb-7 select-none"
              style={{
                background: 'var(--glass-bg-card)',
                border: '1px solid var(--accent-warm-glow)',
                backdropFilter: 'blur(18px) saturate(1.4)',
                WebkitBackdropFilter: 'blur(18px) saturate(1.4)',
                boxShadow: '0 6px 24px -8px var(--accent-warm-glow), 0 1px 0 rgba(255,255,255,0.04) inset',
              }}
              initial={{ opacity: 0, y: 24, scale: 0.9 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              transition={{ type: "spring", stiffness: 240, damping: 16, mass: 0.8, delay: 0.1 }}
            >
              <span className="eyebrow-dot--warm" />
              <span
                className="text-[10px] font-semibold uppercase"
                style={{
                  letterSpacing: '0.2em',
                  color: 'var(--accent-warm)',
                  fontFamily: "'Outfit', system-ui, sans-serif",
                }}
              >
                AI‑powered analytics
              </span>
              <span
                className="text-[10px] font-medium"
                style={{
                  letterSpacing: '0.12em',
                  color: 'var(--text-muted)',
                  paddingLeft: 10,
                  marginLeft: 4,
                  borderLeft: '1px solid var(--border-default)',
                }}
              >
                Now live
              </span>
            </motion.div>

            <motion.h1
              className="text-4xl sm:text-5xl lg:text-[3.75rem] font-extrabold tracking-tight leading-[1.02] mb-7 text-balance"
              initial={{ opacity: 0, y: 40 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ type: "spring", stiffness: 80, damping: 16, delay: 0.2 }}
            >
              Ask your data.{" "}
              <span style={{ color: 'var(--accent)' }}>
                Get answers.
              </span>
            </motion.h1>

            <motion.p
              className="text-base sm:text-lg max-w-lg mb-10 leading-[1.65]"
              style={{ color: 'var(--text-secondary)' }}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.4 }}
            >
              Ask questions in plain English. An AI agent writes the SQL, picks the chart, and builds the dashboard for you.
            </motion.p>

            <motion.div
              className="flex items-center gap-3 flex-wrap mb-10"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.55 }}
            >
              <button onClick={() => navigate("/login")} className="btn-nested bg-blue-600 hover:bg-blue-500 text-white cursor-pointer group">
                Start free
                <span className="btn-nested-arrow">
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
                  </svg>
                </span>
              </button>
              <button onClick={() => scrollTo("demo")} className="btn-nested-ghost cursor-pointer group">
                See it work
                <span className="btn-nested-arrow">
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 13.5L12 21m0 0l-7.5-7.5M12 21V3" />
                  </svg>
                </span>
              </button>
            </motion.div>

            {/* Compact trust strip */}
            <motion.div
              className="flex items-center gap-2 flex-wrap"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.8 }}
            >
              <span className="text-[10px] uppercase tracking-widest font-semibold" style={{ color: 'var(--text-muted)' }}>Works with</span>
              {["PostgreSQL", "BigQuery", "Snowflake", "MySQL", "Redshift", "+13 more"].map((db) => (
                <span key={db} className="text-[11px] font-medium px-2 py-0.5 rounded-full" style={{ color: 'var(--text-muted)', border: '1px solid var(--border-default)' }}>{db}</span>
              ))}
            </motion.div>
          </div>

          {/* ── Right: Live agent demo in premium chrome ── */}
          <motion.div
            className="relative hidden lg:block"
            initial={{ opacity: 0, x: 60, scale: 0.95 }}
            animate={{ opacity: 1, x: 0, scale: 1 }}
            transition={{ type: "spring", stiffness: 60, damping: 18, delay: 0.4 }}
          >
            {/* Premium browser frame with live demo */}
            <div className="bezel-shell shadow-2xl" style={{ transform: 'perspective(1200px) rotateY(-6deg) rotateX(2deg)' }}>
              <div className="bezel-core overflow-hidden" style={{ background: 'var(--bg-elevated)' }}>
                {/* Browser chrome */}
                <div className="flex items-center gap-1.5 px-3 py-2" style={{ background: 'var(--bg-surface)', borderBottom: '1px solid var(--border-default)' }}>
                  <span className="w-2.5 h-2.5 rounded-full bg-red-400/60" />
                  <span className="w-2.5 h-2.5 rounded-full bg-yellow-400/60" />
                  <span className="w-2.5 h-2.5 rounded-full bg-green-400/60" />
                  <span className="flex-1 text-center text-[10px] font-medium" style={{ color: 'var(--text-muted)' }}>askdb.dev/chat</span>
                </div>
                {/* Live agent demo */}
                <DemoVisual type="agent" />
              </div>
            </div>

            {/* Floating data source badges (the "ingestion" part) */}
            <motion.div
              className="absolute -left-8 top-8 glass rounded-xl px-3 py-2 shadow-xl flex items-center gap-2"
              animate={{ y: [0, -8, 0] }}
              transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
            >
              <div className="w-7 h-7 rounded-lg bg-blue-500/20 flex items-center justify-center">
                <svg className="w-4 h-4 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M20.25 6.375c0 2.278-3.694 4.125-8.25 4.125S3.75 8.653 3.75 6.375m16.5 0c0-2.278-3.694-4.125-8.25-4.125S3.75 4.097 3.75 6.375m16.5 0v11.25c0 2.278-3.694 4.125-8.25 4.125s-8.25-1.847-8.25-4.125V6.375" /></svg>
              </div>
              <div>
                <div className="text-[10px] font-bold" style={{ color: 'var(--text-primary)' }}>PostgreSQL</div>
                <div className="text-[8px]" style={{ color: 'var(--text-muted)' }}>Connected</div>
              </div>
            </motion.div>

            <motion.div
              className="absolute -left-4 bottom-16 glass rounded-xl px-3 py-2 shadow-xl flex items-center gap-2"
              animate={{ y: [0, -6, 0] }}
              transition={{ duration: 3.5, repeat: Infinity, ease: "easeInOut", delay: 0.5 }}
            >
              <div className="w-7 h-7 rounded-lg bg-cyan-500/20 flex items-center justify-center">
                <svg className="w-4 h-4 text-cyan-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M2.25 15a4.5 4.5 0 004.5 4.5H18a3.75 3.75 0 001.332-7.257 3 3 0 00-3.758-3.848 5.25 5.25 0 00-10.233 2.33A4.502 4.502 0 002.25 15z" /></svg>
              </div>
              <div>
                <div className="text-[10px] font-bold" style={{ color: 'var(--text-primary)' }}>BigQuery</div>
                <div className="text-[8px]" style={{ color: 'var(--text-muted)' }}>3 tables</div>
              </div>
            </motion.div>

            {/* AI agent badge */}
            <motion.div
              className="absolute -right-4 top-1/2 -translate-y-1/2 glass-card-elevated rounded-xl px-3 py-2 shadow-2xl"
              animate={{ y: [0, -5, 0] }}
              transition={{ duration: 2.8, repeat: Infinity, ease: "easeInOut", delay: 1 }}
            >
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-lg bg-blue-600 flex items-center justify-center">
                  <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" /></svg>
                </div>
                <div>
                  <div className="text-[10px] font-bold" style={{ color: 'var(--text-primary)' }}>AI Agent</div>
                  <div className="text-[8px] text-emerald-400 font-semibold">Building dashboard...</div>
                </div>
              </div>
            </motion.div>
          </motion.div>
        </div>
      </section>

      {/* Trust strip moved into hero left column */}

      {/* ── Features Bento (Glassmorphism Cards) ── */}
      <section id="features" className="py-24 sm:py-32 relative overflow-hidden">
        <SectionBg mode={sectionBgs.features} />
        <RevealSection className="max-w-7xl mx-auto px-6" parallaxSpeed={0.15}>
          <motion.div className="text-center mb-16" variants={staggerItem}>
            <p className="eyebrow mb-3" style={{ color: 'var(--accent)', justifyContent: 'center' }}><span className="eyebrow-dot" />Features</p>
            <ScrollReveal textClassName="text-3xl sm:text-5xl font-extrabold tracking-tight mb-4 font-heading text-balance">One platform that replaces your entire analytics stack</ScrollReveal>
            <p className="max-w-lg mx-auto" style={{ color: 'var(--text-secondary)' }}>Your API key. Every database. Full dashboards in minutes.</p>
          </motion.div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 max-w-4xl mx-auto">
            {FEATURES.map((f, i) => (
              <motion.div
                key={i}
                className={f.primary ? "sm:col-span-2" : ""}
                variants={{
                  hidden: { opacity: 0, y: 30 },
                  visible: {
                    opacity: 1,
                    y: 0,
                    transition: { type: "spring", stiffness: 120, damping: 16, delay: i * 0.06 },
                  },
                }}
              >
                <div className={`glass-card rounded-2xl h-full ${f.primary ? "p-8 sm:p-10" : "p-6 sm:p-8"}`}>
                  {FEATURE_ICONS[f.icon]}
                  <h3 className={`font-bold mb-2 ${f.primary ? "text-xl" : "text-lg"}`} style={{ color: 'var(--text-primary)', fontFamily: "'Outfit', system-ui, sans-serif" }}>{f.title}</h3>
                  <p className="text-sm leading-relaxed max-w-lg" style={{ color: 'var(--text-secondary)' }}>{f.desc}</p>
                </div>
              </motion.div>
            ))}
          </div>
        </RevealSection>
      </section>

      {/* ── How It Works (Glassmorphism) ── */}
      <section id="how" className="py-24 sm:py-32 relative overflow-hidden">
        <div className="absolute inset-0 mesh-gradient opacity-50 pointer-events-none" />
        <SectionBg mode={sectionBgs.how} />
        <RevealSection className="max-w-7xl mx-auto px-6 relative z-10" parallaxSpeed={0.1}>
          <motion.div className="text-center mb-16" variants={staggerItem}>
            <p className="eyebrow mb-3" style={{ color: 'var(--accent)', justifyContent: 'center' }}><span className="eyebrow-dot" />How it works</p>
            <ScrollReveal textClassName="text-3xl sm:text-5xl font-extrabold tracking-tight font-heading text-balance">From API key to production dashboard in 3 steps</ScrollReveal>
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
                    <div className="w-16 h-16 rounded-2xl bg-blue-600 text-white flex items-center justify-center mx-auto mb-6 shadow-lg shadow-blue-600/20">
                      {s.icon}
                    </div>
                    <div className="inline-flex items-center justify-center w-8 h-8 rounded-full glass text-blue-400 text-sm font-bold mb-4">{s.num}</div>
                    <h3 className="text-lg font-bold mb-3" style={{ color: 'var(--text-primary)' }}>{s.title}</h3>
                    <p className="text-sm leading-relaxed" style={{ color: 'var(--text-secondary)' }}>{s.desc}</p>
                  </div>
                </TiltCard>
              </motion.div>
            ))}
          </div>
        </RevealSection>
      </section>

      {/* ── Live Demo Carousel ── */}
      <section id="demo" className="py-24 sm:py-32 relative overflow-hidden">
        <SectionBg mode={sectionBgs.demo} />
        <RevealSection className="max-w-7xl mx-auto px-6">
          <motion.div className="text-center mb-10" variants={staggerItem}>
            <p className="eyebrow mb-3" style={{ color: 'var(--accent)', justifyContent: 'center' }}><span className="eyebrow-dot" />Live demo</p>
            <ScrollReveal textClassName="text-3xl sm:text-5xl font-extrabold tracking-tight mb-4 font-heading text-balance">See the full platform in action</ScrollReveal>
            <p style={{ color: 'var(--text-secondary)' }}>Click a tab to explore autonomous agents, dashboards, exports, and 18-database connectivity.</p>
          </motion.div>
          <motion.div variants={fadeScale}>
            <DemoCarousel />
          </motion.div>
        </RevealSection>
      </section>

      {/* ── Stats ── */}
      <section className="py-24 sm:py-32 relative overflow-hidden">
        <div className="absolute inset-0 mesh-gradient opacity-30 pointer-events-none" />
        <SectionBg mode={sectionBgs.stats} />
        <RevealSection className="max-w-5xl mx-auto px-6 relative z-10" parallaxSpeed={0.12}>
          <TiltCard maxTilt={4}>
            <div className="glass-card rounded-2xl relative overflow-hidden">
              <div className="absolute inset-0 bg-gradient-to-r from-blue-500/[0.03] via-transparent to-cyan-500/[0.03] pointer-events-none" />
              <div className="relative grid grid-cols-2 md:grid-cols-4">
                {STATS.map((s, i) => (
                  <motion.div
                    key={s.label}
                    className={`flex flex-col items-center justify-center py-8 sm:py-10 px-4 sm:px-6${
                      i < 2 ? " border-b md:border-b-0" : ""
                    }${i % 2 === 0 ? " border-r" : ""
                    }${i === 1 ? " md:border-r" : ""
                    }${i === 2 ? " md:border-r" : ""
                    }${i === 3 ? " border-r-0" : ""}`}
                    style={{ borderColor: 'var(--border-default)' }}
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
                      <span style={{ color: 'var(--text-primary)' }}>
                        <AnimatedCounter
                          value={s.value}
                          suffix={s.suffix}
                          duration={2}
                          className="text-3xl sm:text-4xl md:text-[2.75rem] font-extrabold leading-none tracking-tight tabular-nums"
                        />
                      </span>
                    </div>
                    <p className="text-xs sm:text-sm leading-relaxed text-center max-w-[140px]" style={{ color: 'var(--text-secondary)' }}>{s.label}</p>
                  </motion.div>
                ))}
              </div>
            </div>
          </TiltCard>
        </RevealSection>
      </section>

      {/* ── Testimonials (Glassmorphism + TiltCard) ── */}
      <section className="py-24 sm:py-32 relative overflow-hidden">
        <SectionBg mode={sectionBgs.testimonials} />
        <RevealSection className="max-w-7xl mx-auto px-6" parallaxSpeed={0.1}>
          <motion.div className="text-center mb-16" variants={staggerItem}>
            <p className="eyebrow mb-3" style={{ color: 'var(--accent)', justifyContent: 'center' }}><span className="eyebrow-dot" />Testimonials</p>
            <ScrollReveal textClassName="text-3xl sm:text-5xl font-extrabold tracking-tight font-heading text-balance">Built for data teams who ship</ScrollReveal>
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
                      className="absolute -top-2 -left-1 text-4xl text-blue-500/20 font-serif select-none pointer-events-none"
                      animate={{ y: [0, -6, 0] }}
                      transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
                    >
                      &ldquo;
                    </motion.span>
                    <div className="text-yellow-400 text-lg mb-4">&#9733;&#9733;&#9733;&#9733;&#9733;</div>
                    <p className="italic leading-relaxed mb-6" style={{ color: 'var(--text-secondary)' }}>&ldquo;{t.quote}&rdquo;</p>
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-blue-600 flex items-center justify-center text-white text-sm font-bold flex-shrink-0 shadow-lg shadow-blue-600/15">{t.avatar}</div>
                      <div>
                        <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>{t.name}</p>
                        <p className="text-xs" style={{ color: 'var(--text-muted)' }}>{t.role}</p>
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
        <SectionBg mode={sectionBgs.pricing} />
        <RevealSection className="max-w-7xl mx-auto px-6 relative z-10" parallaxSpeed={0.08}>
          <motion.div className="text-center mb-16" variants={staggerItem}>
            <p className="eyebrow mb-3" style={{ color: 'var(--accent)', justifyContent: 'center' }}><span className="eyebrow-dot" />Pricing</p>
            <ScrollReveal textClassName="text-3xl sm:text-5xl font-extrabold tracking-tight mb-4 font-heading text-balance">Your key, your models, our platform</ScrollReveal>
            <p className="max-w-md mx-auto" style={{ color: 'var(--text-secondary)' }}>Bring your own Anthropic API key. Pay us for the platform. Pay Anthropic for the AI. No hidden markup.</p>
          </motion.div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-5xl mx-auto items-stretch">
            {PLANS.map((plan, i) => (
              <motion.div
                key={plan.name}
                variants={{
                  hidden: { opacity: 0, y: 50, scale: 0.9 },
                  visible: {
                    opacity: 1,
                    y: 0,
                    scale: 1,
                    transition: { type: "spring", stiffness: 100, damping: 14, delay: i * 0.12 },
                  },
                }}
              >
                <AnimatedBorderGradient active={plan.featured} borderRadius="1rem">
                  <TiltCard className="h-full">
                    <div className={`rounded-2xl p-8 h-full flex flex-col ${plan.featured ? "glass-card border-blue-500/30 shadow-xl shadow-blue-600/10" : "glass-card"}`}>
                      {plan.badge && <div className="inline-flex self-start bg-blue-600 text-white text-[10px] font-bold px-3 py-0.5 rounded-full mb-4">{plan.badge}</div>}
                      <h3 className="text-lg font-bold mb-1" style={{ color: 'var(--text-primary)' }}>{plan.name}</h3>
                      <div className="mb-1"><span className="text-5xl font-extrabold" style={{ color: 'var(--text-primary)', fontFamily: "'Outfit', system-ui, sans-serif" }}>{plan.price}</span></div>
                      <p className="text-sm mb-6" style={{ color: 'var(--text-muted)' }}>{plan.period}</p>
                      <ul className="space-y-3 mb-8 flex-1">
                        {plan.features.map((f) => (
                          <li key={f} className="flex items-start gap-2 text-sm" style={{ color: 'var(--text-secondary)' }}><span className="text-green-400 mt-0.5 flex-shrink-0">&#10003;</span>{f}</li>
                        ))}
                      </ul>
                      {plan.link ? (
                        <a href={plan.link} target="_blank" rel="noopener noreferrer" className={`block text-center py-3 rounded-full font-semibold text-sm ease-spring transition cursor-pointer mt-auto ${plan.featured ? "bg-blue-600 text-white shadow-lg shadow-blue-600/20 hover:-translate-y-0.5 btn-glow shine-sweep" : "glass hover:border-blue-500/30 hover:-translate-y-0.5"}`}>{plan.cta}</a>
                      ) : (
                        <button onClick={() => navigate("/login")} className={`block w-full text-center py-3 rounded-full font-semibold text-sm ease-spring transition cursor-pointer mt-auto ${plan.featured ? "bg-blue-600 text-white shadow-lg shadow-blue-600/20 hover:-translate-y-0.5 btn-glow shine-sweep" : "glass hover:border-blue-500/30 hover:-translate-y-0.5"}`}>{plan.cta}</button>
                      )}
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
        <SectionBg mode={sectionBgs.cta} />
        <RevealSection className="max-w-4xl mx-auto px-6 text-center">
          <motion.div variants={fadeScale}>
            <TiltCard maxTilt={4}>
              <div className="glass-card rounded-2xl p-12 sm:p-16 relative overflow-hidden">
                <div className="absolute top-[-50px] right-[-50px] w-[200px] h-[200px] rounded-full bg-blue-500/20 blur-[60px] pointer-events-none" />
                <div className="absolute bottom-[-50px] left-[-50px] w-[200px] h-[200px] rounded-full bg-blue-500/10 blur-[60px] pointer-events-none" />
                <div className="relative z-10">
                  <ScrollReveal textClassName="text-3xl sm:text-5xl font-extrabold tracking-tight mb-6 font-heading text-balance">Start querying in under 60 seconds</ScrollReveal>
              <p className="max-w-xl mx-auto mb-10" style={{ color: 'var(--text-secondary)' }}>Plug in your Anthropic API key, connect any of 18 databases, and ask your first question. Free tier, no credit card.</p>
              <div className="flex items-center justify-center gap-4 flex-wrap">
                <button onClick={() => navigate("/login")} className="btn-nested bg-blue-600 hover:bg-blue-500 text-white cursor-pointer group">
                  Start free with your API key
                  <span className="btn-nested-arrow">
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
                    </svg>
                  </span>
                </button>
                <button onClick={() => scrollTo("pricing")} className="btn-nested-ghost cursor-pointer group">
                  Compare plans
                  <span className="btn-nested-arrow">
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 13.5L12 21m0 0l-7.5-7.5M12 21V3" />
                    </svg>
                  </span>
                </button>
              </div>
                </div>
              </div>
            </TiltCard>
          </motion.div>
        </RevealSection>
      </section>

      {/* ── Footer ── */}
      <footer className="border-t py-16" style={{ borderColor: 'var(--border-default)' }}>
        <div className="max-w-7xl mx-auto px-6">
          <div className="grid grid-cols-2 md:grid-cols-5 gap-8 mb-12">
            <div className="col-span-2">
              <div className="inline-flex items-center" style={{ color: 'var(--text-primary)' }}><AskDBLogo size="md" /></div>
              <p className="text-sm mt-3 max-w-xs leading-relaxed" style={{ color: 'var(--text-muted)' }}>The BYOK analytics platform &mdash; your API key, your models, every database, zero-trust security.</p>
            </div>
            <div>
              <h4 className="text-sm font-semibold mb-4" style={{ color: 'var(--text-secondary)' }}>Product</h4>
              <ul className="space-y-2 text-sm">
                <li><button onClick={() => scrollTo("features")} className="footer-link ease-spring cursor-pointer">Features</button></li>
                <li><button onClick={() => scrollTo("pricing")} className="footer-link ease-spring cursor-pointer">Pricing</button></li>
                <li><button onClick={() => scrollTo("how")} className="footer-link ease-spring cursor-pointer">How it works</button></li>
                <li><button onClick={() => scrollTo("demo")} className="footer-link ease-spring cursor-pointer">Live demo</button></li>
              </ul>
            </div>
            <div>
              <h4 className="text-sm font-semibold mb-4" style={{ color: 'var(--text-secondary)' }}>Contact</h4>
              <ul className="space-y-2 text-sm" style={{ color: 'var(--text-muted)' }}>
                <li><span style={{ color: 'var(--text-secondary)' }}>hello@askdb.ai</span></li>
                <li><span style={{ color: 'var(--text-secondary)' }}>@AskDB</span></li>
              </ul>
            </div>
          </div>
          <div className="border-t pt-8 flex flex-col sm:flex-row items-center justify-between gap-4" style={{ borderColor: 'var(--border-default)' }}>
            <p className="text-xs" style={{ color: 'var(--text-muted)' }}>&copy; 2026 AskDB. All rights reserved.</p>
            <div className="flex gap-6 text-xs">
              <button type="button" className="footer-link ease-spring cursor-pointer">Privacy</button>
              <button type="button" className="footer-link ease-spring cursor-pointer">Terms</button>
            </div>
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
