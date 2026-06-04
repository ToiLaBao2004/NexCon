# Tài liệu các model MongoDB

Tài liệu này mô tả các schema Mongoose trong thư mục `backend/src/models`. Các
path dạng `items[]` là phần tử trong mảng. Các path dạng `map.<key>` là khóa
động, không phải tên field cố định.

## Quy ước chung

Tất cả model cấp cao nhất trong thư mục này đều dùng schema Mongoose và có các
field tự sinh sau:

| Field | Kiểu | Ý nghĩa |
| --- | --- | --- |
| `_id` | `ObjectId` | Khóa chính MongoDB của document. |
| `createdAt` | `Date` | Thời điểm document được tạo. Field này do `{ timestamps: true }` sinh ra. |
| `updatedAt` | `Date` | Thời điểm document được cập nhật gần nhất. Field này do `{ timestamps: true }` sinh ra. |
| `__v` | `Number` | Version key nội bộ của Mongoose, dùng để theo dõi phiên bản document. |

Một số kiểu dữ liệu được dùng xuyên suốt:

| Kiểu | Ý nghĩa |
| --- | --- |
| `ObjectId -> Model` | ID tham chiếu tới một document của model khác qua `ref`. |
| `Mixed` | Dữ liệu linh hoạt, cấu trúc cụ thể phụ thuộc ngữ cảnh nghiệp vụ. |
| `Map<T>` | Map có khóa động và giá trị kiểu `T`. |
| `Date` dùng trong TTL index | MongoDB tự xóa document khi tới hạn theo index TTL. Việc xóa có thể không diễn ra đúng ngay tại từng mili giây. |

## Danh sách model

| File | Model | Mục đích |
| --- | --- | --- |
| `auditLogModel.js` | `AuditLog` | Lưu lịch sử request cần audit. |
| `blockUserModel.js` | `BlockUser` | Lưu quan hệ một người dùng chặn người dùng khác. |
| `conversationModel.js` | `Conversation` | Lưu hội thoại trực tiếp hoặc nhóm và trạng thái theo từng thành viên. |
| `friendModel.js` | `Friend` | Lưu quan hệ bạn bè hai chiều. |
| `friendRequestModel.js` | `FriendRequest` | Lưu lời mời kết bạn. |
| `lockAppealModel.js` | `LockAppeal` | Lưu đơn kháng nghị khóa tài khoản. |
| `meetingModel.js` | `Meeting` | Lưu phòng họp và người tham gia. |
| `messageModel.js` | `Message` | Lưu tin nhắn và trạng thái liên quan. |
| `notificationModel.js` | `Notification` | Lưu thông báo trong ứng dụng. |
| `otpModel.js` | `Otp` | Lưu mã OTP có thời hạn. |
| `pushSubscriptionModel.js` | `PushSubscription` | Lưu đăng ký Web Push của trình duyệt. |
| `reminderModel.js` | `Reminder` | Lưu nhắc việc cá nhân hoặc chia sẻ. |
| `reportModel.js` | `Report` | Lưu báo cáo vi phạm và kết quả xử lý. |
| `sessionModel.js` | `Session` | Lưu phiên đăng nhập dùng refresh token. |
| `userModel.js` | `User` | Lưu tài khoản, hồ sơ và trạng thái kiểm duyệt. |
| `userStatusModel.js` | `UserStatus` | Lưu chế độ và trạng thái hiện diện của người dùng. |

## AuditLog

| Field | Kiểu | Ràng buộc / mặc định | Ý nghĩa |
| --- | --- | --- | --- |
| `userId` | `ObjectId -> User` | Bắt buộc | Người dùng đã thực hiện request được audit. |
| `role` | `String` | Không bắt buộc | Vai trò của người dùng tại thời điểm request, ví dụ `user` hoặc `admin`. |
| `method` | `String` | Bắt buộc | HTTP method của request, ví dụ `GET`, `POST`. |
| `path` | `String` | Bắt buộc | Đường dẫn API được truy cập. |
| `statusCode` | `Number` | Bắt buộc | HTTP status code trả về cho client. |
| `durationMs` | `Number` | Không bắt buộc | Thời gian xử lý request, tính bằng mili giây. |
| `ip` | `String` | Không bắt buộc | Địa chỉ IP của client. |
| `userAgent` | `String` | Không bắt buộc | Chuỗi `User-Agent` của client. |
| `query` | `Mixed` | Không bắt buộc | Các query parameter đã sanitize của request tại thời điểm ghi log. Audit log không lưu request body. |

Audit log được tự xóa sau 60 ngày tính từ `createdAt`.
Middleware hiện chỉ ghi request đã qua auth. Việc ghi chạy theo batch best-effort;
khi queue đầy, log cũ có thể bị bỏ. Lưu ý `path` lấy từ `req.originalUrl`, nên có
thể vẫn chứa query string thô dù field `query` riêng đã được sanitize.

## BlockUser

| Field | Kiểu | Ràng buộc / mặc định | Ý nghĩa |
| --- | --- | --- | --- |
| `from` | `ObjectId -> User` | Bắt buộc | Người thực hiện thao tác chặn. |
| `to` | `ObjectId -> User` | Bắt buộc | Người bị chặn. |

Cặp `from` và `to` là duy nhất: cùng một người không tạo được hai bản ghi chặn
trùng nhau cho cùng một đối tượng.

Ở tầng controller, block còn xóa friendship và lời mời liên quan. Khi gửi lời mời
kết bạn tới người mà chính mình đang block, luồng hiện tại tự unblock trước.

## Conversation

### Field cấp hội thoại

| Field | Kiểu | Ràng buộc / mặc định | Ý nghĩa |
| --- | --- | --- | --- |
| `type` | `String` | Bắt buộc; `direct`, `group` | Loại hội thoại: nhắn tin trực tiếp hoặc nhóm. |
| `directKey` | `String` | Không bắt buộc | Khóa chuẩn hóa từ hai user ID của hội thoại `direct`. Unique partial index giúp bảo đảm một cặp chỉ có một hội thoại khi document đã có key dạng string; lookup vẫn fallback theo participants cho dữ liệu legacy thiếu key. Không dùng cho nhóm. |
| `participants` | `ConversationParticipant[]` | Bắt buộc | Danh sách thành viên và trạng thái riêng của từng thành viên trong hội thoại. |
| `group` | `ConversationGroup` | Không bắt buộc | Thông tin chỉ dành cho hội thoại nhóm. |
| `lastMessage` | `LastMessageSnapshot` | Không bắt buộc | Snapshot tối ưu hiển thị tin gần nhất trong danh sách hội thoại. `Message` vẫn là nguồn canonical; backend có thể query fallback khi snapshot thiếu dữ liệu hoặc bị giới hạn quyền hiển thị. |
| `unreadCounts` | `Map<Number>` | Không bắt buộc | Số tin chưa đọc theo từng người dùng. Khóa là chuỗi user ID, giá trị là số lượng chưa đọc. |
| `unreadCounts.<userId>` | `Number` | Khóa động | Số tin chưa đọc của người dùng tương ứng. |
| `disappearingEnabled` | `Boolean` | Mặc định `false` | Hội thoại có đang bật chế độ tin nhắn tự biến mất hay không. |
| `disappearingAutoDisableSeconds` | `Number` | Từ 60 đến 2.592.000 giây | Khoảng thời gian chế độ tự biến mất được duy trì trước khi hệ thống tự tắt. Đây không phải TTL của từng tin nhắn. |
| `disappearingDisableAt` | `Date` | Không bắt buộc | Thời điểm hệ thống dự kiến tự tắt chế độ tin nhắn tự biến mất. |
| `disappearingEnabledBy` | `ObjectId -> User` | Không bắt buộc | Người gần nhất bật hoặc thay đổi chế độ tin nhắn tự biến mất. |
| `disappearingEnabledAt` | `Date` | Không bắt buộc | Thời điểm chế độ tin nhắn tự biến mất được bật hoặc thay đổi gần nhất. |
| `disbanded` | `Boolean` | Không bắt buộc | Đánh dấu nhóm đã bị giải tán. |
| `disbandedAt` | `Date` | Không bắt buộc | Thời điểm nhóm bị giải tán. |
| `deleteAfter` | `Date` | Không bắt buộc | Thời điểm dự kiến chạy dọn dữ liệu của nhóm đã giải tán. |

