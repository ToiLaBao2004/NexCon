import { Link, useLocation, useNavigate } from "react-router";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useAuthStore } from "@/stores/useAuthStore";

type LegalPageType = "terms" | "community" | "privacy";

interface LegalPageProps {
  type: LegalPageType;
}

type LegalSection = {
  title: string;
  description?: string;
  body: string[];
};

type LegalContent = {
  title: string;
  label: string;
  updatedAt: string;
  intro: string;
  summary: string[];
  sections: LegalSection[];
};

const legalNav: Array<{ type: LegalPageType; label: string; to: string }> = [
  { type: "terms", label: "Điều khoản sử dụng", to: "/terms" },
  { type: "community", label: "Tiêu chuẩn cộng đồng", to: "/community-standards" },
  { type: "privacy", label: "Chính sách quyền riêng tư", to: "/privacy" },
];

const legalContent: Record<LegalPageType, LegalContent> = {
  terms: {
    title: "Điều khoản sử dụng NexCon",
    label: "Điều khoản",
    updatedAt: "24/05/2026",
    intro:
      "Tài liệu này mô tả cách bạn có thể sử dụng NexCon, những cam kết của chúng tôi và trách nhiệm của bạn khi tham gia nền tảng.",
    summary: [
      "Bạn chịu trách nhiệm về tài khoản, nội dung mình gửi và cách mình tương tác với người khác.",
      "NexCon có thể giới hạn nội dung hoặc tài khoản khi phát hiện hành vi gây hại, gian lận hoặc vi phạm pháp luật.",
      "Các quyết định xử lý có thể dựa trên báo cáo người dùng, hệ thống tự động và kiểm tra của quản trị viên.",
    ],
    sections: [
      {
        title: "1. Phạm vi áp dụng",
        description:
          "Điều khoản này áp dụng cho tài khoản, cuộc trò chuyện, nhóm, cuộc gọi, nhắc hẹn, thông báo và các tính năng khác do NexCon cung cấp.",
        body: [
          "Khi tạo tài khoản hoặc tiếp tục sử dụng NexCon, bạn xác nhận đã đọc, hiểu và đồng ý tuân thủ các điều khoản này.",
          "Một số tính năng có thể có quy định bổ sung. Nếu có khác biệt, quy định dành riêng cho tính năng đó sẽ được ưu tiên trong phạm vi liên quan.",
          "Chúng tôi có thể cập nhật điều khoản để phản ánh thay đổi về sản phẩm, yêu cầu an toàn hoặc quy định pháp luật. Phiên bản mới sẽ được hiển thị công khai trên NexCon.",
        ],
      },
      {
        title: "2. Tài khoản và bảo mật",
        body: [
          "Bạn cần cung cấp thông tin chính xác khi đăng ký, cập nhật hồ sơ và sử dụng tài khoản đúng với danh tính hoặc tư cách hợp pháp của mình.",
          "Bạn chịu trách nhiệm bảo vệ mật khẩu, thiết bị đăng nhập và mọi hoạt động phát sinh từ tài khoản của mình.",
          "Không được dùng tài khoản của người khác, tạo tài khoản để giả mạo, né hạn chế, quấy rối hoặc che giấu hành vi vi phạm.",
        ],
      },
      {
        title: "3. Cách sử dụng dịch vụ",
        body: [
          "Bạn có thể dùng NexCon để nhắn tin, gọi, tạo nhóm, nhắc hẹn và trao đổi thông tin một cách hợp pháp, tôn trọng và an toàn.",
          "Bạn không được can thiệp vào hệ thống, phát tán mã độc, khai thác lỗi, thu thập dữ liệu trái phép hoặc làm gián đoạn trải nghiệm của người khác.",
          "Bạn giữ quyền đối với nội dung mình tạo, nhưng cho phép NexCon xử lý nội dung đó trong phạm vi cần thiết để truyền tải, lưu trữ, đồng bộ, bảo mật và vận hành dịch vụ.",
        ],
      },
      {
        title: "4. Nội dung và hành vi không được chấp nhận",
        body: [
          "Không đăng, gửi hoặc chia sẻ nội dung lừa đảo, spam, mạo danh, xâm phạm quyền riêng tư, vi phạm sở hữu trí tuệ hoặc vi phạm pháp luật.",
          "Không quấy rối, đe dọa, hạ nhục, kích động thù ghét, cổ vũ bạo lực, bóc lột trẻ em, gợi dục trái phép hoặc hướng dẫn tự hại.",
          "Không lợi dụng tính năng báo cáo, khiếu nại hoặc nhóm trò chuyện để gây áp lực, trả đũa hoặc làm phiền người khác.",
        ],
      },
      {
        title: "5. Xử lý vi phạm",
        body: [
          "Tùy mức độ, NexCon có thể cảnh báo, ẩn hoặc chặn nội dung, hạn chế tính năng, tạm khóa hoặc chấm dứt tài khoản.",
          "Khi có thể, chúng tôi sẽ hiển thị lý do xử lý và hướng dẫn bạn xem trạng thái, lịch sử vi phạm hoặc gửi khiếu nại.",
          "Trong trường hợp có rủi ro pháp lý, an toàn hệ thống hoặc nguy cơ gây hại nghiêm trọng, NexCon có thể xử lý ngay mà không cần thông báo trước.",
        ],
      },
      {
        title: "6. Khiếu nại và hỗ trợ",
        body: [
          "Nếu bạn cho rằng quyết định xử lý là nhầm lẫn, bạn có thể gửi khiếu nại kèm thông tin giải thích rõ ràng.",
          "NexCon sẽ xem xét dựa trên dữ liệu hiện có, ngữ cảnh báo cáo và mức độ ảnh hưởng đến cộng đồng.",
          "Việc gửi khiếu nại không đảm bảo quyết định sẽ được thay đổi, nhưng giúp chúng tôi rà soát và cải thiện cách thực thi chính sách.",
        ],
      },
    ],
  },
  community: {
    title: "Tiêu chuẩn cộng đồng NexCon",
    label: "Cộng đồng",
    updatedAt: "24/05/2026",
    intro:
      "Tiêu chuẩn cộng đồng giúp NexCon duy trì không gian trò chuyện an toàn, văn minh và đáng tin cậy cho mọi thành viên.",
    summary: [
      "Nói chuyện thẳng thắn nhưng không công kích, đe dọa hoặc làm tổn hại người khác.",
      "Không chia sẻ nội dung nguy hiểm, lừa đảo, xâm phạm riêng tư hoặc gây hại ngoài đời thực.",
      "Báo cáo vi phạm cần trung thực, có ngữ cảnh và không dùng như công cụ quấy rối.",
    ],
    sections: [
      {
        title: "1. Nguyên tắc chung",
        description:
          "NexCon khuyến khích trao đổi tự nhiên, nhưng quyền thể hiện ý kiến luôn đi cùng trách nhiệm bảo vệ sự an toàn của cộng đồng.",
        body: [
          "Hãy tôn trọng người đang trò chuyện với bạn, kể cả khi hai bên không đồng ý quan điểm.",
          "Đặt ngữ cảnh rõ ràng khi thảo luận về chủ đề nhạy cảm, tin tức, cảnh báo rủi ro hoặc nội dung có thể gây hiểu nhầm.",
          "Không dùng nhóm, tin nhắn riêng hoặc cuộc gọi để ép buộc, đe dọa, bêu xấu hoặc cô lập người khác.",
        ],
      },
      {
        title: "2. An toàn cá nhân",
        body: [
          "Không đe dọa bạo lực, cổ vũ hành vi gây hại, hướng dẫn tự hại hoặc khuyến khích người khác tự làm tổn thương.",
          "Không chia sẻ nội dung bóc lột, gợi dục hoặc gây nguy hiểm cho trẻ vị thành niên dưới bất kỳ hình thức nào.",
          "Không phát tán thông tin cá nhân của người khác như số điện thoại, địa chỉ, giấy tờ, tài khoản riêng tư hoặc hình ảnh nhạy cảm khi chưa được đồng ý.",
        ],
      },
      {
        title: "3. Tôn trọng và chống quấy rối",
        body: [
          "Không lăng mạ, hạ nhục, miệt thị ngoại hình, giới tính, nguồn gốc, tôn giáo, tình trạng sức khỏe hoặc đặc điểm cá nhân của người khác.",
          "Không kích động thù ghét, kêu gọi loại trừ, đe dọa hoặc tấn công một cá nhân hay nhóm người được bảo vệ.",
          "Không gửi tin nhắn lặp lại, spam, gạ gẫm hoặc tiếp tục liên hệ khi người khác đã thể hiện rõ rằng họ không muốn.",
        ],
      },
      {
        title: "4. Gian lận, mạo danh và an ninh",
        body: [
          "Không mạo danh cá nhân, tổ chức, quản trị viên hoặc thương hiệu để lừa người khác tin vào thông tin sai lệch.",
          "Không gửi liên kết phishing, mã độc, tệp nguy hiểm, hướng dẫn chiếm đoạt tài khoản hoặc nội dung nhằm né hệ thống bảo mật.",
          "Không dùng NexCon để bán hàng cấm, kêu gọi đầu tư gian dối, lừa chuyển tiền hoặc dụ người khác cung cấp thông tin nhạy cảm.",
        ],
      },
      {
        title: "5. Nội dung được phép khi có ngữ cảnh",
        body: [
          "Bạn có thể thảo luận tin tức, giáo dục, cảnh báo lừa đảo, trải nghiệm cá nhân hoặc nội dung nhạy cảm nếu mục đích là cung cấp thông tin và không cổ vũ hành vi gây hại.",
          "Trích dẫn nội dung vi phạm để báo cáo, phản biện hoặc cảnh báo cần đủ ngữ cảnh, không lan truyền thêm hình ảnh hoặc chi tiết không cần thiết.",
          "Những câu đùa giữa bạn bè vẫn có thể bị xử lý nếu chúng đe dọa, làm nhục hoặc gây rủi ro rõ ràng cho người khác.",
        ],
      },
      {
        title: "6. Cách NexCon thực thi tiêu chuẩn",
        body: [
          "Hệ thống có thể dùng tín hiệu tự động, báo cáo từ người dùng và kiểm tra của quản trị viên để phát hiện nội dung vi phạm.",
          "Một nội dung không tự động bị xử lý chỉ vì có nhiều báo cáo; quyết định sẽ dựa trên chính sách, bằng chứng và ngữ cảnh.",
          "Nếu quyết định bị sai, bạn có thể khiếu nại. Việc khiếu nại rõ ràng, lịch sự và có thông tin cụ thể sẽ giúp quá trình xem xét chính xác hơn.",
        ],
      },
    ],
  },
  privacy: {
    title: "Chính sách quyền riêng tư NexCon",
    label: "Quyền riêng tư",
    updatedAt: "24/05/2026",
    intro:
      "Chính sách này giải thích những dữ liệu NexCon xử lý, lý do xử lý và các lựa chọn giúp bạn kiểm soát trải nghiệm của mình.",
    summary: [
      "NexCon chỉ xử lý dữ liệu cần thiết để cung cấp dịch vụ, bảo mật tài khoản, đồng bộ nội dung và hỗ trợ người dùng.",
      "Dữ liệu báo cáo và kiểm duyệt được dùng để đánh giá vi phạm, bảo vệ cộng đồng và xử lý khiếu nại.",
      "Bạn có thể quản lý thông tin tài khoản, quyền riêng tư trong cuộc trò chuyện và yêu cầu hỗ trợ khi cần.",
    ],
    sections: [
      {
        title: "1. Dữ liệu bạn cung cấp",
        body: [
          "Thông tin đăng ký và hồ sơ như tên hiển thị, ảnh đại diện, email hoặc thông tin cần thiết để xác thực tài khoản.",
          "Nội dung bạn chủ động tạo hoặc gửi, bao gồm tin nhắn, tệp, hình ảnh, thông tin nhóm, nhắc hẹn, phản hồi và nội dung báo cáo.",
          "Thông tin bạn gửi cho đội ngũ hỗ trợ, chẳng hạn mô tả sự cố, khiếu nại, bằng chứng hoặc yêu cầu liên quan đến tài khoản.",
        ],
      },
      {
        title: "2. Dữ liệu được tạo khi sử dụng NexCon",
        body: [
          "Dữ liệu kỹ thuật như phiên đăng nhập, thiết bị, địa chỉ mạng, thời điểm hoạt động, trạng thái kết nối và lỗi hệ thống.",
          "Dữ liệu tương tác như cuộc trò chuyện đã tham gia, thông báo, lượt đọc, thao tác với nhóm và các tùy chọn bạn thiết lập.",
          "Dữ liệu an toàn như lý do báo cáo, trạng thái xử lý, lịch sử vi phạm, quyết định khiếu nại và ngữ cảnh cần thiết để kiểm duyệt.",
        ],
      },
      {
        title: "3. Mục đích sử dụng dữ liệu",
        body: [
          "Vận hành các tính năng chính: nhắn tin, gọi, nhóm, nhắc hẹn, thông báo, tìm kiếm, đồng bộ thiết bị và quản lý tài khoản.",
          "Bảo vệ người dùng khỏi spam, lừa đảo, truy cập trái phép, mạo danh, nội dung gây hại và hành vi phá hoại hệ thống.",
          "Cải thiện chất lượng dịch vụ, sửa lỗi, đo độ ổn định, hỗ trợ người dùng và phát triển tính năng phù hợp hơn.",
        ],
      },
      {
        title: "4. Chia sẻ và truy cập dữ liệu",
        body: [
          "NexCon không bán thông tin cá nhân của bạn.",
          "Dữ liệu chỉ được truy cập bởi hệ thống hoặc nhân sự có trách nhiệm khi cần vận hành dịch vụ, xử lý báo cáo, hỗ trợ kỹ thuật hoặc đáp ứng yêu cầu hợp lệ từ cơ quan có thẩm quyền.",
          "Khi dùng dịch vụ bên thứ ba tích hợp với NexCon, dữ liệu bạn chia sẻ với bên đó sẽ chịu chính sách riêng của họ.",
        ],
      },
      {
        title: "5. Lưu trữ và bảo vệ",
        body: [
          "Dữ liệu được lưu trong thời gian cần thiết để cung cấp dịch vụ, bảo vệ an toàn, tuân thủ nghĩa vụ pháp lý hoặc giải quyết tranh chấp.",
          "Chúng tôi áp dụng biện pháp kỹ thuật và quy trình nội bộ để giảm rủi ro truy cập trái phép, mất mát hoặc sử dụng sai mục đích.",
          "Không có hệ thống nào an toàn tuyệt đối, vì vậy bạn nên bảo vệ mật khẩu, kiểm tra thiết bị đăng nhập và cẩn trọng khi chia sẻ thông tin nhạy cảm.",
        ],
      },
      {
        title: "6. Quyền và lựa chọn của bạn",
        body: [
          "Bạn có thể cập nhật hồ sơ, điều chỉnh cài đặt riêng tư, rời nhóm, tắt thông báo hoặc quản lý cách người khác tương tác với mình trong phạm vi tính năng hiện có.",
          "Bạn có thể xem trạng thái báo cáo, lịch sử vi phạm và gửi khiếu nại nếu cho rằng quyết định xử lý chưa chính xác.",
          "Khi cần hỗ trợ về dữ liệu cá nhân hoặc tài khoản, hãy gửi yêu cầu với thông tin đủ rõ để chúng tôi xác minh và phản hồi phù hợp.",
        ],
      },
    ],
  },
};

