import { createPinia, setActivePinia } from "pinia"
import { describe, expect, it, vi } from "vitest"
import { createApiClient, HttpError, type TokenSource } from "@/api/client"
import { getApi, sessionTokenSource } from "@/app/api"
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

function unsignedAccessToken(sub: string, extra: object = {}): string {
  const encode = (value: object) =>
    btoa(JSON.stringify(value)).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "")
  return `${encode({ alg: "none", typ: "JWT" })}.${encode({ sub, ...extra })}.signature`
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
    // Value: protects=API and refresh requests send cookies and omit JSON content-type without a body; fails_when=credentials is dropped or a body-less call is marked application/json; why_new=client tests assert credentials only on the stale-token logout call; seam=none; no_claim=the browser cookie jar (fetch is mocked)
    for (const call of fetchFn.mock.calls) {
      expect(call[1]).toMatchObject({ credentials: "include" })
      expect(new Headers(call[1]?.headers).has("content-type")).toBe(false)
    }
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

  // Value: protects=a 429 or 503 from refresh keeps the access token, permissions, and current page; fails_when=any non-ok refresh calls invalidate; why_new=the refresh failure test only returns 401, which must still clear the session; seam=none; no_claim=the refresh cookie (fetch is mocked)
  it("keeps the session when refresh is temporarily unavailable", async () => {
    for (const status of [429, 503]) {
      setActivePinia(createPinia())
      const session = useSessionStore()
      session.setAccessToken("old")
      session.setPermissions(["asset:read"])
      queryClient.setQueryData(["me"], { id: 1 })
      const pathBefore = router.currentRoute.value.path
      const fetchFn = vi.fn(async (input: RequestInfo | URL) => {
        if (String(input).endsWith("/auth/refresh")) {
          return json(status, { trace_id: "t", code: "UNAVAILABLE", message: "暂时不可用", detail: null }, { "retry-after": "12" })
        }
        return json(401, { trace_id: "t", code: "UNAUTHORIZED", message: "未登录", detail: null })
      })
      const client = createApiClient({ fetchFn, token: sessionTokenSource(), onUnauthorized: handleUnauthorized })
      const error = await client.request("/api/v1/users").then(
        () => null,
        (caught: unknown) => caught,
      )
      expect(error).toBeInstanceOf(HttpError)
      expect((error as HttpError).status).toBe(status)
      expect((error as HttpError).retryAfter).toBe("12")
      expect(session.getAccessToken()).toBe("old")
      expect(session.permissions).toEqual(["asset:read"])
      expect(queryClient.getQueryData(["me"])).toEqual({ id: 1 })
      expect(router.currentRoute.value.path).toBe(pathBefore)
    }
  })

  it("keeps the status when refresh returns a non-JSON error page", async () => {
    setActivePinia(createPinia())
    const session = useSessionStore()
    session.setAccessToken("old")
    session.setPermissions(["asset:read"])
    const fetchFn = vi.fn(async (input: RequestInfo | URL) => {
      if (String(input).endsWith("/auth/refresh")) {
        return new Response("<html>unavailable</html>", { status: 503, headers: { "content-type": "text/html" } })
      }
      return json(401, { trace_id: "t", code: "UNAUTHORIZED", message: "未登录", detail: null })
    })
    const client = createApiClient({ fetchFn, token: sessionTokenSource(), onUnauthorized: handleUnauthorized })
    const error = await client.request("/api/v1/users").catch((caught: unknown) => caught)
    expect(error).toBeInstanceOf(HttpError)
    expect(error).toMatchObject({ status: 503, message: "暂时不可用" })
    expect(session.getAccessToken()).toBe("old")
    expect(session.permissions).toEqual(["asset:read"])
  })

  it("clears the session when refresh 401 has no JSON body", async () => {
    setActivePinia(createPinia())
    const session = useSessionStore()
    session.setAccessToken("old")
    session.setPermissions(["asset:read"])
    const fetchFn = vi.fn(async (input: RequestInfo | URL) => {
      if (String(input).endsWith("/auth/refresh")) return new Response("", { status: 401 })
      return json(401, { trace_id: "t", code: "UNAUTHORIZED", message: "未登录", detail: null })
    })
    const client = createApiClient({ fetchFn, token: sessionTokenSource(), onUnauthorized: handleUnauthorized })
    const error = await client.request("/api/v1/users").catch((caught: unknown) => caught)
    expect(error).toBeInstanceOf(HttpError)
    expect((error as HttpError).status).toBe(401)
    expect(session.getAccessToken()).toBeNull()
    expect(session.permissions).toEqual([])
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

  // Value: protects=a retried 401 does not clear a session that replaced the token while the retry was in flight; fails_when=the retry branch calls invalidate after the token changed; why_new=the retry test returns 401 before anyone replaces the token; seam=none; no_claim=the refresh cookie (fetch is mocked)
  it("does not clear a replacement session when the retried request is still 401", async () => {
    setActivePinia(createPinia())
    const session = useSessionStore()
    session.setAccessToken("old")
    let release: () => void = () => undefined
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    let userCalls = 0
    const fetchFn = vi.fn(async (input: RequestInfo | URL) => {
      if (String(input).endsWith("/auth/refresh")) return json(200, { access_token: "refreshed", token_type: "bearer" })
      userCalls += 1
      if (userCalls === 1) return json(401, { trace_id: "t", code: "UNAUTHORIZED", message: "未登录", detail: null })
      await gate
      return json(401, { trace_id: "t", code: "UNAUTHORIZED", message: "未登录", detail: null })
    })
    const client = createApiClient({ fetchFn, token: sessionTokenSource(), onUnauthorized: handleUnauthorized })
    const pending = client.request("/api/v1/users")
    await vi.waitFor(() => expect(fetchFn).toHaveBeenCalledTimes(3))
    session.setAccessToken("newer")
    release()
    await expect(pending).rejects.toBeInstanceOf(HttpError)
    expect(session.getAccessToken()).toBe("newer")
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
    const current = unsignedAccessToken("user-a", { iat: 1 })
    const next = unsignedAccessToken("user-a", { iat: 2 })
    session.setAccessToken(current)
    session.setPermissions(["asset:read"])
    queryClient.setQueryData(["me"], { id: 1 })
    const epoch = session.getEpoch()
    const pathBefore = router.currentRoute.value.path
    const fetchFn = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      if (url.endsWith("/auth/refresh")) return json(200, { access_token: next, token_type: "bearer" })
      const header = new Headers(init?.headers).get("authorization")
      if (header === `Bearer ${current}`) return json(401, { trace_id: "t", code: "UNAUTHORIZED", message: "未登录", detail: null })
      return json(200, { ok: true })
    })
    const client = createApiClient({ fetchFn, token: sessionTokenSource(), onUnauthorized: handleUnauthorized })
    await expect(client.request<{ ok: boolean }>("/api/v1/users")).resolves.toEqual({ ok: true })
    expect(session.getAccessToken()).toBe(next)
    expect(session.permissions).toEqual(["asset:read"])
    expect(session.getEpoch()).toBe(epoch)
    expect(queryClient.getQueryData(["me"])).toEqual({ id: 1 })
    expect(router.currentRoute.value.path).toBe(pathBefore)
  })

  it("clears permissions when refresh stores a token for a different user", async () => {
    setActivePinia(createPinia())
    const session = useSessionStore()
    const current = unsignedAccessToken("user-a")
    const next = unsignedAccessToken("user-b")
    session.setAccessToken(current)
    session.setPermissions(["asset:read"])
    queryClient.setQueryData(["me"], { id: 1 })
    const epoch = session.getEpoch()
    const fetchFn = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      if (url.endsWith("/auth/refresh")) return json(200, { access_token: next, token_type: "bearer" })
      const header = new Headers(init?.headers).get("authorization")
      if (header === `Bearer ${current}`) return json(401, { trace_id: "t", code: "UNAUTHORIZED", message: "未登录", detail: null })
      return json(200, { ok: true })
    })
    const client = createApiClient({ fetchFn, token: sessionTokenSource(), onUnauthorized: handleUnauthorized })
    await expect(client.request<{ ok: boolean }>("/api/v1/users")).resolves.toEqual({ ok: true })
    expect(session.getAccessToken()).toBe(next)
    expect(session.permissions).toEqual([])
    expect(session.getEpoch()).toBe(epoch + 1)
    expect(queryClient.getQueryData(["me"])).toBeUndefined()
  })

  it("clears permissions when the refreshed token has no subject", async () => {
    setActivePinia(createPinia())
    const session = useSessionStore()
    const current = unsignedAccessToken("user-a")
    session.setAccessToken(current)
    session.setPermissions(["asset:read"])
    const fetchFn = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      if (url.endsWith("/auth/refresh")) return json(200, { access_token: "not-a-jwt", token_type: "bearer" })
      const header = new Headers(init?.headers).get("authorization")
      if (header === `Bearer ${current}`) return json(401, { trace_id: "t", code: "UNAUTHORIZED", message: "未登录", detail: null })
      return json(200, { ok: true })
    })
    const client = createApiClient({ fetchFn, token: sessionTokenSource(), onUnauthorized: handleUnauthorized })
    await expect(client.request<{ ok: boolean }>("/api/v1/users")).resolves.toEqual({ ok: true })
    expect(session.getAccessToken()).toBe("not-a-jwt")
    expect(session.permissions).toEqual([])
  })

  // Value: protects=a refresh that finishes after reset does not restore an access token; fails_when=refresh writes the new token after the session epoch changes; why_new=existing refresh tests keep the token in place until the response returns; seam=none; no_claim=the refresh cookie against the live auth service (fetch is mocked)
  it("does not restore an access token cleared while refresh is in flight", async () => {
    setActivePinia(createPinia())
    const session = useSessionStore()
    session.setAccessToken("old")
    let release: () => void = () => undefined
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    let userCalls = 0
    const fetchFn = vi.fn(async (input: RequestInfo | URL) => {
      if (String(input).endsWith("/auth/refresh")) {
        await gate
        return json(200, { access_token: "revived", token_type: "bearer" })
      }
      userCalls += 1
      if (userCalls === 1) return json(401, { trace_id: "t", code: "UNAUTHORIZED", message: "未登录", detail: null })
      return json(200, { ok: true })
    })
    const client = createApiClient({ fetchFn, token: sessionTokenSource(), onUnauthorized: handleUnauthorized })
    const pending = client.request("/api/v1/users")
    await vi.waitFor(() => expect(fetchFn).toHaveBeenCalledTimes(2))
    session.reset()
    release()
    await expect(pending).rejects.toBeInstanceOf(HttpError)
    expect(session.getAccessToken()).toBeNull()
  })

  // Value: protects=a refresh with no access token stores the new token; fails_when=refresh throws because the token is still empty; why_new=the in-flight tests start with a token and only cover clearing or replacing it; seam=none; no_claim=the refresh cookie against the live auth service (fetch is mocked)
  it("stores the access token from a refresh that starts with an empty session", async () => {
    setActivePinia(createPinia())
    const session = useSessionStore()
    const fetchFn = vi.fn(async () => json(200, { access_token: "restored", token_type: "bearer" }))
    const client = createApiClient({ fetchFn, token: sessionTokenSource(), onUnauthorized: handleUnauthorized })
    await expect(client.refresh()).resolves.toBe("restored")
    expect(session.getAccessToken()).toBe("restored")
  })

  // Value: protects=a refresh that finishes after the access token is replaced does not overwrite it; fails_when=the epoch check is removed and the old refresh token is stored; why_new=the in-flight test only clears the token, which the null check already rejects; seam=none; no_claim=the refresh cookie against the live auth service (fetch is mocked)
  it("does not overwrite an access token replaced while refresh is in flight", async () => {
    setActivePinia(createPinia())
    const session = useSessionStore()
    session.setAccessToken("old")
    let release: () => void = () => undefined
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    const fetchFn = vi.fn(async (input: RequestInfo | URL, _init?: RequestInit) => {
      if (String(input).endsWith("/auth/refresh")) {
        await gate
        return json(200, { access_token: "revived", token_type: "bearer" })
      }
      return json(401, { trace_id: "t", code: "UNAUTHORIZED", message: "未登录", detail: null })
    })
    const client = createApiClient({ fetchFn, token: sessionTokenSource(), onUnauthorized: handleUnauthorized })
    const pending = client.request("/api/v1/users")
    await vi.waitFor(() => expect(fetchFn).toHaveBeenCalledTimes(2))
    session.setAccessToken("newer")
    release()
    await expect(pending).rejects.toBeInstanceOf(HttpError)
    expect(session.getAccessToken()).toBe("newer")
    const logout = fetchFn.mock.calls.find((call) => String(call[0]).endsWith("/auth/logout"))
    expect(logout?.[1]).toMatchObject({
      method: "POST",
      credentials: "include",
      headers: { authorization: "Bearer revived" },
    })
  })

  // Value: protects=a failed refresh does not clear a session that signed in while it was in flight; fails_when=the failure branch calls invalidate after the token changed; why_new=the in-flight tests only cover a 200 refresh; seam=none; no_claim=the refresh cookie (fetch is mocked)
  it("does not clear a replacement session when refresh fails", async () => {
    setActivePinia(createPinia())
    const session = useSessionStore()
    session.setAccessToken("old")
    let release: () => void = () => undefined
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    const fetchFn = vi.fn(async (input: RequestInfo | URL) => {
      if (String(input).endsWith("/auth/refresh")) {
        await gate
        return json(401, { trace_id: "t", code: "UNAUTHORIZED", message: "未登录", detail: null })
      }
      return json(401, { trace_id: "t", code: "UNAUTHORIZED", message: "未登录", detail: null })
    })
    const client = createApiClient({ fetchFn, token: sessionTokenSource(), onUnauthorized: handleUnauthorized })
    const pending = client.request("/api/v1/users")
    await vi.waitFor(() => expect(fetchFn).toHaveBeenCalledTimes(2))
    session.setAccessToken("newer")
    release()
    await expect(pending).rejects.toBeInstanceOf(HttpError)
    expect(session.getAccessToken()).toBe("newer")
  })

  // Value: protects=a 401 with skipRefresh and an access token does not refresh or replace that token; fails_when=the skipRefresh guard is removed; why_new=the login 401 test has no access token, which skips refresh on its own; seam=none; no_claim=the login endpoint (fetch is mocked)
  it("does not refresh a 401 when skipRefresh is set and an access token exists", async () => {
    const token = source("old")
    const fetchFn = vi.fn(async (input: RequestInfo | URL) => {
      if (String(input).endsWith("/auth/refresh")) return json(200, { access_token: "new", token_type: "bearer" })
      return json(401, { trace_id: "t", code: "UNAUTHORIZED", message: "用户名或密码错误", detail: null })
    })
    const client = createApiClient({ fetchFn, token })
    await expect(
      client.request("/api/v1/auth/login", {
        method: "POST",
        skipRefresh: true,
        body: JSON.stringify({ username: "admin", password: "wrong" }),
      }),
    ).rejects.toBeInstanceOf(HttpError)
    expect(token.getAccessToken()).toBe("old")
    expect(fetchFn).toHaveBeenCalledTimes(1)
    // Value: protects=a JSON body is sent as application/json with cookies and still does not refresh; fails_when=the body content-type is omitted or skipRefresh starts a refresh; why_new=the skipRefresh test never reads the fetch headers; seam=none; no_claim=the login endpoint (fetch is mocked)
    expect(fetchFn).toHaveBeenCalledWith(
      "/api/v1/auth/login",
      expect.objectContaining({
        credentials: "include",
        method: "POST",
        body: JSON.stringify({ username: "admin", password: "wrong" }),
        headers: expect.objectContaining({
          "content-type": "application/json",
          authorization: "Bearer old",
        }),
      }),
    )
  })

  // Value: protects=a refresh that finishes after the session leaves and returns to the same token does not store the stale token; fails_when=only the token text is compared and the epoch check is removed; why_new=the in-flight replace test uses a different token, which the text check already rejects; seam=none; no_claim=the refresh cookie (fetch is mocked)
  it("does not store a stale refresh after the session returns to the same token", async () => {
    setActivePinia(createPinia())
    const session = useSessionStore()
    session.setAccessToken("old")
    let release: () => void = () => undefined
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    let userCalls = 0
    const fetchFn = vi.fn(async (input: RequestInfo | URL, _init?: RequestInit) => {
      if (String(input).endsWith("/auth/refresh")) {
        await gate
        return json(200, { access_token: "revived", token_type: "bearer" })
      }
      userCalls += 1
      if (userCalls === 1) return json(401, { trace_id: "t", code: "UNAUTHORIZED", message: "未登录", detail: null })
      return json(200, { ok: true })
    })
    const client = createApiClient({ fetchFn, token: sessionTokenSource(), onUnauthorized: handleUnauthorized })
    const pending = client.request("/api/v1/users")
    await vi.waitFor(() => expect(fetchFn).toHaveBeenCalledTimes(2))
    session.setAccessToken("other")
    session.setAccessToken("old")
    release()
    await expect(pending).rejects.toBeInstanceOf(HttpError)
    expect(session.getAccessToken()).toBe("old")
    const logout = fetchFn.mock.calls.find((call) => String(call[0]).endsWith("/auth/logout"))
    expect(logout?.[1]).toMatchObject({
      method: "POST",
      credentials: "include",
      headers: { authorization: "Bearer revived" },
    })
  })

  // Value: protects=whenSettled waits for an in-flight refresh and still resolves if that refresh rejects; fails_when=it returns before the refresh finishes or rethrows the refresh error; why_new=login.test.ts injects a fake whenSettled and never calls createApiClient; seam=none; no_claim=the refresh cookie (fetch is mocked)
  it("resolves whenSettled after a rejected refresh and immediately when idle", async () => {
    const token = source("old")
    let release: (response: Response) => void = () => undefined
    const gate = new Promise<Response>((resolve) => {
      release = resolve
    })
    const fetchFn = vi.fn(async (input: RequestInfo | URL) => {
      if (String(input).endsWith("/auth/refresh")) return gate
      return json(200, { ok: true })
    })
    const client = createApiClient({ fetchFn, token })
    const pendingRefresh = client.refresh()
    let settled = false
    const waiting = client.whenSettled().then(() => {
      settled = true
    })
    await Promise.resolve()
    expect(settled).toBe(false)
    release(json(401, { trace_id: "t", code: "UNAUTHORIZED", message: "未登录", detail: null }))
    await expect(pendingRefresh).rejects.toBeInstanceOf(HttpError)
    await waiting
    expect(settled).toBe(true)
    await expect(client.whenSettled()).resolves.toBeUndefined()
  })

  // Value: protects=getApi returns one client so a second caller waits for its in-flight refresh; fails_when=each getApi call builds a new client and whenSettled resolves immediately; why_new=whenSettled and login tests construct or inject a client and never call getApi twice; seam=none; no_claim=the refresh cookie (global fetch is stubbed)
  it("shares one client so a second getApi caller waits for the in-flight refresh", async () => {
    setActivePinia(createPinia())
    let release: (response: Response) => void = () => undefined
    const gate = new Promise<Response>((resolve) => {
      release = resolve
    })
    const fetchFn = vi.fn(async (input: RequestInfo | URL) => {
      if (String(input).endsWith("/auth/refresh")) return gate
      return json(200, { ok: true })
    })
    vi.stubGlobal("fetch", fetchFn)
    try {
      const pending = getApi().refresh()
      let settled = false
      const waiting = getApi().whenSettled().then(() => {
        settled = true
      })
      await Promise.resolve()
      expect(settled).toBe(false)
      expect(fetchFn).toHaveBeenCalledTimes(1)
      release(json(200, { access_token: "restored", token_type: "bearer" }))
      await expect(pending).resolves.toBe("restored")
      await waiting
      expect(settled).toBe(true)
    } finally {
      vi.unstubAllGlobals()
    }
  })
})