interface FileTypeIconProps {
  fileName?: string | null;
  mimeType?: string | null;
  className?: string;
}

type FileIconKind =
  | "word"
  | "excel"
  | "powerpoint"
  | "pdf"
  | "archive"
  | "image"
  | "video"
  | "audio"
  | "text"
  | "code"
  | "file";

const getExtension = (fileName?: string | null) => {
  const name = (fileName || "").trim();
  const dotIndex = name.lastIndexOf(".");
  return dotIndex >= 0 ? name.slice(dotIndex + 1).toLowerCase() : "";
};

const getFileIconKind = (fileName?: string | null, mimeType?: string | null): FileIconKind => {
  const ext = getExtension(fileName);
  const mime = (mimeType || "").toLowerCase();

  if (/^(doc|docx|docm|dot|dotx|rtf)$/.test(ext) || mime.includes("wordprocessingml") || mime.includes("msword")) {
    return "word";
  }
  if (/^(xls|xlsx|xlsm|xlsb|csv)$/.test(ext) || mime.includes("spreadsheetml") || mime.includes("ms-excel")) {
    return "excel";
  }
  if (/^(ppt|pptx|pptm|pps|ppsx)$/.test(ext) || mime.includes("presentationml") || mime.includes("ms-powerpoint")) {
    return "powerpoint";
  }
  if (ext === "pdf" || mime === "application/pdf") return "pdf";
  if (/^(zip|rar|7z|tar|gz|bz2)$/.test(ext) || mime.includes("zip") || mime.includes("compressed")) return "archive";
  if (/^(png|jpe?g|gif|webp|bmp|svg|heic)$/.test(ext) || mime.startsWith("image/")) return "image";
  if (/^(mp4|webm|ogg|mov|mkv|avi)$/.test(ext) || mime.startsWith("video/")) return "video";
  if (/^(mp3|wav|m4a|aac|flac|opus)$/.test(ext) || mime.startsWith("audio/")) return "audio";
  if (/^(txt|md|log)$/.test(ext) || mime.startsWith("text/")) return "text";
  if (/^(js|jsx|ts|tsx|json|html|css|scss|xml|py|java|c|cpp|cs|go|php|rb|rs|sql)$/.test(ext)) return "code";

  return "file";
};

const iconMeta: Record<FileIconKind, { label: string; color: string; page: string; line: string }> = {
  word: { label: "W", color: "#185ABD", page: "#EFF6FF", line: "#6EA8FF" },
  excel: { label: "X", color: "#107C41", page: "#ECFDF3", line: "#65C18C" },
  powerpoint: { label: "P", color: "#C43E1C", page: "#FFF4ED", line: "#F29A7A" },
  pdf: { label: "PDF", color: "#D93025", page: "#FFF1F1", line: "#F28B82" },
  archive: { label: "ZIP", color: "#8A5A16", page: "#FFF7E6", line: "#D6A84F" },
  image: { label: "IMG", color: "#0E7490", page: "#ECFEFF", line: "#67E8F9" },
  video: { label: "VID", color: "#7C3AED", page: "#F5F3FF", line: "#C4B5FD" },
  audio: { label: "AUD", color: "#DB2777", page: "#FDF2F8", line: "#F9A8D4" },
  text: { label: "TXT", color: "#475569", page: "#F8FAFC", line: "#CBD5E1" },
  code: { label: "</>", color: "#334155", page: "#F8FAFC", line: "#94A3B8" },
  file: { label: "FILE", color: "#475569", page: "#F8FAFC", line: "#CBD5E1" },
};

const labelFontSize = (label: string) => {
  if (label.length <= 1) return 9.2;
  if (label.length === 3) return 5.2;
  return 4.3;
};

export default function FileTypeIcon({ fileName, mimeType, className = "h-6 w-6" }: FileTypeIconProps) {
  const kind = getFileIconKind(fileName, mimeType);
  const meta = iconMeta[kind];

  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden="true" xmlns="http://www.w3.org/2000/svg">
      <path d="M7 2.5h7.2L19 7.3v13.2a1.5 1.5 0 0 1-1.5 1.5h-10A1.5 1.5 0 0 1 6 20.5v-16A1.5 1.5 0 0 1 7.5 3Z" fill={meta.page} />
      <path d="M14 2.7v4.2c0 .45.36.81.81.81h4.03" fill="#DBEAFE" />
      <path d="M14 2.7v4.2c0 .45.36.81.81.81h4.03" stroke="#CBD5E1" strokeWidth="0.8" strokeLinejoin="round" />
      <path d="M12.8 11h3.6M12.8 14h3.6M12.8 17h2.9" stroke={meta.line} strokeWidth="1.25" strokeLinecap="round" />
      <rect x="1.6" y="7.1" width="12.2" height="12.2" rx="2.4" fill={meta.color} />
      <text
        x="7.7"
        y="13.45"
        fill="white"
        fontSize={labelFontSize(meta.label)}
        fontWeight="700"
        fontFamily="Arial, Helvetica, sans-serif"
        textAnchor="middle"
        dominantBaseline="middle"
      >
        {meta.label}
      </text>
    </svg>
  );
}
