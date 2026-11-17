import fs from "node:fs";
const p = ".birdview/architecture.json";
const a = JSON.parse(fs.readFileSync(p, "utf8"));
a.schemaVersion = 1;
a.modules = a.modules.map((m) => ({
  ...m,
  ownership: m.ownership.map((path) => ({
    kind: path.endsWith("/") || path.endsWith(".ts") === false && !path.includes(".") ? "directory" : "file",
    path,
  })),
}));
for (const m of a.modules) {
  for (const o of m.ownership) {
    if (["package.json", "electron.vite.config.ts", "electron-builder.config.ts"].includes(o.path)) o.kind = "file";
  }
}
fs.writeFileSync(p, JSON.stringify(a, null, 2) + "\n");
console.log("fixed schemaVersion and ownership");
