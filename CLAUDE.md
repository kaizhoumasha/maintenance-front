# CLAUDE.md

本文件给在本仓库里改代码的助手提供约定。以当前仓库和 [管理端前端设计](docs/superpowers/specs/2026-11-21-maintenance-front-design.md) 为准。不要把 `wes_frontend` 的技术选型、契约生成或 worktree 脚本搬过来。

## 项目概述

**maintenance-front** 是 `maintenance-admin` 的管理端前端。现场管理员在这里配置工作线、设备、用户与授权、菜单，并查阅审计。它是独立的 Vue 3 应用，不并入 `wes_frontend`。

- **当前仓库**: 只放前端。后端实现、接口逻辑和服务端代码在独立仓库处理
- **后端项目**: `../maintenance-admin`（FastAPI）
- **本地 API**: http://127.0.0.1:8000
- **开发代理**: Vite 把 `/api` 转到 `http://127.0.0.1:8000`（见 `vite.config.ts`）
- **Swagger**: `ENVIRONMENT=local` 时为 http://127.0.0.1:8000/docs
- **生产**: 页面与接口同域，由现有 nginx 反代，前端不另配 API 基址

后端启动见该仓库 README：`uv run uvicorn app.main:app --reload`。

## 当前实现边界

基础壳已经落地：工程骨架、内存会话、登录、401 刷新、按后端菜单注册路由、行号窗口和分页底栏。

八个业务页目前只显示标题，并在需要行号窗口的页面挂上 `RangePager`。工作线、设备、用户、角色、权限、菜单和审计的表单与列表数据还没做。对接历史页面和 ECS 调试台不在本轮。

后续页面按这个顺序另写计划，不要提前铺抽象：

1. 工作线
2. 设备
3. 用户、角色、权限、菜单
4. 审计

规格在 `docs/superpowers/specs/2026-11-21-maintenance-front-design.md`。基础壳计划在 `docs/superpowers/plans/2026-11-21-maintenance-front-foundation.md`。

## 常用命令

```bash
pnpm install
pnpm dev       # Vite 开发服务器，/api 代理到 127.0.0.1:8000
pnpm test      # vitest run
pnpm build     # vue-tsc --noEmit && vite build
```

本仓库没有 ESLint、Prettier、Stylelint、OpenAPI 代码生成或契约冻结脚本。类型检查走 `pnpm build` 里的 `vue-tsc`。提交前至少跑与改动对应的 `pnpm test`；动到类型或构建入口时再跑 `pnpm build`。

## 技术栈关键约束

| 技术栈 | 当前版本 | 说明 |
| --- | --- | --- |
| **Node.js** | 20.19+ / 22.12+ | Vite 7 的要求 |
| **pnpm** | 当前使用 12 | 只用 pnpm，不要引入 npm 或 yarn 锁文件 |
| **Vue** | 3.5 | 只用 Composition API 和 `<script setup>` |
| **TypeScript** | 5.9 | `strict: true`，路径别名 `@/` → `src/` |
| **Vite** | 7.3 | 开发服务器兼 Vitest 配置 |
| **Vue Router** | 5 | 登录后的业务路由由菜单动态注册 |
| **Pinia** | 3 | 只放访问令牌、权限码、侧栏收起 |
| **TanStack Query** | 5.90 | 列表和详情等服务端数据 |
| **Tailwind CSS** | 4.2 | 通过 `@tailwindcss/vite`，没有 `tailwind.config.js` |
| **Vitest** | 3.2 | `happy-dom`，测试文件为 `src/**/*.test.ts` |

设计选定、尚未安装的界面库：shadcn-vue（Reka UI）、lucide-vue-next、TanStack Table、vee-validate、zod。`components.json` 和 `src/lib/utils.ts` 的 `cn()` 已经按 new-york / zinc 准备好。添加组件时沿用这份配置，不要改用 Element Plus，也不要引入 axios。HTTP 只有 `src/api/client.ts` 里的 `fetch`。

## 架构原则

- 只实现当前页面需要的行为。基础壳已经够用的纯函数和客户端不要再包一层。
- 视图负责渲染和交互。可复用的响应式逻辑放组合式函数。服务端数据进 TanStack Query，不进 Pinia。
- 行号窗口、菜单编译、登录提交保持纯函数或可注入依赖，方便用假客户端测试。
- 单文件过长时按页面区块拆开。不要为还没出现的第二种列表分页预留兼容层。