### Sub-document `participants[]`

Sub-document này đặt `{ _id: false }`, vì vậy từng phần tử không có `_id` riêng.

| Field | Kiểu | Ràng buộc / mặc định | Ý nghĩa |
| --- | --- | --- | --- |
| `participants[].userId` | `ObjectId -> User` | Bắt buộc | Thành viên của hội thoại. |
| `participants[].userInfo.displayName` | `String` | Không bắt buộc | Snapshot tên hiển thị của thành viên. |
| `participants[].userInfo.avatarUrl` | `String` | Không bắt buộc | Snapshot URL ảnh đại diện của thành viên. |
| `participants[].joinedAt` | `Date` | Mặc định thời điểm tạo | Thời điểm thành viên tham gia hội thoại. |
| `participants[].clearedAt` | `Date` | Không bắt buộc | Mốc thời gian thành viên đã xóa lịch sử chat phía mình; tin tại hoặc trước mốc này không cần hiển thị cho người đó. Khi mọi thành viên đều clear, queue riêng dọn vật lý message/media tới cutoff nhỏ nhất. |
| `participants[].pinnedAt` | `Date` | Không bắt buộc | Thời điểm thành viên ghim hội thoại vào danh sách của riêng mình. |
| `participants[].mute.messages` | `Date` | Không bắt buộc | Thời điểm hết tắt thông báo tin nhắn của thành viên trong hội thoại. |
| `participants[].mute.meetings` | `Date` | Không bắt buộc | Thời điểm hết tắt thông báo cuộc họp/cuộc gọi của thành viên trong hội thoại. |
| `participants[].unreadMentionCount` | `Number` | Không bắt buộc | Số lượt nhắc tên chưa đọc dành cho thành viên. |
| `participants[].lastReadMessageId` | `ObjectId -> Message` | Không bắt buộc | Tin nhắn cuối cùng thành viên đã đọc. |
| `participants[].lastReadAt` | `Date` | Không bắt buộc | Thời điểm thành viên đọc hội thoại gần nhất. |

### Sub-document `group`

Sub-document này đặt `{ _id: false }`.

| Field | Kiểu | Ràng buộc / mặc định | Ý nghĩa |
| --- | --- | --- | --- |
| `group.name` | `String` | Tối đa 100 ký tự | Tên nhóm. |
| `group.avatarUrl` | `String` | Không bắt buộc | URL ảnh đại diện nhóm. |
| `group.avatarId` | `String` | Không bắt buộc | ID public của ảnh đại diện nhóm trên dịch vụ lưu trữ ảnh, dùng khi cần cập nhật hoặc xóa ảnh. |
| `group.createdBy` | `ObjectId -> User` | Không bắt buộc | Người tạo nhóm. |
| `group.admins[]` | `ObjectId -> User` | Không bắt buộc | Danh sách quản trị viên nhóm. |
| `group.isApprovalRequired` | `Boolean` | Không bắt buộc | Có yêu cầu quản trị viên duyệt người mới trước khi vào nhóm hay không. |
| `group.allowMembersChangeAvatar` | `Boolean` | Không bắt buộc | Thành viên thường có được đổi tên hoặc ảnh đại diện nhóm hay không. |
| `group.allowMembersCreateSharedReminder` | `Boolean` | Không bắt buộc | Thành viên thường có được tạo reminder chia sẻ trong nhóm hay không. |
| `group.approvalQueue` | `ApprovalQueueItem[]` | Không bắt buộc | Danh sách người đang chờ được duyệt vào nhóm. |
| `group.approvalQueue[].userId` | `ObjectId -> User` | Bắt buộc | Người đang chờ duyệt. |
| `group.approvalQueue[].addedBy` | `ObjectId -> User` | Bắt buộc | Người đã thêm hoặc mời người chờ duyệt. |
| `group.approvalQueue[].createdAt` | `Date` | Mặc định thời điểm tạo | Thời điểm yêu cầu vào nhóm được đưa vào hàng chờ. |

`group.approvalQueue[]` không có `_id` tự sinh. Ở runtime, thiếu
`group.isApprovalRequired` được hiểu như `false`; hai quyền dành cho thành viên
chỉ bị khóa khi field tương ứng có giá trị `false`.

### Sub-document `lastMessage`

Sub-document này đặt `{ _id: false }`, nhưng có field `_id` chủ động để tham chiếu
tin nhắn gốc.

| Field | Kiểu | Ràng buộc / mặc định | Ý nghĩa |
| --- | --- | --- | --- |
| `lastMessage._id` | `ObjectId -> Message` | Không bắt buộc | ID của tin nhắn gốc được snapshot. |
| `lastMessage.content` | `String` | Không bắt buộc | Nội dung xem trước của tin nhắn cuối. Giá trị được mã hóa khi lưu và giải mã khi đọc qua Mongoose getter/setter. |
| `lastMessage.type` | `String` | Mặc định `text` | Loại tin nhắn cuối. |
| `lastMessage.systemType` | `String` | Không bắt buộc | Loại sự kiện nếu tin cuối là tin hệ thống. |
| `lastMessage.metadata` | `Map<Mixed>` | Không bắt buộc | Metadata linh hoạt đi kèm tin cuối, ví dụ dữ liệu bổ sung của tin hệ thống. |
| `lastMessage.metadata.<key>` | `Mixed` | Khóa động | Một giá trị metadata cụ thể. |
| `lastMessage.senderId` | `ObjectId -> User` | Không bắt buộc | Người gửi tin cuối. |
| `lastMessage.senderInfo.displayName` | `String` | Không bắt buộc | Snapshot tên người gửi tin cuối. |
| `lastMessage.senderInfo.avatarUrl` | `String` | Không bắt buộc | Snapshot ảnh đại diện người gửi tin cuối. |
| `lastMessage.mentions` | `MentionSnapshot[]` | Không bắt buộc | Danh sách người được nhắc tên trong tin cuối. |
| `lastMessage.mentions[].userId` | `ObjectId -> User` | Không bắt buộc | Người được nhắc tên. |
| `lastMessage.mentions[].displayName` | `String` | Không bắt buộc | Tên hiển thị nằm trong đoạn nhắc tên. |
| `lastMessage.mentions[].offset` | `Number` | Không bắt buộc | Vị trí bắt đầu của đoạn nhắc tên trong nội dung. |
| `lastMessage.mentions[].length` | `Number` | Không bắt buộc | Độ dài đoạn nhắc tên. |
| `lastMessage.deliveredTo[]` | `ObjectId -> User` | Không bắt buộc | Danh sách người đã nhận tin cuối. |
| `lastMessage.expiresAt` | `Date` | Không bắt buộc | Thời điểm tin cuối tự biến mất nếu thuộc chế độ disappearing message. |
| `lastMessage.isExpired` | `Boolean` | Không bắt buộc | Tin cuối đã hết hạn hay chưa. |
| `lastMessage.createdAt` | `Date` | Không bắt buộc | Thời điểm tạo tin gốc. |

