from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

OUT_DIR = Path("docs/generated_report_assets")
OUT_DIR.mkdir(parents=True, exist_ok=True)
PNG_PATH = OUT_DIR / "nexcon_chuong2_system_architecture.png"
SVG_PATH = OUT_DIR / "nexcon_chuong2_system_architecture.svg"

W, H = 1900, 1080


def load_font(size, bold=False):
    candidates = []
    if bold:
        candidates.extend(
            [
                r"C:\Windows\Fonts\arialbd.ttf",
                r"C:\Windows\Fonts\segoeuib.ttf",
                r"C:\Windows\Fonts\calibrib.ttf",
            ]
        )
    candidates.extend(
        [
            r"C:\Windows\Fonts\arial.ttf",
            r"C:\Windows\Fonts\segoeui.ttf",
            r"C:\Windows\Fonts\calibri.ttf",
        ]
    )
    for path in candidates:
        try:
            return ImageFont.truetype(path, size)
        except OSError:
            pass
    return ImageFont.load_default()


img = Image.new("RGB", (W, H), "#FFFFFF")
d = ImageDraw.Draw(img)

F_TITLE = load_font(38, True)
F_SUB = load_font(18)
F_PANEL = load_font(22, True)
F_CARD = load_font(18, True)
F_BODY = load_font(14)
F_TINY = load_font(12)
F_ICON = load_font(25, True)
F_ICON_SM = load_font(20, True)

INK = "#17212F"
MUTED = "#5D6B7C"
LINE = "#536170"
GRID = "#EEF2F6"
BLUE = "#4D86C6"
CYAN = "#0EA5E9"
GREEN = "#16A34A"
PURPLE = "#7C3AED"
RED = "#DC2626"
SLATE = "#475569"
ORANGE = "#F59E0B"

PANEL_BLUE = "#EAF6FF"
PANEL_GREEN = "#ECF8F0"
PANEL_YELLOW = "#FFF7E8"
PANEL_PURPLE = "#F4F0FF"
PANEL_GRAY = "#F8FAFC"

svg = [
    f'<svg xmlns="http://www.w3.org/2000/svg" width="{W}" height="{H}" viewBox="0 0 {W} {H}">',
    "<defs>",
    '<style>text{font-family:Arial,Segoe UI,sans-serif;fill:#17212f}.title{font-size:38px;font-weight:700}.sub{font-size:18px;fill:#5d6b7c}.panel{font-size:22px;font-weight:700}.card{font-size:18px;font-weight:700}.body{font-size:14px;fill:#5d6b7c}.tiny{font-size:12px;fill:#5d6b7c}</style>',
    '<marker id="arrow" markerWidth="12" markerHeight="12" refX="10" refY="6" orient="auto" markerUnits="strokeWidth"><path d="M2,2 L10,6 L2,10 Z" fill="#536170"/></marker>',
    "</defs>",
    '<rect width="100%" height="100%" fill="#ffffff"/>',
]


def esc(text):
    return text.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")


def text_size(text, font):
    box = d.textbbox((0, 0), text, font=font)
    return box[2] - box[0], box[3] - box[1]


def wrap(text, font, max_w):
    lines = []
    for para in text.split("\n"):
        cur = ""
        for word in para.split():
            trial = word if not cur else f"{cur} {word}"
            if text_size(trial, font)[0] <= max_w:
                cur = trial
            else:
                if cur:
                    lines.append(cur)
                cur = word
        if cur:
            lines.append(cur)
    return lines or [""]


def center_text(x, y, text, font, fill=INK, max_w=None, gap=4, cls="card"):
    lines = text.split("\n") if max_w is None else wrap(text, font, max_w)
    dims = [text_size(line, font) for line in lines]
    total_h = sum(h for _, h in dims) + gap * (len(lines) - 1)
    yy = y - total_h / 2
    for line, (tw, th) in zip(lines, dims):
        d.text((x - tw / 2, yy), line, font=font, fill=fill)
        svg.append(
            f'<text x="{x}" y="{yy + th}" text-anchor="middle" class="{cls}" fill="{fill}">{esc(line)}</text>'
        )
        yy += th + gap


