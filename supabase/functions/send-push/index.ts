// Delivers a real Web Push notification to every device subscribed under
// a recipient's order_code, so a chat message can surface on the lock
// screen even when NexxaDBC isn't open at all. Runs with the service
// role key (set as this function's own secret, never shipped to the
// client) since nexora_push_subscriptions has RLS enabled with zero
// policies, same trust model as every other table in this app.
//
// Called client-side, best-effort, right after send_chat_message
// succeeds (see lib/supabase.ts sendPushNotification) -- the message
// itself is already persisted by that RPC regardless of whether this
// call, or any individual push inside it, succeeds.
//
// SECURITY: security testing (2026-08-31) found this endpoint accepted
// any to_order_code with a fully attacker-controlled title/body/url and
// no check on who was calling -- since the anon key is public (shipped
// in the client bundle), literally anyone could POST here directly and
// push an arbitrary phishing notification to any real customer's phone,
// appearing to come from NexxaDBC with OS-level trust. This now requires
// from_order_code too and re-verifies, server-side, the exact same
// requirements send_chat_message already enforces for the message
// itself (both sides on a chat-capable plan, and a real connection
// already exists between them) -- so this endpoint can only ever notify
// about a conversation that's actually allowed to exist, never anything
// else.
import { createClient } from "npm:@supabase/supabase-js@2";
import webpush from "npm:web-push@3";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const vapidPublicKey = Deno.env.get("VAPID_PUBLIC_KEY")!;
const vapidPrivateKey = Deno.env.get("VAPID_PRIVATE_KEY")!;
const vapidSubject = Deno.env.get("VAPID_SUBJECT") ?? "mailto:support@nexxadbc.com";

webpush.setVapidDetails(vapidSubject, vapidPublicKey, vapidPrivateKey);

const supabase = createClient(supabaseUrl, serviceRoleKey);

// Only the real app origin ever has a legitimate reason to call this;
// the wildcard this used to be doesn't stop a direct script/curl call
// (CORS is a browser-only protection) but does stop a malicious
// third-party page from riding a victim's browser session into this
// endpoint, and there's no reason to leave it open beyond that.
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

  let payload: { from_order_code?: string; to_order_code?: string; title?: string; body?: string; url?: string };
  try {
    payload = await req.json();
  } catch {
    return new Response("Invalid JSON body", { status: 400, headers: corsHeaders });
  }

  const { from_order_code, to_order_code, body, url } = payload;
  if (!from_order_code || !to_order_code || !body) {
    return new Response("Missing from_order_code, to_order_code, or body", { status: 400, headers: corsHeaders });
  }

  const { data: fromOrder } = await supabase
    .from("nexora_orders")
    .select("id, parent_order_id, card")
    .eq("order_code", from_order_code)
    .maybeSingle();
  const { data: toOrder } = await supabase
    .from("nexora_orders")
    .select("id, parent_order_id")
    .eq("order_code", to_order_code)
    .maybeSingle();

  if (!fromOrder || !toOrder) {
    return new Response("Unknown order_code", { status: 404, headers: corsHeaders });
  }

  const fromRootId = fromOrder.parent_order_id ?? fromOrder.id;
  const toRootId = toOrder.parent_order_id ?? toOrder.id;

  if (fromRootId === toRootId) {
    return new Response("Cannot notify yourself", { status: 400, headers: corsHeaders });
  }

  const { data: fromRoot } = await supabase.from("nexora_orders").select("plan_id").eq("id", fromRootId).single();
  const { data: toRoot } = await supabase.from("nexora_orders").select("plan_id").eq("id", toRootId).single();
  if (!["pro", "business"].includes(fromRoot?.plan_id) || !["pro", "business"].includes(toRoot?.plan_id)) {
    return new Response("Chat is available on the Pro and Business plans", { status: 403, headers: corsHeaders });
  }

  const [lo, hi] = fromRootId < toRootId ? [fromRootId, toRootId] : [toRootId, fromRootId];
  const { data: connection } = await supabase
    .from("nexora_connections")
    .select("id")
    .eq("order_id_a", lo)
    .eq("order_id_b", hi)
    .maybeSingle();
  if (!connection) {
    return new Response("No connection between these orders", { status: 403, headers: corsHeaders });
  }

  // Title is derived server-side from the sender's own real card, never
  // taken from the request -- otherwise from_order_code proving a real
  // connection still wouldn't stop someone impersonating a different
  // display name in the notification.
  const senderCard = fromOrder.card as { firstName?: string; lastName?: string } | null;
  const title = `${senderCard?.firstName ?? ""} ${senderCard?.lastName ?? ""}`.trim() || "New message";

  const { data: subs } = await supabase
    .from("nexora_push_subscriptions")
    .select("id, endpoint, p256dh, auth")
    .eq("order_id", toRootId);

  if (!subs || subs.length === 0) {
    return new Response(JSON.stringify({ sent: 0 }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Read by the service worker's push handler (src/sw.ts): title/body
  // for the notification text, url for where notificationclick opens.
  const notificationPayload = JSON.stringify({ title, body, url: url ?? "/" });

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
          await supabase.from("nexora_push_subscriptions").delete().eq("id", sub.id);
        }
      }
    })
  );

  return new Response(JSON.stringify({ sent }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
