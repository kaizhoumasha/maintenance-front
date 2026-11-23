import type { RouteRecordRaw } from "vue-router"
import type { MenuNode } from "@/menus/types"
import { viewLoaders } from "@/menus/views"

export function compileMenus(nodes: MenuNode[]): RouteRecordRaw[] {
  return nodes.map((node) => {
    const children = node.children ? compileMenus(node.children) : undefined
    if (node.component === "Layout") {
      return {
        name: node.name,
        path: node.path,
        component: () => import("@/app/RouteView.vue"),
        redirect: node.redirect ?? undefined,
        meta: { ...node.meta, hidden: Boolean(node.meta.hidden) },
        children: children ?? [],
      }
    }
    const loader =
      node.component in viewLoaders ? viewLoaders[node.component as keyof typeof viewLoaders] : undefined
    const route = {
      name: node.name,
      path: node.path,
      component: loader ?? (() => import("@/app/MissingView.vue")),
      meta: { ...node.meta, hidden: Boolean(node.meta.hidden), missing: loader === undefined },
    }
    return children ? { ...route, children } : route
  })
}
