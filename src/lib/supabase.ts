import { createClient, type Session } from "@supabase/supabase-js";
import type { CardData, CardTheme, PaymentStatus } from "../types";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

export const supabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey);

export const supabase = supabaseConfigured
  ? createClient(supabaseUrl!, supabaseAnonKey!, {
      // Force PostgREST to skip RETURNING on every insert/update unless a
      // call explicitly opts into it with .select(). Without this, whether
      // a mutation implicitly returns the row (and so gets checked against
      // the SELECT policy, not just the INSERT/UPDATE one) is left up to
      // the server's own default rather than this client's code: the anon
      // role here only has an INSERT policy, so a mutation call unlucky
      // enough to trigger that default fails RLS on the return, not the
      // write itself.
      global: { headers: { Prefer: "return=minimal" } },
    })
  : null;

export async function signIn(email: string, password: string): Promise<void> {
  if (!supabase) throw new Error("Supabase is not configured");
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
}

export async function signOut(): Promise<void> {
  if (!supabase) return;
  await supabase.auth.signOut();
}

export function getSession(): Promise<Session | null> {
  if (!supabase) return Promise.resolve(null);
  return supabase.auth.getSession().then(({ data }) => data.session);
}

export function onAuthChange(callback: (session: Session | null) => void): () => void {
  if (!supabase) return () => {};
  const { data } = supabase.auth.onAuthStateChange((_event, session) => callback(session));
  return () => data.subscription.unsubscribe();
}

export function getErrorMessage(err: unknown, fallback: string): string {
  if (err && typeof err === "object" && "message" in err && typeof err.message === "string") {
    return err.message;
  }
  return fallback;
}

export interface OrderRow {
  id: number;
  order_code: string;
  customer: string;
  email: string;
  template: CardTheme;
  amount: number;
  amount_usd: number;
  exchange_rate: number;
  method: "gcash" | "bank" | "wise";
  payment_ref: string;
  notes: string;
  status: PaymentStatus;
  submitted_at: string;
  card: CardData;
  created_at: string;
  parent_order_id: number | null;
  is_trial: boolean;
  trial_expires_at: string | null;
}

export interface NewOrder {
  customer: string;
  email: string;
  template: CardTheme;
  amount: number;
  amount_usd: number;
  exchange_rate: number;
  method: "gcash" | "bank" | "wise";
  payment_ref: string;
  notes: string;
  card: CardData;
  // Order code of any card in the family (root or an existing add-on
  // child) this new card should be attached to. Omit/null for a normal,
  // standalone order.
  parent_order_code?: string | null;
  // Free Trial signup: no payment required, auto-approved immediately,
  // gated again after TRIAL_DAYS unless upgraded via upgradeTrialOrder.
  is_trial?: boolean;
}

export async function fetchOrders(): Promise<OrderRow[]> {
  if (!supabase) return [];
  const { data, error } = await supabase.from("nexora_orders").select("*").order("created_at", { ascending: false });
  if (error) throw error;
  return data as OrderRow[];
}

// Creates the order via a SECURITY DEFINER RPC rather than a raw table
// insert, so it no longer depends on RLS policies or PostgREST return-
// preference defaults at all. Returns the generated order_code, used to
// build the customer's public card URL/QR right after submission.
export async function createOrder(order: NewOrder): Promise<string> {
  if (!supabase) throw new Error("Supabase is not configured");
  const { data, error } = await supabase.rpc("submit_order", {
    p_customer: order.customer,
    p_email: order.email,
    p_template: order.template,
    p_amount: order.amount,
    p_amount_usd: order.amount_usd,
    p_exchange_rate: order.exchange_rate,
    p_method: order.method,
    p_payment_ref: order.payment_ref,
    p_notes: order.notes,
    p_card: order.card,
    p_parent_order_code: order.parent_order_code ?? null,
    p_is_trial: order.is_trial ?? false,
  });
  if (error) throw error;
  return data as string;
}

