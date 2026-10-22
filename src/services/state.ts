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
  const latestSync = [local.lastSuccessfulSync, remote.lastSuccessfulSync].filter(Boolean).sort().at(-1);
  return trimState({
    ...remote,
    ...local,
    deliveredTweetIds: [...new Set([...remote.deliveredTweetIds, ...local.deliveredTweetIds])],
    pendingTweetIds: [...new Set([...remote.pendingTweetIds, ...local.pendingTweetIds])].filter((id) => !local.deliveredTweetIds.includes(id)),
    lastSuccessfulSync: latestSync,
  });
}
