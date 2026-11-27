import { computed, watch } from "vue"
import { useRoute, useRouter } from "vue-router"
import { DEFAULT_RANGE, rangeFromQuery, type RowRange } from "@/components/list/range"

function filterKey(value: unknown): string {
  if (Array.isArray(value)) return value.map((item) => (item == null ? "" : String(item))).join("\u0000")
  if (value == null) return ""
  return String(value)
}

export function useRowRange() {
  const route = useRoute()
  const router = useRouter()
  const range = computed(() => rangeFromQuery(route.query))

  function replaceRange(next: RowRange) {
    return router.replace({ query: { ...route.query, start: String(next.start), end: String(next.end) } })
  }

  function resetRange() {
    return replaceRange(DEFAULT_RANGE)
  }

  watch(
    () => filterKey(route.query.filter),
    () => {
      const start = String(DEFAULT_RANGE.start)
      const end = String(DEFAULT_RANGE.end)
      if (route.query.start === start && route.query.end === end) return
      void replaceRange(DEFAULT_RANGE)
    },
  )

  return { range, replaceRange, resetRange }
}