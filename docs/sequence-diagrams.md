# Sequence Diagrams chính của NexCon

Dựa trên phần `4.5. Sequence Diagram` trong `docs/generate_nexcon_full_report.py` và các route/controller/socket tương ứng, dự án có **5 sơ đồ sequence chính**:

1. Đăng nhập và khởi tạo phiên realtime
2. Gửi tin nhắn realtime và hậu kiểm AI
3. Gọi trực tiếp audio/video
4. Report vi phạm và Admin review
5. Disappearing messages

## 1. Đăng nhập và khởi tạo phiên realtime

```plantuml
@startuml
title Sequence 1 - Đăng nhập và khởi tạo phiên realtime

actor "Khách/User" as User
boundary "Frontend\nReact/Zustand" as FE
control "Auth API\n/api/auth" as Auth
control "Rate limiter" as Rate
database "MongoDB\nUser" as UserDB
database "MongoDB\nSession" as SessionDB
control "Socket.IO\nMiddleware" as SocketAuth
control "Socket.IO Gateway" as Socket
database "Redis\nPresence/Rooms" as Redis

User -> FE: Nhập email/mật khẩu\nhoặc chọn Google
FE -> Auth: POST /signin\nhoặc /google/mobile
Auth -> Rate: Kiểm tra rate limit
Rate --> Auth: Cho phép tiếp tục
Auth -> UserDB: Tìm user,\nkiểm tra password/Google token

alt Tài khoản bị khóa
    UserDB --> Auth: lock.isLocked = true
    Auth --> FE: 423 Locked + restriction
    FE --> User: Hiển thị form kháng cáo
else Hợp lệ
    UserDB --> Auth: User hợp lệ
    Auth -> SessionDB: Tạo Session + refreshToken
    SessionDB --> Auth: sessionId
    Auth --> FE: accessToken + user profile
    FE -> SocketAuth: Connect Socket.IO\nkèm accessToken
    SocketAuth -> SessionDB: Xác thực userId/sessionId
    SocketAuth -> Redis: Ghi presence, join user/session room
    SocketAuth -> Socket: Cho phép connection
    Socket --> FE: connected + online-users
end

@enduml
```

## 2. Gửi tin nhắn realtime và hậu kiểm AI

```plantuml
@startuml
title Sequence 2 - Gửi tin nhắn realtime và hậu kiểm AI

actor "Sender" as Sender
actor "Receiver" as Receiver
boundary "Frontend Chat" as FE
control "Message API\n/api/messages/send" as MsgAPI
control "Message middleware" as MW
database "MongoDB\nConversation/Message" as Mongo
cloud "Cloudinary" as Cloud
control "Socket.IO Gateway" as Socket
control "Moderation worker\nsetImmediate" as ModWorker
control "Gemini / AssemblyAI" as AI
control "Notification Service" as Notify
database "Redis / Push / FCM" as Push

Sender -> FE: Soạn text/link/image/audio/file
FE -> MsgAPI: POST /api/messages/send
MsgAPI -> MW: Kiểm tra membership,\nblock, lock, file
MW --> MsgAPI: Hợp lệ

opt Có media
    MsgAPI -> Cloud: Upload authenticated asset
    Cloud --> MsgAPI: publicId/file metadata
end

MsgAPI -> Mongo: Lưu Message\nmoderationStatus = pending_review
MsgAPI -> Mongo: Cập nhật Conversation,\nunread count, lastMessage
MsgAPI -> Socket: Emit new-message\nvào conversation room
Socket -> Receiver: new-message
MsgAPI --> FE: 201 Created + message payload

MsgAPI -> ModWorker: Chạy hậu kiểm nền
ModWorker -> AI: Local signal + Gemini\nAssemblyAI nếu audio
AI --> ModWorker: approved / rejected / skipped

alt Nội dung an toàn hoặc skipped
    ModWorker -> Mongo: Cập nhật moderationStatus
    ModWorker -> Notify: Tạo notification nếu cần
    Notify -> Push: Socket/Web Push/FCM
else Nội dung vi phạm
    ModWorker -> Mongo: Set reportStatus,\nẩn content/searchContent
    opt Media vi phạm
        ModWorker -> Cloud: Cleanup asset nếu không còn tham chiếu
    end
    ModWorker -> Socket: Emit message-moderated
    Socket -> Receiver: Cập nhật UI tin vi phạm
end

Receiver -> Socket: message-delivered
Socket -> Mongo: Lưu deliveredTo
Socket -> FE: message-delivered-ack

@enduml
```

