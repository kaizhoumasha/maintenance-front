export const viewLoaders = {
  "asset/device/index": () => import("@/views/asset/device/index.vue"),
  "asset/workline/index": () => import("@/views/asset/workline/index.vue"),
  "system/user/index": () => import("@/views/system/user/index.vue"),
  "system/user/detail": () => import("@/views/system/user/detail.vue"),
  "system/role/index": () => import("@/views/system/role/index.vue"),
  "system/permission/index": () => import("@/views/system/permission/index.vue"),
  "system/menu/index": () => import("@/views/system/menu/index.vue"),
  "system/audit-log/index": () => import("@/views/system/audit-log/index.vue"),
} as const
