import { ref } from "vue"
import { HttpError } from "@/api/client"

export interface NavigationNotice {
  message: string
  retryAfter: string | null
}

const unavailable = new Set([429, 502, 503, 504])

export const navigationNotice = ref<NavigationNotice | null>(null)

export function noteNavigationError(error: unknown) {
  if (!(error instanceof HttpError) || !unavailable.has(error.status)) return
  navigationNotice.value = { message: error.message, retryAfter: error.retryAfter }
}

export function clearNavigationNotice() {
  navigationNotice.value = null
}

export function navigationNoticeText(notice: NavigationNotice): string {
  if (notice.retryAfter && /^\d+$/.test(notice.retryAfter)) return `${notice.message}。请 ${notice.retryAfter} 秒后再试`
  return notice.message
}
