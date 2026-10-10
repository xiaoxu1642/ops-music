import { describe, expect, it } from "vitest";

import {
  DEFAULT_SIDEBAR_NAV_GROUPS,
  SIDEBAR_GROUP_MY_PLAYLISTS,
  SIDEBAR_GROUP_SUBSCRIBED,
} from "@/types/settings";
import { reconcileHiddenKeys, reconcileNavGroups } from "./settings";

const ALL_KEYS = DEFAULT_SIDEBAR_NAV_GROUPS.flatMap((group) => group.keys);

describe("侧边栏导航对账", () => {
  it("剔除已退役路由，并把缺失的导航项补到末组", () => {
    const groups = reconcileNavGroups([
      { name: "", showName: false, keys: ["/", "/library", "/streaming"] },
    ]);

    const keys = groups.flatMap((group) => group.keys);
    expect(keys).not.toContain("/streaming");
    expect(keys).toContain("/");
    expect(keys).toContain("/library");
    // 其余当前仍存在的导航项应全部补齐，且不重复
    for (const key of ALL_KEYS) expect(keys).toContain(key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("存档无效时回退默认分组", () => {
    const groups = reconcileNavGroups(undefined);
    expect(groups).toEqual(
      DEFAULT_SIDEBAR_NAV_GROUPS.map((group) => ({ ...group, keys: [...group.keys] })),
    );
  });
});

describe("侧边栏隐藏键对账", () => {
  it("保留歌单分组与歌单路由键，剔除已退役路由与首页", () => {
    const stored = [
      "/",
      "/streaming",
      SIDEBAR_GROUP_MY_PLAYLISTS,
      SIDEBAR_GROUP_SUBSCRIBED,
      "/collection/netease/playlist/123",
      "/liked",
    ];

    const kept = reconcileHiddenKeys(stored);

    expect(kept).not.toContain("/");
    expect(kept).not.toContain("/streaming");
    expect(kept).toContain(SIDEBAR_GROUP_MY_PLAYLISTS);
    expect(kept).toContain(SIDEBAR_GROUP_SUBSCRIBED);
    expect(kept).toContain("/collection/netease/playlist/123");
    expect(kept).toContain("/liked");
  });
});
