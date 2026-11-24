import { bootstrapRenderer } from "./lifecycle/bootstrap";

void bootstrapRenderer().catch((error) => console.error("[bootstrap] 启动失败", error));
