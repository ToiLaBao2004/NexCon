# CHƯƠNG 2. CƠ SỞ LÝ THUYẾT VÀ CÔNG NGHỆ SỬ DỤNG

## 2.1. Kiến trúc hệ thống

### 2.1.1. Tổng quan hệ thống

NexCon là một nền tảng giao tiếp thời gian thực đa nền tảng, phục vụ người dùng trên trình duyệt web và ứng dụng Android. Hệ thống tập trung vào các chức năng chính như đăng ký, đăng nhập, kết bạn, nhắn tin cá nhân, nhắn tin nhóm, gọi audio/video, tạo phòng họp, nhắc hẹn, nhận thông báo, báo cáo nội dung vi phạm, kiểm duyệt nội dung và quản trị hệ thống.

Về mặt kiến trúc, NexCon được xây dựng theo mô hình client-server. Frontend chịu trách nhiệm hiển thị giao diện, quản lý trạng thái phía người dùng và giao tiếp với backend thông qua REST API và Socket.IO. Backend đảm nhiệm xử lý nghiệp vụ, xác thực, phân quyền, lưu trữ dữ liệu, phát sự kiện thời gian thực, quản lý hàng đợi tác vụ nền và tích hợp với các dịch vụ bên thứ ba như Cloudinary, Firebase Cloud Messaging, LiveKit, Google Gemini và AssemblyAI.

Hệ thống sử dụng MongoDB làm cơ sở dữ liệu chính, Redis làm lớp lưu trạng thái tạm thời, pub/sub realtime và hàng đợi BullMQ. Mô hình này phù hợp với ứng dụng realtime vì vừa đảm bảo khả năng phản hồi nhanh cho người dùng, vừa tách các tác vụ nặng hoặc cần chạy theo lịch sang worker nền.

Trong môi trường production, frontend được triển khai trên Vercel dưới dạng Single Page Application build bằng Vite. Backend được triển khai trên Railway với 6 replicas nhằm tăng khả năng chịu tải và tính sẵn sàng. Vì backend chạy nhiều instance song song, hệ thống không được phụ thuộc vào bộ nhớ cục bộ của một process duy nhất, mà phải dùng MongoDB và Redis làm nguồn trạng thái chung.

### 2.1.2. Các thành phần chính

Hệ thống NexCon gồm các thành phần chính sau:

- Frontend web: xây dựng bằng React, TypeScript, Vite, TailwindCSS và các component theo phong cách shadcn/ui. Thành phần này cung cấp các màn hình đăng nhập, chat, bạn bè, cuộc gọi, phòng họp, reminder, notification, moderation và admin dashboard.
- Ứng dụng Android: sử dụng Capacitor để đóng gói web app thành ứng dụng di động, đồng thời bổ sung các bridge native như Firebase Messaging, Google Sign-In, local notification, incoming call screen và phát hiện screenshot trong cuộc trò chuyện disappearing.
- Backend API: xây dựng bằng Node.js và ExpressJS, cung cấp REST API cho xác thực, người dùng, bạn bè, hội thoại, tin nhắn, notification, reminder, meeting, report và admin.
- Realtime gateway: sử dụng Socket.IO để xử lý presence, typing, chat event, call signaling, notification realtime và đồng bộ trạng thái phiên đăng nhập.
- Cơ sở dữ liệu MongoDB: lưu người dùng, phiên đăng nhập, hội thoại, tin nhắn, thông báo, reminder, report, meeting, audit log và các dữ liệu nghiệp vụ khác.
- Redis: lưu presence, trạng thái cuộc gọi, lock chống xử lý trùng, Socket.IO Redis Adapter và dữ liệu hàng đợi BullMQ.
- Background workers: xử lý reminder, timeout cuộc gọi, timeout phòng chờ meeting, cleanup nhóm, cleanup hội thoại và hết hạn disappearing messages.
- Dịch vụ ngoài: Cloudinary lưu media, LiveKit xử lý WebRTC audio/video, Firebase/Web Push gửi thông báo đẩy, Google Gemini hỗ trợ kiểm duyệt nội dung và AssemblyAI chuyển giọng nói thành văn bản.

### 2.1.3. Luồng xử lý tổng quát

Đối với các thao tác thông thường, client gửi yêu cầu REST API đến backend. Backend xác thực access token, kiểm tra session, thực hiện nghiệp vụ, truy vấn MongoDB và trả dữ liệu về client. Những thay đổi cần cập nhật tức thời, ví dụ tin nhắn mới, trạng thái đã đọc, typing, lời mời kết bạn hoặc notification mới, sẽ được backend phát qua Socket.IO đến đúng room người dùng hoặc room hội thoại.

