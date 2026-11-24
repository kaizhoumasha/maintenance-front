import { createRouter, createWebHistory, type RouteRecordRaw } from "vue-router"
import { getApi } from "@/app/api"
import { onAccessTokenIdentityChange, useSessionStore } from "@/auth/session"
import { compileMenus } from "@/menus/compile"
import type { MenuNode } from "@/menus/types"

let installed = false
const installedRouteRemovers: Array<() => void> = []

export const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: "/login", name: "Login", component: () => import("@/auth/LoginView.vue"), meta: { public: true, title: "登录" } },
    { path: "/", name: "Root", component: () => import("@/app/Shell.vue"), children: [] },
  ],
})

const RESERVED_ROUTE_NAMES = new Set(["Login", "Root"])

function withoutReservedNames(routes: readonly RouteRecordRaw[]): RouteRecordRaw[] {
  return routes.map((route) => {
    const next = { ...route }
    if (typeof next.name === "string" && RESERVED_ROUTE_NAMES.has(next.name)) delete next.name
    if (next.children) next.children = withoutReservedNames(next.children)
    return next
  })
}

export function discardInstalledMenus() {
  installed = false
  const removers = installedRouteRemovers.splice(0)
  for (const remove of removers) remove()
}

onAccessTokenIdentityChange(discardInstalledMenus)

export async function installMenus() {
  if (installed) return
  const session = useSessionStore()
  if (!session.getAccessToken()) {
    try {
      await getApi().refresh()
    } catch {
      session.reset()
      return
    }
  }
  try {
    const me = await getApi().request<{ permissions: string[] }>("/api/v1/users/me")
    session.setPermissions(me.permissions)
    const menus = await getApi().request<MenuNode[]>("/api/v1/users/me/menus")
    const compiled = withoutReservedNames(compileMenus(menus))
    for (const route of compiled) installedRouteRemovers.push(router.addRoute("Root", route))
    installed = true
  } catch {
    session.reset()
  }
}

router.beforeEach(async (to) => {
  if (to.meta.public) return true
  const menusWereInstalled = installed
  await installMenus()
  if (!useSessionStore().getAccessToken()) return { path: "/login" }
  if (!menusWereInstalled && installed) return to.fullPath
  return true
})
