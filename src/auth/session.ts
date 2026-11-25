import { defineStore } from "pinia"
import { ref } from "vue"

const identityListeners = new Set<() => void>()

export function onAccessTokenIdentityChange(listener: () => void) {
  identityListeners.add(listener)
}

function emitAccessTokenIdentityChange() {
  for (const listener of identityListeners) listener()
}

export const useSessionStore = defineStore("session", () => {
  const accessToken = ref<string | null>(null)
  const permissions = ref<string[]>([])
  const sidebarCollapsed = ref(false)
  let epoch = 0

  function getAccessToken() {
    return accessToken.value
  }

  function getEpoch() {
    return epoch
  }

  function setAccessToken(token: string | null) {
    if (accessToken.value === token) return
    epoch += 1
    accessToken.value = token
    permissions.value = []
    emitAccessTokenIdentityChange()
  }

  function rotateAccessToken(token: string) {
    accessToken.value = token
  }

  function setPermissions(codes: string[]) {
    permissions.value = codes
  }

  function hasPermission(code: string) {
    return permissions.value.includes(code)
  }

  function reset() {
    const changed = accessToken.value !== null || permissions.value.length > 0
    if (!changed) return
    epoch += 1
    accessToken.value = null
    permissions.value = []
    emitAccessTokenIdentityChange()
  }

  return {
    accessToken,
    permissions,
    sidebarCollapsed,
    getAccessToken,
    getEpoch,
    setAccessToken,
    rotateAccessToken,
    setPermissions,
    hasPermission,
    reset,
  }
})
