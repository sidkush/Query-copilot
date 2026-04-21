import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { StaggerContainer, StaggerItem } from "../components/animation/StaggerContainer";
import AnimatedCounter from "../components/animation/AnimatedCounter";
import MotionButton from "../components/animation/MotionButton";
import { adminApi } from "../api";

const ALL_PLANS = ["free", "pro", "team"];

const PLAN_COLORS = {
  free: "bg-gray-500/20 text-gray-400 border-gray-600",
  pro: "bg-indigo-500/20 text-indigo-400 border-indigo-600",
  team: "bg-cyan-500/20 text-cyan-400 border-cyan-600",
  // Legacy plans (display-only for existing users)
  weekly: "bg-sky-500/20 text-sky-400 border-sky-600",
  monthly: "bg-blue-500/20 text-blue-400 border-blue-600",
  yearly: "bg-teal-500/20 text-teal-400 border-teal-600",
  enterprise: "bg-amber-500/20 text-amber-400 border-amber-600",
};

const tabTransition = {
  initial: { opacity: 0, y: 12 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -12 },
  transition: { duration: 0.25, ease: "easeInOut" },
};

const slideFromRight = {
  initial: { opacity: 0, x: 60 },
  animate: { opacity: 1, x: 0 },
  exit: { opacity: 0, x: 60 },
  transition: { type: "spring", stiffness: 300, damping: 30 },
};

const slideMessage = {
  initial: { opacity: 0, y: -16 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -16 },
  transition: { duration: 0.2, ease: "easeOut" },
};

function StatCard({ value, label, icon, color = "from-blue-400 to-cyan-400", onClick }) {
  return (
    <motion.div
      onClick={onClick}
      className={`glass-card rounded-2xl p-5 transition ${onClick ? "cursor-pointer hover:border-white/10" : ""}`}
      whileHover={onClick ? { scale: 1.03, y: -2 } : {}}
      whileTap={onClick ? { scale: 0.98 } : {}}
      transition={{ type: "spring", stiffness: 400, damping: 20 }}
    >
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs text-gray-500 uppercase tracking-wider">{label}</span>
        <span className="text-gray-600">{icon}</span>
      </div>
      <p className={`text-3xl font-extrabold bg-gradient-to-r ${color} bg-clip-text text-transparent`}>
        {typeof value === "number" ? (
          <AnimatedCounter value={value} />
        ) : (
          value
        )}
      </p>
    </motion.div>
  );
}

