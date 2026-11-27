import { createApp, h } from "vue"
import { createPinia } from "pinia"
import { VueQueryPlugin } from "@tanstack/vue-query"
import { RouterView } from "vue-router"
import { setUnauthorizedHandler } from "@/app/api"
import NavigationNotice from "@/app/NavigationNotice.vue"
import { queryClient } from "@/app/query"
import { router } from "@/app/router"
import { handleUnauthorized } from "@/app/unauthorized"
import "@/style.css"

setUnauthorizedHandler(handleUnauthorized)

const app = createApp({
  render: () => h("div", { class: "min-h-dvh" }, [h(NavigationNotice), h(RouterView)]),
})
app.use(createPinia())
app.use(VueQueryPlugin, { queryClient })
app.use(router)
app.mount("#app")
