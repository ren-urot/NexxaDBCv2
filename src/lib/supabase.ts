import { createClient, type Session } from "@supabase/supabase-js";
import type { CardData, CardTheme, PaymentStatus } from "../types";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

export const supabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey);

export const supabase = supabaseConfigured
  ? createClient(supabaseUrl!, supabaseAnonKey!)
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
  method: "gcash" | "bank";
  payment_ref: string;
  notes: string;
  status: PaymentStatus;
  submitted_at: string;
  card: CardData;
  created_at: string;
}

export interface NewOrder {
  customer: string;
  email: string;
  template: CardTheme;
  amount: number;
  method: "gcash" | "bank";
  payment_ref: string;
  notes: string;
  card: CardData;
}

export async function fetchOrders(): Promise<OrderRow[]> {
  if (!supabase) return [];
  const { data, error } = await supabase.from("nexora_orders").select("*").order("created_at", { ascending: false });
  if (error) throw error;
  return data as OrderRow[];
}

export async function createOrder(order: NewOrder): Promise<OrderRow> {
  if (!supabase) throw new Error("Supabase is not configured");
  const { data, error } = await supabase
    .from("nexora_orders")
    .insert({ ...order, status: "submitted" })
    .select()
    .single();
  if (error) throw error;
  return data as OrderRow;
}

export async function updateOrderStatus(id: number, status: PaymentStatus): Promise<void> {
  if (!supabase) throw new Error("Supabase is not configured");
  const { error } = await supabase.from("nexora_orders").update({ status }).eq("id", id);
  if (error) throw error;
}