## 目录结构与职责

```
src/
├── app/                 # 启动、路由、QueryClient、布局、未授权处理
│   ├── main.ts          # createApp，挂上 Pinia、Vue Query、Router
│   ├── router.ts        # 静态登录/根路由，以及菜单安装
│   ├── api.ts           # 把会话接到唯一的 API 客户端
│   ├── query.ts         # QueryClient：不重试、不因窗口聚焦刷新
│   ├── Shell.vue        # 登录后的侧栏和内容区
│   ├── RouteView.vue    # 菜单目录（component === "Layout"）
│   ├── MissingView.vue  # 组件字符串没有对应页面
│   └── unauthorized.ts  # 刷新失败后清会话并进入登录页
├── api/
│   ├── client.ts        # fetch、Bearer、401 单次刷新
│   └── types.ts         # ErrorBody、TokenPair
├── auth/                # 内存令牌、登录
├── menus/               # 菜单响应 → 路由
├── components/list/     # 行号窗口纯函数、地址栏同步、底栏
├── lib/utils.ts         # cn()
└── views/               # 页面。component 字符串对应这里的路径
    ├── asset/device
    ├── asset/workline
    └── system/          # user、role、permission、menu、audit-log
```

补充：

```
docs/superpowers/specs/    # 第一版管理端设计
docs/superpowers/plans/    # 分步实现计划
components.json            # 后续 shadcn-vue 的别名和样式
```

页面文件使用 `index.vue`（用户详情是 `detail.vue`）。菜单 `component` 必须能在 `src/menus/views.ts` 的 `viewLoaders` 里找到，例如 `asset/device/index`。新增页面时同时登记 loader，否则路由会落到 `MissingView`，页面显示「页面未实现」。

## 关键架构模式

### 数据流

```
View → composable / TanStack Query → getApi().request → maintenance-admin
                              ↘
                    纯函数（行号窗口、菜单编译）
```

- **View**: 渲染和事件
- **Pinia**: `accessToken`、`permissions`、`sidebarCollapsed`。不放列表、详情或表单草稿
- **TanStack Query**: 服务端数据。查询键包含资源名、`start`、`end` 和筛选
- **API 客户端**: 统一附带内存中的访问令牌，并处理 401

`queryClient` 默认 `retry: false`、`refetchOnWindowFocus: false`。页面自己决定何时 `invalidateQueries`。更新成功后用响应里的新 `version` 替换本地值，再让对应列表和详情失效。

### 认证与会话

访问令牌只留在 Pinia 内存里，不写 `localStorage`，也不要给 session store 加持久化插件。刷新令牌是后端的 HttpOnly cookie，请求使用 `credentials: "include"`。

打开受保护页时，`installMenus()` 若没有访问令牌，先 `POST /api/v1/auth/refresh`。换不到就清空会话并去 `/login`。

`createApiClient` 的约定：

- 有访问令牌时附带 `Authorization: Bearer …`
- 收到 401、且这次请求允许刷新、且当前已经有访问令牌：用刷新 cookie 换一次令牌，重试原请求
- 同一时刻只发一个刷新请求，其余调用等待同一次结果
- 登录请求必须 `skipRefresh: true`。登录本身 401 不尝试刷新
- 刷新或重试仍是 401：清掉令牌，调用 `onUnauthorized`
- `handleUnauthorized` 会 `reset()` 会话、`queryClient.clear()`、`discardInstalledMenus()`，再 `replace("/login")`

`setAccessToken` 在令牌身份变化时清空权限并通知路由拆掉已安装菜单。刷新成功用 `rotateAccessToken`，避免把同一次会话的菜单拆掉。

壳顶栏「退出」走 `Shell` 的 `leave()`：先 `getApi().whenSettled()` 等待进行中的刷新结束。没有访问令牌时不请求 `logout`，直接 `handleUnauthorized`。刷新结束后用 `accessTokenSubject` 比对是否仍是同一账号；账号已变时只清本地会话，不 `POST /api/v1/auth/logout`。仍是同一账号时 `POST /api/v1/auth/logout`（`skipRefresh: true`）；若返回 `401` 再刷新一次，且仍为同一账号时重试 `logout`。进行中再次点击不会重复发送。非 `401` 的失败留在当前页并展示服务端 `message` 或「暂时不可用」，不清会话。

