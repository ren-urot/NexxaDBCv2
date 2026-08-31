// Delivers a real Web Push notification to the admin's own device(s)
// when a new order needs approval, so the admin doesn't need to keep
// the Admin dashboard tab open to find out (see the "Admin PWA" work,
// 2026-08-31). Called client-side, best-effort, right after
// submit_order/upgrade_trial_order succeeds -- callable by anon (a real
// customer's own browser, not an authenticated admin session), since
// that's who actually submits an order. Never trusts client-supplied
// notification content: looks up the real order server-side by
// order_code and only sends if it genuinely needs approval (status =
// 'submitted'), so a spammed/replayed call can at most re-notify about
// a real pending order, never fabricate one or leak anything about an
// order that already auto-approved.
import { createClient } from "npm:@supabase/supabase-js@2";
import webpush from "npm:web-push@3";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const vapidPublicKey = Deno.env.get("VAPID_PUBLIC_KEY")!;
const vapidPrivateKey = Deno.env.get("VAPID_PRIVATE_KEY")!;
const vapidSubject = Deno.env.get("VAPID_SUBJECT") ?? "mailto:support@nexxadbc.com";

webpush.setVapidDetails(vapidSubject, vapidPublicKey, vapidPrivateKey);

const supabase = createClient(supabaseUrl, serviceRoleKey);

const corsHeaders = {
  "Access-Control-Allow-Origin": "https://nexxadbc.com",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, prefer, x-supabase-api-version",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405, headers: corsHeaders });
  }

  let payload: { order_code?: string };
  try {
    payload = await req.json();
  } catch {
    return new Response("Invalid JSON body", { status: 400, headers: corsHeaders });
  }

  const { order_code } = payload;
  if (!order_code) {
    return new Response("Missing order_code", { status: 400, headers: corsHeaders });
  }

  const { data: order } = await supabase
    .from("nexora_orders")
    .select("customer, amount, method, status")
    .eq("order_code", order_code)
    .maybeSingle();

  if (!order || order.status !== "submitted") {
    // Not an error from the caller's perspective -- either the order
    // doesn't exist, or it auto-approved and genuinely doesn't need an
    // admin alert (a free trial signup, a free Business family slot,
    // etc). Either way there's nothing to send.
    return new Response(JSON.stringify({ sent: 0 }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const { data: subs } = await supabase
    .from("nexora_admin_push_subscriptions")
    .select("id, endpoint, p256dh, auth");

  if (!subs || subs.length === 0) {
    return new Response(JSON.stringify({ sent: 0 }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const notificationPayload = JSON.stringify({
    title: "New order needs approval",
    body: `${order.customer} · ${order_code} · ₱${order.amount} (${order.method.toUpperCase()})`,
    url: "/admin",
  });

  let sent = 0;
  await Promise.all(
    subs.map(async (sub) => {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          notificationPayload
        );
        sent++;
      } catch (err) {
        // 404/410 means the browser has permanently invalidated this
        // subscription (uninstalled, permission revoked, etc.) -- prune
        // it so future sends don't keep paying for a dead endpoint.
        const statusCode = (err as { statusCode?: number }).statusCode;
        if (statusCode === 404 || statusCode === 410) {
          await supabase.from("nexora_admin_push_subscriptions").delete().eq("id", sub.id);
        }
      }
    })
  );

  return new Response(JSON.stringify({ sent }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
