import { describe, expect, it } from "vitest"
import {
  applyDraft,
  canRequest,
  clampEndToTotal,
  DEFAULT_RANGE,
  nextWindow,
  previousWindow,
  rangeFromQuery,
  retreatIfPageEmpty,
} from "@/components/list/range"

describe("row range", () => {
  it("defaults to rows 1 through 20", () => {
    expect(DEFAULT_RANGE).toEqual({ start: 1, end: 20 })
    expect(rangeFromQuery({})).toEqual(DEFAULT_RANGE)
  })

  it("keeps a typed window and rejects an invalid draft", () => {
    expect(applyDraft(DEFAULT_RANGE, { start: "15", end: "30" }, 128)).toEqual({
      start: 15,
      end: 30,
    })
    expect(applyDraft(DEFAULT_RANGE, { start: "30", end: "15" }, 128)).toEqual(DEFAULT_RANGE)
    expect(applyDraft(DEFAULT_RANGE, { start: "", end: "20" }, 128)).toEqual(DEFAULT_RANGE)
    expect(applyDraft(DEFAULT_RANGE, { start: "1", end: "101" }, 500)).toEqual(DEFAULT_RANGE)
    expect(applyDraft(DEFAULT_RANGE, { start: "1", end: "120" }, 45)).toEqual(DEFAULT_RANGE)
  })

  it("moves by the current window and shortens at the edges", () => {
    expect(previousWindow({ start: 21, end: 40 })).toEqual({ start: 1, end: 20 })
    expect(previousWindow({ start: 11, end: 20 })).toEqual({ start: 1, end: 10 })
    expect(nextWindow({ start: 1, end: 20 }, 45)).toEqual({ start: 21, end: 40 })
    expect(nextWindow({ start: 21, end: 40 }, 45)).toEqual({ start: 41, end: 45 })
    expect(nextWindow({ start: 1, end: 20 }, 20)).toEqual({ start: 1, end: 20 })
  })

  it("clamps a shrunken total and retreats when the current window is empty", () => {
    expect(clampEndToTotal({ start: 21, end: 40 }, 25)).toEqual({ start: 21, end: 25 })
    expect(retreatIfPageEmpty({ start: 21, end: 40 }, 0)).toEqual({ start: 1, end: 20 })
    expect(retreatIfPageEmpty({ start: 1, end: 20 }, 0)).toEqual({ start: 1, end: 20 })
  })

  it("refuses an offset past 100000", () => {
    expect(canRequest({ start: 100001, end: 100020 })).toBe(true)
    expect(canRequest({ start: 100002, end: 100021 })).toBe(false)
    expect(canRequest({ start: 99991, end: 100010 })).toBe(true)
  })
})