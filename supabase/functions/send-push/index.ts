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
import { createClient } from "npm:@supabase/supabase-js@2";
import webpush from "npm:web-push@3";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const vapidPublicKey = Deno.env.get("VAPID_PUBLIC_KEY")!;
const vapidPrivateKey = Deno.env.get("VAPID_PRIVATE_KEY")!;
const vapidSubject = Deno.env.get("VAPID_SUBJECT") ?? "mailto:support@nexxadbc.com";

webpush.setVapidDetails(vapidSubject, vapidPublicKey, vapidPrivateKey);

const supabase = createClient(supabaseUrl, serviceRoleKey);

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  let payload: { to_order_code?: string; title?: string; body?: string; url?: string };
  try {
    payload = await req.json();
  } catch {
    return new Response("Invalid JSON body", { status: 400 });
  }

  const { to_order_code, title, body, url } = payload;
  if (!to_order_code || !title || !body) {
    return new Response("Missing to_order_code, title, or body", { status: 400 });
  }

  const { data: order } = await supabase
    .from("nexora_orders")
    .select("id, parent_order_id")
    .eq("order_code", to_order_code)
    .maybeSingle();

  if (!order) {
    return new Response("Unknown order_code", { status: 404 });
  }
  const rootId = order.parent_order_id ?? order.id;

  const { data: subs } = await supabase
    .from("nexora_push_subscriptions")
    .select("id, endpoint, p256dh, auth")
    .eq("order_id", rootId);

  if (!subs || subs.length === 0) {
    return new Response(JSON.stringify({ sent: 0 }), { headers: { "Content-Type": "application/json" } });
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

  return new Response(JSON.stringify({ sent }), { headers: { "Content-Type": "application/json" } });
});
