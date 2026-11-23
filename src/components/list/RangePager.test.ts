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