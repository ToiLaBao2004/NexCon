# DM Disappearing Messages

## REST API

- `PUT /api/dm/conversations/:id/disappearing`
  - Body: `{ "enabled": true, "durationSeconds": 3600 }`
  - `durationSeconds` is the auto-disable timeout for the mode.
  - Any direct-conversation participant or a group admin can update the setting.
- `GET /api/dm/conversations/:id/disappearing`
- `POST /api/dm/conversations/:id/screenshot`
  - Called by native clients after a screenshot callback while a disappearing conversation is active.
- `POST /api/dm/messages/:id/expire`
  - Admin/debug endpoint.
- `DELETE /internal/dm/expire-batch`
  - Internal cron/webhook endpoint. Send `x-internal-job-secret`.

The BullMQ `dm-disappearing-expiry` worker runs `expire-batch` every minute to auto-disable elapsed modes and expire due messages.

## WebSocket Events

Server to client:

```ts
type DisappearingSettingUpdated = {
  conversationId: string;
  setting: {
    enabled: boolean;
    durationSeconds: number | null;
    disableAt: string | null;
    enabledBy: string | null;
    enabledAt: string | null;
  };
};

type DisappearingMessageExpired = {
  conversationId: string;
  messageId: string;
  expiredAt: string;
  placeholder: "Tin nhắn này đã biến mất.";
};

type ScreenshotDetected = {
  conversationId: string;
  actorId: string;
  actorName: string;
  detectedAt: string;
};
```

Event names:

- `dm:disappearing-setting-updated`
- `dm:message-expired`
- `dm:screenshot-detected`

Expiry events update the UI only. They do not create deletion push notifications.

## Storage Rules

- `deliveryStartedAt` is the server-received timestamp. This keeps the timer correct when a sender uploads while offline and reconnects later.
- `durationSeconds` controls when disappearing-message mode turns itself off. It does not control message expiry.
- Every disappearing message expires after a fixed 24 hours.
- Forwarded disappearing messages remain disappearing and receive a new fixed 24-hour TTL from delivery in the target conversation.
- Expiry is a soft-delete: encrypted audit content remains stored, `searchContent` is unset immediately, reactions are cleared, pins are removed, and client serializers hide content and media metadata.
- Cloudinary media is deleted after expiry when no active forwarded message still references the same asset.

## Native Screenshot Bridge

The web layer listens for:

```js
window.dispatchEvent(new CustomEvent("nexcon:native-screenshot"));
```

Android 14+ emits this event from `MainActivity` through `ScreenCaptureCallback`.
The repository currently has no iOS target. When one is added, its screenshot callback must emit the same web event so the existing reporting path is reused.
