import * as player from "@/core/player";
import { isAudioFile } from "@shared/utils/audioFile";

/**
 * 接入拖拽音频文件播放
 */
export const useExternalFileHandler = (): void => {
  const onDragOver = (event: DragEvent): void => {
    event.preventDefault();
    if (event.dataTransfer) {
      event.dataTransfer.dropEffect = "copy";
    }
  };

  const onDrop = async (event: DragEvent): Promise<void> => {
    event.preventDefault();
    const dt = event.dataTransfer;
    if (!dt?.files || dt.files.length === 0) return;

    const filePaths: string[] = [];
    for (const file of Array.from(dt.files)) {
      const filePath = window.api.system.getPathForFile(file);
      if (filePath && isAudioFile(filePath)) {
        filePaths.push(filePath);
      }
    }

    if (filePaths.length > 0) {
      await player.playFiles(filePaths);
    }
  };

  onMounted(() => {
    // 全局拖拽播放支持
    window.addEventListener("dragover", onDragOver);
    window.addEventListener("drop", onDrop);
  });

  onBeforeUnmount(() => {
    window.removeEventListener("dragover", onDragOver);
    window.removeEventListener("drop", onDrop);
  });
};
