export interface RowRange {
  start: number
  end: number
}

export const DEFAULT_RANGE: RowRange = { start: 1, end: 20 }
export const MAX_WINDOW = 100
export const MAX_OFFSET = 100_000

function integers(range: RowRange): boolean {
  return Number.isInteger(range.start) && Number.isInteger(range.end)
}

export function windowLength(range: RowRange): number {
  return range.end - range.start + 1
}

export function canRequest(range: RowRange): boolean {
  const length = windowLength(range)
  return integers(range) && range.start >= 1 && length >= 1 && length <= MAX_WINDOW && range.start - 1 <= MAX_OFFSET
}

function parseDraft(value: string): number | null {
  if (value.trim() === "") return null
  const parsed = Number(value)
  return Number.isInteger(parsed) ? parsed : null
}

export function applyDraft(current: RowRange, draft: { start: string; end: string }, total: number): RowRange {
  const start = parseDraft(draft.start)
  const end = parseDraft(draft.end)
  if (start === null || end === null || start > end) return current
  if (!canRequest({ start, end })) return current
  let next = { start, end }
  if (total >= 1 && next.end > total) next = { ...next, end: total }
  if (total >= 1 && next.start > total) next = { ...next, start: total }
  if (next.end < next.start) return current
  return canRequest(next) ? next : current
}

export function previousWindow(range: RowRange): RowRange {
  if (range.start === 1) return range
  const length = windowLength(range)
  if (range.start <= length) return { start: 1, end: range.start - 1 }
  return { start: range.start - length, end: range.end - length }
}

export function nextWindow(range: RowRange, total: number): RowRange {
  if (range.end >= total) return range
  const length = windowLength(range)
  if (total - range.end < length) return { start: range.end + 1, end: total }
  return { start: range.start + length, end: range.end + length }
}

export function clampEndToTotal(range: RowRange, total: number): RowRange {
  if (total < 1 || range.end <= total) return range
  const next = { start: range.start, end: total }
  return next.end >= next.start && canRequest(next) ? next : range
}

export function retreatIfPageEmpty(range: RowRange, itemCount: number): RowRange {
  if (itemCount > 0 || range.start === 1) return range
  return previousWindow(range)
}

export function rangeFromQuery(query: Record<string, unknown>): RowRange {
  const start = Number(query.start ?? DEFAULT_RANGE.start)
  const end = Number(query.end ?? DEFAULT_RANGE.end)
  const range = { start, end }
  return canRequest(range) ? range : DEFAULT_RANGE
}