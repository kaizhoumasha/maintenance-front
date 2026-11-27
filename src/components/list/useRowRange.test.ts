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

const ReplaceProbe = defineComponent({
  setup() {
    const { replaceRange } = useRowRange()
    return { replaceRange }
  },
  template: "<button @click=\"replaceRange({ start: 5, end: 10 })\">go</button>",
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

  // Value: protects=replacing the row window keeps unrelated query keys; fails_when=replaceRange writes a query that only has start and end; why_new=the existing address test has no other query key; seam=none; no_claim=a list request is sent (asserts the route query)
  it("keeps unrelated query keys when the window changes", async () => {
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [{ path: "/", component: ReplaceProbe }],
    })
    await router.push("/?start=1&end=20&filter=open")
    const wrapper = mount(ReplaceProbe, { global: { plugins: [router] } })
    await wrapper.get("button").trigger("click")
    await flushPromises()

    expect(router.currentRoute.value.query).toEqual({ start: "5", end: "10", filter: "open" })
  })
})