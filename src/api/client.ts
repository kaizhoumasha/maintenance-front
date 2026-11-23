import type { ErrorBody, TokenPair } from "@/api/types"

export type { ErrorBody }

export class HttpError extends Error {
  constructor(
    readonly status: number,
    readonly body: ErrorBody,
    readonly retryAfter: string | null,
  ) {
    super(body.message)
  }
}

export interface TokenSource {
  getAccessToken(): string | null
  setAccessToken(token: string | null): void
}

type RequestOptions = RequestInit & { skipRefresh?: boolean }

const REFRESH_PATH = "/api/v1/auth/refresh"

async function readError(response: Response): Promise<HttpError> {
  const body = (await response.json()) as ErrorBody
  return new HttpError(response.status, body, response.headers.get("retry-after"))
}

export function createApiClient(options: { fetchFn?: typeof fetch; token: TokenSource }) {
  const fetchFn = options.fetchFn ?? fetch
  let refreshing: Promise<string> | null = null

  async function refresh(): Promise<string> {
    if (refreshing) return refreshing
    refreshing = (async () => {
      const response = await fetchFn(REFRESH_PATH, { method: "POST", credentials: "include" })
      if (!response.ok) {
        options.token.setAccessToken(null)
        throw await readError(response)
      }
      const pair = (await response.json()) as TokenPair
      options.token.setAccessToken(pair.access_token)
      return pair.access_token
    })().finally(() => {
      refreshing = null
    })
    return refreshing
  }

  async function request<T>(path: string, init: RequestOptions = {}): Promise<T> {
    const { skipRefresh = false, headers, ...rest } = init
    const send = (token: string | null) =>
      fetchFn(path, {
        ...rest,
        credentials: "include",
        headers: {
          ...(rest.body ? { "content-type": "application/json" } : {}),
          ...(token ? { authorization: `Bearer ${token}` } : {}),
          ...headers,
        },
      })

    let response = await send(options.token.getAccessToken())
    if (response.status === 401 && !skipRefresh && options.token.getAccessToken()) {
      await refresh()
      response = await send(options.token.getAccessToken())
    }
    if (!response.ok) throw await readError(response)
    if (response.status === 204) return undefined as T
    return (await response.json()) as T
  }

  return { request, refresh }
}