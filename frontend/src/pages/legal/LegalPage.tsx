import { Link } from "react-router";
import { ArrowLeft, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";

type LegalPageType = "terms" | "community" | "privacy";

interface LegalPageProps {
  type: LegalPageType;
}

const legalContent: Record<LegalPageType, {
  title: string;
  updatedAt: string;
  intro: string;
  sections: Array<{ title: string; body: string[] }>;
}> = {
  terms: {
    title: "Điều khoản sử dụng",
    updatedAt: "21/05/2026",
    intro: "Các điều khoản này quy định cách bạn sử dụng NexCon và trách nhiệm của mỗi bên khi tham gia nền tảng.",
    sections: [
      {
        title: "Tài khoản và bảo mật",
        body: [
          "Bạn chịu trách nhiệm giữ an toàn thông tin đăng nhập và các thiết bị đang đăng nhập.",
          "Không sử dụng tài khoản của người khác, giả mạo danh tính hoặc cố tình vượt qua biện pháp bảo mật.",
        ],
      },
      {
        title: "Sử dụng dịch vụ",
        body: [
          "Không gửi nội dung vi phạm pháp luật, gây hại, quấy rối, lừa đảo hoặc xâm phạm quyền riêng tư của người khác.",
          "NexCon có thể chặn nội dung, hạn chế tính năng hoặc khóa tài khoản khi phát hiện vi phạm rõ ràng.",
        ],
      },
      {
        title: "Xử lý vi phạm",
        body: [
          "Các quyết định kiểm duyệt có thể dựa trên AI, báo cáo từ người dùng và xác nhận của admin.",
          "Bạn có thể gửi khiếu nại khi cho rằng tài khoản bị khóa do nhầm lẫn.",
        ],
      },
    ],
  },
  community: {
    title: "Tiêu chuẩn cộng đồng",
    updatedAt: "21/05/2026",
    intro: "Tiêu chuẩn cộng đồng giúp NexCon giữ môi trường trò chuyện an toàn, tôn trọng và phù hợp với người dùng Việt Nam.",
    sections: [
      {
        title: "Nội dung bị cấm",
        body: [
          "Quấy rối, lăng mạ, hạ nhục, đe dọa, ngôn từ thù ghét hoặc công kích nhóm được bảo vệ.",
          "Nội dung tình dục rõ ràng, grooming, bạo lực nghiêm trọng, tự hại, ma túy, vũ khí trong ngữ cảnh gây hại.",
          "Lừa đảo, phishing, malware, giả mạo, spam gây hại hoặc liên kết dẫn đến nội dung nguy hiểm.",
        ],
      },
      {
        title: "Nội dung được phép",
        body: [
          "Trao đổi đời thường, đùa nhẹ giữa bạn bè, nội dung giáo dục, tin tức hoặc báo cáo vi phạm có ngữ cảnh rõ ràng.",
          "Nội dung mơ hồ hoặc thiếu bằng chứng sẽ không bị chặn chỉ vì AI không chắc chắn.",
        ],
      },
      {
        title: "Cách hệ thống phản ứng",
        body: [
          "Tin nhắn chỉ bị chặn khi AI hoặc admin xác định rõ nội dung vi phạm.",
          "Nếu AI lỗi, timeout, hết quota hoặc không đọc được nội dung, tin nhắn vẫn được cho gửi theo nguyên tắc fail-open.",
        ],
      },
    ],
  },
  privacy: {
    title: "Chính sách quyền riêng tư",
    updatedAt: "21/05/2026",
    intro: "Chính sách này mô tả dữ liệu NexCon xử lý để vận hành tài khoản, chat, thông báo, bảo mật và kiểm duyệt.",
    sections: [
      {
        title: "Dữ liệu chúng tôi xử lý",
        body: [
          "Thông tin tài khoản, hồ sơ, phiên đăng nhập, thiết bị, nội dung bạn gửi và dữ liệu cần thiết để báo cáo/kiểm duyệt.",
          "Khi có báo cáo hoặc AI phát hiện vi phạm, hệ thống có thể lưu lý do, thời điểm và ngữ cảnh kiểm duyệt.",
        ],
      },
      {
        title: "Mục đích sử dụng",
        body: [
          "Cung cấp tính năng chat, cuộc gọi, nhắc hẹn, thông báo, bảo mật phiên đăng nhập và hỗ trợ người dùng.",
          "Phát hiện hành vi gây hại, xử lý báo cáo, chống spam/lừa đảo và cải thiện an toàn cộng đồng.",
        ],
      },
      {
        title: "Quyền của bạn",
        body: [
          "Bạn có thể xem lịch sử báo cáo, lịch sử vi phạm và gửi khiếu nại khi tài khoản bị khóa.",
          "Bạn nên tránh chia sẻ thông tin nhạy cảm trong cuộc trò chuyện nếu không thật sự cần thiết.",
        ],
      },
    ],
  },
};

export default function LegalPage({ type }: LegalPageProps) {
  const content = legalContent[type];

  return (
    <main className="min-h-svh bg-background px-4 py-6 text-foreground md:px-8">
      <div className="mx-auto max-w-4xl">
        <header className="mb-5 flex items-center justify-between gap-3">
          <Button asChild variant="ghost" size="sm">
            <Link to="/signin">
              <ArrowLeft className="size-4" />
              Quay lại
            </Link>
          </Button>
          <Link to="/signin" className="text-sm font-semibold text-primary">
            NexCon
          </Link>
        </header>

        <section className="rounded-md border border-border/70 bg-card p-5 shadow-sm md:p-7">
          <div className="mb-5 flex items-start gap-3">
            <div className="flex size-10 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
              <ShieldCheck className="size-5" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Cập nhật: {content.updatedAt}</p>
              <h1 className="mt-1 text-2xl font-semibold tracking-tight md:text-3xl">{content.title}</h1>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">{content.intro}</p>
            </div>
          </div>

          <div className="grid gap-4">
            {content.sections.map((section) => (
              <section key={section.title} className="rounded-md border border-border/70 bg-background p-4">
                <h2 className="text-base font-semibold">{section.title}</h2>
                <ul className="mt-3 grid gap-2 text-sm leading-6 text-muted-foreground">
                  {section.body.map((item) => (
                    <li key={item} className="flex gap-2">
                      <span className="mt-2 size-1.5 shrink-0 rounded-full bg-primary" />
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </div>

          <footer className="mt-6 flex flex-wrap gap-3 border-t border-border/70 pt-4 text-sm">
            <Link className="text-primary hover:underline" to="/terms">Điều khoản sử dụng</Link>
            <Link className="text-primary hover:underline" to="/community-standards">Tiêu chuẩn cộng đồng</Link>
            <Link className="text-primary hover:underline" to="/privacy">Chính sách quyền riêng tư</Link>
          </footer>
        </section>
      </div>
    </main>
  );
}
