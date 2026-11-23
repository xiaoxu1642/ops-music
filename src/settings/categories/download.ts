import type { SettingCategory } from "@/types/settings-schema";
import DownloadDirConfig from "@/components/settings/custom/DownloadDirConfig.vue";
import IconLucideDownload from "~icons/lucide/download";

const downloadCategory: SettingCategory = {
  id: "download",
  icon: IconLucideDownload,
  sections: [
    {
      id: "downloadLocation",
      items: [
        { key: "downloadDir", type: "custom", component: DownloadDirConfig, fullWidth: true },
      ],
    },
    {
      id: "downloadGeneral",
      items: [
        {
          key: "downloadQuality",
          type: "select",
          binding: { store: "settings", path: "system.download.quality" },
          options: [
            { value: "hi-res", label: "Hi-Res" },
            { value: "lossless", labelKey: "settings.songLevel.lossless" },
            { value: "hq", labelKey: "settings.songLevel.hq" },
            { value: "sq", labelKey: "settings.songLevel.sq" },
            { value: "lq", labelKey: "settings.songLevel.lq" },
          ],
          defaultValue: "lossless",
        },
        {
          key: "downloadUsePlayback",
          type: "switch",
          binding: { store: "settings", path: "system.download.usePlaybackForDownload" },
          defaultValue: false,
        },
        {
          key: "downloadFileTemplate",
          type: "select",
          binding: { store: "settings", path: "system.download.fileTemplate" },
          options: [
            { value: "{title}", labelKey: "settings.downloadFileTemplate.titleOnly" },
            { value: "{artist} - {title}", labelKey: "settings.downloadFileTemplate.artistTitle" },
            { value: "{title} - {artist}", labelKey: "settings.downloadFileTemplate.titleArtist" },
          ],
          defaultValue: "{artist} - {title}",
        },
        {
          key: "downloadFolderScheme",
          type: "select",
          binding: { store: "settings", path: "system.download.folderScheme" },
          options: [
            { value: "none", labelKey: "settings.downloadFolderScheme.none" },
            { value: "artist", labelKey: "settings.downloadFolderScheme.artist" },
            { value: "artist-album", labelKey: "settings.downloadFolderScheme.artistAlbum" },
          ],
          defaultValue: "none",
        },
      ],
    },
  ],
};

export default downloadCategory;
