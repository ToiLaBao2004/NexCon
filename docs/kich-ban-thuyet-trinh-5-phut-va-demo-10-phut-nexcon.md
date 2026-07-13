# Kịch bản thuyết trình NexCon 5 phút và thứ tự demo 10 phút

## 1. Kịch bản thuyết trình trong khoảng 5 phút

### Slide 1 - Giới thiệu đề tài

Kính thưa quý thầy cô, em xin phép bắt đầu phần trình bày khóa luận tốt nghiệp của nhóm em với đề tài: **Xây dựng ứng dụng nhắn tin và gọi thoại trực tuyến**.

Nhóm em gồm Nguyễn Hoài Bảo và Trần Như Thiện, thực hiện dưới sự hướng dẫn của cô TS. Phan Thị Huyền Trang. Mục tiêu của đề tài là xây dựng một nền tảng giao tiếp trực tuyến tích hợp các chức năng chính như nhắn tin, gọi thoại, họp trực tuyến, nhắc hẹn, thông báo, kiểm duyệt nội dung và quản trị hệ thống.

### Slide 2-3 - Lý do chọn đề tài và khảo sát hiện trạng

Lý do nhóm em chọn đề tài này xuất phát từ nhu cầu giao tiếp trực tuyến ngày càng lớn. Người dùng hiện nay không chỉ cần chat hoặc gọi đơn giản, mà còn cần họp nhóm, nhận thông báo, tạo nhắc hẹn và làm việc trên nhiều thiết bị.

Qua khảo sát, nhóm em nhận thấy các ứng dụng phổ biến thường mạnh về một nhóm chức năng riêng. Ví dụ Messenger, Zalo hoặc Instagram mạnh về chat và call; trong khi Zoom, Google Meet hoặc Microsoft Teams lại mạnh về họp trực tuyến. Vì vậy, người dùng thường phải chuyển đổi giữa nhiều ứng dụng.

Bên cạnh đó, các nền tảng giao tiếp cũng cần quan tâm đến vấn đề nội dung vi phạm tiêu chuẩn cộng đồng. Tin nhắn độc hại hoặc nội dung không phù hợp có thể ảnh hưởng trực tiếp đến người nhận. Từ đó, nhóm em định hướng NexCon là một nền tảng tích hợp chat, call, họp, nhắc hẹn và kiểm duyệt nội dung.

### Slide 4 - Mục tiêu đề tài

Từ vấn đề trên, nhóm em đặt ra ba mục tiêu chính.

Thứ nhất là xây dựng nền tảng chat và call realtime ổn định. Thứ hai là tích hợp các chức năng mở rộng như nhóm chat, họp trực tuyến, nhắc hẹn và thông báo. Thứ ba là bổ sung AI moderation và trang quản trị để hỗ trợ phát hiện, xử lý và theo dõi các nội dung vi phạm trong hệ thống.

### Slide 5-7 - Kiến trúc, use case và thiết kế dữ liệu

Về kiến trúc, NexCon được xây dựng theo mô hình client-server. Front-end sử dụng React, TypeScript, Vite và Tailwind CSS. Back-end sử dụng Node.js, Express.js và MongoDB thông qua Mongoose. Với realtime, hệ thống sử dụng Socket.IO; với gọi thoại và họp trực tuyến, hệ thống tích hợp LiveKit.

Ngoài ra, hệ thống dùng Redis cho Socket.IO Adapter, presence, cache và các tác vụ nền; Cloudinary để lưu media; Firebase Cloud Messaging và Web Push cho thông báo; Gemini và AssemblyAI cho kiểm duyệt nội dung text, link, ảnh và audio.

Về phạm vi chức năng, người dùng có thể đăng ký, đăng nhập, kết bạn, tạo hội thoại, nhắn tin, gọi thoại, họp trực tuyến, tạo nhắc hẹn và nhận thông báo. Quản trị viên có thể xem dashboard, xử lý báo cáo vi phạm, khóa hoặc mở khóa tài khoản, xử lý kháng cáo và theo dõi audit log.