`lastMessage.mentions[]` không có `_id` tự sinh.

### Sub-document `cleanup`

| Field | Kiểu | Ràng buộc / mặc định | Ý nghĩa |
| --- | --- | --- | --- |
| `cleanup.status` | `String` | `idle`, `queued`, `processing`, `completed`, `failed` | Trạng thái job dọn dữ liệu của nhóm đã giải tán. |
| `cleanup.jobId` | `String` | Không bắt buộc | ID job trong hàng đợi xử lý nền. |
| `cleanup.queuedAt` | `Date` | Không bắt buộc | Thời điểm job được đưa vào queue. |
| `cleanup.scheduledFor` | `Date` | Không bắt buộc | Thời điểm job được lên lịch chạy. |
| `cleanup.retentionDays` | `Number` | Không bắt buộc | Số ngày giữ dữ liệu trước khi dọn. |
| `cleanup.startedAt` | `Date` | Không bắt buộc | Thời điểm bắt đầu dọn. |
| `cleanup.completedAt` | `Date` | Không bắt buộc | Thời điểm dọn xong. |
| `cleanup.failedAt` | `Date` | Không bắt buộc | Thời điểm job dọn thất bại gần nhất. |
| `cleanup.error` | `String` | Không bắt buộc | Thông báo lỗi gần nhất của job dọn. |

`cleanup.*` dùng cho dọn nhóm đã giải tán, độc lập với queue dọn tin sau khi các
thành viên clear lịch sử phía mình.

## Friend

Khi tạo mới, model sắp xếp `userA` và `userB` theo chuỗi ID để một cặp bạn bè luôn
có cùng thứ tự lưu trữ.

| Field | Kiểu | Ràng buộc / mặc định | Ý nghĩa |
| --- | --- | --- | --- |
| `userA` | `ObjectId -> User` | Bắt buộc | Người dùng thứ nhất sau khi chuẩn hóa thứ tự ID. |
| `userB` | `ObjectId -> User` | Bắt buộc | Người dùng thứ hai sau khi chuẩn hóa thứ tự ID. |
| `nicknameA` | `String` | Không bắt buộc | Biệt danh mà `userB` đặt cho `userA`. |
| `nicknameB` | `String` | Không bắt buộc | Biệt danh mà `userA` đặt cho `userB`. |

Tầng controller hiện giới hạn tối đa 500 bạn bè trên mỗi người dùng.

## FriendRequest

| Field | Kiểu | Ràng buộc / mặc định | Ý nghĩa |
| --- | --- | --- | --- |
| `from` | `ObjectId -> User` | Bắt buộc | Người gửi lời mời kết bạn. |
| `to` | `ObjectId -> User` | Bắt buộc | Người nhận lời mời kết bạn. |
| `message` | `String` | Tối đa 300 ký tự | Lời nhắn kèm theo lời mời. |
| `status` | `String` | Mặc định `pending`; `pending`, `accepted`, `rejected` | Trạng thái xử lý lời mời. |

Mỗi cặp `from` và `to` chỉ có một lời mời. Document được tự xóa sau 30 ngày tính
từ `createdAt`. Schema cũng có hook xóa lời mời `accepted` sau thao tác
`findOneAndUpdate`; hook này không áp dụng cho mọi cách cập nhật document. Luồng
controller thường dùng `.save()`, vì vậy bản ghi accepted có thể còn tồn tại tới
TTL. Gửi lại lời mời không reset `createdAt`.

Tầng controller hiện giới hạn 100 lời mời `pending` gửi đi. Nếu đã có lời mời
`pending` theo chiều ngược lại, gửi mới sẽ tự accept quan hệ bạn bè.

## LockAppeal

| Field | Kiểu | Ràng buộc / mặc định | Ý nghĩa |
| --- | --- | --- | --- |
| `userId` | `ObjectId -> User` | Không bắt buộc | Tài khoản bị khóa gửi kháng nghị, nếu xác định được user. |
| `email` | `String` | Bắt buộc | Email tài khoản dùng để gửi và tra cứu kháng nghị. |
| `reason` | `String` | Bắt buộc; tối đa 2.000 ký tự | Nội dung giải trình của người dùng. |
| `status` | `String` | Mặc định `pending`; `pending`, `approved`, `rejected` | Trạng thái xét duyệt kháng nghị. |
| `reviewedBy` | `ObjectId -> User` | Không bắt buộc | Quản trị viên đã xét duyệt. |
| `reviewedAt` | `Date` | Không bắt buộc | Thời điểm xét duyệt. |
| `adminNote` | `String` | Tối đa 1.000 ký tự | Ghi chú của quản trị viên. |
| `expiresAt` | `Date` | Không bắt buộc | Thời điểm document được phép tự xóa sau khi hoàn tất xử lý. |

`expiresAt` có TTL index. Luồng xử lý hiện tại đặt hạn 180 ngày sau khi duyệt;
kháng nghị `pending` không tự hết hạn.

API hiện yêu cầu `reason` dài ít nhất 20 ký tự và chỉ cho một kháng nghị `pending`
trên mỗi người dùng. Khi approve, luồng xử lý mở khóa và reset giá trị vi phạm.

## Meeting

| Field | Kiểu | Ràng buộc / mặc định | Ý nghĩa |
| --- | --- | --- | --- |
| `roomName` | `String` | Bắt buộc; duy nhất | Tên phòng dùng để định danh cuộc họp, ví dụ khi kết nối LiveKit. Controller chuẩn hóa chữ thường và kiểm tra format `^[a-z]{3}-[a-z]{4}-[a-z]{3}$`. |
| `hostId` | `ObjectId -> User` | Bắt buộc | Người chủ trì cuộc họp. |
| `conversationId` | `ObjectId -> Conversation` | Không bắt buộc | Hội thoại gắn với cuộc họp. |
| `status` | `String` | Mặc định `active`; `scheduled`, `active`, `ended` | Trạng thái vòng đời cuộc họp. |
| `scheduledAt` | `Date` | Không bắt buộc | Thời điểm dự kiến bắt đầu cuộc họp. |
| `startedAt` | `Date` | Không bắt buộc | Thời điểm cuộc họp thực tế bắt đầu. |
| `endedAt` | `Date` | Không bắt buộc | Thời điểm cuộc họp kết thúc. |
| `participants` | `MeetingParticipant[]` | Tối đa 100 phần tử | Danh sách người đã tham gia cuộc họp. |
| `waitingRoom[]` | `ObjectId -> User` | Tối đa 100 phần tử | Danh sách người đang chờ được duyệt vào phòng. |
| `requireApproval` | `Boolean` | Mặc định `true` | Có yêu cầu host duyệt người vào phòng hay không. |