function PlanBadge({ plan }) {
  const c = PLAN_COLORS[plan] || PLAN_COLORS.free;
  return <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium border ${c} capitalize`}>{plan}</span>;
}

export default function AdminDashboard() {
  const navigate = useNavigate();
  const [tab, setTab] = useState("overview");
  const [overview, setOverview] = useState(null);
  const [users, setUsers] = useState([]);
  const [tickets, setTickets] = useState([]);
  const [deletedUsers, setDeletedUsers] = useState([]);
  const [selectedUser, setSelectedUser] = useState(null);
  const [userDetail, setUserDetail] = useState(null);
  const [loading, setLoading] = useState(true);
  const [actionMsg, setActionMsg] = useState("");
  const [ticketReply, setTicketReply] = useState({});

  // ── Filters ──
  const [filterText, setFilterText] = useState("");
  const [filterPlan, setFilterPlan] = useState("");
  const [filterAuth, setFilterAuth] = useState("");
  const [filterDateFrom, setFilterDateFrom] = useState("");
  const [filterDateTo, setFilterDateTo] = useState("");
  const [showFilters, setShowFilters] = useState(false);

  // ── Ticket filters ──
  const [ticketSearch, setTicketSearch] = useState("");
  const [ticketStatus, setTicketStatus] = useState("");
  const [ticketCategory, setTicketCategory] = useState("");
  const [ticketDateFrom, setTicketDateFrom] = useState("");
  const [ticketDateTo, setTicketDateTo] = useState("");

  // ── Deleted users filters ──
  const [deletedSearch, setDeletedSearch] = useState("");
  const [deletedBy, setDeletedBy] = useState("");
  const [deletedDateFrom, setDeletedDateFrom] = useState("");
  const [deletedDateTo, setDeletedDateTo] = useState("");

  // ── Overview drill-down popup ──
  const [overviewPopup, setOverviewPopup] = useState(null); // { title, rows: [{cols}] }

  // ── Pending changes (staged, not yet saved) ──
  const [pendingChanges, setPendingChanges] = useState({}); // { email: { plan?, delete? } }
  const [confirmModal, setConfirmModal] = useState(null); // { type: "save"|"delete"|"plan", email?, plan? }
  const [saving, setSaving] = useState(false);

  const adminUser = JSON.parse(localStorage.getItem("admin_user") || "null");
  const hasPending = Object.keys(pendingChanges).length > 0;

  useEffect(() => {
    if (!localStorage.getItem("admin_token")) { navigate("/admin/login"); return; }
    loadData();
    // mount-only bootstrap
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const [ov, usr, tk] = await Promise.all([
        adminApi.dashboard(), adminApi.listUsers(), adminApi.listTickets(),
      ]);
      setOverview(ov); setUsers(usr.users); setTickets(tk.tickets);
    } catch (err) {
      if (err.message.includes("401") || err.message.includes("403")) { navigate("/admin/login"); return; }
    }
    finally { setLoading(false); }
  };

  const handleLogout = () => {
    localStorage.removeItem("admin_token");
    localStorage.removeItem("admin_user");
    navigate("/admin/login");
  };

  const loadUserDetail = async (email) => {
    setSelectedUser(email);
    try {
      const d = await adminApi.getUserDetail(email);
      setUserDetail(d);
    } catch { setUserDetail(null); }
  };

  // ── Staging changes (not saved until "Save All") ──
  const stagePlanChange = (email, plan) => {
    setPendingChanges((p) => {
      const entry = { ...(p[email] || {}), plan };
      if (entry.delete) delete entry.delete; // can't change plan and delete
      return { ...p, [email]: entry };
    });
  };

  const stageDelete = (email) => {
    setPendingChanges((p) => ({ ...p, [email]: { delete: true } }));
  };

  const unstageChange = (email) => {
    setPendingChanges((p) => {
      const next = { ...p };
      delete next[email];
      return next;
    });
  };

  const revertAll = () => {
    setPendingChanges({});
    setConfirmModal(null);
    setActionMsg("All pending changes reverted.");
  };

  const saveAll = async () => {
    setSaving(true);
    const entries = Object.entries(pendingChanges);
    let successes = 0;
    let errors = [];
    for (const [email, changes] of entries) {
      try {
        if (changes.delete) {
          await adminApi.deleteUser(email);
        } else if (changes.plan) {
          await adminApi.updateUserPlan(email, changes.plan);
        }
        successes++;
      } catch (err) {
        errors.push(`${email}: ${err.message}`);
      }
    }
    setPendingChanges({});
    setConfirmModal(null);
    setSaving(false);
    await loadData();
    if (selectedUser) loadUserDetail(selectedUser);
    setActionMsg(
      errors.length
        ? `${successes} changes saved. Errors: ${errors.join("; ")}`
        : `${successes} change(s) saved successfully.`
    );
  };

  // ── Filter logic ──
  const filteredUsers = users.filter((u) => {
    // Text search: name, email, phone
    if (filterText) {
      const q = filterText.toLowerCase();
      const match = (u.name || "").toLowerCase().includes(q) ||
        (u.email || "").toLowerCase().includes(q) ||
        (u.phone || "").includes(q) ||
        (u.country_code || "").includes(q);
      if (!match) return false;
    }
    // Plan filter
    if (filterPlan) {
      const effective = pendingChanges[u.email]?.plan || u.plan || "free";
      if (effective !== filterPlan) return false;
    }
    // Auth filter
    if (filterAuth) {
      const auth = u.oauth_provider || "email";
      if (auth !== filterAuth) return false;
    }
    // Date range
    if (filterDateFrom && u.created_at) {
      if (new Date(u.created_at) < new Date(filterDateFrom)) return false;
    }
    if (filterDateTo && u.created_at) {
      if (new Date(u.created_at) > new Date(filterDateTo + "T23:59:59")) return false;
    }
    return true;
  });

  const clearFilters = () => {
    setFilterText(""); setFilterPlan(""); setFilterAuth("");
    setFilterDateFrom(""); setFilterDateTo("");
  };

  // ── Filtered tickets ──
  const filteredTickets = tickets.filter((t) => {
    if (ticketSearch) {
      const q = ticketSearch.toLowerCase();
      if (!(t.subject || "").toLowerCase().includes(q) && !(t.message || "").toLowerCase().includes(q) && !(t.created_by || "").toLowerCase().includes(q) && !(t.id || "").toLowerCase().includes(q)) return false;
    }
    if (ticketStatus && t.status !== ticketStatus) return false;
    if (ticketCategory && t.category !== ticketCategory) return false;
    if (ticketDateFrom && t.created_at && new Date(t.created_at) < new Date(ticketDateFrom)) return false;
    if (ticketDateTo && t.created_at && new Date(t.created_at) > new Date(ticketDateTo + "T23:59:59")) return false;
    return true;
  });

  // ── Filtered deleted users ──
  const filteredDeleted = deletedUsers.filter((u) => {
    if (deletedSearch) {
      const q = deletedSearch.toLowerCase();
      if (!(u.name || "").toLowerCase().includes(q) && !(u.email || "").toLowerCase().includes(q)) return false;
    }
    if (deletedBy) {
      if (deletedBy === "self" && u.deleted_by !== "self") return false;
      if (deletedBy === "admin" && !u.deleted_by?.startsWith("admin:")) return false;
    }
    if (deletedDateFrom && u.deleted_at && new Date(u.deleted_at) < new Date(deletedDateFrom)) return false;
    if (deletedDateTo && u.deleted_at && new Date(u.deleted_at) > new Date(deletedDateTo + "T23:59:59")) return false;
    return true;
  });

  // ── Overview drill-down helpers ──
  const drillDown = (type) => {
    if (type === "total_users") {
      setOverviewPopup({ title: "All Registered Users", cols: ["Name", "Email", "Plan", "Queries", "Joined"],
        rows: users.map((u) => [u.name || "\u2014", u.email, u.plan || "free", u.query_stats?.total_queries || 0, u.created_at ? new Date(u.created_at).toLocaleDateString() : "\u2014"]) });
    } else if (type === "active_users") {
      const active = users.filter((u) => u.query_stats?.queries_this_month > 0);
      setOverviewPopup({ title: "Active Users This Month", cols: ["Name", "Email", "Queries This Month"],
        rows: active.map((u) => [u.name || "\u2014", u.email, u.query_stats?.queries_this_month || 0]) });
    } else if (type === "total_queries") {
      const withQ = users.filter((u) => u.query_stats?.total_queries > 0).sort((a, b) => (b.query_stats?.total_queries || 0) - (a.query_stats?.total_queries || 0));
      setOverviewPopup({ title: "Queries by User", cols: ["Name", "Email", "Total Queries", "This Month"],
        rows: withQ.map((u) => [u.name || "\u2014", u.email, u.query_stats?.total_queries || 0, u.query_stats?.queries_this_month || 0]) });
    } else if (type === "connections") {
      const withC = users.filter((u) => u.active_connections > 0);
      setOverviewPopup({ title: "Live Connections", cols: ["Name", "Email", "Active Connections", "Saved DBs"],
        rows: withC.map((u) => [u.name || "\u2014", u.email, u.active_connections, u.saved_connections]) });
    } else if (type === "chats") {
      const withCh = users.filter((u) => u.chat_count > 0).sort((a, b) => b.chat_count - a.chat_count);
      setOverviewPopup({ title: "Chat Sessions by User", cols: ["Name", "Email", "Chats"],
        rows: withCh.map((u) => [u.name || "\u2014", u.email, u.chat_count]) });
    } else if (type === "open_tickets") {
      const open = tickets.filter((t) => t.status === "open");
      setOverviewPopup({ title: "Open Support Tickets", cols: ["ID", "Subject", "By", "Category", "Date"],
        rows: open.map((t) => [t.id, t.subject, t.created_by, t.category, t.created_at ? new Date(t.created_at).toLocaleDateString() : "\u2014"]) });
    } else if (type === "total_tickets") {
      setOverviewPopup({ title: "All Support Tickets", cols: ["ID", "Subject", "Status", "By", "Date"],
        rows: tickets.map((t) => [t.id, t.subject, t.status, t.created_by, t.created_at ? new Date(t.created_at).toLocaleDateString() : "\u2014"]) });
    } else if (type === "deleted_users") {
      loadDeleted().then(() => {});
      setOverviewPopup({ title: "Deleted User Accounts", cols: ["Name", "Email", "Deleted At", "Deleted By"],
        rows: deletedUsers.map((u) => [u.name || "\u2014", u.email, u.deleted_at ? new Date(u.deleted_at).toLocaleDateString() : "\u2014", u.deleted_by || "\u2014"]) });
    }
  };

  const handleReplyTicket = async (ticketId) => {
    const msg = ticketReply[ticketId];
    if (!msg?.trim()) return;
    try {
      await adminApi.replyToTicket(ticketId, msg);
      setTicketReply((p) => ({ ...p, [ticketId]: "" }));
      const tk = await adminApi.listTickets();
      setTickets(tk.tickets);
    } catch (err) { setActionMsg(err.message); }
  };

  const handleCloseTicket = async (ticketId) => {
    try {
      await adminApi.closeTicket(ticketId);
      const tk = await adminApi.listTickets();
      setTickets(tk.tickets);
    } catch (err) { setActionMsg(err.message); }
  };

  const loadDeleted = async () => {
    try {
      const d = await adminApi.listDeletedUsers();
      setDeletedUsers(d.deleted_users);
    } catch { /* noop */ }
  };

  const TABS = [
    { id: "overview", label: "Overview" },
    { id: "users", label: "Users" },
    { id: "tickets", label: "Support" },
    { id: "deleted", label: "Deleted" },
  ];

  return (
    <div className="min-h-screen relative" style={{ background: 'var(--bg-page)', color: 'var(--text-primary)' }}>
      <div className="fixed inset-0 mesh-gradient opacity-20 pointer-events-none" />
      {/* Admin Header */}
      <header className="glass-navbar sticky top-0 z-20">
        <div className="max-w-7xl mx-auto px-6 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-red-600 to-rose-600 flex items-center justify-center shadow-lg shadow-red-500/20">
              <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
              </svg>
            </div>
            <div>
              <h1 className="text-lg font-bold">AskDB Admin</h1>
              <p className="text-xs text-gray-500">Logged in as {adminUser?.username || "admin"}</p>
            </div>
          </div>
          <MotionButton onClick={handleLogout} className="px-4 py-2 text-sm text-gray-400 hover:text-white glass rounded-lg hover:bg-white/10 transition cursor-pointer">
            Logout
          </MotionButton>
        </div>
        {/* Tabs */}
        <div className="max-w-7xl mx-auto px-6 flex gap-1">
          {TABS.map((t) => (
            <button key={t.id} onClick={() => { setTab(t.id); if (t.id === "deleted") loadDeleted(); }}
              className={`px-4 py-2 text-sm font-medium border-b-2 transition cursor-pointer ${tab === t.id ? "border-red-500 text-white" : "border-transparent text-gray-500 hover:text-gray-300"}`}>
              {t.label}
            </button>
          ))}
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-6 py-6 relative z-10">
        <AnimatePresence>
          {actionMsg && (
            <motion.div
              key="actionMsg"
              {...slideMessage}
              className="mb-4 glass rounded-lg p-3 text-sm text-gray-300 flex justify-between"
            >
              {actionMsg}
              <button onClick={() => setActionMsg("")} className="text-gray-500 hover:text-white cursor-pointer" aria-label="Dismiss">x</button>
            </motion.div>
          )}
        </AnimatePresence>

        {loading ? (
          <div className="flex items-center gap-3 text-gray-500 text-sm py-20 justify-center">
            <div className="w-5 h-5 border-2 border-red-500 border-t-transparent rounded-full animate-spin" />
            Loading admin dashboard...
          </div>
        ) : (
          <AnimatePresence mode="wait">
            {/* OVERVIEW TAB */}
            {tab === "overview" && overview && (
              <motion.div key="overview" {...tabTransition} className="space-y-6">
                <StaggerContainer className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <StaggerItem>
                    <StatCard value={overview.total_users} label="Total Users" color="from-blue-400 to-indigo-400" icon="U" onClick={() => drillDown("total_users")} />
                  </StaggerItem>
                  <StaggerItem>
                    <StatCard value={overview.active_users_this_month} label="Active This Month" color="from-green-400 to-emerald-400" icon="A" onClick={() => drillDown("active_users")} />
                  </StaggerItem>
                  <StaggerItem>
                    <StatCard value={overview.total_queries} label="Total Queries" color="from-purple-400 to-pink-400" icon="Q" onClick={() => drillDown("total_queries")} />
                  </StaggerItem>
                  <StaggerItem>
                    <StatCard value={overview.total_active_connections} label="Live Connections" color="from-cyan-400 to-blue-400" icon="C" onClick={() => drillDown("connections")} />
                  </StaggerItem>
                </StaggerContainer>
                <StaggerContainer className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <StaggerItem>
                    <StatCard value={overview.total_chats} label="Chat Sessions" color="from-yellow-400 to-orange-400" icon="S" onClick={() => drillDown("chats")} />
                  </StaggerItem>
                  <StaggerItem>
                    <StatCard value={overview.open_tickets} label="Open Tickets" color="from-red-400 to-rose-400" icon="T" onClick={() => drillDown("open_tickets")} />
                  </StaggerItem>
                  <StaggerItem>
                    <StatCard value={overview.total_tickets} label="Total Tickets" color="from-gray-400 to-gray-300" icon="T" onClick={() => drillDown("total_tickets")} />
                  </StaggerItem>
                  <StaggerItem>
                    <StatCard value={overview.deleted_users} label="Deleted Users" color="from-red-400 to-red-300" icon="D" onClick={() => drillDown("deleted_users")} />
                  </StaggerItem>
                </StaggerContainer>

                {/* Overview drill-down popup */}
                <AnimatePresence>
                  {overviewPopup && (
                    <motion.div
                      key="overviewPopup"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      transition={{ duration: 0.2 }}
                      className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50"
                      onClick={() => setOverviewPopup(null)}
                    >
                      <motion.div
                        initial={{ opacity: 0, scale: 0.92, y: 20 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.92, y: 20 }}
                        transition={{ type: "spring", stiffness: 300, damping: 25 }}
                        className="glass-card rounded-2xl p-6 max-w-3xl w-full mx-4 shadow-2xl max-h-[80vh] flex flex-col"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <div className="flex items-center justify-between mb-4">
                          <h3 className="text-lg font-bold text-white">{overviewPopup.title}</h3>
                          <button onClick={() => setOverviewPopup(null)} className="text-gray-500 hover:text-white text-xl cursor-pointer px-2" aria-label="Close">x</button>
                        </div>
                        <div className="overflow-auto flex-1">
                          {overviewPopup.rows.length === 0 ? (
                            <p className="text-gray-600 text-sm text-center py-8">No data</p>
                          ) : (
                            <table className="w-full text-sm">
                              <thead>
                                <tr className="border-b border-gray-800">
                                  {overviewPopup.cols.map((c) => (
                                    <th key={c} className="text-left text-xs text-gray-500 uppercase tracking-wider py-2 px-3">{c}</th>
                                  ))}
                                </tr>
                              </thead>
                              <tbody>
                                {overviewPopup.rows.map((row, i) => (
                                  <tr key={i} className="border-b border-gray-800/50 hover:bg-gray-800/30">
                                    {row.map((cell, j) => (
                                      <td key={j} className="py-2 px-3 text-gray-300">{cell}</td>
                                    ))}
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          )}
                        </div>
                        <p className="text-xs text-gray-600 mt-3">{overviewPopup.rows.length} row(s) - Click outside to close</p>
                      </motion.div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>
            )}

            {/* USERS TAB */}
            {tab === "users" && (
              <motion.div key="users" {...tabTransition} className="space-y-4">
                {/* ── Pending changes banner ── */}
                <AnimatePresence>
                  {hasPending && (
                    <motion.div
                      key="pendingBanner"
                      {...slideMessage}
                      className="bg-amber-900/20 border border-amber-700/50 rounded-xl p-3 flex items-center justify-between"
                    >
                      <div className="flex items-center gap-2 text-sm text-amber-300">
                        <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
                        {Object.keys(pendingChanges).length} unsaved change(s)
                        <span className="text-xs text-amber-500 ml-2">
                          ({Object.entries(pendingChanges).map(([e, c]) => c.delete ? `delete ${e.split("@")[0]}` : `${e.split("@")[0]} -> ${c.plan}`).join(", ")})
                        </span>
                      </div>
                      <div className="flex gap-2">
                        <MotionButton onClick={revertAll} className="px-3 py-1.5 text-xs font-medium text-gray-300 bg-gray-700 border border-gray-600 rounded-lg hover:bg-gray-600 transition cursor-pointer">
                          Revert All
                        </MotionButton>
                        <MotionButton onClick={() => setConfirmModal({ type: "save" })} className="px-3 py-1.5 text-xs font-medium text-white bg-green-600 border border-green-500 rounded-lg hover:bg-green-700 transition cursor-pointer">
                          Save All Changes
                        </MotionButton>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>

                {/* ── Filters bar ── */}
                <div className="glass-card rounded-xl p-3">
                  <div className="flex items-center gap-3 flex-wrap">
                    {/* Search */}
                    <input type="text" placeholder="Search name, email, phone..." value={filterText} onChange={(e) => setFilterText(e.target.value)}
                      className="flex-1 min-w-[200px] glass-input rounded-lg px-3 py-1.5 text-sm text-white placeholder-gray-500 input-glow" />
                    {/* Plan */}
                    <select value={filterPlan} onChange={(e) => setFilterPlan(e.target.value)}
                      className="glass-input rounded-lg px-3 py-1.5 text-sm text-white cursor-pointer input-glow">
                      <option value="">All Plans</option>
                      {ALL_PLANS.map((p) => <option key={p} value={p}>{p}</option>)}
                    </select>
                    {/* Auth */}
                    <select value={filterAuth} onChange={(e) => setFilterAuth(e.target.value)}
                      className="glass-input rounded-lg px-3 py-1.5 text-sm text-white cursor-pointer input-glow">
                      <option value="">All Auth</option>
                      <option value="email">Email</option>
                      <option value="google">Google</option>
                      <option value="github">GitHub</option>
                    </select>
                    {/* Toggle advanced */}
                    <button onClick={() => setShowFilters(!showFilters)} className="text-xs text-gray-400 hover:text-white cursor-pointer">
                      {showFilters ? "Less" : "More"}
                    </button>
                    {(filterText || filterPlan || filterAuth || filterDateFrom || filterDateTo) && (
                      <button onClick={clearFilters} className="text-xs text-red-400 hover:text-red-300 cursor-pointer">Clear</button>
                    )}
                  </div>
                  {/* Advanced filters row */}
                  {showFilters && (
                    <div className="flex items-center gap-3 mt-3">
                      <div className="flex items-center gap-2">
                        <label className="text-xs text-gray-500">Joined from</label>
                        <input type="date" value={filterDateFrom} onChange={(e) => setFilterDateFrom(e.target.value)}
                          className="glass-input rounded-lg px-2 py-1 text-xs text-white input-glow" />
                      </div>
                      <div className="flex items-center gap-2">
                        <label className="text-xs text-gray-500">to</label>
                        <input type="date" value={filterDateTo} onChange={(e) => setFilterDateTo(e.target.value)}
                          className="glass-input rounded-lg px-2 py-1 text-xs text-white input-glow" />
                      </div>
                    </div>
                  )}
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                  {/* User List */}
                  <div className="lg:col-span-2 space-y-2">
                    <h2 className="text-sm font-semibold text-gray-400">
                      {filteredUsers.length === users.length ? `${users.length} registered users` : `${filteredUsers.length} of ${users.length} users`}
                    </h2>
                    <StaggerContainer className="space-y-2 max-h-[65vh] overflow-y-auto pr-2">
                      {filteredUsers.map((u) => {
                        const pc = pendingChanges[u.email];
                        const effectivePlan = pc?.plan || u.plan || "free";
                        const isDeleting = pc?.delete;
                        return (
                          <StaggerItem key={u.email}>
                            <div onClick={() => loadUserDetail(u.email)}
                              className={`glass-card rounded-xl p-4 cursor-pointer transition ${isDeleting ? "border-red-600 opacity-60" : selectedUser === u.email ? "border-red-500" : pc ? "border-amber-600" : ""}`}>
                              <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                  {isDeleting && <span className="text-xs bg-red-500/20 text-red-400 border border-red-700 px-1.5 py-0.5 rounded">PENDING DELETE</span>}
                                  <div>
                                    <p className={`text-sm font-medium ${isDeleting ? "line-through text-gray-500" : "text-white"}`}>{u.name || u.email}</p>
                                    <p className="text-xs text-gray-500">{u.email}</p>
                                  </div>
                                </div>
                                <div className="flex items-center gap-2">
                                  <PlanBadge plan={effectivePlan} />
                                  {pc && !isDeleting && <span className="text-[10px] text-amber-400">(changed)</span>}
                                  <span className="text-xs text-gray-600">{u.query_stats?.total_queries || 0}q</span>
                                </div>
                              </div>
                              <div className="mt-2 flex gap-4 text-xs text-gray-600">
                                <span>{u.saved_connections} saved</span>
                                <span>{u.chat_count} chats</span>
                                <span>{u.active_connections} live</span>
                                {u.oauth_provider && <span className="text-indigo-400">{u.oauth_provider}</span>}
                                <span>{u.created_at ? new Date(u.created_at).toLocaleDateString() : ""}</span>
                              </div>
                            </div>
                          </StaggerItem>
                        );
                      })}
                      {filteredUsers.length === 0 && (
                        <div className="text-center text-gray-600 text-sm py-8">No users match the filters</div>
                      )}
                    </StaggerContainer>
                  </div>

                  {/* User Detail Panel */}
                  <div className="space-y-4">
                    <AnimatePresence mode="wait">
                      {userDetail ? (
                        <motion.div key={userDetail.email} {...slideFromRight} className="space-y-4">
                          {/* Info card */}
                          <div className="glass-card rounded-2xl p-5">
                            <h3 className="text-sm font-bold text-white mb-3">{userDetail.name}</h3>
                            <div className="space-y-2 text-sm">
                              <div className="flex justify-between"><span className="text-gray-500">Email</span><span className="text-gray-300 text-xs">{userDetail.email}</span></div>
                              <div className="flex justify-between"><span className="text-gray-500">Phone</span><span className="text-gray-300">{userDetail.country_code} {userDetail.phone || "\u2014"}</span></div>
                              <div className="flex justify-between"><span className="text-gray-500">Company</span><span className="text-gray-300">{userDetail.company || "\u2014"}</span></div>
                              <div className="flex justify-between"><span className="text-gray-500">Role</span><span className="text-gray-300">{userDetail.role || "\u2014"}</span></div>
                              <div className="flex justify-between"><span className="text-gray-500">Auth</span><span className="text-gray-300">{userDetail.oauth_provider || "email"}</span></div>
                              <div className="flex justify-between"><span className="text-gray-500">Joined</span><span className="text-gray-300">{userDetail.created_at ? new Date(userDetail.created_at).toLocaleDateString() : "\u2014"}</span></div>
                              <div className="flex justify-between"><span className="text-gray-500">Timezone</span><span className="text-gray-300">{userDetail.timezone || "\u2014"}</span></div>
                            </div>
                          </div>

                          {/* Query Stats */}
                          <div className="glass-card rounded-2xl p-5">
                            <h4 className="text-xs font-semibold text-gray-400 mb-2">Query Stats</h4>
                            <div className="grid grid-cols-2 gap-2 text-sm">
                              <div className="glass rounded-lg p-2 text-center">
                                <p className="text-lg font-bold text-indigo-400">{userDetail.query_stats?.total_queries || 0}</p>
                                <p className="text-xs text-gray-500">Total</p>
                              </div>
                              <div className="glass rounded-lg p-2 text-center">
                                <p className="text-lg font-bold text-green-400">{userDetail.query_stats?.queries_this_month || 0}</p>
                                <p className="text-xs text-gray-500">This Month</p>
                              </div>
                            </div>
                          </div>

                          {/* Plan Management (staged) */}
                          <div className={`glass-card rounded-2xl p-5 ${pendingChanges[userDetail.email]?.plan ? "border-amber-600" : ""}`}>
                            <h4 className="text-xs font-semibold text-gray-400 mb-2">Change Plan</h4>
                            <div className="flex items-center gap-2 mb-3">
                              <span className="text-sm text-gray-300">Current:</span>
                              <PlanBadge plan={userDetail.plan || "free"} />
                              {pendingChanges[userDetail.email]?.plan && (
                                <>
                                  <span className="text-xs text-gray-500">{"->"}</span>
                                  <PlanBadge plan={pendingChanges[userDetail.email].plan} />
                                  <span className="text-[10px] text-amber-400">(unsaved)</span>
                                </>
                              )}
                            </div>
                            <div className="flex flex-wrap gap-2">
                              {ALL_PLANS.map((p) => {
                                const currentPlan = userDetail.plan || "free";
                                const staged = pendingChanges[userDetail.email]?.plan;
                                const isActive = staged ? staged === p : currentPlan === p;
                                return (
                                  <MotionButton key={p} onClick={() => {
                                    if (p === currentPlan) { unstageChange(userDetail.email); } // revert to original
                                    else { stagePlanChange(userDetail.email, p); }
                                  }}
                                    className={`px-3 py-1.5 text-xs font-medium rounded-lg border transition cursor-pointer ${isActive ? "bg-blue-600 border-blue-500 text-white" : "border-gray-700 text-gray-400 hover:bg-gray-800"}`}>
                                    {p}
                                  </MotionButton>
                                );
                              })}
                            </div>
                            {pendingChanges[userDetail.email]?.plan && (
                              <button onClick={() => unstageChange(userDetail.email)} className="mt-2 text-xs text-gray-500 hover:text-gray-300 cursor-pointer">
                                Undo plan change
                              </button>
                            )}
                          </div>

                          {/* Delete / Undo Delete */}
                          <div className="glass-card border-red-900/30 rounded-2xl p-5 space-y-3">
                            {pendingChanges[userDetail.email]?.delete ? (
                              <div className="space-y-2">
                                <p className="text-xs text-red-400">This account is staged for deletion.</p>
                                <MotionButton onClick={() => unstageChange(userDetail.email)}
                                  className="px-4 py-2 text-sm font-medium text-gray-300 bg-gray-700 border border-gray-600 rounded-lg hover:bg-gray-600 transition cursor-pointer w-full">
                                  Undo Delete
                                </MotionButton>
                              </div>
                            ) : (
                              <MotionButton onClick={() => setConfirmModal({ type: "delete", email: userDetail.email })}
                                className="px-4 py-2 text-sm font-medium text-red-400 bg-red-900/20 border border-red-800/50 rounded-lg hover:bg-red-900/40 transition cursor-pointer w-full">
                                Delete User Account
                              </MotionButton>
                            )}
                          </div>
                        </motion.div>
                      ) : (
                        <motion.div key="no-user" {...slideFromRight} className="glass-card rounded-2xl p-8 text-center">
                          <p className="text-gray-600 text-sm">Select a user to view details</p>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                </div>

                {/* ── Confirmation Modal ── */}
                <AnimatePresence>
                  {confirmModal && (
                    <motion.div
                      key="confirmModal"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      transition={{ duration: 0.2 }}
                      className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50"
                    >
                      <motion.div
                        initial={{ opacity: 0, scale: 0.92, y: 20 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.92, y: 20 }}
                        transition={{ type: "spring", stiffness: 300, damping: 25 }}
                        className="glass-card rounded-2xl p-6 max-w-md w-full mx-4 shadow-2xl"
                      >
                        {confirmModal.type === "save" && (
                          <>
                            <h3 className="text-lg font-bold text-white mb-2">Confirm Save Changes</h3>
                            <p className="text-sm text-gray-400 mb-4">The following changes will be applied:</p>
                            <ul className="space-y-1 mb-6 text-sm">
                              {Object.entries(pendingChanges).map(([email, c]) => (
                                <li key={email} className="flex items-center gap-2">
                                  {c.delete ? (
                                    <><span className="w-2 h-2 rounded-full bg-red-500" /><span className="text-red-400">Delete {email}</span></>
                                  ) : (
                                    <><span className="w-2 h-2 rounded-full bg-amber-400" /><span className="text-gray-300">{email} plan {"->"}  <span className="text-indigo-400">{c.plan}</span></span></>
                                  )}
                                </li>
                              ))}
                            </ul>
                            <div className="flex gap-3">
                              <MotionButton onClick={() => setConfirmModal(null)} className="flex-1 px-4 py-2.5 text-sm font-medium text-gray-300 bg-gray-700 border border-gray-600 rounded-lg hover:bg-gray-600 transition cursor-pointer">Cancel</MotionButton>
                              <MotionButton onClick={saveAll} disabled={saving} className="flex-1 px-4 py-2.5 text-sm font-medium text-white bg-green-600 rounded-lg hover:bg-green-700 transition cursor-pointer disabled:opacity-50">
                                {saving ? "Saving..." : "Confirm & Save"}
                              </MotionButton>
                            </div>
                          </>
                        )}
                        {confirmModal.type === "delete" && (
                          <>
                            <h3 className="text-lg font-bold text-white mb-2">Stage Account Deletion</h3>
                            <p className="text-sm text-gray-400 mb-1">This will stage <span className="text-white font-medium">{confirmModal.email}</span> for deletion.</p>
                            <p className="text-xs text-gray-500 mb-6">Access will be revoked but data retained. The change won't apply until you click "Save All Changes".</p>
                            <div className="flex gap-3">
                              <MotionButton onClick={() => setConfirmModal(null)} className="flex-1 px-4 py-2.5 text-sm font-medium text-gray-300 bg-gray-700 border border-gray-600 rounded-lg hover:bg-gray-600 transition cursor-pointer">Cancel</MotionButton>
                              <MotionButton onClick={() => { stageDelete(confirmModal.email); setConfirmModal(null); }}
                                className="flex-1 px-4 py-2.5 text-sm font-medium text-white bg-red-600 rounded-lg hover:bg-red-700 transition cursor-pointer">
                                Stage for Deletion
                              </MotionButton>
                            </div>
                          </>
                        )}
                      </motion.div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>
            )}

            {/* SUPPORT TICKETS TAB */}
            {tab === "tickets" && (
              <motion.div key="tickets" {...tabTransition} className="space-y-4">
                {/* Ticket filters */}
                <div className="glass-card rounded-xl p-3">
                  <div className="flex items-center gap-3 flex-wrap">
                    <input type="text" placeholder="Search tickets..." value={ticketSearch} onChange={(e) => setTicketSearch(e.target.value)}
                      className="flex-1 min-w-[180px] glass-input rounded-lg px-3 py-1.5 text-sm text-white placeholder-gray-500 input-glow" />
                    <select value={ticketStatus} onChange={(e) => setTicketStatus(e.target.value)}
                      className="glass-input rounded-lg px-3 py-1.5 text-sm text-white cursor-pointer input-glow">
                      <option value="">All Status</option>
                      <option value="open">Open</option>
                      <option value="closed">Closed</option>
                    </select>
                    <select value={ticketCategory} onChange={(e) => setTicketCategory(e.target.value)}
                      className="glass-input rounded-lg px-3 py-1.5 text-sm text-white cursor-pointer input-glow">
                      <option value="">All Categories</option>
                      <option value="general">General</option>
                      <option value="bug">Bug</option>
                      <option value="feature">Feature</option>
                      <option value="billing">Billing</option>
                    </select>
                    <div className="flex items-center gap-2">
                      <input type="date" value={ticketDateFrom} onChange={(e) => setTicketDateFrom(e.target.value)}
                        className="glass-input rounded-lg px-2 py-1 text-xs text-white input-glow" />
                      <span className="text-xs text-gray-500">to</span>
                      <input type="date" value={ticketDateTo} onChange={(e) => setTicketDateTo(e.target.value)}
                        className="glass-input rounded-lg px-2 py-1 text-xs text-white input-glow" />
                    </div>
                    {(ticketSearch || ticketStatus || ticketCategory || ticketDateFrom || ticketDateTo) && (
                      <button onClick={() => { setTicketSearch(""); setTicketStatus(""); setTicketCategory(""); setTicketDateFrom(""); setTicketDateTo(""); }} className="text-xs text-red-400 hover:text-red-300 cursor-pointer">Clear</button>
                    )}
                  </div>
                </div>

                <h2 className="text-sm font-semibold text-gray-400">
                  {filteredTickets.length === tickets.length ? `${tickets.length} support tickets` : `${filteredTickets.length} of ${tickets.length} tickets`}
                </h2>
                {filteredTickets.length === 0 ? (
                  <div className="glass-card rounded-2xl p-8 text-center text-gray-600 text-sm">
                    {tickets.length === 0 ? "No support tickets yet" : "No tickets match filters"}
                  </div>
                ) : (
                  <StaggerContainer className="space-y-3">
                    {filteredTickets.map((t) => (
                      <StaggerItem key={t.id}>
                        <div className="glass-card rounded-2xl p-5">
                          <div className="flex items-center justify-between mb-2">
                            <div className="flex items-center gap-3">
                              <span className="text-xs font-mono text-gray-500">{t.id}</span>
                              <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${t.status === "open" ? "bg-green-500/20 text-green-400 border border-green-700" : "bg-gray-500/20 text-gray-400 border border-gray-700"}`}>
                                {t.status}
                              </span>
                              <span className="text-xs text-gray-600 border border-gray-700 px-2 py-0.5 rounded-full">{t.category}</span>
                            </div>
                            <span className="text-xs text-gray-600">{new Date(t.created_at).toLocaleDateString()}</span>
                          </div>
                          <h3 className="text-sm font-medium text-white">{t.subject}</h3>
                          <p className="text-xs text-gray-400 mt-1">{t.message}</p>
                          <p className="text-xs text-gray-600 mt-1">By: {t.created_by}</p>

                          {t.replies?.length > 0 && (
                            <div className="mt-3 space-y-2 border-t border-gray-800 pt-3">
                              {t.replies.map((r, i) => (
                                <div key={i} className="glass rounded-lg p-2">
                                  <p className="text-xs text-gray-300">{r.message}</p>
                                  <p className="text-xs text-gray-600 mt-1">{r.by} — {new Date(r.at).toLocaleString()}</p>
                                </div>
                              ))}
                            </div>
                          )}

                          {t.status === "open" && (
                            <div className="mt-3 flex gap-2">
                              <input type="text" placeholder="Reply..."
                                value={ticketReply[t.id] || ""}
                                onChange={(e) => setTicketReply((p) => ({ ...p, [t.id]: e.target.value }))}
                                className="flex-1 glass-input rounded-lg px-3 py-1.5 text-sm text-white input-glow"
                                onKeyDown={(e) => { if (e.key === "Enter") handleReplyTicket(t.id); }}
                              />
                              <MotionButton onClick={() => handleReplyTicket(t.id)} className="px-3 py-1.5 text-xs bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition cursor-pointer">Reply</MotionButton>
                              <MotionButton onClick={() => handleCloseTicket(t.id)} className="px-3 py-1.5 text-xs bg-gray-700 text-gray-300 rounded-lg hover:bg-gray-600 transition cursor-pointer">Close</MotionButton>
                            </div>
                          )}
                        </div>
                      </StaggerItem>
                    ))}
                  </StaggerContainer>
                )}
              </motion.div>
            )}

            {/* DELETED USERS TAB */}
            {tab === "deleted" && (
              <motion.div key="deleted" {...tabTransition} className="space-y-4">
                {/* Deleted user filters */}
                <div className="glass-card rounded-xl p-3">
                  <div className="flex items-center gap-3 flex-wrap">
                    <input type="text" placeholder="Search name or email..." value={deletedSearch} onChange={(e) => setDeletedSearch(e.target.value)}
                      className="flex-1 min-w-[180px] glass-input rounded-lg px-3 py-1.5 text-sm text-white placeholder-gray-500 input-glow" />
                    <select value={deletedBy} onChange={(e) => setDeletedBy(e.target.value)}
                      className="glass-input rounded-lg px-3 py-1.5 text-sm text-white cursor-pointer input-glow">
                      <option value="">All Sources</option>
                      <option value="self">Self-deleted</option>
                      <option value="admin">Admin-deleted</option>
                    </select>
                    <div className="flex items-center gap-2">
                      <input type="date" value={deletedDateFrom} onChange={(e) => setDeletedDateFrom(e.target.value)}
                        className="glass-input rounded-lg px-2 py-1 text-xs text-white input-glow" />
                      <span className="text-xs text-gray-500">to</span>
                      <input type="date" value={deletedDateTo} onChange={(e) => setDeletedDateTo(e.target.value)}
                        className="glass-input rounded-lg px-2 py-1 text-xs text-white input-glow" />
                    </div>
                    {(deletedSearch || deletedBy || deletedDateFrom || deletedDateTo) && (
                      <button onClick={() => { setDeletedSearch(""); setDeletedBy(""); setDeletedDateFrom(""); setDeletedDateTo(""); }} className="text-xs text-red-400 hover:text-red-300 cursor-pointer">Clear</button>
                    )}
                  </div>
                </div>

                <h2 className="text-sm font-semibold text-gray-400">
                  {filteredDeleted.length === deletedUsers.length ? `${deletedUsers.length} deleted accounts (data retained)` : `${filteredDeleted.length} of ${deletedUsers.length} deleted accounts`}
                </h2>
                {filteredDeleted.length === 0 ? (
                  <div className="glass-card rounded-2xl p-8 text-center text-gray-600 text-sm">
                    {deletedUsers.length === 0 ? "No deleted accounts" : "No accounts match filters"}
                  </div>
                ) : (
                  <StaggerContainer className="space-y-2">
                    {filteredDeleted.map((u) => (
                      <StaggerItem key={u.email}>
                        <div className="glass-card rounded-xl p-4">
                          <div className="flex items-center justify-between">
                            <div>
                              <p className="text-sm font-medium text-gray-400">{u.name || u.email}</p>
                              <p className="text-xs text-gray-600">{u.email}</p>
                              {u.phone && <p className="text-xs text-gray-600">{u.country_code} {u.phone}</p>}
                            </div>
                            <div className="text-right">
                              <p className="text-xs text-red-400">Deleted {u.deleted_at ? new Date(u.deleted_at).toLocaleDateString() : ""}</p>
                              <p className="text-xs text-gray-600">By: {u.deleted_by}</p>
                            </div>
                          </div>
                        </div>
                      </StaggerItem>
                    ))}
                  </StaggerContainer>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        )}
      </div>
    </div>
  );
}
