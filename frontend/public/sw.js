self.addEventListener('push', (event) => {
  let payload = {};

  try {
    payload = event.data ? event.data.json() : {};
  } catch (error) {
    payload = {
      title: 'NexCon',
      body: event.data ? event.data.text() : '',
      url: '/',
    };
  }

  const title = payload.title || 'NexCon';
  const options = {
    body: payload.body || '',
    icon: '/logo.svg',
    badge: '/logo.svg',
    requireInteraction: true,
    data: {
      url: payload.url || '/',
    },
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  const relativeUrl = event.notification.data?.url || '/';
  const targetUrl = new URL(relativeUrl, self.location.origin).href;

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
      for (const client of windowClients) {
        const clientUrl = new URL(client.url);
        if (clientUrl.origin !== self.location.origin) {
          continue;
        }

        return client.focus().then(() => {
          if ('navigate' in client) {
            return client.navigate(targetUrl);
          }
          return undefined;
        });
      }

      return clients.openWindow(targetUrl);
    })
  );
});
