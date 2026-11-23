import { describe, expect, it } from "vitest"
import { compileMenus } from "@/menus/compile"

describe("compileMenus", () => {
  it("registers hidden routes and names missing components", () => {
    const routes = compileMenus([
      {
        name: "Assets",
        path: "/asset",
        component: "Layout",
        meta: { title: "设备资源" },
        children: [
          { name: "AssetDevice", path: "device", component: "asset/device/index", meta: { title: "设备管理" } },
          { name: "Missing", path: "missing", component: "missing/page", meta: { title: "缺失", hidden: true } },
        ],
      },
    ])
    const root = routes[0]
    expect(root?.path).toBe("/asset")
    expect(root?.children?.map((child) => child.name)).toEqual(["AssetDevice", "Missing"])
    expect(root?.children?.[1]?.meta).toMatchObject({ missing: true, title: "缺失" })
  })
})