export interface UpgradeOrder {
  order_code: string;
  template: CardTheme;
  amount: number;
  amount_usd: number;
  exchange_rate: number;
  method: "gcash" | "bank" | "wise";
  payment_ref: string;
  notes: string;
  card: CardData;
}

// Converts an existing Free Trial order into a real paid one, in place:
// same order_code, so any QR/link already handed out keeps working. Only
// ever succeeds against a row that's still is_trial = true server-side
// (see upgrade_trial_order in schema.sql).
export async function upgradeTrialOrder(order: UpgradeOrder): Promise<void> {
  if (!supabase) throw new Error("Supabase is not configured");
  const { error } = await supabase.rpc("upgrade_trial_order", {
    p_order_code: order.order_code,
    p_template: order.template,
    p_amount: order.amount,
    p_amount_usd: order.amount_usd,
    p_exchange_rate: order.exchange_rate,
    p_method: order.method,
    p_payment_ref: order.payment_ref,
    p_notes: order.notes,
    p_card: order.card,
  });
  if (error) throw error;
}

export async function updateOrderStatus(id: number, status: PaymentStatus): Promise<void> {
  if (!supabase) throw new Error("Supabase is not configured");
  const { error } = await supabase.from("nexora_orders").update({ status }).eq("id", id);
  if (error) throw error;
}

export async function deleteOrder(id: number): Promise<void> {
  if (!supabase) throw new Error("Supabase is not configured");
  // count: "exact" so a delete blocked by RLS (which affects 0 rows rather
  // than erroring, a real Postgres RLS gotcha, not a Supabase quirk) is
  // caught here instead of silently reporting success to the caller.
  const { error, count } = await supabase.from("nexora_orders").delete({ count: "exact" }).eq("id", id);
  if (error) throw error;
  if (!count) throw new Error("Delete did not affect any rows. Check the delete policy on nexora_orders.");
}

export interface OrderStatusLookup {
  status: PaymentStatus;
  order_code: string;
}

// Lets a customer poll their own order's status without a general SELECT
// policy: this calls a SECURITY DEFINER function that only returns a match
// for the exact payment_ref + email pair the customer themselves submitted.
export async function getOrderStatus(paymentRef: string, email: string): Promise<OrderStatusLookup | null> {
  if (!supabase) return null;
  const { data, error } = await supabase
    .rpc("get_order_status", { p_payment_ref: paymentRef, p_email: email })
    .maybeSingle();
  if (error) throw error;
  return data as OrderStatusLookup | null;
}

export interface PublicCardLookup {
  card: CardData;
  status: PaymentStatus;
  lead_gen_enabled: boolean;
  // True only for the original order in a card family, never true for an
  // add-on card added via "Add New Cards". Gates the Business-only
  // features (Add New Cards, Lead Generation, QR Transfer) to the
  // original Business plan purchaser only; a team member's card only
  // ever gets Pro-tier UI.
  is_root: boolean;
  is_trial: boolean;
  trial_expires_at: string | null;
}

// Powers the public "scan to view this card" page. SECURITY DEFINER on the
// server side means this works with no general SELECT policy needed.
export async function getPublicCard(orderCode: string): Promise<PublicCardLookup | null> {
  if (!supabase) return null;
  const { data, error } = await supabase.rpc("get_public_card", { p_order_code: orderCode }).maybeSingle();
  if (error) throw error;
  return data as PublicCardLookup | null;
}

export interface BusinessCardEntry {
  order_code: string;
  card: CardData;
  status: PaymentStatus;
  is_root: boolean;
  is_trial: boolean;
  trial_expires_at: string | null;
}

// Powers the Card Holder's "Add New Cards" family list. Accepts any
// order_code belonging to the family (the root order or one of its add-on
// children) and returns every card in it, root first. SECURITY DEFINER on
// the server side means this works with no general SELECT policy needed.
export async function getBusinessCards(orderCode: string): Promise<BusinessCardEntry[]> {
  if (!supabase) return [];
  const { data, error } = await supabase.rpc("get_business_cards", { p_order_code: orderCode });
  if (error) throw error;
  return (data ?? []) as BusinessCardEntry[];
}

