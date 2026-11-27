# 管理端前端基础 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 搭好能登录、按后端菜单打开页面、并用 `start` / `end` 行号窗口翻页的管理端壳。

**Architecture:** Vite 应用从 `src/app/main.ts` 启动。Pinia 只保存访问令牌、权限码和侧栏状态。TanStack Query 保存服务端数据。菜单响应编译成 Vue Router 路由，`component` 字符串对应 `src/views`。行号窗口是纯函数，分页组件和地址栏都调用它。

**Tech Stack:** pnpm、Vue 3、Vite、TypeScript、Vue Router 5、Tailwind CSS v4、shadcn-vue 的 `cn` 与 `components.json`、Pinia、TanStack Query、Vitest、happy-dom。

## Global Constraints

- 包管理使用 pnpm。应用独立，不并入 `wes_frontend`。
- 访问令牌只放内存。刷新令牌使用后端 HttpOnly cookie。
- 开发时 Vite 把 `/api` 代理到 `http://127.0.0.1:8000`。生产与接口同域。
- 列表查询使用 `start` 和 `end`。默认 `1` 和 `20`。窗口长度 1–100。偏移 `start - 1` 不超过 100000。
- 前端不发送 `page`、`page_size`、`limit`、`cursor`。
- 错误体为 `trace_id`、`code`、`message`、`detail`。页面展示 `message`。
- `401` 时用刷新 cookie 换一次令牌并重试原请求。同一时刻只刷新一次。刷新失败清空会话并进入登录页。
- 登录请求本身返回 `401` 时不尝试刷新。
- 退出时先 `whenSettled()` 等待进行中的刷新。仅当仍是同一账号（JWT `sub`）时才 `POST /api/v1/auth/logout`；刷新期间账号已变时只清本地会话。
- `component` 为 `Layout` 的菜单节点是目录。其余字符串对应 `src/views/`。找不到组件时显示「页面未实现」。`meta.hidden` 的路由仍注册。
- 本计划不实现工作线、设备、用户、角色、权限、菜单编辑和审计的业务表单。这些页面先显示标题，后续计划替换。

本计划覆盖规格第 3、4、5、8 节，以及第 7 节的客户端 `401` 行为。第 6 节页面行为按下面的顺序另写计划：

1. `docs/superpowers/plans/2026-11-21-maintenance-front-workline.md`
2. `docs/superpowers/plans/2026-11-21-maintenance-front-device.md`
3. `docs/superpowers/plans/2026-11-21-maintenance-front-system.md`
4. `docs/superpowers/plans/2026-11-21-maintenance-front-audit.md`

---

## 文件结构

- `package.json`、`vite.config.ts`、`tsconfig.json`、`index.html`：工程与测试入口。
- `src/style.css`、`components.json`、`src/lib/utils.ts`：Tailwind 与后续 shadcn 组件的约定。
- `src/components/list/range.ts`：行号窗口纯函数。
- `src/components/list/RangePager.vue`：底栏。
- `src/api/types.ts`、`src/api/client.ts`：错误类型与带刷新的请求。
- `src/auth/session.ts`：Pinia 会话。
- `src/auth/LoginView.vue`：登录页。
- `src/menus/types.ts`、`src/menus/compile.ts`、`src/menus/views.ts`：菜单到路由。
- `src/app/Shell.vue`、`src/app/router.ts`、`src/app/main.ts`：布局、守卫和启动。
- `src/views/**`：八个已知页面的标题占位。
- `src/app/MissingView.vue`：未知组件。

### Task 1: 工程骨架

**Files:**
- Create: `package.json`
- Create: `vite.config.ts`
- Create: `tsconfig.json`
- Create: `tsconfig.node.json`
- Create: `index.html`
- Create: `src/style.css`
- Create: `src/env.d.ts`
- Create: `components.json`
- Create: `src/lib/utils.ts`
- Create: `src/app/ready.ts`
- Test: `src/app/ready.test.ts`

**Interfaces:**
- Consumes: 无
- Produces: `export const appName = "maintenance-front"`。`cn(...inputs: ClassValue[]): string`。

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from "vitest"
import { appName } from "@/app/ready"

