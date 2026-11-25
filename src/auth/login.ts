import type { TokenPair } from "@/api/types"
import type { TokenSource } from "@/api/client"

interface LoginClient {
  request<T>(path: string, init?: RequestInit & { skipRefresh?: boolean }): Promise<T>
  whenSettled?(): Promise<void>
}

export async function submitLogin(
  client: LoginClient,
  input: { username: string; password: string },
  session: TokenSource,
) {
  await client.whenSettled?.()
  const pair = await client.request<TokenPair>("/api/v1/auth/login", {
    method: "POST",
    skipRefresh: true,
    body: JSON.stringify(input),
  })
  session.setAccessToken(pair.access_token)
}