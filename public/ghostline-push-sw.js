/* Ghostline's single Web Push service worker. No application data is cached. */
self.addEventListener("push", (event) => {
  let payload = {};
  try { payload = event.data ? event.data.json() : {}; } catch { /* generic notification is intentional */ }
  const conversationId = typeof payload.conversationId === "string" ? payload.conversationId : null;
  event.waitUntil(self.registration.showNotification("New message", {
    body: "New message in Ghostline",
    icon: "/favicon.ico",
    badge: "/favicon.ico",
    tag: `ghostline-message-${payload.messageId || "unknown"}`,
    data: { conversationId },
  }));
});
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const conversationId = event.notification.data?.conversationId;
  const target = conversationId ? `/_authenticated/chats/${encodeURIComponent(conversationId)}` : "/";
  event.waitUntil(clients.matchAll({ type: "window", includeUncontrolled: true }).then((windows) => {
    const existing = windows[0];
    return existing ? existing.focus().then(() => existing.navigate(target)) : clients.openWindow(target);
  }));
});
