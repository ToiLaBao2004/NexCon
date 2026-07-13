# Kịch bản thuyết trình NexCon khoảng 10 phút

## Slide 1 - Giới thiệu đề tài

Kính thưa quý thầy cô, em xin phép bắt đầu phần trình bày khóa luận tốt nghiệp của nhóm em với đề tài: Xây dựng ứng dụng nhắn tin và gọi thoại trực tuyến.

Nhóm em gồm Nguyễn Hoài Bảo và Trần Như Thiện, thực hiện dưới sự hướng dẫn của cô TS. Phan Thị Huyền Trang. Mục tiêu chính của đề tài là xây dựng một nền tảng giao tiếp trực tuyến có thể đáp ứng các nhu cầu phổ biến như nhắn tin, gọi thoại, họp trực tuyến, nhắc hẹn, thông báo và quản trị nội dung.

Trong phần trình bày này, nhóm em sẽ đi qua lý do chọn đề tài, khảo sát hiện trạng, mục tiêu, kiến trúc hệ thống, các chức năng đã xây dựng, kết quả kiểm thử, hạn chế và hướng phát triển.

## Slide 2 - Lý do chọn đề tài

Lý do đầu tiên nhóm em chọn đề tài này là vì nhu cầu giao tiếp trực tuyến hiện nay rất lớn. Người dùng không chỉ cần nhắn tin, mà còn cần gọi thoại, gọi video, họp nhóm, nhận thông báo và quản lý lịch nhắc hẹn.

Tuy nhiên, khi khảo sát thực tế, nhóm em nhận thấy các chức năng này thường bị tách rời. Một số ứng dụng mạnh về chat và call, một số ứng dụng khác lại mạnh về họp trực tuyến. Điều này khiến người dùng phải chuyển đổi qua lại giữa nhiều nền tảng.

Bên cạnh đó, trong các hệ thống giao tiếp trực tuyến, vấn đề nội dung vi phạm tiêu chuẩn cộng đồng cũng rất quan trọng. Tin nhắn độc hại, quấy rối hoặc nội dung không phù hợp có thể ảnh hưởng trực tiếp đến người nhận. Vì vậy, nhóm em muốn xây dựng một nền tảng tích hợp hơn, đồng thời có thêm cơ chế kiểm duyệt và quản trị nội dung.

## Slide 3 - Khảo sát hiện trạng

Ở phần khảo sát hiện trạng, nhóm em chia các ứng dụng phổ biến thành hai nhóm chính.

Nhóm thứ nhất là các ứng dụng mạnh về chat và call như Messenger, Zalo hoặc Instagram. Các ứng dụng này thuận tiện cho giao tiếp hằng ngày, nhưng thường không tập trung mạnh vào các chức năng họp, nhắc hẹn hoặc quản trị nội dung chuyên sâu.

Nhóm thứ hai là các ứng dụng mạnh về họp trực tuyến như Zoom, Google Meet hoặc Microsoft Teams. Các nền tảng này hỗ trợ họp tốt, nhưng lại không phải lúc nào cũng phù hợp cho trải nghiệm nhắn tin cá nhân, nhóm chat và tương tác thường xuyên.

Từ khảo sát đó, nhóm em xác định hướng đi của NexCon là tích hợp các nhu cầu chính vào một hệ thống: chat, call, họp, nhắc hẹn, thông báo và kiểm duyệt nội dung.

## Slide 4 - Mục tiêu đề tài

Từ các vấn đề vừa nêu, nhóm em đặt ra ba mục tiêu chính.

Mục tiêu thứ nhất là xây dựng nền tảng chat và call realtime ổn định. Người dùng có thể gửi tin nhắn, nhận tin tức thời, gọi cá nhân, gọi nhóm và tham gia phòng họp trực tuyến.

Mục tiêu thứ hai là tích hợp các chức năng giao tiếp mở rộng như nhóm chat, nhắc hẹn và thông báo đa nền tảng. Hệ thống không chỉ dừng ở chat, mà còn hỗ trợ người dùng quản lý lịch nhắc và nhận thông báo kịp thời.

Mục tiêu thứ ba là bổ sung AI moderation và trang quản trị. Đây là phần giúp hệ thống phát hiện nội dung vi phạm, hỗ trợ báo cáo, kháng cáo, khóa tài khoản và theo dõi hoạt động quản trị.

## Slide 5 - Kiến trúc và công nghệ sử dụng

Về kiến trúc, NexCon được xây dựng theo mô hình client-server.

Phía front-end sử dụng React, TypeScript, Vite và Tailwind CSS để xây dựng giao diện web. Ngoài ra, nhóm em có tích hợp Capacitor để hỗ trợ định hướng mobile.

