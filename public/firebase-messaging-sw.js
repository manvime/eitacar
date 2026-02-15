/* eslint-disable no-undef */
importScripts("https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js");
importScripts("https://www.gstatic.com/firebasejs/10.12.2/firebase-messaging-compat.js");

// Seus dados do Firebase (os mesmos do NEXT_PUBLIC_*)
firebase.initializeApp({
  apiKey: "AIzaSyCbEaJmvlb9dcVshEuKdqk_q_tpN-VZTOwI",
  authDomain: "ocramfire.firebaseapp.com",
  projectId: "ocramfire",
  storageBucket: "ocramfire.firebasestorage.app",
  messagingSenderId: "289895157102",
  appId: "1:289895157102:web:75fc74237def6a7c92857f",
});

const messaging = firebase.messaging();

// Background push (app fechado)
messaging.onBackgroundMessage((payload) => {
  const title = payload?.notification?.title || "Nova mensagem";
  const options = {
    body: payload?.notification?.body || "",
    icon: "/icons/icon-192.png",
    badge: "/icons/icon-192.png",
    data: payload?.data || {},
  };

  self.registration.showNotification(title, options);
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  const threadId = event?.notification?.data?.threadId;
  const url = threadId ? `/t/${threadId}` : `/chats`;

  event.waitUntil(
    (async () => {
      const allClients = await clients.matchAll({ type: "window", includeUncontrolled: true });

      // se já tem uma aba aberta, foca e navega
      for (const client of allClients) {
        try {
          if ("focus" in client) await client.focus();
          if ("navigate" in client) await client.navigate(url);
          return;
        } catch {}
      }

      // senão abre nova
      if (clients.openWindow) return clients.openWindow(url);
    })()
  );
});
