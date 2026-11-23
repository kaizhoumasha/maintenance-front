<script setup lang="ts">
import { ref } from "vue"
import { useRouter } from "vue-router"
import { getApi } from "@/app/api"
import { HttpError } from "@/api/client"
import { submitLogin } from "@/auth/login"
import { useSessionStore } from "@/auth/session"

const router = useRouter()
const session = useSessionStore()
const username = ref("")
const password = ref("")
const message = ref("")

async function onSubmit() {
  message.value = ""
  try {
    await submitLogin(getApi(), { username: username.value, password: password.value }, session)
    await router.push("/")
  } catch (error) {
    message.value = error instanceof HttpError ? error.message : "登录失败"
  }
}
</script>

<template>
  <form class="mx-auto mt-24 flex w-80 flex-col gap-3" @submit.prevent="onSubmit">
    <h1 class="text-xl">登录</h1>
    <input v-model="username" name="username" autocomplete="username" class="border px-2 py-1" />
    <input v-model="password" name="password" type="password" autocomplete="current-password" class="border px-2 py-1" />
    <button type="submit" class="border px-2 py-1">登录</button>
    <p v-if="message">{{ message }}</p>
  </form>
</template>