菜单可见只决定导航。接口仍由后端鉴权。按钮用 `useSessionStore().hasPermission(code)` 决定显示。权限码来自 `GET /api/v1/users/me` 的 `permissions`。

### 菜单路由

`GET /api/v1/users/me/menus` 的树由 `compileMenus` 编成路由，挂到名为 `Root` 的壳下面。

| `component` | 结果 |
| --- | --- |
| `Layout` | 目录，组件为 `RouteView.vue` |
| `viewLoaders` 里的字符串 | 对应 `src/views/` 页面 |
| 其他字符串 | `MissingView.vue`，`meta.missing === true` |

`meta.hidden` 的路由照常注册，不出现在侧栏。静态路由名 `Login`、`Root` 不会让给菜单。菜单第一次安装成功后，守卫返回 `to.fullPath`，让新路由重新匹配当前地址。菜单保存成功后要重新请求当前用户菜单并更新路由。

### 行号分页

公开列表只有一种合同：查询参数 `start`、`end`，外加已有的 `filter` JSON。不要发送 `page`、`page_size`、`limit`、`cursor`，也不要在前端做这几种分页的换算。

- 行号从 1 计，闭区间。默认 `1 - 20`
- 窗口长度 1–100。偏移 `start - 1` 不超过 100000
- 超限时不发请求，保持原区间。纯函数在 `src/components/list/range.ts`：`canRequest`、`applyDraft`、`previousWindow`、`nextWindow`、`clampEndToTotal`、`retreatIfPageEmpty`
- `useRowRange()` 把区间放进地址栏。筛选变化时回到默认区间
- 底栏是 `RangePager`：`[起始行] - [结束行]  共 total 条  ‹ ›`
- 响应为 `{ items, total, start, end }`，`start` 和 `end` 回显请求值
- 当前窗口被删空且起始行大于 1 时，按当前窗口长度退一窗。`total` 变小导致结束行越界时，把结束行收到 `total`

角色、权限和菜单接口返回全量，页面不做行号窗口。审计的当前日志和归档日志共用这一底栏。归档标签需要 `admin:audit:read_archive`。

### 错误体与状态

错误体为 `trace_id`、`code`、`message`、`detail`。页面展示 `message`；校验失败且存在 `detail` 时一并展示。

| 状态 | 行为 |
| --- | --- |
| 400 | 停在表单，展示服务端说明 |
| 401 | 按上面的规则刷新一次；仍失败则进入登录页 |
| 403 | 留在当前页，提示没有权限 |
| 404 | 关闭编辑器并刷新列表 |
| 409 | 展示服务端说明，重新读取服务器记录，保留用户已改内容。不自动覆盖，不自动重试 |
| 429 | 按 `Retry-After` 提示稍后再试，不自动连发 |
| 502、503、504 | 保留已打开的配置，提示暂时不可用 |

工作线和设备的更新、删除、调整归属和换址都带上最近一次读到的 `version`。预览返回 `PREVIEW_EXPIRED` 或 `PREVIEW_CHANGED` 时清掉本次预览令牌，要求重新拉取。

设备列表只显示配置，不请求、不轮询、不回写设备状态。手动刷新状态只留在当次打开的详情里，权限码是 `asset:device:refresh`。

## 代码规范

### 命名

| 类型 | 约定 | 示例 |
| --- | --- | --- |
| 页面 | `views/<域>/<资源>/index.vue` | `views/asset/device/index.vue` |
| 组件 | PascalCase | `RangePager.vue` |
| 组合式函数 | `use` 前缀 | `useRowRange.ts` |
| 纯函数模块 | camelCase | `range.ts`、`compile.ts` |
| 类型 | PascalCase | `MenuNode`、`ErrorBody` |
| 常量 | UPPER_SNAKE_CASE | `DEFAULT_RANGE`、`MAX_WINDOW` |

优先命名导出。组件使用 `<script setup lang="ts">`。自动导入没有配置，`ref`、`computed`、组件和 API 都要显式导入。

不要使用 `any`。测试里的假客户端实现调用方真正用到的方法即可，不要把生产客户端断言成测试替身。

### 修改时保持的行为

