import { useState, useCallback, useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";
// eslint-disable-next-line no-unused-vars
import { motion, AnimatePresence } from "framer-motion";
import { useStore } from "../store";

/* Theme icons */
const SunIcon = () => (
  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
  </svg>
);
const MoonIcon = () => (
  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
  </svg>
);
const SystemIcon = () => (
  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
  </svg>
);

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
            className="absolute left-full ml-2 top-1/2 -translate-y-1/2 px-2.5 py-1 text-xs rounded-lg whitespace-nowrap z-50 pointer-events-none shadow-lg"
            style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-default)', color: 'var(--text-primary)' }}
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
    id: "ml-engine",
    path: "/ml-engine",
    label: "ML Engine",
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M9.75 3.104v5.714a2.25 2.25 0 01-.659 1.591L5 14.5M9.75 3.104c-.251.023-.501.05-.75.082m.75-.082a24.301 24.301 0 014.5 0m0 0v5.714a2.25 2.25 0 00.659 1.591L19 14.5M14.25 3.104c.251.023.501.05.75.082M5 14.5l-1.43 1.43a2.25 2.25 0 00-.32 2.817l.122.205a2.25 2.25 0 001.93 1.048h13.396a2.25 2.25 0 001.93-1.048l.122-.205a2.25 2.25 0 00-.32-2.817L19 14.5M5 14.5h14" />
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

/* Hamburger icon for mobile collapsed state */
const HamburgerIcon = () => (
  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" />
  </svg>
);

