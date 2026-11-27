import { mount } from "@vue/test-utils"
import { afterEach, describe, expect, it } from "vitest"
import NavigationNotice from "@/app/NavigationNotice.vue"
import { clearNavigationNotice, navigationNotice } from "@/app/navigationNotice"

describe("NavigationNotice", () => {
  afterEach(() => {
    clearNavigationNotice()
  })

  it("shows the server message and a numeric retry delay", () => {
    navigationNotice.value = { message: "暂时不可用", retryAfter: "12" }
    const wrapper = mount(NavigationNotice)
    expect(wrapper.get("[role=alert]").text()).toBe("暂时不可用。请 12 秒后再试")
  })

  it("shows only the message when there is no retry delay", () => {
    navigationNotice.value = { message: "暂时不可用", retryAfter: null }
    const wrapper = mount(NavigationNotice)
    expect(wrapper.get("[role=alert]").text()).toBe("暂时不可用")
  })
})
