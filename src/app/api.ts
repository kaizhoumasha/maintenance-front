import { createApiClient, type TokenSource } from "@/api/client"
import { useSessionStore } from "@/auth/session"

let client: ReturnType<typeof createApiClient> | null = null

export function getApi() {
  if (!client) {
    const session = useSessionStore()
    const token: TokenSource = {
      getAccessToken: () => session.getAccessToken(),
      setAccessToken: (value) => session.setAccessToken(value),
    }
    client = createApiClient({ token })
  }
  return client
}
