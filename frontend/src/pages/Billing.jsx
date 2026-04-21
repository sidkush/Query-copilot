import { useState, useEffect, Suspense, Component, lazy } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { api } from "../api";
import UserDropdown from "../components/UserDropdown";
import { StaggerContainer, StaggerItem } from "../components/animation/StaggerContainer";

import AnimatedBackground from "../components/animation/AnimatedBackground";
import { GPUTierProvider } from "../lib/gpuDetect.jsx";
const PageBackground3D = lazy(() => import("../components/animation/PageBackground3D"));
class _WebGLBound extends Component { constructor(p){super(p);this.state={e:false};} static getDerivedStateFromError(){return{e:true};} render(){return this.state.e?this.props.fallback:this.props.children;} }

export default function Billing() {
  const [billing, setBilling] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [waitlistJoined, setWaitlistJoined] = useState({});

  useEffect(() => {
    api.getBilling()
      .then((data) => setBilling(data))
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  const futurePlans = [
    {
      name: "Pro",
      price: "$29",
      period: "/month",
      features: [
        "Unlimited AI agent queries",
        "All 18 database connectors",
        "Unlimited dashboards + global filters",
        "DuckDB Turbo Mode (<100ms)",
        "NL alerts + Slack/Teams webhooks",
        "CSV, JSON, PDF, PNG export",
        "Scheduled email digests",
        "Priority support",
      ],
    },
    {
      name: "Team",
      price: "$79",
      period: "/seat/month",
      features: [
        "Everything in Pro",
        "Unlimited team seats",
        "SSO / SAML authentication",
        "Shared dashboards & query memory",
        "16:9 presentation engine",
        "White-label dashboards",
        "Dedicated account manager",
      ],
    },
  ];

  return (
    <div className="flex-1 overflow-y-auto relative" style={{ background: 'var(--bg-page)' }}>
      <div className="fixed inset-0 mesh-gradient opacity-30 pointer-events-none" />
      <GPUTierProvider>
        <_WebGLBound fallback={<AnimatedBackground className="fixed inset-0 pointer-events-none" />}>
          <Suspense fallback={<AnimatedBackground className="fixed inset-0 pointer-events-none" />}>
            <PageBackground3D mode="default" className="fixed inset-0" />
          </Suspense>
        </_WebGLBound>
      </GPUTierProvider>
      <header className="glass-navbar sticky top-0 z-20 flex items-center justify-between px-6 py-3">
        <div className="page-hero" style={{ gap: 2 }}>
          <span className="page-hero__eyebrow">
            <span className="eyebrow-dot" aria-hidden="true" />
            Account · Plans
          </span>
          <h1 style={{
            fontSize: 20,
            fontWeight: 800,
            color: 'var(--text-primary)',
            fontFamily: "'Outfit', system-ui, sans-serif",
            letterSpacing: '-0.022em',
            lineHeight: 1.1,
            margin: 0,
          }}>Plans &amp; billing</h1>
        </div>
        <UserDropdown />
      </header>

      <div className="max-w-4xl mx-auto px-4 py-16 relative z-10">
        {loading ? (
          <div className="flex items-center gap-3 text-sm" style={{ color: 'var(--text-muted)' }}>
            <div className="w-5 h-5 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
            Loading billing...
          </div>
        ) : error ? (
          <motion.div
            initial={{ opacity: 0, x: [0] }}
            animate={{ opacity: 1, x: [0, -8, 8, -4, 4, 0] }}
            transition={{ duration: 0.4 }}
            role="alert"
            className="bg-red-900/20 border border-red-800/50 text-red-400 rounded-lg p-3 text-sm backdrop-blur-sm"
          >
            {error}
          </motion.div>
        ) : (
          <StaggerContainer className="space-y-8">
            {/* Current plan — Double-Bezel hero card */}
            <StaggerItem>
              <div className="bezel-shell">
                <div className="bezel-core glass-card p-8" style={{ borderRadius: 'calc(2rem - 6px)' }}>
                <div className="flex items-center gap-3 mb-4">
                  <h2 className="text-lg font-bold" style={{ color: 'var(--text-primary)' }}>Current plan</h2>
                  <motion.span
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    transition={{ type: "spring", stiffness: 400, damping: 15, delay: 0.3 }}
                    className="px-3 py-0.5 bg-green-900/40 text-green-400 text-xs font-semibold rounded-full border border-green-700/50"
                  >
                    {billing?.plan ? billing.plan.charAt(0).toUpperCase() + billing.plan.slice(1) : "Free"}
                  </motion.span>
                </div>
                {/* Usage bar */}
                {billing?.daily_limit != null && (
                  <div className="mb-4">
                    <div className="flex items-center justify-between text-sm mb-1.5">
                      <span style={{ color: 'var(--text-secondary)' }}>Today&apos;s usage</span>
                      <span className="font-medium" style={{ color: 'var(--text-primary)' }}>{billing.queries_today ?? 0} / {billing.daily_limit} queries</span>
                    </div>
                    <div className="w-full h-2 rounded-full overflow-hidden" style={{ background: 'var(--overlay-medium)' }}>
                      <motion.div
                        initial={{ width: 0 }}
                        animate={{ width: `${Math.min(100, ((billing.queries_today ?? 0) / billing.daily_limit) * 100)}%` }}
                        transition={{ duration: 1, ease: "easeOut", delay: 0.4 }}
                        className={`h-full rounded-full ${
                          (billing.queries_today ?? 0) / billing.daily_limit > 0.8 ? "bg-red-500" :
                          (billing.queries_today ?? 0) / billing.daily_limit > 0.5 ? "bg-amber-500" : "bg-indigo-500"
                        }`}
                      />
                    </div>
                  </div>
                )}
                {billing?.features && billing.features.length > 0 && (
                  <ul className="space-y-2">
                    {billing.features.map((f, i) => (
                      <motion.li
                        key={i}
                        initial={{ opacity: 0, x: -12 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: 0.3 + i * 0.05 }}
                        className="flex items-center gap-2 text-sm"
                        style={{ color: 'var(--text-secondary)' }}
                      >
                        <svg className="w-4 h-4 text-green-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                        </svg>
                        {f}
                      </motion.li>
                    ))}
                  </ul>
                )}
                </div>
              </div>
            </StaggerItem>

            {/* Future plans */}
            <StaggerItem>
              <div>
                <h2 className="text-lg font-bold mb-4" style={{ color: 'var(--text-primary)' }}>Upgrade options</h2>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {futurePlans.map((plan, idx) => (
                    <motion.div
                      key={plan.name}
                      initial={{ opacity: 0, y: 30, scale: 0.95 }}
                      animate={{ opacity: 0.6, y: 0, scale: 1 }}
                      transition={{ delay: 0.2 + idx * 0.15, type: "spring", stiffness: 200, damping: 20 }}
                    >
                      <div className="relative glass-card rounded-2xl p-6 h-full">
                      {/* Coming soon badge */}
                      <div className="absolute top-4 right-4 px-3 py-1 glass text-xs font-semibold rounded-full" style={{ color: 'var(--text-secondary)' }}>
                        Coming Soon
                      </div>

                      <h3 className="text-xl font-bold mb-1" style={{ color: 'var(--text-primary)' }}>{plan.name}</h3>
                      <div className="mb-4">
                        <span className="text-3xl font-extrabold" style={{ color: 'var(--text-primary)' }}>{plan.price}</span>
                        {plan.period && <span className="text-sm" style={{ color: 'var(--text-muted)' }}>{plan.period}</span>}
                      </div>

                      <ul className="space-y-2 mb-6">
                        {plan.features.map((f, i) => (
                          <li key={i} className="flex items-center gap-2 text-sm" style={{ color: 'var(--text-secondary)' }}>
                            <svg className="w-4 h-4 flex-shrink-0" style={{ color: 'var(--text-muted)' }} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                            </svg>
                            {f}
                          </li>
                        ))}
                      </ul>

                      <motion.button
                        onClick={() => setWaitlistJoined((p) => ({ ...p, [plan.name]: true }))}
                        disabled={waitlistJoined[plan.name]}
                        whileTap={{ scale: 0.98 }}
                        transition={{ type: "spring", stiffness: 400, damping: 25 }}
                        className={`group w-full flex items-center justify-between pl-5 pr-2 py-2 text-sm font-semibold rounded-full ease-spring cursor-pointer ${
                          waitlistJoined[plan.name]
                            ? "glass text-green-400 border-green-700/50"
                            : "glass text-blue-400 hover:bg-white/5 hover:text-blue-300"
                        }`}
                        aria-disabled={waitlistJoined[plan.name]}
                      >
                        <span>{waitlistJoined[plan.name] ? "On waitlist" : "Join waitlist"}</span>
                        <span className="flex items-center justify-center w-8 h-8 rounded-full bg-white/10 ease-spring transition-transform duration-300 group-hover:translate-x-1 group-hover:-translate-y-[1px]">
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                            <path d="M5 12h14M13 5l7 7-7 7" />
                          </svg>
                        </span>
                      </motion.button>
                      </div>
                    </motion.div>
                  ))}
                </div>
              </div>
            </StaggerItem>
          </StaggerContainer>
        )}
      </div>
    </div>
  );
}
