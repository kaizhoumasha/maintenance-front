import { describe, expect, it } from "vitest"
import { accessTokenSubject, sameAccessTokenSubject } from "@/auth/tokenSubject"

function unsignedAccessToken(payload: object): string {
  const encode = (value: object) =>
    btoa(JSON.stringify(value)).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "")
  return `${encode({ alg: "none", typ: "JWT" })}.${encode(payload)}.signature`
}

describe("accessTokenSubject", () => {
  it("reads the subject and ignores the signature", () => {
    const token = unsignedAccessToken({ sub: "user-a", sv: 2 })
    expect(accessTokenSubject(token)).toBe("user-a")
    expect(sameAccessTokenSubject(token, unsignedAccessToken({ sub: "user-a" }))).toBe(true)
    expect(sameAccessTokenSubject(token, unsignedAccessToken({ sub: "user-b" }))).toBe(false)
  })

  it("returns null when the subject is missing or the payload is not a token", () => {
    expect(accessTokenSubject(unsignedAccessToken({ sub: "" }))).toBeNull()
    expect(accessTokenSubject(unsignedAccessToken({ sub: 7 }))).toBeNull()
    expect(accessTokenSubject("not-a-jwt")).toBeNull()
    expect(accessTokenSubject("aaa.%%% .bbb")).toBeNull()
    expect(sameAccessTokenSubject("not-a-jwt", "not-a-jwt")).toBe(false)
  })
})