describe("app", () => {
  it("names the admin frontend", () => {
    expect(appName).toBe("maintenance-front")
  })
})
```

- [ ] **Step 2: Add the project files and install**

`package.json`:

```json
{
  "name": "maintenance-front",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "vue-tsc --noEmit && vite build",
    "test": "vitest run"
  },
  "dependencies": {
    "@tanstack/vue-query": "^5.90.0",
    "clsx": "^2.1.1",
    "pinia": "^3.0.4",
    "tailwind-merge": "^3.4.0",
    "vue": "^3.5.29",
    "vue-router": "^5.0.3"
  },
  "devDependencies": {
    "@tailwindcss/vite": "^4.2.2",
    "@types/node": "^24.10.0",
    "@vitejs/plugin-vue": "^6.0.4",
    "@vue/test-utils": "^2.4.6",
    "@vue/tsconfig": "^0.8.1",
    "happy-dom": "^20.0.0",
    "tailwindcss": "^4.2.2",
    "typescript": "^5.9.3",
    "vite": "^7.3.1",
    "vitest": "^3.2.4",
    "vue-tsc": "^3.1.5"
  }
}
```

`vite.config.ts`:

```ts
import { fileURLToPath, URL } from "node:url"
import tailwindcss from "@tailwindcss/vite"
import vue from "@vitejs/plugin-vue"
import { defineConfig } from "vitest/config"

export default defineConfig({
  plugins: [vue(), tailwindcss()],
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  server: { proxy: { "/api": "http://127.0.0.1:8000" } },
  test: { environment: "happy-dom", include: ["src/**/*.test.ts"] },
})
```

`tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "jsx": "preserve",
    "noEmit": true,
    "isolatedModules": true,
    "skipLibCheck": true,
    "useDefineForClassFields": true,
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "types": ["node"],
    "paths": { "@/*": ["./src/*"] }
  },
  "include": ["src/**/*.ts", "src/**/*.vue", "vite.config.ts"]
}
```

`tsconfig.node.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "noEmit": true,
    "types": ["node"]
  },
  "include": ["vite.config.ts"]
}
```

`index.html`:

```html
<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>维护管理</title>
  </head>
  <body>
    <div id="app"></div>
    <script type="module" src="/src/app/main.ts"></script>
  </body>
</html>
```

`src/style.css`:

```css
@import "tailwindcss";
```

`src/env.d.ts`:

```ts
/// <reference types="vite/client" />
```

`components.json`:

```json
{
  "$schema": "https://shadcn-vue.com/schema.json",
  "style": "new-york",
  "typescript": true,
  "tailwind": {
    "css": "src/style.css",
    "baseColor": "zinc",
    "cssVariables": true
  },
  "aliases": {
    "components": "@/components",
    "utils": "@/lib/utils",
    "ui": "@/components/ui"
  },
  "iconLibrary": "lucide"
}
```

`src/lib/utils.ts`:

```ts
import { type ClassValue, clsx } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}
```

Run: `pnpm install`

- [ ] **Step 3: Run test to verify it fails**

Run: `pnpm test src/app/ready.test.ts`

Expected: FAIL because `@/app/ready` cannot be resolved.

- [ ] **Step 4: Write the app name**

`src/app/ready.ts`:

```ts
export const appName = "maintenance-front"
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm test src/app/ready.test.ts`

Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add package.json pnpm-lock.yaml vite.config.ts tsconfig.json tsconfig.node.json index.html src/style.css src/env.d.ts components.json src/lib/utils.ts src/app/ready.ts src/app/ready.test.ts
git commit -m "$(cat <<'EOF'
build: 建立 Vue 管理端工程骨架

EOF
)"
```

### Task 2: 行号窗口

**Files:**
- Create: `src/components/list/range.ts`
- Test: `src/components/list/range.test.ts`

**Interfaces:**
- Consumes: 无
- Produces:
  - `export interface RowRange { start: number; end: number }`
  - `export const DEFAULT_RANGE: RowRange`
  - `export function canRequest(range: RowRange): boolean`
  - `export function applyDraft(current: RowRange, draft: { start: string; end: string }, total: number): RowRange`
  - `export function previousWindow(range: RowRange): RowRange`
  - `export function nextWindow(range: RowRange, total: number): RowRange`
  - `export function clampEndToTotal(range: RowRange, total: number): RowRange`
  - `export function retreatIfPageEmpty(range: RowRange, itemCount: number): RowRange`
  - `export function rangeFromQuery(query: Record<string, unknown>): RowRange`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from "vitest"
