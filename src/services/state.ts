import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import type { RelayState, StateStore } from "../types.js";

export const emptyState = (): RelayState => ({ version: 1, deliveredTweetIds: [], pendingTweetIds: [], source: { strategy: "list" }, baselineInitialized: false });

export class FileStateStore implements StateStore {
  constructor(private readonly path: string) {}
  async load(): Promise<RelayState | null> {
    try { return JSON.parse(await readFile(this.path, "utf8")) as RelayState; } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
      throw error;
    }
  }
  async save(state: RelayState): Promise<void> {
    await mkdir(dirname(this.path), { recursive: true });
    const temp = `${this.path}.tmp`;
    await writeFile(temp, `${JSON.stringify(trimState(state), null, 2)}\n`, "utf8");
    await rename(temp, this.path);
  }
}

export function trimState(state: RelayState): RelayState {
  return { ...state, deliveredTweetIds: state.deliveredTweetIds.slice(-5000), pendingTweetIds: [...new Set(state.pendingTweetIds)].slice(-500) };
}

export function mergeStates(local: RelayState, remote: RelayState): RelayState {
  const latest = (local.lastSuccessfulSync ?? "") >= (remote.lastSuccessfulSync ?? "") ? local : remote;
  const deliveredTweetIds = [...new Set([...remote.deliveredTweetIds, ...local.deliveredTweetIds])];
  const pendingTweetIds = [...new Set([...remote.pendingTweetIds, ...local.pendingTweetIds])].filter((id) => !deliveredTweetIds.includes(id));
  const boundary = pendingTweetIds.length ? ((local.lastSuccessfulSync ?? "") <= (remote.lastSuccessfulSync ?? "") ? local : remote) : latest;
  return trimState({
    ...remote,
    ...local,
    deliveredTweetIds,
    pendingTweetIds,
    source: boundary.source,
    baselineInitialized: local.baselineInitialized || remote.baselineInitialized,
    lastSuccessfulSync: boundary.lastSuccessfulSync,
  });
}