### Sub-document `participants[]`

Sub-document này đặt `{ _id: false }`.

| Field | Kiểu | Ràng buộc / mặc định | Ý nghĩa |
| --- | --- | --- | --- |
| `participants[].userId` | `ObjectId -> User` | Bắt buộc | Người tham gia cuộc họp. |
| `participants[].joinedAt` | `Date` | Mặc định thời điểm tạo | Thời điểm người dùng vào phòng. |

Cuộc họp có `status = ended` được tự xóa sau 7 ngày tính từ `updatedAt`.
Người trong `waitingRoom[]` bị loại sau 5 phút qua BullMQ; đây không phải TTL
MongoDB. Các luồng tạo hiện tại có thể ghi `status = active` ngay cả khi có
`scheduledAt`; enum `scheduled` vẫn được schema và luồng join hỗ trợ.

## Message

| Field | Kiểu | Ràng buộc / mặc định | Ý nghĩa |
| --- | --- | --- | --- |
| `conversationId` | `ObjectId -> Conversation` | Bắt buộc | Hội thoại chứa tin nhắn. |
| `senderId` | `ObjectId -> User` | Bắt buộc | Người gửi tin nhắn. |
| `senderInfo.displayName` | `String` | Không bắt buộc | Snapshot tên hiển thị của người gửi. |
| `senderInfo.avatarUrl` | `String` | Không bắt buộc | Snapshot URL ảnh đại diện của người gửi. |
| `mentions` | `MessageMention[]` | Không bắt buộc | Danh sách đoạn nhắc tên trong nội dung. |
| `mentions[]._id` | `ObjectId` | Tự sinh | ID nội bộ của phần tử nhắc tên. |
| `mentions[].userId` | `ObjectId -> User` | Bắt buộc | Người được nhắc tên. |
| `mentions[].displayName` | `String` | Không bắt buộc | Tên hiển thị được dùng trong đoạn nhắc tên. |
| `mentions[].offset` | `Number` | Không bắt buộc | Vị trí bắt đầu của đoạn nhắc tên trong nội dung. |
| `mentions[].length` | `Number` | Không bắt buộc | Độ dài đoạn nhắc tên. |
| `type` | `String` | Mặc định `text`; xem bảng loại tin nhắn | Loại nội dung tin nhắn. |
| `content` | `String` | Không bắt buộc | Nội dung chính. Giá trị được mã hóa khi lưu và giải mã khi đọc qua Mongoose getter/setter. |
| `systemType` | `String` | Không bắt buộc; xem bảng sự kiện hệ thống | Loại sự kiện nếu `type = system`. |
| `metadata` | `Map<Mixed>` | Không bắt buộc | Dữ liệu linh hoạt bổ sung cho tin nhắn, đặc biệt là tin hệ thống. |
| `metadata.<key>` | `Mixed` | Khóa động | Một giá trị metadata cụ thể. |
| `searchContent` | `String` | Không chọn mặc định khi query | Nội dung đã chuẩn hóa tiếng Việt để hỗ trợ tìm kiếm. Field được tạo trong pre-save hook, mã hóa khi lưu, không dùng cho sticker và bị unset khi tin hết hạn. Vì mã hóa at-rest, tìm kiếm lọc tiếp ở application layer sau khi giải mã. |
| `filePublicId` | `String` | Không bắt buộc | ID public của file trên dịch vụ lưu trữ, dùng khi cần quản lý hoặc xóa file. |
| `fileName` | `String` | Không bắt buộc | Tên file gốc hoặc tên hiển thị. |
| `fileSize` | `Number` | Không bắt buộc | Kích thước file, tính bằng byte. |
| `mimeType` | `String` | Không bắt buộc | MIME type của file, ảnh hoặc audio. |
| `isPinned` | `Boolean` | Không bắt buộc | Tin nhắn có đang được ghim hay không. |
| `pinnedAt` | `Date` | Không bắt buộc | Thời điểm ghim tin nhắn. |
| `isRecalled` | `Boolean` | Không bắt buộc | Tin nhắn đã bị thu hồi hay chưa. |
| `reportStatus` | `Boolean` | Không bắt buộc | Cờ ẩn tin nhắn do moderation xác định vi phạm, không phải cờ cho biết đã có người gửi report. Background image moderation có thể đặt cờ này trực tiếp. |
| `reportReview.reportId` | `ObjectId -> Report` | Không bắt buộc | Báo cáo liên quan tới quyết định xử lý tin nhắn. Nhóm `reportReview.*` thường chỉ có khi xử lý report; ảnh bị background moderation từ chối có thể không có nhóm này. |
| `reportReview.reviewedBy` | `ObjectId -> User` | Không bắt buộc | Quản trị viên đã xử lý. |
| `reportReview.reviewedAt` | `Date` | Không bắt buộc | Thời điểm xử lý. |
| `reportReview.note` | `String` | Tối đa 1.000 ký tự | Ghi chú khi xử lý. |
| `replyTo` | `ObjectId -> Message` | Không bắt buộc | Tin nhắn gốc mà tin hiện tại đang trả lời. |
| `reactions` | `MessageReaction[]` | Không bắt buộc | Danh sách cảm xúc người dùng đã thả vào tin nhắn. |
| `reactions[]._id` | `ObjectId` | Tự sinh | ID nội bộ của phần tử reaction. |
| `reactions[].userId` | `ObjectId -> User` | Bắt buộc | Người thả reaction. |
| `reactions[].emoji` | `String` | Bắt buộc | Emoji hoặc mã reaction đã chọn. |
| `deliveredTo[]` | `ObjectId -> User` | Không bắt buộc | Delivery ACK: danh sách người đã nhận tin nhắn qua socket, được cập nhật theo kiểu không thêm trùng. |
| `deliveryStartedAt` | `Date` | Không bắt buộc | Mốc server bắt đầu tính TTL khi tạo hoặc forward disappearing message; đây không phải ACK của người nhận. |
| `expiresAt` | `Date` | Không bắt buộc | Thời điểm tin nhắn tự biến mất, hiện được tính bằng `deliveryStartedAt + 24 giờ`. Đây là field được worker xử lý, không phải MongoDB TTL index xóa document. |
| `isExpired` | `Boolean` | Mặc định `false` | Tin nhắn đã được worker đánh dấu hết hạn hay chưa. Khi đọc, tin cũng được xem là hết hạn nếu `expiresAt <= now` dù worker chưa kịp cập nhật field này. |
| `expiredAt` | `Date` | Không bắt buộc | Thời điểm hệ thống đánh dấu tin đã hết hạn. |
| `expiryMediaCleanupStatus` | `String` | `pending`, `completed`, `failed`, `skipped` | Trạng thái dọn file media sau khi disappearing message hết hạn. `skipped` gồm trường hợp không có media hoặc media vẫn được tin khác tham chiếu. |

