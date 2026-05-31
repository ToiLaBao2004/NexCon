<div align="center">
  <img src="./frontend/public/logo.svg" alt="NexCon Logo" width="88" />

  <h1>NexCon</h1>

  <p>
    Nền tảng giao tiếp realtime đa nền tảng: kết nối bạn bè, chat cá nhân và nhóm,
    gọi audio/video, phòng họp, nhắc hẹn, thông báo, kiểm duyệt nội dung và quản trị hệ thống.
  </p>

  <p>
    <a href="https://github.com/ToiLaBao2004/NexCon/actions/workflows/ci.yml">
      <img src="https://github.com/ToiLaBao2004/NexCon/actions/workflows/ci.yml/badge.svg" alt="CI Status" />
    </a>
    <img src="https://img.shields.io/badge/Frontend-React%2019%20%2B%20Vite%207-61DAFB?logo=react&logoColor=white" alt="React Vite" />
    <img src="https://img.shields.io/badge/Backend-Node.js%20%2B%20Express%205-339933?logo=node.js&logoColor=white" alt="Node Express" />
    <img src="https://img.shields.io/badge/Database-MongoDB-47A248?logo=mongodb&logoColor=white" alt="MongoDB" />
    <img src="https://img.shields.io/badge/Realtime-Socket.IO%20%2B%20LiveKit-black" alt="Socket.IO LiveKit" />
  </p>
</div>

---

## Mục lục

