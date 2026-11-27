import { describe, expect, it, vi } from "vitest"
import { submitLogin } from "@/auth/login"

describe("submitLogin", () => {
  it("stores the access token from a successful login", async () => {
    const request = vi.fn(async () => ({ access_token: "abc", token_type: "bearer" }))
    let token: string | null = null
    await submitLogin({ request: request as Parameters<typeof submitLogin>[0]["request"] }, { username: "admin", password: "secret" }, {
      getAccessToken: () => token,
      setAccessToken: (next) => {
        token = next
      },
    })
    expect(token).toBe("abc")
    expect(request).toHaveBeenCalledWith("/api/v1/auth/login", {
      method: "POST",
      skipRefresh: true,
      body: JSON.stringify({ username: "admin", password: "secret" }),
    })
  })

  it("waits for an in-flight refresh before sending the login", async () => {
    const order: string[] = []
    let release: () => void = () => undefined
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    const request = vi.fn(async () => {
      order.push("login")
      return { access_token: "abc", token_type: "bearer" }
    })
    const whenSettled = vi.fn(async () => {
      order.push("settled")
      await gate
    })
    let token: string | null = null
    const pending = submitLogin(
      { request: request as Parameters<typeof submitLogin>[0]["request"], whenSettled },
      { username: "admin", password: "secret" },
      {
        getAccessToken: () => token,
        setAccessToken: (next) => {
          token = next
        },
      },
    )
    await vi.waitFor(() => expect(order).toEqual(["settled"]))
    expect(request).not.toHaveBeenCalled()
    release()
    await pending
    expect(order).toEqual(["settled", "login"])
    expect(token).toBe("abc")
  })

  // Value: protects=a login body without a usable access_token is rejected and the previous token stays; fails_when=submitLogin writes pair.access_token even when it is missing or empty; why_new=login tests only return a string access_token; seam=none; no_claim=the auth endpoint (request is mocked)
  it("does not store a login response that has no usable access token", async () => {
    for (const body of [{ token_type: "bearer" }, { access_token: "" }, { access_token: null }, { access_token: 1 }]) {
      const request = vi.fn(async () => body)
      let token: string | null = "old"
      const sets: Array<string | null> = []
      await expect(
        submitLogin({ request: request as Parameters<typeof submitLogin>[0]["request"] }, { username: "admin", password: "secret" }, {
          getAccessToken: () => token,
          setAccessToken: (next) => {
            sets.push(next)
            token = next
          },
        }),
      ).rejects.toMatchObject({ message: "登录失败" })
      expect(sets).toEqual([])
      expect(token).toBe("old")
    }
  })
})