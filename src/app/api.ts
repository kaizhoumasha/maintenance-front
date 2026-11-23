import { createApiClient, type TokenSource } from "@/api/client"
import { useSessionStore } from "@/auth/session"

let client: ReturnType<typeof createApiClient> | null = null
let unauthorizedHandler: (() => void | Promise<void>) | null = null

export function setUnauthorizedHandler(handler: () => void | Promise<void>) {
  unauthorizedHandler = handler
}

export function sessionTokenSource(): TokenSource {
  const session = useSessionStore()
  return {
    getAccessToken: () => session.getAccessToken(),
    setAccessToken: (value) => {
      if (value === null) session.setAccessToken(null)
      else session.rotateAccessToken(value)
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
