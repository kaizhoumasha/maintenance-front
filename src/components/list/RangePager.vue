<script setup lang="ts">
import { ref, watch } from "vue"
import { applyDraft, nextWindow, previousWindow, type RowRange } from "@/components/list/range"

const props = defineProps<{ range: RowRange; total: number }>()
const emit = defineEmits<{ change: [range: RowRange] }>()
const start = ref(String(props.range.start))
const end = ref(String(props.range.end))

watch(
  () => props.range,
  (range) => {
    start.value = String(range.start)
    end.value = String(range.end)
  },
)

function commit() {
  const next = applyDraft(props.range, { start: start.value, end: end.value }, props.total)
  start.value = String(next.start)
  end.value = String(next.end)
  if (next.start !== props.range.start || next.end !== props.range.end) emit("change", next)
}
</script>

<template>
  <div class="flex items-center gap-2 text-sm">
    <input data-testid="range-start" v-model="start" class="w-14 border-b text-center" @blur="commit" @keydown.enter="commit" />
    <span>-</span>
    <input data-testid="range-end" v-model="end" class="w-14 border-b text-center" @blur="commit" @keydown.enter="commit" />
    <span>共 {{ total }} 条</span>
    <button type="button" data-testid="previous-window" :disabled="range.start <= 1" @click="emit('change', previousWindow(range))">上一窗</button>
    <button type="button" data-testid="next-window" :disabled="range.end >= total" @click="emit('change', nextWindow(range, total))">下一窗</button>
  </div>
</template>