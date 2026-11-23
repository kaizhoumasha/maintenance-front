export interface MenuMeta {
  title: string
  icon?: string | null
  hidden?: boolean | null
  keepAlive?: boolean | null
  permission?: string | null
}

export interface MenuNode {
  name: string
  path: string
  component: string
  redirect?: string | null
  meta: MenuMeta
  children?: MenuNode[] | null
}
