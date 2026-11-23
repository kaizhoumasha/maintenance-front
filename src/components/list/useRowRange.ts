import { computed } from "vue"
import { useRoute, useRouter } from "vue-router"
import { DEFAULT_RANGE, rangeFromQuery, type RowRange } from "@/components/list/range"

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

  return { range, replaceRange, resetRange }
}