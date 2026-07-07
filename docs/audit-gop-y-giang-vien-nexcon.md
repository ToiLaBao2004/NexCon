# Audit góp ý giảng viên - NexCon

File này ghi lại kết quả rà soát source code và báo cáo trước khi chỉnh sửa tài liệu chính.

## Phạm vi đã kiểm tra

- Backend: controllers, routes, middlewares, models, socket, workers, config, services.
- Frontend: package, public service worker, socket store và cấu trúc triển khai.
- Hạ tầng: Docker, Docker Compose, GitHub Actions, Vercel, Railway, Redis, BullMQ, MongoDB, LiveKit/WebRTC.
- Kiểm thử hiệu suất: `performance/real-user.k6.js`, `performance/local.settings.js`, `performance/stress-local.summary.json`.
- Báo cáo: `docs/CLC_HTTT_07_NguyenHoaiBao_TranNhuThien.pdf`.

## Kết luận nhanh

- Báo cáo đã khá đầy đủ về chức năng và công nghệ, nhưng cần sửa một số chỗ để tránh khẳng định quá mức so với bằng chứng source.
- Không tìm thấy bằng chứng trong source để kết luận gói Railway `$5` là nguyên nhân trực tiếp gây giới hạn 250 VUs. Có thể viết thận trọng rằng kết quả benchmark phản ánh môi trường triển khai production cụ thể, cần bổ sung Railway metrics CPU/RAM/network để kết luận bottleneck hạ tầng.
- Hệ thống có mã hóa nội dung tin nhắn ở tầng lưu trữ bằng AES-256-GCM phía backend, nhưng chưa có End-to-End Encryption.
- AI moderation không chỉ nằm ở luồng admin report; source cho thấy có background moderation khi gửi tin nhắn và AI review trong trang quản trị.
- Tài liệu tham khảo còn thiếu nhiều nguồn tương ứng với Redis, BullMQ, k6, Docker, Vercel, Railway, JWT, Cloudinary, Firebase, Gemini, AssemblyAI, WebRTC, Capacitor, TypeScript, Vite, Zustand.

========================
Chương:
Phần đề cương / Kế hoạch thực hiện

Mục:
Kế hoạch thực hiện

Trang:
Trang trong PDF: phần kế hoạch trước mục lục, tương ứng page PDF 11

Lý do cần sửa:
Bảng kế hoạch ghi "RabbitMQ" nhưng source không dùng RabbitMQ. Source dùng Redis + BullMQ. "Nginx" chỉ xuất hiện trong `frontend/Dockerfile` khi chạy container frontend, không phải cấu hình chính nếu frontend deploy trên Vercel.

Nội dung cũ:
"Hoàn thiện môi trường production, triển khai Docker, Redis, RabbitMQ, GitHub Actions, CI/CD, cấu hình Nginx, triển khai Front-end trên Vercel và Back-end trên Railway."

Nội dung đề xuất:
"Hoàn thiện môi trường production, cấu hình Docker/Docker Compose, Redis, BullMQ worker, GitHub Actions CI, triển khai Front-end trên Vercel và Back-end trên Railway. Kiểm tra health check, biến môi trường production, Redis Adapter cho Socket.IO và các worker nền phục vụ reminder/cleanup."

Giải thích kỹ thuật:
NexCon sử dụng BullMQ chạy trên Redis cho các hàng đợi reminder, group cleanup và conversation clear cleanup. Không tìm thấy package hoặc cấu hình RabbitMQ trong source. Nginx chỉ là runner của Docker image frontend; production thực tế trong báo cáo là Vercel cho frontend.

Dựa trên source nào:
- `backend/package.json`: có `bullmq`, `ioredis`, `redis`; không có RabbitMQ/amqplib.
- `docker-compose.yml`: service `redis`, `server`, `group-cleanup-worker`, `client`.
- `backend/src/config/reminderQueue.js`
- `backend/src/config/groupCleanupQueue.js`
- `backend/src/config/conversationClearCleanupQueue.js`
- `frontend/Dockerfile`
========================

========================
Chương:
Chương 5 - Cài đặt, triển khai và kiểm thử

Mục:
5.3.5. Kiểm thử hiệu suất bằng k6

