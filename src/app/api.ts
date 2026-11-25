import { createApiClient, type TokenSource } from "@/api/client"
import { queryClient } from "@/app/query"
import { onAccessTokenIdentityChange, useSessionStore } from "@/auth/session"
import { sameAccessTokenSubject } from "@/auth/tokenSubject"

onAccessTokenIdentityChange(() => {
  queryClient.clear()
})

let client: ReturnType<typeof createApiClient> | null = null
let unauthorizedHandler: (() => void | Promise<void>) | null = null

export function setUnauthorizedHandler(handler: () => void | Promise<void>) {
  unauthorizedHandler = handler
}

export function sessionTokenSource(): TokenSource {
  const session = useSessionStore()
  return {
    getAccessToken: () => session.getAccessToken(),
    getEpoch: () => session.getEpoch(),
    setAccessToken: (value) => {
      const current = session.getAccessToken()
      if (value !== null && current !== null && sameAccessTokenSubject(current, value)) session.rotateAccessToken(value)
      else session.setAccessToken(value)
    },
  }
}

export function getApi() {
  if (!client) {
    client = createApiClient({
      token: sessionTokenSource(),
      onUnauthorized: () => unauthorizedHandler?.(),
    })
  }
  return client
}
