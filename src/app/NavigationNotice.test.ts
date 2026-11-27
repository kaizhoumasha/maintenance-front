import { mount } from "@vue/test-utils"
import { afterEach, describe, expect, it } from "vitest"
import { HttpError } from "@/api/client"
import NavigationNotice from "@/app/NavigationNotice.vue"
import { clearNavigationNotice, navigationNotice, noteNavigationError } from "@/app/navigationNotice"

describe("NavigationNotice", () => {
  afterEach(() => {
    clearNavigationNotice()
  })

  it("shows the server message and a numeric retry delay", () => {
    navigationNotice.value = { message: "暂时不可用", retryAfter: "12" }
    const wrapper = mount(NavigationNotice)
    expect(wrapper.get("[role=alert]").text()).toBe("暂时不可用。请 12 秒后再试")
  })

  it("uses 没有权限 when a 403 has an empty message", () => {
    noteNavigationError(new HttpError(403, { trace_id: "", code: "FORBIDDEN", message: "", detail: null }, null))
    expect(navigationNotice.value).toEqual({ message: "没有权限", retryAfter: null })
  })

  it("shows only the message when there is no retry delay", () => {
    navigationNotice.value = { message: "暂时不可用", retryAfter: null }
    const wrapper = mount(NavigationNotice)
    expect(wrapper.get("[role=alert]").text()).toBe("暂时不可用")
  })

  // Value: protects=400 and 404 do not banner, while 502 and 504 do, and an empty 5xx message says 暂时不可用; fails_when=404 is noted, or the 403 fallback is used for an empty 502; why_new=notice and router tests cover 403, 429, 500, and 503 with a non-empty message; seam=none; no_claim=a live navigation failure (noteNavigationError is called directly)
  it("ignores 400 and 404 and records 502 and 504", () => {
    noteNavigationError(new HttpError(404, { trace_id: "", code: "NOT_FOUND", message: "没有这条记录", detail: null }, null))
    expect(navigationNotice.value).toBeNull()
    noteNavigationError(new HttpError(400, { trace_id: "", code: "BAD_REQUEST", message: "校验失败", detail: null }, null))
    expect(navigationNotice.value).toBeNull()

    noteNavigationError(new HttpError(502, { trace_id: "", code: "UNAVAILABLE", message: "", detail: null }, null))
    expect(navigationNotice.value).toEqual({ message: "暂时不可用", retryAfter: null })

    noteNavigationError(new HttpError(504, { trace_id: "", code: "UNAVAILABLE", message: "网关超时", detail: null }, "120"))
    expect(navigationNotice.value).toEqual({ message: "网关超时", retryAfter: "120" })
  })

  // Value: protects=a non-numeric Retry-After is shown as the message alone; fails_when=the digit check is removed and an HTTP-date is rendered as a second count; why_new=the notice test only renders retryAfter 12 and null; seam=none; no_claim=the server clock (the notice value is assigned)
  it("does not treat an HTTP-date retry delay as a number of seconds", () => {
    navigationNotice.value = { message: "请求过多", retryAfter: "Wed, 21 Oct 2015 07:28:00 GMT" }
    const wrapper = mount(NavigationNotice)
    expect(wrapper.get("[role=alert]").text()).toBe("请求过多")
  })
})
