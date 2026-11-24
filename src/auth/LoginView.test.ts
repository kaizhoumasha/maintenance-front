import { flushPromises, mount } from "@vue/test-utils"
import { createPinia } from "pinia"
import { describe, expect, it, vi } from "vitest"
import { createMemoryHistory, createRouter } from "vue-router"
import { HttpError } from "@/api/client"
import LoginView from "@/auth/LoginView.vue"

const submitLogin = vi.hoisted(() => vi.fn())

vi.mock("@/auth/login", () => ({
  submitLogin,
}))

vi.mock("@/app/api", () => ({
  getApi: () => ({ request: vi.fn() }),
}))

describe("LoginView", () => {
  // Value: protects=login shows HttpError.message, shows 登录失败 for any other error, and does not navigate; fails_when=the catch block drops the message or still routes home; why_new=login.test.ts only covers submitLogin success; seam=none; no_claim=the real auth endpoint
  it("shows the HttpError message or 登录失败 and does not navigate", async () => {
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [
        { path: "/login", component: { template: "<div />" } },
        { path: "/", component: { template: "<div />" } },
      ],
    })
    await router.push("/login")
    submitLogin.mockReset()
    submitLogin.mockRejectedValueOnce(
      new HttpError(401, { trace_id: "t", code: "UNAUTHORIZED", message: "用户名或密码错误", detail: null }, null),
    )
    const wrapper = mount(LoginView, { global: { plugins: [createPinia(), router] } })
    await wrapper.get("input[name=username]").setValue("admin")
    await wrapper.get("input[name=password]").setValue("wrong")
    await wrapper.get("form").trigger("submit")
    await flushPromises()
    expect(wrapper.text()).toContain("用户名或密码错误")
    expect(router.currentRoute.value.path).toBe("/login")

    submitLogin.mockRejectedValueOnce(new Error("offline"))
    await wrapper.get("form").trigger("submit")
    await flushPromises()
    expect(wrapper.text()).toContain("登录失败")
    expect(router.currentRoute.value.path).toBe("/login")
    expect(submitLogin).toHaveBeenCalledTimes(2)
  })
})
