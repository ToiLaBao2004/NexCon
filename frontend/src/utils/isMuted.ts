type MuteType = "messages" | "meetings";

type MuteObject = {
  messages?: string | Date | null;
  meetings?: string | Date | null;
} | null | undefined;

export function isMuted(muteObj: MuteObject, type: MuteType): boolean {
  const until = muteObj?.[type];
  if (!until) return false;
  return new Date(until) > new Date();
}