### Giá trị `type`

| Giá trị | Ý nghĩa |
| --- | --- |
| `text` | Tin nhắn văn bản. |
| `image` | Tin nhắn ảnh. |
| `audio` | Tin nhắn âm thanh. |
| `file` | Tin nhắn file đính kèm. |
| `link` | Tin nhắn chứa liên kết. |
| `system` | Tin hệ thống mô tả một sự kiện. |
| `sticker` | Tin nhắn sticker. |

### Giá trị `systemType`

| Nhóm | Giá trị |
| --- | --- |
| Thành viên và nhóm | `member_added`, `member_kicked`, `member_left`, `group_disbanded`, `admin_transferred`, `group_avatar_updated`, `group_name_updated`, `approval_mode_changed`, `group_avatar_permission_changed` |
| Cuộc gọi | `call_started`, `call_ended`, `call` |
| Tin nhắn | `chat_cleared`, `message_pinned`, `message_unpinned`, `disappearing_messages_enabled`, `disappearing_messages_disabled` |
| Reminder | `reminder_created_local`, `shared_reminder_created`, `shared_reminder_participation_changed`, `shared_reminder_cancelled`, `shared_reminder_updated`, `shared_reminder_permission_changed` |

Một số giá trị là contract legacy hoặc dự phòng: backend hiện persist cuộc gọi
chủ yếu bằng `call`; không thấy producer hiện tại cho `call_started`,
`call_ended` và `chat_cleared`.

### Các key `metadata` quan trọng

`metadata` là payload mở, không được mã hóa và không được schema validate sâu.
Metadata client gửi lên thường chỉ được whitelist nhóm `clientBatch*`; phần lớn
key còn lại do server ghi. Các contract dưới đây được dùng trong backend hiện
tại:

| Nhóm | Key thường dùng | Ý nghĩa |
| --- | --- | --- |
| Quyền hiển thị | `visibleToUserIds[]` | Giới hạn người được thấy tin nhắn, ví dụ tin reminder cá nhân hoặc rời nhóm im lặng. |
| Gửi theo batch / forward | `clientBatchId`, `clientBatchIndex`, `clientBatchSize`, `forwardedFrom` | Gom batch tin gửi cùng lúc và lưu dấu vết tin được chuyển tiếp. |
| Link, audio, image | `linkPreview`, `transcript`, `transcriptStatus`, `imageModerationStatus`, `imageModerationCategory`, `imageModerationReason` | Dữ liệu xử lý nội dung theo loại tin. |
| Nhóm | Các key dạng `addedBy*`, `addedUser*`, `kickedUser*`, `leftUser*`, `updatedBy*`, `appointedBy*`, `appointedUser*`, `disbandedBy`, `changedBy*` | Dữ liệu bổ sung cho sự kiện thành viên, admin và cấu hình nhóm. |
| Ghim tin | `actionBy`, `actionByName`, `targetMessageId`, `targetMessageType` | Người thao tác và tin nhắn đích khi ghim hoặc bỏ ghim. |
| Cuộc gọi | `callId`, `mode`, `callType`, `overallStatus`, `duration`, `startedAt`, `endedAt`, `initiatorUser`, `participants` | Snapshot thông tin cuộc gọi. |
| Disappearing message | `actorId`, `actorName`, `enabled`, `durationSeconds`, `autoDisabled` | Người thay đổi và cấu hình chế độ tin tự biến mất. |
| Reminder | `reminderId`, `reminderContent`, `remindAt`, `sharedKey`, `creator*`, `participant*`, `sourceType`, `meetingRoomName`, `isCancelled`, `action`, `changedFields` | Snapshot và thay đổi của reminder được biểu diễn dưới dạng tin hệ thống. |

## Notification

| Field | Kiểu | Ràng buộc / mặc định | Ý nghĩa |
| --- | --- | --- | --- |
| `userId` | `ObjectId -> User` | Bắt buộc | Người sở hữu và nhận thông báo. |
| `title` | `String` | Bắt buộc | Tiêu đề thông báo. |
| `content` | `String` | Bắt buộc | Nội dung thông báo. |
| `linkUrl` | `String` | Bắt buộc | URL client điều hướng tới khi người dùng mở thông báo. |
| `type` | `String` | Mặc định `generic`; chuỗi mở, không có enum | Loại nghiệp vụ của thông báo. |
| `targetId` | `ObjectId -> Message` | Không bắt buộc | Tin nhắn đích liên quan tới thông báo, nếu có. |
| `actorId` | `ObjectId -> User` | Không bắt buộc | Người gây ra sự kiện tạo thông báo. |
| `recipientId` | `ObjectId -> User` | Không bắt buộc | Người nhận theo ngữ nghĩa nghiệp vụ; service mặc định dùng cùng giá trị với `userId`. |
| `metadata` | `Mixed` | Không bắt buộc | Dữ liệu mở rộng tùy loại thông báo. |
| `isRead` | `Boolean` | Mặc định `false` | Người dùng đã đọc thông báo hay chưa. |

Thông báo được tự xóa sau 30 ngày tính từ `createdAt`.
Một số type đang được dùng là `mention`, `security`, `report-result`,
`account-lock` và `dm_screenshot`.

## Otp

| Field | Kiểu | Ràng buộc / mặc định | Ý nghĩa |
| --- | --- | --- | --- |
| `email` | `String` | Bắt buộc | Email nhận OTP. Giá trị được trim và chuyển thành chữ thường. |
| `otp` | `String` | Bắt buộc | Mã OTP cần xác thực. |
| `type` | `String` | Bắt buộc; `verification`, `reset_password` | Mục đích sử dụng OTP: xác thực tài khoản hoặc đặt lại mật khẩu. |
| `expiresAt` | `Date` | Bắt buộc | Hạn sử dụng OTP. |

OTP được tự xóa khi tới `expiresAt`.
Các luồng hiện tại tạo OTP với hạn thông thường 5 phút và cooldown gửi lại 60
giây. OTP đặt lại mật khẩu bị xóa sau khi verify.

## PushSubscription

| Field | Kiểu | Ràng buộc / mặc định | Ý nghĩa |
| --- | --- | --- | --- |
| `userId` | `ObjectId -> User` | Bắt buộc | Người dùng sở hữu đăng ký Web Push. |
| `endpoint` | `String` | Bắt buộc; duy nhất; tối đa 2.048 ký tự | URL HTTPS do push service của trình duyệt cấp để gửi Web Push. |
| `keys.p256dh` | `String` | Bắt buộc; tối đa 512 ký tự | Public key dùng trong mã hóa payload Web Push. |
| `keys.auth` | `String` | Bắt buộc; tối đa 512 ký tự | Secret xác thực dùng trong mã hóa payload Web Push. |
| `userAgent` | `String` | Tối đa 512 ký tự | Thông tin trình duyệt hoặc thiết bị đã đăng ký. |

