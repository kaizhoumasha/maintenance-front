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
    expect(previousWindow({ start: 5, end: 20 })).toEqual({ start: 1, end: 4 })
    expect(previousWindow({ start: 1, end: 20 })).toEqual({ start: 1, end: 20 })
    expect(nextWindow({ start: 1, end: 20 }, 45)).toEqual({ start: 21, end: 40 })
    expect(nextWindow({ start: 21, end: 40 }, 45)).toEqual({ start: 41, end: 45 })
    expect(nextWindow({ start: 1, end: 20 }, 20)).toEqual({ start: 1, end: 20 })
  })

  it("clamps a shrunken total and retreats when the current window is empty", () => {
    expect(clampEndToTotal({ start: 21, end: 40 }, 25)).toEqual({ start: 21, end: 25 })
    expect(retreatIfPageEmpty({ start: 21, end: 40 }, 0)).toEqual({ start: 1, end: 20 })
    expect(retreatIfPageEmpty({ start: 1, end: 20 }, 0)).toEqual({ start: 1, end: 20 })
  })

  // Value: protects=a window that still has rows is not moved backward; fails_when=retreatIfPageEmpty ignores itemCount and always calls previousWindow; why_new=the retreat assertions only pass an empty item count; seam=none; no_claim=the list request (pure function)
  it("keeps the window when the current page still has rows", () => {
    expect(retreatIfPageEmpty({ start: 21, end: 40 }, 3)).toEqual({ start: 21, end: 40 })
  })

  it("refuses an offset past 100000", () => {
    expect(canRequest({ start: 100001, end: 100020 })).toBe(true)
    expect(canRequest({ start: 100002, end: 100021 })).toBe(false)
    expect(canRequest({ start: 99991, end: 100010 })).toBe(true)
  })

  // Value: protects=rangeFromQuery uses the default window when the query is not requestable, and fills a missing side from rows 1 through 20; fails_when=the canRequest fallback or the default fill is removed; why_new=the existing default test only passes an empty query; seam=none; no_claim=the browser address bar (pure function of the query object)
  it("falls back when the query is not a requestable window", () => {
    expect(rangeFromQuery({ start: "abc", end: "10" })).toEqual(DEFAULT_RANGE)
    expect(rangeFromQuery({ start: "30", end: "10" })).toEqual(DEFAULT_RANGE)
    expect(rangeFromQuery({ start: "1", end: "101" })).toEqual(DEFAULT_RANGE)
    expect(rangeFromQuery({ start: "100002", end: "100021" })).toEqual(DEFAULT_RANGE)
    expect(rangeFromQuery({ start: "5" })).toEqual({ start: 5, end: 20 })
    expect(rangeFromQuery({ end: "10" })).toEqual({ start: 1, end: 10 })
  })

  // Value: protects=a legal draft whose end or start passes total is shortened to total; fails_when=the total clamp is removed and the oversize end is kept; why_new=the invalid-draft test uses a window longer than 100, which fails before the clamp; seam=none; no_claim=pager input wiring
  it("shortens a legal draft whose end or start passes the total", () => {
    expect(applyDraft({ start: 1, end: 20 }, { start: "1", end: "30" }, 25)).toEqual({ start: 1, end: 25 })
    expect(applyDraft({ start: 1, end: 20 }, { start: "30", end: "40" }, 25)).toEqual({ start: 25, end: 25 })
  })
})