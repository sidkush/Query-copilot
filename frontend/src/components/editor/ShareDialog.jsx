/**
 * ShareDialog — modal for managing workspace shares on a dashboard.
 *
 * Usage:
 *   <ShareDialog
 *     dashboardId="abc123"
 *     open={showShare}
 *     onClose={() => setShowShare(false)}
 *   />
 *
 * The dialog shows:
 *   - Current members list with role badges + Remove buttons
 *   - Input + role dropdown to invite a new user
 */

import { useState, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";

const API_BASE = "/api/v1/dashboards";

// ── Role badge colours ────────────────────────────────────────────

const ROLE_STYLES = {
  owner: {
    label: "Owner",
    bg: "rgba(139,92,246,0.18)",
    color: "#a78bfa",
    border: "1px solid rgba(139,92,246,0.35)",
  },
  editor: {
    label: "Editor",
    bg: "rgba(59,130,246,0.15)",
    color: "#60a5fa",
    border: "1px solid rgba(59,130,246,0.3)",
  },
  viewer: {
    label: "Viewer",
    bg: "rgba(16,185,129,0.12)",
    color: "#34d399",
    border: "1px solid rgba(16,185,129,0.28)",
  },
};

function RoleBadge({ role }) {
  const s = ROLE_STYLES[role] || ROLE_STYLES.viewer;
  return (
    <span
      style={{
        display: "inline-block",
        padding: "2px 10px",
        borderRadius: 9999,
        fontSize: 11,
        fontWeight: 600,
        letterSpacing: "0.03em",
        background: s.bg,
        color: s.color,
        border: s.border,
      }}
    >
      {s.label}
    </span>
  );
}

// ── Helpers ───────────────────────────────────────────────────────

function authHeader() {
  const token = localStorage.getItem("askdb_token");
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function fetchMembers(dashboardId) {
  const res = await fetch(`${API_BASE}/${dashboardId}/workspace-shares`, {
    headers: { ...authHeader() },
  });
  if (!res.ok) throw new Error(`Failed to load members (${res.status})`);
  const data = await res.json();
  return data.members || [];
}

async function addMember(dashboardId, email, role) {
  const res = await fetch(`${API_BASE}/${dashboardId}/workspace-shares`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeader() },
    body: JSON.stringify({ email, role }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || `Share failed (${res.status})`);
  }
  return res.json();
}

async function removeMember(dashboardId, email) {
  const res = await fetch(
    `${API_BASE}/${dashboardId}/workspace-shares/${encodeURIComponent(email)}`,
    { method: "DELETE", headers: { ...authHeader() } }
  );
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || `Revoke failed (${res.status})`);
  }
  return res.json();
}

// ── Main component ────────────────────────────────────────────────

