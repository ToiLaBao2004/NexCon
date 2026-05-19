# Quy trình tích hợp CI/CD cho dự án NexCon

## 1. Mục tiêu

Tài liệu này mô tả quy trình tích hợp CI/CD cho dự án NexCon, gồm:

- Backend triển khai trên Railway.
- Frontend triển khai trên Vercel.
- Source code được quản lý trên GitHub.
- Nhánh production chính là `main`.

Mục tiêu của CI/CD là đảm bảo code được kiểm tra tự động trước khi được merge vào `main`, sau đó mới tự động deploy lên production.

## 2. Phân biệt CI và CD trong dự án

### CI - Continuous Integration

CI là bước kiểm tra tự động khi có code mới được push hoặc có Pull Request vào `main`.

Trong NexCon, CI được cấu hình bằng GitHub Actions tại:

```text
.github/workflows/ci.yml
```

CI hiện kiểm tra:

- Backend cài dependencies và chạy test.
- Frontend cài dependencies, chạy lint, test và build production.

### CD - Continuous Deployment

CD là bước tự động deploy sau khi code đã được merge vào `main`.

Trong NexCon:

- Railway tự deploy backend khi `main` thay đổi.
- Vercel tự deploy frontend khi `main` thay đổi.

Railway và Vercel đang đảm nhiệm phần CD. GitHub Actions đảm nhiệm phần CI.

## 3. Luồng CI/CD tổng thể

Quy trình chuẩn:

```text
Tạo branch mới
→ Code tính năng/sửa lỗi
→ Push branch lên GitHub
→ Tạo Pull Request vào main
→ GitHub Actions chạy CI
→ Backend và Frontend checks phải pass
→ Merge Pull Request vào main
→ Railway/Vercel tự deploy production
```

Không nên push trực tiếp vào `main`, vì như vậy code có thể đi thẳng lên production.

## 4. Cấu hình GitHub Actions

File workflow:

```text
.github/workflows/ci.yml
```

Workflow chạy khi:

```yaml
on:
  push:
    branches:
      - main
  pull_request:
    branches:
      - main
```

Nghĩa là CI sẽ chạy trong 2 trường hợp:

- Có Pull Request vào `main`.
- Có commit được push lên `main`.

## 5. Job kiểm tra backend

Job backend trong CI:

```yaml
backend:
  name: Backend
  runs-on: ubuntu-latest
```

Các bước chính:

```bash
npm ci
npm test
```

Ý nghĩa:

- `npm ci`: cài dependencies đúng theo `package-lock.json`.
- `npm test`: chạy test backend bằng Node.js test runner.

Backend test script được khai báo trong:

```text
backend/package.json
```

```json
"test": "node --test"
```

Các test backend hiện có:

```text
backend/test/fieldFormat.test.js
backend/test/isMuted.test.js
backend/test/moderationPromptService.test.js
```

## 6. Job kiểm tra frontend

Job frontend trong CI:

```yaml
frontend:
  name: Frontend
  runs-on: ubuntu-latest
```

Các bước chính:

```bash
npm ci --legacy-peer-deps
npm run lint
npm test
npm run build
```

Ý nghĩa:

- `npm ci --legacy-peer-deps`: cài dependencies frontend. Dự án hiện có xung đột peer dependency liên quan Capacitor, nên cần dùng flag này.
- `npm run lint`: kiểm tra lint.
- `npm test`: chạy test frontend bằng Vitest.
- `npm run build`: kiểm tra frontend có build production được không.

Lưu ý: bước lint đang được cấu hình:

```yaml
continue-on-error: true
```

Lý do là codebase hiện còn nhiều lỗi lint cũ. CI vẫn hiển thị lỗi lint để theo dõi, nhưng chưa dùng lint để chặn merge. Hai bước quan trọng đang chặn merge là test và build.

Frontend test script được khai báo trong:

```text
frontend/package.json
```

```json
"test": "vitest run"
```

Các test frontend hiện có:

