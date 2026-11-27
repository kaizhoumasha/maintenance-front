import { flushPromises, mount } from "@vue/test-utils"
import { createPinia, setActivePinia } from "pinia"
import { describe, expect, it, vi } from "vitest"
import { createMemoryHistory, createRouter } from "vue-router"
import { HttpError } from "@/api/client"
import Shell from "@/app/Shell.vue"
import { useSessionStore } from "@/auth/session"

const handleUnauthorized = vi.hoisted(() => vi.fn())
const request = vi.hoisted(() => vi.fn(async () => undefined))
const refresh = vi.hoisted(() => vi.fn(async () => undefined))
const whenSettled = vi.hoisted(() => vi.fn(async () => undefined))

vi.mock("@/app/unauthorized", () => ({
  handleUnauthorized,
}))

vi.mock("@/app/api", () => ({
  getApi: () => ({ request, refresh, whenSettled }),
}))

function unsignedAccessToken(payload: object): string {
  const encode = (value: object) =>
    btoa(JSON.stringify(value)).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "")
  return `${encode({ alg: "none", typ: "JWT" })}.${encode(payload)}.signature`
}

describe("Shell", () => {
  it("shows visible menu items, the parent in the top bar, and leaves through the session", async () => {
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [
        {
          path: "/",
          name: "Root",
          component: { template: "<router-view />" },
          children: [
            {
              path: "/asset",
              component: { template: "<router-view />" },
              meta: { title: "设备资源" },
              children: [
                { path: "device", component: { template: "<h1>设备管理</h1>" }, meta: { title: "设备管理" } },
                { path: "missing", component: { template: "<p>缺失</p>" }, meta: { title: "缺失", hidden: true } },
              ],
            },
          ],
        },
      ],
    })
    await router.push("/asset/device")
    await router.isReady()
    window.matchMedia = (query: string) =>
      ({
        matches: false,
        media: query,
        addEventListener: () => undefined,
        removeEventListener: () => undefined,
      }) as unknown as MediaQueryList
    const pinia = createPinia()
    setActivePinia(pinia)
    useSessionStore().setAccessToken("token")
    const wrapper = mount(Shell, { global: { plugins: [pinia, router] } })

    expect(wrapper.get("a").attributes("href")).toBe("/asset/device")
    expect(wrapper.get("a").attributes("aria-current")).toBe("page")
    expect(wrapper.text()).toContain("设备资源")
    expect(wrapper.text()).not.toContain("缺失")
    // Value: protects=the top bar shows parent titles and omits the current page title; fails_when=the ancestor list keeps the leaf or drops the parent; why_new=the shell test only checks that the parent string appears somewhere on the page; seam=none; no_claim=browser layout of the header (the router is in-memory)
    expect(wrapper.get("header p").text()).toBe("设备资源")

    const collapse = wrapper.findAll("button").find((button) => button.text() === "收起菜单")
    expect(collapse).toBeTruthy()
    await collapse?.trigger("click")
    expect(wrapper.get("aside").classes()).toContain("hidden")

    request.mockClear()
    handleUnauthorized.mockClear()
    const leave = wrapper.findAll("button").find((button) => button.text() === "退出")
    await leave?.trigger("click")
    expect(request).toHaveBeenCalledWith("/api/v1/auth/logout", { method: "POST", skipRefresh: true })
    expect(handleUnauthorized).toHaveBeenCalledOnce()
    expect(request.mock.invocationCallOrder[0]).toBeLessThan(handleUnauthorized.mock.invocationCallOrder[0] ?? 0)
  })

  // Value: protects=a 401 logout refreshes, retries logout, and still clears the session when the retry is also 401; fails_when=the 401 branch is removed or a second 401 skips handleUnauthorized; why_new=Shell.test only covers a logout POST that resolves; seam=none; no_claim=the logout and refresh endpoints (getApi is mocked)
  it("refreshes and retries a 401 logout, then still clears the session", async () => {
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [{ path: "/", name: "Root", component: { template: "<div />" } }],
    })
    await router.push("/")
    await router.isReady()
    window.matchMedia = (query: string) =>
      ({
        matches: false,
        media: query,
        addEventListener: () => undefined,
        removeEventListener: () => undefined,
      }) as unknown as MediaQueryList
    const pinia = createPinia()
    setActivePinia(pinia)
    useSessionStore().setAccessToken("token")
    const wrapper = mount(Shell, { global: { plugins: [pinia, router] } })
    const denied = new HttpError(401, { trace_id: "t", code: "UNAUTHORIZED", message: "未登录", detail: null }, null)
    request.mockClear()
    refresh.mockClear()
    handleUnauthorized.mockClear()
    request
      .mockRejectedValueOnce(denied)
      .mockRejectedValueOnce(denied)
    refresh.mockResolvedValueOnce(undefined)

    const leave = wrapper.findAll("button").find((button) => button.text() === "退出")
    await leave?.trigger("click")
    await flushPromises()

    expect(refresh).toHaveBeenCalledOnce()
    expect(request).toHaveBeenNthCalledWith(1, "/api/v1/auth/logout", { method: "POST", skipRefresh: true })
    expect(request).toHaveBeenNthCalledWith(2, "/api/v1/auth/logout", { method: "POST", skipRefresh: true })
    expect(handleUnauthorized).toHaveBeenCalledOnce()
    expect(request.mock.invocationCallOrder[0]).toBeLessThan(refresh.mock.invocationCallOrder[0] ?? 0)
    expect(refresh.mock.invocationCallOrder[0]).toBeLessThan(request.mock.invocationCallOrder[1] ?? 0)
    expect(request.mock.invocationCallOrder[1]).toBeLessThan(handleUnauthorized.mock.invocationCallOrder[0] ?? 0)
  })

  // Value: protects=a logout failure other than 401 stays on the page and shows the server message; fails_when=a 500 still calls handleUnauthorized or the message is dropped; why_new=the previous assertion treated every logout error as a local sign-out; seam=none; no_claim=the logout endpoint (getApi is mocked)
  it("stays on the page and shows the message when logout fails for a reason other than 401", async () => {
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [{ path: "/", name: "Root", component: { template: "<div />" } }],
    })
    await router.push("/")
    await router.isReady()
    window.matchMedia = (query: string) =>
      ({
        matches: false,
        media: query,
        addEventListener: () => undefined,
        removeEventListener: () => undefined,
      }) as unknown as MediaQueryList
    const pinia = createPinia()
    setActivePinia(pinia)
    const session = useSessionStore()
    session.setAccessToken("token")
    const wrapper = mount(Shell, { global: { plugins: [pinia, router] } })
    request.mockReset()
    refresh.mockReset()
    handleUnauthorized.mockReset()
    request.mockRejectedValueOnce(
      new HttpError(500, { trace_id: "t", code: "UNAVAILABLE", message: "暂时不可用", detail: null }, null),
    )

    const leave = wrapper.findAll("button").find((button) => button.text() === "退出")
    await leave?.trigger("click")

    expect(refresh).not.toHaveBeenCalled()
    expect(request).toHaveBeenCalledTimes(1)
    expect(handleUnauthorized).not.toHaveBeenCalled()
    expect(session.getAccessToken()).toBe("token")
    expect(router.currentRoute.value.path).toBe("/")
    expect(wrapper.get("[role=alert]").text()).toBe("暂时不可用")
    request.mockReset()
    request.mockImplementation(async () => undefined)
  })

  it("stays on the page when a refreshed logout retry is temporarily unavailable", async () => {
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [{ path: "/", name: "Root", component: { template: "<div />" } }],
    })
    await router.push("/")
    await router.isReady()
    window.matchMedia = (query: string) =>
      ({
        matches: false,
        media: query,
        addEventListener: () => undefined,
        removeEventListener: () => undefined,
      }) as unknown as MediaQueryList
    const pinia = createPinia()
    setActivePinia(pinia)
    const session = useSessionStore()
    session.setAccessToken("token")
    const wrapper = mount(Shell, { global: { plugins: [pinia, router] } })
    const denied = new HttpError(401, { trace_id: "t", code: "UNAUTHORIZED", message: "未登录", detail: null }, null)
    request.mockReset()
    refresh.mockReset()
    handleUnauthorized.mockReset()
    request
      .mockRejectedValueOnce(denied)
      .mockRejectedValueOnce(new HttpError(503, { trace_id: "t", code: "UNAVAILABLE", message: "暂时不可用", detail: null }, null))
    refresh.mockResolvedValueOnce(undefined)

    const leave = wrapper.findAll("button").find((button) => button.text() === "退出")
    await leave?.trigger("click")
    await flushPromises()

    expect(refresh).toHaveBeenCalledOnce()
    expect(request).toHaveBeenCalledTimes(2)
    expect(handleUnauthorized).not.toHaveBeenCalled()
    expect(session.getAccessToken()).toBe("token")
    expect(wrapper.get("[role=alert]").text()).toBe("暂时不可用")
    request.mockReset()
    request.mockImplementation(async () => undefined)
  })

  // Value: protects=a narrow viewport collapses the sidebar on mount and after navigation, and the scrim closes it; fails_when=matchMedia is ignored, the route watch is removed, or the scrim click does nothing; why_new=Shell tests stub matchMedia matches false and never change route; seam=none; no_claim=a real phone viewport (matchMedia is stubbed)
  it("collapses a narrow sidebar on mount, from the scrim, and after navigation", async () => {
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [
        {
          path: "/",
          name: "Root",
          component: { template: "<router-view />" },
          children: [
            { path: "/asset/device", component: { template: "<h1>设备</h1>" }, meta: { title: "设备管理" } },
            { path: "/audit", component: { template: "<h1>审计</h1>" }, meta: { title: "审计日志" } },
          ],
        },
      ],
    })
    await router.push("/asset/device")
    await router.isReady()
    window.matchMedia = (query: string) =>
      ({
        matches: query === "(max-width: 767px)",
        media: query,
        addEventListener: () => undefined,
        removeEventListener: () => undefined,
      }) as unknown as MediaQueryList
    const pinia = createPinia()
    setActivePinia(pinia)
    useSessionStore().setAccessToken("token")
    const wrapper = mount(Shell, { global: { plugins: [pinia, router] } })
    await flushPromises()

    expect(wrapper.get("aside").classes()).toContain("hidden")
    const open = wrapper.findAll("button").find((button) => button.text() === "展开菜单")
    expect(open).toBeTruthy()
    await open?.trigger("click")
    expect(wrapper.get("aside").classes()).not.toContain("hidden")

    await wrapper.get('button[aria-label="收起菜单"]').trigger("click")
    expect(wrapper.get("aside").classes()).toContain("hidden")

    const reopen = wrapper.findAll("button").find((button) => button.text() === "展开菜单")
    expect(reopen).toBeTruthy()
    await reopen?.trigger("click")
    expect(wrapper.get("aside").classes()).not.toContain("hidden")

    await router.push("/audit")
    await flushPromises()
    expect(wrapper.get("aside").classes()).toContain("hidden")
  })

  // Value: protects=a logout or refresh failure that is not an HttpError stays on the page and shows 暂时不可用; fails_when=the catch reads error.status without an instanceof check or still signs the user out; why_new=Shell error tests only throw HttpError 500 and 503; seam=none; no_claim=the logout endpoint (getApi is mocked)
  it("stays on the page when logout or refresh fails without an HTTP status", async () => {
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [{ path: "/", name: "Root", component: { template: "<div />" } }],
    })
    await router.push("/")
    await router.isReady()
    window.matchMedia = (query: string) =>
      ({
        matches: false,
        media: query,
        addEventListener: () => undefined,
        removeEventListener: () => undefined,
      }) as unknown as MediaQueryList
    const pinia = createPinia()
    setActivePinia(pinia)
    const session = useSessionStore()
    session.setAccessToken("token")
    const wrapper = mount(Shell, { global: { plugins: [pinia, router] } })
    request.mockReset()
    refresh.mockReset()
    handleUnauthorized.mockReset()
    request.mockRejectedValueOnce(new Error("Failed to fetch"))

    const leave = wrapper.findAll("button").find((button) => button.text() === "退出")
    expect(leave).toBeTruthy()
    await leave?.trigger("click")
    await flushPromises()

    expect(refresh).not.toHaveBeenCalled()
    expect(request).toHaveBeenCalledTimes(1)
    expect(handleUnauthorized).not.toHaveBeenCalled()
    expect(session.getAccessToken()).toBe("token")
    expect(router.currentRoute.value.path).toBe("/")
    expect(wrapper.get("[role=alert]").text()).toBe("暂时不可用")

    const denied = new HttpError(401, { trace_id: "t", code: "UNAUTHORIZED", message: "未登录", detail: null }, null)
    request.mockReset()
    refresh.mockReset()
    handleUnauthorized.mockReset()
    request.mockRejectedValueOnce(denied)
    refresh.mockRejectedValueOnce(new Error("Failed to fetch"))
    await leave?.trigger("click")
    await flushPromises()

    expect(refresh).toHaveBeenCalledOnce()
    expect(request).toHaveBeenCalledTimes(1)
    expect(handleUnauthorized).not.toHaveBeenCalled()
    expect(session.getAccessToken()).toBe("token")
    expect(wrapper.get("[role=alert]").text()).toBe("暂时不可用")
    request.mockReset()
    refresh.mockReset()
    request.mockImplementation(async () => undefined)
  })

  // Value: protects=a 401 from refresh during logout still clears the local session and shows no error; fails_when=a rejected refresh stays on the page the way a 503 does; why_new=Shell logout tests resolve refresh and only reject the second logout with 401; seam=none; no_claim=the refresh cookie (getApi is mocked)
  it("clears the session when logout refresh itself is 401", async () => {
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [{ path: "/", name: "Root", component: { template: "<div />" } }],
    })
    await router.push("/")
    await router.isReady()
    window.matchMedia = (query: string) =>
      ({
        matches: false,
        media: query,
        addEventListener: () => undefined,
        removeEventListener: () => undefined,
      }) as unknown as MediaQueryList
    const pinia = createPinia()
    setActivePinia(pinia)
    useSessionStore().setAccessToken("token")
    const wrapper = mount(Shell, { global: { plugins: [pinia, router] } })
    const denied = new HttpError(401, { trace_id: "t", code: "UNAUTHORIZED", message: "未登录", detail: null }, null)
    request.mockReset()
    refresh.mockReset()
    handleUnauthorized.mockReset()
    request.mockRejectedValueOnce(denied)
    refresh.mockRejectedValueOnce(denied)

    const leave = wrapper.findAll("button").find((button) => button.text() === "退出")
    await leave?.trigger("click")
    await flushPromises()

    expect(request).toHaveBeenCalledTimes(1)
    expect(refresh).toHaveBeenCalledOnce()
    expect(handleUnauthorized).toHaveBeenCalledOnce()
    expect(wrapper.find("[role=alert]").exists()).toBe(false)
    request.mockReset()
    refresh.mockReset()
    request.mockImplementation(async () => undefined)
    refresh.mockImplementation(async () => undefined)
  })

  // Value: protects=logout with no access token skips the logout request and still clears the local session; fails_when=leave posts logout without a token or skips handleUnauthorized; why_new=Shell logout tests all call setAccessToken before clicking 退出; seam=none; no_claim=the logout endpoint (getApi is mocked)
  it("clears the local session without requesting logout when there is no access token", async () => {
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [{ path: "/", name: "Root", component: { template: "<div />" } }],
    })
    await router.push("/")
    await router.isReady()
    window.matchMedia = (query: string) =>
      ({
        matches: false,
        media: query,
        addEventListener: () => undefined,
        removeEventListener: () => undefined,
      }) as unknown as MediaQueryList
    const pinia = createPinia()
    setActivePinia(pinia)
    const wrapper = mount(Shell, { global: { plugins: [pinia, router] } })
    request.mockClear()
    handleUnauthorized.mockClear()

    const leave = wrapper.findAll("button").find((button) => button.text() === "退出")
    await leave?.trigger("click")
    await flushPromises()

    expect(request).not.toHaveBeenCalled()
    expect(handleUnauthorized).toHaveBeenCalledOnce()
  })

  // Value: protects=a second click while logout is in flight does not send another logout; fails_when=leave starts a second request before the first settles; why_new=logout tests await one click before the next; seam=none; no_claim=the logout endpoint (getApi is mocked and held)
  it("sends one logout when the button is clicked again while leaving", async () => {
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [{ path: "/", name: "Root", component: { template: "<div />" } }],
    })
    await router.push("/")
    await router.isReady()
    window.matchMedia = (query: string) =>
      ({
        matches: false,
        media: query,
        addEventListener: () => undefined,
        removeEventListener: () => undefined,
      }) as unknown as MediaQueryList
    const pinia = createPinia()
    setActivePinia(pinia)
    useSessionStore().setAccessToken("token")
    const wrapper = mount(Shell, { global: { plugins: [pinia, router] } })
    let release: () => void = () => undefined
    request.mockReset()
    handleUnauthorized.mockReset()
    request.mockImplementation(
      () =>
        new Promise<undefined>((resolve) => {
          release = () => resolve(undefined)
        }),
    )

    const leave = wrapper.findAll("button").find((button) => button.text() === "退出")
    const first = leave?.trigger("click")
    const second = leave?.trigger("click")
    await vi.waitFor(() => expect(request).toHaveBeenCalledTimes(1))
    release()
    await first
    await second
    await flushPromises()

    expect(request).toHaveBeenCalledTimes(1)
    expect(handleUnauthorized).toHaveBeenCalledOnce()
  })

  // Value: protects=logout waits for an in-flight refresh and does not revoke a different account that refresh adopted; fails_when=leave posts logout before whenSettled, or a 401 retry logs out the other subject; why_new=logout tests resolve whenSettled immediately and never change the token subject; seam=none; no_claim=the refresh cookie (getApi is mocked)
  it("does not revoke a different account adopted while logging out", async () => {
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [{ path: "/", name: "Root", component: { template: "<div />" } }],
    })
    await router.push("/")
    await router.isReady()
    window.matchMedia = (query: string) =>
      ({
        matches: false,
        media: query,
        addEventListener: () => undefined,
        removeEventListener: () => undefined,
      }) as unknown as MediaQueryList
    const pinia = createPinia()
    setActivePinia(pinia)
    const session = useSessionStore()
    const mine = unsignedAccessToken({ sub: "user-a" })
    const other = unsignedAccessToken({ sub: "user-b" })
    session.setAccessToken(mine)
    const wrapper = mount(Shell, { global: { plugins: [pinia, router] } })
    let release: () => void = () => undefined
    request.mockReset()
    refresh.mockReset()
    handleUnauthorized.mockReset()
    whenSettled.mockReset()
    whenSettled.mockImplementation(
      () =>
        new Promise<undefined>((resolve) => {
          release = () => resolve(undefined)
        }),
    )

    const leave = wrapper.findAll("button").find((button) => button.text() === "退出")
    const pending = leave?.trigger("click")
    await flushPromises()
    expect(request).not.toHaveBeenCalled()
    session.setAccessToken(other)
    release()
    await pending
    await flushPromises()

    expect(request).not.toHaveBeenCalled()
    expect(refresh).not.toHaveBeenCalled()
    expect(handleUnauthorized).toHaveBeenCalledOnce()

    session.setAccessToken(mine)
    const denied = new HttpError(401, { trace_id: "t", code: "UNAUTHORIZED", message: "未登录", detail: null }, null)
    request.mockReset()
    refresh.mockReset()
    handleUnauthorized.mockReset()
    whenSettled.mockReset()
    whenSettled.mockImplementation(async () => undefined)
    request.mockRejectedValueOnce(denied)
    refresh.mockImplementation(async () => {
      session.setAccessToken(other)
    })
    await leave?.trigger("click")
    await flushPromises()

    expect(request).toHaveBeenCalledTimes(1)
    expect(refresh).toHaveBeenCalledOnce()
    expect(handleUnauthorized).toHaveBeenCalledOnce()
    request.mockReset()
    refresh.mockReset()
    whenSettled.mockReset()
    request.mockImplementation(async () => undefined)
    refresh.mockImplementation(async () => undefined)
    whenSettled.mockImplementation(async () => undefined)
  })

  // Value: protects=a menu link stays current when the address is a child of that link; fails_when=isCurrent requires an exact path and drops aria-current on a nested address; why_new=the shell test only opens the link path itself; seam=none; no_claim=pixel highlight (asserts aria-current)
  it("marks a menu link current when the address is under that link", async () => {
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [
        {
          path: "/",
          name: "Root",
          component: { template: "<router-view />" },
          children: [
            {
              path: "/asset",
              component: { template: "<router-view />" },
              meta: { title: "设备资源" },
              children: [
                {
                  path: "device",
                  component: { template: "<router-view />" },
                  meta: { title: "设备管理" },
                  children: [{ path: "detail", component: { template: "<p>详情</p>" } }],
                },
              ],
            },
          ],
        },
      ],
    })
    await router.push("/asset/device/detail")
    await router.isReady()
    window.matchMedia = (query: string) =>
      ({
        matches: false,
        media: query,
        addEventListener: () => undefined,
        removeEventListener: () => undefined,
      }) as unknown as MediaQueryList
    const pinia = createPinia()
    setActivePinia(pinia)
    const wrapper = mount(Shell, { global: { plugins: [pinia, router] } })
    const link = wrapper.get("a")

    expect(link.attributes("href")).toBe("/asset/device")
    expect(link.attributes("aria-current")).toBe("page")
  })
})
