import { afterEach, beforeEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { HOTKEY_ACTIONS } from "@shared/defaults/hotkeys";
import { defaultSystemConfig } from "@shared/defaults/settings";
import type { SystemConfig } from "@shared/types/settings";
import { META_KEY, runPendingMigrations } from "./migrations";
import { deepMerge } from "./utils";

/** 退役功能留在老存档里的字段：deepMerge 会把 defaults 没有的 key 原样搬进合并结果 */
const legacyStored = {
  __configVersion: 0,
  lastfm: { user: "old", sessionKey: "secret" },
  externalApi: { enabled: true, port: 18888 },
  streaming: { servers: ["server-1"] },
  desktopLyric: { enabled: true },
  dynamicIsland: { enabled: true },
  media: { systemMediaControls: true, discord: { enabled: true } },
  mcp: { enabled: true, port: 14559, accessKey: "keep-me" },
  system: {
    networkProxy: { mode: "manual" },
    neteaseRealIp: "1.2.3.4",
    kugouLoginVersion: 3,
  },
  windowStates: {
    main: { width: 1200 },
    taskbarLyric: { width: 400 },
    desktopLyric: { width: 800 },
    dynamicIsland: { width: 200 },
  },
  hotkeys: {
    globalEnabled: true,
    bindings: {
      "player.togglePlay": { inApp: "Space", global: "CommandOrControl+Shift+Space" },
      "window.toggleTaskbarLyric": { inApp: "CommandOrControl+B", global: null },
      "window.toggleDesktopLyric": { inApp: "CommandOrControl+L", global: null },
      "window.toggleDynamicIsland": { inApp: "CommandOrControl+I", global: null },
    },
  },
};

const asRecord = (value: unknown): Record<string, unknown> => value as Record<string, unknown>;

/** 迁移涉及的配置目录，每个用例重建一次 */
let configDir: string;

/** 复刻 init / replaceAll 的入口：老存档合并默认值后执行待跑迁移 */
const migrateLegacyArchive = (): SystemConfig => {
  const data = deepMerge(defaultSystemConfig, legacyStored);
  runPendingMigrations(data, configDir);
  return data;
};

beforeEach(() => {
  configDir = mkdtempSync(path.join(tmpdir(), "ops-store-migration-"));
  for (const file of ["streaming.json", "lastfm.json", "ai-models.json", "settings.json"]) {
    writeFileSync(path.join(configDir, file), "{}");
  }
});

afterEach(() => {
  rmSync(configDir, { recursive: true, force: true });
});

describe("退役配置迁移", () => {
  it("删除退役 key，保留 MCP 与系统媒体控件", () => {
    const root = asRecord(migrateLegacyArchive());

    for (const key of ["lastfm", "externalApi", "streaming", "desktopLyric", "dynamicIsland"]) {
      assert.equal(key in root, false, `${key} 应被删除`);
    }
    assert.equal("discord" in asRecord(root.media), false);
    for (const key of ["networkProxy", "neteaseRealIp", "kugouLoginVersion"]) {
      assert.equal(key in asRecord(root.system), false, `system.${key} 应被删除`);
    }

    const windowStates = asRecord(root.windowStates);
    for (const key of ["desktopLyric", "dynamicIsland"]) {
      assert.equal(key in windowStates, false, `windowStates.${key} 应被删除`);
    }
    assert.equal("main" in windowStates, true);
    assert.equal("taskbarLyric" in windowStates, true);

    assert.equal(asRecord(root.mcp).accessKey, "keep-me");
    assert.equal(asRecord(root.media).systemMediaControls, true);
    assert.equal(root[META_KEY], 1);
  });

  it("剔除已下线的快捷键动作，保留仍注册的绑定", () => {
    const hotkeys = asRecord(asRecord(migrateLegacyArchive()).hotkeys);
    const bindings = asRecord(hotkeys.bindings);

    assert.deepEqual(Object.keys(bindings).sort(), HOTKEY_ACTIONS.map((meta) => meta.id).sort());
    assert.equal("window.toggleDesktopLyric" in bindings, false);
    assert.equal("window.toggleDynamicIsland" in bindings, false);
  });

  it("删除退役的独立配置文件，不触碰目录内其他文件", () => {
    migrateLegacyArchive();

    for (const file of ["streaming.json", "lastfm.json", "ai-models.json"]) {
      assert.equal(existsSync(path.join(configDir, file)), false, `${file} 应被删除`);
    }
    assert.equal(existsSync(path.join(configDir, "settings.json")), true);
  });

  it("版本号已达标的存档不再重复执行迁移", () => {
    const data = migrateLegacyArchive();
    writeFileSync(path.join(configDir, "streaming.json"), "{}");

    runPendingMigrations(data, configDir);

    assert.equal(existsSync(path.join(configDir, "streaming.json")), true);
  });
});
