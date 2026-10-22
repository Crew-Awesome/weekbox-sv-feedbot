import type { FeedPost, FeedProvider, RelayState, StateStore } from "../types.js";
import { chronological, isEligible, toFeedPost } from "./filters.js";

const MAX_PAGES = 20;

export async function synchronize(provider: FeedProvider, store: StateStore, send: (post: FeedPost) => Promise<void>, now = new Date()): Promise<{ delivered: number; baseline: boolean }> {
  const state = (await store.load()) ?? { version: 1, deliveredTweetIds: [], pendingTweetIds: [], source: { strategy: "list" as const }, baselineInitialized: false };
  const fetched = [] as ReturnType<typeof toFeedPost>[];
  let cursor = state.source.cursor;
  for (let pageNumber = 0; pageNumber < MAX_PAGES; pageNumber++) {
    const page = await provider.fetch(cursor);
    fetched.push(...page.tweets.filter(isEligible).map(toFeedPost));
    if (!page.nextCursor || page.tweets.length === 0 || (state.lastSuccessfulSync && page.tweets.some((tweet) => tweet.created_at && Date.parse(tweet.created_at) <= Date.parse(state.lastSuccessfulSync!)))) break;
    cursor = page.nextCursor;
  }
  const unique = chronological([...new Map(fetched.map((post) => [post.id, post])).values()]).filter((post) => !state.lastSuccessfulSync || Date.parse(post.createdAt) > Date.parse(state.lastSuccessfulSync));
  if (!state.baselineInitialized) {
    state.deliveredTweetIds.push(...unique.map((post) => post.id));
    state.source = { strategy: "list", ...(unique.at(-1) ? { lastSeenTweetId: unique.at(-1)!.id } : {}) };
    state.baselineInitialized = true;
    state.lastSuccessfulSync = now.toISOString();
    await store.save(state);
    return { delivered: 0, baseline: true };
  }
  const delivered = new Set(state.deliveredTweetIds);
  let deliveredCount = 0;
  for (const post of unique.filter((item) => !delivered.has(item.id))) {
    state.pendingTweetIds = [...new Set([...state.pendingTweetIds, post.id])];
    await store.save(state);
    await send(post);
    state.pendingTweetIds = state.pendingTweetIds.filter((id) => id !== post.id);
    state.deliveredTweetIds.push(post.id);
    delivered.add(post.id);
    deliveredCount++;
    await store.save(state);
  }
  state.source = { strategy: "list", ...(unique.at(-1) ? { lastSeenTweetId: unique.at(-1)!.id } : {}) };
  state.lastSuccessfulSync = now.toISOString();
  await store.save(state);
  return { delivered: deliveredCount, baseline: false };
}