Về dữ liệu, các collection chính gồm User, Conversation, Message, Friend, Notification, Reminder, Report, LockAppeal và Session. Thiết kế này giúp hệ thống hỗ trợ được các nghiệp vụ như tin nhắn realtime, phân trang tin nhắn, media có kiểm tra quyền, báo cáo vi phạm và quản trị người dùng.

### Slide 8-9 - Realtime và scale ngang

Phần cốt lõi của hệ thống là nhắn tin realtime. Khi người dùng gửi tin nhắn, back-end kiểm tra quyền truy cập, xử lý nội dung, lưu tin nhắn vào MongoDB, cập nhật hội thoại và phát sự kiện qua Socket.IO đến các thành viên liên quan.

Khi triển khai production, back-end có thể chạy nhiều replicas trên Railway. Vấn đề là Socket.IO room mặc định chỉ tồn tại trong từng instance. Vì vậy, nhóm em sử dụng Socket.IO Redis Adapter để đồng bộ event giữa các replicas. Nhờ Redis Pub/Sub, dù người dùng kết nối vào replica khác nhau, các sự kiện như tin nhắn mới, typing, reaction hoặc thông báo realtime vẫn được gửi đúng.

### Slide 10-12 - Các chức năng chính

Về nhắn tin, NexCon hỗ trợ nhiều loại nội dung như text, ảnh, file, audio, sticker và link preview. Người dùng có thể reply, mention, react, ghim, thu hồi, chuyển tiếp và tìm kiếm tin nhắn. Với media, hệ thống dùng signed URL và kiểm tra quyền truy cập trước khi trả tài nguyên.

Về gọi thoại và họp, hệ thống tích hợp LiveKit để hỗ trợ audio call, video call, gọi nhóm và phòng họp trực tuyến. NexCon cũng hỗ trợ nhắc hẹn cá nhân hoặc nhóm, đồng thời gửi thông báo qua FCM và Web Push.

Về an toàn nội dung, hệ thống có AI moderation cho text, link, ảnh và audio. Với audio, AssemblyAI chuyển giọng nói thành văn bản trước khi kiểm duyệt. Người dùng có thể báo cáo vi phạm hoặc kháng cáo, còn admin có thể xử lý báo cáo, khóa/mở khóa tài khoản và xem audit log.

### Slide 13-15 - Triển khai, kiểm thử và kết quả

Về triển khai, front-end được deploy trên Vercel, back-end deploy trên Railway và có hỗ trợ nhiều replicas. Hệ thống tách biến môi trường production cho front-end và back-end, đồng thời có định hướng CI/CD để tự động build, test và deploy.

Về kiểm thử, nhóm em thực hiện manual test case cho các luồng chính, unit test cho các module trọng tâm và kiểm thử hiệu năng bằng k6. Với kịch bản real-user, hệ thống được mô phỏng ở mức 250 VUs, gồm 50 REST VUs và 200 Socket.IO VUs. Kết quả ghi nhận check pass khoảng 98,1%, HTTP failed khoảng 2,45%, Socket.IO connect success đạt 100% và không ghi nhận socket error.

Kết quả đạt được là hệ thống đã hoàn thành chat/call realtime end-to-end, tích hợp quản trị và kiểm duyệt nội dung, triển khai được trên môi trường production và đã có kiểm thử chức năng cũng như hiệu năng.

### Slide 16-18 - Hạn chế, hướng phát triển và kết thúc

Bên cạnh kết quả đạt được, hệ thống vẫn còn một số hạn chế. REST API cần tiếp tục tối ưu hiệu năng, hệ thống chưa áp dụng mã hóa đầu cuối E2EE, độ phủ kiểm thử tự động còn cần mở rộng, còn phụ thuộc vào một số dịch vụ bên thứ ba và AI moderation chưa thể chính xác tuyệt đối.

Trong tương lai, nhóm em định hướng tối ưu hiệu năng REST API, bổ sung E2EE, mở rộng kiểm thử tự động, giảm phụ thuộc dịch vụ bên thứ ba và cải thiện kiểm duyệt AI bằng cách kết hợp thêm cơ chế human review, báo cáo và kháng cáo.

