/* eslint-disable no-undef */
importScripts("https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js");
importScripts("https://www.gstatic.com/firebasejs/10.12.2/firebase-messaging-compat.js");

// ⚠️ COLE AQUI SEUS DADOS DO FIREBASE (os mesmos do NEXT_PUBLIC_*)
firebase.initializeApp({
  apiKey: "AIzaSyCbEaJmvlb9dcVshEuKdqk_q_tpN-VZTOwI",
  authDomain: "ocramfire.firebaseapp.com",
  projectId: "ocramfire",
  storageBucket: "ocramfire.firebasestorage.app",
  messagingSenderId: "289895157102",
  appId: "1:289895157102:web:75fc74237def6a7c92857f",
});

const messaging = firebase.messaging();

// push em background (app fechado)
messaging.onBackgroundMessage((payload) => {
  const title = payload?.notification?.title || "Nova mensagem";
  const options = {
    body: payload?.notification?.body || "",
    icon: "/icons/icon-192.png", // se tiver
    data: payload?.data || {},
  };
  self.registration.showNotification(title, options);
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  const threadId = event?.notification?.data?.threadId;
  const url = threadId ? `/t/${threadId}` : `/chats`;

  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if ("focus" in client) return client.focus();
      }
      if (clients.openWindow) return clients.openWindow(url);
    })
  );
});
