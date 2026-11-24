/** 生命周期初态与广播竞态的协调结果 */
export interface LifecycleBootstrapPlan {
  /** 是否应用初始状态 */
  applyInitial: boolean;
}

/**
 * 计算生命周期初始化时是否还能应用初态
 * @param initialSeq - 读初态前的广播序号
 * @param currentSeq - 当前广播序号
 * @returns 初始状态是否可应用
 */
export const canApplyInitialLifecycle = (initialSeq: number, currentSeq: number): boolean =>
  initialSeq === currentSeq;