## 3. Gọi trực tiếp audio/video

```plantuml
@startuml
title Sequence 3 - Gọi trực tiếp audio/video

actor "Caller" as Caller
actor "Receiver" as Receiver
boundary "Call UI" as CallUI
control "Socket.IO\nCall Handler" as CallHandler
database "MongoDB\nUser/Friend/Block" as Mongo
database "Redis\nDirect Call State" as Redis
queue "Realtime Timeout Queue" as TimeoutQ
control "FCM / Push" as FCM
control "LiveKit" as LiveKit

Caller -> CallUI: Bấm gọi audio/video
CallUI -> CallHandler: emit call-offer(toUserId, callType)
CallHandler -> Mongo: Kiểm tra receiver,\nfriendship, block, lock
CallHandler -> Redis: reserveOffer + lưu call session
CallHandler -> TimeoutQ: Lên lịch ring timeout

alt Receiver online
    CallHandler -> Receiver: emit incoming-call
else Receiver offline/background
    CallHandler -> FCM: Gửi push incoming call Android
    FCM -> Receiver: Hiển thị incoming call
end

alt Receiver accept
    Receiver -> CallHandler: emit accept-call / call-answer
    CallHandler -> Redis: Chuyển trạng thái connecting
    CallHandler -> LiveKit: Sinh token cho caller và receiver
    LiveKit --> CallHandler: LiveKit tokens
    CallHandler -> Caller: call-answered + token
    CallHandler -> Receiver: call-accepted + token
    Caller -> LiveKit: Join room
    Receiver -> LiveKit: Join room
    Caller -> CallHandler: emit call-connected
    Receiver -> CallHandler: emit call-connected
    CallHandler -> Redis: Trạng thái in-call
else Receiver reject hoặc timeout
    Receiver -> CallHandler: emit call-rejected
    CallHandler -> Redis: finalize session
    CallHandler -> Caller: call-rejected / no-answer
end

Caller -> CallHandler: emit call-ended / call-cancelled
CallHandler -> Redis: Xóa call state
CallHandler -> Mongo: Ghi system message lịch sử call
CallHandler -> Receiver: call-ended

@enduml
```

## 4. Report vi phạm và Admin review

