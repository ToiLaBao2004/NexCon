# Kiểm tra format và chính tả báo cáo NexCon

Nguồn kiểm tra:
- `docs/CLC_HTTT_07_NguyenHoaiBao_TranNhuThien.pdf`
- `docs/CLC_HTTT_07_NguyenHoaiBao_TranNhuThien.docx`

Ngày kiểm tra: 08/07/2026

## 1. Kết luận nhanh

Tổng thể báo cáo trình bày ổn, bố cục rõ, hình ảnh và bảng đa số nằm đúng vị trí. Không phát hiện lỗi nghiêm trọng kiểu **tên hình ở trang này nhưng hình nằm trang khác**. Hệ thống đánh số hình cũng ổn: nội dung có đủ Hình 1 đến Hình 74, không thiếu số.

Tuy nhiên, vẫn nên sửa một số điểm trước khi nộp:

- Một vài bảng dài bị ngắt qua trang nhưng trang tiếp theo không có dòng "Bảng ... (tiếp theo)" hoặc header lặp lại.
- Có vài lỗi chính tả/cụm từ nhỏ: `đặt biệt`, `Socket.io`, `log api`, `98,1d%`.
- Một số thuật ngữ viết chưa thống nhất: `backend/back-end`, `realtime/real-time`, `api/API`.

## 2. Format hình ảnh

### 2.1. Điểm ổn

- Hình 1 đến Hình 74 xuất hiện đủ trong phần nội dung.
- Không phát hiện hình bị mất caption.
- Không phát hiện caption hình bị tách sang trang khác.
- Các trang nhiều hình như trang báo cáo 103-122 vẫn nhìn ổn, caption nằm ngay dưới hình tương ứng.

### 2.2. Điểm có thể cải thiện

- Một số sequence diagram ở Chương 3 khá rộng và chữ hơi nhỏ, ví dụ các trang báo cáo 84-100. Vẫn đọc được trong PDF, nhưng nếu muốn đẹp hơn thì có thể tăng kích thước hình hoặc xoay ngang vài sơ đồ lớn. Không bắt buộc sửa nếu thời gian gấp.

## 3. Format bảng

### 3.1. Điểm ổn

- Bảng thật trong nội dung chạy từ Bảng 1 đến Bảng 46, không thiếu số.
- Không phát hiện lỗi caption bảng đứng một trang còn bảng bắt đầu hoàn toàn ở trang khác.

### 3.2. Nên sửa

| Trang báo cáo | Vấn đề | Gợi ý sửa |
| ---: | --- | --- |
| 127-128 | Bảng 40 bị ngắt qua trang. Trang 128 chỉ còn phần cuối của bảng, không có nhãn `Bảng 40 (tiếp theo)` hoặc header lặp lại. | Nếu giữ bảng qua 2 trang, thêm dòng `Bảng 40. Các nhóm biến môi trường của hệ thống NexCon (tiếp theo)` ở đầu phần tiếp theo hoặc bật repeat header row. |
| 131-132 | Bảng 43 bắt đầu ở cuối trang 131, phần lớn nội dung nằm ở trang 132 nhưng không có header/caption tiếp theo. | Nên đẩy Bảng 43 sang trang 132 hoặc thêm `Bảng 43 ... (tiếp theo)` và repeat header. |
| 135-136 | Bảng 46 bị ngắt qua trang. Trang 136 chỉ là phần tiếp theo của bảng kết quả k6. | Nên thêm `Bảng 46. Kết quả kiểm thử hiệu năng của hệ thống bằng k6 (tiếp theo)` hoặc repeat header row. |

## 4. Chính tả và thuật ngữ cần sửa

| Trang báo cáo | Dòng | Nội dung hiện tại | Nên sửa thành |
| ---: | ---: | --- | --- |
| 45 | 7 | `đặt biệt là ứng dụng di động` | `đặc biệt là ứng dụng di động` |
| 12 | 11 | `Socket.io` | `Socket.IO` |
| 122 | - | `nhật ký log api` | `nhật ký log API` hoặc gọn hơn `nhật ký API` |
| 139 | 10 | `98,1d%` | `98,1%` |
| 126 | 1 | `các biến môi trường .env` | `các biến môi trường` hoặc `file .env` tùy ý câu |
| 127 | 8 | `trong file .env và đưa lên Environment Variables` | `trong file .env ở môi trường local và cấu hình trên Environment Variables khi deploy` |

Ghi chú:
- Cụm `đặt biệt danh` ở phần mô tả người dùng là đúng, không cần sửa.
- Các link trong tài liệu tham khảo có chứa `/api/` là URL, không cần đổi thành API.

## 5. Thuật ngữ nên thống nhất

Các thuật ngữ sau đang dùng lẫn nhiều kiểu. Không phải lỗi nghiêm trọng, nhưng nếu có thời gian nên thống nhất:

| Thuật ngữ | Nên dùng thống nhất |
| --- | --- |
| `backend`, `Back-end`, `back-end` | Chọn `back-end` khi viết trong câu tiếng Việt; dùng `Back-end` ở tiêu đề hoặc đầu câu. |
| `frontend`, `Front-end`, `front-end` | Chọn `front-end` khi viết trong câu tiếng Việt; dùng `Front-end` ở tiêu đề hoặc đầu câu. |
| `realtime`, `real-time` | Chọn `real-time` cho phần thuật ngữ kỹ thuật. |
| `api`, `API` | Dùng `API`. |
| `Socket.io`, `Socket.IO` | Dùng `Socket.IO`. |

## 6. Tài liệu tham khảo

Phần tài liệu tham khảo hiện đã có 22 nguồn và trình bày ổn. Tuy nhiên cần lưu ý:

- Citation trong nội dung phải khớp với số thứ tự tài liệu tham khảo.
- Nếu đã dùng `[18]`, `[19]`, `[20]`... trong nội dung thì danh mục cuối bài phải có đầy đủ các số này.
- Link bị xuống dòng là chấp nhận được trong Word/PDF, miễn là không làm mất phần URL.

## 7. Mức ưu tiên sửa

Nên sửa ngay:

1. `98,1d%` -> `98,1%`.
2. `đặt biệt` -> `đặc biệt`.
3. `Socket.io` -> `Socket.IO`.
4. `log api` -> `log API`.
5. Bảng 43 và Bảng 46 bị ngắt qua trang nhưng không có header/caption tiếp theo.

Có thể sửa nếu còn thời gian:

1. Thống nhất `back-end/front-end`.
2. Thống nhất `real-time`.
3. Thêm nhãn `(tiếp theo)` cho Bảng 40.
4. Phóng to nhẹ một số sequence diagram dài ở Chương 3.