Subscription được tự xóa sau 90 ngày tính từ `createdAt`. Khi push service trả về
`404` hoặc `410`, service cũng xóa subscription không còn hợp lệ.
Subscribe lại endpoint cũ dùng upsert nhưng không refresh `createdAt`, nên TTL
vẫn tính từ lần insert đầu. `endpoint` là duy nhất toàn hệ thống và có thể được
gán lại sang user khác khi subscribe lại.

## Reminder

| Field | Kiểu | Ràng buộc / mặc định | Ý nghĩa |
| --- | --- | --- | --- |
| `userId` | `ObjectId -> User` | Bắt buộc | Người nhận bản ghi reminder này. Với reminder chia sẻ, mỗi người tham gia có một document riêng. |
| `scope` | `String` | Mặc định `personal`; `personal`, `shared` | Phạm vi reminder: cá nhân hoặc chia sẻ. |
| `sharedKey` | `String` | Tối đa 128 ký tự | Khóa gom các document của cùng một reminder chia sẻ. Cặp `(sharedKey, userId)` là duy nhất khi `scope = shared`. |
| `conversationId` | `ObjectId -> Conversation` | Không bắt buộc | Hội thoại liên quan, đặc biệt với reminder chia sẻ trong chat. |
| `meetingId` | `ObjectId -> Meeting` | Không bắt buộc | Cuộc họp liên quan. |
| `meetingRoomName` | `String` | Không bắt buộc | Tên phòng họp để điều hướng hoặc gửi thông báo reminder cuộc họp. |
| `createdBy` | `ObjectId -> User` | Không bắt buộc | Người tạo reminder. |
| `participationStatus` | `String` | Mặc định `joined`; `joined`, `declined` | Người nhận đang tham gia hay đã từ chối reminder chia sẻ. |
| `content` | `String` | Bắt buộc; tối đa 1.200 ký tự | Nội dung reminder hiện tại. Hook tương thích dữ liệu cũ sẽ ghép `title` và `note` làm fallback nếu field này trống. |
| `title` | `String` | Legacy; tối đa 200 ký tự | Tiêu đề theo cấu trúc cũ, giữ lại để tương thích dữ liệu trước migration. |
| `note` | `String` | Legacy; tối đa 1.000 ký tự | Ghi chú theo cấu trúc cũ, giữ lại để tương thích dữ liệu trước migration. |
| `remindAt` | `Date` | Bắt buộc | Thời điểm cần nhắc. |
| `snoozeUntil` | `Date` | Không bắt buộc | Thời điểm nhắc lại sau khi người dùng hoãn reminder. |
| `snoozeCount` | `Number` | Tối thiểu 0 | Số lần người dùng đã hoãn reminder. |
| `repeatRule` | `String` | Mặc định `none`; `none`, `daily`, `weekly`, `monthly` | Quy tắc lặp lại reminder. |
| `status` | `String` | Mặc định `pending`; `pending`, `triggered`, `snoozed`, `dismissed` | Trạng thái vòng đời reminder. |
| `dismissedAt` | `Date` | Không bắt buộc | Thời điểm reminder bị bỏ qua hoặc kết thúc tham gia. |
| `source` | `ReminderSource` | Không bắt buộc | Nguồn tạo reminder. |
| `notifyChannels[]` | `String` | Mặc định `['inapp']`; `inapp`, `email`; ít nhất một phần tử | Các kênh dùng để gửi nhắc việc. Worker kiểm tra `email` trực tiếp; socket, push và in-app còn đi qua logic giao nhận riêng. |

### Sub-document `source`

Sub-document này đặt `{ _id: false }`.

| Field | Kiểu | Ràng buộc / mặc định | Ý nghĩa |
| --- | --- | --- | --- |
| `source.type` | `String` | `manual`, `message`, `meeting` | Nguồn nghiệp vụ: tạo thủ công, từ tin nhắn hoặc từ cuộc họp. Giá trị legacy `call` được chuẩn hóa thành `meeting`. |
| `source.refId` | `String` | Tối đa 128 ký tự | ID tham chiếu của nguồn. Với source `message`, helper validation yêu cầu field này dù schema không đặt `required`. |

Vòng đời tự xóa:

| Điều kiện | Mốc tính TTL | Thời gian giữ |
| --- | --- | --- |
| Reminder cá nhân đã `triggered` | `updatedAt` | 30 ngày |
| Reminder cá nhân đã `dismissed` | `dismissedAt` | 30 ngày |
| Reminder chia sẻ, bất kể `status` | `remindAt` | 30 ngày sau thời điểm nhắc |

Ở tầng controller, reminder chỉ cho snooze 5, 10, 30 hoặc 60 phút và tối đa 20
lần. `remindAt` phải cách thời điểm hiện tại hơn 10 giây. Luồng tạo cũng giới hạn
10 reminder đang chờ trên mỗi creator và 3 reminder chia sẻ đang chờ trên mỗi
hội thoại.

## Report

