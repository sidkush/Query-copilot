import { useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { useStore } from "../store";

/* Accessible tooltip that works with keyboard focus + hover */
function Tooltip({ text, children }) {
  const [show, setShow] = useState(false);
  const id = `tooltip-${text.toLowerCase().replace(/\s/g, "-")}`;
  return (
    <div className="relative" onMouseEnter={() => setShow(true)} onMouseLeave={() => setShow(false)} onFocus={() => setShow(true)} onBlur={() => setShow(false)}>
      {typeof children === "function" ? children({ "aria-describedby": show ? id : undefined }) : children}
      <AnimatePresence>
        {show && (
          <motion.div
            id={id}
            role="tooltip"
            initial={{ opacity: 0, x: -4 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -4 }}
            transition={{ duration: 0.15 }}
            className="absolute left-full ml-2 top-1/2 -translate-y-1/2 px-2.5 py-1 bg-gray-900 border border-white/10 text-white text-xs rounded-lg whitespace-nowrap z-50 pointer-events-none shadow-lg"
          >
            {text}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

const NAV_ITEMS = [
  {
    id: "chat",
    path: "/chat",
    label: "Chat",
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
      </svg>
    ),
  },
  {
    id: "db",
    path: "/dashboard",
    label: "Database",
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M20.25 6.375c0 2.278-3.694 4.125-8.25 4.125S3.75 8.653 3.75 6.375m16.5 0c0-2.278-3.694-4.125-8.25-4.125S3.75 4.097 3.75 6.375m16.5 0v11.25c0 2.278-3.694 4.125-8.25 4.125s-8.25-1.847-8.25-4.125V6.375m16.5 0v3.75m-16.5-3.75v3.75m16.5 0v3.75C20.25 16.153 16.556 18 12 18s-8.25-1.847-8.25-4.125v-3.75m16.5 0c0 2.278-3.694 4.125-8.25 4.125s-8.25-1.847-8.25-4.125" />
      </svg>
    ),
  },
  {
    id: "analytics",
    path: "/analytics",
    label: "Analytics",
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6A2.25 2.25 0 016 3.75h2.25A2.25 2.25 0 0110.5 6v2.25a2.25 2.25 0 01-2.25 2.25H6a2.25 2.25 0 01-2.25-2.25V6zM3.75 15.75A2.25 2.25 0 016 13.5h2.25a2.25 2.25 0 012.25 2.25V18a2.25 2.25 0 01-2.25 2.25H6A2.25 2.25 0 013.75 18v-2.25zM13.5 6a2.25 2.25 0 012.25-2.25H18A2.25 2.25 0 0120.25 6v2.25A2.25 2.25 0 0118 10.5h-2.25a2.25 2.25 0 01-2.25-2.25V6zM13.5 15.75a2.25 2.25 0 012.25-2.25H18a2.25 2.25 0 012.25 2.25V18A2.25 2.25 0 0118 20.25h-2.25a2.25 2.25 0 01-2.25-2.25v-2.25z" />
      </svg>
    ),
  },
  {
    id: "schema",
    path: "/schema",
    label: "Schema",
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6A2.25 2.25 0 016 3.75h2.25A2.25 2.25 0 0110.5 6v2.25a2.25 2.25 0 01-2.25 2.25H6a2.25 2.25 0 01-2.25-2.25V6zM3.75 15.75A2.25 2.25 0 016 13.5h2.25a2.25 2.25 0 012.25 2.25V18a2.25 2.25 0 01-2.25 2.25H6A2.25 2.25 0 013.75 18v-2.25zM13.5 6a2.25 2.25 0 012.25-2.25H18A2.25 2.25 0 0120.25 6v2.25A2.25 2.25 0 0118 10.5h-2.25a2.25 2.25 0 01-2.25-2.25V6z" />
      </svg>
    ),
  },
  {
    id: "billing",
    path: "/billing",
    label: "Billing",
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 8.25h19.5M2.25 9h19.5m-16.5 5.25h6m-6 2.25h3m-3.75 3h15a2.25 2.25 0 002.25-2.25V6.75A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25v10.5A2.25 2.25 0 004.5 19.5z" />
      </svg>
    ),
  },
];