export default function AppSidebar() {
  const navigate = useNavigate();
  const location = useLocation();
  const user = useStore((s) => s.user);
  const agentPanelOpen = useStore((s) => s.agentPanelOpen);
  const setAgentPanelOpen = useStore((s) => s.setAgentPanelOpen);

  const activePath = location.pathname;
  const initials = user?.name
    ? user.name.split(" ").map((w) => w[0]).join("").toUpperCase().slice(0, 2)
    : "U";

  const theme = useStore((s) => s.theme);
  const setTheme = useStore((s) => s.setTheme);
  const cycleTheme = useCallback(() => {
    const next = { light: "dark", dark: "system", system: "light" };
    setTheme(next[theme] || "light");
  }, [theme, setTheme]);

  // Responsive collapse: on viewports < 768px collapse to icon-strip by default.
  // The user can toggle back open via the hamburger button.
  const [collapsed, setCollapsed] = useState(() => window.innerWidth < 768);
  useEffect(() => {
    const handler = () => setCollapsed(window.innerWidth < 768);
    window.addEventListener("resize", handler);
    return () => window.removeEventListener("resize", handler);
  }, []);

  // Shared sidebar content — rendered both in the normal strip and the mobile overlay.
  const SidebarContent = ({ onNavClick }) => (
    <>
      {/* Subtle gradient glow at top */}
      <div className="absolute top-0 left-0 right-0 h-24 bg-gradient-to-b from-blue-500/5 to-transparent pointer-events-none" />

      {/* Logo */}
      <Tooltip text="AskDB Home">
        {(tooltipProps) => (
          <motion.button
            onClick={() => { navigate("/chat"); onNavClick?.(); }}
            whileHover={{ scale: 1.1 }}
            whileTap={{ scale: 0.95 }}
            animate={{
              boxShadow: [
                "0 0 0 0px rgba(37,99,235,0.35)",
                "0 0 0 7px rgba(37,99,235,0)",
                "0 0 0 0px rgba(37,99,235,0)",
              ],
            }}
            transition={{
              boxShadow: { duration: 2.4, repeat: Infinity, ease: "easeOut" },
              scale: { type: "spring", stiffness: 400, damping: 17 },
            }}
            className="w-9 h-9 rounded-xl bg-blue-600 flex items-center justify-center mb-4 hover:bg-blue-500 transition-colors duration-300 cursor-pointer shadow-lg shadow-blue-600/20 relative z-10"
            aria-label="AskDB Home"
            {...tooltipProps}
          >
            {/* AskDB — The Loop logo (round "A" = circle + crossbar + stem) */}
            <svg className="w-5 h-5" viewBox="0 0 32 32" fill="none" aria-hidden="true">
              <circle cx="16" cy="16" r="12" stroke="white" strokeWidth="2.5" fill="none"/>
              <path d="M9.5 19 H22.5" stroke="white" strokeWidth="2.5" strokeLinecap="round"/>
              <path d="M16 4 V14" stroke="white" strokeWidth="2.5" strokeLinecap="round"/>
            </svg>
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
                  onClick={() => { navigate(item.path); onNavClick?.(); }}
                  whileHover={{ scale: 1.08 }}
                  whileTap={{ scale: 0.95 }}
                  transition={{ type: "spring", stiffness: 400, damping: 17 }}
                  className="w-11 h-11 rounded-xl flex items-center justify-center transition-colors duration-300 ease-spring cursor-pointer relative z-10"
                  style={{ color: isActive ? 'var(--text-primary)' : 'var(--text-muted)', minWidth: 44, minHeight: 44 }}
                  aria-label={item.label}
                  aria-current={isActive ? "page" : undefined}
                  {...tooltipProps}
                >
                  <span aria-hidden="true">{item.icon}</span>
                  {isActive && (
                    <motion.div
                      layoutId="sidebar-indicator"
                      className="absolute inset-0 rounded-xl" style={{ background: 'var(--overlay-light)', border: '1px solid var(--border-default)' }}
                      transition={{ type: "spring", stiffness: 350, damping: 30 }}
                    />
                  )}
                  {isActive && (
                    <motion.div
                      layoutId="sidebar-bar"
                      className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-5 bg-blue-500 rounded-r-full"
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

      {/* Agent toggle */}
      <Tooltip text={agentPanelOpen ? "Hide Agent" : "Show Agent"}>
        {(tooltipProps) => (
          <motion.button
            onClick={() => { setAgentPanelOpen(!agentPanelOpen); onNavClick?.(); }}
            whileHover={{ scale: 1.08 }}
            whileTap={{ scale: 0.95 }}
            transition={{ type: "spring", stiffness: 400, damping: 17 }}
            className="w-11 h-11 rounded-xl flex items-center justify-center transition-colors duration-300 ease-spring cursor-pointer relative z-10"
            style={{ color: agentPanelOpen ? 'var(--text-primary)' : 'var(--text-muted)', minWidth: 44, minHeight: 44 }}
            aria-label={agentPanelOpen ? "Hide Agent" : "Show Agent"}
            {...tooltipProps}
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
            </svg>
            {agentPanelOpen && (
              <motion.div
                layoutId="sidebar-agent-indicator"
                className="absolute inset-0 rounded-xl" style={{ background: 'var(--overlay-light)', border: '1px solid var(--border-default)' }}
                transition={{ type: "spring", stiffness: 350, damping: 30 }}
              />
            )}
          </motion.button>
        )}
      </Tooltip>

      {/* Spacer */}
      <div className="flex-1" />

      {/* Theme toggle */}
      <Tooltip text={theme === "light" ? "Light" : theme === "dark" ? "Dark" : "System"}>
        {(tooltipProps) => (
          <motion.button
            onClick={cycleTheme}
            whileHover={{ scale: 1.08 }}
            whileTap={{ scale: 0.95 }}
            transition={{ type: "spring", stiffness: 400, damping: 17 }}
            className="w-9 h-9 rounded-xl flex items-center justify-center transition-colors duration-300 ease-spring cursor-pointer relative z-10 mb-1"
            style={{ color: 'var(--text-muted)' }}
            aria-label={`Theme: ${theme}`}
            {...tooltipProps}
          >
            {theme === "light" ? <SunIcon /> : theme === "dark" ? <MoonIcon /> : <SystemIcon />}
          </motion.button>
        )}
      </Tooltip>

      {/* User avatar */}
      <Tooltip text={`Profile: ${user?.name || "User"}`}>
        {(tooltipProps) => (
          <motion.button
            onClick={() => { navigate("/profile"); onNavClick?.(); }}
            whileHover={{ scale: 1.1 }}
            whileTap={{ scale: 0.95 }}
            transition={{ type: "spring", stiffness: 400, damping: 17 }}
            className="w-9 h-9 rounded-full bg-blue-600/70 flex items-center justify-center text-white text-xs font-bold hover:bg-blue-500 transition-colors duration-300 cursor-pointer shadow-lg shadow-blue-600/10 relative z-10"
            aria-label={`Profile: ${user?.name || "User"}`}
            {...tooltipProps}
          >
            {initials}
          </motion.button>
        )}
      </Tooltip>
    </>
  );

  // Mobile: sidebar collapses entirely; a floating hamburger toggles a drawer overlay.
  if (collapsed) {
    return (
      <>
        {/* Floating hamburger button — always visible on mobile */}
        <button
          onClick={() => setCollapsed(false)}
          aria-label="Open navigation"
          style={{
            position: "fixed",
            top: 12,
            left: 12,
            zIndex: 60,
            width: 44,
            height: 44,
            minWidth: 44,
            minHeight: 44,
            borderRadius: 12,
            background: "var(--bg-elevated, rgba(20,20,30,0.92))",
            border: "1px solid var(--border-default, rgba(255,255,255,0.1))",
            color: "var(--text-primary, #e7e7ea)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            cursor: "pointer",
            boxShadow: "0 4px 16px rgba(0,0,0,0.4)",
            backdropFilter: "blur(8px)",
            WebkitBackdropFilter: "blur(8px)",
          }}
        >
          <HamburgerIcon />
        </button>

        {/* Mobile nav drawer — slides in from the left when open */}
        <AnimatePresence>
          {/* (collapsed === false handled above, but keep AnimatePresence for exit) */}
        </AnimatePresence>
      </>
    );
  }

  // Desktop / expanded: normal icon-strip sidebar.
  return (
    <div className="w-14 h-full flex-shrink-0 flex flex-col items-center py-3 gap-1 relative" style={{ background: 'var(--bg-page)', borderRight: '1px solid var(--border-default)' }}>
      {/* On mobile when expanded, show a close/collapse button at top */}
      {window.innerWidth < 768 && (
        <button
          onClick={() => setCollapsed(true)}
          aria-label="Close navigation"
          style={{
            position: "absolute",
            top: 8,
            right: -48,
            zIndex: 60,
            width: 44,
            height: 44,
            minWidth: 44,
            minHeight: 44,
            borderRadius: 12,
            background: "var(--bg-elevated, rgba(20,20,30,0.92))",
            border: "1px solid var(--border-default, rgba(255,255,255,0.1))",
            color: "var(--text-primary, #e7e7ea)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            cursor: "pointer",
            boxShadow: "0 4px 16px rgba(0,0,0,0.4)",
          }}
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      )}
      <SidebarContent onNavClick={window.innerWidth < 768 ? () => setCollapsed(true) : undefined} />
    </div>
  );
}