Đối với các tác vụ không cần hoàn thành ngay trong request, hệ thống đưa công việc vào BullMQ. Ví dụ: reminder được lập lịch theo thời gian nhắc, cuộc gọi có timeout đổ chuông, disappearing messages cần quét định kỳ, nhóm đã giải tán cần cleanup sau thời gian retention. Worker nhận job từ Redis queue, xử lý dữ liệu trong MongoDB, xóa media trên Cloudinary khi cần và phát event realtime để client cập nhật giao diện.

Đối với gọi audio/video và meeting, Socket.IO được dùng cho phần signaling và điều phối trạng thái, còn luồng media audio/video được xử lý bởi LiveKit thông qua WebRTC. Backend sinh token LiveKit cho người dùng hợp lệ, sau đó client tham gia room LiveKit bằng token này.

### 2.1.4. Xử lý multi-replica trên Railway

Khi backend được triển khai 6 replicas trên Railway, mỗi kết nối WebSocket của người dùng chỉ gắn với một replica tại một thời điểm. Nếu hệ thống chỉ lưu socket ID, danh sách online hoặc trạng thái cuộc gọi trong RAM của từng replica, các replica khác sẽ không biết người dùng đang online và không thể gửi event chính xác. Vì vậy NexCon thiết kế realtime theo hướng stateless ở tầng API và dùng Redis làm lớp trạng thái dùng chung.

Socket.IO Redis Adapter được cấu hình với hai Redis client pub/sub. Khi một replica phát event vào room, adapter sẽ publish sự kiện qua Redis để các replica khác cũng nhận được và gửi đến socket đang kết nối với mình. Nhờ đó, một request gửi tin nhắn có thể được xử lý ở Replica 1 nhưng người nhận đang kết nối WebSocket ở Replica 4 vẫn nhận được event `new-message`.

Presence của người dùng không lưu trong biến cục bộ mà lưu trong Redis theo các key dạng `nexcon:presence`. Mỗi socket khi kết nối sẽ được ghi nhận với `socketId`, `userId`, `sessionId`, `instanceId` và TTL. Client định kỳ refresh presence, khi disconnect thì socket được xóa khỏi Redis. Cách này giúp danh sách online phản ánh trạng thái của toàn bộ 6 replicas thay vì chỉ một process.

Mỗi socket sau khi xác thực sẽ join các room quan trọng:

- `user:<userId>` để đồng bộ tất cả thiết bị hoặc tab của cùng một người dùng.
- `session:<sessionId>` để thu hồi đúng phiên đăng nhập khi người dùng đăng xuất hoặc session hết hạn.
- `<conversationId>` để nhận event thuộc cuộc trò chuyện cá nhân hoặc nhóm.

Trạng thái cuộc gọi cũng được đưa vào Redis. Direct call lưu session, cặp người gọi/người nhận, room LiveKit, trạng thái ringing/connecting/in-call và lock kết thúc cuộc gọi. Group call lưu trạng thái theo conversation, danh sách participant và lock finalize. Việc dùng Redis giúp các replica cùng nhìn thấy một trạng thái cuộc gọi thống nhất, tránh trường hợp một replica cho rằng cuộc gọi còn hoạt động trong khi replica khác đã kết thúc.

BullMQ cũng sử dụng Redis làm queue chung. Khi có nhiều replica hoặc worker process cùng chạy, job trong queue sẽ được một worker claim xử lý, đồng thời nhiều job quan trọng sử dụng `jobId` ổn định để giảm nguy cơ lập lịch trùng. Với production nhiều replicas, các worker nặng có thể được tách thành process riêng; khi đó cần tắt worker inline tương ứng trên server bằng các biến `ENABLE_INLINE_*_WORKER=false` để kiểm soát tài nguyên và tránh khởi tạo worker không cần thiết trên mọi replica.

Frontend Socket.IO client được cấu hình dùng transport `websocket`, phù hợp với môi trường load balancer. Nếu cho phép fallback HTTP long-polling trong production, hệ thống cần sticky session ở load balancer hoặc tiếp tục ép WebSocket để tránh request polling của cùng một socket bị điều hướng qua nhiều replica khác nhau.

## 2.2. Công nghệ phía Back-end

