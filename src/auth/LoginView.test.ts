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

  // Value: protects=a second submit while login is in flight is ignored, then success opens /; fails_when=the pending guard is removed or success does not navigate home; why_new=LoginView.test only submits again after an error has settled; seam=none; no_claim=the auth endpoint (submitLogin is mocked)
  it("ignores a second submit while login is in flight, then opens home", async () => {
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [
        { path: "/login", component: { template: "<div />" } },
        { path: "/", component: { template: "<div />" } },
      ],
    })
    await router.push("/login")
    let release: () => void = () => undefined
    const pending = new Promise<void>((resolve) => {
      release = resolve
    })
    submitLogin.mockReset()
    submitLogin.mockImplementation(() => pending)
    const wrapper = mount(LoginView, { global: { plugins: [createPinia(), router] } })
    await wrapper.get("input[name=username]").setValue("admin")
    await wrapper.get("input[name=password]").setValue("secret")
    const inflight = wrapper.get("form").trigger("submit")
    await wrapper.vm.$nextTick()
    expect(submitLogin).toHaveBeenCalledTimes(1)
    expect(wrapper.get("button[type=submit]").element.hasAttribute("disabled")).toBe(true)
    await wrapper.get("form").trigger("submit")
    expect(submitLogin).toHaveBeenCalledTimes(1)
    release()
    await inflight
    await flushPromises()
    expect(router.currentRoute.value.path).toBe("/")
  })

  // Value: protects=login submits the username and password typed into the form; fails_when=onSubmit sends empty strings or swaps the two fields; why_new=LoginView tests mock submitLogin and never read its input argument; seam=none; no_claim=the auth endpoint (submitLogin is mocked)
  it("submits the username and password typed into the form", async () => {
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [
        { path: "/login", component: { template: "<div />" } },
        { path: "/", component: { template: "<div />" } },
      ],
    })
    await router.push("/login")
    submitLogin.mockReset()
    submitLogin.mockResolvedValue(undefined)
    const wrapper = mount(LoginView, { global: { plugins: [createPinia(), router] } })
    await wrapper.get("input[name=username]").setValue("admin")
    await wrapper.get("input[name=password]").setValue("secret")
    await wrapper.get("form").trigger("submit")
    await flushPromises()

    expect(submitLogin.mock.calls[0]?.[1]).toEqual({ username: "admin", password: "secret" })
  })

  // Value: protects=a login that is accepted and then sent back to /login shows a message; fails_when=push resolves after a redirect and the form stays blank; why_new=LoginView tests either stay on /login after a thrown login error or land on /; seam=none; no_claim=the menu request (submitLogin and the router are stubs)
  it("shows a message when login is accepted but navigation returns to login", async () => {
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [
        { path: "/login", name: "Login", component: { template: "<div />" } },
        { path: "/", redirect: "/login" },
      ],
    })
    await router.push("/login")
    submitLogin.mockReset()
    submitLogin.mockResolvedValue(undefined)
    const wrapper = mount(LoginView, { global: { plugins: [createPinia(), router] } })
    await wrapper.get("input[name=username]").setValue("admin")
    await wrapper.get("input[name=password]").setValue("secret")
    await wrapper.get("form").trigger("submit")
    await flushPromises()
    expect(router.currentRoute.value.path).toBe("/login")
    expect(wrapper.text()).toContain("暂时无法进入系统")
  })

  // Value: protects=a thrown navigation error stays as error.message and is not replaced by the return-to-login copy; fails_when=the path check runs after a rejected push; why_new=the return-to-login test only covers a resolved redirect; seam=none; no_claim=the menu request (the router guard is stubbed)
  it("shows the navigation error when entering the shell fails", async () => {
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [
        { path: "/login", component: { template: "<div />" } },
        {
          path: "/",
          component: { template: "<div />" },
          beforeEnter: () => {
            throw new HttpError(503, { trace_id: "t", code: "UNAVAILABLE", message: "暂时不可用", detail: null }, "12")
          },
        },
      ],
    })
    await router.push("/login")
    submitLogin.mockReset()
    submitLogin.mockResolvedValue(undefined)
    const wrapper = mount(LoginView, { global: { plugins: [createPinia(), router] } })
    await wrapper.get("form").trigger("submit")
    await flushPromises()
    expect(wrapper.text()).toContain("暂时不可用")
    expect(wrapper.text()).not.toContain("暂时无法进入系统")
  })
})