| Field | Kiểu | Ràng buộc / mặc định | Ý nghĩa |
| --- | --- | --- | --- |
| `reporterId` | `ObjectId -> User` | Bắt buộc | Người gửi báo cáo. |
| `targetType` | `String` | Bắt buộc; `message`, `user` | Đối tượng báo cáo là tin nhắn hay người dùng. |
| `targetUserId` | `ObjectId -> User` | Bắt buộc | Người dùng bị báo cáo hoặc người gửi tin nhắn bị báo cáo. |
| `targetMessageId` | `ObjectId -> Message` | Không bắt buộc | Tin nhắn bị báo cáo nếu `targetType = message`. |
| `conversationId` | `ObjectId -> Conversation` | Không bắt buộc | Hội thoại liên quan: có thể là nơi chứa tin bị báo cáo hoặc ngữ cảnh đính kèm cho user report. |
| `reasonCategory` | `String` | Bắt buộc; xem bảng lý do | Nhóm lý do báo cáo. |
| `description` | `String` | Tối đa 1.000 ký tự | Mô tả bổ sung do người báo cáo nhập. |
| `status` | `String` | Mặc định `pending`; `pending`, `reviewing`, `resolved`, `dismissed` | Trạng thái xử lý báo cáo. |
| `reporterSnapshot.displayName` | `String` | Không bắt buộc | Snapshot tên người báo cáo. |
| `reporterSnapshot.email` | `String` | Không bắt buộc | Snapshot email người báo cáo. |
| `reporterSnapshot.avatarUrl` | `String` | Không bắt buộc | Snapshot ảnh người báo cáo. |
| `targetUserSnapshot.displayName` | `String` | Không bắt buộc | Snapshot tên người bị báo cáo. |
| `targetUserSnapshot.email` | `String` | Không bắt buộc | Snapshot email người bị báo cáo. |
| `targetUserSnapshot.avatarUrl` | `String` | Không bắt buộc | Snapshot ảnh người bị báo cáo. |
| `messageSnapshot` | `ReportMessageSnapshot` | Không bắt buộc | Snapshot nội dung tin nhắn để admin vẫn có ngữ cảnh khi dữ liệu gốc thay đổi. |
| `review.reviewedBy` | `ObjectId -> User` | Không bắt buộc | Admin phụ trách review. |
| `review.reviewedAt` | `Date` | Không bắt buộc | Thời điểm review. |
| `review.note` | `String` | Tối đa 1.000 ký tự | Ghi chú review. |
| `resolution.decision` | `String` | `violation`, `no_violation`, `null` | Kết luận có vi phạm hay không. |
| `resolution.actionTaken` | `String` | Tối đa 1.000 ký tự | Hành động xử lý đã thực hiện. |
| `resolution.targetViolationCount` | `Number` | Không bắt buộc | Giá trị vi phạm đang hoạt động của đối tượng sau khi xử lý và áp dụng decay, không phải tổng lịch sử. |
| `resolution.targetLocked` | `Boolean` | Không bắt buộc | Đối tượng có bị khóa sau khi xử lý hay không. |
| `resolution.reporterMessage` | `String` | Tối đa 1.000 ký tự | Nội dung phản hồi dành cho người báo cáo. |
| `resolution.targetMessage` | `String` | Tối đa 1.000 ký tự | Nội dung phản hồi dành cho người bị báo cáo. |
| `resolution.aiModeration.reviewedAt` | `Date` | Không bắt buộc | Thời điểm AI moderation đánh giá nội dung. |
| `resolution.aiModeration.blocked` | `Boolean` | Không bắt buộc | AI có kết luận nên chặn nội dung hay không. |
| `resolution.aiModeration.category` | `String` | Tối đa 80 ký tự | Nhóm vi phạm do AI nhận diện. |
| `resolution.aiModeration.confidence` | `Number` | Không bắt buộc | Điểm tin cậy của kết quả AI moderation. |
| `resolution.aiModeration.reason` | `String` | Tối đa 1.000 ký tự | Lý do AI đưa ra kết luận. |
| `resolution.aiModeration.source` | `String` | Tối đa 80 ký tự | Nguồn hoặc bộ phân loại đã tạo kết quả AI moderation. |
| `expiresAt` | `Date` | Không bắt buộc | Thời điểm báo cáo đã hoàn tất được phép tự xóa. |

### Giá trị `reasonCategory`

| Giá trị | Ý nghĩa |
| --- | --- |
| `spam` | Nội dung rác hoặc gửi lặp gây phiền. |
| `harassment` | Quấy rối. |
| `hate_speech` | Ngôn từ thù ghét. |
| `sexual_content` | Nội dung tình dục không phù hợp. |
| `violence` | Nội dung bạo lực. |
| `scam` | Lừa đảo. |
| `impersonation` | Mạo danh. |
| `self_harm` | Nội dung liên quan tự gây hại. |
| `other` | Lý do khác. |

### Sub-document `messageSnapshot`

Sub-document này đặt `{ _id: false }`.

| Field | Kiểu | Ràng buộc / mặc định | Ý nghĩa |
| --- | --- | --- | --- |
| `messageSnapshot.type` | `String` | Không bắt buộc | Loại tin nhắn tại thời điểm báo cáo. |
| `messageSnapshot.content` | `String` | Không bắt buộc | Nội dung tin nhắn tại thời điểm báo cáo. |
| `messageSnapshot.fileName` | `String` | Không bắt buộc | Tên file đính kèm tại thời điểm báo cáo. |
| `messageSnapshot.mimeType` | `String` | Không bắt buộc | MIME type file đính kèm. |
| `messageSnapshot.mentions` | `ReportMentionSnapshot[]` | Không bắt buộc | Snapshot các đoạn nhắc tên. |
| `messageSnapshot.mentions[].userId` | `ObjectId -> User` | Không bắt buộc | Người được nhắc tên. |
| `messageSnapshot.mentions[].displayName` | `String` | Không bắt buộc | Tên hiển thị trong đoạn nhắc tên. |
| `messageSnapshot.mentions[].offset` | `Number` | Không bắt buộc | Vị trí bắt đầu đoạn nhắc tên. |
| `messageSnapshot.mentions[].length` | `Number` | Không bắt buộc | Độ dài đoạn nhắc tên. |
| `messageSnapshot.createdAt` | `Date` | Không bắt buộc | Thời điểm tin nhắn gốc được tạo. |
| `messageSnapshot.senderInfo` | `Mixed` | Không bắt buộc | Snapshot linh hoạt về người gửi, ví dụ tên và ảnh đại diện. |

Schema hỗ trợ `messageSnapshot.mentions[]`, nhưng writer hiện tại thay tag mention
thành text và chưa ghi mảng này.

`expiresAt` có TTL index. Luồng xử lý hiện tại đặt hạn 90 ngày sau khi báo cáo
chuyển thành `resolved` hoặc `dismissed`; báo cáo đang xử lý không tự hết hạn.

## Session

| Field | Kiểu | Ràng buộc / mặc định | Ý nghĩa |
| --- | --- | --- | --- |
| `userId` | `ObjectId -> User` | Bắt buộc | Người dùng sở hữu phiên đăng nhập. |
| `refreshToken` | `String` | Bắt buộc; duy nhất | Hash SHA-256 của refresh token dùng để cấp access token mới. Code vẫn hỗ trợ migration session cũ lưu token plaintext. |
| `expiresAt` | `Date` | Bắt buộc | Hạn sử dụng của session và refresh token. |
| `deviceInfo.userAgent` | `String` | Không bắt buộc | User agent của thiết bị đăng nhập. |
| `deviceInfo.ip` | `String` | Không bắt buộc | IP của thiết bị đăng nhập. |
| `deviceInfo.deviceName` | `String` | Không bắt buộc | Tên thiết bị hiển thị cho người dùng. |
| `fcmTokens[]` | `String` | Mỗi phần tử tối đa 4.096 ký tự | Các Firebase Cloud Messaging token gắn với session. |

Session được tự xóa khi tới `expiresAt`.
Luồng auth hiện đặt refresh session thông thường là 14 ngày, access token là 30
phút và giới hạn tối đa 20 session hoạt động trên mỗi user.

## User