- 令牌身份变化必须拆掉上一份菜单路由，包括没有 `name` 的路由
- 刷新失败和退出同样拆掉菜单，并清掉 Query 缓存
- 超长或超限的行号草稿在收成 `total` 之前就拒绝
- 偏移正好等于 100000 的起始行允许请求

这些都有相邻的 `*.test.ts`。改动时先让原测试描述新的可观察行为，再改实现。

## 后端 API 对接

管理端接口前缀是 `/api/v1`。本仓库还不按资源拆 `api/modules`。新请求先走 `getApi().request`。某一资源的请求变多、并且需要在测试里替换时，再抽成该资源的函数，仍然通过注入的客户端发送。

已用到的认证与壳接口：

| 方法与路径 | 用途 |
| --- | --- |
| `POST /api/v1/auth/login` | 登录。`skipRefresh: true`，成功后 `setAccessToken` |
| `POST /api/v1/auth/refresh` | 用 cookie 换访问令牌 |
| `POST /api/v1/auth/logout` | 退出。`skipRefresh: true`；仅同一账号时由 `leave()` 调用 |
| `GET /api/v1/users/me` | 当前用户权限码 |
| `GET /api/v1/users/me/menus` | 侧栏和动态路由 |

页面与数据的对应关系以设计规格第 2 节和第 6 节为准：设备、工作线、用户、审计走 `start` / `end`；用户详情走单条；角色和权限一次取全量；菜单一次取整棵树。

后端合同的列表分页见 [maintenance-admin#137](https://github.com/kaizhoumasha/maintenance-admin/issues/137)。不要在这个前端仓库里改 `maintenance-admin`。

## 测试

- 运行：`pnpm test`（`vitest run`）
- 测试与源码相邻，文件名为 `*.test.ts`
- 使用 Vitest 的 `describe` / `it` / `expect`、`@/` 别名，组件使用 `@vue/test-utils`
- 环境是 `happy-dom`，配置在 `vite.config.ts` 的 `test` 字段，没有单独的 `vitest.config.ts`
- 用假的接口客户端。浏览器联调不是本轮完成条件

已经覆盖的行为：行号窗口的默认值、手输区间、贴边缩短、超限不发请求；客户端附带令牌、401 只刷新一次、刷新失败进入登录页；菜单目录、隐藏页和未知组件；登录与会话身份变化；退出等待刷新、同一账号才请求 `logout`、无令牌与进行中重复点击。

后续页面继续用假客户端补规格第 9 节：工作线已选业务只读、清空绑定前确认；设备只能登记预览中的未登记项、换址必须填写原因并确认；409 后重新读取，未保存修改仍然保留。

## Git

提交说明沿用现有历史：`feat:`、`fix:`、`test:`、`build:`，主题用简短中文，说明行为而不是文件清单。

```
feat: 把列表起止行写入地址栏
fix: 换人或刷新失败时拆掉上一份会话
test: 补上登录、会话和列表窗口的缺口
```

在功能分支上开发。不要直接把未验证的修改提交到 `main`。只在用户明确要求时提交或推送。

本仓库没有 worktree 脚本，也没有 CI 工作流。不要假设 `pnpm lint` 或 `pnpm contract:test` 存在。

## 开发注意事项

禁止：

- 使用 Options API
- 把访问令牌写入 `localStorage` 或持久化 Pinia
- 在前端兼容旧的 `page` / `page_size`、`limit` / `cursor`
- 轮询设备状态，或把状态写进设备列表
- 引入 Element Plus、axios，或把本应用并进 `wes_frontend`
- 修改 `maintenance-admin` 来迁就前端
- 跳过已有测试，或在没跑相关测试时声称行为已修复

推荐：

- 先写失败测试，再写实现。纯函数优先于组件测试，组件测试优先于浏览器手点
- 列表筛选、区间和详情身份放进路由，让刷新和分享地址能恢复同一窗口
- 乐观更新只在规格写明时使用。409 要保留用户已改内容
- 改完后跑 `pnpm test`。动到 Vue 单文件、别名或 `vite.config.ts` 时补跑 `pnpm build`

## 项目文档

- **设计规格**: `docs/superpowers/specs/2026-11-21-maintenance-front-design.md`
- **基础壳计划**: `docs/superpowers/plans/2026-11-21-maintenance-front-foundation.md`
- **仓库说明**: `README.md`
- **后端约定**: `../maintenance-admin/AGENTS.md`、`../maintenance-admin/CLAUDE.md`