```plantuml
@startuml
title Sequence 4 - Report vi phạm và Admin review

actor "Reporter" as Reporter
actor "Admin" as Admin
actor "User bị khóa" as LockedUser
boundary "Frontend" as FE
control "Report API\n/api/reports" as ReportAPI
control "Admin API\n/api/admin" as AdminAPI
database "MongoDB\nMessage/User/Report" as Mongo
control "AI Review Service" as AIReview
control "Violation Service" as Violation
database "Redis\nViolation Counter" as Redis
control "Notification/Socket" as Notify

Reporter -> FE: Chọn report message/user
FE -> ReportAPI: POST /reports/messages/:id\nhoặc /reports/users/:id
ReportAPI -> Mongo: Kiểm quyền, lấy snapshot target
ReportAPI -> Mongo: Tạo Report status=pending
ReportAPI --> FE: Report created

Admin -> AdminAPI: GET /admin/reports
AdminAPI -> Mongo: Lấy danh sách report
Mongo --> AdminAPI: pending reports
AdminAPI --> Admin: Hiển thị report

opt Admin chạy AI review
    Admin -> AdminAPI: POST /admin/reports/messages/ai-review
    AdminAPI -> AIReview: Phân tích nội dung/snapshot
    AIReview --> AdminAPI: risk, reason, confidence
    AdminAPI -> Mongo: Lưu kết quả AI review
end

Admin -> AdminAPI: PATCH /admin/reports/:id/resolve
AdminAPI -> Mongo: Cập nhật report resolved

alt Xác nhận vi phạm
    AdminAPI -> Mongo: Ẩn message nếu là report message
    AdminAPI -> Notify: Emit message-moderated
    AdminAPI -> Violation: registerViolation(targetUser)
    Violation -> Redis: Tăng counter + decay state
    alt Đạt ngưỡng khóa
        Violation -> Mongo: Set lock.isLocked = true\nxóa session
        Violation -> Notify: session-revoked/account-lock
        Notify -> LockedUser: Bị ngắt phiên + thấy lý do khóa
    else Chưa đạt ngưỡng
        Violation -> Notify: Gửi cảnh báo
    end
else Không vi phạm
    AdminAPI -> Mongo: Đánh dấu dismissed/no_violation
    AdminAPI -> Notify: Thông báo kết quả nếu cần
end

opt User gửi kháng cáo
    LockedUser -> ReportAPI: POST /auth/locked-appeals
    ReportAPI -> Mongo: Lưu LockAppeal pending
    Admin -> AdminAPI: PATCH /admin/appeals/:id/review
    alt Approve
        AdminAPI -> Violation: unlockAccount(resetViolations)
        Violation -> Mongo: Mở khóa user
    else Reject
        AdminAPI -> Mongo: Giữ trạng thái khóa
    end
end

@enduml
```

## 5. Disappearing messages

```plantuml
@startuml
title Sequence 5 - Disappearing messages

actor "User/Admin nhóm" as User
actor "Sender" as Sender
actor "Member" as Member
boundary "Frontend Chat" as FE
control "DM API\n/api/dm" as DMAPI
control "Message API" as MsgAPI
database "MongoDB\nConversation/Message" as Mongo
database "Redis\nCountdown/Queue" as Redis
control "Socket.IO Gateway" as Socket
queue "Disappearing Worker" as Worker
cloud "Cloudinary" as Cloud

User -> FE: Bật/tắt disappearing mode
FE -> DMAPI: PUT /conversations/:id/disappearing
DMAPI -> Mongo: Kiểm quyền participant/admin nhóm
DMAPI -> Mongo: Lưu enabled, durationSeconds,\ndisableAt, enabledBy
DMAPI -> Mongo: Tạo system message
DMAPI -> Socket: Emit dm:disappearing-setting-updated
Socket -> Member: Cập nhật setting realtime
DMAPI --> FE: Trả setting mới

Sender -> FE: Gửi message khi mode active
FE -> MsgAPI: POST /api/messages/send
MsgAPI -> Mongo: Đọc setting conversation
alt Mode active
    MsgAPI -> Mongo: Lưu Message với expiresAt = now + 24h
    MsgAPI -> Redis: Cache countdown TTL
else Mode inactive
    MsgAPI -> Mongo: Lưu Message thường
end
MsgAPI -> Socket: Emit new-message
Socket -> Member: Hiển thị message

loop Mỗi phút
    Worker -> Redis: Nhận job dm-disappearing-expiry
    Worker -> Mongo: Tìm conversation hết disableAt\nvà message hết expiresAt
    Worker -> Mongo: Soft-delete message,\nxóa searchContent/reaction/pin
    opt Message có media
        Worker -> Mongo: Kiểm tra tham chiếu asset còn active
        alt Không còn tham chiếu active
            Worker -> Cloud: Xóa authenticated asset
        else Còn tham chiếu active
            Worker -> Cloud: Giữ asset
        end
    end
    Worker -> Socket: Emit dm:message-expired
    Socket -> Member: UI chuyển sang placeholder
end

opt Android screenshot trong conversation active
    Member -> FE: nexcon:native-screenshot
    FE -> DMAPI: POST /conversations/:id/screenshot
    DMAPI -> Socket: Emit dm:screenshot-detected
    Socket -> User: Thông báo screenshot
end

@enduml
```
