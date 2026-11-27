import { ref } from "vue"
import { HttpError } from "@/api/client"

export interface NavigationNotice {
  message: string
  retryAfter: string | null
}

const noted = new Set([403, 429, 500, 502, 503, 504])

export const navigationNotice = ref<NavigationNotice | null>(null)

function noticeMessage(error: HttpError): string {
  if (error.message) return error.message
  if (error.status === 403) return "没有权限"
  return "暂时不可用"
}

export function noteNavigationError(error: unknown) {
  if (error instanceof HttpError) {
    if (!noted.has(error.status)) return
    navigationNotice.value = { message: noticeMessage(error), retryAfter: error.retryAfter }
    return
  }
  navigationNotice.value = { message: "暂时不可用", retryAfter: null }
}

export function clearNavigationNotice() {
  navigationNotice.value = null
}

export function navigationNoticeText(notice: NavigationNotice): string {
  if (notice.retryAfter && /^\d+$/.test(notice.retryAfter)) return `${notice.message}。请 ${notice.retryAfter} 秒后再试`
  return notice.message
}