Trên đây là phần trình bày của nhóm em. Nhóm em xin chân thành cảm ơn cô TS. Phan Thị Huyền Trang đã hướng dẫn nhóm trong quá trình thực hiện khóa luận, và cảm ơn quý thầy cô đã lắng nghe. Nhóm em rất mong nhận được góp ý từ quý thầy cô để tiếp tục hoàn thiện đề tài tốt hơn.

## 2. Thứ tự demo chức năng trong khoảng 10 phút

### Chuẩn bị trước khi demo

- Mở sẵn 2 trình duyệt hoặc 2 tab profile khác nhau: `User A` và `User B`.
- Mở sẵn một tài khoản admin ở tab riêng.
- Chuẩn bị sẵn một hội thoại cá nhân, một nhóm chat, một file/ảnh nhỏ để gửi thử, một link để demo link preview.
- Nếu demo call/meeting phụ thuộc mạng hoặc LiveKit chưa ổn định, chuẩn bị sẵn ảnh/video ngắn làm phương án dự phòng.
- Không nên demo đăng ký OTP từ đầu nếu thời gian gấp; chỉ cần nói hệ thống có OTP và đăng nhập bằng tài khoản đã chuẩn bị.

### 0:00 - 0:45 | Mở hệ thống và đăng nhập

Thao tác:

- Mở trang NexCon production.
- Đăng nhập bằng `User A`.
- Mở tab thứ hai đăng nhập `User B`.

Lời nói:

“Đầu tiên em sẽ đăng nhập bằng hai tài khoản người dùng khác nhau để demo realtime. Việc dùng hai tab giúp mình thấy rõ tin nhắn, trạng thái typing và các event socket được đồng bộ tức thời giữa hai phía.”

### 0:45 - 1:30 | Hồ sơ, danh sách bạn bè và hội thoại

Thao tác:

- Vào nhanh màn hình hồ sơ hoặc sidebar người dùng.
- Mở danh sách bạn bè.
- Chọn hội thoại với `User B`.

Lời nói:

“Sau khi đăng nhập, người dùng có thể quản lý thông tin cá nhân, danh sách bạn bè và truy cập các hội thoại. Hệ thống hỗ trợ hội thoại cá nhân và nhóm, mỗi hội thoại lưu thành một conversation riêng trong cơ sở dữ liệu.”

### 1:30 - 2:30 | Nhắn tin realtime cơ bản

Thao tác:

- Ở `User A`, nhập tin nhắn nhưng chưa gửi để `User B` thấy typing nếu có.
- Gửi một tin nhắn text.
- Chuyển sang tab `User B` để cho thấy tin nhắn đến realtime.

Lời nói:

“Ở đây, khi em gửi tin nhắn từ User A, User B nhận được ngay mà không cần reload trang. Luồng xử lý là back-end lưu tin nhắn vào MongoDB, cập nhật last message của conversation và emit event qua Socket.IO đến các thành viên trong phòng chat.”

### 2:30 - 3:45 | Tính năng nhắn tin nâng cao

Thao tác:

- Gửi ảnh hoặc file nhỏ.
- Gửi một link để hiện link preview.
- Reply một tin nhắn.
- Mention người dùng trong nhóm hoặc hội thoại.
- Thả reaction.
- Ghim hoặc thu hồi một tin nhắn.
- Dùng ô tìm kiếm để tìm lại tin nhắn vừa gửi.

Lời nói:

“Ngoài text cơ bản, NexCon hỗ trợ ảnh, file, audio, sticker và link preview. Với media, hệ thống không dùng link public cố định mà sinh signed URL và kiểm tra quyền truy cập. Các thao tác như reply, mention, reaction, pin, recall và search giúp trải nghiệm nhắn tin đầy đủ hơn.”

### 3:45 - 4:45 | Nhóm chat và quản lý thành viên

Thao tác:

- Mở một nhóm chat đã chuẩn bị.
- Hiển thị danh sách thành viên.
- Nếu có quyền admin nhóm, mở nhanh phần quản lý nhóm.
- Demo thêm thành viên hoặc quyền tạo nhắc hẹn chung nếu phù hợp.

Lời nói:

“Ở phần nhóm chat, hệ thống hỗ trợ quản lý thành viên, quyền quản trị nhóm và một số cấu hình riêng cho nhóm. Các hành động liên quan đến nhóm đều được đồng bộ realtime qua Socket.IO để các thành viên thấy thay đổi kịp thời.”

