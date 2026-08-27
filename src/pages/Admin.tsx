import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import type { Order, PaymentStatus } from "../types";
import BusinessCard from "../components/BusinessCard";
import Logo from "../components/Logo";
import { fetchOrders, updateOrderStatus, supabaseConfigured, getErrorMessage, type OrderRow } from "../lib/supabase";

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
    method: row.method,
    paymentRef: row.payment_ref,
    status: row.status,
    submittedAt: row.submitted_at.slice(0, 16).replace("T", " "),
    card: row.card,
  };
}

type AdminTab = "dashboard" | "orders" | "payment" | "provisioning";

export default function Admin() {
  const navigate = useNavigate();
  const [tab, setTab] = useState<AdminTab>("dashboard");
  const [orders, setOrders] = useState<AdminOrder[]>([]);
  const [selected, setSelected] = useState<AdminOrder | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

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

  const updateStatus = async (order: AdminOrder, status: PaymentStatus) => {
    const previous = order.status;
    setOrders((os) => os.map((o) => (o.rowId === order.rowId ? { ...o, status } : o)));
    if (selected?.rowId === order.rowId) setSelected((s) => (s ? { ...s, status } : s));
    try {
      await updateOrderStatus(order.rowId, status);
    } catch (err) {
      setOrders((os) => os.map((o) => (o.rowId === order.rowId ? { ...o, status: previous } : o)));
      if (selected?.rowId === order.rowId) setSelected((s) => (s ? { ...s, status: previous } : s));
      alert(getErrorMessage(err, "Failed to update order status."));
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
        <div className="w-20" />
      </header>

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
                  <h2 className="text-2xl tracking-tight text-[var(--color-foreground)] mb-8">
                    Orders
                  </h2>
                  <div className="border border-[var(--color-border)] overflow-x-auto">
                    <div className="min-w-[640px] divide-y divide-[var(--color-border)]">
                      <div className="grid grid-cols-6 px-5 py-2 text-[10px] tracking-widest uppercase text-[var(--color-muted-fg)] bg-[var(--color-muted)]">
                        <span>Order</span>
                        <span>Customer</span>
                        <span>Template</span>
                        <span>Method</span>
                        <span>Amount</span>
                        <span>Status</span>
                      </div>
                      {orders.map((o) => (
                        <button
                          key={o.rowId}
                          onClick={() => setSelected(o)}
                          className="w-full grid grid-cols-6 px-5 py-4 text-xs text-left hover:bg-[var(--color-muted)] transition-colors"
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
                          ["Amount", `₱${selected.amount}`],
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
