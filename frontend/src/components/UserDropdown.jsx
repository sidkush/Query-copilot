import { useState, useRef, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useStore } from "../store";

export default function UserDropdown() {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const menuRef = useRef(null);
  const navigate = useNavigate();
  const user = useStore((s) => s.user);
  const logout = useStore((s) => s.logout);

  // Click-outside to close
  useEffect(() => {
    if (!open) return;
    const handler = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  // Escape key to close
  useEffect(() => {
    if (!open) return;
    const handler = (e) => {
      if (e.key === "Escape") { setOpen(false); }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [open]);

  // Arrow key navigation inside menu
  const handleMenuKeyDown = useCallback((e) => {
    if (!menuRef.current) return;
    const items = menuRef.current.querySelectorAll("[role='menuitem']");
    if (!items.length) return;
    const idx = Array.from(items).indexOf(document.activeElement);
    if (e.key === "ArrowDown") {
      e.preventDefault();
      items[(idx + 1) % items.length]?.focus();
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      items[(idx - 1 + items.length) % items.length]?.focus();
    }
  }, []);

  // Focus first menu item when opened
  useEffect(() => {
    if (open && menuRef.current) {
      const first = menuRef.current.querySelector("[role='menuitem']");
      setTimeout(() => first?.focus(), 50);
    }
  }, [open]);

  const displayName = user?.display_name || user?.name || user?.email || "User";
  const email = user?.email || "";
  const initials = displayName
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join("");

  const handleSignOut = () => {
    setOpen(false);
    logout();
    navigate("/login");
  };

  const go = (path) => {
    setOpen(false);
    navigate(path);
  };

  const MENU_ITEMS = [
    { label: "Profile", path: "/profile", icon: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /> },
    { label: "Account", path: "/account", icon: <><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></> },
    { label: "Billing", path: "/billing", icon: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" /> },
  ];

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 px-2 py-1.5 rounded-lg transition cursor-pointer"
        style={{ '--hover-bg': 'var(--overlay-subtle)' }}
        onMouseEnter={e => e.currentTarget.style.background = 'var(--overlay-subtle)'}
        onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label={`User menu for ${displayName}`}
      >
        <div className="w-8 h-8 rounded-full bg-blue-600 flex items-center justify-center text-white text-xs font-bold flex-shrink-0" aria-hidden="true">
          {initials}
        </div>
        <span className="text-sm font-medium hidden sm:inline max-w-[120px] truncate" style={{ color: 'var(--text-secondary)' }}>
          {displayName}
        </span>
        <svg
          className={`w-3.5 h-3.5 transition-transform ${open ? "rotate-180" : ""}`}
          style={{ color: 'var(--text-muted)' }}
          fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && (
        <div
          ref={menuRef}
          role="menu"
          aria-label="User menu"
          onKeyDown={handleMenuKeyDown}
          className="absolute right-0 top-full mt-2 w-64 glass-card rounded-xl shadow-2xl shadow-black/40 z-50 overflow-hidden"
        >
          {/* User info */}
          <div className="px-4 py-3 border-b" style={{ borderColor: 'var(--border-default)' }}>
            <p className="text-sm font-semibold truncate" style={{ color: 'var(--text-primary)' }}>{displayName}</p>
            <p className="text-xs truncate" style={{ color: 'var(--text-secondary)' }}>{email}</p>
          </div>

          {/* Menu items */}
          <div className="py-1">
            {MENU_ITEMS.map((item) => (
              <button
                key={item.label}
                role="menuitem"
                onClick={() => go(item.path)}
                className="w-full flex items-center gap-3 px-4 py-2.5 text-sm transition cursor-pointer focus:outline-none"
                style={{ color: 'var(--text-secondary)' }}
                onMouseEnter={e => { e.currentTarget.style.background = 'var(--overlay-subtle)'; e.currentTarget.style.color = 'var(--text-primary)'; }}
                onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--text-secondary)'; }}
              >
                <svg className="w-4 h-4" style={{ color: 'var(--text-muted)' }} fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                  {item.icon}
                </svg>
                {item.label}
              </button>
            ))}
          </div>

          {/* Divider + Sign out */}
          <div className="border-t" style={{ borderColor: 'var(--border-default)' }}>
            <button
              role="menuitem"
              onClick={handleSignOut}
              className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-red-400 hover:bg-red-900/20 hover:text-red-300 transition cursor-pointer focus:bg-red-900/20 focus:outline-none"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
              </svg>
              Sign Out
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