### 4:45 - 6:00 | Gọi thoại, gọi video hoặc phòng họp

Thao tác:

- Từ hội thoại, bấm gọi audio/video hoặc mở màn hình họp.
- Cho `User B` nhận cuộc gọi hoặc tham gia phòng họp.
- Nếu mạng không ổn, chỉ mở màn hình phòng họp và nói phương án dự phòng.

Lời nói:

“Phần gọi thoại và họp trực tuyến được tích hợp thông qua LiveKit. Back-end sinh token phòng, front-end dùng LiveKit client để tham gia audio/video room. Hệ thống hỗ trợ gọi cá nhân, gọi nhóm và phòng họp trực tuyến.”

### 6:00 - 7:00 | Nhắc hẹn và thông báo

Thao tác:

- Tạo một nhắc hẹn nhanh trong hội thoại hoặc màn hình reminder.
- Hiển thị danh sách nhắc hẹn.
- Nếu có thể, cho thấy notification/in-app notification.

Lời nói:

“NexCon không chỉ có chat và call mà còn hỗ trợ nhắc hẹn cá nhân hoặc nhóm. Khi đến thời điểm nhắc, hệ thống có thể tạo notification và gửi thông báo qua Web Push hoặc FCM tùy nền tảng.”

### 7:00 - 8:30 | Báo cáo vi phạm và kiểm duyệt AI

Thao tác:

- Chọn một tin nhắn đã chuẩn bị để report.
- Gửi báo cáo vi phạm.
- Nếu có màn hình trạng thái moderation, mở nhanh cho user xem.
- Tránh gửi nội dung quá nhạy cảm trực tiếp trước hội đồng; dùng message mẫu hoặc report đã chuẩn bị.

Lời nói:

“Với phần an toàn nội dung, người dùng có thể báo cáo tin nhắn hoặc người dùng vi phạm. Ngoài báo cáo thủ công, hệ thống cũng có AI moderation cho text, link, ảnh và audio. Với audio, hệ thống chuyển giọng nói thành văn bản trước khi kiểm duyệt.”

### 8:30 - 9:30 | Trang admin, xử lý báo cáo và kháng cáo

Thao tác:

- Chuyển sang tài khoản admin.
- Mở dashboard admin.
- Mở danh sách báo cáo tin nhắn hoặc người dùng.
- Hiển thị chức năng xử lý report, khóa/mở khóa user, message appeal hoặc lock appeal.
- Mở audit log nếu có sẵn.

Lời nói:

“Ở phía admin, hệ thống có dashboard quản trị, danh sách báo cáo, kháng cáo và audit log. Admin có thể xem bằng chứng, xử lý báo cáo, khóa hoặc mở khóa tài khoản và ghi nhận lịch sử xử lý để đảm bảo minh bạch.”

### 9:30 - 10:00 | Kết thúc demo bằng production và kiểm thử

Thao tác:

- Quay lại slide hoặc mở nhanh màn hình deployment/k6 report nếu đã chuẩn bị.
- Nhắc lại production Vercel/Railway và k6 250 VUs.

Lời nói:

“Cuối cùng, hệ thống đã được triển khai production với front-end trên Vercel và back-end trên Railway. Nhóm em cũng kiểm thử bằng k6 với kịch bản 250 VUs, trong đó Socket.IO connect success đạt 100%. Phần demo của nhóm em đến đây là hết.”

## 3. Phiên bản demo rút gọn nếu bị thiếu thời gian

Nếu chỉ còn khoảng 5 phút demo, nên ưu tiên theo thứ tự:

1. Đăng nhập 2 tài khoản.
2. Gửi tin nhắn realtime.
3. Gửi ảnh/link preview + reaction/reply.
4. Gọi hoặc mở phòng họp LiveKit.
5. Tạo nhắc hẹn.
6. Report tin nhắn và mở admin dashboard xử lý báo cáo.

Không nên demo quá nhiều thao tác phụ như đổi avatar, quên mật khẩu, cấu hình nhóm chi tiết hoặc xem toàn bộ audit log nếu thời gian bị bóp lại.

