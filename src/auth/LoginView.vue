<script setup lang="ts">
import { ref } from "vue"
import { useRouter } from "vue-router"
import { HttpError } from "@/api/client"
import { getApi } from "@/app/api"
import { submitLogin } from "@/auth/login"
import { useSessionStore } from "@/auth/session"

const router = useRouter()
const session = useSessionStore()
const username = ref("")
const password = ref("")
const message = ref("")
const pending = ref(false)

async function onSubmit() {
  if (pending.value) return
  pending.value = true
  message.value = ""
  try {
    await submitLogin(getApi(), { username: username.value, password: password.value }, session)
    await router.push("/")
    if (router.currentRoute.value.path === "/login") message.value = "暂时无法进入系统"
  } catch (error) {
    message.value = error instanceof HttpError ? error.message : "登录失败"
  } finally {
    pending.value = false
  }
}
</script>

<template>
  <div class="control-grid min-h-dvh text-ink">
    <div class="mx-auto flex min-h-dvh w-full max-w-6xl flex-col justify-center px-6 py-14 md:px-12">
      <p class="font-mono text-[11px] tracking-[0.22em] text-lane">WES</p>
      <h1 class="wordmark mt-3">仓库执行</h1>
      <p class="mt-4 max-w-xl text-base leading-relaxed text-oxide">为仓库提供自动化执行。在这里配置工作线、设备归属，以及谁能操作。</p>
      <div class="scan-line mt-8" aria-hidden="true"></div>

      <form class="mt-10 w-full max-w-sm border border-rule bg-plate px-7 py-8" @submit.prevent="onSubmit">
        <h2 class="text-lg font-medium">登录</h2>
        <p class="mt-2 text-sm leading-relaxed text-oxide">使用后台账号进入。关闭页面不会结束登录，退出才会。</p>

        <label class="mt-8 block font-mono text-[11px] tracking-[0.14em] text-oxide">
          账号
          <input v-model="username" name="username" autocomplete="username" spellcheck="false" class="plate-field" />
        </label>
        <label class="mt-6 block font-mono text-[11px] tracking-[0.14em] text-oxide">
          口令
          <input v-model="password" name="password" type="password" autocomplete="current-password" class="plate-field" />
        </label>

        <button
          type="submit"
          class="mt-8 w-full bg-ink py-3 text-sm text-floor transition-colors duration-150 hover:bg-white disabled:opacity-50"
          :disabled="pending"
        >
          登录
        </button>
        <p class="mt-4 min-h-5 text-sm text-alert" role="alert">{{ message }}</p>
      </form>
    </div>
  </div>
</template>
