import fs from "node:fs";
const p = ".birdview/architecture.json";
const a = JSON.parse(fs.readFileSync(p, "utf8"));
for (const m of a.modules) {
  m.ownership = m.ownership.map((o) => ({ ...o, path: o.path.replace(/\/+$/, "") }));
}
fs.writeFileSync(p, JSON.stringify(a, null, 2) + "\n");
console.log("normalized ownership paths");