def left_text(x, y, text, font, fill=INK, max_w=None, gap=4, cls="body"):
    lines = text.split("\n") if max_w is None else wrap(text, font, max_w)
    yy = y
    for line in lines:
        _, th = text_size(line, font)
        d.text((x, yy), line, font=font, fill=fill)
        svg.append(f'<text x="{x}" y="{yy + th}" class="{cls}" fill="{fill}">{esc(line)}</text>')
        yy += th + gap
    return yy


def rect(x, y, w, h, fill="#FFFFFF", outline="#D7DEE8", width=2, radius=8, dash=False):
    d.rounded_rectangle([x, y, x + w, y + h], radius=radius, fill=fill, outline=outline, width=width)
    dash_attr = ' stroke-dasharray="9 7"' if dash else ""
    svg.append(
        f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="{radius}" fill="{fill}" stroke="{outline}" stroke-width="{width}"{dash_attr}/>'
    )


def panel(x, y, w, h, title, fill, outline=BLUE):
    rect(x, y, w, h, fill, outline, 3, 7, True)
    center_text(x + w / 2, y + 30, title, F_PANEL, cls="panel")


def icon_box(x, y, size, label, color):
    d.rounded_rectangle([x, y, x + size, y + size], radius=12, fill=color)
    svg.append(f'<rect x="{x}" y="{y}" width="{size}" height="{size}" rx="12" fill="{color}"/>')
    font = F_ICON_SM if len(label) >= 3 else F_ICON
    center_text(x + size / 2, y + size / 2, label, font, "#FFFFFF", cls="card")