Phía back-end sử dụng Node.js và Express.js để xây dựng REST API, kết hợp Socket.IO cho các chức năng realtime. Dữ liệu chính được lưu trong MongoDB thông qua Mongoose.

Đối với các chức năng mở rộng, hệ thống dùng Redis cho Socket.IO Adapter, presence, cache và hàng đợi. Cloudinary được dùng để lưu trữ media như ảnh, file, audio. LiveKit được dùng cho gọi thoại, gọi video và phòng họp. Firebase Cloud Messaging và Web Push được dùng cho thông báo. Với phần kiểm duyệt, hệ thống tích hợp Gemini để kiểm duyệt nội dung và AssemblyAI để chuyển audio thành văn bản phục vụ kiểm duyệt.

## Slide 6 - Use case diagram

Slide này thể hiện phạm vi chức năng của hệ thống.

Với người dùng thông thường, các nhóm chức năng chính gồm đăng ký, đăng nhập, quản lý hồ sơ, kết bạn, tạo hội thoại, nhắn tin, gọi thoại, họp trực tuyến, tạo nhắc hẹn và nhận thông báo.

Trong phần nhắn tin, người dùng có thể gửi nhiều loại nội dung như text, ảnh, file, audio, sticker và link. Ngoài ra còn có các thao tác như trả lời, nhắc đến người khác, thả cảm xúc, ghim, thu hồi và chuyển tiếp tin nhắn.

Với quản trị viên, hệ thống hỗ trợ theo dõi báo cáo vi phạm, kiểm duyệt nội dung, khóa hoặc mở khóa tài khoản, xử lý kháng cáo và xem audit log. Việc tách vai trò người dùng và quản trị giúp hệ thống dễ kiểm soát quyền truy cập và nghiệp vụ an toàn nội dung.

## Slide 7 - Thiết kế dữ liệu ERD

Về thiết kế dữ liệu, hệ thống sử dụng MongoDB nên dữ liệu được tổ chức theo các collection chính.

Các collection trọng tâm gồm User, Conversation, Message, Friend, Notification, Reminder, Report, LockAppeal và Session. Trong đó, Conversation quản lý hội thoại cá nhân hoặc nhóm; Message lưu nội dung tin nhắn, loại tin nhắn, thông tin media, trạng thái thu hồi, ghim, reaction, mention và các metadata liên quan.

Thiết kế này giúp hệ thống hỗ trợ nhiều nghiệp vụ trên cùng một mô hình dữ liệu, ví dụ như phân trang tin nhắn theo cursor, kiểm tra quyền truy cập media, xử lý tin nhắn biến mất, báo cáo vi phạm và quản lý trạng thái người dùng.

## Slide 8 - Nhắn tin realtime

Đây là một trong những phần cốt lõi của hệ thống.

Khi người dùng gửi tin nhắn, front-end gọi API gửi tin nhắn lên back-end. Back-end kiểm tra quyền truy cập hội thoại, xử lý nội dung, lưu tin nhắn vào MongoDB, cập nhật last message của conversation, sau đó phát sự kiện realtime qua Socket.IO cho các thành viên trong phòng chat.

Với người nhận đang online, tin nhắn được đẩy realtime qua socket. Với người dùng offline hoặc không mở ứng dụng, hệ thống có thể gửi thông báo thông qua FCM hoặc Web Push tùy nền tảng.

Nhóm em cũng xử lý nhiều trạng thái đi kèm như typing, delivered, seen, reaction, recall, pin, forward và mention để trải nghiệm nhắn tin giống một ứng dụng thực tế.

## Slide 9 - Scale ngang và multi-replicas

Khi triển khai production, back-end không chỉ chạy một instance mà có thể chạy nhiều replicas trên Railway để tăng khả năng chịu tải và tính sẵn sàng.

Vấn đề đặt ra là Socket.IO room mặc định chỉ tồn tại trong bộ nhớ của từng instance. Nếu người gửi đang kết nối vào instance A, còn người nhận đang kết nối vào instance B, thì sự kiện realtime có thể không đến được nếu không có cơ chế đồng bộ.

Để giải quyết vấn đề này, nhóm em sử dụng Socket.IO Redis Adapter. Redis đóng vai trò pub/sub, giúp các instance back-end đồng bộ sự kiện với nhau. Nhờ đó, dù người dùng đang kết nối vào replica nào, các sự kiện như tin nhắn mới, typing, reaction hoặc thông báo realtime vẫn được truyền đến đúng người nhận.

## Slide 10 - Tính năng nhắn tin nâng cao

