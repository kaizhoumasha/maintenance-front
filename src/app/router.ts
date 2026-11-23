import { createRouter, createWebHistory, type RouteRecordRaw } from "vue-router"
import { getApi } from "@/app/api"
import { useSessionStore } from "@/auth/session"
import { compileMenus } from "@/menus/compile"
import type { MenuNode } from "@/menus/types"

let installed = false

export const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: "/login", name: "Login", component: () => import("@/auth/LoginView.vue"), meta: { public: true, title: "登录" } },
    { path: "/", name: "Root", component: () => import("@/app/Shell.vue"), children: [] },
  ],
})

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
  const me = await getApi().request<{ permissions: string[] }>("/api/v1/users/me")
  session.setPermissions(me.permissions)
  const menus = await getApi().request<MenuNode[]>("/api/v1/users/me/menus")
  for (const route of compileMenus(menus)) router.addRoute("Root", route as RouteRecordRaw)
  installed = true
}

router.beforeEach(async (to) => {
  if (to.meta.public) return true
  const menusWereInstalled = installed
  await installMenus()
  if (!useSessionStore().getAccessToken()) return { path: "/login" }
  if (!menusWereInstalled && installed) return to.fullPath
  return true
})