```text
frontend/tests/fieldFormat.test.ts
frontend/tests/meetingLink.test.ts
```

## 7. Branch protection / Ruleset cho nhánh main

GitHub Actions chỉ tạo ra các bước kiểm tra tự động. Để bắt buộc CI phải pass trước khi merge, cần bật Branch Protection hoặc Ruleset cho nhánh `main`.

Cấu hình khuyến nghị:

```text
Target branch: main
Enforcement status: Active
Require a pull request before merging: enabled
Require status checks to pass: enabled
Require branches to be up to date before merging: enabled
Block force pushes: enabled
```

Required status checks cần chọn:

```text
Backend
Frontend
```

Hoặc GitHub có thể hiển thị dạng:

```text
CI / Backend
CI / Frontend
```

Nếu chưa thấy các checks này trong dropdown, hãy để workflow chạy ít nhất một lần bằng cách tạo Pull Request vào `main`, sau đó quay lại Ruleset để chọn checks.

## 8. Quy trình làm việc hằng ngày

### Bước 1: Tạo branch mới

Ví dụ:

```bash
git checkout -b feature/add-chat-test
```

### Bước 2: Code và test local

Backend:

```bash
cd backend
npm test
```

Frontend:

```bash
cd frontend
npm test
npm run build
```

### Bước 3: Push branch

```bash
git push origin feature/add-chat-test
```

### Bước 4: Tạo Pull Request vào main

Trên GitHub:

```text
Pull requests → New pull request → base: main → compare: branch mới
```

### Bước 5: Chờ CI chạy

Pull Request chỉ nên merge khi các checks sau pass:

```text
Backend
Frontend
```

### Bước 6: Merge vào main

Sau khi merge:

- Railway tự deploy backend.
- Vercel tự deploy frontend.

## 9. Cách kiểm tra CI/CD đã hoạt động đúng

Tạo một Pull Request thử vào `main`.

Nếu cấu hình đúng, GitHub sẽ hiển thị:

```text
Backend: passing
Frontend: passing
```

Nếu một trong hai check fail, GitHub sẽ không cho merge vào `main` khi ruleset đang active.

Sau khi merge thành công, kiểm tra:

- Railway dashboard để xem backend deployment mới.
- Vercel dashboard để xem frontend deployment mới.

## 10. Một số lỗi thường gặp

### Không thấy Backend / Frontend trong required checks

Nguyên nhân: workflow chưa từng chạy trên GitHub.

Cách xử lý:

```text
Push workflow lên GitHub
→ Tạo Pull Request vào main
→ Đợi GitHub Actions chạy
→ Quay lại Ruleset
→ Add checks Backend và Frontend
```

### Ruleset active nhưng không áp dụng

Kiểm tra phần Target branches. Cần có target:

```text
main
```

Nếu GitHub báo:

```text
This ruleset does not target any resources and will not be applied.
```

Nghĩa là chưa thêm target branch.

### Frontend npm ci bị lỗi peer dependency

Dự án hiện cần dùng:

```bash
npm ci --legacy-peer-deps
```

Do đó trong CI frontend cũng dùng lệnh này.

### Lint frontend fail

Hiện tại lint frontend còn nhiều lỗi cũ trong codebase. Vì vậy CI vẫn chạy lint để báo cáo, nhưng không chặn merge:

```yaml
continue-on-error: true
```

Khi codebase đã xử lý hết lỗi lint cũ, có thể xóa dòng này để lint trở thành bắt buộc.

## 11. Kết luận

Sau khi hoàn tất cấu hình, dự án NexCon có quy trình CI/CD như sau:

```text
Pull Request vào main
→ GitHub Actions chạy Backend và Frontend checks
→ Checks pass mới merge được
→ Merge vào main
→ Railway và Vercel tự deploy production
```

Đây là quy trình CI/CD hoàn chỉnh ở mức cơ bản, phù hợp để bảo vệ production khỏi các lỗi build/test trước khi deploy.
