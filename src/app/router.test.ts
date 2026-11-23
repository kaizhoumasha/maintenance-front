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
  }
})

vi.mock("@/app/api", () => ({
  getApi: () => ({
    refresh: () => Promise.reject(new Error("offline")),
    request: (path: string) => {
      if (path === "/api/v1/users/me") {
        apiState.meCalls += 1
        return Promise.resolve({ permissions: [...apiState.permissions] })
      }
      if (path === "/api/v1/users/me/menus") {
        apiState.menuCalls += 1
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
})
