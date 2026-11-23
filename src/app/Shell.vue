<script setup lang="ts">
import { computed } from "vue"
import { RouterLink, RouterView, useRouter } from "vue-router"
import { useSessionStore } from "@/auth/session"

const session = useSessionStore()
const router = useRouter()
const links = computed(() =>
  router.getRoutes().filter((route) => route.meta.hidden !== true && route.path !== "/login" && !String(route.path).includes(":")),
)
</script>

<template>
  <div class="flex min-h-screen">
    <aside class="w-56 border-r p-3" :class="session.sidebarCollapsed ? 'hidden' : ''">
      <RouterLink v-for="link in links" :key="link.name" :to="link.path" class="block py-1">
        {{ link.meta.title }}
      </RouterLink>
    </aside>
    <main class="flex-1 p-6">
      <RouterView />
    </main>
  </div>
</template>
