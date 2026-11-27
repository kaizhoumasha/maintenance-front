import type { RouteRecordRaw } from "vue-router"
import type { MenuNode } from "@/menus/types"
import { viewLoaders } from "@/menus/views"

export function compileMenus(nodes: MenuNode[]): RouteRecordRaw[] {
  return nodes.map((node) => {
    const path = inAppPath(node.path) ? node.path : `/invalid/${encodeURIComponent(node.name)}`
    if (!inAppPath(node.path)) {
      return {
        name: node.name,
        path,
        component: () => import("@/app/MissingView.vue"),
        meta: { ...node.meta, hidden: Boolean(node.meta.hidden), missing: true },
      }
    }
    const children = node.children ? compileMenus(node.children) : undefined
    const redirect = node.redirect && inAppPath(node.redirect) ? node.redirect : undefined
    if (node.component === "Layout") {
      return {
        name: node.name,
        path,
        component: () => import("@/app/RouteView.vue"),
        redirect,
        meta: { ...node.meta, hidden: Boolean(node.meta.hidden) },
        children: children ?? [],
      }
    }
    const loader = Object.hasOwn(viewLoaders, node.component)
      ? viewLoaders[node.component as keyof typeof viewLoaders]
      : undefined
    const route = {
      name: node.name,
      path,
      component: loader ?? (() => import("@/app/MissingView.vue")),
      meta: { ...node.meta, hidden: Boolean(node.meta.hidden), missing: loader === undefined },
    }
    return children ? { ...route, children } : route
  })
}

function paramSegment(segment: string): boolean {
  return /^:[A-Za-z_][A-Za-z0-9_]*[?+*]?$/.test(segment)
}

function inAppPath(path: string): boolean {
  if (path.length === 0 || /[\u0000-\u001F\u007F]/.test(path)) return false
  if (path.includes("\\") || path.includes("://") || path.startsWith("//")) return false
  return path.split("/").every((segment) => segment.length === 0 || !segment.includes(":") || paramSegment(segment))
}