Trang:
Trang báo cáo: 135-136

Lý do cần sửa:
Phần performance nên ghi rõ chỉ dùng `real-user.k6.js`, không diễn giải như toàn bộ bộ script performance đều được chạy. Kịch bản thực tế gồm 50 REST VUs và 200 Socket VUs, tổng 250 VUs.

Nội dung cũ:
Báo cáo trình bày kết quả kiểm thử hiệu suất bằng k6 và bảng kết quả 250 VUs, nhưng chưa nhấn mạnh đây là kết quả từ kịch bản real-user.

Nội dung đề xuất:
"Kết quả trong mục này được lấy từ lần chạy `performance/real-user.k6.js`. Script gồm hai scenario: `active_app_users` mô phỏng người dùng thao tác REST API và `online_socket_users` mô phỏng người dùng duy trì kết nối Socket.IO. Theo `performance/local.settings.js`, `REAL_REST_STAGES=1m:10,5m:50,1m:0` và `REAL_SOCKET_STAGES=1m:50,5m:200,1m:0`, do đó mức tải cao nhất là 50 VUs REST và 200 VUs Socket.IO, tổng 250 VUs đồng thời."

Giải thích kỹ thuật:
Script `real-user.k6.js` không chỉ tạo request REST mà còn mở kết nối Socket.IO bằng websocket. REST scenario gọi các API profile, conversation, message, notification, friend, reminder; socket scenario xác thực bằng token, join conversation và emit typing/stop-typing theo chu kỳ.

Dựa trên source nào:
- `performance/real-user.k6.js`
- `performance/local.settings.js`
- `performance/lib/realUserScenario.js`
- `performance/lib/socketScenario.js`
- `performance/stress-local.summary.json`
========================

========================
Chương:
Chương 5 - Cài đặt, triển khai và kiểm thử

Mục:
5.3.5 và 5.3.6 - Kết quả kiểm thử hiệu suất và phân tích

Trang:
Trang báo cáo: 135-136

Lý do cần sửa:
Kết quả hiện đang viết "hệ thống hoạt động ổn định với khoảng 250 người dùng đồng thời" hơi mạnh. Thực tế threshold cho HTTP p95/p99, Socket.IO connect p95/p99 và `rest_unexpected_status` đều không đạt. Cần diễn giải thận trọng hơn.

Nội dung cũ:
"Kết quả kiểm thử cho thấy hệ thống hoạt động ổn định với khoảng 250 người dùng đồng thời (250 VUs)... Nhìn chung, hệ thống đáp ứng tốt các chức năng real-time và có khả năng mở rộng..."

Nội dung đề xuất:
"Kết quả k6 cho thấy hệ thống có thể duy trì kịch bản 250 VUs trong lần thử nghiệm real-user, với check pass rate 98,1%, HTTP failed rate 2,45%, 100% Socket.IO connect success và không ghi nhận socket error. Tuy nhiên, một số threshold quan trọng chưa đạt: HTTP p95 khoảng 20,18 giây so với ngưỡng 1,5 giây; HTTP p99 vượt ngưỡng 3 giây; Socket.IO connect p95 khoảng 15,35 giây so với ngưỡng 2,5 giây; `rest_unexpected_status` là 75, vượt ngưỡng 20. Vì vậy, kết quả này nên được hiểu là hệ thống duy trì được phiên thử nghiệm 250 VUs nhưng chưa đạt mục tiêu latency đặt ra, đặc biệt ở nhóm REST API đọc dữ liệu."

Giải thích kỹ thuật:
Trong summary, `http_req_duration` gần như trùng với `http_req_waiting`, cho thấy phần lớn thời gian nằm ở thời gian chờ response từ server chứ không phải gửi/nhận dữ liệu mạng phía client. Các check fail tập trung ở `real_conversation_messages`, `real_conversations_list`, `real_friends_list`, `real_friend_suggestions`. Không có breakdown latency theo endpoint trong summary, nên chưa đủ căn cứ để kết luận một endpoint cụ thể là bottleneck chính.

Dựa trên source nào:
- `performance/stress-local.summary.json`
- `performance/real-user.k6.js`
- `performance/lib/realUserScenario.js`
- `performance/lib/report.js`
========================