### 2.2.1. Node.js và ExpressJS

Node.js là môi trường chạy JavaScript phía server, phù hợp với các ứng dụng I/O nhiều như chat realtime, notification và API phục vụ nhiều kết nối đồng thời. ExpressJS là framework web nhẹ, cung cấp cơ chế middleware, routing và xử lý request/response rõ ràng.

Trong NexCon, backend sử dụng Express 5 để xây dựng REST API. Các route được tổ chức theo miền nghiệp vụ như `/api/auth`, `/api/users`, `/api/friends`, `/api/messages`, `/api/conversations`, `/api/notifications`, `/api/livekit`, `/api/meetings`, `/api/reminders`, `/api/reports` và `/api/admin`. Express middleware được dùng cho CORS, parse JSON, cookie, rate limit, xác thực JWT, phân quyền, audit log và ghi nhận request chậm.

### 2.2.2. MongoDB và Mongoose

MongoDB là cơ sở dữ liệu NoSQL dạng document, phù hợp với dữ liệu có cấu trúc linh hoạt như người dùng, hội thoại, tin nhắn, notification và metadata media. Mongoose là thư viện ODM giúp định nghĩa schema, validation, index, middleware và thao tác MongoDB theo mô hình object.

Trong NexCon, MongoDB lưu các collection chính như User, Session, Conversation, Message, Notification, Reminder, Meeting, Report, AuditLog và các model liên quan đến bạn bè hoặc moderation. Các schema được thiết kế với index phục vụ truy vấn thường xuyên, ví dụ truy vấn hội thoại theo participant, lấy tin nhắn theo conversation và thời gian, tìm mention, tìm tin nhắn đã ghim hoặc quét disappearing message hết hạn.

Backend cấu hình connection pool cho MongoDB để phù hợp môi trường nhiều replica. Khi triển khai 6 replicas, mỗi replica tạo pool kết nối riêng, do đó cần cấu hình `MONGODB_MAX_POOL_SIZE` hợp lý để không vượt quá giới hạn kết nối của MongoDB Atlas hoặc database production.

### 2.2.3. Xác thực, session và phân quyền

Hệ thống sử dụng JSON Web Token cho access token. Khi client gọi API, token được gửi trong header `Authorization: Bearer <token>`. Backend xác minh chữ ký token bằng `ACCESS_TOKEN_SECRET`, lấy `userId` và `sessionId` từ payload, sau đó kiểm tra người dùng và session trong MongoDB.

Cách thiết kế này giúp API gần với mô hình stateless: replica nào nhận request cũng có thể xác thực token nếu dùng cùng secret và cùng MongoDB. Session vẫn được lưu ở database để hỗ trợ thu hồi phiên, đăng xuất từng thiết bị, kiểm tra session hết hạn và ngắt Socket.IO khi session bị revoke. Socket.IO cũng dùng token khi handshake và định kỳ kiểm tra session trong quá trình kết nối.

Về phân quyền, hệ thống có vai trò người dùng thường và quản trị viên. Các route admin được bảo vệ bằng middleware riêng. Một số chức năng như tìm kiếm, gửi tin nhắn, quản lý bạn bè hoặc reminder yêu cầu người dùng đã xác thực và không bị khóa tài khoản.

### 2.2.4. Socket.IO

Socket.IO là thư viện realtime hỗ trợ kết nối hai chiều giữa client và server. So với REST API, Socket.IO phù hợp với các tình huống cần server chủ động đẩy dữ liệu đến client, ví dụ tin nhắn mới, typing indicator, trạng thái online, lời mời gọi, notification hoặc thay đổi thành viên nhóm.

Trong NexCon, Socket.IO đảm nhiệm nhiều nhóm event: presence, chat, typing, mention, friend request, conversation update, direct call, group call, meeting waiting room, reminder, notification và disappearing messages. Mỗi socket được xác thực trước khi kết nối, sau đó join các room theo user, session và conversation để backend có thể emit đúng phạm vi.

Để hoạt động ổn định trong môi trường 6 replicas, Socket.IO được kết hợp với Redis Adapter. Adapter dùng Redis pub/sub để đồng bộ event giữa các process backend, đảm bảo event phát từ một replica vẫn đến được socket đang nằm ở replica khác.

### 2.2.5. Redis và BullMQ