def chip(x, y, w, h, label, color, font=F_TINY):
    d.rounded_rectangle([x, y, x + w, y + h], radius=9, fill=color)
    svg.append(f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="9" fill="{color}"/>')
    center_text(x + w / 2, y + h / 2, label, font, "#FFFFFF", max_w=w - 10, cls="tiny")


def tech_card(x, y, w, h, title, subtitle, icon, color, max_text_w=None):
    rect(x + 8, y + 9, w, h, "#DDE5EB", "#DDE5EB", 0, 5)
    rect(x, y, w, h, "#FFFFFF", "#D6DEE8", 2, 5)
    icon_box(x + 16, y + h / 2 - 25, 50, icon, color)
    tx = x + 80
    title_end = left_text(tx, y + 14, title, F_CARD, INK, max_text_w or w - 96, gap=1, cls="card")
    left_text(tx, title_end + 3, subtitle, F_BODY, MUTED, max_text_w or w - 96, gap=2, cls="body")


def mini_service(x, y, w, h, title, icon, color):
    rect(x + 7, y + 7, w, h, "#DDE5EB", "#DDE5EB", 0, 4)
    rect(x, y, w, h, "#FFFFFF", "#D6DEE8", 2, 4)
    icon_box(x + 16, y + h / 2 - 23, 46, icon, color)
    left_text(x + 74, y + h / 2 - 11, title, F_CARD, INK, max_w=w - 86, gap=1, cls="card")


def arrow(points, label=None, dashed=False, width=3):
    d.line(points, fill=LINE, width=width, joint="curve")
    import math

    x1, y1 = points[-2]
    x2, y2 = points[-1]
    ang = math.atan2(y2 - y1, x2 - x1)
    length = 15
    spread = math.pi / 7
    p1 = (x2, y2)
    p2 = (x2 - length * math.cos(ang - spread), y2 - length * math.sin(ang - spread))
    p3 = (x2 - length * math.cos(ang + spread), y2 - length * math.sin(ang + spread))
    d.polygon([p1, p2, p3], fill=LINE)
    dash_attr = ' stroke-dasharray="7 7"' if dashed else ""
    svg.append(
        f'<polyline points="{" ".join(f"{x},{y}" for x, y in points)}" fill="none" stroke="{LINE}" stroke-width="{width}" marker-end="url(#arrow)"{dash_attr}/>'
    )
    if label:
        mx = (points[0][0] + points[-1][0]) / 2
        my = (points[0][1] + points[-1][1]) / 2 - 16
        tw, th = text_size(label, F_TINY)
        d.rounded_rectangle([mx - tw / 2 - 8, my - th / 2 - 4, mx + tw / 2 + 8, my + th / 2 + 4], radius=7, fill="#FFFFFF")
        center_text(mx, my, label, F_TINY, MUTED, cls="tiny")


def user_icon(cx, cy):
    stroke = "#253142"
    d.ellipse([cx - 30, cy - 62, cx + 30, cy - 2], outline=stroke, width=4)
    d.arc([cx - 70, cy - 8, cx + 70, cy + 110], 205, 335, fill=stroke, width=4)
    d.ellipse([cx - 90, cy - 42, cx - 50, cy - 2], outline=stroke, width=3)
    d.arc([cx - 122, cy + 0, cx - 25, cy + 84], 205, 335, fill=stroke, width=3)
    d.ellipse([cx + 50, cy - 42, cx + 90, cy - 2], outline=stroke, width=3)
    d.arc([cx + 25, cy + 0, cx + 122, cy + 84], 205, 335, fill=stroke, width=3)
    center_text(cx, cy + 120, "Người dùng", F_BODY, MUTED, cls="body")


# grid
for gx in range(0, W, 24):
    d.line([(gx, 0), (gx, H)], fill=GRID, width=1)
    svg.append(f'<line x1="{gx}" y1="0" x2="{gx}" y2="{H}" stroke="{GRID}" stroke-width="1"/>')
for gy in range(0, H, 24):
    d.line([(0, gy), (W, gy)], fill=GRID, width=1)
    svg.append(f'<line x1="0" y1="{gy}" x2="{W}" y2="{gy}" stroke="{GRID}" stroke-width="1"/>')

# outer boundary
rect(45, 110, 1810, 930, "#FFFFFF", "#111827", 2, 42, False)
center_text(W / 2, 44, "Sơ đồ kiến trúc kỹ thuật hệ thống NexCon", F_TITLE, cls="title")
center_text(
    W / 2,
    82,
    "2.1. Kiến trúc hệ thống | 2.1.1. Tổng quan hệ thống | 2.1.2. Các thành phần chính",
    F_SUB,
    MUTED,
    cls="sub",
)

# users and clients
user_icon(135, 515)
chip(82, 685, 78, 28, "Web", SLATE)
chip(172, 685, 92, 28, "Android", GREEN)

panel(300, 150, 345, 765, "Client / Frontend Layer", PANEL_BLUE)
tech_card(335, 225, 275, 76, "Web/Desktop Client", "Trình duyệt trên máy tính", "WEB", SLATE)
tech_card(335, 325, 275, 76, "Android Client", "Ứng dụng đóng gói bằng Capacitor", "APP", GREEN)

rect(335, 445, 275, 195, "#FFFFFF", "#D6DEE8", 2, 6)
center_text(472, 474, "Frontend App Stack", F_CARD, cls="card")
chip(360, 510, 86, 29, "ReactJS", "#3B82F6")
chip(458, 510, 96, 29, "TypeScript", "#3178C6")
chip(360, 550, 86, 29, "Zustand", PURPLE)
chip(458, 550, 96, 29, "Tailwind", CYAN)
chip(360, 590, 86, 29, "shadcn/ui", "#0F766E")
chip(458, 590, 96, 29, "Axios", "#64748B")
chip(380, 626, 150, 29, "Socket.IO Client", CYAN)

rect(335, 690, 275, 120, "#FFFFFF", "#D6DEE8", 2, 6)
center_text(472, 720, "Mobile Runtime", F_CARD, cls="card")
chip(362, 760, 98, 30, "Capacitor", "#111827")
chip(475, 760, 60, 30, "FCM", "#EC4899")
chip(548, 760, 44, 30, "Push", GREEN)

# gateway
panel(725, 260, 300, 375, "API / Realtime Gateway", "#F8FBFF")
tech_card(760, 335, 230, 82, "HTTPS / REST", "API request, upload, auth", "API", "#2563EB", 125)
tech_card(760, 480, 230, 82, "WSS / Socket.IO", "Realtime event, room, ack", "IO", CYAN, 125)
chip(782, 590, 68, 28, "CORS", "#64748B")
chip(862, 590, 86, 28, "JWT auth", RED)

# backend container
panel(1100, 145, 450, 515, "Backend Runtime Layer", PANEL_GREEN)
chip(1145, 190, 82, 32, "Node.js", GREEN)
chip(1240, 190, 92, 32, "ExpressJS", "#222222")
chip(1346, 190, 92, 32, "Socket.IO", CYAN)
chip(1450, 190, 58, 32, "JWT", RED)
tech_card(1140, 255, 370, 78, "ExpressJS REST Server", "Middleware, controller, business logic", "EX", "#222222", 250)
tech_card(1140, 365, 370, 78, "Socket.IO Server", "Presence, typing, chat/call signaling", "IO", CYAN, 250)
tech_card(1140, 475, 370, 78, "Auth, Session & Security", "JWT, session MongoDB, role, rate limit", "SEC", RED, 250)
chip(1150, 600, 98, 30, "Mongoose", PURPLE)
chip(1260, 600, 78, 30, "Cookie", "#64748B")
chip(1350, 600, 110, 30, "Middleware", "#2563EB")

# jobs
panel(1100, 725, 450, 220, "Background Processing", "#ECF8F0", "#74B974")
left_text(
    1145,
    778,
    "- BullMQ workers cho tác vụ chạy ngầm\n- Reminder, call timeout, waiting room\n- Disappearing messages và cleanup",
    F_BODY,
    MUTED,
    max_w=355,
    gap=5,
)
chip(1150, 870, 86, 31, "BullMQ", "#EF4444")
chip(1248, 870, 78, 31, "Redis", RED)
chip(1338, 870, 86, 31, "Worker", GREEN)
chip(1436, 870, 54, 31, "TTL", SLATE)

# data/cache
panel(1610, 150, 220, 380, "Data / Cache", PANEL_YELLOW)
mini_service(1635, 230, 170, 72, "MongoDB", "MDB", "#22C55E")
left_text(1648, 310, "Users, sessions,\nconversations,\nmessages", F_TINY, MUTED, max_w=145, gap=2, cls="tiny")
mini_service(1635, 380, 170, 72, "Redis", "RD", RED)
left_text(1648, 460, "Cache, presence,\nSocket.IO Adapter,\nBullMQ queue", F_TINY, MUTED, max_w=145, gap=2, cls="tiny")

# external
panel(1610, 590, 220, 375, "External Services", PANEL_PURPLE, "#6F5BC6")
mini_service(1635, 650, 170, 56, "Cloudinary", "CL", CYAN)
mini_service(1635, 720, 170, 56, "LiveKit", "LK", "#8B5CF6")
mini_service(1635, 790, 170, 56, "Firebase Push", "FCM", "#EC4899")
mini_service(1635, 860, 170, 56, "Gemini / ASR", "AI", "#2563EB")
mini_service(1635, 930, 170, 56, "Google OAuth", "GO", "#EA4335")

# ops
panel(300, 945, 725, 75, "Deploy / CI/CD / Local Runtime", PANEL_GRAY, BLUE)
chip(335, 985, 86, 28, "Vercel", "#111827")
chip(435, 985, 92, 28, "Railway", PURPLE)
chip(540, 985, 122, 28, "GitHub Actions", "#64748B")
chip(675, 985, 58, 28, "Vite", PURPLE)
chip(746, 985, 78, 28, "Docker", "#2496ED")
chip(838, 985, 112, 28, "Compose", CYAN)

# arrows
arrow([(245, 515), (300, 515)], "tương tác")
arrow([(645, 390), (725, 374)], "REST")
arrow([(645, 680), (725, 520)], "Realtime")
arrow([(1025, 374), (1100, 295)], "request")
arrow([(1025, 520), (1100, 405)], "event")
arrow([(1550, 295), (1610, 267)], "Mongoose")
arrow([(1550, 405), (1610, 416)], "Redis Adapter")
arrow([(1325, 660), (1325, 725)], "queue job")
arrow([(1550, 835), (1610, 416)], "queue/state")
arrow([(1550, 510), (1610, 705)], "media/call/push/AI")
arrow([(1550, 835), (1610, 895)], "worker task")
arrow([(660, 945), (835, 635)], "deploy env", dashed=True, width=2)
arrow([(1025, 985), (1150, 660)], "runtime config", dashed=True, width=2)

rect(1210, 675, 260, 36, "#FFFDF3", "#D7B85B", 2, 6)
center_text(1340, 693, "Redis đồng bộ realtime giữa nhiều backend instance", F_TINY, "#7A5B11", max_w=240, cls="tiny")

svg.append("</svg>")
img.save(PNG_PATH)
SVG_PATH.write_text("\n".join(svg), encoding="utf-8")

print(PNG_PATH)
print(SVG_PATH)
