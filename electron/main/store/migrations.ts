import { rmSync } from "node:fs";
import path from "node:path";
import { HOTKEY_ACTIONS } from "@shared/defaults/hotkeys";
import type { SystemConfig } from "@shared/types/settings";

/** 存档中的配置版本键名 */
export const META_KEY = "__configVersion";

/**
 * 退役功能在存档里留下的字段，当前 SystemConfig 已不再声明它们，
 * 迁移只能把这些节点当作未知 key 的 Record 来读写，断言集中于此
 */
type LegacyRecord = Record<string, unknown>;

const asLegacy = (value: unknown): LegacyRecord => value as LegacyRecord;

/** 已退役的顶层配置 */
const RETIRED_ROOT_KEYS = ["lastfm", "externalApi", "streaming", "desktopLyric", "dynamicIsland"];
/** 已退役的 system 子项 */
const RETIRED_SYSTEM_KEYS = ["networkProxy", "neteaseRealIp", "kugouLoginVersion"];
/** 已退役窗口的状态存档项 */
const RETIRED_WINDOW_STATE_KEYS = ["desktopLyric", "dynamicIsland"];
/** 已退役的独立文件，历史上直接写在配置目录下 */
const RETIRED_FILES = ["streaming.json", "lastfm.json", "ai-models.json"];

/** 当前注册的快捷键动作，用于剔除存档里的孤儿绑定 */
const KNOWN_HOTKEY_IDS = new Set<string>(HOTKEY_ACTIONS.map((meta) => meta.id));

interface Migration {
  /** 版本号，递增整数 */
  version: number;
  /**
   * 迁移函数，直接修改 data 对象
   * @param data - 与默认值合并后的配置
   * @param configDir - 配置目录，用于清理退役文件
   */
  migrate: (data: SystemConfig, configDir: string) => void;
}

/**
 * 迁移列表，按 version 递增排列
 * 新增字段已由 deepMerge 自动补全，此处仅用于删除退役字段、数据转换等
 */
const migrations: Migration[] = [
  {
    version: 1,
    migrate: (data, configDir) => {
      const root = asLegacy(data);
      for (const key of RETIRED_ROOT_KEYS) delete root[key];
      delete asLegacy(root.media).discord;
      for (const key of RETIRED_SYSTEM_KEYS) delete asLegacy(root.system)[key];
      for (const key of RETIRED_WINDOW_STATE_KEYS) delete asLegacy(root.windowStates)[key];

      const bindings = asLegacy(asLegacy(root.hotkeys).bindings);
      for (const id of Object.keys(bindings)) {
        if (!KNOWN_HOTKEY_IDS.has(id)) delete bindings[id];
      }

      for (const file of RETIRED_FILES) rmSync(path.join(configDir, file), { force: true });
    },
  },
  {
    version: 2,
    migrate: (data) => {
      // MCP 服务已退役，清理老存档里遗留的配置
      delete asLegacy(data).mcp;
    },
  },
];

/**
 * 执行版本号高于存档记录的全部迁移，就地写回最高版本
 * deepMerge 会把存档里的 __configVersion 带进 data，版本直接从 data 读取
 * @param data - 与默认值合并后的配置，就地修改
 * @param configDir - 配置目录，供迁移删除退役文件；由调用方传入，避免本模块在 import 期依赖 Electron 的 app 实例
 */
export const runPendingMigrations = (data: SystemConfig, configDir: string): void => {
  const root = asLegacy(data);
  const storedVersion = (root[META_KEY] as number) ?? 0;
  const pending = migrations
    .filter((m) => m.version > storedVersion)
    .sort((a, b) => a.version - b.version);
  for (const m of pending) {
    m.migrate(data, configDir);
    root[META_KEY] = m.version;
  }
};
