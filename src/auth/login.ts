import { HttpError, usableAccessToken, type TokenSource } from "@/api/client"
import type { TokenPair } from "@/api/types"

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
  const accessToken = usableAccessToken(pair)
  if (!accessToken) {
    throw new HttpError(400, { trace_id: "", code: "INVALID_TOKEN", message: "登录失败", detail: null }, null)
  }
  session.setAccessToken(accessToken)
}