========================
Chương:
Chương 5 - Cài đặt, triển khai và kiểm thử

Mục:
5.3.6. Phân tích kết quả và đánh giá khả năng chịu tải

Trang:
Trang báo cáo: 136

Lý do cần sửa:
Góp ý của giảng viên yêu cầu phân tích nguyên nhân giới hạn khoảng 250 VUs và bottleneck. Source có cơ chế hỗ trợ multi-replica, Redis Adapter, metrics CPU/RAM, slow request log, nhưng không có log Railway CPU/RAM/network đi kèm lần test.

Nội dung cũ:
Phần phân tích mới nói HTTP còn chậm và cần tối ưu MongoDB/index/pagination/cache, nhưng chưa tách rõ giới hạn do application, database hay hạ tầng deploy.

Nội dung đề xuất:
"Về nguyên nhân giới hạn tải, kết quả hiện tại chưa đủ để kết luận chính xác bottleneck nằm ở thuật toán, cơ sở dữ liệu hay tài nguyên hạ tầng. Source cho thấy backend đã hỗ trợ scale ngang qua Socket.IO Redis Adapter, Redis presence/call state và các worker BullMQ tách khỏi luồng request. Báo cáo triển khai cũng ghi backend production chạy 6 API replicas trên Railway. Tuy nhiên, trong source và file summary k6 không có số liệu CPU, RAM, network egress, MongoDB query time hoặc Redis latency tại thời điểm benchmark. Vì vậy, không nên khẳng định Railway gói `$5` hoặc bất kỳ cấu hình tài nguyên cụ thể nào là nguyên nhân trực tiếp nếu không bổ sung dashboard/log tương ứng. Cách diễn giải phù hợp là: benchmark phản ánh năng lực của môi trường production cụ thể tại thời điểm đo; để xác định bottleneck cần kết hợp k6 với Railway metrics, MongoDB profiler, Redis latency và slow request log."

Giải thích kỹ thuật:
Source có `systemMetricsService` để lấy CPU/memory runtime và `slowRequestLogger` để log API chậm, nhưng `stress-local.summary.json` không chứa CPU/RAM. Báo cáo có ghi 6 replicas, nhưng source không chứa cấu hình plan Railway hoặc tài nguyên CPU/RAM từng replica.

Dựa trên source nào:
- `backend/src/config/socketIoRedisAdapter.js`
- `backend/src/services/socketPresenceService.js`
- `backend/src/services/systemMetricsService.js`
- `backend/src/middlewares/slowRequestLogger.js`
- `backend/src/server.js`
- `README.md` mục Multi-replica Socket.IO và Deploy
- `docs/CLC_HTTT_07_NguyenHoaiBao_TranNhuThien.pdf`, trang 129-130

Ghi chú bắt buộc:
Không tìm thấy bằng chứng trong source để kết luận Railway gói `$5` là bottleneck.
========================

========================
Chương:
Phần kết luận

Mục:
3. Nhược điểm

Trang:
Trang báo cáo: 139

Lý do cần sửa:
Câu "nguyên nhân chủ yếu đến từ các truy vấn MongoDB chưa được tối ưu index và payload..." chưa đủ bằng chứng. Source hiện đã có nhiều index, pagination, read cache và cleanup, nên nên viết theo hướng "nghi vấn/cần đo thêm" thay vì kết luận chắc chắn.

Nội dung cũ:
"Nguyên nhân chủ yếu đến từ các truy vấn MongoDB chưa được tối ưu index và payload trả về ở một số API danh sách còn lớn."

Nội dung đề xuất:
"Nguyên nhân cụ thể của độ trễ HTTP cần được xác minh thêm bằng slow request log, Railway metrics và MongoDB profiler. Từ kịch bản k6, các nhóm API liên quan đến conversation, message, friends và suggestions có phát sinh check fail, nên đây là các luồng cần ưu tiên rà soát. Hệ thống đã có index, pagination và cache đọc ngắn hạn ở một số controller, nhưng vẫn cần đo query time thực tế, kích thước payload và thời gian xử lý middleware/auth để xác định điểm nghẽn chính."

