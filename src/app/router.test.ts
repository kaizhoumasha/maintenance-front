import { createPinia, setActivePinia } from "pinia"
import { beforeEach, describe, expect, it, vi } from "vitest"
import type { MenuNode } from "@/menus/types"
import { clearNavigationNotice, navigationNotice } from "@/app/navigationNotice"
import { router } from "@/app/router"
import { useSessionStore } from "@/auth/session"

const apiState = vi.hoisted(() => {
  const assetMenus = [
    {
      name: "Assets",
      path: "/asset",
      component: "Layout",
      meta: { title: "设备资源" },
      children: [
        { name: "AssetDevice", path: "device", component: "asset/device/index", meta: { title: "设备管理" } },
        { name: "AssetWorkline", path: "workline", component: "asset/workline/index", meta: { title: "工作线管理" } },
      ],
    },
  ] as MenuNode[]
  return {
    permissions: ["asset:read"] as string[],
    menus: assetMenus,
    assetMenus,
    meCalls: 0,
    menuCalls: 0,
    refreshCalls: 0,
    refreshSucceeds: false,
    onRefreshSuccess: null as (() => void) | null,
    meReject: false,
    menuReject: false,
    meStatus: null as number | null,
    refreshStatus: null as number | null,
    meHold: null as Promise<void> | null,
    refreshHold: null as Promise<void> | null,
    menuHold: null as Promise<void> | null,
  }
})

vi.mock("@/app/api", () => ({
  getApi: () => ({
    refresh: async () => {
      apiState.refreshCalls += 1
      if (apiState.refreshHold) await apiState.refreshHold
      if (apiState.refreshSucceeds) {
        apiState.onRefreshSuccess?.()
        return "refreshed"
      }
      if (apiState.refreshStatus) {
        const { HttpError } = await import("@/api/client")
        throw new HttpError(
          apiState.refreshStatus,
          {
            trace_id: "t",
            code: apiState.refreshStatus === 401 ? "UNAUTHORIZED" : "UNAVAILABLE",
            message: apiState.refreshStatus === 401 ? "未登录" : "暂时不可用",
            detail: null,
          },
          apiState.refreshStatus === 429 ? "12" : null,
        )
      }
      throw new Error("offline")
    },
    request: async (path: string) => {
      if (path === "/api/v1/users/me") {
        apiState.meCalls += 1
        const permissions = [...apiState.permissions]
        if (apiState.meHold) await apiState.meHold
        if (apiState.meStatus) {
          const { HttpError } = await import("@/api/client")
          throw new HttpError(
            apiState.meStatus,
            { trace_id: "t", code: "RATE_LIMIT", message: "请求过多", detail: null },
            "12",
          )
        }
        if (apiState.meReject) throw new Error("profile down")
        return { permissions }
      }
      if (path === "/api/v1/users/me/menus") {
        apiState.menuCalls += 1
        const menus = apiState.menus
        if (apiState.menuHold) await apiState.menuHold
        if (apiState.menuReject) throw new Error("menus down")
        return menus
      }
      return Promise.reject(new Error(`unexpected ${path}`))
    },
  }),
}))