Redis là hệ quản trị dữ liệu key-value chạy trong bộ nhớ, có tốc độ cao và hỗ trợ TTL, set, hash, pub/sub và các thao tác atomic. Trong NexCon, Redis không chỉ dùng làm cache mà còn giữ vai trò hạ tầng realtime.

Redis được sử dụng cho bốn nhóm chính:

- Presence: lưu socket online, user online và TTL để tự loại bỏ socket không còn sống.
- Call state: lưu trạng thái direct call, group call, lock chống xử lý trùng và rate limit thao tác gọi.
- Socket.IO adapter: pub/sub event giữa các backend replicas.
- BullMQ queue: lập lịch và điều phối job nền.

BullMQ là thư viện hàng đợi chạy trên Redis. NexCon dùng BullMQ cho reminder, realtime timeout, group cleanup, conversation clear cleanup và disappearing message expiry. Nhờ queue, request chính không bị chặn bởi các tác vụ tốn thời gian, đồng thời hệ thống có thể retry, delay, repeat job và quan sát lỗi worker.

### 2.2.6. LiveKit và WebRTC

WebRTC là công nghệ cho phép truyền audio/video thời gian thực giữa các client. Tuy nhiên việc tự xây dựng signaling, room management, token, NAT traversal và quản lý participant khá phức tạp. NexCon sử dụng LiveKit để xử lý phần media server cho direct call, group call và meeting.

Backend chịu trách nhiệm kiểm tra quyền tham gia, tạo room/token LiveKit, gửi lời mời qua Socket.IO hoặc push notification, xử lý timeout và ghi system message lịch sử cuộc gọi. Frontend dùng LiveKit client để tham gia room và truyền nhận audio/video.

### 2.2.7. Cloudinary, notification và email

Cloudinary được dùng để lưu ảnh, audio, file và avatar. Với message media, hệ thống sử dụng authenticated delivery và backend sinh signed URL tạm thời khi client cần xem. Cách này giúp hạn chế việc public trực tiếp tài nguyên nhạy cảm.

Thông báo được triển khai theo nhiều kênh: in-app notification lưu trong MongoDB, realtime notification qua Socket.IO, Web Push qua VAPID/service worker, Firebase Cloud Messaging cho Android và email khi chức năng cần gửi OTP hoặc reminder. Việc kết hợp nhiều kênh giúp người dùng vẫn nhận được thông tin quan trọng khi không mở ứng dụng.

### 2.2.8. Kiểm duyệt nội dung bằng AI

NexCon có cơ chế hậu kiểm nội dung. Tin nhắn được lưu và phát realtime trước với trạng thái `pending_review`, sau đó backend chạy kiểm duyệt nền dựa trên local signal kết hợp Google Gemini. Với voice message, AssemblyAI được dùng để chuyển âm thanh thành văn bản trước khi kiểm duyệt.

Nếu phát hiện vi phạm, hệ thống cập nhật trạng thái report/moderation, thay đổi cách hiển thị tin nhắn trên client, ghi nhận lịch sử vi phạm, gửi thông báo và hỗ trợ admin review. Cách hậu kiểm giúp trải nghiệm nhắn tin không bị chậm, nhưng vẫn có lớp kiểm soát nội dung sau khi tin nhắn được gửi.

## 2.3. Công nghệ phía Front-end

### 2.3.1. ReactJS, TypeScript và Vite

ReactJS là thư viện xây dựng giao diện theo mô hình component. Mỗi phần giao diện như danh sách hội thoại, khung chat, modal cuộc gọi, trang bạn bè, trang reminder hoặc dashboard admin được tổ chức thành component riêng, giúp tái sử dụng và dễ bảo trì.

NexCon sử dụng React 19 kết hợp TypeScript để tăng độ an toàn kiểu dữ liệu cho props, state, service response và store. Vite 7 được dùng làm công cụ build, cung cấp tốc độ phát triển nhanh, hot module replacement và build frontend thành thư mục `dist` để triển khai trên Vercel.

Ứng dụng dùng React Router để tổ chức các route như `/chat`, `/people`, `/meet`, `/reminder`, `/notification`, `/moderation`, `/settings/sessions` và `/admin/*`. Vercel được cấu hình rewrite toàn bộ request về `index.html` để hỗ trợ routing phía client của SPA.

### 2.3.2. Zustand

Zustand là thư viện quản lý trạng thái nhẹ cho React. So với việc truyền props qua nhiều tầng component, Zustand cho phép chia state theo từng miền nghiệp vụ và truy cập trực tiếp từ component cần dùng.

