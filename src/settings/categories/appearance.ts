import type { SettingCategory } from "@/types/settings-schema";
import SidebarCustomizeConfig from "@/components/settings/custom/SidebarCustomizeConfig.vue";
import IconLucidePalette from "~icons/lucide/palette";

const appearanceCategory: SettingCategory = {
  id: "appearance",
  icon: IconLucidePalette,
  sections: [
    {
      id: "layout",
      items: [
        {
          key: "layoutMode",
          type: "select",
          binding: { store: "settings", path: "appearance.layoutMode" },
          options: [
            { value: "default", labelKey: "settings.layoutMode.default" },
            { value: "sidebar-full", labelKey: "settings.layoutMode.sidebarFull" },
            { value: "floating", labelKey: "settings.layoutMode.floating" },
          ],
          defaultValue: "default",
        },
        {
          key: "routeTransition",
          type: "select",
          binding: { store: "settings", path: "appearance.routeTransition" },
          options: [
            { value: "none", labelKey: "settings.routeTransition.none" },
            { value: "fade", labelKey: "settings.routeTransition.fade" },
            { value: "slide", labelKey: "settings.routeTransition.slide" },
            { value: "zoom", labelKey: "settings.routeTransition.zoom" },
          ],
          defaultValue: "fade",
        },
        {
          key: "sidebarCollapsed",
          type: "switch",
          binding: { store: "settings", path: "appearance.sidebarCollapsed" },
          defaultValue: false,
        },
        {
          key: "sidebarPlaylistCover",
          type: "switch",
          binding: { store: "settings", path: "appearance.sidebarPlaylistCover" },
          defaultValue: false,
        },
        {
          key: "sidebarCustomize",
          type: "custom",
          component: SidebarCustomizeConfig,
        },
        {
          key: "showQualitySwitch",
          type: "switch",
          binding: { store: "settings", path: "appearance.showQualitySwitch" },
          defaultValue: false,
        },
      ],
    },
    {
      id: "playerBar",
      items: [
        {
          key: "showLyricInBar",
          type: "switch",
          binding: { store: "settings", path: "player.showLyricInBar" },
          defaultValue: true,
        },
        {
          key: "showProgressTooltip",
          type: "switch",
          binding: { store: "settings", path: "player.showProgressTooltip" },
          defaultValue: true,
          children: [
            {
              key: "showProgressLyric",
              type: "switch",
              binding: { store: "settings", path: "player.showProgressLyric" },
              defaultValue: false,
            },
          ],
        },
        {
          key: "snapToLyric",
          type: "switch",
          binding: { store: "settings", path: "player.snapToLyric" },
          defaultValue: false,
        },
        {
          key: "timeFormat",
          type: "select",
          binding: { store: "settings", path: "player.timeFormat" },
          options: [
            { value: "current-total", labelKey: "settings.timeFormat.currentTotal" },
            { value: "remaining-total", labelKey: "settings.timeFormat.remainingTotal" },
            { value: "current-remaining", labelKey: "settings.timeFormat.currentRemaining" },
          ],
          defaultValue: "current-total",
          descriptionKey: "settings.timeFormat.description",
        },
      ],
    },
    {
      id: "nowPlaying",
      items: [
        {
          key: "coverLayout",
          type: "select",
          binding: { store: "settings", path: "player.coverLayout" },
          options: [
            { value: "default", labelKey: "settings.coverLayout.default" },
            { value: "fullscreen", labelKey: "settings.coverLayout.fullscreen" },
          ],
          defaultValue: "default",
        },
        {
          key: "coverLyricRatio",
          type: "slider",
          binding: { store: "settings", path: "player.coverLyricRatio" },
          min: 0.3,
          max: 0.6,
          step: 0.05,
          defaultValue: 0.45,
          marks: { 0.3: "30%", 0.45: "45%", 0.6: "60%" },
        },
        {
          key: "autoCenterCover",
          type: "switch",
          binding: { store: "settings", path: "player.autoCenterCover" },
          defaultValue: true,
        },
        {
          key: "showPlaybackSource",
          type: "switch",
          binding: { store: "settings", path: "player.showPlaybackSource" },
          defaultValue: false,
        },
        {
          key: "followCoverColor",
          type: "switch",
          binding: { store: "settings", path: "player.followCoverColor" },
          defaultValue: true,
        },
        {
          key: "autoImmersive",
          type: "switch",
          binding: { store: "settings", path: "player.autoImmersive" },
          defaultValue: false,
        },
      ],
    },
  ],
};

export default appearanceCategory;
