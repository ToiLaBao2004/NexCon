import defaultAvatarIcon from "@/assets/avatar-default-icon.png"

export const DEFAULT_AVATAR_SRC = defaultAvatarIcon

export function getAvatarSrc(avatarUrl?: string | null) {
  const normalizedUrl = typeof avatarUrl === "string" ? avatarUrl.trim() : ""
  return normalizedUrl || DEFAULT_AVATAR_SRC
}