Giải thích kỹ thuật:
Source đã có index trong `messageModel`, `conversationModel`, `friendModel`, `notificationModel`, `reminderModel`; `conversationController.getMessages` giới hạn `limit` tối đa 100 và dùng cursor; controller cũng có read cache TTL. Vì vậy không nên viết như thể database chưa được tối ưu hoàn toàn nếu chưa có profiler.

Dựa trên source nào:
- `backend/src/models/messageModel.js`
- `backend/src/models/conversationModel.js`
- `backend/src/controllers/conversationController.js`, function `getMessages`
- `backend/src/utils/readCache.js`
- `performance/stress-local.summary.json`
========================

========================
Chương:
Chương 2 / Chương 5 / Phần kết luận

Mục:
Bảo mật hệ thống và nhược điểm E2EE

Trang:
Trang báo cáo: 42, 139-140

Lý do cần sửa:
Báo cáo có nói "tin nhắn được lưu và truyền tải mà chưa có cơ chế mã hóa đầu cuối". Câu này đúng ở phần chưa có E2EE, nhưng chưa chính xác ở phần "lưu" vì source có mã hóa nội dung tin nhắn ở tầng lưu trữ bằng AES-256-GCM phía backend.

Nội dung cũ:
"Chưa có mã hóa đầu cuối (E2EE) cho nội dung tin nhắn: hiện tại tin nhắn được lưu và truyền tải mà chưa có cơ chế mã hóa đầu cuối..."

Nội dung đề xuất:
"Chưa có mã hóa đầu cuối (E2EE) cho nội dung tin nhắn: hiện tại nội dung message và lastMessage đã được mã hóa ở tầng lưu trữ phía backend bằng AES-256-GCM, giúp giảm rủi ro khi dữ liệu trong database bị truy cập trái phép. Tuy nhiên, đây chưa phải End-to-End Encryption vì backend vẫn có khả năng giải mã để phục vụ tìm kiếm, kiểm duyệt nội dung, hiển thị tin nhắn và phát sự kiện realtime. Do đó, quyền riêng tư chưa đạt mức chỉ người gửi và người nhận mới có khóa giải mã."

Giải thích kỹ thuật:
`messageModel.content`, `messageModel.searchContent` và `conversationModel.lastMessage.content` dùng getter/setter `encryptText`/`decryptText`. Khóa mã hóa lấy từ `MESSAGE_ENCRYPTION_KEY` hoặc secret phía server. Không tìm thấy `crypto.subtle`, client-side encryption hoặc trao đổi khóa E2EE trong frontend.

Dựa trên source nào:
- `backend/src/utils/messageCrypto.js`
- `backend/src/models/messageModel.js`
- `backend/src/models/conversationModel.js`
- `backend/src/controllers/messageController.js`
- `frontend/src` qua tìm kiếm `crypto.subtle`, `E2EE`, `end-to-end`
========================

========================
Chương:
Chương 2 hoặc Chương 5

Mục:
Bổ sung mục "Các giải pháp bảo mật thay thế"

Trang:
Đề xuất đặt sau phần bảo mật ở trang 42 hoặc trong Chương 5 sau mục deploy production

Lý do cần sửa:
Giảng viên góp ý cần nói rõ nếu chưa có E2EE thì hệ thống có những biện pháp bảo mật nào thay thế. Source có nhiều cơ chế bảo mật đáng nêu.

Nội dung cũ:
Báo cáo đang nêu rải rác bcrypt, phân quyền, rate limit, CORS, mã hóa lưu trữ, nhưng chưa có một mục tổng hợp "giải pháp thay thế E2EE".

Nội dung đề xuất:
"Các giải pháp bảo mật thay thế:

Do chưa triển khai End-to-End Encryption, NexCon áp dụng nhiều lớp bảo vệ khác để giảm rủi ro trong quá trình vận hành. Hệ thống sử dụng JWT access token có thời hạn ngắn kết hợp refresh token lưu theo session; refresh token được băm SHA-256 trước khi lưu trong database và cookie refresh token được cấu hình `httpOnly`, `secure`, `sameSite=none`. Mật khẩu người dùng được băm bằng bcrypt trước khi lưu trữ. Các route nghiệp vụ được bảo vệ bằng `authMiddleware`, kiểm tra session còn hiệu lực, trạng thái khóa tài khoản và quyền truy cập theo role. Các API nhạy cảm như đăng ký, đăng nhập và OTP có rate limit theo IP/email; toàn bộ `/api` có global rate limit. Hệ thống giới hạn CORS theo frontend URL, kiểm tra quyền thành viên hội thoại trước khi gửi/đọc tin nhắn, kiểm tra quan hệ bạn bè/chặn người dùng, và bảo vệ route quản trị bằng middleware admin. Với media, file không lưu trực tiếp trong MongoDB mà lưu trên Cloudinary dạng authenticated asset; backend kiểm tra quyền rồi sinh signed URL khi client cần truy cập. Với nội dung tin nhắn, backend mã hóa dữ liệu ở tầng lưu trữ bằng AES-256-GCM. Hệ thống chưa triển khai End-to-End Encryption và đây là hướng phát triển trong tương lai."

Giải thích kỹ thuật:
Đoạn trên chỉ nêu các cơ chế đã tìm thấy trong source. Không nên ghi Helmet, mongo-sanitize hoặc centralized schema validation nếu chưa cài/cấu hình. Không tìm thấy `helmet`, `express-mongo-sanitize`, `DOMPurify` trong source/package.

Dựa trên source nào:
- `backend/src/controllers/authController.js`
- `backend/src/middlewares/authMiddleware.js`
- `backend/src/middlewares/rateLimiters.js`
- `backend/src/middlewares/roleMiddleware.js`
- `backend/src/middlewares/messageMiddleware.js`
- `backend/src/middlewares/uploadMiddleware.js`
- `backend/src/utils/messageCrypto.js`
- `backend/src/utils/messageHelper.js`, function `generateSignedUrl`
- `backend/src/server.js`
========================

========================
Chương:
Chương 2 / Chương 3 / Chương 5

Mục:
AI moderation, báo cáo vi phạm và quản trị

Trang:
Trang báo cáo: 44, 79, 139-140

Lý do cần sửa:
Báo cáo đang mô tả AI moderation tương đối ngắn. Source thực tế có pipeline sâu hơn: background moderation khi gửi tin, AI review trong admin, report người dùng/tin nhắn, xác nhận vi phạm, khóa tài khoản và kháng cáo.

Nội dung cũ:
"Google Gemini hỗ trợ kiểm duyệt nội dung vi phạm tiêu chuẩn cộng đồng bao gồm văn bản, hình ảnh hoặc đường dẫn liên kết. AssemblyAI hỗ trợ chuyển voice message thành văn bản trước khi đưa vào luồng kiểm duyệt."

Nội dung đề xuất:
"Luồng kiểm duyệt nội dung của NexCon gồm hai lớp. Lớp thứ nhất là background moderation khi người dùng gửi tin nhắn: text/link/image/file/audio được đánh dấu `pending_review`, sau đó backend kiểm duyệt bằng rule cục bộ, Gemini hoặc AssemblyAI tùy loại dữ liệu. Nếu nội dung bị chặn, hệ thống đặt `reportStatus=true`, ẩn nội dung vi phạm khỏi client, cập nhật lastMessage và phát event `message-moderated`. Lớp thứ hai là luồng report/admin: người dùng có thể báo cáo tin nhắn hoặc tài khoản, admin có thể dùng AI để rà soát lại báo cáo; chỉ các kết quả đủ điều kiện mới được tự động xác nhận, còn trường hợp không chắc chắn hoặc lỗi sẽ đưa về trạng thái cần admin xem xét."

Giải thích kỹ thuật:
AI moderation có threshold `0.8` cho text/link/image và auto-confirm threshold mặc định `0.8` ở admin review. Khi lỗi model, parse lỗi, thiếu API key hoặc không transcribe được audio, hệ thống có xu hướng fail-open/skip thay vì tự động khóa sai. Điều này cần được viết rõ để giải thích false positive/false negative.

