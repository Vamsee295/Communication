/* Ghostline's single Web Push service worker. No application data is cached. */
self.addEventListener("push", (event) => {
  let payload = {};
  try { payload = event.data ? event.data.json() : {}; } catch { /* generic notification is intentional */ }
  const conversationId = typeof payload.conversationId === "string" ? payload.conversationId : null;
  const senderName = typeof payload.senderName === "string" ? payload.senderName : null;
  const groupName = typeof payload.groupName === "string" ? payload.groupName : null;
  const notificationId = typeof payload.notificationId === "string" ? payload.notificationId : "unknown";
  
  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then((windows) => {
      let isFocused = false;
      for (const client of windows) {
        if (client.focused && conversationId && client.url.includes(`/chats/${conversationId}`)) {
          isFocused = true;
          break;
        }
      }
      
      if (isFocused) {
        // App is already open and focused on this conversation
        return Promise.resolve();
      }

      const title = groupName ? groupName : (senderName ? senderName : "New message");
      const body = groupName && senderName ? `${senderName} sent a message` : "New message in Ghostline";

      return self.registration.showNotification(title, {
        body: body,
        icon: "/favicon.ico",
        badge: "/favicon.ico",
        tag: `ghostline-message-${notificationId}`,
        data: { conversationId },
      });
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const conversationId = event.notification.data?.conversationId;
  const target = conversationId ? `/_authenticated/chats/${encodeURIComponent(conversationId)}` : "/";
  event.waitUntil(clients.matchAll({ type: "window", includeUncontrolled: true }).then((windows) => {
    // Look for an existing window to focus
    for (const client of windows) {
      if (client.url.includes(target) && "focus" in client) {
        return client.focus();
      }
    }
    if (windows.length > 0 && "focus" in windows[0]) {
      return windows[0].focus().then(() => windows[0].navigate(target));
    }
    return clients.openWindow(target);
  }));
});
