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

  // Value: protects=a registered view is not marked missing and a layout keeps its redirect; fails_when=viewLoaders lookup always misses or redirect is dropped; why_new=compile.test.ts only asserts the missing child; seam=none; no_claim=the view component actually renders
  it("does not mark a registered view missing and keeps the layout redirect", () => {
    const routes = compileMenus([
      {
        name: "Assets",
        path: "/asset",
        component: "Layout",
        redirect: "/asset/device",
        meta: { title: "设备资源" },
        children: [
          { name: "AssetDevice", path: "device", component: "asset/device/index", meta: { title: "设备管理" } },
        ],
      },
    ])
    const root = routes[0]
    expect(root?.redirect).toBe("/asset/device")
    expect(root?.children?.[0]?.meta).toMatchObject({ missing: false, title: "设备管理" })
  })

  // Value: protects=component names inherited from Object.prototype stay on the missing page; fails_when=the in operator treats constructor or toString as a registered view; why_new=the missing-child test uses a name that is absent as an own property; seam=none; no_claim=the missing page renders in the browser
  it("treats inherited property names as missing views", () => {
    const routes = compileMenus([
      { name: "Odd", path: "/odd", component: "constructor", meta: { title: "构造" } },
      { name: "Text", path: "/text", component: "toString", meta: { title: "文本" } },
    ])
    expect(routes[0]?.meta).toMatchObject({ missing: true, title: "构造" })
    expect(routes[1]?.meta).toMatchObject({ missing: true, title: "文本" })
  })
})
