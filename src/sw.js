import { precacheAndRoute } from "workbox-precaching";

// vite-plugin-pwa(injectManifest)가 빌드 시 이 부분을 실제 파일 목록으로 채워준다.
precacheAndRoute(self.__WB_MANIFEST);

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

/**
 * notify-cron(서버)이 보낸 푸시를 받아 실제 알림으로 띄운다.
 * 앱이 꺼져 있어도(백그라운드/탭 종료) 이 이벤트는 브라우저가 깨워서 실행해 준다.
 */
self.addEventListener("push", (event) => {
  let data = { title: "Jerry Planner", body: "" };
  try {
    if (event.data) data = { ...data, ...event.data.json() };
  } catch {
    if (event.data) data.body = event.data.text();
  }

  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: "/icon-192.png",
      badge: "/icon-192.png",
      data: { url: data.url || "/" },
      vibrate: [80, 40, 80],
    }),
  );
});

/** 알림을 탭하면 이미 열려있는 탭이 있으면 포커스, 없으면 새로 연다. */
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = event.notification.data?.url || "/";

  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        if (client.url.includes(self.location.origin) && "focus" in client) return client.focus();
      }
      if (self.clients.openWindow) return self.clients.openWindow(url);
    }),
  );
});
