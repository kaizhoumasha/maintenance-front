<script setup lang="ts">
import RangePager from "@/components/list/RangePager.vue"
import { useRowRange } from "@/components/list/useRowRange"

const { range, replaceRange } = useRowRange()
</script>

<template>
  <section>
    <h1>审计日志</h1>
    <RangePager :range="range" :total="0" @change="replaceRange" />
  </section>
</template>