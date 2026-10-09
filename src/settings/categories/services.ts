import type { SettingCategory } from "@/types/settings-schema";
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
  ],
};

export default servicesCategory;
