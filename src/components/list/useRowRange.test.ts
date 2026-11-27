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

  // Value: protects=a shared link keeps its window, and a later filter change returns to rows 1 through 20; fails_when=the composable resets on load or leaves the old window after the filter query changes; why_new=useRowRange tests only reset when the button calls resetRange; seam=none; no_claim=a list request (asserts the route query)
  it("keeps a shared window and returns to the default when the filter changes", async () => {
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [{ path: "/", component: Probe }],
    })
    await router.push("/?start=21&end=40&filter=open")
    const wrapper = mount(Probe, { global: { plugins: [router] } })
    expect(wrapper.text()).toBe("21-40")

    await router.push({ query: { start: "21", end: "40", filter: "closed" } })
    await flushPromises()

    expect(router.currentRoute.value.query).toEqual({ start: "1", end: "20", filter: "closed" })
    expect(wrapper.text()).toBe("1-20")
  })

  // Value: protects=opening another list keeps that page's window when its filter differs; fails_when=the leaving page resets the current route to rows 1-20; why_new=the filter test changes the query on the same path; seam=none; no_claim=a list request (asserts the route query)
  it("keeps the next page window when its filter differs", async () => {
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [
        { path: "/asset/device", component: Probe },
        { path: "/asset/workline", component: Probe },
      ],
    })
    await router.push("/asset/device?start=21&end=40&filter=open")
    mount(Probe, { global: { plugins: [router] } })
    await router.push("/asset/workline?start=5&end=10&filter=closed")
    await flushPromises()
    expect(router.currentRoute.value.path).toBe("/asset/workline")
    expect(router.currentRoute.value.query).toEqual({ start: "5", end: "10", filter: "closed" })
  })
})