// Toggles Business plan "Lead Generation" for an order. Same order-code-
// as-credential trust model as every other owner-only action in this app:
// there's no login for card owners, so knowing the order_code already
// stands in for proof of ownership everywhere else too.
export async function setLeadGenEnabled(orderCode: string, enabled: boolean): Promise<void> {
  if (!supabase) return;
  const { error } = await supabase.rpc("set_lead_gen", { p_order_code: orderCode, p_enabled: enabled });
  if (error) throw error;
}

// Submits a scanner's contact info to unlock a lead-gated card. SECURITY
// DEFINER: nexora_leads has no direct-table policies at all, anon or
// authenticated, so this RPC is the only way a lead ever gets written.
export async function submitLead(orderCode: string, contact: string, name = ""): Promise<void> {
  if (!supabase) return;
  const { error } = await supabase.rpc("submit_lead", { p_order_code: orderCode, p_contact: contact, p_name: name });
  if (error) throw error;
}

export interface LeadRow {
  id: number;
  contact: string;
  name: string;
  captured_at: string;
}

// Powers the owner's captured-leads list/CSV download. Resolves the family
// root server-side, so this returns leads captured on any add-on card in
// the family regardless of which card's order_code it's called with.
export async function getLeads(orderCode: string): Promise<LeadRow[]> {
  if (!supabase) return [];
  const { data, error } = await supabase.rpc("get_leads", { p_order_code: orderCode });
  if (error) throw error;
  return (data ?? []) as LeadRow[];
}

// Business plan "QR Transfer": moves a Card Holder's device-local data
// (collected cards + which orders this device owns) to a new phone via a
// short-lived, one-time token. See schema.sql for why no order_code or
// account is involved: it's a bearer token for a device's local data, not
// tied to any one card.
export async function createTransfer(payload: unknown): Promise<string> {
  if (!supabase) throw new Error("Supabase is not configured");
  const { data, error } = await supabase.rpc("create_transfer", { p_payload: payload });
  if (error) throw error;
  return data as string;
}

// Returns null if the token is unknown, already used, or expired (15
// minutes); claim_transfer deletes the row as part of reading it, so a
// token only ever works once.
export async function claimTransfer<T>(token: string): Promise<T | null> {
  if (!supabase) return null;
  const { data, error } = await supabase.rpc("claim_transfer", { p_token: token });
  if (error) throw error;
  return (data ?? null) as T | null;
}

// Landing page "Stay Connected" newsletter form. Independent of the
// per-card lead system (nexora_leads): these are site-wide inquiries for
// NexxaDBC itself. Resubmitting the same email is a silent no-op.
export async function subscribeEmail(email: string): Promise<void> {
  if (!supabase) return;
  const { error } = await supabase.rpc("subscribe_email", { p_email: email });
  if (error) throw error;
}

export interface OrderEventHandlers {
  onInsert?: (row: OrderRow) => void;
  onUpdate?: (row: OrderRow) => void;
  onDelete?: (oldRow: { id: number }) => void;
}

// Powers the Admin dashboard's live activity feed: new orders, status
// changes, and deletions, useful across multiple admins working the same
// dashboard at once, not just for catching brand-new submissions.
export function subscribeToOrderEvents(handlers: OrderEventHandlers): () => void {
  if (!supabase) return () => {};
  const channel = supabase
    .channel("nexora_orders_events")
    .on(
      "postgres_changes",
      { event: "INSERT", schema: "public", table: "nexora_orders" },
      (payload) => handlers.onInsert?.(payload.new as OrderRow)
    )
    .on(
      "postgres_changes",
      { event: "UPDATE", schema: "public", table: "nexora_orders" },
      (payload) => handlers.onUpdate?.(payload.new as OrderRow)
    )
    .on(
      "postgres_changes",
      { event: "DELETE", schema: "public", table: "nexora_orders" },
      (payload) => handlers.onDelete?.(payload.old as { id: number })
    )
    .subscribe();
  return () => {
    supabase!.removeChannel(channel);
  };
}
