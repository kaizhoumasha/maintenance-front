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
})