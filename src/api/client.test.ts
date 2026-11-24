import { createPinia, setActivePinia } from "pinia"
import { describe, expect, it, vi } from "vitest"
import { createApiClient, HttpError, type TokenSource } from "@/api/client"
import { sessionTokenSource } from "@/app/api"
import { queryClient } from "@/app/query"
import { router } from "@/app/router"
import { handleUnauthorized } from "@/app/unauthorized"
import { useSessionStore } from "@/auth/session"

function source(token: string | null = "old"): TokenSource {
  let current = token
  return {
    getAccessToken: () => current,
    setAccessToken: (next) => {
      current = next
    },
  }
}

function json(status: number, body: unknown, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", ...headers } })
}

describe("api client", () => {
  it("sends the bearer token and refreshes once after 401", async () => {
    const token = source()
    const fetchFn = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      if (url.endsWith("/auth/refresh")) return json(200, { access_token: "new", token_type: "bearer" })
      const header = new Headers(init?.headers).get("authorization")
      if (header === "Bearer old") return json(401, { trace_id: "t", code: "UNAUTHORIZED", message: "未登录", detail: null })
      return json(200, { ok: true })
    })
    const client = createApiClient({ fetchFn, token })
    await expect(client.request<{ ok: boolean }>("/api/v1/users")).resolves.toEqual({ ok: true })
    expect(token.getAccessToken()).toBe("new")
    expect(fetchFn).toHaveBeenCalledTimes(3)
  })

  it("does not refresh a login failure", async () => {
    const fetchFn = vi.fn(async () => json(401, { trace_id: "t", code: "UNAUTHORIZED", message: "用户名或密码错误", detail: null }))
    const client = createApiClient({ fetchFn, token: source(null) })
    await expect(client.request("/api/v1/auth/login", { method: "POST", skipRefresh: true })).rejects.toBeInstanceOf(HttpError)
    expect(fetchFn).toHaveBeenCalledTimes(1)
  })

  it("does not refresh when there is no access token", async () => {
    const fetchFn = vi.fn(async () => json(401, { trace_id: "t", code: "UNAUTHORIZED", message: "未登录", detail: null }))
    const client = createApiClient({ fetchFn, token: source(null) })
    await expect(client.request("/api/v1/users")).rejects.toBeInstanceOf(HttpError)
    expect(fetchFn).toHaveBeenCalledTimes(1)
  })

  it("clears the access token and permissions when refresh fails", async () => {
    setActivePinia(createPinia())
    const session = useSessionStore()
    session.setAccessToken("old")
    session.setPermissions(["asset:read"])
    queryClient.setQueryData(["me"], { id: 1 })
    const fetchFn = vi.fn(async () => json(401, { trace_id: "t", code: "UNAUTHORIZED", message: "未登录", detail: null }))
    const client = createApiClient({ fetchFn, token: sessionTokenSource(), onUnauthorized: handleUnauthorized })
    await expect(client.request("/api/v1/users")).rejects.toBeInstanceOf(HttpError)
    expect(session.getAccessToken()).toBeNull()
    expect(session.permissions).toEqual([])
    expect(queryClient.getQueryData(["me"])).toBeUndefined()
    expect(router.currentRoute.value.path).toBe("/login")
  })

  it("clears the access token and permissions when the retried request is still 401", async () => {
    setActivePinia(createPinia())
    const session = useSessionStore()
    session.setAccessToken("old")
    session.setPermissions(["asset:read"])
    queryClient.setQueryData(["me"], { id: 1 })
    const fetchFn = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url.endsWith("/auth/refresh")) return json(200, { access_token: "new", token_type: "bearer" })
      return json(401, { trace_id: "t", code: "UNAUTHORIZED", message: "未登录", detail: null })
    })
    const client = createApiClient({ fetchFn, token: sessionTokenSource(), onUnauthorized: handleUnauthorized })
    await expect(client.request("/api/v1/users")).rejects.toBeInstanceOf(HttpError)
    expect(session.getAccessToken()).toBeNull()
    expect(session.permissions).toEqual([])
    expect(queryClient.getQueryData(["me"])).toBeUndefined()
    expect(router.currentRoute.value.path).toBe("/login")
    expect(fetchFn).toHaveBeenCalledTimes(3)
  })

  it("shares one refresh between concurrent requests", async () => {
    let refreshed = 0
    const token = source()
    const fetchFn = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      if (url.endsWith("/auth/refresh")) {
        refreshed += 1
        return json(200, { access_token: "new", token_type: "bearer" })
      }
      const header = new Headers(init?.headers).get("authorization")
      if (header === "Bearer old") return json(401, { trace_id: "t", code: "UNAUTHORIZED", message: "未登录", detail: null })
      return json(200, { ok: url })
    })
    const client = createApiClient({ fetchFn, token })
    await Promise.all([client.request("/api/v1/users"), client.request("/api/v1/work-lines")])
    expect(refreshed).toBe(1)
  })

  // Value: protects=a non-401 failure rejects with status, message, and Retry-After and does not refresh or clear the token; fails_when=non-ok responses are ignored or any error status triggers refresh; why_new=client tests only cover 401 refresh, skipRefresh, and invalidation; seam=none; no_claim=live HTTP status or Retry-After (fetch is mocked)
  it("throws HttpError with retry-after and does not refresh a non-401 failure", async () => {
    const token = source("old")
    const fetchFn = vi.fn(async () =>
      json(429, { trace_id: "t", code: "RATE_LIMIT", message: "请求过多", detail: null }, { "retry-after": "12" }),
    )
    const client = createApiClient({ fetchFn, token })
    const error = await client.request("/api/v1/users").catch((caught: unknown) => caught)
    expect(error).toBeInstanceOf(HttpError)
    expect(error).toMatchObject({ status: 429, retryAfter: "12", message: "请求过多" })
    expect(token.getAccessToken()).toBe("old")
    expect(fetchFn).toHaveBeenCalledTimes(1)
  })

  // Value: protects=a 204 response resolves to undefined without parsing a body; fails_when=204 falls through to response.json and the request rejects; why_new=successful client tests only assert JSON object bodies; seam=none; no_claim=the server actually emits 204 (Response is stubbed)
  it("returns undefined for 204 without reading a body", async () => {
    const fetchFn = vi.fn(async () => new Response(null, { status: 204 }))
    const client = createApiClient({ fetchFn, token: source("old") })
    await expect(client.request("/api/v1/users/1")).resolves.toBeUndefined()
    expect(fetchFn).toHaveBeenCalledTimes(1)
  })

  // Value: protects=a successful refresh keeps permission codes and does not leave the current route; fails_when=refresh stores the token via setAccessToken and wipes permissions or redirects; why_new=the happy refresh test uses a fake token source; sessionTokenSource is only used when refresh fails; seam=none; no_claim=cookie refresh against the real auth service (fetch is mocked)
  it("keeps permissions when refresh stores a new access token", async () => {
    setActivePinia(createPinia())
    const session = useSessionStore()
    session.setAccessToken("old")
    session.setPermissions(["asset:read"])
    const pathBefore = router.currentRoute.value.path
    const fetchFn = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      if (url.endsWith("/auth/refresh")) return json(200, { access_token: "new", token_type: "bearer" })
      const header = new Headers(init?.headers).get("authorization")
      if (header === "Bearer old") return json(401, { trace_id: "t", code: "UNAUTHORIZED", message: "未登录", detail: null })
      return json(200, { ok: true })
    })
    const client = createApiClient({ fetchFn, token: sessionTokenSource(), onUnauthorized: handleUnauthorized })
    await expect(client.request<{ ok: boolean }>("/api/v1/users")).resolves.toEqual({ ok: true })
    expect(session.getAccessToken()).toBe("new")
    expect(session.permissions).toEqual(["asset:read"])
    expect(router.currentRoute.value.path).toBe(pathBefore)
  })
})