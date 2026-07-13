# Tài liệu tham khảo rút gọn và vị trí chèn trích dẫn

## DANH SÁCH TÀI LIỆU THAM KHẢO

[1] Martin, R. C. (2017). Clean Architecture: A Craftsman's Guide to Software Structure and Design. Prentice Hall.

[2] Kleppmann, M. (2017). Designing Data-Intensive Applications. O'Reilly Media.

[3] Node.js Foundation. (2026). Node.js Documentation. Truy cập từ: https://nodejs.org/docs/latest/api/

[4] Express.js. (2026). Express.js Documentation. Truy cập từ: https://expressjs.com/

[5] React Team. (2026). React Documentation. Truy cập từ: https://react.dev/

[6] Socket.IO. (2026). Socket.IO Documentation. Truy cập từ: https://socket.io/docs/

[7] MongoDB Inc. (2026). MongoDB Manual. Truy cập từ: https://www.mongodb.com/docs/

[8] LiveKit. (2026). LiveKit Documentation. Truy cập từ: https://docs.livekit.io/

[9] Tailwind Labs. (2026). Tailwind CSS Documentation. Truy cập từ: https://tailwindcss.com/docs

[10] Mongoose. (2026). Mongoose Documentation. Truy cập từ: https://mongoosejs.com/docs/

[11] Redis. (2026). Redis Documentation. Truy cập từ: https://redis.io/docs/latest/

[12] Taskforce.sh. (2026). BullMQ Documentation. Truy cập từ: https://docs.bullmq.io/

[13] Jones, M., Bradley, J., & Sakimura, N. (2015). RFC 7519: JSON Web Token (JWT). IETF. Truy cập từ: https://datatracker.ietf.org/doc/html/rfc7519

[14] OWASP Foundation. (2026). Password Storage Cheat Sheet. Truy cập từ: https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html

[15] Dworkin, M. (2007). Recommendation for Block Cipher Modes of Operation: Galois/Counter Mode (GCM) and GMAC. NIST Special Publication 800-38D. Truy cập từ: https://csrc.nist.gov/pubs/sp/800/38/d/final

[16] Socket.IO. (2026). Redis Adapter Documentation. Truy cập từ: https://socket.io/docs/v4/redis-adapter/

[17] Cloudinary. (2026). Media Access Control and Authentication. Truy cập từ: https://cloudinary.com/documentation/control_access_to_media

[18] Firebase. (2026). Firebase Cloud Messaging Documentation. Truy cập từ: https://firebase.google.com/docs/cloud-messaging

[19] Google AI for Developers. (2026). Gemini API Documentation. Truy cập từ: https://ai.google.dev/gemini-api/docs

[20] Vercel. (2026). Vercel Documentation. Truy cập từ: https://vercel.com/docs

[21] Railway. (2026). Railway Documentation. Truy cập từ: https://docs.railway.com/

[22] Grafana Labs. (2026). Grafana k6 Documentation. Truy cập từ: https://grafana.com/docs/k6/latest/

## Vị trí cần gắn trích dẫn trong báo cáo

Ghi chú:
- Trang dưới đây là trang báo cáo, không phải trang vật lý của file Word.
- Khi sửa trong Word, dùng Ctrl+F theo cụm trong cột "Đoạn cần tìm", rồi gắn citation ở cuối câu hoặc cuối đoạn tương ứng.

| Trang | Dòng | Mục/đoạn cần tìm | Gắn citation |
| ---: | ---: | --- | --- |
| 37 | 5 | `Ứng dụng web là phần mềm được triển khai trên máy chủ` | [3], [4] |
| 37 | 17 | `Mô hình client-server là mô hình phổ biến trong phát triển ứng dụng web` | [1], [2] |
| 37 | 24 | `REST API: dùng cho các thao tác có quy trình nghiệp vụ rõ ràng` | [4] |
| 37 | 25 | `WebSocket/Socket.IO: dùng cho các cập nhật tức thời` | [6] |
| 38 | 13 | `Single Page Application (SPA) là mô hình ứng dụng web` | [5] |
| 38 | 24 | `Khi backend chạy nhiều instance, mỗi kết nối WebSocket` | [2], [6], [11], [16] |
| 39 | 4 | `NexCon giải quyết vấn đề này bằng Redis` | [11], [16] |
| 40 | 5 | `Người dùng tương tác với ứng dụng thông qua web client` | [1], [2], [4], [6], [7], [11] |
| 40 | 10 | `Back-end là phần trung tâm xử lý nghiệp vụ của hệ thống` | [1], [3], [4] |
| 41 | 6 | `Node.js là môi trường thực thi JavaScript phía server` | [3] |
| 41 | 12 | `ExpressJS là framework web được sử dụng để xây dựng REST API` | [4] |
| 41 | 23 | `NexCon sử dụng JSON Web Token (JWT)` | [13] |
| 42 | 3 | `Về bảo mật, hệ thống sử dụng bcrypt` | [14] |
| 42 | 7 | `AES-256-GCM` | [15] |
| 42 | 26 | `Socket.IO là thư viện hỗ trợ giao tiếp hai chiều` | [6] |
| 43 | 11 | `hệ thống sử dụng Socket.IO Redis Adapter` | [11], [16] |
| 43 | 16 | `MongoDB là hệ quản trị cơ sở dữ liệu NoSQL dạng document` | [2], [7] |
| 43 | 22 | `Mongoose là thư viện ODM giúp Node.js làm việc với MongoDB` | [10] |
| 44 | 2 | `Đối với ứng dụng chat, hiệu năng truy vấn dữ liệu là yếu tố quan trọng` | [2], [7], [10] |
| 44 | 4 | `Redis là hệ quản trị dữ liệu key-value chạy trong bộ nhớ RAM` | [11] |
| 44 | 9 | `Redis được sử dụng để lưu các dữ liệu thay đổi nhanh` | [11], [16] |
| 44 | 13 | `BullMQ là thư viện hàng đợi tác vụ nền` | [12] |
| 44 | 23 | `Cloudinary được dùng để lưu trữ hình ảnh, file và audio message` | [17] |
| 45 | 1 | `LiveKit được sử dụng cho chức năng gọi thoại` | [8] |
| 45 | 6 | `Firebase Cloud Messaging và Web Push được sử dụng` | [18], [19] |
| 45 | 14 | `Front-end là phần giao diện mà người dùng tương tác trực tiếp` | [5] |
| 45 | 25 | `ReactJS là một thư viện JavaScript` | [5] |
| 46 | 20 | `TailwindCSS là framework CSS theo hướng utility-first` | [9] |
| 125 | 28 | `Front-end được triển khai trên Vercel, còn backend được triển khai trên Railway` | [20], [21] |
| 128 | 7 | `Vite đóng gói toàn bộ mã nguồn và sinh ra thư mục dist` | [20] |
| 129 | 15 | `Khi chạy 6 replicas, Railway phân phối request` | [21], [11], [16] |
| 134 | 26 | `NexCon sử dụng k6` | [22] |
| 135 | 14 | `Các threshold chính được cấu hình` | [22] |
| 139 | 9 | `Kết quả k6 stress test` | [22] |

