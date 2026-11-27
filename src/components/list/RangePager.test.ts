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

  // Value: protects=an empty list keeps the current window and does not offer a next page; fails_when=a later draft is emitted or the next control stays enabled; why_new=the pager test only mounts a total of 45; seam=none; no_claim=the address bar (the pager emits the next range)
  it("keeps the current window when the list has no rows", async () => {
    const wrapper = mount(RangePager, { props: { range: { start: 1, end: 20 }, total: 0 } })
    expect(wrapper.get("[data-testid=next-window]").attributes("disabled")).toBe("")
    await wrapper.get("[data-testid=range-start]").setValue("21")
    await wrapper.get("[data-testid=range-end]").setValue("40")
    await wrapper.get("[data-testid=range-end]").trigger("blur")
    expect(wrapper.emitted("change")).toBeUndefined()
    expect(wrapper.text()).toContain("共 0 条")
  })

  // Value: protects=previous emits the prior window, disables on row 1, and inputs follow the new range; fails_when=the button calls nextWindow, stays enabled at the start, or a blur resubmits a stale draft; why_new=RangePager tests only click next and never change the range prop; seam=none; no_claim=the address bar (the pager emits the range)
  it("emits the previous window and follows an updated range", async () => {
    const wrapper = mount(RangePager, { props: { range: { start: 21, end: 40 }, total: 45 } })
    await wrapper.get("[data-testid=previous-window]").trigger("click")
    expect(wrapper.emitted("change")?.[0]).toEqual([{ start: 1, end: 20 }])

    await wrapper.setProps({ range: { start: 1, end: 20 }, total: 45 })
    expect((wrapper.get("[data-testid=range-start]").element as HTMLInputElement).value).toBe("1")
    expect((wrapper.get("[data-testid=range-end]").element as HTMLInputElement).value).toBe("20")
    expect(wrapper.get("[data-testid=previous-window]").attributes("disabled")).toBe("")

    await wrapper.get("[data-testid=range-end]").trigger("blur")
    expect(wrapper.emitted("change")).toHaveLength(1)
  })
})