Dựa trên source nào:
- `backend/src/controllers/messageController.js`, functions `sendMessage`, `reviewDeliveredMessage`, `moderateDeliveredMessage`
- `backend/src/services/moderation/moderationTextService.js`
- `backend/src/services/moderation/moderationLinkService.js`
- `backend/src/services/moderation/imageModerationService.js`
- `backend/src/services/audio/transcribeAudio.js`
- `backend/src/services/moderation/messageModerationReviewService.js`
- `backend/src/controllers/reportController.js`
- `backend/src/controllers/adminController.js`, functions `aiReviewMessageReports`, `resolveAdminReport`, `reviewAdminAppeal`
========================

========================
Chương:
Chương 5 hoặc Phần kết luận

Mục:
Rủi ro AI sai và cơ chế xử lý false positive/false negative

Trang:
Đề xuất bổ sung gần trang 139-140

Lý do cần sửa:
Giảng viên góp ý cần nói AI có thể sai. Source có cơ chế để giảm rủi ro AI sai nhưng báo cáo chưa phân tích đủ.

Nội dung cũ:
Chưa có đoạn riêng phân tích false positive/false negative.

Nội dung đề xuất:
"Do AI moderation có thể phát sinh false positive hoặc false negative, NexCon không xem AI là cơ chế duy nhất trong mọi trường hợp. Với báo cáo vi phạm, AI chỉ hỗ trợ phân tích và đề xuất. Kết quả có confidence thấp, lỗi kiểm duyệt, parse lỗi, thiếu dữ liệu hoặc transcription không khả dụng sẽ không tự động xác nhận vi phạm mà chuyển sang trạng thái `skipped`, `safe_or_uncertain` hoặc `needs_admin_review`. Người dùng vẫn có thể gửi report thủ công khi nội dung vi phạm không bị AI phát hiện. Khi tài khoản bị khóa, hệ thống hỗ trợ kháng cáo để admin xem xét lại và có thể mở khóa nếu quyết định xử lý trước đó chưa phù hợp."

Giải thích kỹ thuật:
`shouldAutoConfirmModeration` không auto-confirm nếu category là `moderation_error`, `parse_error`, `moderation_unavailable`, `transcription_unavailable`; nếu có confidence thì phải đạt ngưỡng. `reviewAdminAppeal` cho phép admin approve/reject kháng cáo; approve sẽ gọi `unlockAccount`.

Dựa trên source nào:
- `backend/src/services/moderation/messageModerationReviewService.js`
- `backend/src/controllers/adminController.js`
- `backend/src/models/reportModel.js`
- `backend/src/models/lockAppealModel.js`
- `backend/src/services/moderation/violationService.js`
========================

========================
Chương:
Chương 2 - Cơ sở lý thuyết và công nghệ sử dụng

Mục:
2.4.4. MongoDB và Mongoose

Trang:
Trang báo cáo: 43

Lý do cần sửa:
Giảng viên hỏi tại sao MongoDB không tăng quá nhanh. Báo cáo có nói index và Cloudinary, nhưng chưa gom thành một đoạn giải thích chiến lược kiểm soát tăng trưởng dữ liệu hiện tại và hướng phát triển.

Nội dung cũ:
"NexCon sử dụng các index theo hội thoại, người tham gia, thời gian tạo, trạng thái tin nhắn và các trường liên quan..."

Nội dung đề xuất:
"Để hạn chế tốc độ tăng dữ liệu trong MongoDB, NexCon không lưu binary media trực tiếp trong database mà lưu trên Cloudinary, MongoDB chỉ lưu metadata như `filePublicId`, `fileName`, `fileSize`, `mimeType`. Message được tham chiếu tới conversation qua `conversationId`, còn conversation chỉ lưu snapshot `lastMessage` để phục vụ danh sách hội thoại, tránh phải đọc message mới nhất quá nhiều lần. Các API đọc tin nhắn dùng cursor/pagination và giới hạn số lượng bản ghi mỗi lần tải. Một số loại dữ liệu ngắn hạn có TTL index như OTP, session, notification, audit log, report/appeal sau xử lý. Với nhóm đã giải tán, hệ thống đặt `deleteAfter` và dùng BullMQ worker để xóa message, reminder và media sau thời gian retention. Với lịch sử chat đã clear ở tất cả thành viên, worker riêng sẽ dọn vật lý các message/media không còn cần hiển thị. Với disappearing messages, worker đánh dấu tin hết hạn, xóa nội dung tìm kiếm và dọn media nếu không còn reference khác."

