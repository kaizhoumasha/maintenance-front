import { describe, expect, it } from "vitest"
import { sidebarSections, type SidebarRoute } from "@/app/sidebar"

const menus: SidebarRoute[] = [
  { path: "/login", name: "Login", meta: { title: "登录" } },
  { path: "/", name: "Root" },
  { path: "/asset", meta: { title: "设备资源" } },
  { path: "/asset/device", meta: { title: "设备管理" } },
  { path: "/asset/missing", meta: { title: "缺失", hidden: true } },
  { path: "/asset/:id", meta: { title: "设备详情" } },
  { path: "/system", meta: { title: "系统管理", hidden: true } },
  { path: "/system/user", meta: { title: "用户管理" } },
  { path: "/archive", meta: { title: "归档" } },
  { path: "/archive/old", meta: { title: "旧档", hidden: true } },
  { path: "/audit", meta: { title: "审计日志" } },
]

describe("sidebarSections", () => {
  it("groups absolute child paths and drops hidden, parametric, and empty sections", () => {
    expect(sidebarSections(menus)).toEqual([
      {
        title: "设备资源",
        items: [{ title: "设备管理", to: "/asset/device" }],
      },
      {
        title: "",
        items: [{ title: "用户管理", to: "/system/user" }],
      },
      {
        title: "",
        items: [{ title: "审计日志", to: "/audit" }],
      },
    ])
  })

  // Value: protects=aliases, untitled routes, and grandchildren stay out of a parent's items; fails_when=aliasOf is ignored, a non-string title is rendered, or any startsWith path is a child; why_new=sidebar.test.ts has one level of string titles and no aliasOf; seam=none; no_claim=router.getRoutes() shape (the input is a plain fixture)
  it("omits aliases, untitled routes, and grandchildren from the parent section", () => {
    const routes: SidebarRoute[] = [
      { path: "/asset", meta: { title: "设备资源" } },
      { path: "/asset/device", meta: { title: "设备管理" } },
      { path: "/asset/device/detail", meta: { title: "设备详情" } },
      { path: "/asset/device", meta: { title: "设备管理" }, aliasOf: { path: "/asset/device" } },
      { path: "/notes" },
      { path: "/odd", meta: { title: { text: "对象" } } },
      { path: "/blank", meta: { title: "" } },
    ]
    expect(sidebarSections(routes)).toEqual([
      {
        title: "设备资源",
        items: [{ title: "设备管理", to: "/asset/device" }],
      },
      {
        title: "设备管理",
        items: [{ title: "设备详情", to: "/asset/device/detail" }],
      },
    ])
  })
})
