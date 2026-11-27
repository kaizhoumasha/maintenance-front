import { queryClient } from "@/app/query"
import { discardInstalledMenus, router } from "@/app/router"
import { useSessionStore } from "@/auth/session"

export async function handleUnauthorized() {
  useSessionStore().reset()
  queryClient.clear()
  discardInstalledMenus()
  if (router.currentRoute.value.path !== "/login") {
    await router.replace("/login").catch(() => undefined)
  }
}
