/** 宽限销毁调度器 */
export interface GraceDestroyScheduler {
  /** 开始宽限计时（重复调用会重置计时） */
  schedule: () => void;
  /** 取消尚未到期的销毁 */
  cancel: () => void;
}

/**
 * 创建宽限销毁调度器：schedule 后到点执行 destroy，宽限期内 cancel 可取消
 * @param destroy - 宽限期结束后执行的销毁动作
 * @param graceMs - 宽限时长（毫秒）
 * @returns 调度器
 */
export const createGraceDestroyScheduler = (
  destroy: () => void,
  graceMs: number,
): GraceDestroyScheduler => {
  let timer: ReturnType<typeof setTimeout> | undefined;
  return {
    schedule: () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        timer = undefined;
        destroy();
      }, graceMs);
    },
    cancel: () => {
      clearTimeout(timer);
      timer = undefined;
    },
  };
};
