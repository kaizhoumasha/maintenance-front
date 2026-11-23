import { flushPromises, mount } from "@vue/test-utils"
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
    await flushPromises()
    expect(router.currentRoute.value.query).toMatchObject({ start: "1", end: "20" })
  })
})