export default function ShareDialog({ dashboardId, open, onClose }) {
  const [members, setMembers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState("viewer");
  const [sharing, setSharing] = useState(false);
  const [shareError, setShareError] = useState("");

  const loadMembers = useCallback(async () => {
    if (!dashboardId) return;
    setLoading(true);
    setError("");
    try {
      const m = await fetchMembers(dashboardId);
      setMembers(m);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [dashboardId]);

  useEffect(() => {
    if (open) loadMembers();
  }, [open, loadMembers]);

  const handleShare = async (e) => {
    e.preventDefault();
    if (!inviteEmail.trim()) return;
    setSharing(true);
    setShareError("");
    try {
      await addMember(dashboardId, inviteEmail.trim(), inviteRole);
      setInviteEmail("");
      setInviteRole("viewer");
      await loadMembers();
    } catch (e) {
      setShareError(e.message);
    } finally {
      setSharing(false);
    }
  };

  const handleRevoke = async (email) => {
    setError("");
    try {
      await removeMember(dashboardId, email);
      await loadMembers();
    } catch (e) {
      setError(e.message);
    }
  };

  if (!open) return null;

  const dialog = (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 9999,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "rgba(6,6,14,0.72)",
        backdropFilter: "blur(6px)",
        WebkitBackdropFilter: "blur(6px)",
      }}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        style={{
          width: 480,
          maxWidth: "calc(100vw - 32px)",
          background: "rgba(18,18,32,0.97)",
          border: "1px solid rgba(255,255,255,0.09)",
          borderRadius: 16,
          boxShadow: "0 24px 64px rgba(0,0,0,0.6)",
          padding: "28px 28px 24px",
          color: "#e2e8f0",
          fontFamily: "Inter, system-ui, sans-serif",
        }}
      >
        {/* Header */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: 20,
          }}
        >
          <span style={{ fontWeight: 700, fontSize: 16, letterSpacing: "-0.01em" }}>
            Share dashboard
          </span>
          <button
            onClick={onClose}
            style={{
              background: "none",
              border: "none",
              cursor: "pointer",
              color: "#94a3b8",
              fontSize: 20,
              lineHeight: 1,
              padding: "2px 6px",
              borderRadius: 6,
            }}
            aria-label="Close"
          >
            ×
          </button>
        </div>

        {/* Invite form */}
        <form onSubmit={handleShare} style={{ marginBottom: 20 }}>
          <div style={{ display: "flex", gap: 8 }}>
            <input
              type="email"
              placeholder="colleague@example.com"
              value={inviteEmail}
              onChange={(e) => setInviteEmail(e.target.value)}
              required
              style={{
                flex: 1,
                background: "rgba(255,255,255,0.05)",
                border: "1px solid rgba(255,255,255,0.12)",
                borderRadius: 8,
                padding: "9px 12px",
                color: "#e2e8f0",
                fontSize: 13,
                outline: "none",
              }}
            />
            <select
              value={inviteRole}
              onChange={(e) => setInviteRole(e.target.value)}
              style={{
                background: "rgba(255,255,255,0.05)",
                border: "1px solid rgba(255,255,255,0.12)",
                borderRadius: 8,
                padding: "9px 10px",
                color: "#e2e8f0",
                fontSize: 13,
                cursor: "pointer",
                outline: "none",
              }}
            >
              <option value="viewer">Viewer</option>
              <option value="editor">Editor</option>
            </select>
            <button
              type="submit"
              disabled={sharing || !inviteEmail.trim()}
              style={{
                background: sharing
                  ? "rgba(99,102,241,0.4)"
                  : "rgba(99,102,241,0.85)",
                border: "none",
                borderRadius: 8,
                padding: "9px 18px",
                color: "#fff",
                fontWeight: 600,
                fontSize: 13,
                cursor: sharing ? "not-allowed" : "pointer",
                whiteSpace: "nowrap",
                transition: "background 0.15s",
              }}
            >
              {sharing ? "Sharing…" : "Share"}
            </button>
          </div>
          {shareError && (
            <p style={{ margin: "8px 0 0", color: "#f87171", fontSize: 12 }}>
              {shareError}
            </p>
          )}
        </form>

        {/* Members list */}
        <div
          style={{
            borderTop: "1px solid rgba(255,255,255,0.07)",
            paddingTop: 16,
          }}
        >
          <p
            style={{
              margin: "0 0 12px",
              fontSize: 12,
              color: "#64748b",
              fontWeight: 600,
              textTransform: "uppercase",
              letterSpacing: "0.06em",
            }}
          >
            People with access
          </p>

          {loading && (
            <p style={{ color: "#64748b", fontSize: 13 }}>Loading…</p>
          )}
          {error && (
            <p style={{ color: "#f87171", fontSize: 13 }}>{error}</p>
          )}

          {!loading && members.length === 0 && !error && (
            <p style={{ color: "#475569", fontSize: 13 }}>
              No members yet — share the link above to invite collaborators.
            </p>
          )}

          <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
            {members.map((m) => (
              <li
                key={m.email}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  padding: "9px 0",
                  borderBottom: "1px solid rgba(255,255,255,0.04)",
                }}
              >
                <span
                  style={{
                    fontSize: 13,
                    color: "#cbd5e1",
                    flex: 1,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                    marginRight: 12,
                  }}
                >
                  {m.email}
                </span>
                <span style={{ marginRight: 10, flexShrink: 0 }}>
                  <RoleBadge role={m.role} />
                </span>
                {m.role !== "owner" && (
                  <button
                    onClick={() => handleRevoke(m.email)}
                    style={{
                      background: "none",
                      border: "1px solid rgba(239,68,68,0.3)",
                      borderRadius: 6,
                      color: "#f87171",
                      fontSize: 11,
                      fontWeight: 600,
                      cursor: "pointer",
                      padding: "3px 10px",
                      flexShrink: 0,
                      transition: "background 0.15s",
                    }}
                    onMouseEnter={(e) =>
                      (e.currentTarget.style.background =
                        "rgba(239,68,68,0.12)")
                    }
                    onMouseLeave={(e) =>
                      (e.currentTarget.style.background = "none")
                    }
                  >
                    Remove
                  </button>
                )}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );

  return createPortal(dialog, document.body);
}
