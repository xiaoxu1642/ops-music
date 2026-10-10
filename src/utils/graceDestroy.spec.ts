import { afterEach, describe, expect, it, vi } from "vitest";
import { createGraceDestroyScheduler } from "./graceDestroy";

describe("graceDestroy", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("宽限期结束后执行销毁", () => {
    vi.useFakeTimers();
    const destroy = vi.fn();
    const scheduler = createGraceDestroyScheduler(destroy, 10_000);

    scheduler.schedule();
    vi.advanceTimersByTime(9_999);
    expect(destroy).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1);
    expect(destroy).toHaveBeenCalledTimes(1);
  });

  it("宽限期内 cancel 后不再销毁（重开场景）", () => {
    vi.useFakeTimers();
    const destroy = vi.fn();
    const scheduler = createGraceDestroyScheduler(destroy, 10_000);

    scheduler.schedule();
    vi.advanceTimersByTime(5_000);
    scheduler.cancel();
    vi.advanceTimersByTime(60_000);

    expect(destroy).not.toHaveBeenCalled();
  });

  it("重复 schedule 会重置计时", () => {
    vi.useFakeTimers();
    const destroy = vi.fn();
    const scheduler = createGraceDestroyScheduler(destroy, 10_000);

    scheduler.schedule();
    vi.advanceTimersByTime(8_000);
    scheduler.schedule();
    vi.advanceTimersByTime(9_999);
    expect(destroy).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1);
    expect(destroy).toHaveBeenCalledTimes(1);
  });
});