Ngoài gửi tin nhắn văn bản cơ bản, NexCon hỗ trợ nhiều tính năng nhắn tin nâng cao.

Về nội dung, người dùng có thể gửi text, ảnh, file, audio, sticker và link preview. Với media, hệ thống không trả trực tiếp link public cố định mà dùng signed URL và kiểm tra quyền truy cập trước khi trả tài nguyên cho người dùng.

Về tương tác, hệ thống hỗ trợ reaction, ghim tin nhắn, thu hồi tin nhắn và chuyển tiếp tin nhắn. Với nội dung hội thoại, người dùng có thể reply, mention và tìm kiếm tin nhắn.

Những chức năng này giúp ứng dụng không chỉ là demo gửi nhận tin nhắn, mà tiến gần hơn đến một hệ thống chat có thể sử dụng trong thực tế.

## Slide 11 - Gọi thoại, họp, nhắc hẹn và thông báo

Ở nhóm chức năng giao tiếp trực tuyến, hệ thống tích hợp LiveKit để hỗ trợ audio call và video call. Người dùng có thể gọi cá nhân, gọi nhóm hoặc tạo phòng họp trực tuyến.

Bên cạnh đó, NexCon có chức năng nhắc hẹn cho cá nhân và nhóm. Người dùng có thể tạo lịch nhắc, hệ thống lưu thông tin nhắc hẹn và phát thông báo khi đến thời điểm phù hợp.

Về thông báo, hệ thống hỗ trợ cả FCM và Web Push, giúp người dùng nhận thông báo trên web và mobile. Các thông báo quan trọng gồm tin nhắn mới, lời mời, mention, nhắc hẹn và các sự kiện liên quan đến cuộc gọi hoặc cuộc họp.

## Slide 12 - Kiểm duyệt AI và quản trị

Một điểm khác biệt của NexCon là nhóm em bổ sung lớp kiểm duyệt nội dung bằng AI.

Hệ thống có thể kiểm duyệt tin nhắn dạng text, link, ảnh và audio. Với audio, hệ thống sử dụng AssemblyAI để chuyển giọng nói thành văn bản, sau đó đưa nội dung văn bản vào quy trình kiểm duyệt. Với text, link và ảnh, hệ thống dùng Gemini để đánh giá nội dung có vi phạm tiêu chuẩn cộng đồng hay không.

Nếu phát hiện vi phạm, hệ thống có thể ẩn nội dung, cập nhật trạng thái báo cáo và hỗ trợ quản trị viên xử lý. Người dùng cũng có thể báo cáo vi phạm hoặc gửi kháng cáo trong trường hợp cần xem xét lại.

Trang admin hỗ trợ theo dõi báo cáo, xử lý tài khoản, xem audit log và nắm trạng thái tổng quan của hệ thống.

## Slide 13 - Triển khai và CI/CD

Về triển khai, front-end được build bằng React/Vite và triển khai trên Vercel. Back-end được triển khai trên Railway và có thể chạy nhiều replicas.

Nhóm em cũng tách biến môi trường production cho front-end và back-end, ví dụ như URL API, secret key, cấu hình MongoDB, Redis, Cloudinary, LiveKit, Firebase và các dịch vụ AI.

Về CI/CD, quy trình triển khai hướng đến việc tự động build, test và deploy sau khi merge code. Điều này giúp giảm thao tác thủ công, hạn chế lỗi triển khai và giúp hệ thống dễ bảo trì hơn trong quá trình phát triển.

## Slide 14 - Kiểm thử và đánh giá

Nhóm em thực hiện kiểm thử ở ba mức.

Thứ nhất là manual test case cho các luồng chính như đăng nhập, nhắn tin, tạo nhóm, gọi thoại, họp, nhắc hẹn, thông báo, báo cáo vi phạm và quản trị.

Thứ hai là unit test cho các module trọng tâm. Trong source hiện tại, back-end có các test cho mention, disappearing messages, kiểm tra định dạng field, moderation prompt, trạng thái người dùng và mute. Front-end có test cho mention, meeting link, field format và disappearing message.

Thứ ba là kiểm thử hiệu năng bằng k6 với kịch bản real-user. Kịch bản này mô phỏng 250 VUs, gồm 50 VUs thao tác REST API và 200 VUs duy trì Socket.IO. Kết quả ghi nhận tỷ lệ check pass khoảng 98,1%, HTTP failed khoảng 2,45%, Socket.IO connect success đạt 100% và không ghi nhận socket error.

Tuy nhiên, một số chỉ số latency vẫn còn cao, đặc biệt ở nhóm REST API, nên đây là phần nhóm em đưa vào hướng tối ưu tiếp theo.

