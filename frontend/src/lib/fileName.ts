const MOJIBAKE_PATTERN = /(?:[\u00C2-\u00C4][\u0080-\u00BF])|(?:\u00E1[\u00BA-\u00BF][\u0080-\u00BF])|(?:\u00C3[\u0080-\u00BF])/;
const MOJIBAKE_SCORE_PATTERN = /[\u0080-\u009F\u00C2-\u00C4]|\u00E1[\u00BA-\u00BF]/g;

const mojibakeScore = (value: string) => value.match(MOJIBAKE_SCORE_PATTERN)?.length ?? 0;

export function decodeMojibakeFileName(value?: string | null) {
  if (!value || !MOJIBAKE_PATTERN.test(value)) return value || "";

  try {
    const bytes = new Uint8Array(value.length);
    for (let index = 0; index < value.length; index += 1) {
      bytes[index] = value.charCodeAt(index) & 0xff;
    }

    const decoded = new TextDecoder("utf-8").decode(bytes);
    return mojibakeScore(decoded) < mojibakeScore(value) ? decoded : value;
  } catch {
    return value;
  }
}