| Field | Kiểu | Ràng buộc / mặc định | Ý nghĩa |
| --- | --- | --- | --- |
| `email` | `String` | Bắt buộc; duy nhất | Email đăng nhập. Giá trị được trim và chuyển thành chữ thường. |
| `password` | `String` | Bắt buộc | Credential secret của tài khoản. Tài khoản mật khẩu lưu hash; implementation OAuth hiện có thể lưu chuỗi random placeholder chưa hash. |
| `displayName` | `String` | Bắt buộc | Tên hiển thị. |
| `avatarUrl` | `String` | Không bắt buộc | URL CDN của ảnh đại diện. |
| `avatarId` | `String` | Không bắt buộc | Public ID của ảnh đại diện trên Cloudinary, dùng khi cập nhật hoặc xóa ảnh. |
| `bio` | `String` | Schema tối đa 500 ký tự | Nội dung giới thiệu cá nhân. API cập nhật hồ sơ hiện giới hạn 150 ký tự. |
| `phone` | `String` | Không bắt buộc | Số điện thoại. API hiện chỉ nhận chữ số và tối đa 15 ký tự. |
| `profileVisibility` | `String` | `public`, `friends`, `private` | Phạm vi người được xem hồ sơ. Schema không đặt default; tầng runtime fallback về `public` khi field trống. |
| `googleId` | `String` | Duy nhất nếu có | ID tài khoản Google dùng cho đăng nhập OAuth. |
| `music.trackId` | `String` | Schema tối đa 22 ký tự | ID bài hát Spotify gắn trên hồ sơ. API hiện yêu cầu đúng 22 ký tự chữ-số. |
| `role` | `String` | Mặc định `user`; `user`, `admin` | Vai trò phân quyền của tài khoản. |
| `fcmTokens[]` | `String` | Mỗi phần tử tối đa 4.096 ký tự | Các Firebase Cloud Messaging token gắn với người dùng. |

### Sub-document `lock`

| Field | Kiểu | Ràng buộc / mặc định | Ý nghĩa |
| --- | --- | --- | --- |
| `lock.isLocked` | `Boolean` | Không bắt buộc | Tài khoản hiện có bị khóa hay không. |
| `lock.lockedAt` | `Date` | Không bắt buộc | Thời điểm khóa gần nhất. |
| `lock.expiresAt` | `Date` | Không bắt buộc | Thời điểm dự kiến khóa tạm thời hết hiệu lực; `null` có thể biểu thị khóa không thời hạn. Hiện chưa có worker tự mở khóa, auth vẫn chặn khi `lock.isLocked = true`. |
| `lock.lockedBy` | `ObjectId -> User` | Không bắt buộc | Admin đã khóa tài khoản; có thể trống nếu hệ thống tự động khóa. |
| `lock.reason` | `String` | Tối đa 1.000 ký tự | Lý do khóa tài khoản. |
| `lock.unlockedAt` | `Date` | Không bắt buộc | Thời điểm mở khóa gần nhất. |
| `lock.unlockedBy` | `ObjectId -> User` | Không bắt buộc | Admin đã mở khóa tài khoản. |

### Sub-document `moderation`

| Field | Kiểu | Ràng buộc / mặc định | Ý nghĩa |
| --- | --- | --- | --- |
| `moderation.violationCountCache` | `Number` | Không bắt buộc | Giá trị vi phạm hiện tại đã cache để quyết định cảnh báo hoặc khóa tài khoản. |
| `moderation.lastViolationAt` | `Date` | Không bắt buộc | Thời điểm ghi nhận vi phạm gần nhất. |
| `moderation.nextViolationDecayAt` | `Date` | Không bắt buộc | Thời điểm dự kiến giảm giá trị vi phạm theo chính sách decay. |
| `moderation.violationHistory` | `ModerationViolation[]` | Không bắt buộc | Lịch sử các lần ghi nhận vi phạm. |

### Sub-document `moderation.violationHistory[]`

Mỗi phần tử có `_id` riêng vì schema đặt `{ _id: true }`.

| Field | Kiểu | Ràng buộc / mặc định | Ý nghĩa |
| --- | --- | --- | --- |
| `moderation.violationHistory[]._id` | `ObjectId` | Tự sinh | ID của lần ghi nhận vi phạm. |
| `moderation.violationHistory[].recordedAt` | `Date` | Mặc định thời điểm tạo | Thời điểm ghi nhận vi phạm. |
| `moderation.violationHistory[].source` | `String` | Mặc định `unknown`; tối đa 120 ký tự | Nguồn phát hiện hoặc xác nhận vi phạm. |
| `moderation.violationHistory[].reason` | `String` | Tối đa 1.000 ký tự | Lý do ghi nhận vi phạm. |
| `moderation.violationHistory[].category` | `String` | Tối đa 80 ký tự | Nhóm vi phạm. |
| `moderation.violationHistory[].confidence` | `Number` | Không bắt buộc | Điểm tin cậy nếu kết quả đến từ AI moderation. |
| `moderation.violationHistory[].status` | `String` | Mặc định `recorded`; `recorded`, `warning_sent`, `account_locked`, `cleared` | Trạng thái xử lý của lần vi phạm. |
| `moderation.violationHistory[].action` | `String` | Mặc định `warning`; tối đa 120 ký tự | Hành động đã áp dụng cho lần vi phạm. |
| `moderation.violationHistory[].countAfter` | `Number` | Mặc định `0` | Giá trị vi phạm sau khi ghi nhận lần này. |
| `moderation.violationHistory[].threshold` | `Number` | Mặc định `0` | Ngưỡng xử lý được dùng tại thời điểm ghi nhận. |
| `moderation.violationHistory[].messageType` | `String` | Tối đa 40 ký tự | Loại nội dung liên quan, ví dụ text hoặc image. |
| `moderation.violationHistory[].conversationId` | `ObjectId -> Conversation` | Không bắt buộc | Hội thoại liên quan tới vi phạm. |
| `moderation.violationHistory[].messageId` | `ObjectId -> Message` | Không bắt buộc | Tin nhắn liên quan tới vi phạm. |
| `moderation.violationHistory[].reportId` | `ObjectId -> Report` | Không bắt buộc | Báo cáo liên quan tới vi phạm. |
| `moderation.violationHistory[].actorId` | `ObjectId -> User` | Không bắt buộc | Người thực hiện hoặc kích hoạt hành động ghi nhận, ví dụ admin. |
| `moderation.violationHistory[].metadata` | `Mixed` | Không bắt buộc | Dữ liệu bổ sung của lần vi phạm. |

Chính sách hiện tại giảm giá trị vi phạm 1 điểm mỗi 7 ngày và tự khóa mặc định ở
ngưỡng 5 điểm; các giá trị này có thể được cấu hình bằng biến môi trường.

## UserStatus

| Field | Kiểu | Ràng buộc / mặc định | Ý nghĩa |
| --- | --- | --- | --- |
| `userId` | `ObjectId -> User` | Bắt buộc; duy nhất | Người dùng sở hữu trạng thái hiện diện. |
| `manual_status` | `String` | Mặc định `online`; `online`, `away`, `busy`, `do_not_disturb`, `invisible` | Trạng thái người dùng chủ động chọn khi dùng chế độ thủ công. |
| `status_mode` | `String` | Mặc định `auto`; `auto`, `manual` | Chế độ xác định trạng thái: hệ thống tự suy ra hoặc dùng lựa chọn thủ công. |
| `last_seen_at` | `Date` | Mặc định thời điểm tạo | Thời điểm hoạt động gần nhất, dùng để hiển thị last seen khi phù hợp quyền riêng tư. |

Model này không có MongoDB TTL index. Trạng thái hiển thị `offline` được suy ra từ
socket presence trong Redis, không được lưu trong `manual_status`. Khi xem trạng
thái của người khác, `invisible` được serialize thành `offline` và
`last_seen_at` bị ẩn.
