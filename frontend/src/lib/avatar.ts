const defaultAvatarSvg = `
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
    <circle cx="256" cy="256" r="209" fill="#5594de" stroke="#6ba7e8" stroke-width="10"/>
    <circle cx="256" cy="182" r="53" fill="#3878bd" opacity=".78"/>
    <path fill="#3878bd" opacity=".78" d="M149 337c0-44 48-70 107-70s107 26 107 70v36c-16 21-55 33-107 33s-91-12-107-33Z"/>
    <circle cx="256" cy="170" r="53" fill="#fff"/>
    <path fill="#fff" d="M149 327c0-44 48-70 107-70s107 26 107 70v34c-16 21-55 33-107 33s-91-12-107-33Z"/>
  </svg>
`

export const DEFAULT_AVATAR_SRC = `data:image/svg+xml,${encodeURIComponent(defaultAvatarSvg)}`

export function getAvatarSrc(avatarUrl?: string | null) {
  const normalizedUrl = typeof avatarUrl === "string" ? avatarUrl.trim() : ""
  return normalizedUrl || DEFAULT_AVATAR_SRC
}
