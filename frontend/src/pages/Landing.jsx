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
  { icon: "ai", title: "Autonomous AI Agent", desc: "Describe what you need. The agent finds tables, writes SQL, retries on errors, picks the chart type, and builds full dashboards \u2014 all in one conversation.", tags: ["Multi-Step Tool Use", "Plan & Execute", "Session Memory"] },
  { icon: "key", title: "Bring Your Own Key", desc: "Plug in your Anthropic API key. Choose Haiku for speed, Sonnet for balance, or Opus for complex reasoning. Switch models anytime. Zero AI markup.", tags: ["BYOK", "Model Selection"] },
  { icon: "database", title: "18 Database Engines", num: "18", desc: "PostgreSQL, MySQL, Snowflake, BigQuery, Databricks, ClickHouse, DuckDB, and 11 more. One platform, every source." },
  { icon: "speed", title: "DuckDB Turbo Mode", desc: "Opt-in local replica delivers sub-100ms analytical queries. Like having a cache that thinks. Your production database stays untouched.", tags: ["<100ms Queries", "Local Replica"] },
  { icon: "shield", title: "Enterprise Security", desc: "6-layer SQL validation pipeline, automatic PII masking, read-only enforcement at every level. JWT, OAuth, and OTP authentication built in.", tags: ["6-Layer Validation", "PII Masking", "Read-Only"] },
  { icon: "chart", title: "Agent-Built Dashboards", desc: "Tell the agent \u2018build me a revenue dashboard.\u2019 It plans the tiles, writes every query, creates the charts. You can drag-drop edit or let it run autonomously.", tags: ["Safe Mode", "Auto Mode", "Drag & Drop"] },
  { icon: "brain", title: "Self-Improving Intelligence", desc: "4-tier query intelligence waterfall: schema cache, query memory, DuckDB turbo, and live SQL. Every query makes the next one faster.", tags: ["Query Memory", "Schema Cache", "Waterfall Router"] },
  { icon: "export", title: "Export Everywhere", desc: "CSV, JSON, PDF, and PNG downloads. Slack webhooks and scheduled email digests. One-click 16:9 presentation slides for your boardroom.", tags: ["PDF", "Slack", "Presentation Mode", "Email Digests"] },
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
  { name: "Sarah Chen", role: "Head of Analytics \u00B7 Nexora", avatar: "SC", quote: "We replaced Metabase and two internal tools. The AI agent handles 80% of ad-hoc requests, and BYOK means we control costs at the API level. The 6-layer security model passed our CISO review in one meeting." },
  { name: "Marcus Rivera", role: "VP Engineering \u00B7 TechFlow", avatar: "MR", quote: "Connecting Snowflake, Postgres, and BigQuery into one dashboard took 10 minutes. DuckDB Turbo Mode makes our daily standups instant \u2014 queries that took 8 seconds now return in under 100ms." },
  { name: "Aisha Patel", role: "VP Operations \u00B7 DataSync", avatar: "AP", quote: "The presentation engine turned our weekly ops review into a one-click workflow. We set NL alerts in Slack and catch anomalies before the team logs in. Switching to Haiku for routine queries cut our API costs by 60%." },
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
  { name: "+ 11 more", color: "text-gray-400" },
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
  key: (
    <div className="w-12 h-12 rounded-xl bg-amber-500/15 flex items-center justify-center mb-4 group-hover:bg-amber-500/25 transition-colors duration-300">
      <svg className="w-6 h-6 text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 5.25a3 3 0 013 3m3 0a6 6 0 01-7.029 5.912c-.563-.097-1.159.026-1.563.43L10.5 17.25H8.25v2.25H6v2.25H2.25v-2.818c0-.597.237-1.17.659-1.591l6.499-6.499c.404-.404.527-1 .43-1.563A6 6 0 1121.75 8.25z" />
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

/* ── Animated Demo Visuals ── */
function DemoVisual({ type }) {
  const cardBg = 'var(--bg-elevated)';
  const borderCol = 'var(--border-default)';
  const textP = 'var(--text-primary)';
  const textS = 'var(--text-secondary)';
  const textM = 'var(--text-muted)';
  const surfBg = 'var(--bg-surface)';

  if (type === "agent") {
    // AI Agent workflow: typing → SQL → results → chart
    return (
      <div className="p-4 space-y-3" style={{ background: cardBg }}>
        {/* Chat input with typing */}
        <div className="rounded-xl p-3" style={{ background: surfBg, border: `1px solid ${borderCol}` }}>
          <div className="text-[10px] font-semibold mb-2" style={{ color: textM }}>ASK ANYTHING</div>
          <motion.div className="text-sm font-medium" style={{ color: textP }}
            initial={{ width: 0 }} animate={{ width: '100%' }} transition={{ duration: 2, ease: "easeOut" }}>
            <span style={{ overflow: 'hidden', display: 'inline-block', whiteSpace: 'nowrap', borderRight: '2px solid #6366f1' }}>
              Show me revenue by region with growth rates
            </span>
          </motion.div>
        </div>
        {/* Agent steps */}
        <div className="space-y-1.5">
          {["Planning query execution...", "Discovering tables: orders, regions", "Writing SQL (PostgreSQL dialect)", "Executing query — 847 rows"].map((step, i) => (
            <motion.div key={i} className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-[11px]"
              style={{ background: surfBg, border: `1px solid ${borderCol}` }}
              initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.8 + i * 0.6, duration: 0.4 }}>
              <motion.div className="w-4 h-4 rounded-full flex items-center justify-center flex-shrink-0"
                initial={{ background: '#f59e0b' }} animate={{ background: '#22c55e' }}
                transition={{ delay: 1.0 + i * 0.6 }}>
                <svg className="w-2.5 h-2.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" /></svg>
              </motion.div>
              <span style={{ color: textS }}>{step}</span>
            </motion.div>
          ))}
        </div>
        {/* Result chart */}
        <motion.div className="rounded-xl p-3" style={{ background: surfBg, border: `1px solid ${borderCol}` }}
          initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 3.4 }}>
          <div className="text-[10px] font-semibold mb-2" style={{ color: textM }}>RESULTS — 847 rows</div>
          <div className="flex items-end gap-1 h-16">
            {[35, 52, 42, 68, 58, 75, 62, 88, 72, 95].map((h, i) => (
              <motion.div key={i} className="flex-1 rounded-t-sm"
                style={{ background: i >= 8 ? '#6366f1' : i >= 5 ? '#818cf8' : '#a5b4fc' }}
                initial={{ height: 0 }} animate={{ height: `${h}%` }}
                transition={{ delay: 3.6 + i * 0.08, duration: 0.4, ease: "easeOut" }} />
            ))}
          </div>
        </motion.div>
      </div>
    );
  }

  if (type === "dashboard") {
    // Dashboard builder: tiles appearing + KPIs filling
    return (
      <div className="p-4" style={{ background: cardBg }}>
        <div className="text-[10px] font-semibold mb-3 flex items-center gap-2" style={{ color: textM }}>
          <span className="w-2 h-2 rounded-full bg-emerald-400" /> MARKETING DASHBOARD
        </div>
        <div className="grid grid-cols-3 gap-2 mb-3">
          {[
            { label: "Total Revenue", val: "$2.4M", color: "#2563EB" },
            { label: "Conversion Rate", val: "4.8%", color: "#22C55E" },
            { label: "Avg Order Value", val: "$127", color: "#A855F7" },
          ].map((kpi, i) => (
            <motion.div key={i} className="rounded-lg p-2.5" style={{ background: surfBg, border: `1px solid ${borderCol}` }}
              initial={{ opacity: 0, scale: 0.8, y: 20 }} animate={{ opacity: 1, scale: 1, y: 0 }}
              transition={{ delay: 0.3 + i * 0.2, type: "spring", stiffness: 200 }}>
              <div className="text-[8px] uppercase tracking-wider font-semibold" style={{ color: textM }}>{kpi.label}</div>
              <motion.div className="text-lg font-bold" style={{ color: textP }}
                initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.8 + i * 0.2 }}>{kpi.val}</motion.div>
              <div className="h-1 rounded-full mt-1" style={{ background: `${borderCol}` }}>
                <motion.div className="h-full rounded-full" style={{ background: kpi.color }}
                  initial={{ width: 0 }} animate={{ width: `${60 + i * 15}%` }} transition={{ delay: 1 + i * 0.15, duration: 0.8 }} />
              </div>
            </motion.div>
          ))}
        </div>
        {/* Chart tiles */}
        <div className="grid grid-cols-2 gap-2">
          <motion.div className="rounded-lg p-3" style={{ background: surfBg, border: `1px solid ${borderCol}` }}
            initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 1.2 }}>
            <div className="text-[9px] font-semibold mb-2" style={{ color: textM }}>Revenue Trend</div>
            <div className="flex items-end gap-0.5 h-20">
              {[30, 45, 35, 55, 48, 65, 58, 78, 68, 85, 75, 92].map((h, i) => (
                <motion.div key={i} className="flex-1 rounded-t-sm" style={{ background: '#6366f1' }}
                  initial={{ height: 0 }} animate={{ height: `${h}%` }}
                  transition={{ delay: 1.5 + i * 0.05, duration: 0.3 }} />
              ))}
            </div>
          </motion.div>
          <motion.div className="rounded-lg p-3" style={{ background: surfBg, border: `1px solid ${borderCol}` }}
            initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 1.5 }}>
            <div className="text-[9px] font-semibold mb-2" style={{ color: textM }}>By Category</div>
            <div className="flex items-center justify-center h-20">
              <svg viewBox="0 0 100 100" className="w-20 h-20">
                {[
                  { d: "M50 10 A40 40 0 0 1 90 50 L50 50Z", fill: "#6366f1" },
                  { d: "M90 50 A40 40 0 0 1 50 90 L50 50Z", fill: "#22c55e" },
                  { d: "M50 90 A40 40 0 0 1 10 50 L50 50Z", fill: "#f59e0b" },
                  { d: "M10 50 A40 40 0 0 1 50 10 L50 50Z", fill: "#a855f7" },
                ].map((seg, i) => (
                  <motion.path key={i} d={seg.d} fill={seg.fill}
                    initial={{ opacity: 0, scale: 0 }} animate={{ opacity: 1, scale: 1 }}
                    style={{ transformOrigin: '50px 50px' }}
                    transition={{ delay: 1.8 + i * 0.15, duration: 0.4 }} />
                ))}
              </svg>
            </div>
          </motion.div>
        </div>
      </div>
    );
  }

  if (type === "filters") {
    // Filters: filter bar → tiles updating → export
    return (
      <div className="p-4 space-y-3" style={{ background: cardBg }}>
        {/* Filter bar */}
        <motion.div className="rounded-xl px-3 py-2 flex items-center gap-2 flex-wrap"
          style={{ background: surfBg, border: `1px solid ${borderCol}` }}
          initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
          <span className="text-[9px] font-bold uppercase tracking-wider" style={{ color: '#6366f1' }}>Filters</span>
          <motion.span className="text-[10px] px-2 py-0.5 rounded-md" style={{ background: '#6366f120', color: '#818cf8', border: '1px solid #6366f130' }}
            initial={{ opacity: 0, scale: 0 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.6 }}>
            date ≥ 2024-01-01
          </motion.span>
          <motion.span className="text-[10px] px-2 py-0.5 rounded-md" style={{ background: '#6366f120', color: '#818cf8', border: '1px solid #6366f130' }}
            initial={{ opacity: 0, scale: 0 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.9 }}>
            region = North America
          </motion.span>
          <motion.div className="ml-auto px-3 py-1 rounded-md text-[10px] font-bold text-white"
            style={{ background: '#6366f1' }}
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 1.2 }}
            whileHover={{ scale: 1.05 }}>Apply</motion.div>
        </motion.div>
        {/* Tiles updating */}
        <div className="grid grid-cols-2 gap-2">
          {["Revenue by Region", "Monthly Trends", "Top Products", "Customer Segments"].map((title, i) => (
            <motion.div key={i} className="rounded-lg p-2.5 relative overflow-hidden"
              style={{ background: surfBg, border: `1px solid ${borderCol}` }}
              initial={{ opacity: 0.4 }} animate={{ opacity: 1 }} transition={{ delay: 1.5 + i * 0.2 }}>
              <div className="text-[9px] font-semibold mb-1" style={{ color: textM }}>{title}</div>
              <div className="flex items-end gap-0.5 h-12">
                {Array.from({ length: 6 }, (_, j) => 20 + Math.random() * 60).map((h, j) => (
                  <motion.div key={j} className="flex-1 rounded-t-sm"
                    style={{ background: ['#6366f1', '#22c55e', '#a855f7', '#f59e0b'][i] }}
                    initial={{ height: `${h * 0.3}%` }} animate={{ height: `${h}%` }}
                    transition={{ delay: 1.6 + i * 0.2 + j * 0.05, duration: 0.5 }} />
                ))}
              </div>
              {/* Update flash */}
              <motion.div className="absolute inset-0 rounded-lg"
                style={{ background: `${['#6366f1', '#22c55e', '#a855f7', '#f59e0b'][i]}15` }}
                initial={{ opacity: 0 }} animate={{ opacity: [0, 0.6, 0] }}
                transition={{ delay: 1.5 + i * 0.2, duration: 0.6 }} />
            </motion.div>
          ))}
        </div>
        {/* Export row */}
        <motion.div className="flex items-center gap-2 justify-center"
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 3 }}>
          {["CSV", "PDF", "PNG", "Slack"].map((fmt, i) => (
            <motion.span key={fmt} className="text-[10px] font-semibold px-2.5 py-1 rounded-md cursor-pointer"
              style={{ background: surfBg, color: textS, border: `1px solid ${borderCol}` }}
              initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 3.2 + i * 0.1 }}
              whileHover={{ borderColor: '#6366f1', color: '#818cf8' }}>{fmt}</motion.span>
          ))}
        </motion.div>
      </div>
    );
  }

  if (type === "databases") {
    // 18 databases connecting + Turbo Mode
    const dbs = [
      { name: "PostgreSQL", color: "#336791" }, { name: "BigQuery", color: "#4285F4" },
      { name: "Snowflake", color: "#29B5E8" }, { name: "MySQL", color: "#4479A1" },
      { name: "Databricks", color: "#FF3621" }, { name: "ClickHouse", color: "#FFCC00" },
      { name: "DuckDB", color: "#FFC300" }, { name: "Redshift", color: "#8C4FFF" },
      { name: "MSSQL", color: "#CC2927" },
    ];
    return (
      <div className="p-4 space-y-3" style={{ background: cardBg }}>
        <div className="text-[10px] font-semibold mb-1" style={{ color: textM }}>CONNECTED SOURCES</div>
        <div className="grid grid-cols-3 gap-1.5">
          {dbs.map((db, i) => (
            <motion.div key={db.name} className="rounded-lg px-2 py-2 flex items-center gap-1.5"
              style={{ background: surfBg, border: `1px solid ${borderCol}` }}
              initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.2 + i * 0.1, type: "spring", stiffness: 300 }}>
              <motion.div className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                initial={{ background: '#f59e0b' }} animate={{ background: '#22c55e' }}
                transition={{ delay: 0.6 + i * 0.1 }} />
              <span className="text-[10px] font-semibold truncate" style={{ color: textP }}>{db.name}</span>
            </motion.div>
          ))}
        </div>
        {/* BYOK model selector */}
        <motion.div className="rounded-xl p-3" style={{ background: surfBg, border: `1px solid ${borderCol}` }}
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 1.5 }}>
          <div className="text-[9px] font-semibold uppercase tracking-wider mb-2" style={{ color: textM }}>YOUR API KEY — MODEL SELECTION</div>
          <div className="flex gap-1.5">
            {[
              { name: "Haiku", desc: "Fast", active: false },
              { name: "Sonnet", desc: "Balanced", active: true },
              { name: "Opus", desc: "Powerful", active: false },
            ].map((m, i) => (
              <motion.div key={m.name} className="flex-1 rounded-lg px-2 py-1.5 text-center cursor-pointer"
                style={{
                  background: m.active ? '#6366f120' : 'transparent',
                  border: `1px solid ${m.active ? '#6366f1' : borderCol}`,
                }}
                initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 1.8 + i * 0.1 }}>
                <div className="text-[11px] font-bold" style={{ color: m.active ? '#818cf8' : textP }}>{m.name}</div>
                <div className="text-[8px]" style={{ color: textM }}>{m.desc}</div>
              </motion.div>
            ))}
          </div>
        </motion.div>
        {/* Turbo Mode */}
        <motion.div className="rounded-xl p-3 flex items-center gap-3"
          style={{ background: '#22c55e0d', border: '1px solid #22c55e30' }}
          initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 2.4 }}>
          <div className="w-8 h-8 rounded-lg bg-emerald-500/20 flex items-center justify-center flex-shrink-0">
            <svg className="w-5 h-5 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z" /></svg>
          </div>
          <div>
            <div className="text-[11px] font-bold text-emerald-400">Turbo Mode Active</div>
            <div className="text-[9px]" style={{ color: textM }}>DuckDB replica — queries under 100ms</div>
          </div>
          <motion.div className="ml-auto text-lg font-bold text-emerald-400"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 2.8 }}>94ms</motion.div>
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
                ? "bg-indigo-600 text-white shadow-lg shadow-indigo-500/30"
                : "glass-light hover:border-indigo-400/30"
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
              <div className="w-12 h-12 rounded-xl bg-indigo-500/15 flex items-center justify-center mb-5 text-indigo-400">
                {slide.icon}
              </div>
              <h3 className="text-xl sm:text-2xl font-bold mb-3" style={{ color: 'var(--text-primary)' }}>{slide.title}</h3>
              <p className="leading-relaxed mb-4" style={{ color: 'var(--text-secondary)' }}>{slide.desc}</p>
              {slide.highlights && (
                <div className="flex flex-wrap gap-2 mb-5">
                  {slide.highlights.map((h, hi) => (
                    <span key={hi} className="inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1 rounded-full bg-indigo-500/10 text-indigo-300 border border-indigo-500/20">
                      <svg className="w-3 h-3 text-emerald-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" /></svg>
                      {h}
                    </span>
                  ))}
                </div>
              )}
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
                    className={`h-1.5 rounded-full transition-all duration-300 cursor-pointer ${i === active ? "w-8 bg-indigo-500" : "w-4 hover:bg-gray-600"
                      }`}
                    style={i !== active ? { background: 'var(--overlay-medium)' } : undefined}
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
    <div className="min-h-screen overflow-x-hidden relative noise-overlay" style={{ background: 'var(--bg-page)', color: 'var(--text-primary)' }}>
      <LoadingScreen visible={!heroLoaded} />
      <ScrollProgress />
      <CursorGlow />
      {/* ── Navbar (Glassmorphism) ── */}
      <nav className={`sticky top-0 z-50 transition-all duration-500 ${scrolled ? "glass-navbar shadow-lg" : "bg-transparent border-b border-transparent"}`}>
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
          <span className="text-xl font-extrabold tracking-tight font-poppins">Ask<span style={{ color: '#A855F7' }}>DB</span></span>
          <div className="hidden md:flex items-center gap-8">
            <button onClick={() => scrollTo("features")} className="text-sm transition-colors duration-200 cursor-pointer" style={{ color: 'var(--text-secondary)' }}>Features</button>
            <button onClick={() => scrollTo("how")} className="text-sm transition-colors duration-200 cursor-pointer" style={{ color: 'var(--text-secondary)' }}>How It Works</button>
            <button onClick={() => scrollTo("pricing")} className="text-sm transition-colors duration-200 cursor-pointer" style={{ color: 'var(--text-secondary)' }}>Pricing</button>
          </div>
          <div className="flex items-center gap-3">
            <ThemeToggle />
            {token ? (
              <MotionButton onClick={() => navigate("/dashboard")} className="px-5 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-semibold rounded-full transition-all duration-300 shadow-lg shadow-indigo-500/25 cursor-pointer btn-glow">Go to Dashboard</MotionButton>
            ) : (
              <>
                <button onClick={() => navigate("/login")} className="text-sm transition-colors duration-200 cursor-pointer" style={{ color: 'var(--text-secondary)' }}>Sign In</button>
                <MotionButton onClick={() => navigate("/login")} className="px-5 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-semibold rounded-full transition-all duration-300 shadow-lg shadow-indigo-500/25 cursor-pointer btn-glow">Get Started</MotionButton>
              </>
            )}
          </div>
        </div>
      </nav>

      {/* ── Hero (Split Layout: Text Left + Visual Right) ── */}
      <section className="relative min-h-[92vh] flex items-center px-6 overflow-hidden">
        {/* 3D background */}
        <WebGLErrorBoundary fallback={<AnimatedBackground />}>
          <Suspense fallback={<AnimatedBackground />}>
            <Background3D onCreated={() => setHeroLoaded(true)} />
          </Suspense>
        </WebGLErrorBoundary>
        <div className="absolute inset-0 mesh-gradient pointer-events-none" />

        <div className="relative z-10 max-w-7xl mx-auto w-full grid grid-cols-1 lg:grid-cols-2 gap-12 lg:gap-16 items-center">
          {/* ── Left: Text ── */}
          <div>
            <motion.div
              className="inline-flex items-center gap-2 glass rounded-full px-4 py-1.5 text-xs font-semibold text-indigo-400 mb-6 shadow-lg shadow-indigo-500/10"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ type: "spring", stiffness: 120, damping: 14, delay: 0.1 }}
            >
              <svg className="w-3.5 h-3.5 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" /></svg>
              BYOK &mdash; You control the AI
            </motion.div>

            <motion.h1
              className="text-4xl sm:text-5xl lg:text-6xl font-extrabold tracking-tight leading-[1.08] mb-5"
              initial={{ opacity: 0, y: 40 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ type: "spring", stiffness: 80, damping: 16, delay: 0.2 }}
            >
              Ask your data.{" "}
              <span className="bg-gradient-to-r from-indigo-400 via-violet-400 to-pink-400 bg-clip-text text-transparent text-shimmer">
                Get dashboards.
              </span>
            </motion.h1>

            <motion.p
              className="text-base sm:text-lg max-w-lg mb-8 leading-relaxed"
              style={{ color: 'var(--text-secondary)' }}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.4 }}
            >
              Connect 18+ databases. Ask in plain English. An autonomous AI agent writes SQL, picks charts, and builds dashboards &mdash; end to end.
            </motion.p>

            <motion.div
              className="flex items-center gap-3 flex-wrap mb-8"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.55 }}
            >
              <MotionButton onClick={() => navigate("/login")} className="px-7 py-3 bg-gradient-to-r from-indigo-500 to-violet-500 text-white font-bold rounded-full shadow-xl shadow-indigo-500/30 hover:shadow-2xl hover:shadow-indigo-500/40 transition-all duration-300 cursor-pointer btn-glow text-sm">Start free</MotionButton>
              <MotionButton onClick={() => scrollTo("demo")} className="px-7 py-3 glass font-bold rounded-full hover:border-indigo-500/40 transition-all duration-300 cursor-pointer text-sm" style={{ color: 'var(--text-primary)' }}>See it work</MotionButton>
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

          {/* ── Right: Glossy data pipeline visual ── */}
          <motion.div
            className="relative hidden lg:block"
            initial={{ opacity: 0, x: 60, scale: 0.95 }}
            animate={{ opacity: 1, x: 0, scale: 1 }}
            transition={{ type: "spring", stiffness: 60, damping: 18, delay: 0.4 }}
          >
            {/* Glossy dashboard mockup */}
            <div className="glass-card-elevated rounded-2xl p-1 shadow-2xl" style={{ transform: 'perspective(1200px) rotateY(-6deg) rotateX(2deg)' }}>
              <div className="rounded-xl overflow-hidden" style={{ background: 'var(--bg-elevated)' }}>
                {/* Fake browser chrome */}
                <div className="flex items-center gap-1.5 px-3 py-2" style={{ background: 'var(--bg-surface)', borderBottom: '1px solid var(--border-default)' }}>
                  <span className="w-2.5 h-2.5 rounded-full bg-red-400/60" />
                  <span className="w-2.5 h-2.5 rounded-full bg-yellow-400/60" />
                  <span className="w-2.5 h-2.5 rounded-full bg-green-400/60" />
                  <span className="flex-1 text-center text-[10px] font-medium" style={{ color: 'var(--text-muted)' }}>askdb.dev/analytics</span>
                </div>
                {/* Dashboard content mockup */}
                <div className="p-4 space-y-3">
                  {/* KPI row */}
                  <div className="grid grid-cols-3 gap-2">
                    {[
                      { label: "Total Revenue", value: "$2.4M", change: "+12.3%", color: "#2563EB" },
                      { label: "Active Users", value: "18.7K", change: "+8.1%", color: "#22C55E" },
                      { label: "Avg Response", value: "94ms", change: "-23%", color: "#A855F7" },
                    ].map((kpi) => (
                      <div key={kpi.label} className="rounded-lg p-2.5" style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-default)' }}>
                        <div className="text-[9px] font-semibold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>{kpi.label}</div>
                        <div className="text-lg font-bold mt-0.5" style={{ color: 'var(--text-primary)' }}>{kpi.value}</div>
                        <div className="text-[10px] font-semibold" style={{ color: kpi.color }}>{kpi.change}</div>
                      </div>
                    ))}
                  </div>
                  {/* Chart mockup */}
                  <div className="rounded-lg p-3" style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-default)' }}>
                    <div className="text-[10px] font-semibold mb-2" style={{ color: 'var(--text-muted)' }}>Revenue by Quarter</div>
                    <div className="flex items-end gap-1.5 h-20">
                      {[40, 55, 45, 70, 60, 85, 75, 92].map((h, i) => (
                        <motion.div
                          key={i}
                          className="flex-1 rounded-t-sm"
                          style={{ background: i >= 6 ? '#6366f1' : i >= 4 ? '#818cf8' : '#a5b4fc', height: `${h}%` }}
                          initial={{ height: 0 }}
                          animate={{ height: `${h}%` }}
                          transition={{ delay: 0.8 + i * 0.08, duration: 0.5, ease: "easeOut" }}
                        />
                      ))}
                    </div>
                  </div>
                  {/* Table mockup */}
                  <div className="rounded-lg overflow-hidden" style={{ border: '1px solid var(--border-default)' }}>
                    <div className="grid grid-cols-4 text-[9px] font-semibold uppercase tracking-wider py-1.5 px-2.5" style={{ color: 'var(--text-muted)', background: 'var(--bg-surface)', borderBottom: '1px solid var(--border-default)' }}>
                      <span>Region</span><span>Revenue</span><span>Growth</span><span>Status</span>
                    </div>
                    {[
                      ["North America", "$1.2M", "+15%", "bg-green-400"],
                      ["Europe", "$680K", "+9%", "bg-blue-400"],
                      ["APAC", "$520K", "+22%", "bg-violet-400"],
                    ].map(([region, rev, growth, dot]) => (
                      <div key={region} className="grid grid-cols-4 text-[10px] py-1.5 px-2.5 items-center" style={{ borderBottom: '1px solid var(--border-default)' }}>
                        <span style={{ color: 'var(--text-primary)' }}>{region}</span>
                        <span style={{ color: 'var(--text-secondary)' }}>{rev}</span>
                        <span className="text-emerald-400 font-semibold">{growth}</span>
                        <span className={`w-2 h-2 rounded-full ${dot}`} />
                      </div>
                    ))}
                  </div>
                </div>
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
                <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-indigo-500 to-violet-500 flex items-center justify-center">
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
        <VisibleSectionBg><Suspense fallback={null}><SectionBackground3D mode="features" /></Suspense></VisibleSectionBg>
        <RevealSection className="max-w-7xl mx-auto px-6" parallaxSpeed={0.15}>
          <motion.div className="text-center mb-16" variants={staggerItem}>
            <p className="text-sm font-bold text-indigo-400 uppercase tracking-widest mb-3">Features</p>
            <ScrollReveal textClassName="text-3xl sm:text-5xl font-extrabold tracking-tight mb-4 font-heading">Everything you need. Nothing you don't.</ScrollReveal>
            <p className="max-w-lg mx-auto" style={{ color: 'var(--text-secondary)' }}>One platform. Your API key. 18 databases. Full dashboards in minutes.</p>
          </motion.div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {FEATURES.map((f, i) => {
              const isWide = false;
              return (
                <motion.div
                  key={i}
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
                          <h3 className="text-lg font-bold mb-2" style={{ color: 'var(--text-primary)' }}>{f.title}</h3>
                          <p className="text-sm leading-relaxed" style={{ color: 'var(--text-secondary)' }}>{f.desc}</p>
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
            <ScrollReveal textClassName="text-3xl sm:text-5xl font-extrabold tracking-tight font-heading">From API key to production dashboard in 3 steps</ScrollReveal>
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
        <VisibleSectionBg><Suspense fallback={null}><SectionBackground3D mode="demo" /></Suspense></VisibleSectionBg>
        <RevealSection className="max-w-7xl mx-auto px-6">
          <motion.div className="text-center mb-10" variants={staggerItem}>
            <p className="text-sm font-bold text-indigo-400 uppercase tracking-widest mb-3">Live Demo</p>
            <ScrollReveal textClassName="text-3xl sm:text-5xl font-extrabold tracking-tight mb-4 font-heading">See the full platform in action</ScrollReveal>
            <p style={{ color: 'var(--text-secondary)' }}>Click a tab to explore autonomous agents, dashboards, exports, and 18-database connectivity.</p>
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
                      <AnimatedCounter
                        value={s.value}
                        suffix={s.suffix}
                        duration={2}
                        className="text-3xl sm:text-4xl md:text-[2.75rem] font-extrabold bg-gradient-to-r from-indigo-400 to-violet-400 bg-clip-text text-transparent leading-none tracking-tight"
                      />
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
        <VisibleSectionBg><Suspense fallback={null}><SectionBackground3D mode="testimonials" /></Suspense></VisibleSectionBg>
        <RevealSection className="max-w-7xl mx-auto px-6" parallaxSpeed={0.1}>
          <motion.div className="text-center mb-16" variants={staggerItem}>
            <p className="text-sm font-bold text-indigo-400 uppercase tracking-widest mb-3">Testimonials</p>
            <ScrollReveal textClassName="text-3xl sm:text-5xl font-extrabold tracking-tight font-heading">Built for data teams who ship, not wait</ScrollReveal>
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
                    <p className="italic leading-relaxed mb-6" style={{ color: 'var(--text-secondary)' }}>&ldquo;{t.quote}&rdquo;</p>
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-gradient-to-br from-indigo-500 to-violet-500 flex items-center justify-center text-white text-sm font-bold flex-shrink-0 shadow-lg shadow-indigo-500/20">{t.avatar}</div>
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
        <VisibleSectionBg><Suspense fallback={null}><SectionBackground3D mode="pricing" /></Suspense></VisibleSectionBg>
        <RevealSection className="max-w-7xl mx-auto px-6 relative z-10" parallaxSpeed={0.08}>
          <motion.div className="text-center mb-16" variants={staggerItem}>
            <p className="text-sm font-bold text-indigo-400 uppercase tracking-widest mb-3">Pricing</p>
            <ScrollReveal textClassName="text-3xl sm:text-5xl font-extrabold tracking-tight mb-4 font-heading">Your key, your models, our platform</ScrollReveal>
            <p className="max-w-md mx-auto" style={{ color: 'var(--text-secondary)' }}>Bring your own Anthropic API key. Pay us for the platform. Pay Anthropic for the AI. No hidden markup.</p>
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
                      <h3 className="text-lg font-bold mb-1" style={{ color: 'var(--text-primary)' }}>{plan.name}</h3>
                      <div className="mb-1"><span className="text-5xl font-extrabold" style={{ color: 'var(--text-primary)' }}>{plan.price}</span></div>
                      <p className="text-sm mb-6" style={{ color: 'var(--text-muted)' }}>{plan.period}</p>
                      <ul className="space-y-3 mb-8">
                        {plan.features.map((f) => (
                          <li key={f} className="flex items-start gap-2 text-sm" style={{ color: 'var(--text-secondary)' }}><span className="text-green-400 mt-0.5 flex-shrink-0">&#10003;</span>{f}</li>
                        ))}
                      </ul>
                      {plan.link ? (
                        <a href={plan.link} target="_blank" rel="noopener noreferrer" className={`block text-center py-3 rounded-full font-bold text-sm transition-all duration-300 cursor-pointer ${plan.featured ? "bg-gradient-to-r from-indigo-500 to-violet-500 text-white shadow-lg shadow-indigo-500/30 hover:-translate-y-0.5 btn-glow shine-sweep" : "glass hover:border-indigo-500/40 hover:-translate-y-0.5"}`}>{plan.cta}</a>
                      ) : (
                        <button onClick={() => navigate("/login")} className={`block w-full text-center py-3 rounded-full font-bold text-sm transition-all duration-300 cursor-pointer ${plan.featured ? "bg-gradient-to-r from-indigo-500 to-violet-500 text-white shadow-lg shadow-indigo-500/30 hover:-translate-y-0.5 btn-glow shine-sweep" : "glass hover:border-indigo-500/40 hover:-translate-y-0.5"}`}>{plan.cta}</button>
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
        <VisibleSectionBg><Suspense fallback={null}><SectionBackground3D mode="cta" /></Suspense></VisibleSectionBg>
        <RevealSection className="max-w-4xl mx-auto px-6 text-center">
          <motion.div variants={fadeScale}>
            <TiltCard maxTilt={4}>
              <div className="glass-card rounded-3xl p-12 sm:p-16 relative overflow-hidden">
                <div className="absolute top-[-50px] right-[-50px] w-[200px] h-[200px] rounded-full bg-indigo-500/20 blur-[60px] pointer-events-none" />
                <div className="absolute bottom-[-50px] left-[-50px] w-[200px] h-[200px] rounded-full bg-violet-500/15 blur-[60px] pointer-events-none" />
                <div className="relative z-10">
                  <ScrollReveal textClassName="text-3xl sm:text-5xl font-extrabold tracking-tight mb-6 font-heading">Your databases are waiting. Your AI agent is ready.</ScrollReveal>
              <p className="max-w-xl mx-auto mb-10" style={{ color: 'var(--text-secondary)' }}>Bring your Anthropic API key. Connect any database in under 60 seconds. Enterprise-grade security from day one. No credit card needed.</p>
              <div className="flex items-center justify-center gap-4 flex-wrap">
                <MotionButton onClick={() => navigate("/login")} className="px-8 py-3.5 bg-gradient-to-r from-indigo-500 to-violet-500 text-white font-bold rounded-full shadow-xl shadow-indigo-500/30 hover:shadow-2xl transition-all duration-300 cursor-pointer btn-glow">Start free with your API key</MotionButton>
                <MotionButton onClick={() => scrollTo("pricing")} className="px-8 py-3.5 glass font-bold rounded-full hover:border-indigo-500/40 transition-all duration-300 cursor-pointer" style={{ color: 'var(--text-primary)' }}>Compare plans</MotionButton>
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
              <span className="text-xl font-extrabold font-poppins" style={{ color: 'var(--text-primary)' }}>Ask<span style={{ color: '#A855F7' }}>DB</span></span>
              <p className="text-sm mt-3 max-w-xs leading-relaxed" style={{ color: 'var(--text-muted)' }}>The BYOK analytics platform &mdash; your API key, your models, every database, zero-trust security.</p>
            </div>
            <div>
              <h4 className="text-sm font-semibold mb-4" style={{ color: 'var(--text-secondary)' }}>Product</h4>
              <ul className="space-y-2 text-sm" style={{ color: 'var(--text-muted)' }}>
                <li><button onClick={() => scrollTo("features")} className="hover:text-gray-300 transition cursor-pointer">Features</button></li>
                <li><button onClick={() => scrollTo("pricing")} className="hover:text-gray-300 transition cursor-pointer">Pricing</button></li>
                <li><button onClick={() => scrollTo("how")} className="hover:text-gray-300 transition cursor-pointer">How It Works</button></li>
                <li><button onClick={() => scrollTo("demo")} className="hover:text-gray-300 transition cursor-pointer">Live Demo</button></li>
              </ul>
            </div>
            <div>
              <h4 className="text-sm font-semibold mb-4" style={{ color: 'var(--text-secondary)' }}>Resources</h4>
              <ul className="space-y-2 text-sm" style={{ color: 'var(--text-muted)' }}>
                <li><span>Documentation <span className="text-[10px] text-indigo-400/60 ml-1">Soon</span></span></li>
                <li><span>Changelog <span className="text-[10px] text-indigo-400/60 ml-1">Soon</span></span></li>
                <li><span>API Reference <span className="text-[10px] text-indigo-400/60 ml-1">Soon</span></span></li>
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
            <div className="flex gap-6 text-xs" style={{ color: 'var(--text-muted)' }}><span>Privacy</span><span>Terms</span></div>
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
