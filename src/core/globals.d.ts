// 壳在页面侧用到的全局挂点。只声明存在与大致形状，不在这里定义行为。
interface Window {
  __JND_HOST?: { kind: string; channel?: string; entry?: string; [key: string]: unknown };
  __JND_BOOTSTRAP?: any;
  __JND?: any;
  __JND_RUNTIME_STARTED?: boolean;
  __JND_RUNTIME_OWNER?: Record<string, unknown>;
  __JND_META_RUNTIME_STARTED?: boolean;
  __JND_META_RUNTIME_BOOTING?: boolean;
  __JND_EARLY_ACCOUNT_MESSAGES?: unknown[];
  __JND_XIAOCHAO_UPDATE_ADOPTED?: boolean;
  __JND_UNIFIED_LOGIN?: { version: string; providers: readonly string[]; start(provider: string, options?: Record<string, unknown>): Promise<unknown>; cancel(): void; get(): any; subscribe(listener: (state: any) => void): () => void };
  __JND_MICRO_RECOVER?: () => void;
  SGSMODULE?: any;
}