export default function AppSidebar() {
  const navigate = useNavigate();
  const location = useLocation();
  const user = useStore((s) => s.user);

  const activePath = location.pathname;
  const initials = user?.name
    ? user.name.split(" ").map((w) => w[0]).join("").toUpperCase().slice(0, 2)
    : "U";

  return (
    <div className="w-14 bg-[#06060e] border-r border-white/5 flex-shrink-0 flex flex-col items-center py-3 gap-1 relative">
      {/* Subtle gradient glow at top */}
      <div className="absolute top-0 left-0 right-0 h-24 bg-gradient-to-b from-indigo-500/5 to-transparent pointer-events-none" />

      {/* Logo */}
      <Tooltip text="QueryCopilot Home">
        {(tooltipProps) => (
          <motion.button
            onClick={() => navigate("/chat")}
            whileHover={{ scale: 1.1 }}
            whileTap={{ scale: 0.95 }}
            animate={{
              boxShadow: [
                "0 0 0 0px rgba(99,102,241,0.4)",
                "0 0 0 7px rgba(99,102,241,0)",
                "0 0 0 0px rgba(99,102,241,0)",
              ],
            }}
            transition={{
              boxShadow: { duration: 2.4, repeat: Infinity, ease: "easeOut" },
              scale: { type: "spring", stiffness: 400, damping: 17 },
            }}
            className="w-9 h-9 rounded-xl bg-gradient-to-br from-indigo-600 to-violet-600 flex items-center justify-center mb-4 hover:from-indigo-500 hover:to-violet-500 transition-colors duration-300 cursor-pointer shadow-lg shadow-indigo-500/20 relative z-10"
            aria-label="QueryCopilot Home"
            {...tooltipProps}
          >
            <span className="text-white font-bold text-sm" aria-hidden="true">Q</span>
          </motion.button>
        )}
      </Tooltip>

      {/* Nav items */}
      <nav aria-label="Main navigation" className="flex flex-col items-center gap-1">
        {NAV_ITEMS.map((item) => {
          const isActive = activePath === item.path || (item.path === "/chat" && activePath.startsWith("/chat"));
          return (
            <Tooltip key={item.id} text={item.label}>
              {(tooltipProps) => (
                <motion.button
                  onClick={() => navigate(item.path)}
                  whileHover={{ scale: 1.08 }}
                  whileTap={{ scale: 0.95 }}
                  transition={{ type: "spring", stiffness: 400, damping: 17 }}
                  className={`w-10 h-10 rounded-xl flex items-center justify-center transition-colors duration-200 cursor-pointer relative z-10 ${
                    isActive
                      ? "text-white"
                      : "text-gray-500 hover:text-white hover:bg-white/5"
                  }`}
                  aria-label={item.label}
                  aria-current={isActive ? "page" : undefined}
                  {...tooltipProps}
                >
                  <span aria-hidden="true">{item.icon}</span>
                  {isActive && (
                    <motion.div
                      layoutId="sidebar-indicator"
                      className="absolute inset-0 rounded-xl bg-white/[0.08] border border-white/[0.06]"
                      transition={{ type: "spring", stiffness: 350, damping: 30 }}
                    />
                  )}
                  {isActive && (
                    <motion.div
                      layoutId="sidebar-bar"
                      className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-5 bg-indigo-500 rounded-r-full"
                      transition={{ type: "spring", stiffness: 350, damping: 30 }}
                      aria-hidden="true"
                    />
                  )}
                </motion.button>
              )}
            </Tooltip>
          );
        })}
      </nav>

      {/* Spacer */}
      <div className="flex-1" />

      {/* User avatar */}
      <Tooltip text={`Profile: ${user?.name || "User"}`}>
        {(tooltipProps) => (
          <motion.button
            onClick={() => navigate("/profile")}
            whileHover={{ scale: 1.1 }}
            whileTap={{ scale: 0.95 }}
            transition={{ type: "spring", stiffness: 400, damping: 17 }}
            className="w-9 h-9 rounded-full bg-gradient-to-br from-indigo-500/60 to-violet-500/60 flex items-center justify-center text-white text-xs font-bold hover:from-indigo-500 hover:to-violet-500 transition-colors duration-300 cursor-pointer shadow-lg shadow-indigo-500/10 relative z-10"
            aria-label={`Profile: ${user?.name || "User"}`}
            {...tooltipProps}
          >
            {initials}
          </motion.button>
        )}
      </Tooltip>
    </div>
  );
}