- [Tổng quan](#tổng-quan)
- [Tính năng hệ thống](#tính-năng-hệ-thống)
- [Kiến trúc](#kiến-trúc)
- [Workflow theo tính năng](#workflow-theo-tính-năng)
- [API, realtime và worker](#api-realtime-và-worker)
- [Công nghệ](#công-nghệ)
- [Cấu trúc thư mục](#cấu-trúc-thư-mục)
- [Cài đặt và chạy local](#cài-đặt-và-chạy-local)
- [Kiểm thử và CI/CD](#kiểm-thử-và-cicd)
- [Deploy](#deploy)
- [Bảo mật và vận hành](#bảo-mật-và-vận-hành)

## Tổng quan

**NexCon** là ứng dụng giao tiếp full-stack hướng production, phục vụ cả web và Android.
Hệ thống kết hợp REST API, Socket.IO, MongoDB, Redis, BullMQ, LiveKit, Cloudinary,
Web Push và Firebase Cloud Messaging để xử lý trải nghiệm realtime và các tác vụ nền.

Các nhóm người dùng:

| Vai trò | Khả năng chính |
| --- | --- |
| Khách | Đăng ký, đăng nhập, xác minh OTP, đặt lại mật khẩu, Google OAuth, gửi kháng cáo khi tài khoản bị khóa |
| Người dùng | Kết bạn, chat, gọi, họp, tạo reminder, nhận thông báo, quản lý hồ sơ và phiên đăng nhập |
| Quản trị viên | Xem dashboard, observability, audit log, báo cáo, AI review, vi phạm, khóa/mở khóa tài khoản và xử lý kháng cáo |

Các màn hình frontend chính:

| Route | Chức năng |
| --- | --- |
| `/signin`, `/signup`, `/otp`, `/otp-resetpass`, `/reset-password` | Xác thực tài khoản |
| `/chat` | Chat cá nhân, nhóm, tìm kiếm, media, call và disappearing messages |
| `/people` | Bạn bè, lời mời, gợi ý, danh sách chặn |
| `/meet` | Tạo hoặc tham gia phòng họp bằng mã phòng |
| `/reminder`, `/reminders` | Quản lý reminder cá nhân và reminder chung |
| `/notification` | Danh sách thông báo trong ứng dụng |
| `/reports/my` | Lịch sử báo cáo của người dùng |
| `/moderation` | Trạng thái vi phạm và hạn chế tài khoản |
| `/settings/sessions` | Quản lý các phiên đăng nhập |
| `/admin/*` | Dashboard quản trị, giám sát, báo cáo và kháng cáo |

## Tính năng hệ thống

### Xác thực và bảo mật tài khoản

- Đăng ký, đăng nhập, đăng xuất một phiên hoặc toàn bộ phiên.
- Access token JWT và refresh token theo session.
- Google OAuth cho web và Google Sign-In cho mobile.
- OTP qua email cho đăng ký và đặt lại mật khẩu.
- Quản lý danh sách thiết bị/phiên đăng nhập và thu hồi từng phiên.
- Rate limit riêng cho signup, signin, OTP và API chung.
- Tự ngắt Socket.IO khi session bị thu hồi hoặc tài khoản bị khóa.

### Hồ sơ, quyền riêng tư và trạng thái

- Cập nhật tên hiển thị, avatar, bio, số điện thoại và phạm vi hiển thị hồ sơ.
- Gắn bài hát vào hồ sơ qua Spotify search.
- Trạng thái realtime: online, away, busy, do not disturb, invisible và last seen.
- Chế độ trạng thái tự động hoặc thủ công.
- Chỉ công bố presence phù hợp với quan hệ và quyền xem hồ sơ.

### Kết nối bạn bè

- Tìm người dùng, gửi, hủy, chấp nhận, từ chối và gửi lại lời mời kết bạn.
- Gợi ý bạn bè.
- Đặt biệt danh cho bạn bè.
- Hủy kết bạn, chặn và bỏ chặn người dùng.
- Đồng bộ thay đổi qua Socket.IO.

### Chat realtime

- Hội thoại 1-1 và nhóm.
- Tin nhắn text, image, audio/voice, file, link, sticker và system message.
- Reply, emoji reaction, recall, pin/unpin và forward nhiều hội thoại.
- Mention người dùng, mention inbox và số lượng mention chưa đọc.
- Typing indicator, unread count, mark as seen, mark as unread và delivery acknowledgement.
- Pin hội thoại, mute riêng tin nhắn hoặc cuộc gọi theo thời lượng.
- Media sidebar cho ảnh, file và link; media Cloudinary được cấp signed URL.
- Tìm kiếm trong hội thoại theo từ khóa, người gửi và khoảng ngày.
- Global search người dùng, hội thoại và tin nhắn; hỗ trợ progressive response bằng NDJSON stream.
- Nội dung text và chỉ mục tìm kiếm được mã hóa ở tầng ứng dụng bằng AES-256-GCM.

> Mã hóa nội dung hiện tại là mã hóa ở tầng lưu trữ của backend, không phải end-to-end encryption.

### Disappearing messages

- Bật/tắt chế độ tin nhắn tự xóa trong hội thoại trực tiếp hoặc nhóm.
- Thành viên trong direct chat và admin nhóm có quyền thay đổi cấu hình.
- Chế độ tự tắt sau thời lượng được chọn; mỗi tin nhắn mới trong chế độ này hết hạn sau **24 giờ cố định**.
- Tin nhắn forward từ nguồn disappearing vẫn là disappearing và nhận TTL 24 giờ mới tại đích.
- Tin hết hạn được soft-delete: ẩn nội dung, bỏ reaction, bỏ pin, xóa `searchContent` và phát event cập nhật UI.
- Media Cloudinary chỉ bị xóa khi không còn tin nhắn active khác cùng tham chiếu asset.
- Android 14+ phát hiện screenshot trong hội thoại disappearing và thông báo cho các thành viên còn lại.

Tài liệu chi tiết: [docs/dm-disappearing-messages.md](./docs/dm-disappearing-messages.md).

### Quản lý nhóm

- Tạo nhóm, đổi tên, đổi avatar, thêm và xóa thành viên.
- Chuyển quyền admin, rời nhóm và giải tán nhóm.
- Tùy chọn yêu cầu admin duyệt thành viên mới.
- Tùy chọn cho phép thành viên đổi avatar nhóm và tạo reminder chung.
- Khi nhóm bị giải tán, dữ liệu được giữ trong thời gian retention rồi BullMQ worker xóa message, reminder và media.

### Gọi audio/video và phòng họp

- Direct call audio/video giữa hai người dùng.
- Group call audio/video trong hội thoại nhóm.
- Call state lưu Redis để nhiều backend replica cùng xử lý nhất quán.
- Ring timeout, từ chối, hủy, kết thúc, disconnect recovery và system message lịch sử call.
- Push call đến Android khi ứng dụng ở background, có màn hình incoming call và action trả lời/từ chối.
- Phòng họp LiveKit bằng mã dạng `abc-defg-hjk`.
- Tạo phòng ngay hoặc lên lịch; host có thể bật waiting room và duyệt người tham gia.
- Waiting room tự timeout sau 5 phút nếu host chưa xử lý.

### Reminder và lịch họp

- Reminder cá nhân hoặc reminder chung trong hội thoại.
- Tạo reminder thủ công, từ một tin nhắn hoặc khi lên lịch họp.
- Lặp lại theo ngày, tuần hoặc tháng.
- Snooze 5, 10, 30 hoặc 60 phút; dismiss và xóa theo phạm vi.
- Thành viên có thể tham gia hoặc rời reminder chung.
- BullMQ phát reminder qua socket, in-app notification, push notification và email nếu được cấu hình.
- Server reload các reminder đang chờ vào queue sau khi khởi động lại.

### Thông báo đa kênh

- Thông báo trong ứng dụng và đồng bộ realtime.
- Web Push qua VAPID và service worker.
- Firebase Cloud Messaging cho Android.
- Local notification Android khi nhận tin nhắn lúc app đang chạy.
- Push cho message, mention, reminder, lời mời bạn bè, trạng thái moderation và incoming call.
- Mark as read, mark all as read, mark as unread và xóa notification.

### Moderation và quản trị

- Moderation khi gửi text, link, image và transcript của voice message.
- Kiểm tra local signal kết hợp Google Gemini; AssemblyAI dùng để transcribe audio.
- Báo cáo tin nhắn hoặc người dùng với snapshot bằng chứng.
- Admin review thủ công hoặc chạy AI review theo batch cho báo cáo tin nhắn.
- Ghi nhận lịch sử vi phạm, decay điểm vi phạm theo thời gian và tự khóa tài khoản khi vượt ngưỡng.
- Người dùng xem trạng thái moderation và gửi kháng cáo từ màn hình đăng nhập khi bị khóa.
- Admin dashboard: thống kê user, report, appeal; khóa/mở khóa user; xem group, message, resolved report và audit log của user.
- Admin observability: request count, error rate, latency, egress, message count, user mới, report, active user và runtime CPU/memory.

### Web và Android

- Web app responsive bằng React.
- Android app dùng Capacitor.
- Native Google Sign-In, FCM, local notification, full-screen incoming call và screenshot bridge trên Android.
- Repository hiện chưa có target iOS.

## Kiến trúc

### Sơ đồ tổng thể

```mermaid
flowchart LR
    User["Web Browser / Android App"] --> FE["React + Vite + Capacitor"]
    FE -->|REST API| API["Express API"]
    FE <-->|Socket.IO| RT["Realtime Gateway"]
    FE <-->|WebRTC| LK["LiveKit Server"]

    API --> Mongo[("MongoDB")]
    API --> Redis[("Redis")]
    API --> Cloudinary["Cloudinary"]
    API --> Gemini["Google Gemini"]
    API --> AssemblyAI["AssemblyAI"]
    API --> Email["Brevo Email API"]
    API --> WebPush["Web Push"]
    API --> FCM["Firebase Cloud Messaging"]

    RT --> Mongo
    RT --> Redis
    API --> Queue["BullMQ Queues"]
    Queue --> Workers["Background Workers"]
    Workers --> Mongo
    Workers --> Cloudinary
```

### Frontend

Frontend nằm trong `frontend/`:

- React 19, TypeScript, Vite 7 và Tailwind CSS.
- Zustand quản lý auth, chat, friend, socket, notification, reminder, call, group call, meeting, theme và media cache.
- Axios gọi REST API; Socket.IO Client nhận cập nhật realtime.
- LiveKit Client xử lý audio/video.
- Capacitor bridge cung cấp Android runtime, FCM, Google Sign-In, local notification và native screenshot event.

### Backend

Backend nằm trong `backend/`:

- Express 5 cung cấp REST API.
- Mongoose thao tác MongoDB.
- Socket.IO xử lý presence, chat event và signaling call.
- Redis đảm nhiệm presence, call state, Socket.IO adapter, moderation violation counter và BullMQ.
- Worker xử lý reminder, realtime timeout, disappearing expiry và cleanup dữ liệu.
- Cloudinary lưu media authenticated; backend sinh signed URL khi client cần đọc.

### Multi-replica Socket.IO

```mermaid
flowchart TB
    Clients["Clients"] --> LB["Load Balancer"]
    LB --> API1["Backend Replica 1"]
    LB --> API2["Backend Replica 2"]
    LB --> API3["Backend Replica 3"]

    API1 <-->|pub/sub| Adapter[("Redis Socket.IO Adapter")]
    API2 <-->|pub/sub| Adapter
    API3 <-->|pub/sub| Adapter

    API1 --> Presence[("Redis Presence Store")]
    API2 --> Presence
    API3 --> Presence

    API1 --> Calls[("Redis Call State")]
    API2 --> Calls
    API3 --> Calls

    API1 --> Mongo[("MongoDB")]
    API2 --> Mongo
    API3 --> Mongo

    API1 --> Queues[("BullMQ Queues")]
    API2 --> Queues
    API3 --> Queues
    Queues --> Workers["Worker Processes"]
```

Mỗi socket sau khi xác thực sẽ join:

- `user:<userId>` để đồng bộ mọi thiết bị của một người dùng.
- `session:<sessionId>` để thu hồi đúng session.
- `<conversationId>` để nhận event của hội thoại.

Redis Adapter phát broadcast giữa các replica. Redis presence store và call state giúp dữ liệu realtime
không phụ thuộc vào memory local của một process.

### Queue và tác vụ nền

```mermaid
flowchart LR
    API["Express API"] --> ReminderQ["reminder"]
    API --> TimeoutQ["realtime-timeout"]
    API --> GroupQ["group-cleanup"]
    API --> ClearQ["conversation-clear-cleanup"]
    API --> DisappearQ["dm-disappearing-expiry"]

    ReminderQ --> ReminderW["Reminder Worker"]
    TimeoutQ --> TimeoutW["Realtime Timeout Worker"]
    GroupQ --> GroupW["Group Cleanup Worker"]
    ClearQ --> ClearW["Conversation Clear Cleanup Worker"]
    DisappearQ --> DisappearW["Disappearing Message Worker"]

    ReminderW --> Mongo[("MongoDB")]
    GroupW --> Mongo
    ClearW --> Mongo
    DisappearW --> Mongo

    GroupW --> Cloudinary["Cloudinary"]
    ClearW --> Cloudinary
    DisappearW --> Cloudinary
```

## Workflow theo tính năng

### 1. Đăng ký và đăng nhập

```mermaid
flowchart TD
    Start["Người dùng mở ứng dụng"] --> Choice{"Chọn phương thức"}
    Choice -->|Đăng ký| Validate["Kiểm tra field và rate limit"]
    Validate --> SendOtp["Gửi OTP email"]
    SendOtp --> VerifyOtp["Nhập OTP"]
    VerifyOtp --> CreateUser["Tạo user và session"]

    Choice -->|Email / mật khẩu| SignIn["Xác thực mật khẩu"]
    Choice -->|Google web| GoogleWeb["Passport Google OAuth callback"]
    Choice -->|Google Android| GoogleMobile["Xác minh Google ID token"]

    SignIn --> Locked{"Tài khoản bị khóa?"}
    GoogleWeb --> Locked
    GoogleMobile --> Locked
    CreateUser --> Tokens["Trả access token và refresh token"]
    Locked -->|Không| Tokens
    Locked -->|Có| Appeal["Cho phép gửi kháng cáo"]
    Tokens --> Socket["Kết nối Socket.IO bằng access token"]
```

### 2. Gửi và nhận tin nhắn realtime

```mermaid
flowchart TD
    Compose["Soạn text / link / image / audio / file / sticker"] --> Validate["Kiểm tra quyền gửi và upload"]
    Validate --> Moderate{"Loại nội dung cần moderation?"}
    Moderate -->|Text / link / image| AI["Local signal và Gemini"]
    Moderate -->|Audio| Transcript["AssemblyAI transcribe"]
    Transcript --> AI
    Moderate -->|File / sticker| Persist
    AI --> Allowed{"Được phép gửi?"}
    Allowed -->|Không| Violation["Trả lỗi và ghi nhận vi phạm"]
    Allowed -->|Có| Persist["Lưu Message và cập nhật Conversation"]
    Persist --> Socket["Emit new-message vào conversation room"]
    Socket --> Client["Client cập nhật UI, unread count và âm thanh"]
    Client --> Delivered["Receiver emit message-delivered"]
    Delivered --> Ack["Server lưu deliveredTo và emit acknowledgement"]
```

### 3. Global search

```mermaid
flowchart LR
    Input["Nhập từ khóa"] --> API["GET /api/search/global hoặc /global/stream"]
    API --> Users["Tìm user theo quyền hiển thị, quan hệ và block list"]
    API --> Conversations["Tìm direct/group conversation"]
    API --> Messages["Tìm message được phép xem, chưa bị clear hoặc expire"]
    Users --> Result["Kết quả phân trang"]
    Conversations --> Result
    Messages --> Result
    Result -->|NDJSON stream| Progressive["UI hiển thị dần từng nhóm kết quả"]
```

### 4. Disappearing messages

```mermaid
flowchart TD
    Toggle["User hoặc admin nhóm bật disappearing mode"] --> Setting["Lưu setting và thời điểm tự tắt mode"]
    Setting --> SystemMessage["Tạo system message và emit setting updated"]
    Send["Gửi tin nhắn mới"] --> Active{"Mode đang active?"}
    Active -->|Không| Normal["Lưu tin nhắn thường"]
    Active -->|Có| TTL["Gắn expiresAt = thời điểm nhận + 24 giờ"]
    TTL --> Cache["Cache countdown Redis"]
    Sweep["Worker chạy mỗi phút"] --> Due{"Tin nhắn đã đến hạn?"}
    Due -->|Có| SoftDelete["Soft-delete, bỏ pin/reaction/searchContent"]
    SoftDelete --> Media{"Còn active message tham chiếu media?"}
    Media -->|Không| DeleteMedia["Xóa Cloudinary asset"]
    Media -->|Có| KeepMedia["Giữ asset"]
    DeleteMedia --> Emit["Emit dm:message-expired"]
    KeepMedia --> Emit
```

Screenshot Android:

```mermaid
flowchart LR
    Android["Android 14+ ScreenCaptureCallback"] --> Bridge["Dispatch nexcon:native-screenshot"]
    Bridge --> UI["React kiểm tra conversation đang active"]
    UI --> API["POST /api/dm/conversations/:id/screenshot"]
    API --> Socket["Emit dm:screenshot-detected"]
    API --> Notification["Tạo notification cho thành viên khác"]
```

### 5. Quản lý nhóm

```mermaid
flowchart TD
    Admin["Admin nhóm"] --> Action{"Thao tác"}
    Action -->|Thêm thành viên| Approval{"Nhóm yêu cầu duyệt?"}
    Approval -->|Không| Add["Thêm trực tiếp và emit members-added"]
    Approval -->|Có| Queue["Đưa vào approval queue"]
    Queue --> Review["Admin approve hoặc reject"]
    Review --> Add
    Action -->|Đổi tên / avatar / setting| Update["Cập nhật nhóm và tạo system message"]
    Action -->|Chuyển admin| Transfer["Chuyển quyền quản trị"]
    Action -->|Giải tán| Disband["Đánh dấu disbanded"]
    Disband --> Retention["Giữ dữ liệu 30 ngày"]
    Retention --> Cleanup["Worker xóa reminder, message, media và group"]
```

### 6. Direct call, group call và meeting

Direct call:

```mermaid
flowchart TD
    Caller["Caller emit call-offer"] --> Guard["Kiểm tra block, quan hệ, lock và active call"]
    Guard --> Redis["Tạo call session Redis và ring timeout 30 giây"]
    Redis --> Online{"Receiver online?"}
    Online -->|Có| Socket["Emit incoming-call"]
    Online -->|Không hoặc background| Push["Gửi FCM incoming call Android"]
    Socket --> Accept{"Receiver accept?"}
    Push --> Accept
    Accept -->|Có| Token["Sinh LiveKit token cho hai phía"]
    Token --> Room["Hai phía vào LiveKit room"]
    Accept -->|Không / timeout| End["Persist system message và kết thúc session"]
    Room --> End
```

Group call và meeting:

```mermaid
flowchart TD
    Start["Tạo group call hoặc phòng họp"] --> LiveKit["Sinh LiveKit room/token"]
    LiveKit --> Invite["Emit socket và gửi push cho người nhận"]
    Invite --> Join{"Có cần host duyệt?"}
    Join -->|Không| Room["Tham gia LiveKit room"]
    Join -->|Có| Waiting["Đưa vào waiting room"]
    Waiting --> Host["Host admit hoặc reject"]
    Host -->|Admit| Room
    Host -->|Reject hoặc timeout 5 phút| Leave["Rời waiting room"]
    Room --> End["Host kết thúc hoặc participant rời phòng"]
```

### 7. Reminder

```mermaid
flowchart TD
    Create["Tạo reminder cá nhân / chung / lịch họp"] --> DB["Lưu MongoDB"]
    DB --> Queue["Lập lịch BullMQ job theo remindAt"]
    Queue --> Trigger["Reminder worker nhận job"]
    Trigger --> Repeat{"Có lặp lại?"}
    Repeat -->|Có| Reschedule["Tính lần kế tiếp và enqueue lại"]
    Repeat -->|Không| MarkTriggered["Đánh dấu triggered"]
    Reschedule --> Channels
    MarkTriggered --> Channels["Gửi qua các kênh"]
    Channels --> Socket["Socket reminder-triggered"]
    Channels --> InApp["In-app notification nếu cần"]
    Channels --> Push["Web Push / FCM"]
    Channels --> Email["Email nếu notifyChannels có email"]
```

### 8. Moderation, report và kháng cáo

```mermaid
flowchart TD
    Content["Nội dung được gửi hoặc bị report"] --> Review["Local signal và AI moderation"]
    Review --> Unsafe{"Xác nhận vi phạm?"}
    Unsafe -->|Không| Allow["Cho phép hoặc chờ admin review"]
    Unsafe -->|Có| Record["Ghi nhận violation history"]
    Record --> Count["Tăng violation counter Redis, fallback MongoDB"]
    Count --> Threshold{"Đạt ngưỡng khóa?"}
    Threshold -->|Không| Warn["Gửi cảnh báo"]
    Threshold -->|Có| Lock["Khóa tài khoản, xóa session, ngắt socket"]
    Lock --> Appeal["User gửi kháng cáo"]
    Appeal --> Admin["Admin approve hoặc reject"]
    Admin -->|Approve| Unlock["Mở khóa và tùy chọn reset violation"]
    Admin -->|Reject| KeepLocked["Giữ trạng thái khóa"]
```

### 9. CI/CD

```mermaid
flowchart LR
    Branch["Feature branch"] --> PR["Pull Request vào main"]
    PR --> CI["GitHub Actions"]
    CI --> Backend["Backend: npm ci và npm test"]
    CI --> Frontend["Frontend: install, lint, test và build"]
    Backend --> Merge{"Required checks pass?"}
    Frontend --> Merge
    Merge -->|Có| Main["Merge main"]
    Main --> Railway["Railway deploy backend"]
    Main --> Vercel["Vercel deploy frontend"]
```

## API, realtime và worker

Backend expose REST API với prefix `/api`, ngoại trừ internal job endpoint.

### REST API module

| Module | Prefix | Mô tả |
| --- | --- | --- |
| Auth | `/api/auth` | Health check, signup, signin, signout, refresh token, Google OAuth, mobile Google auth, session và locked appeal |
| OTP | `/api/otp` | OTP đăng ký và đặt lại mật khẩu |
| Push | `/api/push` | VAPID key, Web Push subscription, FCM token và call action |
| Users | `/api/users` | Hồ sơ, avatar, trạng thái, moderation status, mật khẩu và Spotify music |
| Friends | `/api/friends` | Lời mời, danh sách bạn bè, gợi ý, nickname, block/unblock |
| Search | `/api/search` | Global search thường và NDJSON stream |
| Messages | `/api/messages` | Gửi, recall, pin, reaction, forward, mention, search và signed media URL |
| Conversations | `/api/conversations` | Direct/group chat, message paging, media, read state, mute, pin và quản lý nhóm |
| Disappearing messages | `/api/dm` | Setting, screenshot report và admin expire |
| Notifications | `/api/notifications` | Danh sách và trạng thái notification |
| LiveKit | `/api/livekit` | Token, room info và end meeting |
| Meetings | `/api/meetings` | Tạo, join, xem và kết thúc phòng họp |
| Reminders | `/api/reminders` | Reminder cá nhân, shared reminder và lịch họp |
| Reports | `/api/reports` | Tạo report tin nhắn/user và lịch sử report |
| Admin | `/api/admin` | Stats, observability, user inspection, report review, violation, lock/unlock và appeal |
| Internal disappearing job | `/internal/dm/expire-batch` | Trigger expiry batch với `x-internal-job-secret` |

### Socket.IO event chính

| Nhóm | Event tiêu biểu |
| --- | --- |
| Presence và session | `online-users`, `profile-updated`, `session-revoked` |
| Chat | `new-message`, `read-message`, `message-delivered`, `message-delivered-ack`, `recall-message`, `pin-message`, `message-reaction` |
| Typing và mention | `typing`, `stop-typing`, `user-typing`, `user-stopped-typing`, `user_mentioned` |
| Friend | `new-friend-request`, `friend-request-accepted`, `friend-request-rejected`, `unfriended`, `user-blocked`, `user-unblocked` |
| Conversation và group | `conversation-updated`, `conversation-cleared`, `members-added`, `member-removed`, `admin-transferred`, `group-disbanded` |
| Direct call | `call-offer`, `incoming-call`, `accept-call`, `call-answer`, `call-connected`, `call-rejected`, `call-ended` |
| Group call | `group-call:start`, `group-call:incoming`, `group-call:join`, `group-call:token`, `group-call:user-joined`, `group-call:ended` |
| Meeting waiting room | `waiting-room-update`, `participant-admitted`, `participant-rejected` |
| Reminder | `reminder-created`, `reminder-triggered`, `reminder-snoozed`, `reminder-updated`, `reminder-deleted` |
| Notification | `new-notification`, `notification-updated`, `notifications-all-read`, `notification-deleted` |
| Disappearing messages | `dm:disappearing-setting-updated`, `dm:message-expired`, `dm:screenshot-detected` |

### Worker và queue

| Queue | Worker | Vai trò |
| --- | --- | --- |
| `reminder` | `reminderWorker.js` | Trigger reminder, reschedule repeat reminder và gửi notification |
| `realtime-timeout` | `realtimeTimeoutWorker.js` | Timeout direct call, group call ring và meeting waiting room |
| `group-cleanup` | `groupCleanupWorker.js` | Xóa dữ liệu nhóm sau retention 30 ngày |
| `conversation-clear-cleanup` | `conversationClearCleanupWorker.js` | Xóa vật lý message đã được mọi participant clear |
| `dm-disappearing-expiry` | `disappearingMessageWorker.js` | Mỗi phút tự tắt mode quá hạn và expire message đến hạn |

Backend mặc định có thể chạy inline các worker cùng server. Có thể tách process bằng script:

```bash
cd backend
npm run worker:group-cleanup
npm run worker:conversation-clear-cleanup
npm run worker:dm-disappearing-expiry
```

Khi tách worker, đặt các biến `ENABLE_INLINE_*_WORKER=false` tương ứng trên server để tránh chạy trùng.

## Công nghệ

| Layer | Công nghệ |
| --- | --- |
| Frontend | React 19, TypeScript, Vite 7, Tailwind CSS, Radix UI, Zustand, Axios |
| Mobile | Capacitor 8, Android native bridge, Firebase Messaging, local notifications |
| Backend | Node.js, Express 5, Mongoose, JWT, Passport Google OAuth |
| Realtime | Socket.IO, Socket.IO Redis Adapter, LiveKit |
| Database | MongoDB Atlas hoặc MongoDB local |
| Cache, state và queue | Redis, ioredis, node-redis, BullMQ |
| Media | Cloudinary authenticated assets và signed URL |
| Notification | In-app notification, Web Push, Firebase Admin / FCM, Brevo email |
| AI và audio | Google Gemini, AssemblyAI |
| Testing | Node.js built-in test runner, Vitest |
| CI/CD | GitHub Actions, Railway, Vercel |
| Container | Docker, Docker Compose, Nginx |

## Cấu trúc thư mục

```text
NexCon/
├── .github/
│   └── workflows/
│       └── ci.yml
├── backend/
│   ├── src/
│   │   ├── config/          # MongoDB, Redis, BullMQ, Firebase, Passport
│   │   ├── controllers/     # REST controllers
│   │   ├── middlewares/     # Auth, role, rate limit, upload, audit log
│   │   ├── migrations/      # Migration scripts
│   │   ├── models/          # Mongoose models
│   │   ├── routes/          # Express routes
│   │   ├── services/        # Moderation, presence, push, call state
│   │   ├── socket/          # Socket.IO gateway và call handlers
│   │   ├── utils/           # Crypto, helper, privacy, mentions
│   │   ├── workers/         # BullMQ workers và runners
│   │   └── server.js
│   ├── test/
│   ├── Dockerfile
│   └── package.json
├── frontend/
│   ├── android/             # Capacitor Android project và native bridge
│   ├── public/              # Logo, service worker, sound assets
│   ├── src/
│   │   ├── components/
│   │   ├── hooks/
│   │   ├── layouts/
│   │   ├── lib/
│   │   ├── pages/
│   │   ├── services/
│   │   ├── stores/
│   │   ├── types/
│   │   └── utils/
│   ├── tests/
│   ├── Dockerfile
│   └── package.json
├── docs/
│   ├── ci-cd-quy-trinh.md
│   └── dm-disappearing-messages.md
├── docker-compose.yml
└── README.md
```

## Cài đặt và chạy local

### Yêu cầu

| Công cụ | Phiên bản khuyến nghị |
| --- | --- |
| Node.js | 22.x để đồng nhất CI |
| npm | 10.x hoặc mới hơn |
| MongoDB | MongoDB Atlas hoặc MongoDB local |
| Redis | Redis local hoặc Docker Redis |
| Docker | Tùy chọn |
| LiveKit Server | Tùy chọn khi cần test call/meeting |

### 1. Clone repository

```bash
git clone https://github.com/ToiLaBao2004/NexCon.git
cd NexCon
```

### 2. Tạo biến môi trường backend

Tạo `backend/.env`:

```env
# Server
PORT=5001
CLIENT_URL=http://localhost:5173
FRONTEND_URL=http://localhost:5173
BACKEND_URL=http://localhost:5001
TRUST_PROXY=

# Database, Redis và crypto
MONGODB_CONNECTION_STRING=mongodb://127.0.0.1:27017/nexcon
MONGODB_MAX_POOL_SIZE=30
REDIS_URL=redis://127.0.0.1:6379
ACCESS_TOKEN_SECRET=replace_with_a_strong_secret
MESSAGE_ENCRYPTION_KEY=base64:<32-byte-key-in-base64>

# Google OAuth
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=

# Cloudinary
CLOUDINARY_CLOUD_NAME=
CLOUDINARY_API_KEY=
CLOUDINARY_API_SECRET=

# LiveKit
LIVEKIT_API_KEY=devkey
LIVEKIT_API_SECRET=secret

# Web Push
VAPID_PUBLIC_KEY=
VAPID_PRIVATE_KEY=
VAPID_MAILTO=mailto:admin@example.com

# Android FCM: JSON service account ở dạng một dòng
FIREBASE_SERVICE_ACCOUNT=

# Moderation, audio và Spotify
GEMINI_API_KEY=
ASSEMBLYAI_API_KEY=
SPOTIFY_CLIENT_ID=
SPOTIFY_CLIENT_SECRET=

# Email OTP và reminder
BREVO_API_URL=
BREVO_API_KEY=
EMAIL_FROM_EMAIL=
EMAIL_FROM_NAME=NexCon App

# Internal job endpoint
INTERNAL_JOB_SECRET=
```

Các integration key có thể để trống nếu không test tính năng tương ứng. Với môi trường production,
không dùng fallback mặc định cho `MESSAGE_ENCRYPTION_KEY`.

Biến vận hành tùy chọn:

```env
ENABLE_INLINE_GROUP_CLEANUP_WORKER=true
ENABLE_INLINE_CONVERSATION_CLEAR_CLEANUP_WORKER=true
ENABLE_INLINE_DISAPPEARING_MESSAGE_WORKER=true

SOCKET_PRESENCE_TTL_SECONDS=120
PRESENCE_FLUSH_DELAY_MS=2000
SOCKET_SESSION_REVALIDATE_MS=60000
DIRECT_CALL_STATE_TTL_SECONDS=7200
GROUP_CALL_STATE_TTL_SECONDS=21600

AUDIT_LOG_ENABLED=true
AUDIT_LOG_FLUSH_MS=1000
AUDIT_LOG_MAX_BATCH_SIZE=500
SLOW_API_LOG_MS=1000
```

### 3. Tạo biến môi trường frontend

Tạo `frontend/.env`:

```env
VITE_API_URL=http://localhost:5001/api
VITE_SOCKET_URL=http://localhost:5001
VITE_LIVEKIT_URL=ws://localhost:7880
VITE_VAPID_PUBLIC_KEY=
VITE_CONNECTIVITY_CHECK_URL=http://localhost:5001/api/auth/health
VITE_STICKER_ASSET_VERSION=2026-05-18
```

### 4. Cài dependencies

Backend:

```bash
cd backend
npm ci
```

Frontend:

```bash
cd frontend
npm ci --legacy-peer-deps
```

Frontend hiện cần `--legacy-peer-deps` do dependency tree của Capacitor.

### 5. Chạy Redis và LiveKit local

Cách nhanh bằng Docker:

```bash
docker run --name nexcon-redis -p 6379:6379 -d redis:7-alpine
docker run --name nexcon-livekit -p 7880:7880 -p 7881:7881 -p 7882:7882/udp -d livekit/livekit-server:latest --dev --bind 0.0.0.0
```

### 6. Chạy backend và frontend

Terminal backend:

```bash
cd backend
npm run dev
```

Terminal frontend:

```bash
cd frontend
npm run dev
```

Địa chỉ mặc định:

| Thành phần | URL |
| --- | --- |
| Frontend | `http://localhost:5173` |
| Backend | `http://localhost:5001` |
| Health check | `http://localhost:5001/api/auth/health` |
| LiveKit | `ws://localhost:7880` |

### 7. Chạy bằng Docker Compose

Tạo `.env` ở root repository cho các biến Docker Compose cần đọc, sau đó chạy:

```bash
docker compose up --build
```

Compose hiện khởi động:

- Redis.
- LiveKit dev server.
- Backend API.
- Dedicated `group-cleanup-worker`.
- Frontend qua Nginx.

Server vẫn chạy inline reminder worker, realtime timeout worker, conversation-clear worker và
disappearing-message worker. Khi mở rộng Compose bằng worker process riêng, tắt inline worker tương ứng.

### 8. Migration disappearing messages

Với database đã tồn tại trước feature disappearing messages:

```bash
cd backend
npm run migrate:dm-disappearing
```

### 9. Android

Frontend đã chứa project Capacitor Android trong `frontend/android/`.

```bash
cd frontend
npm run build
npx cap sync android
npx cap open android
```

Để dùng FCM trên Android:

1. Đặt `google-services.json` vào `frontend/android/app/`.
2. Cấu hình `FIREBASE_SERVICE_ACCOUNT` trên backend.
3. Build và chạy app bằng Android Studio.

Screenshot detection dùng `ScreenCaptureCallback`, nên chỉ hoạt động từ Android 14 trở lên.

## Kiểm thử và CI/CD

### Backend test

```bash
cd backend
npm test
```

Test hiện có:

```text
backend/test/fieldFormat.test.js
backend/test/isMuted.test.js
backend/test/mentions.test.js
backend/test/moderationPromptService.test.js
backend/test/userStatusService.test.js
backend/test/disappearingMessages.test.js
```

### Frontend test

```bash
cd frontend
npm test
```

Test hiện có:

```text
frontend/tests/fieldFormat.test.ts
frontend/tests/meetingLink.test.ts
frontend/tests/mentions.test.ts
frontend/tests/disappearingMessages.test.ts
```

### Build và lint

```bash
cd frontend
npm run lint
npm run build
```

### GitHub Actions

Workflow CI nằm tại [`.github/workflows/ci.yml`](./.github/workflows/ci.yml) và chạy khi:

- Push vào `main`.
- Pull Request vào `main`.

| Job | Lệnh chính | Ghi chú |
| --- | --- | --- |
| Backend | `npm ci`, `npm test` | Test backend bằng Node.js test runner |
| Frontend | `npm ci --legacy-peer-deps`, `npm run lint`, `npm test`, `npm run build` | Lint hiện dùng `continue-on-error: true`; test và build vẫn bắt buộc pass |

Tài liệu CI/CD chi tiết: [docs/ci-cd-quy-trinh.md](./docs/ci-cd-quy-trinh.md).

## Deploy

### Frontend trên Vercel

| Cấu hình | Giá trị |
| --- | --- |
| Root Directory | `frontend` |
| Install Command | `npm ci --legacy-peer-deps` |
| Build Command | `npm run build` |
| Output Directory | `dist` |

Biến môi trường tối thiểu:

```env
VITE_API_URL=https://<backend-domain>/api
VITE_SOCKET_URL=https://<backend-domain>
VITE_LIVEKIT_URL=wss://<livekit-domain>
VITE_VAPID_PUBLIC_KEY=
VITE_CONNECTIVITY_CHECK_URL=https://<backend-domain>/api/auth/health
```

### Backend trên Railway

| Cấu hình | Giá trị |
| --- | --- |
| Root Directory | `backend` |
| Install Command | `npm ci` |
| Start Command | `npm start` |
| Health check | `/api/auth/health` |

Production cần cấu hình MongoDB, Redis, crypto secret, CORS URL và key của các integration thực sự sử dụng.
Tất cả backend replica và worker process phải dùng cùng `MONGODB_CONNECTION_STRING`, `REDIS_URL`
và `MESSAGE_ENCRYPTION_KEY`.

### LiveKit

Call và meeting yêu cầu LiveKit server riêng. Frontend dùng WebSocket URL qua `VITE_LIVEKIT_URL`;
backend dùng `LIVEKIT_API_KEY` và `LIVEKIT_API_SECRET` để phát token.

## Bảo mật và vận hành

- Không commit `.env`, Firebase service account, `google-services.json`, keystore hoặc private key.
- Dùng secret đủ mạnh và ổn định cho `ACCESS_TOKEN_SECRET` và `MESSAGE_ENCRYPTION_KEY`.
- Không thay đổi `MESSAGE_ENCRYPTION_KEY` tùy tiện sau khi đã có dữ liệu mã hóa.
- Bật HTTPS/WSS ở production.
- Cấu hình `CLIENT_URL` chính xác để giới hạn CORS.
- Cấu hình `TRUST_PROXY` khi backend chạy sau reverse proxy.
- Tất cả replica phải dùng cùng Redis để Socket.IO adapter, presence, call state và queue nhất quán.
- Nếu Socket.IO cho phép HTTP long-polling fallback qua load balancer, cấu hình sticky session hoặc ép WebSocket transport nhất quán.
- Theo dõi admin observability, audit log, worker error và Redis connectivity.
- Internal expiry endpoint `/internal/dm/expire-batch` phải được bảo vệ bằng `INTERNAL_JOB_SECRET`.
- Cloudinary message assets dùng authenticated delivery; client chỉ nhận signed URL tạm thời.
- Audit log được batch insert và TTL 60 ngày; notification TTL 30 ngày; ended meeting TTL 7 ngày.

## Tài liệu liên quan

- [Quy trình CI/CD](./docs/ci-cd-quy-trinh.md)
- [Disappearing messages](./docs/dm-disappearing-messages.md)
- [Frontend README](./frontend/README.md)
- [GitHub Actions workflow](./.github/workflows/ci.yml)
- [Docker Compose](./docker-compose.yml)

---

<div align="center">
  <strong>NexCon</strong>
  <br />
  Realtime communication, collaboration and safer community management.
</div>
