function decodeBase64Url(segment: string): string {
  const padded = segment.replaceAll("-", "+").replaceAll("_", "/") + "=".repeat((4 - (segment.length % 4)) % 4)
  const binary = atob(padded)
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0))
  return new TextDecoder().decode(bytes)
}

export function accessTokenSubject(token: string): string | null {
  const segment = token.split(".")[1]
  if (!segment) return null
  try {
    const parsed: unknown = JSON.parse(decodeBase64Url(segment))
    if (typeof parsed !== "object" || parsed === null || !("sub" in parsed)) return null
    const subject = parsed.sub
    return typeof subject === "string" && subject.length > 0 ? subject : null
  } catch {
    return null
  }
}

export function sameAccessTokenSubject(current: string, next: string): boolean {
  const currentSubject = accessTokenSubject(current)
  return currentSubject !== null && currentSubject === accessTokenSubject(next)
}
