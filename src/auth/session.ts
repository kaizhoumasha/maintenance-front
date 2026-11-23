import { defineStore } from "pinia"
import { ref } from "vue"

export const useSessionStore = defineStore("session", () => {
  const accessToken = ref<string | null>(null)
  const permissions = ref<string[]>([])
  const sidebarCollapsed = ref(false)

  function getAccessToken() {
    return accessToken.value
  }

  function setAccessToken(token: string | null) {
    accessToken.value = token
  }

  function setPermissions(codes: string[]) {
    permissions.value = codes
  }

  function hasPermission(code: string) {
    return permissions.value.includes(code)
  }

  function reset() {
    accessToken.value = null
    permissions.value = []
  }

  return { accessToken, permissions, sidebarCollapsed, getAccessToken, setAccessToken, setPermissions, hasPermission, reset }
})