<script setup lang="ts">
import { computed } from "vue"
import { navigationNotice, navigationNoticeText } from "@/app/navigationNotice"

const text = computed(() => (navigationNotice.value ? navigationNoticeText(navigationNotice.value) : ""))
</script>

<template>
  <p v-if="navigationNotice" class="border-b border-rule bg-plate px-4 py-3 text-sm text-alert" role="alert">{{ text }}</p>
</template>
