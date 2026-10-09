import { fetch as undiciFetch, Agent } from "undici";
import type { Dispatcher } from "undici";
import crypto from "node:crypto";

let defaultDispatcher: Dispatcher | null = null;

/** 默认直连 dispatcher（允许 legacy renegotiation） */
const getDefaultDispatcher = (): Dispatcher => {
  if (!defaultDispatcher) {
    defaultDispatcher = new Agent({
      connect: {
        secureOptions: crypto.constants.SSL_OP_LEGACY_SERVER_CONNECT,
      },
    });
  }
  return defaultDispatcher;
};

/** Node fetch 包装：统一使用 undici 并注入支持 legacy SSL 的 dispatcher */
export const fetchWithLegacySsl = (input: string | URL, init?: RequestInit): Promise<Response> => {
  const dispatcher = getDefaultDispatcher();
  return undiciFetch(input, { ...(init as RequestInit), dispatcher } as Parameters<
    typeof undiciFetch
  >[1]) as unknown as Promise<Response>;
};
