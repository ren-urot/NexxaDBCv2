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
      // the server's own default rather than this client's code — the anon
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
  });
  if (error) throw error;
  return data as string;
}

export async function updateOrderStatus(id: number, status: PaymentStatus): Promise<void> {
  if (!supabase) throw new Error("Supabase is not configured");
  const { error } = await supabase.from("nexora_orders").update({ status }).eq("id", id);
  if (error) throw error;
}

export async function deleteOrder(id: number): Promise<void> {
  if (!supabase) throw new Error("Supabase is not configured");
  // count: "exact" so a delete blocked by RLS (which affects 0 rows rather
  // than erroring — a real Postgres RLS gotcha, not a Supabase quirk) is
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

export interface OrderEventHandlers {
  onInsert?: (row: OrderRow) => void;
  onUpdate?: (row: OrderRow) => void;
  onDelete?: (oldRow: { id: number }) => void;
}

// Powers the Admin dashboard's live activity feed: new orders, status
// changes, and deletions — useful across multiple admins working the same
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
