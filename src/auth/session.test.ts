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

  // Value: protects=empty reset does not emit or bump epoch, and still clears leftover permissions; fails_when=empty reset notifies listeners, or permissions remain after reset; why_new=existing resets run only while an access token is set; seam=none; no_claim=menu removal (local listener spy)
  it("does not emit an identity change when the session is already empty", () => {
    const session = useSessionStore()
    const onChange = vi.fn()
    onAccessTokenIdentityChange(onChange)
    const epoch = session.getEpoch()
    session.reset()
    expect(session.getAccessToken()).toBeNull()
    expect(session.permissions).toEqual([])
    expect(session.getEpoch()).toBe(epoch)
    expect(onChange).not.toHaveBeenCalled()

    session.setPermissions(["asset:read"])
    session.reset()
    expect(session.permissions).toEqual([])
    expect(session.getAccessToken()).toBeNull()
    expect(session.getEpoch()).toBe(epoch + 1)
    expect(onChange).toHaveBeenCalledTimes(1)
  })
})
