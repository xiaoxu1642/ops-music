import type { SettingCategory } from "@/types/settings-schema";
import ExternalApiStatusCard from "@/components/settings/custom/ExternalApiStatusCard.vue";
import LastfmPanel from "@/components/settings/custom/LastfmPanel.vue";
import IconLucideGlobe from "~icons/lucide/globe";

const servicesCategory: SettingCategory = {
  id: "services",
  icon: IconLucideGlobe,
  sections: [
    {
      id: "media",
      items: [
        {
          key: "systemMediaControls",
          type: "switch",
          binding: { store: "settings", path: "system.media.systemMediaControls" },
          defaultValue: true,
        },
      ],
    },
    {
      id: "discord",
      items: [
        {
          key: "discordEnabled",
          type: "switch",
          binding: { store: "settings", path: "system.media.discord.enabled" },
          defaultValue: false,
          children: [
            {
              key: "discordShowWhenPaused",
              type: "switch",
              binding: { store: "settings", path: "system.media.discord.showWhenPaused" },
              defaultValue: false,
            },
            {
              key: "discordDisplayMode",
              type: "select",
              binding: { store: "settings", path: "system.media.discord.displayMode" },
              options: [
                { value: "name", labelKey: "settings.discordDisplayMode.name" },
                { value: "details", labelKey: "settings.discordDisplayMode.details" },
                { value: "state", labelKey: "settings.discordDisplayMode.state" },
              ],
              defaultValue: "name",
            },
          ],
        },
      ],
    },
    {
      id: "lastfm",
      items: [
        {
          key: "lastfmEnabled",
          type: "switch",
          binding: { store: "settings", path: "system.lastfm.enabled" },
          defaultValue: false,
          children: [
            {
              key: "lastfmAccount",
              type: "custom",
              component: LastfmPanel,
              fullWidth: true,
              keywords: ["settings.lastfm.connect", "settings.lastfm.disconnect"],
            },
            {
              key: "lastfmScrobble",
              type: "switch",
              binding: { store: "settings", path: "system.lastfm.scrobble" },
              defaultValue: true,
            },
            {
              key: "lastfmNowPlaying",
              type: "switch",
              binding: { store: "settings", path: "system.lastfm.nowPlaying" },
              defaultValue: true,
            },
            {
              key: "lastfmLoveSync",
              type: "switch",
              binding: { store: "settings", path: "system.lastfm.loveSync" },
              defaultValue: true,
            },
          ],
        },
      ],
    },
    {
      id: "externalApi",
      tag: { text: "Beta" },
      items: [
        {
          key: "externalApiStatusCard",
          type: "custom",
          component: ExternalApiStatusCard,
          fullWidth: true,
          searchable: false,
        },
        {
          key: "externalApiEnabled",
          type: "switch",
          binding: { store: "settings", path: "system.externalApi.enabled" },
          defaultValue: false,
          children: [
            {
              key: "externalApiWs",
              type: "switch",
              binding: { store: "settings", path: "system.externalApi.wsEnabled" },
              defaultValue: false,
            },
            {
              key: "externalApiAllowLan",
              type: "switch",
              binding: { store: "settings", path: "system.externalApi.allowLan" },
              defaultValue: false,
            },
            {
              key: "externalApiPort",
              type: "number",
              binding: { store: "settings", path: "system.externalApi.port" },
              min: 1024,
              max: 65535,
              defaultValue: 14558,
            },
          ],
        },
      ],
    },
  ],
};

export default servicesCategory;
