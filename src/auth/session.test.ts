import { createPinia, setActivePinia } from "pinia"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { onAccessTokenIdentityChange, useSessionStore } from "@/auth/session"

describe("setAccessToken", () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  // Value: protects=setting the same access token does not clear permissions or emit an identity change; fails_when=the equality guard is removed and a repeat write wipes menus; why_new=router coverage only switches to a different token; seam=none; no_claim=no caller currently repeats the same token
  it("does not clear permissions or emit an identity change when the token is unchanged", () => {
    const session = useSessionStore()
    session.setAccessToken("same")
    session.setPermissions(["asset:read"])
    const onChange = vi.fn()
    onAccessTokenIdentityChange(onChange)
    session.setAccessToken("same")
    expect(session.getAccessToken()).toBe("same")
    expect(session.permissions).toEqual(["asset:read"])
    expect(onChange).not.toHaveBeenCalled()
    session.setAccessToken("other")
    expect(session.permissions).toEqual([])
    expect(onChange).toHaveBeenCalledTimes(1)
  })
})