import {
  applyDraft,
  canRequest,
  clampEndToTotal,
  DEFAULT_RANGE,
  nextWindow,
  previousWindow,
  rangeFromQuery,
  retreatIfPageEmpty,
} from "@/components/list/range"

describe("row range", () => {
  it("defaults to rows 1 through 20", () => {
    expect(DEFAULT_RANGE).toEqual({ start: 1, end: 20 })
    expect(rangeFromQuery({})).toEqual(DEFAULT_RANGE)
  })

  it("keeps a typed window and rejects an invalid draft", () => {
    expect(applyDraft(DEFAULT_RANGE, { start: "15", end: "30" }, 128)).toEqual({
      start: 15,
      end: 30,
    })
    expect(applyDraft(DEFAULT_RANGE, { start: "30", end: "15" }, 128)).toEqual(DEFAULT_RANGE)
    expect(applyDraft(DEFAULT_RANGE, { start: "", end: "20" }, 128)).toEqual(DEFAULT_RANGE)
    expect(applyDraft(DEFAULT_RANGE, { start: "1", end: "101" }, 500)).toEqual(DEFAULT_RANGE)
  })

  it("moves by the current window and shortens at the edges", () => {
    expect(previousWindow({ start: 21, end: 40 })).toEqual({ start: 1, end: 20 })
    expect(previousWindow({ start: 11, end: 20 })).toEqual({ start: 1, end: 10 })
    expect(nextWindow({ start: 1, end: 20 }, 45)).toEqual({ start: 21, end: 40 })
    expect(nextWindow({ start: 21, end: 40 }, 45)).toEqual({ start: 41, end: 45 })
    expect(nextWindow({ start: 1, end: 20 }, 20)).toEqual({ start: 1, end: 20 })
  })

  it("clamps a shrunken total and retreats when the current window is empty", () => {
    expect(clampEndToTotal({ start: 21, end: 40 }, 25)).toEqual({ start: 21, end: 25 })
    expect(retreatIfPageEmpty({ start: 21, end: 40 }, 0)).toEqual({ start: 1, end: 20 })
    expect(retreatIfPageEmpty({ start: 1, end: 20 }, 0)).toEqual({ start: 1, end: 20 })
  })

  it("refuses an offset past 100000", () => {
    expect(canRequest({ start: 100001, end: 100020 })).toBe(false)
    expect(canRequest({ start: 99991, end: 100010 })).toBe(true)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test src/components/list/range.test.ts`

Expected: FAIL because the module does not exist.

- [ ] **Step 3: Write the range functions**

`src/components/list/range.ts`:

```ts
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test src/components/list/range.test.ts`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/components/list/range.ts src/components/list/range.test.ts
git commit -m "$(cat <<'EOF'
feat: 用起止行号计算列表窗口

EOF
)"
```

### Task 3: 分页底栏

**Files:**
- Create: `src/components/list/RangePager.vue`
- Test: `src/components/list/RangePager.test.ts`

**Interfaces:**
- Consumes: `RowRange`、`applyDraft`、`nextWindow`、`previousWindow`
- Produces: 组件 `RangePager`，props 为 `range: RowRange` 和 `total: number`，emit 为 `change: [range: RowRange]`

- [ ] **Step 1: Write the failing test**

```ts
import { mount } from "@vue/test-utils"
import { describe, expect, it } from "vitest"
import RangePager from "@/components/list/RangePager.vue"

describe("RangePager", () => {
  it("emits the next window and ignores an oversized draft", async () => {
    const wrapper = mount(RangePager, { props: { range: { start: 1, end: 20 }, total: 45 } })
    await wrapper.get("[data-testid=next-window]").trigger("click")
    expect(wrapper.emitted("change")?.[0]).toEqual([{ start: 21, end: 40 }])

    await wrapper.get("[data-testid=range-end]").setValue("120")
    await wrapper.get("[data-testid=range-end]").trigger("blur")
    expect(wrapper.emitted("change")).toHaveLength(1)
    expect(wrapper.text()).toContain("共 45 条")
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test src/components/list/RangePager.test.ts`

Expected: FAIL because `RangePager.vue` does not exist.

- [ ] **Step 3: Write the pager**

`src/components/list/RangePager.vue`:

```vue
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test src/components/list/RangePager.test.ts`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/components/list/RangePager.vue src/components/list/RangePager.test.ts
git commit -m "$(cat <<'EOF'
feat: 显示可编辑的起止行分页栏

EOF
)"
```

### Task 4: 接口客户端

**Files:**
- Create: `src/api/types.ts`
- Create: `src/api/client.ts`
- Test: `src/api/client.test.ts`

**Interfaces:**
- Consumes: 无
- Produces:
  - `export interface ErrorBody { trace_id: string; code: string; message: string; detail: string | null }`
  - `export class HttpError extends Error { readonly status: number; readonly body: ErrorBody; readonly retryAfter: string | null }`
  - `export interface TokenSource { getAccessToken(): string | null; setAccessToken(token: string | null): void }`
  - `export function createApiClient(options: { fetchFn?: typeof fetch; token: TokenSource }): { request<T>(path: string, init?: RequestInit & { skipRefresh?: boolean }): Promise<T> }`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it, vi } from "vitest"
import { createApiClient, HttpError, type TokenSource } from "@/api/client"

function source(token: string | null = "old"): TokenSource {
  let current = token
  return {
    getAccessToken: () => current,
    setAccessToken: (next) => {
      current = next
    },
  }
}

function json(status: number, body: unknown, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", ...headers } })
}

describe("api client", () => {
  it("sends the bearer token and refreshes once after 401", async () => {
    const token = source()
    const fetchFn = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      if (url.endsWith("/auth/refresh")) return json(200, { access_token: "new", token_type: "bearer" })
      const header = new Headers(init?.headers).get("authorization")
      if (header === "Bearer old") return json(401, { trace_id: "t", code: "UNAUTHORIZED", message: "未登录", detail: null })
      return json(200, { ok: true })
    })
    const client = createApiClient({ fetchFn, token })
    await expect(client.request<{ ok: boolean }>("/api/v1/users")).resolves.toEqual({ ok: true })
    expect(token.getAccessToken()).toBe("new")
    expect(fetchFn).toHaveBeenCalledTimes(3)
  })

  it("does not refresh a login failure", async () => {
    const fetchFn = vi.fn(async () => json(401, { trace_id: "t", code: "UNAUTHORIZED", message: "用户名或密码错误", detail: null }))
    const client = createApiClient({ fetchFn, token: source(null) })
    await expect(client.request("/api/v1/auth/login", { method: "POST", skipRefresh: true })).rejects.toBeInstanceOf(HttpError)
    expect(fetchFn).toHaveBeenCalledTimes(1)
  })

  it("shares one refresh between concurrent requests", async () => {
    let refreshed = 0
    const token = source()
    const fetchFn = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      if (url.endsWith("/auth/refresh")) {
        refreshed += 1
        return json(200, { access_token: "new", token_type: "bearer" })
      }
      const header = new Headers(init?.headers).get("authorization")
      if (header === "Bearer old") return json(401, { trace_id: "t", code: "UNAUTHORIZED", message: "未登录", detail: null })
      return json(200, { ok: url })
    })
    const client = createApiClient({ fetchFn, token })
    await Promise.all([client.request("/api/v1/users"), client.request("/api/v1/work-lines")])
    expect(refreshed).toBe(1)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test src/api/client.test.ts`

Expected: FAIL because `@/api/client` does not exist.

- [ ] **Step 3: Write the client**

`src/api/types.ts`:

```ts
export interface ErrorBody {
  trace_id: string
  code: string
  message: string
  detail: string | null
}

export interface TokenPair {
  access_token: string
  token_type: string
}
```

`src/api/client.ts`:

```ts
import type { ErrorBody, TokenPair } from "@/api/types"

export type { ErrorBody }

export class HttpError extends Error {
  constructor(
    readonly status: number,
    readonly body: ErrorBody,
    readonly retryAfter: string | null,
  ) {
    super(body.message)
  }
}

export interface TokenSource {
  getAccessToken(): string | null
  setAccessToken(token: string | null): void
}

type RequestOptions = RequestInit & { skipRefresh?: boolean }

const REFRESH_PATH = "/api/v1/auth/refresh"

async function readError(response: Response): Promise<HttpError> {
  const body = (await response.json()) as ErrorBody
  return new HttpError(response.status, body, response.headers.get("retry-after"))
}

export function createApiClient(options: { fetchFn?: typeof fetch; token: TokenSource }) {
  const fetchFn = options.fetchFn ?? fetch
  let refreshing: Promise<string> | null = null

  async function refresh(): Promise<string> {
    if (refreshing) return refreshing
    refreshing = (async () => {
      const response = await fetchFn(REFRESH_PATH, { method: "POST", credentials: "include" })
      if (!response.ok) {
        options.token.setAccessToken(null)
        throw await readError(response)
      }
      const pair = (await response.json()) as TokenPair
      options.token.setAccessToken(pair.access_token)
      return pair.access_token
    })().finally(() => {
      refreshing = null
    })
    return refreshing
  }

  async function request<T>(path: string, init: RequestOptions = {}): Promise<T> {
    const { skipRefresh = false, headers, ...rest } = init
    const send = (token: string | null) =>
      fetchFn(path, {
        ...rest,
        credentials: "include",
        headers: {
          ...(rest.body ? { "content-type": "application/json" } : {}),
          ...(token ? { authorization: `Bearer ${token}` } : {}),
          ...headers,
        },
      })

    let response = await send(options.token.getAccessToken())
    if (response.status === 401 && !skipRefresh && options.token.getAccessToken()) {
      await refresh()
      response = await send(options.token.getAccessToken())
    }
    if (!response.ok) throw await readError(response)
    if (response.status === 204) return undefined as T
    return (await response.json()) as T
  }

  return { request, refresh }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test src/api/client.test.ts`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/api/types.ts src/api/client.ts src/api/client.test.ts
git commit -m "$(cat <<'EOF'
feat: 在 401 时用刷新 cookie 重试一次请求

EOF
)"
```

### Task 5: 会话与登录

**Files:**
- Create: `src/auth/session.ts`
- Create: `src/auth/login.ts`
- Test: `src/auth/login.test.ts`

**Interfaces:**
- Consumes: `createApiClient`、`TokenSource`
- Produces:
  - `export const useSessionStore: Store`，方法 `getAccessToken(): string | null`、`setAccessToken(token: string | null): void`、`setPermissions(codes: string[]): void`、`hasPermission(code: string): boolean`、`reset(): void`，状态 `sidebarCollapsed: boolean`
  - `export async function submitLogin(client: { request<T>(path: string, init?: RequestInit & { skipRefresh?: boolean }): Promise<T> }, input: { username: string; password: string }, session: TokenSource): Promise<void>`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it, vi } from "vitest"
import { submitLogin } from "@/auth/login"

describe("submitLogin", () => {
  it("stores the access token from a successful login", async () => {
    const request = vi.fn(async () => ({ access_token: "abc", token_type: "bearer" }))
    let token: string | null = null
    await submitLogin({ request }, { username: "admin", password: "secret" }, {
      getAccessToken: () => token,
      setAccessToken: (next) => {
        token = next
      },
    })
    expect(token).toBe("abc")
    expect(request).toHaveBeenCalledWith("/api/v1/auth/login", {
      method: "POST",
      skipRefresh: true,
      body: JSON.stringify({ username: "admin", password: "secret" }),
    })
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test src/auth/login.test.ts`

Expected: FAIL because `@/auth/login` does not exist.

- [ ] **Step 3: Write the session store and login**

`src/auth/session.ts`:

```ts
import { defineStore } from "pinia"
import { ref } from "vue"

export const useSessionStore = defineStore("session", () => {
  const accessToken = ref<string | null>(null)
  const permissions = ref<string[]>([])
  const sidebarCollapsed = ref(false)

  function getAccessToken() {
    return accessToken.value
  }

  function setAccessToken(token: string | null) {
    accessToken.value = token
  }

  function setPermissions(codes: string[]) {
    permissions.value = codes
  }

  function hasPermission(code: string) {
    return permissions.value.includes(code)
  }

  function reset() {
    accessToken.value = null
    permissions.value = []
  }

  return { accessToken, permissions, sidebarCollapsed, getAccessToken, setAccessToken, setPermissions, hasPermission, reset }
})
```

`src/auth/login.ts`:

```ts
import type { TokenPair } from "@/api/types"
import type { TokenSource } from "@/api/client"

interface LoginClient {
  request<T>(path: string, init?: RequestInit & { skipRefresh?: boolean }): Promise<T>
}

export async function submitLogin(
  client: LoginClient,
  input: { username: string; password: string },
  session: TokenSource,
) {
  const pair = await client.request<TokenPair>("/api/v1/auth/login", {
    method: "POST",
    skipRefresh: true,
    body: JSON.stringify(input),
  })
  session.setAccessToken(pair.access_token)
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test src/auth/login.test.ts`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/auth/session.ts src/auth/login.ts src/auth/login.test.ts
git commit -m "$(cat <<'EOF'
feat: 登录后把访问令牌留在内存会话里

EOF
)"
```

### Task 6: 菜单路由与应用壳

**Files:**
- Create: `src/menus/types.ts`
- Create: `src/menus/views.ts`
- Create: `src/menus/compile.ts`
- Create: `src/menus/compile.test.ts`
- Create: `src/auth/LoginView.vue`
- Create: `src/app/RouteView.vue`
- Create: `src/app/api.ts`
- Create: `src/app/query.ts`
- Create: `src/app/MissingView.vue`
- Create: `src/app/Shell.vue`
- Create: `src/app/router.ts`
- Create: `src/app/main.ts`
- Create: `src/views/asset/device/index.vue`
- Create: `src/views/asset/workline/index.vue`
- Create: `src/views/system/user/index.vue`
- Create: `src/views/system/user/detail.vue`
- Create: `src/views/system/role/index.vue`
- Create: `src/views/system/permission/index.vue`
- Create: `src/views/system/menu/index.vue`
- Create: `src/views/system/audit-log/index.vue`

**Interfaces:**
- Consumes: `useSessionStore`、`createApiClient`、`RowRange`
- Produces:
  - `export interface MenuNode { name: string; path: string; component: string; redirect?: string | null; meta: { title: string; icon?: string | null; hidden?: boolean | null; keepAlive?: boolean | null; permission?: string | null }; children?: MenuNode[] | null }`
  - `export function compileMenus(nodes: MenuNode[]): RouteRecordRaw[]`
  - `export function getApi(): { request<T>(path: string, init?: RequestInit & { skipRefresh?: boolean }): Promise<T>; refresh(): Promise<string> }`
  - `export const queryClient`
  - `export const router`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from "vitest"
import { compileMenus } from "@/menus/compile"

describe("compileMenus", () => {
  it("registers hidden routes and names missing components", () => {
    const routes = compileMenus([
      {
        name: "Assets",
        path: "/asset",
        component: "Layout",
        meta: { title: "设备资源" },
        children: [
          { name: "AssetDevice", path: "device", component: "asset/device/index", meta: { title: "设备管理" } },
          { name: "Missing", path: "missing", component: "missing/page", meta: { title: "缺失", hidden: true } },
        ],
      },
    ])
    const root = routes[0]
    expect(root?.path).toBe("/asset")
    expect(root?.children?.map((child) => child.name)).toEqual(["AssetDevice", "Missing"])
    expect(root?.children?.[1]?.meta).toMatchObject({ missing: true, title: "缺失" })
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test src/menus/compile.test.ts`

Expected: FAIL because the module does not exist.

- [ ] **Step 3: Write the menu compiler, shell, and placeholders**

`src/menus/types.ts`:

```ts
export interface MenuMeta {
  title: string
  icon?: string | null
  hidden?: boolean | null
  keepAlive?: boolean | null
  permission?: string | null
}

export interface MenuNode {
  name: string
  path: string
  component: string
  redirect?: string | null
  meta: MenuMeta
  children?: MenuNode[] | null
}
```

`src/menus/views.ts`:

```ts
export const viewLoaders = {
  "asset/device/index": () => import("@/views/asset/device/index.vue"),
  "asset/workline/index": () => import("@/views/asset/workline/index.vue"),
  "system/user/index": () => import("@/views/system/user/index.vue"),
  "system/user/detail": () => import("@/views/system/user/detail.vue"),
  "system/role/index": () => import("@/views/system/role/index.vue"),
  "system/permission/index": () => import("@/views/system/permission/index.vue"),
  "system/menu/index": () => import("@/views/system/menu/index.vue"),
  "system/audit-log/index": () => import("@/views/system/audit-log/index.vue"),
} as const
```

`src/menus/compile.ts`:

```ts
import type { RouteRecordRaw } from "vue-router"
import type { MenuNode } from "@/menus/types"
import { viewLoaders } from "@/menus/views"

export function compileMenus(nodes: MenuNode[]): RouteRecordRaw[] {
  return nodes.map((node) => {
    const children = node.children ? compileMenus(node.children) : undefined
    if (node.component === "Layout") {
      return {
        name: node.name,
        path: node.path,
        component: () => import("@/app/RouteView.vue"),
        redirect: node.redirect ?? undefined,
        meta: { ...node.meta, hidden: Boolean(node.meta.hidden) },
        children,
      }
    }
    const loader = viewLoaders[node.component as keyof typeof viewLoaders]
    return {
      name: node.name,
      path: node.path,
      component: loader ?? (() => import("@/app/MissingView.vue")),
      meta: { ...node.meta, hidden: Boolean(node.meta.hidden), missing: loader === undefined },
      children,
    }
  })
}
```

`src/app/RouteView.vue`:

```vue
<template>
  <router-view />
</template>
```

`src/app/api.ts`:

```ts
import { createApiClient, type TokenSource } from "@/api/client"
import { useSessionStore } from "@/auth/session"

let client: ReturnType<typeof createApiClient> | null = null

export function getApi() {
  if (!client) {
    const session = useSessionStore()
    const token: TokenSource = {
      getAccessToken: () => session.getAccessToken(),
      setAccessToken: (value) => session.setAccessToken(value),
    }
    client = createApiClient({ token })
  }
  return client
}
```

`src/auth/LoginView.vue`:

```vue
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
```

`src/app/query.ts`:

```ts
import { QueryClient } from "@tanstack/vue-query"

export const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false } },
})
```

`src/app/MissingView.vue`:

```vue
<template>
  <p>页面未实现</p>
</template>
```

`src/app/Shell.vue`:

```vue
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
```

目录节点使用 `RouteView`，侧栏只放在根布局 `Shell` 里。

`src/app/router.ts`:

```ts
import { createRouter, createWebHistory, type RouteRecordRaw } from "vue-router"
import { getApi } from "@/app/api"
import { useSessionStore } from "@/auth/session"
import { compileMenus } from "@/menus/compile"
import type { MenuNode } from "@/menus/types"

let installed = false

export const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: "/login", name: "Login", component: () => import("@/auth/LoginView.vue"), meta: { public: true, title: "登录" } },
    { path: "/", name: "Root", component: () => import("@/app/Shell.vue"), children: [] },
  ],
})

export async function installMenus() {
  if (installed) return
  const session = useSessionStore()
  if (!session.getAccessToken()) {
    try {
      await getApi().refresh()
    } catch {
      session.reset()
      return
    }
  }
  const me = await getApi().request<{ permissions: string[] }>("/api/v1/users/me")
  session.setPermissions(me.permissions)
  const menus = await getApi().request<MenuNode[]>("/api/v1/users/me/menus")
  for (const route of compileMenus(menus)) router.addRoute("Root", route as RouteRecordRaw)
  installed = true
}

router.beforeEach(async (to) => {
  if (to.meta.public) return true
  await installMenus()
  if (!useSessionStore().getAccessToken()) return { path: "/login" }
  return true
})
```

`src/app/main.ts`:

```ts
import { createApp } from "vue"
import { createPinia } from "pinia"
import { VueQueryPlugin } from "@tanstack/vue-query"
import { queryClient } from "@/app/query"
import { router } from "@/app/router"
import "@/style.css"

const app = createApp({ template: "<router-view />" })
app.use(createPinia())
app.use(VueQueryPlugin, { queryClient })
app.use(router)
app.mount("#app")
```

Each placeholder view uses the same template with its own title:

```vue
<template>
  <h1>设备管理</h1>
</template>
```

Titles: 设备管理、工作线管理、用户管理、用户详情、角色管理、权限管理、菜单管理、审计日志。路径与 `viewLoaders` 一致。

- [ ] **Step 4: Run the tests and typecheck**

Run: `pnpm test && pnpm exec vue-tsc --noEmit --pretty false`

Expected: PASS, and `vue-tsc` exits 0.

- [ ] **Step 5: Commit**

```bash
git add src/menus src/app src/auth/LoginView.vue src/views src/api/client.ts
git commit -m "$(cat <<'EOF'
feat: 用后端菜单组装登录后的管理端壳

EOF
)"
```

### Task 7: 把行号窗口放进地址栏

**Files:**
- Create: `src/components/list/useRowRange.ts`
- Test: `src/components/list/useRowRange.test.ts`
- Modify: `src/views/asset/device/index.vue`
- Modify: `src/views/asset/workline/index.vue`
- Modify: `src/views/system/user/index.vue`
- Modify: `src/views/system/audit-log/index.vue`

**Interfaces:**
- Consumes: `rangeFromQuery`、`RowRange`、`RangePager`
- Produces: `export function useRowRange(): { range: ComputedRef<RowRange>; replaceRange(range: RowRange): Promise<void>; resetRange(): Promise<void> }`

- [ ] **Step 1: Write the failing test**

```ts
import { mount } from "@vue/test-utils"
import { defineComponent } from "vue"
import { createMemoryHistory, createRouter } from "vue-router"
import { describe, expect, it } from "vitest"
import { useRowRange } from "@/components/list/useRowRange"

const Probe = defineComponent({
  setup() {
    const { range, resetRange } = useRowRange()
    return { range, resetRange }
  },
  template: "<button @click='resetRange'>{{ range.start }}-{{ range.end }}</button>",
})

describe("useRowRange", () => {
  it("reads start and end from the address and resets to the default window", async () => {
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [{ path: "/", component: Probe }],
    })
    await router.push("/?start=21&end=40")
    const wrapper = mount(Probe, { global: { plugins: [router] } })
    expect(wrapper.text()).toBe("21-40")
    await wrapper.get("button").trigger("click")
    expect(router.currentRoute.value.query).toMatchObject({ start: "1", end: "20" })
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test src/components/list/useRowRange.test.ts`

Expected: FAIL because `useRowRange` does not exist.

- [ ] **Step 3: Write the composable and mount the pager**

`src/components/list/useRowRange.ts`:

```ts
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
```

Replace each of the four list placeholders with:

```vue
<script setup lang="ts">
import RangePager from "@/components/list/RangePager.vue"
import { useRowRange } from "@/components/list/useRowRange"

const { range, replaceRange } = useRowRange()
</script>

<template>
  <section>
    <h1>设备管理</h1>
    <RangePager :range="range" :total="0" @change="replaceRange" />
  </section>
</template>
```

The heading text stays the page title. `total` is `0` until the resource plans load real pages. Reset happens in those plans when the filter changes.

- [ ] **Step 4: Run the full test script**

Run: `pnpm test && pnpm exec vue-tsc --noEmit --pretty false`

Expected: PASS, and `vue-tsc` exits 0.

- [ ] **Step 5: Commit**

```bash
git add src/components/list/useRowRange.ts src/components/list/useRowRange.test.ts src/views/asset/device/index.vue src/views/asset/workline/index.vue src/views/system/user/index.vue src/views/system/audit-log/index.vue
git commit -m "$(cat <<'EOF'
feat: 把列表起止行写入地址栏

EOF
)"
```

## Self-check

- 规格第 6 节的业务表单不在本计划的任务里。它们属于文首列出的四份后续计划。
- 运行 `pnpm test` 必须覆盖 `ready`、`range`、`RangePager`、`client`、`login`、`compileMenus`、`useRowRange`、`Shell`（含退出与 `whenSettled`）、`router`、`session`。
- `getApi()` 只能在 `app.use(pinia)` 之后调用。`main.ts` 先安装 Pinia，再安装路由。