Trong NexCon, Zustand được dùng cho nhiều store như auth, user, socket, chat, friend, notification, reminder, call, group call, meeting, theme, media cache, image viewer và app status. Cách chia store theo chức năng giúp mã nguồn rõ ràng, đồng thời các event Socket.IO có thể cập nhật trực tiếp vào store tương ứng để giao diện phản hồi ngay.

### 2.3.3. TailwindCSS và shadcn/ui

TailwindCSS là framework CSS utility-first, cho phép xây dựng giao diện nhanh bằng các class tiện ích. NexCon dùng TailwindCSS kết hợp CSS variables để hỗ trợ theme sáng/tối, màu trạng thái, màu sidebar, màu chat bubble và các token giao diện.

Hệ thống component giao diện được xây dựng theo phong cách shadcn/ui, sử dụng Radix UI cho các thành phần có tương tác tốt như dialog, dropdown, popover, tooltip, switch, sheet và separator. Icon chủ yếu dùng lucide-react. Cách tiếp cận này giúp giao diện nhất quán, dễ mở rộng và phù hợp với ứng dụng dashboard/chat có nhiều thao tác lặp lại.

### 2.3.4. Axios và Socket.IO Client

Axios được dùng để gọi REST API. Frontend cấu hình interceptor để tự gắn access token vào header Authorization, xử lý refresh token khi API trả về 401 và hiển thị trạng thái offline/maintenance khi backend không phản hồi.

Socket.IO Client được dùng cho kết nối realtime. Khi người dùng đã đăng nhập, frontend kết nối đến backend bằng access token trong handshake và ép transport `websocket`. Client lắng nghe các event như `new-message`, `online-users`, `message-delivered-ack`, `notification-updated`, `incoming-call`, `group-call:incoming`, `reminder-triggered` và cập nhật Zustand store để UI thay đổi tức thời.

### 2.3.5. Capacitor và Android

Ngoài web, NexCon hỗ trợ Android thông qua Capacitor. Capacitor cho phép tái sử dụng phần lớn code React/Vite, đồng thời truy cập các API native khi cần. Dự án có các bridge Android cho Firebase Messaging, native incoming call, local notification, Google Sign-In, back button và screenshot detection.

Điều này giúp NexCon có thể cung cấp trải nghiệm gần với ứng dụng native trong các tình huống quan trọng như nhận cuộc gọi khi app chạy nền, mở đúng màn hình khi bấm notification hoặc báo cáo screenshot trong disappearing messages.

## 2.4. Cơ sở dữ liệu, bảo mật và lưu trữ media

### 2.4.1. Mô hình dữ liệu MongoDB

Dữ liệu của NexCon được tổ chức theo các document MongoDB. User lưu hồ sơ, trạng thái, quyền và thông tin khóa tài khoản. Session lưu các phiên đăng nhập để hỗ trợ refresh token và thu hồi phiên. Conversation lưu loại hội thoại, participant, nhóm, last message, unread count, cấu hình mute, pin và disappearing. Message lưu nội dung, loại tin nhắn, mention, reaction, trạng thái delivered, trạng thái pin/recall, metadata media và thời điểm hết hạn nếu là disappearing message.

Các model khác hỗ trợ chức năng mở rộng: Friend và FriendRequest quản lý quan hệ bạn bè; Notification lưu thông báo; Reminder lưu nhắc hẹn; Meeting lưu phòng họp; Report và Violation lưu dữ liệu kiểm duyệt; AuditLog phục vụ quản trị và quan sát hoạt động hệ thống.

### 2.4.2. Mã hóa nội dung và bảo vệ media

Nội dung text của tin nhắn và trường tìm kiếm được mã hóa ở tầng ứng dụng bằng AES-256-GCM trước khi lưu xuống MongoDB. Dữ liệu mã hóa có prefix phiên bản để backend nhận biết và giải mã khi trả về client. Đây là mã hóa ở tầng lưu trữ của backend, không phải end-to-end encryption, vì backend vẫn cần đọc nội dung để tìm kiếm, kiểm duyệt và xử lý nghiệp vụ.

Media được lưu trên Cloudinary. Đối với media trong tin nhắn, client không nhận URL public vĩnh viễn mà yêu cầu backend cấp signed URL tạm thời. Khi tin nhắn bị xóa, hết hạn hoặc nhóm bị cleanup, worker sẽ kiểm tra tham chiếu media và chỉ xóa asset khi không còn tin nhắn active khác sử dụng cùng tài nguyên.

