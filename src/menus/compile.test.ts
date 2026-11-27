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

  it("does not register a protocol-relative path or redirect", () => {
    const routes = compileMenus([
      {
        name: "Off",
        path: "//evil.example/phish",
        component: "asset/device/index",
        meta: { title: "外链" },
      },
      {
        name: "Assets",
        path: "/asset",
        component: "Layout",
        redirect: "//evil.example/phish",
        meta: { title: "设备资源" },
        children: [
          { name: "AssetDevice", path: "device", component: "asset/device/index", meta: { title: "设备管理" } },
        ],
      },
    ])
    expect(routes[0]?.path.startsWith("//")).toBe(false)
    expect(routes[0]?.path.includes("://")).toBe(false)
    expect(routes[0]?.meta).toMatchObject({ missing: true, title: "外链" })
    expect(routes[1]?.path).toBe("/asset")
    expect(routes[1]?.redirect).toBeUndefined()
    expect(routes[1]?.children?.[0]?.path).toBe("device")
  })

  // Value: protects=empty, backslash, and javascript: menu paths become the missing page and that redirect is dropped; fails_when=inAppPath only rejects // and :// so a script or backslash path is registered; why_new=compile.test.ts only uses a protocol-relative // path and redirect; seam=none; no_claim=the missing page renders in the browser (the loader is not called)
  it("sends an empty, backslash, or javascript path to the missing page", () => {
    const routes = compileMenus([
      { name: "Empty", path: "", component: "asset/device/index", meta: { title: "空" } },
      { name: "Slash", path: "/\\evil", component: "asset/device/index", meta: { title: "反斜杠" } },
      { name: "Script", path: "javascript:alert(1)", component: "asset/device/index", meta: { title: "脚本" } },
      {
        name: "Assets",
        path: "/asset",
        component: "Layout",
        redirect: "javascript:alert(1)",
        meta: { title: "设备资源" },
        children: [
          { name: "AssetDevice", path: "device", component: "asset/device/index", meta: { title: "设备管理" } },
          { name: "ScriptChild", path: "javascript:alert(1)", component: "asset/device/index", meta: { title: "脚本子页" } },
        ],
      },
    ])
    expect(routes[0]?.path).toBe("/invalid/Empty")
    expect(routes[0]?.meta).toMatchObject({ missing: true, title: "空" })
    expect(routes[1]?.path).toBe("/invalid/Slash")
    expect(routes[1]?.path.includes("\\")).toBe(false)
    expect(routes[1]?.meta).toMatchObject({ missing: true })
    expect(routes[2]?.path).toBe("/invalid/Script")
    expect(routes[2]?.path.includes("javascript:")).toBe(false)
    expect(routes[2]?.meta).toMatchObject({ missing: true })
    expect(routes[3]?.path).toBe("/asset")
    expect(routes[3]?.redirect).toBeUndefined()
    expect(routes[3]?.children?.[0]?.path).toBe("device")
    expect(routes[3]?.children?.[1]?.path).toBe("/invalid/ScriptChild")
    expect(routes[3]?.children?.[1]?.meta).toMatchObject({ missing: true, title: "脚本子页" })
  })

  it("does not register a path or redirect that hides a host behind a tab, newline, or trailing control character", () => {
    const routes = compileMenus([
      { name: "Tab", path: "/\t/evil.example", component: "asset/device/index", meta: { title: "制表符" } },
      { name: "Line", path: "/\n/evil.example", component: "asset/device/index", meta: { title: "换行" } },
      { name: "Return", path: "/\r/evil.example", component: "asset/device/index", meta: { title: "回车" } },
      { name: "Trail", path: "/asset\t", component: "asset/device/index", meta: { title: "尾部制表符" } },
      {
        name: "Assets",
        path: "/asset",
        component: "Layout",
        redirect: "/\t/evil.example",
        meta: { title: "设备资源" },
        children: [
          { name: "AssetDevice", path: "device", component: "asset/device/index", meta: { title: "设备管理" } },
        ],
      },
    ])
    for (const route of routes.slice(0, 4)) {
      expect(route?.path.includes("evil.example")).toBe(false)
      expect(route?.path.includes("\t")).toBe(false)
      expect(route?.path.includes("\n")).toBe(false)
      expect(route?.path.includes("\r")).toBe(false)
      expect(route?.meta).toMatchObject({ missing: true })
    }
    expect(routes[4]?.path).toBe("/asset")
    expect(routes[4]?.redirect).toBeUndefined()
    expect(routes[4]?.children?.[0]?.path).toBe("device")
  })

  it("keeps a relative user detail param and rejects a colon that is not a param", () => {
    const routes = compileMenus([
      {
        name: "System",
        path: "/system",
        component: "Layout",
        meta: { title: "系统管理" },
        children: [
          {
            name: "SystemUserDetail",
            path: "user/:id",
            component: "system/user/detail",
            meta: { title: "用户详情", hidden: true },
          },
          { name: "Note", path: "note:bad", component: "system/user/index", meta: { title: "冒号" } },
        ],
      },
    ])
    expect(routes[0]?.path).toBe("/system")
    expect(routes[0]?.children?.[0]?.path).toBe("user/:id")
    expect(routes[0]?.children?.[0]?.meta).toMatchObject({ missing: false, hidden: true, title: "用户详情" })
    expect(routes[0]?.children?.[1]?.path).toBe("/invalid/Note")
    expect(routes[0]?.children?.[1]?.meta).toMatchObject({ missing: true })
  })

  // Value: protects=a :// menu path is not registered in-app; fails_when=the :// check is removed, since this path does not start with // and its segments have no colon; why_new=compile tests cover //evil, javascript:, and backslashes, which do not match this shape; seam=none; no_claim=the browser follows the path (route record only)
  it("does not register a scheme path whose segments are empty", () => {
    const routes = compileMenus([
      { name: "Scheme", path: "://evil.example", component: "asset/device/index", meta: { title: "协议" } },
      {
        name: "Assets",
        path: "/asset",
        component: "Layout",
        redirect: "://evil.example",
        meta: { title: "设备资源" },
        children: [
          { name: "AssetDevice", path: "device", component: "asset/device/index", meta: { title: "设备管理" } },
        ],
      },
    ])
    expect(routes[0]?.path).toBe("/invalid/Scheme")
    expect(routes[0]?.path.includes("://")).toBe(false)
    expect(routes[0]?.path.includes("evil.example")).toBe(false)
    expect(routes[0]?.meta).toMatchObject({ missing: true, title: "协议" })
    expect(routes[1]?.redirect).toBeUndefined()
    expect(routes[1]?.children?.[0]?.path).toBe("device")
  })
})