Giải thích kỹ thuật:
Đây là các cơ chế đang có trong source. Tuy nhiên, chưa thấy sharding, archival storage hoặc bucket hóa message theo tháng/conversation. Các điểm đó nên ghi là hướng phát triển, không ghi như hiện trạng.

Dựa trên source nào:
- `backend/src/models/messageModel.js`
- `backend/src/models/conversationModel.js`
- `backend/src/models/sessionModel.js`
- `backend/src/models/otpModel.js`
- `backend/src/models/notificationModel.js`
- `backend/src/models/auditLogModel.js`
- `backend/src/models/reportModel.js`
- `backend/src/controllers/conversationController.js`, function `getMessages`
- `backend/src/services/disappearingMessageService.js`
- `backend/src/workers/groupCleanupWorker.js`
- `backend/src/workers/conversationClearCleanupWorker.js`
========================

========================
Chương:
Phần kết luận

Mục:
4.2. Tối ưu hóa hạ tầng kỹ thuật

Trang:
Trang báo cáo: 140-141

Lý do cần sửa:
Hướng phát triển nên tách rõ việc đã có và việc sẽ làm. Một số ý như tách worker khỏi API replicas đã có cấu hình trong `docker-compose.yml` và script worker, nhưng cần đảm bảo production thực sự chạy worker riêng.

Nội dung cũ:
"Tách biệt worker và API server: tách worker scheduler ra khỏi API replicas để tránh tình trạng tác vụ nền chạy trùng lặp trên nhiều instance..."

Nội dung đề xuất:
"Tách biệt worker và API server trong production: source đã có worker runner riêng và Docker Compose có service worker riêng cho một số tác vụ. Hướng phát triển/vận hành tiếp theo là bảo đảm trên Railway các worker process được triển khai thành service riêng, các biến `ENABLE_INLINE_*_WORKER` được cấu hình phù hợp để tránh cùng một scheduler chạy trùng trên nhiều API replicas."

Giải thích kỹ thuật:
`server.js` có logic start inline workers tùy biến môi trường. Docker Compose tách `group-cleanup-worker`. Các queue BullMQ có jobId/delay/removeOnComplete, nhưng nếu production bật inline worker ở nhiều API replicas thì vẫn có rủi ro tác vụ nền chạy nhiều process.

Dựa trên source nào:
- `backend/src/server.js`
- `docker-compose.yml`
- `backend/src/workers/*Runner.js`
- `backend/package.json`
- `backend/src/config/*Queue.js`
========================

========================
Chương:
Danh sách tài liệu tham khảo

Mục:
Tài liệu tham khảo

Trang:
Trang báo cáo: 142

Lý do cần sửa:
Danh sách hiện có 9 tài liệu. Báo cáo dùng thêm nhiều công nghệ/khái niệm nhưng chưa có nguồn tương ứng: Mongoose, Redis, BullMQ, k6, Docker, Vercel, Railway, JWT, Cloudinary signed/authenticated delivery, Firebase Cloud Messaging, Push API, Gemini API, AssemblyAI, WebRTC, Socket.IO Redis Adapter, Capacitor, TypeScript, Vite, Zustand, OWASP.

Nội dung cũ:
Danh sách [1] đến [9], gồm Clean Architecture, Designing Data-Intensive Applications, Node.js, Express, React, Socket.IO, MongoDB, LiveKit, Tailwind CSS.

Nội dung đề xuất:
Bổ sung từ [10] trở đi:

[10] Mongoose. (2026). Mongoose Documentation. Truy cập từ: https://mongoosejs.com/docs/

[11] Redis. (2026). Redis Documentation. Truy cập từ: https://redis.io/docs/latest/

[12] Taskforce.sh. (2026). BullMQ Documentation. Truy cập từ: https://docs.bullmq.io/

[13] Grafana Labs. (2026). Grafana k6 Documentation. Truy cập từ: https://grafana.com/docs/k6/latest/

[14] Docker Inc. (2026). Docker Documentation. Truy cập từ: https://docs.docker.com/

[15] Vercel. (2026). Vercel Documentation. Truy cập từ: https://vercel.com/docs

