import { describe, expect, it } from "vitest"
import { appName } from "@/app/ready"

describe("app", () => {
  it("names the admin frontend", () => {
    expect(appName).toBe("maintenance-front")
  })
})