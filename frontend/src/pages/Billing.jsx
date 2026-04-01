import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { api } from "../api";
import UserDropdown from "../components/UserDropdown";
import { StaggerContainer, StaggerItem } from "../components/animation/StaggerContainer";
import MotionButton from "../components/animation/MotionButton";

export default function Billing() {
  const navigate = useNavigate();
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
        "Unlimited queries",
        "All database connectors",
        "CSV, Excel & PDF export",
        "Auto-charts + Plotly",
        "Slack bot integration",
        "PII masking",
      ],
    },
    {
      name: "Enterprise",
      price: "Custom",
      period: "",
      features: [
        "Everything in Pro",
        "SSO & SAML",
        "Dedicated support (4h SLA)",
        "Custom connectors",
        "On-premise deployment",
        "Unlimited team seats",
      ],
    },
  ];

  return (
    <div className="flex-1 overflow-y-auto bg-[#06060e] relative">
      <div className="fixed inset-0 mesh-gradient opacity-30 pointer-events-none" />
      <header className="glass-navbar sticky top-0 z-20 flex items-center justify-between px-6 py-3">
        <div>
          <h1 className="text-xl font-bold text-white">Plans & Billing</h1>
          <p className="text-xs text-gray-400">Choose the plan that fits your team</p>
        </div>
        <UserDropdown />
      </header>

      <div className="max-w-4xl mx-auto px-4 py-8 relative z-10">
        {loading ? (
          <div className="flex items-center gap-3 text-gray-500 text-sm">
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
            {/* Current plan */}
            <StaggerItem>
              <div className="glass-card rounded-2xl p-6">
                <div className="flex items-center gap-3 mb-4">
                  <h2 className="text-lg font-bold text-white">Current Plan</h2>
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
                      <span className="text-gray-400">Today&apos;s Usage</span>
                      <span className="text-gray-300 font-medium">{billing.queries_today ?? 0} / {billing.daily_limit} queries</span>
                    </div>
                    <div className="w-full h-2 rounded-full bg-gray-800 overflow-hidden">
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
                        className="flex items-center gap-2 text-sm text-gray-300"
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
            </StaggerItem>

            {/* Future plans */}
            <StaggerItem>
              <div>
                <h2 className="text-lg font-bold text-white mb-4">Upgrade Options</h2>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {futurePlans.map((plan, idx) => (
                    <motion.div
                      key={plan.name}
                      initial={{ opacity: 0, y: 30, scale: 0.95 }}
                      animate={{ opacity: 0.6, y: 0, scale: 1 }}
                      transition={{ delay: 0.2 + idx * 0.15, type: "spring", stiffness: 200, damping: 20 }}
                      whileHover={{ opacity: 0.85, y: -4, transition: { duration: 0.2 } }}
                      className="relative glass-card rounded-2xl p-6"
                    >
                      {/* Coming soon badge */}
                      <div className="absolute top-4 right-4 px-3 py-1 glass text-gray-400 text-xs font-semibold rounded-full">
                        Coming Soon
                      </div>

                      <h3 className="text-xl font-bold text-white mb-1">{plan.name}</h3>
                      <div className="mb-4">
                        <span className="text-3xl font-extrabold text-white">{plan.price}</span>
                        {plan.period && <span className="text-sm text-gray-500">{plan.period}</span>}
                      </div>

                      <ul className="space-y-2 mb-6">
                        {plan.features.map((f, i) => (
                          <li key={i} className="flex items-center gap-2 text-sm text-gray-400">
                            <svg className="w-4 h-4 text-gray-600 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                            </svg>
                            {f}
                          </li>
                        ))}
                      </ul>

                      <MotionButton
                        onClick={() => setWaitlistJoined((p) => ({ ...p, [plan.name]: true }))}
                        disabled={waitlistJoined[plan.name]}
                        className={`w-full py-2.5 text-sm font-semibold rounded-full transition cursor-pointer ${
                          waitlistJoined[plan.name]
                            ? "glass text-green-400 border-green-700/50"
                            : "glass text-indigo-400 hover:bg-white/5 hover:text-indigo-300"
                        }`}
                        aria-disabled={waitlistJoined[plan.name]}
                      >
                        {waitlistJoined[plan.name] ? "On Waitlist" : "Join Waitlist"}
                      </MotionButton>
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
