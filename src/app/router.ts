import { createRouter, createWebHistory, type RouteLocationNormalized, type RouteRecordRaw } from "vue-router"
import { HttpError } from "@/api/client"
import { getApi } from "@/app/api"
import { firstVisibleMenuPath } from "@/app/sidebar"
import { onAccessTokenIdentityChange, useSessionStore } from "@/auth/session"
import { compileMenus } from "@/menus/compile"
import type { MenuNode } from "@/menus/types"

let installed = false
let installing: Promise<void> | null = null
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

export function installMenus(): Promise<void> {
  if (installing) return installing
  installing = installMenusOnce().finally(() => {
    installing = null
  })
  return installing
}

async function installMenusOnce() {
  const session = useSessionStore()
  while (!installed) {
    const epoch = session.getEpoch()
    if (!session.getAccessToken()) {
      try {
        await getApi().refresh()
      } catch (error) {
        if (session.getEpoch() !== epoch) continue
        if (error instanceof HttpError && error.status !== 401) throw error
        session.reset()
        return
      }
    }
    if (session.getEpoch() !== epoch) continue
    try {
      const me = await getApi().request<{ permissions: string[] }>("/api/v1/users/me")
      if (session.getEpoch() !== epoch) continue
      const menus = await getApi().request<MenuNode[]>("/api/v1/users/me/menus")
      if (session.getEpoch() !== epoch) continue
      session.setPermissions(me.permissions)
      const compiled = withoutReservedNames(compileMenus(menus))
      for (const route of compiled) installedRouteRemovers.push(router.addRoute("Root", route))
      installed = true
    } catch (error) {
      if (session.getEpoch() !== epoch) continue
      if (error instanceof HttpError && error.status !== 401) throw error
      session.reset()
      return
    }
  }
}

function shellLanding(to: RouteLocationNormalized): string | null {
  const onlyShell = to.name === "Root" || (to.matched.length === 1 && to.matched[0]?.name === "Root")
  if (!onlyShell) return null
  const landing = firstVisibleMenuPath(router.getRoutes())
  return landing && landing !== to.path ? landing : null
}

router.beforeEach(async (to) => {
  if (to.meta.public) return true
  const menusWereInstalled = installed
  await installMenus()
  if (!useSessionStore().getAccessToken()) return { path: "/login" }
  const landing = shellLanding(to)
  if (landing) return landing
  if (!menusWereInstalled && installed) return to.fullPath
  return true
})
