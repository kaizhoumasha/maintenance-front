<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue"
import { RouterLink, RouterView, useRouter } from "vue-router"
import { HttpError } from "@/api/client"
import { getApi } from "@/app/api"
import { sidebarSections } from "@/app/sidebar"
import { handleUnauthorized } from "@/app/unauthorized"
import { useSessionStore } from "@/auth/session"

const session = useSessionStore()
const router = useRouter()
const notice = ref("")
const leaving = ref(false)

const sections = computed(() => {
  void router.currentRoute.value.fullPath
  return sidebarSections(router.getRoutes())
})

const ancestors = computed(() =>
  router.currentRoute.value.matched
    .filter((record) => record.name !== "Root" && typeof record.meta.title === "string")
    .map((record) => String(record.meta.title))
    .slice(0, -1),
)

function isCurrent(to: string) {
  const path = router.currentRoute.value.path
  return path === to || path.startsWith(`${to}/`)
}

function toggleSidebar() {
  session.sidebarCollapsed = !session.sidebarCollapsed
}

function collapseIfNarrow() {
  if (window.matchMedia("(max-width: 767px)").matches) session.sidebarCollapsed = true
}

onMounted(collapseIfNarrow)
watch(() => router.currentRoute.value.fullPath, collapseIfNarrow)

async function leave() {
  if (leaving.value) return
  leaving.value = true
  notice.value = ""
  try {
    if (session.getAccessToken()) {
      const api = getApi()
      try {
        await api.request("/api/v1/auth/logout", { method: "POST", skipRefresh: true })
      } catch (error) {
        if (!(error instanceof HttpError) || error.status !== 401) {
          notice.value = error instanceof HttpError ? error.message : "暂时不可用"
          return
        }
        try {
          await api.refresh()
          await api.request("/api/v1/auth/logout", { method: "POST", skipRefresh: true })
        } catch (retryError) {
          if (!(retryError instanceof HttpError) || retryError.status !== 401) {
            notice.value = retryError instanceof HttpError ? retryError.message : "暂时不可用"
            return
          }
          // 访问令牌和刷新凭证都已失效时，仍然清掉本机会话。
        }
      }
    }
    await handleUnauthorized()
  } finally {
    leaving.value = false
  }
}
</script>

<template>
  <div class="min-h-dvh bg-floor text-ink">
    <button
      v-if="!session.sidebarCollapsed"
      type="button"
      class="fixed inset-0 z-20 bg-black/60 md:hidden"
      aria-label="收起菜单"
      @click="session.sidebarCollapsed = true"
    ></button>
    <div class="flex min-h-dvh">
      <aside
        class="w-60 shrink-0 flex-col border-r border-rule bg-plate"
        :class="session.sidebarCollapsed ? 'hidden' : 'fixed inset-y-0 left-0 z-30 flex md:static'"
      >
        <div class="px-5 pt-6 pb-2">
          <p class="font-mono text-[11px] tracking-[0.22em] text-lane">WES</p>
          <p class="mt-1 text-base font-medium">仓库执行</p>
          <div class="mt-4 h-px w-8 bg-lane" aria-hidden="true"></div>
        </div>
        <nav class="flex-1 overflow-y-auto px-3 pt-4 pb-8" aria-label="菜单">
          <div v-for="(section, index) in sections" :key="index" class="mb-2">
            <p v-if="section.title" class="px-3 pt-4 pb-1 font-mono text-[11px] tracking-[0.12em] text-oxide">
              {{ section.title }}
            </p>
            <RouterLink
              v-for="item in section.items"
              :key="item.to"
              :to="item.to"
              class="relative block truncate py-2 pr-3 pl-4 text-sm transition-colors duration-150"
              :class="isCurrent(item.to) ? 'font-medium text-ink' : 'text-oxide hover:text-ink'"
              :aria-current="isCurrent(item.to) ? 'page' : undefined"
            >
              <span v-if="isCurrent(item.to)" class="absolute inset-y-1 left-0 w-[3px] bg-lane" aria-hidden="true"></span>
              {{ item.title }}
            </RouterLink>
          </div>
        </nav>
      </aside>

      <div class="flex min-w-0 flex-1 flex-col">
        <header class="flex h-14 items-center justify-between gap-3 border-b border-rule bg-plate px-4 md:px-6">
          <p class="truncate text-sm text-oxide">{{ ancestors.length ? ancestors.join(" / ") : "仓库执行" }}</p>
          <div class="flex shrink-0 items-center gap-1">
            <button type="button" class="px-2 py-1 text-sm text-oxide transition-colors duration-150 hover:text-ink" @click="toggleSidebar">
              {{ session.sidebarCollapsed ? "展开菜单" : "收起菜单" }}
            </button>
            <button type="button" class="px-2 py-1 text-sm text-ink disabled:text-oxide" :disabled="leaving" @click="leave">退出</button>
          </div>
        </header>
        <p v-if="notice" class="border-b border-rule px-4 py-2 text-sm text-alert md:px-6" role="alert">{{ notice }}</p>
        <main class="flex-1 px-4 py-6 md:px-8 md:py-8">
          <RouterView />
        </main>
      </div>
    </div>
  </div>
</template>