export default function LegalPage({ type }: LegalPageProps) {
  const content = legalContent[type];
  const navigate = useNavigate();
  const location = useLocation();
  const { accessToken, user } = useAuthStore();
  const fromPath =
    typeof (location.state as { from?: unknown } | null)?.from === "string"
      ? (location.state as { from: string }).from
      : null;
  const isSignedIn = Boolean(accessToken);
  const fallbackPath = isSignedIn ? (user?.role === "admin" ? "/admin/overview" : "/chat") : "/signin";
  const returnPath = fromPath || fallbackPath;
  const linkState = fromPath ? { from: fromPath } : undefined;

  const handleBack = () => {
    navigate(returnPath);
  };

  return (
    <main className="flex h-svh min-h-0 bg-slate-100 px-3 py-5 text-slate-950 dark:bg-background dark:text-foreground sm:px-4 md:px-8 md:py-8">
      <div className="mx-auto flex h-full min-h-0 w-full max-w-[430px] flex-col md:max-w-5xl">
        <header className="mb-3 flex shrink-0 items-center justify-between gap-3 md:mb-5">
          <Button
            type="button"
            size="sm"
            className="h-9 rounded-lg bg-primary px-3 text-xs font-semibold text-primary-foreground shadow-none hover:bg-primary/90 md:text-sm"
            onClick={handleBack}
          >
            <ArrowLeft className="size-4" />
            Quay lại
          </Button>
          <Link to={fallbackPath} className="shrink-0 text-xs font-semibold text-primary md:text-sm">
            NexCon
          </Link>
        </header>

        <section className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm dark:border-border/70 dark:bg-card">
          <div className="shrink-0 border-b border-slate-200 px-3 py-5 dark:border-border/70 sm:px-4 md:px-8 md:py-7">
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-full border border-slate-200 bg-white px-3 py-1 text-[11px] font-semibold text-slate-700 dark:border-border/70 dark:bg-background dark:text-foreground md:text-xs">
                Cập nhật {content.updatedAt}
              </span>
            </div>

            <h1 className="mt-4 max-w-3xl text-[24px] font-bold leading-[1.12] text-slate-950 dark:text-foreground md:text-[40px]">
              {content.title}
            </h1>
          </div>

          <nav className="flex shrink-0 flex-wrap gap-x-4 gap-y-0 border-b border-slate-200 px-3 dark:border-border/70 sm:px-4 md:px-8">
            {legalNav.map((item) => (
              <Link
                key={item.type}
                to={item.to}
                state={linkState}
                className={cn(
                  "relative h-11 px-0 text-[11px] text-slate-950 transition-colors after:absolute after:inset-x-0 after:bottom-0 after:h-0.5 after:rounded-full after:bg-primary after:transition-opacity dark:text-foreground md:h-12 md:text-sm",
                  item.type === type
                    ? "font-semibold after:opacity-100"
                    : "font-normal after:opacity-0 hover:text-slate-700 dark:hover:text-foreground/80"
                )}
              >
                <span className="flex h-full items-center whitespace-nowrap">{item.label}</span>
              </Link>
            ))}
          </nav>

          <div className="beautiful-scrollbar min-h-0 flex-1 overflow-y-auto px-3 py-3 sm:px-4 md:px-8 md:py-6">
            <div className="grid gap-3 lg:grid-cols-[280px_minmax(0,1fr)] lg:gap-6">
              <aside className="min-h-0 self-start lg:sticky lg:top-0">
                <div className="rounded-lg border border-slate-200 bg-white p-4 dark:border-border/70 dark:bg-background">
                  <p className="text-[11px] font-semibold uppercase text-slate-950 dark:text-foreground">
                    Tóm tắt chính
                  </p>
                  <div className="mt-4 grid gap-3">
                    {content.summary.map((item, index) => (
                      <div key={item} className="flex gap-2.5">
                        <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-primary text-[11px] font-semibold text-primary-foreground md:size-6 md:text-xs">
                          {index + 1}
                        </span>
                        <p className="text-xs leading-5 text-slate-950 dark:text-foreground md:text-sm md:leading-6">
                          {item}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              </aside>

              <div className="grid min-w-0 gap-3 md:gap-4">
                {content.sections.map((section) => (
                  <section
                    key={section.title}
                    className="rounded-lg border border-slate-200 bg-white p-4 dark:border-border/70 dark:bg-background md:p-5"
                  >
                    <h2 className="text-base font-semibold leading-6 text-slate-950 dark:text-foreground md:text-lg md:leading-7">
                      {section.title}
                    </h2>
                    {section.description && (
                      <p className="mt-2 text-xs leading-5 text-slate-950 dark:text-foreground md:text-sm md:leading-6">
                        {section.description}
                      </p>
                    )}
                    <div className="mt-4 grid gap-3">
                      {section.body.map((item) => (
                        <p
                          key={item}
                          className="border-l-2 border-primary/70 pl-3 text-xs leading-5 text-slate-950 dark:text-foreground md:text-sm md:leading-6"
                        >
                          {item}
                        </p>
                      ))}
                    </div>
                  </section>
                ))}
              </div>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