describe("router beforeEach", () => {
  beforeEach(() => {
    apiState.permissions = ["asset:read"]
    apiState.menus = apiState.assetMenus
    apiState.meCalls = 0
    apiState.menuCalls = 0
    apiState.refreshCalls = 0
    apiState.refreshSucceeds = false
    apiState.onRefreshSuccess = null
    apiState.meReject = false
    apiState.menuReject = false
    apiState.meStatus = null
    apiState.refreshStatus = null
    apiState.meHold = null
    apiState.refreshHold = null
    apiState.menuHold = null
    setActivePinia(createPinia())
    clearNavigationNotice()
    useSessionStore().setAccessToken("token")
  })

  it("rematches the current path after menus are installed, then allows the next navigation", async () => {
    await router.push("/asset/device")
    expect(router.currentRoute.value.name).toBe("AssetDevice")

    await router.push("/asset/workline")
    expect(router.currentRoute.value.name).toBe("AssetWorkline")
  })

  // Value: protects=a later navigation does not request the profile or menus again; fails_when=the installed guard is removed and every visit refetches; why_new=the rematch test only checks the route name; seam=none; no_claim=the profile payload (getApi is mocked)
  it("does not request the profile again once menus are installed", async () => {
    await router.push("/asset/device")
    expect(apiState.meCalls).toBe(1)
    expect(apiState.menuCalls).toBe(1)
    await router.push("/asset/workline")
    expect(apiState.meCalls).toBe(1)
    expect(apiState.menuCalls).toBe(1)
    expect(router.currentRoute.value.name).toBe("AssetWorkline")
  })

  // Value: protects=an anonymous visit stays on the page when refresh succeeds and menus install; fails_when=a resolved refresh still sends the visitor to login or skips the menu request; why_new=router tests only reject refresh; seam=none; no_claim=the refresh cookie (getApi is mocked and sets the token)
  it("opens the requested page when an anonymous refresh succeeds", async () => {
    useSessionStore().setAccessToken(null)
    await router.push("/login")
    apiState.refreshSucceeds = true
    apiState.onRefreshSuccess = () => {
      useSessionStore().rotateAccessToken("refreshed")
    }
    apiState.meCalls = 0
    apiState.menuCalls = 0
    apiState.refreshCalls = 0
    await router.push("/asset/device")
    expect(apiState.refreshCalls).toBe(1)
    expect(apiState.meCalls).toBe(1)
    expect(apiState.menuCalls).toBe(1)
    expect(useSessionStore().getAccessToken()).toBe("refreshed")
    expect(useSessionStore().permissions).toEqual(["asset:read"])
    expect(router.currentRoute.value.name).toBe("AssetDevice")
  })

  // Value: protects=a profile that returns after the access token changed does not overwrite the new session; fails_when=setPermissions writes the old profile onto the replacement token; why_new=router tests change the token only after menus are already installed; seam=none; no_claim=two live users (the profile response is held in the mock)
  it("does not apply a profile that returns after the session identity changes", async () => {
    let release: () => void = () => undefined
    apiState.meHold = new Promise<void>((resolve) => {
      release = resolve
    })
    const pending = router.push("/asset/device")
    await vi.waitFor(() => expect(apiState.meCalls).toBe(1))
    apiState.permissions = ["user:read"]
    useSessionStore().setAccessToken("other")
    release()
    await pending
    expect(useSessionStore().getAccessToken()).toBe("other")
    expect(useSessionStore().permissions).toEqual(["user:read"])
    expect(apiState.meCalls).toBe(2)
  })

  it("drops the previous user's permission codes and dynamic routes after a second login", async () => {
    await router.push("/asset/device")
    expect(useSessionStore().permissions).toEqual(["asset:read"])
    expect(router.hasRoute("AssetDevice")).toBe(true)
    expect(router.hasRoute("Assets")).toBe(true)

    apiState.permissions = ["user:read"]
    apiState.menus = [
      {
        name: "System",
        path: "/system",
        component: "Layout",
        meta: { title: "系统" },
        children: [
          { name: "SystemUser", path: "user", component: "system/user/index", meta: { title: "用户管理" } },
        ],
      },
    ]
    useSessionStore().setAccessToken("next-user")

    expect(useSessionStore().getAccessToken()).toBe("next-user")
    expect(useSessionStore().permissions).toEqual([])
    expect(router.hasRoute("AssetDevice")).toBe(false)
    expect(router.hasRoute("Assets")).toBe(false)
    expect(router.hasRoute("SystemUser")).toBe(false)

    await router.push("/system/user")
    expect(apiState.meCalls).toBe(2)
    expect(apiState.menuCalls).toBe(2)
    expect(useSessionStore().permissions).toEqual(["user:read"])
    expect(router.currentRoute.value.name).toBe("SystemUser")
    expect(router.hasRoute("AssetDevice")).toBe(false)
    expect(router.hasRoute("SystemUser")).toBe(true)
  })

  // Value: protects=an anonymous visit to a protected path ends on /login and does not install menus when refresh fails; fails_when=the guard allows the page or installMenus still requests /users/me after refresh throws; why_new=router tests always set an access token before navigation; seam=none; no_claim=the refresh HTTP call (getApi is mocked to reject)
  it("sends an anonymous visitor to login when refresh fails and does not install menus", async () => {
    useSessionStore().setAccessToken(null)
    await router.push("/login")
    apiState.meCalls = 0
    apiState.menuCalls = 0
    await router.push("/asset/device")
    expect(router.currentRoute.value.path).toBe("/login")
    expect(apiState.meCalls).toBe(0)
    expect(apiState.menuCalls).toBe(0)
    expect(router.hasRoute("AssetDevice")).toBe(false)
  })

  // Value: protects=opening /login does not refresh or request menus; fails_when=the public meta check is removed and login runs installMenus; why_new=router tests never assert the login route itself; seam=none; no_claim=the form render
  it("does not refresh or request menus when opening /login", async () => {
    await router.push("/asset/device")
    useSessionStore().setAccessToken(null)
    apiState.refreshCalls = 0
    apiState.meCalls = 0
    apiState.menuCalls = 0
    await router.push("/login")
    expect(router.currentRoute.value.path).toBe("/login")
    expect(apiState.refreshCalls).toBe(0)
    expect(apiState.meCalls).toBe(0)
    expect(apiState.menuCalls).toBe(0)
  })

  // Value: protects=a thrown profile or menu request ends on /login with the session cleared and no dynamic routes; fails_when=beforeEach rejects and the app stays on the unstarted location, or a failed menu request keeps the new permissions; why_new=router tests only cover refresh failure and successful menu installation; seam=none; no_claim=the live status code (request is mocked to reject)
  it("sends the visitor to login when the profile or menu request throws", async () => {
    apiState.meReject = true
    await router.push("/asset/device")
    expect(router.currentRoute.value.path).toBe("/login")
    expect(useSessionStore().getAccessToken()).toBeNull()
    expect(useSessionStore().permissions).toEqual([])
    expect(router.hasRoute("AssetDevice")).toBe(false)

    apiState.meReject = false
    apiState.menuReject = true
    useSessionStore().setAccessToken("token")
    await router.push("/asset/device")
    expect(router.currentRoute.value.path).toBe("/login")
    expect(useSessionStore().getAccessToken()).toBeNull()
    expect(useSessionStore().permissions).toEqual([])
    expect(router.hasRoute("AssetDevice")).toBe(false)
  })

  // Value: protects=a menu named Login or Root does not replace the public login route or the shell; fails_when=addRoute keeps those names and /login no longer matches the login page; why_new=router tests only install Asset and System names; seam=none; no_claim=a live menu payload from the API (menus are stubbed)
  it("keeps the login route and shell when a menu reuses those names", async () => {
    apiState.menus = [
      {
        name: "System",
        path: "/system",
        component: "Layout",
        meta: { title: "系统" },
        children: [
          { name: "Login", path: "alias", component: "system/user/index", meta: { title: "撞名登录" } },
          { name: "Root", path: "shell", component: "system/role/index", meta: { title: "撞名外壳" } },
        ],
      },
    ]
    await router.push("/system/alias")
    expect(router.currentRoute.value.path).toBe("/system/alias")
    expect(router.resolve("/login").name).toBe("Login")
    expect(router.resolve("/login").matched.length).toBeGreaterThan(0)
    expect(router.getRoutes().find((route) => route.name === "Root")?.path).toBe("/")
    await router.push("/login")
    expect(router.currentRoute.value.name).toBe("Login")
    expect(router.currentRoute.value.path).toBe("/login")
  })

  // Value: protects=a top-level menu named Login is removed when the session resets and does not stay open for the next user; fails_when=deleting the reserved name leaves an unnamed route that discardInstalledMenus cannot remove; why_new=the reserved-name test never resets the session; seam=none; no_claim=the menu payload comes from the API (menus are stubbed)
  it("removes a top-level menu that reused Login when the session resets", async () => {
    apiState.menus = [
      {
        name: "Login",
        path: "/system/alias",
        component: "system/user/index",
        meta: { title: "撞名登录" },
      },
    ]
    await router.push("/system/alias")
    expect(router.currentRoute.value.path).toBe("/system/alias")
    expect(router.resolve("/login").name).toBe("Login")
    useSessionStore().reset()
    expect(router.resolve("/system/alias").matched).toEqual([])
    expect(router.resolve("/login").name).toBe("Login")
  })

  // Value: protects=a failed anonymous refresh does not clear a session that signed in while it was in flight; fails_when=refresh failure always calls reset; why_new=the anonymous failure test never changes identity during refresh; seam=none; no_claim=the refresh cookie (getApi is mocked)
  it("does not clear a session that signs in while anonymous refresh fails", async () => {
    useSessionStore().setAccessToken(null)
    await router.push("/login")
    let release: () => void = () => undefined
    apiState.refreshHold = new Promise<void>((resolve) => {
      release = resolve
    })
    apiState.meCalls = 0
    apiState.menuCalls = 0
    apiState.refreshCalls = 0
    const pending = router.push("/asset/device")
    await vi.waitFor(() => expect(apiState.refreshCalls).toBe(1))
    useSessionStore().setAccessToken("newer")
    release()
    await pending
    expect(useSessionStore().getAccessToken()).toBe("newer")
    expect(useSessionStore().permissions).toEqual(["asset:read"])
    expect(router.currentRoute.value.name).toBe("AssetDevice")
    expect(apiState.meCalls).toBe(1)
    expect(apiState.menuCalls).toBe(1)
  })

  // Value: protects=menus that return after the access token changes are not installed for the new session; fails_when=the epoch check after the menu request is removed; why_new=the profile race changes identity before menus are requested; seam=none; no_claim=the menu payload (getApi is mocked)
  it("does not install menus that return after the session identity changes", async () => {
    let release: () => void = () => undefined
    apiState.menuHold = new Promise<void>((resolve) => {
      release = resolve
    })
    const pending = router.push("/asset/device")
    await vi.waitFor(() => expect(apiState.menuCalls).toBe(1))
    apiState.permissions = ["user:read"]
    useSessionStore().setAccessToken("other")
    release()
    await pending
    expect(useSessionStore().getAccessToken()).toBe("other")
    expect(useSessionStore().permissions).toEqual(["user:read"])
    expect(apiState.meCalls).toBe(2)
    expect(apiState.menuCalls).toBe(2)
    expect(router.currentRoute.value.name).toBe("AssetDevice")
  })

  it("keeps the session when menu install sees a non-401 error and still clears on 401", async () => {
    await router.push("/login")
    expect(router.currentRoute.value.path).toBe("/login")
    useSessionStore().setAccessToken(null)
    useSessionStore().setAccessToken("token")
    apiState.meStatus = 429
    await expect(router.push("/asset/device")).rejects.toMatchObject({ status: 429 })
    expect(useSessionStore().getAccessToken()).toBe("token")
    expect(router.currentRoute.value.path).toBe("/login")

    apiState.meStatus = 401
    await router.push("/asset/device")
    expect(useSessionStore().getAccessToken()).toBeNull()
    expect(router.currentRoute.value.path).toBe("/login")
  })

  // Value: protects=opening the shell lands on the first visible menu instead of an empty content area; fails_when=the guard leaves the address on / after menus install; why_new=router tests open /asset/device directly or expect / to stay blank; seam=none; no_claim=the login form (navigation is the router guard)
  it("opens the first visible menu when the address is the shell", async () => {
    await router.push("/")
    expect(router.currentRoute.value.path).toBe("/asset/device")
    expect(router.currentRoute.value.name).toBe("AssetDevice")
  })

  // Value: protects=a menu with no visible item stays on the shell; fails_when=the landing redirect loops or sends the visitor to a hidden path; why_new=the landing test always has a visible device page; seam=none; no_claim=the menu payload (menus are stubbed)
  it("stays on the shell when every menu item is hidden", async () => {
    apiState.menus = [
      {
        name: "HiddenOnly",
        path: "/hidden",
        component: "system/user/index",
        meta: { title: "隐藏", hidden: true },
      },
    ]
    useSessionStore().setAccessToken("hidden-user")
    await router.push("/")
    expect(router.currentRoute.value.path).toBe("/")
    expect(router.currentRoute.value.name).toBe("Root")
  })

  // Value: protects=an anonymous 429 or 503 refresh stays on the current page and does not request menus; fails_when=the refresh catch resets and the guard redirects to login; why_new=anonymous refresh tests only throw a generic Error, which still enters login; seam=none; no_claim=the refresh cookie (getApi is mocked)
  it("stays put when an anonymous refresh is temporarily unavailable", async () => {
    for (const status of [429, 503]) {
      useSessionStore().setAccessToken(null)
      await router.push("/login")
      apiState.refreshStatus = status
      apiState.meCalls = 0
      apiState.menuCalls = 0
      await expect(router.push("/asset/device")).rejects.toMatchObject({ status, message: "暂时不可用" })
      expect(navigationNotice.value).toEqual({
        message: "暂时不可用",
        retryAfter: status === 429 ? "12" : null,
      })
      expect(router.currentRoute.value.path).toBe("/login")
      expect(useSessionStore().getAccessToken()).toBeNull()
      expect(apiState.meCalls).toBe(0)
      expect(apiState.menuCalls).toBe(0)
    }
    await router.push({ path: "/login", query: { ready: "1" } })
    expect(navigationNotice.value).toBeNull()
  })

  // Value: protects=a second navigation during menu install waits for the same install; fails_when=each guard calls addRoute and the profile is requested twice; why_new=router tests only navigate after the previous guard has settled; seam=none; no_claim=the menu payload (getApi is mocked and held)
  it("installs menus once when another navigation starts during the install", async () => {
    let release: () => void = () => undefined
    apiState.menuHold = new Promise<void>((resolve) => {
      release = resolve
    })
    const first = router.push("/asset/device")
    await vi.waitFor(() => expect(apiState.menuCalls).toBe(1))
    const second = router.push("/asset/workline")
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(apiState.meCalls).toBe(1)
    expect(apiState.menuCalls).toBe(1)
    release()
    await Promise.allSettled([first, second])
    expect(apiState.meCalls).toBe(1)
    expect(apiState.menuCalls).toBe(1)
    expect(router.getRoutes().filter((route) => route.name === "AssetDevice")).toHaveLength(1)
    expect(router.currentRoute.value.name).toBe("AssetWorkline")
  })
})
