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
})