// Shared by any page that subscribes its own device to Web Push
// (Holder.tsx for chat, Admin.tsx for new-order alerts): converts the
// VAPID public key from its base64url string form (what's shipped via
// VITE_VAPID_PUBLIC_KEY) into the raw byte array pushManager.subscribe()
// actually requires.
export function urlBase64ToUint8Array(base64String: string): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = atob(base64);
  const outputArray = new Uint8Array(new ArrayBuffer(rawData.length));
  for (let i = 0; i < rawData.length; i++) outputArray[i] = rawData.charCodeAt(i);
  return outputArray;
}
