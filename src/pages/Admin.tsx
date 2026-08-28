import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Trash2, Download, Bell, BellOff } from "lucide-react";
import type { Order, PaymentStatus } from "../types";
import BusinessCard from "../components/BusinessCard";
import Logo from "../components/Logo";
import {
  fetchOrders,
  updateOrderStatus,
  deleteOrder,
  supabaseConfigured,
  getErrorMessage,
  signIn,
  signOut,
  getSession,
  onAuthChange,
  subscribeToOrderEvents,
  type OrderRow,
} from "../lib/supabase";

const STATUS_LABELS: Record<PaymentStatus, string> = {
  pending: "Pending Payment",
  submitted: "Payment Submitted",
  under_verification: "Under Verification",
  approved: "Approved",
  rejected: "Rejected",
  provisioned: "Provisioned",
};

const STATUS_COLORS: Record<PaymentStatus, string> = {
  pending: "text-stone-400 border-stone-200",
  submitted: "text-amber-500 border-amber-200",
  under_verification: "text-blue-500 border-blue-200",
  approved: "text-green-600 border-green-200",
  rejected: "text-red-500 border-red-200",
  provisioned: "text-violet-600 border-violet-200",
};

function csvEscape(value: string | number): string {
  const s = String(value);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function downloadOrdersCsv(orders: AdminOrder[]) {
  const headers = [
    "Order ID",
    "Customer",
    "Email",
    "Template",
    "Amount PHP",
    "Amount USD",
    "Exchange Rate",
    "Method",
    "Payment Ref",
    "Status",
    "Submitted At",
  ];
  const rows = orders.map((o) => [
    o.id,
    o.customer,
    o.email,
    o.template,
    o.amount,
    o.amountUsd.toFixed(2),
    o.exchangeRate,
    o.method.toUpperCase(),
    o.paymentRef,
    STATUS_LABELS[o.status],
    o.submittedAt,
  ]);
  const csv = [headers, ...rows].map((row) => row.map(csvEscape).join(",")).join("\r\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `nexxadbc-orders-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

interface AdminOrder extends Order {
  rowId: number;
}

function toAdminOrder(row: OrderRow): AdminOrder {
  return {
    rowId: row.id,
    id: row.order_code,
    customer: row.customer,
    email: row.email,
    template: row.template,
    amount: row.amount,
    amountUsd: row.amount_usd,
    exchangeRate: row.exchange_rate,
    method: row.method,
    paymentRef: row.payment_ref,
    status: row.status,
    submittedAt: row.submitted_at.slice(0, 16).replace("T", " "),
    card: row.card,
  };
}

type AdminTab = "dashboard" | "orders" | "payment" | "provisioning";

function LoginForm({ onSignedIn }: { onSignedIn: () => void }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await signIn(email, password);
      onSignedIn();
    } catch (err) {
      setError(getErrorMessage(err, "Sign in failed. Check your email and password."));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-6" style={{ fontFamily: "var(--font-sans)" }}>
      <form onSubmit={handleSubmit} className="w-full max-w-sm border border-[var(--color-border)] p-8">
        <div className="text-[10px] tracking-widest uppercase text-[var(--color-muted-fg)] mb-1">Admin Access</div>
        <h1 className="text-xl text-[var(--color-foreground)] mb-8">Sign in to continue</h1>
        <div className="space-y-4 mb-6">
          <div>
            <label htmlFor="admin-email" className="block text-[10px] tracking-widest uppercase text-[var(--color-muted-fg)] mb-1.5">Email</label>
            <input
              id="admin-email"
              name="email"
              type="email"
              autoComplete="username"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full text-sm bg-white border border-[var(--color-border)] px-3 py-2.5 focus:outline-none focus:border-[var(--color-accent)] transition-colors"
            />
          </div>
          <div>
            <label htmlFor="admin-password" className="block text-[10px] tracking-widest uppercase text-[var(--color-muted-fg)] mb-1.5">Password</label>
            <input
              id="admin-password"
              name="password"
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full text-sm bg-white border border-[var(--color-border)] px-3 py-2.5 focus:outline-none focus:border-[var(--color-accent)] transition-colors"
            />
          </div>
        </div>
        {error && <div className="text-[10px] text-red-500 mb-4">{error}</div>}
        <button
          type="submit"
          disabled={submitting}
          className="w-full bg-[var(--color-foreground)] text-[var(--color-background)] text-xs tracking-widest uppercase py-3 hover:bg-[var(--color-accent)] transition-colors disabled:opacity-40"
        >
          {submitting ? "Signing in…" : "Sign In"}
        </button>
      </form>
    </div>
  );
}

export default function Admin() {
  const [authStatus, setAuthStatus] = useState<"loading" | "signed-out" | "signed-in">("loading");

  useEffect(() => {
    if (!supabaseConfigured) {
      // No backend to authenticate against — fall through to the dashboard,
      // which already shows its own "backend not configured" warning.
      setAuthStatus("signed-in");
      return;
    }
    getSession().then((session) => setAuthStatus(session ? "signed-in" : "signed-out"));
    const unsubscribe = onAuthChange((session) => setAuthStatus(session ? "signed-in" : "signed-out"));
    return unsubscribe;
  }, []);

  if (authStatus === "loading") {
    return <div className="min-h-screen flex items-center justify-center text-xs text-[var(--color-muted-fg)]">Loading…</div>;
  }

  if (authStatus === "signed-out") {
    return <LoginForm onSignedIn={() => setAuthStatus("signed-in")} />;
  }

  return <AdminDashboard />;
}

function AdminDashboard() {
  const navigate = useNavigate();
  const [tab, setTab] = useState<AdminTab>("dashboard");
  const [orders, setOrders] = useState<AdminOrder[]>([]);
  const [selected, setSelected] = useState<AdminOrder | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [activityAlert, setActivityAlert] = useState<string | null>(null);
  const [notifPermission, setNotifPermission] = useState<NotificationPermission | "unsupported">(
    typeof Notification === "undefined" ? "unsupported" : Notification.permission
  );
  // Actions this admin session just performed — used to skip alerting on our
  // own realtime echo (e.g. clicking Approve shouldn't also pop a "status
  // changed" notice for the action you just took yourself).
  const selfActionIds = useRef<Set<number>>(new Set());

  useEffect(() => {
    if (!supabaseConfigured) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    fetchOrders()
      .then((rows) => {
        if (cancelled) return;
        setOrders(rows.map(toAdminOrder));
        setLoadError(null);
      })
      .catch((err) => {
        if (cancelled) return;
        setLoadError(getErrorMessage(err, "Failed to load orders."));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Live activity feed: new orders, status changes, and deletions — from
  // this admin's own actions AND from any other admin using the dashboard
  // at the same time.
  useEffect(() => {
    if (!supabaseConfigured) return;

    const notify = (title: string, body: string) => {
      if (typeof Notification !== "undefined" && Notification.permission === "granted") {
        new Notification(title, { body });
      }
    };

    const unsubscribe = subscribeToOrderEvents({
      onInsert: (row) => {
        const order = toAdminOrder(row);
        setOrders((os) => (os.some((o) => o.rowId === order.rowId) ? os : [order, ...os]));
        setActivityAlert(`🔔 New order submitted for approval — ${order.customer} · ${order.id} · ₱${order.amount}`);
        notify("New order submitted", `${order.customer} · ${order.id} · ₱${order.amount}`);
      },
      onUpdate: (row) => {
        if (selfActionIds.current.has(row.id)) {
          selfActionIds.current.delete(row.id);
          return;
        }
        const order = toAdminOrder(row);
        setOrders((os) => os.map((o) => (o.rowId === order.rowId ? order : o)));
        if (selected?.rowId === order.rowId) setSelected(order);
        setActivityAlert(`✓ ${order.id} status changed to ${STATUS_LABELS[order.status]} (by another admin)`);
        notify("Order updated", `${order.id} → ${STATUS_LABELS[order.status]}`);
      },
      onDelete: (oldRow) => {
        if (selfActionIds.current.has(oldRow.id)) {
          selfActionIds.current.delete(oldRow.id);
          return;
        }
        setOrders((os) => os.filter((o) => o.rowId !== oldRow.id));
        if (selected?.rowId === oldRow.id) setSelected(null);
        setActivityAlert(`🗑 An order was deleted by another admin`);
        notify("Order deleted", "An order was removed by another admin");
      },
    });
    return unsubscribe;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!activityAlert) return;
    const timer = setTimeout(() => setActivityAlert(null), 8000);
    return () => clearTimeout(timer);
  }, [activityAlert]);

  const requestNotifPermission = () => {
    if (typeof Notification === "undefined") return;
    Notification.requestPermission().then(setNotifPermission);
  };

  const updateStatus = async (order: AdminOrder, status: PaymentStatus) => {
    const previous = order.status;
    selfActionIds.current.add(order.rowId);
    setOrders((os) => os.map((o) => (o.rowId === order.rowId ? { ...o, status } : o)));
    if (selected?.rowId === order.rowId) setSelected((s) => (s ? { ...s, status } : s));
    try {
      await updateOrderStatus(order.rowId, status);
    } catch (err) {
      selfActionIds.current.delete(order.rowId);
      setOrders((os) => os.map((o) => (o.rowId === order.rowId ? { ...o, status: previous } : o)));
      if (selected?.rowId === order.rowId) setSelected((s) => (s ? { ...s, status: previous } : s));
      alert(getErrorMessage(err, "Failed to update order status."));
    }
  };

  const [deletingId, setDeletingId] = useState<number | null>(null);

  const handleDeleteOrder = async (order: AdminOrder) => {
    if (!confirm(`Delete order ${order.id} (${order.customer})? This can't be undone.`)) return;
    setDeletingId(order.rowId);
    selfActionIds.current.add(order.rowId);
    try {
      await deleteOrder(order.rowId);
      setOrders((os) => os.filter((o) => o.rowId !== order.rowId));
      if (selected?.rowId === order.rowId) setSelected(null);
    } catch (err) {
      selfActionIds.current.delete(order.rowId);
      alert(getErrorMessage(err, "Failed to delete order."));
    } finally {
      setDeletingId(null);
    }
  };

  const counts = {
    total: orders.length,
    pending: orders.filter((o) => o.status === "submitted" || o.status === "under_verification").length,
    approved: orders.filter((o) => o.status === "approved").length,
    provisioned: orders.filter((o) => o.status === "provisioned").length,
    revenue: orders.filter((o) => o.status !== "rejected").reduce((sum, o) => sum + o.amount, 0),
  };

  return (
    <div className="min-h-screen flex flex-col" style={{ fontFamily: "var(--font-sans)" }}>
      {/* Header */}
      <header className="border-b border-[var(--color-border)] px-8 py-4 flex items-center justify-between">
        <button onClick={() => navigate("/")} className="hover:opacity-70 transition-opacity">
          <Logo height={18} />
        </button>
        <div className="text-[10px] tracking-widest uppercase text-[var(--color-muted-fg)]">Admin Dashboard</div>
        {supabaseConfigured ? (
          <div className="flex items-center gap-4">
            <button
              onClick={notifPermission === "default" ? requestNotifPermission : undefined}
              disabled={notifPermission !== "default"}
              title={
                notifPermission === "granted"
                  ? "Notifications enabled"
                  : notifPermission === "denied"
                  ? "Notifications blocked — enable them in your browser's site settings"
                  : notifPermission === "unsupported"
                  ? "Notifications aren't supported in this browser"
                  : "Enable browser notifications for new orders and admin activity"
              }
              className={`flex items-center justify-center w-7 h-7 rounded-full transition-colors ${
                notifPermission === "granted"
                  ? "text-[var(--color-accent)]"
                  : notifPermission === "default"
                  ? "text-[var(--color-muted-fg)] hover:text-[var(--color-foreground)] cursor-pointer"
                  : "text-[var(--color-muted-fg)] opacity-40 cursor-not-allowed"
              }`}
            >
              {notifPermission === "denied" || notifPermission === "unsupported" ? (
                <BellOff size={16} />
              ) : (
                <Bell size={16} />
              )}
            </button>
            <button
              onClick={() => signOut()}
              className="text-[10px] tracking-widest uppercase text-[var(--color-muted-fg)] hover:text-[var(--color-foreground)] transition-colors"
            >
              Sign Out
            </button>
          </div>
        ) : (
          <div className="w-20" />
        )}
      </header>

      {activityAlert && (
        <div className="text-[10px] text-green-800 bg-green-50 border-b border-green-200 px-8 py-2.5 flex items-center justify-between">
          <span>{activityAlert}</span>
          <button onClick={() => setActivityAlert(null)} className="text-green-800 hover:opacity-60 transition-opacity ml-4">
            Dismiss
          </button>
        </div>
      )}

      {!supabaseConfigured && (
        <div className="text-[10px] text-amber-700 bg-amber-50 border-b border-amber-200 px-8 py-2 text-center">
          Backend not configured — showing no orders. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to connect.
        </div>
      )}
      {loadError && (
        <div className="text-[10px] text-red-700 bg-red-50 border-b border-red-200 px-8 py-2 text-center">
          {loadError}
        </div>
      )}

      <div className="flex-1 flex flex-col lg:flex-row">
        {/* Sidebar */}
        <aside className="w-full lg:w-48 border-b lg:border-b-0 lg:border-r border-[var(--color-border)] p-3 lg:p-4 flex flex-row lg:flex-col gap-1 overflow-x-auto">
          {(
            [
              { id: "dashboard", label: "Dashboard" },
              { id: "orders", label: "Orders" },
              { id: "payment", label: "Payment Verify" },
              { id: "provisioning", label: "Provisioning" },
            ] as { id: AdminTab; label: string }[]
          ).map((t) => (
            <button
              key={t.id}
              onClick={() => {
                setTab(t.id);
                setSelected(null);
              }}
              className={`text-left text-xs px-3 py-2.5 rounded-[7px] lg:rounded-none whitespace-nowrap shrink-0 transition-colors ${
                tab === t.id
                  ? "bg-[var(--color-foreground)] text-[var(--color-background)]"
                  : "text-[var(--color-muted-fg)] hover:text-[var(--color-foreground)] hover:bg-[var(--color-muted)]"
              }`}
            >
              {t.label}
            </button>
          ))}
        </aside>

        {/* Main */}
        <main className="flex-1 overflow-y-auto p-4 lg:p-8">
          {loading ? (
            <div className="text-xs text-[var(--color-muted-fg)]">Loading orders…</div>
          ) : (
            <>
              {tab === "dashboard" && (
                <div>
                  <h2 className="text-2xl tracking-tight text-[var(--color-foreground)] mb-8">
                    Overview
                  </h2>
                  <div className="grid grid-cols-2 lg:grid-cols-4 gap-px bg-[var(--color-border)] mb-10">
                    {[
                      { label: "Total Orders", value: counts.total },
                      { label: "Pending Verification", value: counts.pending },
                      { label: "Approved", value: counts.approved },
                      { label: "Revenue (₱)", value: `₱${counts.revenue.toLocaleString()}` },
                    ].map((stat) => (
                      <div key={stat.label} className="bg-[var(--color-background)] p-6">
                        <div className="text-[10px] tracking-widest uppercase text-[var(--color-muted-fg)] mb-2">{stat.label}</div>
                        <div className="text-3xl font-light text-[var(--color-foreground)]">
                          {stat.value}
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Recent orders */}
                  <div className="text-[10px] tracking-widest uppercase text-[var(--color-muted-fg)] mb-4">Recent Orders</div>
                  <div className="border border-[var(--color-border)] divide-y divide-[var(--color-border)]">
                    {orders.slice(0, 4).map((o) => (
                      <div key={o.rowId} className="flex items-center justify-between px-5 py-4 hover:bg-[var(--color-muted)] transition-colors">
                        <div>
                          <div className="text-xs font-semibold text-[var(--color-foreground)]">{o.customer}</div>
                          <div className="text-[10px] text-[var(--color-muted-fg)]">{o.id} · {o.template} · {o.submittedAt}</div>
                        </div>
                        <div className={`text-[10px] tracking-widest uppercase border px-2 py-1 ${STATUS_COLORS[o.status]}`}>
                          {STATUS_LABELS[o.status]}
                        </div>
                      </div>
                    ))}
                    {orders.length === 0 && (
                      <div className="px-5 py-8 text-[10px] text-[var(--color-muted-fg)]">No orders yet.</div>
                    )}
                  </div>
                </div>
              )}

              {tab === "orders" && (
                <div>
                  <div className="flex items-center justify-between mb-8">
                    <h2 className="text-2xl tracking-tight text-[var(--color-foreground)]">
                      Orders
                    </h2>
                    <button
                      onClick={() => downloadOrdersCsv(orders)}
                      disabled={orders.length === 0}
                      className="flex items-center gap-1.5 text-[10px] tracking-widest uppercase text-[var(--color-muted-fg)] border border-[var(--color-border)] px-3 py-2 hover:border-[var(--color-foreground)] hover:text-[var(--color-foreground)] transition-colors disabled:opacity-40"
                    >
                      <Download size={12} /> Download CSV
                    </button>
                  </div>
                  <div className="border border-[var(--color-border)] overflow-x-auto">
                    <div className="min-w-[640px] divide-y divide-[var(--color-border)]">
                      <div className="grid grid-cols-[repeat(6,1fr)_auto] px-5 py-2 text-[10px] tracking-widest uppercase text-[var(--color-muted-fg)] bg-[var(--color-muted)]">
                        <span>Order</span>
                        <span>Customer</span>
                        <span>Template</span>
                        <span>Method</span>
                        <span>Amount</span>
                        <span>Status</span>
                        <span className="w-7" />
                      </div>
                      {orders.map((o) => (
                        <div key={o.rowId} className="w-full grid grid-cols-[repeat(6,1fr)_auto] items-center hover:bg-[var(--color-muted)] transition-colors">
                          <button
                            onClick={() => setSelected(o)}
                            className="col-span-6 grid grid-cols-6 px-5 py-4 text-xs text-left"
                          >
                            <span className="font-mono text-[var(--color-muted-fg)]">{o.id}</span>
                            <span className="text-[var(--color-foreground)] font-medium">{o.customer}</span>
                            <span className="capitalize text-[var(--color-muted-fg)]">{o.template}</span>
                            <span className="uppercase text-[var(--color-muted-fg)]">{o.method}</span>
                            <span className="text-[var(--color-foreground)]">₱{o.amount}</span>
                            <span className={`text-[10px] border px-2 py-0.5 w-fit ${STATUS_COLORS[o.status]}`}>
                              {STATUS_LABELS[o.status]}
                            </span>
                          </button>
                          <button
                            onClick={() => handleDeleteOrder(o)}
                            disabled={deletingId === o.rowId}
                            className="w-7 h-7 mr-4 flex items-center justify-center text-[var(--color-muted-fg)] hover:text-red-500 transition-colors disabled:opacity-40"
                            title="Delete order"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      ))}
                      {orders.length === 0 && (
                        <div className="px-5 py-8 text-[10px] text-[var(--color-muted-fg)]">No orders yet.</div>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {tab === "payment" && (
                <div className={selected ? "grid grid-cols-1 lg:grid-cols-2 gap-8" : ""}>
                  <div>
                    <h2 className="text-2xl tracking-tight text-[var(--color-foreground)] mb-8">
                      Payment Verification
                    </h2>
                    <div className="border border-[var(--color-border)] divide-y divide-[var(--color-border)]">
                      {orders
                        .filter((o) => ["submitted", "under_verification"].includes(o.status))
                        .map((o) => (
                          <button
                            key={o.rowId}
                            onClick={() => setSelected(o)}
                            className={`w-full px-5 py-4 text-left transition-colors ${selected?.rowId === o.rowId ? "bg-[var(--color-muted)]" : "hover:bg-[var(--color-muted)]"}`}
                          >
                            <div className="flex items-center justify-between">
                              <div>
                                <div className="text-xs font-semibold text-[var(--color-foreground)]">{o.customer}</div>
                                <div className="text-[10px] text-[var(--color-muted-fg)] mt-0.5">{o.id} · {o.method.toUpperCase()} · {o.submittedAt}</div>
                              </div>
                              <div className={`text-[10px] border px-2 py-1 ${STATUS_COLORS[o.status]}`}>
                                {STATUS_LABELS[o.status]}
                              </div>
                            </div>
                          </button>
                        ))}
                      {orders.filter((o) => ["submitted", "under_verification"].includes(o.status)).length === 0 && (
                        <div className="px-5 py-8 text-[10px] text-[var(--color-muted-fg)]">No pending payments.</div>
                      )}
                    </div>
                  </div>

                  {selected && (
                    <div>
                      <div className="text-[10px] tracking-widest uppercase text-[var(--color-muted-fg)] mb-4">Order Detail</div>
                      <div className="border border-[var(--color-border)] divide-y divide-[var(--color-border)] mb-5">
                        {[
                          ["Order ID", selected.id],
                          ["Customer", selected.customer],
                          ["Email", selected.email],
                          ["Template", selected.template],
                          ["Amount", `₱${selected.amount} (~$${selected.amountUsd.toFixed(2)} USD @ ${selected.exchangeRate})`],
                          ["Method", selected.method.toUpperCase()],
                          ["Ref #", selected.paymentRef || "Not submitted"],
                          ["Submitted", selected.submittedAt],
                        ].map(([k, v]) => (
                          <div key={k} className="flex px-4 py-2.5 text-xs">
                            <span className="w-20 text-[var(--color-muted-fg)] flex-shrink-0">{k}</span>
                            <span className="text-[var(--color-foreground)] flex-1 min-w-0 break-words">{v}</span>
                          </div>
                        ))}
                        <div className="flex px-4 py-2.5 text-xs items-center">
                          <span className="w-20 text-[var(--color-muted-fg)] flex-shrink-0">Status</span>
                          <span className={`text-[10px] tracking-widest uppercase border px-2 py-1 w-fit ${STATUS_COLORS[selected.status]}`}>
                            {STATUS_LABELS[selected.status]}
                          </span>
                        </div>
                      </div>

                      <div className="text-[10px] tracking-widest uppercase text-[var(--color-muted-fg)] mb-3">Card Preview</div>
                      <div className="mb-5">
                        <BusinessCard data={selected.card} size="sm" />
                      </div>

                      {["submitted", "under_verification"].includes(selected.status) ? (
                        <div className="flex gap-2">
                          <button
                            onClick={() => updateStatus(selected, "approved")}
                            className="flex-1 bg-green-600 text-white text-[10px] tracking-widest uppercase py-3 hover:bg-green-700 transition-colors"
                          >
                            Approve
                          </button>
                          <button
                            onClick={() => updateStatus(selected, "rejected")}
                            className="flex-1 border border-red-200 text-red-500 text-[10px] tracking-widest uppercase py-3 hover:bg-red-50 transition-colors"
                          >
                            Reject
                          </button>
                        </div>
                      ) : (
                        <div className={`text-[10px] tracking-widest uppercase text-center py-3 border ${STATUS_COLORS[selected.status]}`}>
                          {selected.status === "approved" && "✓ Approved"}
                          {selected.status === "rejected" && "✕ Rejected"}
                          {selected.status === "provisioned" && "✓ Provisioned"}
                          {selected.status === "pending" && "Awaiting customer payment"}
                        </div>
                      )}

                      <button
                        onClick={() => handleDeleteOrder(selected)}
                        disabled={deletingId === selected.rowId}
                        className="w-full mt-2 flex items-center justify-center gap-1.5 text-[10px] tracking-widest uppercase text-[var(--color-muted-fg)] py-2.5 hover:text-red-500 transition-colors disabled:opacity-40"
                      >
                        <Trash2 size={12} /> Delete Order
                      </button>
                    </div>
                  )}
                </div>
              )}

              {tab === "provisioning" && (
                <div>
                  <h2 className="text-2xl tracking-tight text-[var(--color-foreground)] mb-8">
                    Provisioning
                  </h2>
                  <div className="border border-[var(--color-border)] divide-y divide-[var(--color-border)]">
                    {orders
                      .filter((o) => o.status === "approved" || o.status === "provisioned")
                      .map((o) => (
                        <div key={o.rowId} className="flex items-center justify-between px-5 py-5">
                          <div>
                            <div className="text-xs font-semibold text-[var(--color-foreground)]">{o.customer}</div>
                            <div className="text-[10px] text-[var(--color-muted-fg)] mt-0.5">{o.id} · {o.email}</div>
                          </div>
                          <div className="flex items-center gap-3">
                            <div className={`text-[10px] border px-2 py-1 ${STATUS_COLORS[o.status]}`}>
                              {STATUS_LABELS[o.status]}
                            </div>
                            {o.status === "approved" && (
                              <button
                                onClick={() => updateStatus(o, "provisioned")}
                                className="text-[10px] tracking-widest uppercase bg-[var(--color-foreground)] text-[var(--color-background)] px-4 py-2 hover:bg-[var(--color-accent)] transition-colors"
                              >
                                Generate QR
                              </button>
                            )}
                            {o.status === "provisioned" && (
                              <button className="text-[10px] tracking-widest uppercase border border-[var(--color-border)] px-4 py-2 text-[var(--color-muted-fg)] hover:border-[var(--color-foreground)] transition-colors">
                                Regenerate QR
                              </button>
                            )}
                          </div>
                        </div>
                      ))}
                    {orders.filter((o) => ["approved", "provisioned"].includes(o.status)).length === 0 && (
                      <div className="px-5 py-8 text-[10px] text-[var(--color-muted-fg)]">No approved orders yet.</div>
                    )}
                  </div>
                </div>
              )}
            </>
          )}
        </main>
      </div>
    </div>
  );
}