## 2.5. Tác vụ nền và xử lý bất đồng bộ

Nhiều chức năng của NexCon không phù hợp để xử lý trực tiếp trong request vì cần delay, retry hoặc chạy định kỳ. Do đó hệ thống sử dụng BullMQ trên Redis để quản lý queue.

Reminder queue xử lý nhắc hẹn cá nhân, reminder chung và lịch họp. Realtime timeout queue xử lý timeout direct call, group call ring và waiting room. Group cleanup queue xóa dữ liệu nhóm sau thời gian retention. Conversation clear cleanup queue xóa vật lý các message đã được tất cả participant clear. Disappearing message queue chạy định kỳ mỗi phút để tắt mode quá hạn và expire message đến hạn.

Trong môi trường nhiều replicas, queue giúp các process phối hợp thông qua Redis thay vì tự chạy lịch riêng trong RAM. Các job có `jobId` cố định khi cần deduplication, ví dụ reminder dùng ID của reminder, disappearing sweep dùng một ID lặp cố định. Đây là cơ sở quan trọng để vận hành hệ thống ổn định khi mở rộng backend.

## 2.6. Triển khai và vận hành

Frontend được triển khai trên Vercel với root directory `frontend`, install command `npm ci --legacy-peer-deps`, build command `npm run build` và output directory `dist`. File `vercel.json` rewrite mọi route về `index.html`, phù hợp với React Router trong ứng dụng SPA. Các biến môi trường frontend như `VITE_API_URL`, `VITE_SOCKET_URL`, `VITE_LIVEKIT_URL` và `VITE_VAPID_PUBLIC_KEY` được nhúng vào bundle tại thời điểm build.

Backend được triển khai trên Railway với root directory `backend`, install command `npm ci`, start command `npm start` và health check `/api/auth/health`. Trong production, backend chạy 6 replicas để tăng khả năng phục vụ đồng thời. Tất cả replicas phải dùng chung `MONGODB_CONNECTION_STRING`, `REDIS_URL`, `ACCESS_TOKEN_SECRET` và `MESSAGE_ENCRYPTION_KEY`. Nếu các giá trị này lệch nhau, hệ thống có thể gặp lỗi xác thực token, không giải mã được tin nhắn hoặc realtime giữa các replicas không nhất quán.

Ngoài production, dự án có Docker Compose để chạy local Redis, LiveKit, backend, frontend và một worker cleanup mẫu. Docker giúp chuẩn hóa môi trường phát triển, trong khi GitHub Actions đảm nhiệm kiểm tra build/test trước khi merge vào nhánh chính. Railway và Vercel đảm nhiệm CD bằng cách tự deploy khi source code trên nhánh production/main thay đổi.

Về vận hành, hệ thống cần bật HTTPS/WSS, cấu hình CORS chính xác qua `CLIENT_URL`, bật `TRUST_PROXY` khi chạy sau reverse proxy, theo dõi Redis connectivity, worker error, audit log, latency, error rate và tài nguyên CPU/memory. Với Socket.IO, production nên duy trì WebSocket transport hoặc cấu hình sticky session nếu bật long-polling fallback.

## 2.7. Tổng kết

Các công nghệ được lựa chọn trong NexCon hướng đến mục tiêu xây dựng một ứng dụng giao tiếp realtime có khả năng mở rộng. React, Vite, TypeScript, Zustand và TailwindCSS giúp frontend phản hồi nhanh, dễ phát triển và hỗ trợ cả web lẫn Android thông qua Capacitor. ExpressJS, MongoDB, Socket.IO, Redis và BullMQ tạo thành nền tảng backend có thể xử lý API, realtime và tác vụ nền. LiveKit, Cloudinary, Firebase, Web Push, Gemini và AssemblyAI bổ sung các năng lực nâng cao như gọi audio/video, lưu media, thông báo đa kênh và kiểm duyệt nội dung.

Đặc biệt, việc triển khai backend 6 replicas trên Railway yêu cầu hệ thống phải xử lý đúng bài toán multi-replica. NexCon giải quyết vấn đề này bằng Redis Socket.IO Adapter, Redis presence store, Redis call state, BullMQ queue dùng chung và cơ chế xác thực/session không phụ thuộc vào bộ nhớ cục bộ. Đây là nền tảng quan trọng giúp hệ thống duy trì realtime nhất quán khi mở rộng số lượng backend instance.
