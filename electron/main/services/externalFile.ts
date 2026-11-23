import { resolve } from "node:path";
import { getMainWindow } from "@main/window";
import { coreLog } from "@main/utils/logger";
import { isAudioFile } from "@shared/utils/audioFile";

let pendingAudioFiles: string[] = [];
let readyWebContentsId: number | null = null;

/**
 * 从命令行参数中提取音频文件路径
 * @param argv - 命令行参数
 * @returns 音频绝对路径数组
 */
export const extractAudioFiles = (argv: readonly string[]): string[] => {
  const files: string[] = [];
  for (let index = 1; index < argv.length; index++) {
    const arg = argv[index];
    if (arg.startsWith("--") || arg.startsWith("-")) continue;
    if (isAudioFile(arg)) files.push(resolve(arg));
  }
  return files;
};

/**
 * 捕获外部音频文件打开请求
 * @param filePaths - 文件路径列表
 */
export const captureAudioFiles = (filePaths: readonly string[]): void => {
  const valid = filePaths.filter(isAudioFile).map((file) => resolve(file));
  if (valid.length === 0) return;
  const targetWindow = getMainWindow();
  if (readyWebContentsId === targetWindow?.webContents.id) {
    targetWindow.webContents.send("system:open-files", valid);
  } else {
    pendingAudioFiles.push(...valid);
  }
  coreLog.info("[externalFile] 捕获打开音频文件", valid);
};

/**
 * 渲染层就绪后取走冷启动暂存文件
 * @returns 暂存的音频文件路径
 */
export const consumePendingAudioFiles = (): string[] => {
  const targetWindow = getMainWindow();
  readyWebContentsId = targetWindow?.webContents.id ?? null;
  const files = pendingAudioFiles;
  pendingAudioFiles = [];
  return files;
};
