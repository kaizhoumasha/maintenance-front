import { createPinia, setActivePinia } from "pinia"
import { beforeEach, describe, expect, it, vi } from "vitest"
import type { MenuNode } from "@/menus/types"
import { router } from "@/app/router"
import { useSessionStore } from "@/auth/session"

const menus = vi.hoisted(() => [
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
] as MenuNode[])

vi.mock("@/app/api", () => ({
  getApi: () => ({
    refresh: () => Promise.reject(new Error("offline")),
    request: (path: string) => {
      if (path === "/api/v1/users/me") return Promise.resolve({ permissions: ["asset:read"] })
      if (path === "/api/v1/users/me/menus") return Promise.resolve(menus)
      return Promise.reject(new Error(`unexpected ${path}`))
    },
  }),
}))

describe("router beforeEach", () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    useSessionStore().setAccessToken("token")
  })

  it("rematches the current path after menus are installed, then allows the next navigation", async () => {
    await router.push("/asset/device")
    expect(router.currentRoute.value.name).toBe("AssetDevice")

    await router.push("/asset/workline")
    expect(router.currentRoute.value.name).toBe("AssetWorkline")
  })
})
