export interface SidebarItem {
  title: string
  to: string
}

export interface SidebarSection {
  title: string
  items: SidebarItem[]
}

export interface SidebarRoute {
  name?: string | symbol | null
  path: string
  meta?: object | null
  aliasOf?: unknown
  children?: readonly SidebarRoute[]
}

export function sidebarSections(routes: readonly SidebarRoute[]): SidebarSection[] {
  const list = routes.filter((route) => route.name !== "Login" && route.name !== "Root" && route.path !== "/" && !route.aliasOf)
  const sections: SidebarSection[] = []
  const grouped = new Set<string>()

  for (const route of list) {
    const children = list.filter((other) => isDirectChild(route.path, other.path))
    if (children.length === 0) continue
    grouped.add(route.path)
    for (const child of children) grouped.add(child.path)
    const items = children.flatMap(toItem)
    if (items.length === 0) continue
    sections.push({ title: isHidden(route) ? "" : titleOf(route), items })
  }

  for (const route of list) {
    if (grouped.has(route.path) || isHidden(route)) continue
    const items = toItem(route)
    if (items.length === 0) continue
    sections.push({ title: "", items })
  }

  return sections
}

function isDirectChild(parent: string, child: string) {
  const prefix = `${parent}/`
  return child.startsWith(prefix) && !child.slice(prefix.length).includes("/")
}

function toItem(route: SidebarRoute): SidebarItem[] {
  const title = titleOf(route)
  if (!title || isHidden(route) || route.path.includes(":")) return []
  return [{ title, to: route.path }]
}

function titleOf(route: SidebarRoute): string {
  if (!route.meta || !("title" in route.meta)) return ""
  return typeof route.meta.title === "string" ? route.meta.title : ""
}

function isHidden(route: SidebarRoute): boolean {
  return Boolean(route.meta && "hidden" in route.meta && route.meta.hidden === true)
}