[16] Railway. (2026). Railway Documentation. Truy cập từ: https://docs.railway.com/

[17] Jones, M., Bradley, J., & Sakimura, N. (2015). RFC 7519: JSON Web Token (JWT). IETF. Truy cập từ: https://datatracker.ietf.org/doc/html/rfc7519

[18] Cloudinary. (2026). Media Access Control and Authentication. Truy cập từ: https://cloudinary.com/documentation/control_access_to_media

[19] Firebase. (2026). Firebase Cloud Messaging Documentation. Truy cập từ: https://firebase.google.com/docs/cloud-messaging

[20] MDN Web Docs. (2026). Push API. Truy cập từ: https://developer.mozilla.org/en-US/docs/Web/API/Push_API

[21] Google AI for Developers. (2026). Gemini API Documentation. Truy cập từ: https://ai.google.dev/gemini-api/docs

[22] AssemblyAI. (2026). AssemblyAI Documentation. Truy cập từ: https://www.assemblyai.com/

[23] MDN Web Docs. (2026). WebRTC API. Truy cập từ: https://developer.mozilla.org/en-US/docs/Web/API/WebRTC_API

[24] Socket.IO. (2026). Redis Adapter Documentation. Truy cập từ: https://socket.io/docs/v4/redis-adapter/

[25] Capacitor. (2026). Capacitor Documentation. Truy cập từ: https://capacitorjs.com/docs/

[26] Microsoft. (2026). TypeScript Documentation. Truy cập từ: https://www.typescriptlang.org/docs/

[27] Vite. (2026). Vite Documentation. Truy cập từ: https://vite.dev/guide/

[28] Zustand. (2026). Zustand Documentation. Truy cập từ: https://zustand.docs.pmnd.rs/

[29] OWASP Foundation. (2026). OWASP Web Security Testing Guide. Truy cập từ: https://owasp.org/www-project-web-security-testing-guide/

Giải thích kỹ thuật:
Các tài liệu này bám đúng công nghệ được nhắc trong Chương 2 và Chương 5. Khi bổ sung, cần chèn citation vào các đoạn lý thuyết tương ứng để tài liệu tham khảo không bị "treo" ở cuối mà không được dùng trong nội dung.

Dựa trên source nào:
- `docs/CLC_HTTT_07_NguyenHoaiBao_TranNhuThien.pdf`, trang 37-45, 123-136, 142
- `backend/package.json`
- `frontend/package.json`
- `performance/real-user.k6.js`
- `docker-compose.yml`
- `.github/workflows/ci.yml`
========================

## Gợi ý vị trí chèn citation

- Trang 38-39: REST API, Socket.IO, multi-instance, Redis Adapter: thêm citation Socket.IO, Socket.IO Redis Adapter, Redis.
- Trang 42: JWT, bcrypt, rate limit, CORS, bảo mật web: thêm RFC 7519, OWASP.
- Trang 43: MongoDB/Mongoose/index: thêm MongoDB và Mongoose.
- Trang 43-44: Redis/BullMQ: thêm Redis và BullMQ.
- Trang 44: Cloudinary signed/authenticated media, LiveKit/WebRTC, FCM/Web Push, Gemini, AssemblyAI: thêm Cloudinary, LiveKit, MDN WebRTC, Firebase, MDN Push API, Gemini, AssemblyAI.
- Trang 45-47: TypeScript, Vite, Zustand, Capacitor: thêm TypeScript, Vite, Zustand, Capacitor.
- Trang 123-136: Docker, Vercel, Railway, GitHub Actions, k6: thêm Docker, Vercel, Railway, k6.

## Các điểm không tìm thấy bằng chứng trong source

- Không tìm thấy RabbitMQ.
- Không tìm thấy End-to-End Encryption phía client.
- Không tìm thấy `helmet` hoặc `express-mongo-sanitize` trong backend.
- Không tìm thấy cấu hình plan Railway `$5`, CPU/RAM cụ thể hoặc log Railway metrics tại thời điểm chạy k6.
- Không tìm thấy sharding, archival storage hoặc bucket hóa message theo tháng/conversation; chỉ nên ghi các ý này là hướng phát triển.
