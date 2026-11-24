import { createPinia, setActivePinia } from "pinia"
import { beforeEach, describe, expect, it, vi } from "vitest"
import type { MenuNode } from "@/menus/types"
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
    meReject: false,
    menuReject: false,
  }
})

vi.mock("@/app/api", () => ({
  getApi: () => ({
    refresh: () => {
      apiState.refreshCalls += 1
      return Promise.reject(new Error("offline"))
    },
    request: (path: string) => {
      if (path === "/api/v1/users/me") {
        apiState.meCalls += 1
        if (apiState.meReject) return Promise.reject(new Error("profile down"))
        return Promise.resolve({ permissions: [...apiState.permissions] })
      }
      if (path === "/api/v1/users/me/menus") {
        apiState.menuCalls += 1
        if (apiState.menuReject) return Promise.reject(new Error("menus down"))
        return Promise.resolve(apiState.menus)
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
    apiState.meReject = false
    apiState.menuReject = false
    setActivePinia(createPinia())
    useSessionStore().setAccessToken("token")
  })

  it("rematches the current path after menus are installed, then allows the next navigation", async () => {
    await router.push("/asset/device")
    expect(router.currentRoute.value.name).toBe("AssetDevice")

    await router.push("/asset/workline")
    expect(router.currentRoute.value.name).toBe("AssetWorkline")
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
})
