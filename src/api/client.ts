import type { ErrorBody } from "@/api/types"

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
  getEpoch?(): number
}

type RequestOptions = RequestInit & { skipRefresh?: boolean }

const REFRESH_PATH = "/api/v1/auth/refresh"
const LOGOUT_PATH = "/api/v1/auth/logout"

function fallbackError(response: Response): HttpError {
  return new HttpError(
    response.status,
    {
      trace_id: "",
      code: response.status === 401 ? "UNAUTHORIZED" : "UNAVAILABLE",
      message: response.status === 401 ? "未登录" : "暂时不可用",
      detail: null,
    },
    response.headers.get("retry-after"),
  )
}

export function usableAccessToken(body: unknown): string | null {
  if (typeof body !== "object" || body === null || !("access_token" in body)) return null
  const token = body.access_token
  return typeof token === "string" && token.length > 0 ? token : null
}

async function readError(response: Response): Promise<HttpError> {
  try {
    const body = (await response.json()) as ErrorBody
    if (typeof body?.message === "string") return new HttpError(response.status, body, response.headers.get("retry-after"))
  } catch {
    // A gateway page or an empty body still has to keep its HTTP status.
  }
  return fallbackError(response)
}

export function createApiClient(options: {
  fetchFn?: typeof fetch
  token: TokenSource
  onUnauthorized?: () => void | Promise<void>
}) {
  const fetchFn = options.fetchFn ?? fetch
  let refreshing: Promise<string> | null = null

  async function invalidate() {
    options.token.setAccessToken(null)
    await options.onUnauthorized?.()
  }

  function clearedSession() {
    return new HttpError(401, { trace_id: "", code: "UNAUTHORIZED", message: "未登录", detail: null }, null)
  }

  async function refresh(): Promise<string> {
    if (refreshing) return refreshing
    const startedEpoch = options.token.getEpoch?.()
    const startedToken = options.token.getAccessToken()
    refreshing = (async () => {
      const response = await fetchFn(REFRESH_PATH, { method: "POST", credentials: "include" })
      if (!response.ok) {
        const error = await readError(response)
        const epoch = options.token.getEpoch?.()
        const current = options.token.getAccessToken()
        if ((startedEpoch !== undefined && epoch !== startedEpoch) || current !== startedToken || error.status !== 401) {
          throw error
        }
        await invalidate()
        throw error
      }
      const accessToken = usableAccessToken(await response.json())
      if (!accessToken) {
        throw new HttpError(401, { trace_id: "", code: "UNAUTHORIZED", message: "未登录", detail: null }, null)
      }
      const epoch = options.token.getEpoch?.()
      const current = options.token.getAccessToken()
      if ((startedEpoch !== undefined && epoch !== startedEpoch) || current !== startedToken) {
        await fetchFn(LOGOUT_PATH, {
          method: "POST",
          credentials: "include",
          headers: { authorization: `Bearer ${accessToken}` },
        }).catch(() => undefined)
        throw clearedSession()
      }
      options.token.setAccessToken(accessToken)
      return accessToken
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
      const startedEpoch = options.token.getEpoch?.()
      const startedToken = options.token.getAccessToken()
      response = await send(startedToken)
      if (response.status === 401) {
        const error = await readError(response)
        const epoch = options.token.getEpoch?.()
        const current = options.token.getAccessToken()
        if ((startedEpoch !== undefined && epoch !== startedEpoch) || current !== startedToken) throw error
        await invalidate()
        throw error
      }
    }
    if (!response.ok) throw await readError(response)
    if (response.status === 204) return undefined as T
    return (await response.json()) as T
  }

  function whenSettled(): Promise<void> {
    return refreshing?.then(() => undefined, () => undefined) ?? Promise.resolve()
  }

  return { request, refresh, whenSettled }
}