## Slide 15 - Kết quả

Sau quá trình thực hiện, nhóm em đã hoàn thành các kết quả chính.

Thứ nhất, hệ thống chat/call realtime đã hoạt động end-to-end, từ gửi nhận tin nhắn, socket realtime đến gọi thoại và họp trực tuyến.

Thứ hai, hệ thống đã tích hợp các chức năng quản trị, báo cáo và kiểm duyệt nội dung. Đây là phần quan trọng để ứng dụng có khả năng kiểm soát nội dung vi phạm.

Thứ ba, hệ thống đã được triển khai trên môi trường production với front-end và back-end tách riêng, đồng thời có hỗ trợ multi-replicas cho back-end.

Thứ tư, nhóm em đã thực hiện kiểm thử chức năng và kiểm thử hiệu năng để đánh giá mức độ ổn định của hệ thống.

## Slide 16 - Hạn chế

Bên cạnh các kết quả đạt được, hệ thống vẫn còn một số hạn chế.

Đầu tiên, REST API vẫn cần được tối ưu thêm về hiệu năng. Kết quả k6 cho thấy hệ thống duy trì được kịch bản tải, nhưng độ trễ HTTP vẫn chưa đạt kỳ vọng ở một số thời điểm.

Thứ hai, hệ thống hiện có mã hóa ở tầng lưu trữ cho một số dữ liệu nhạy cảm, nhưng chưa áp dụng mã hóa đầu cuối E2EE. Điều này nghĩa là trong tương lai, nếu muốn nâng mức bảo mật tin nhắn lên cao hơn, cần thiết kế thêm cơ chế mã hóa mà server không đọc được nội dung gốc.

Thứ ba, kiểm thử tự động vẫn cần mở rộng. Hiện tại nhóm em đã có unit test cho một số module trọng tâm, nhưng chưa bao phủ đầy đủ toàn bộ nghiệp vụ lớn.

Thứ tư, hệ thống còn phụ thuộc vào nhiều dịch vụ bên thứ ba như Cloudinary, LiveKit, Firebase, Gemini và AssemblyAI. Nếu các dịch vụ này thay đổi hoặc gặp sự cố, hệ thống cũng bị ảnh hưởng.

Cuối cùng, kiểm duyệt AI không thể chính xác tuyệt đối. AI có thể bỏ sót hoặc đánh giá sai nội dung, nên vẫn cần cơ chế báo cáo, kháng cáo và quản trị viên xem xét lại.

## Slide 17 - Hướng phát triển

Từ các hạn chế trên, nhóm em đề xuất một số hướng phát triển tiếp theo.

Đầu tiên là tối ưu hiệu năng REST API, tập trung vào các endpoint đọc dữ liệu nhiều như conversation, message, friend và notification. Nhóm em có thể bổ sung profiling, tối ưu truy vấn, cache và giảm kích thước payload.

Thứ hai là bổ sung mã hóa đầu cuối E2EE cho tin nhắn để tăng mức độ riêng tư. Đây là phần cần thiết kế kỹ vì phải cân bằng giữa bảo mật, tìm kiếm tin nhắn, kiểm duyệt nội dung và trải nghiệm người dùng.

Thứ ba là mở rộng kiểm thử tự động, bao gồm test API, test socket event, test UI và test tích hợp cho các luồng nghiệp vụ lớn.

Thứ tư là giảm phụ thuộc vào dịch vụ bên thứ ba bằng cách thiết kế lớp adapter, fallback hoặc cơ chế thay thế dịch vụ khi cần.

Cuối cùng là cải thiện kiểm duyệt AI bằng cách kết hợp nhiều tín hiệu hơn, lưu lịch sử xử lý, hỗ trợ kháng cáo rõ ràng và bổ sung quy trình human review cho các trường hợp nhạy cảm.

## Slide 18 - Kết thúc

Trên đây là toàn bộ phần trình bày của nhóm em về đề tài Xây dựng ứng dụng nhắn tin và gọi thoại trực tuyến.

Thông qua đề tài này, nhóm em đã có cơ hội áp dụng nhiều kiến thức về phát triển web, realtime system, cơ sở dữ liệu, triển khai production, kiểm thử hiệu năng và an toàn nội dung.

Nhóm em xin chân thành cảm ơn cô TS. Phan Thị Huyền Trang đã hướng dẫn nhóm trong quá trình thực hiện khóa luận. Nhóm em cũng xin cảm ơn quý thầy cô đã lắng nghe phần trình bày.

Nhóm em rất mong nhận được góp ý từ quý thầy cô để có thể tiếp tục hoàn thiện đề tài tốt hơn. Em xin hết phần trình bày.

