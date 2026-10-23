import assert from "node:assert/strict";
import test from "node:test";
import { discordPostUrl, formatDiscord } from "../src/services/discord.js";
import { chronological, isEligible, toFeedPost } from "../src/services/filters.js";
import { mergeStates } from "../src/services/state.js";
import type { FeedPost, FeedProvider, RawTweet, RelayState, StateStore } from "../src/types.js";
import { synchronize } from "../src/services/feed.js";
import { normalizeListTimeline } from "../src/providers/emusks.js";

const tweet = (id: string, username = "News_Funkin", time = "2026-01-01T00:00:00Z", extra: Partial<RawTweet> = {}): RawTweet => ({ id, text: id, created_at: time, user: { username, name: username }, ...extra });

test("classifies originals and quotes, excludes replies and reposts", () => {
  assert.equal(isEligible(tweet("1")), true);
  assert.equal(isEligible(tweet("2", "News_Funkin", undefined, { quoting: tweet("q", "other") })), true);
  assert.equal(isEligible(tweet("3", "News_Funkin", undefined, { in_reply_to_status_id: "parent" })), false);
  assert.equal(isEligible(tweet("4", "News_Funkin", undefined, { retweeting: tweet("original", "other") })), false);
  assert.equal(isEligible(tweet("5", "not_allowed")), false);
});

test("orders feed posts chronologically and formats link messages", () => {
  const posts = [toFeedPost(tweet("2", "News_Funkin", "2026-01-02T00:00:00Z")), toFeedPost(tweet("1", "News_Funkin", "2026-01-01T00:00:00Z"))];
  assert.deepEqual(chronological(posts).map((post) => post.id), ["1", "2"]);
  const payload = formatDiscord(posts[0]!);
  assert.equal(payload.allowed_mentions.parse.length, 0);
  assert.deepEqual(payload.allowed_mentions.roles, ["1562415407518846986"]);
  assert.match(payload.content, /<@&1562415407518846986> \*\*New post from @News_Funkin\*\*\nhttps:\/\/fixupx\.com\//);
  assert.equal(payload.content.includes("!"), false);
  assert.equal("embeds" in payload, false);
  assert.equal(discordPostUrl(posts[0]!.tweetUrl), "https://fixupx.com/News_Funkin/status/2");

  const developersPost = formatDiscord(toFeedPost(tweet("3", "FNF_Developers")));
  assert.deepEqual(developersPost.allowed_mentions.roles, ["1562415407518846986"]);

  const otherAccount = formatDiscord(toFeedPost(tweet("4", "Discussingfnf")));
  assert.deepEqual(otherAccount.allowed_mentions.roles, []);
  assert.equal(otherAccount.content.includes("<@&1562415407518846986>"), false);
});

class MemoryStore implements StateStore {
  constructor(private state: RelayState | null = null) {}
  async load() { return this.state; }
  async save(state: RelayState) { this.state = structuredClone(state); }
}

class Pages implements FeedProvider {
  calls = 0;
  constructor(private readonly pages: Array<{ tweets: RawTweet[]; nextCursor?: string }>) {}
  async fetch() { return this.pages[this.calls++] ?? { tweets: [] }; }
}

test("initializes a baseline and prevents duplicate delivery", async () => {
  const store = new MemoryStore();
  const provider = new Pages([{ tweets: [tweet("1"), tweet("2")] }]);
  const sent = { ids: [] as string[] };
  assert.equal((await synchronize(provider, store, async (post) => { sent.ids.push(post.id); }, new Date("2026-01-01T00:00:00.000Z"))).baseline, true);
  assert.deepEqual(sent.ids, []);
  const second = new Pages([{ tweets: [tweet("1"), tweet("2"), tweet("3", "News_Funkin", "2026-01-02T00:00:00Z")] }]);
  const result = await synchronize(second, store, async (post: FeedPost) => { sent.ids.push(post.id); }, new Date("2026-01-02T01:00:00.000Z"));
  assert.equal(result.delivered, 1);
  assert.deepEqual(sent.ids, ["3"]);
});

test("pagination catches up and leaves failed delivery pending", async () => {
  const store = new MemoryStore({ version: 1, deliveredTweetIds: ["1"], pendingTweetIds: [], source: { strategy: "list" }, lastSuccessfulSync: "2026-01-01T00:00:00.000Z", baselineInitialized: true });
  const provider = new Pages([{ tweets: [tweet("3", "News_Funkin", "2026-01-03T00:00:00Z")], nextCursor: "next" }, { tweets: [tweet("2", "News_Funkin", "2026-01-02T00:00:00Z")] }]);
  await assert.rejects(() => synchronize(provider, store, async () => { throw new Error("webhook down"); }));
  assert.deepEqual((await store.load())!.pendingTweetIds, ["2"]);
});

test("merges state without losing delivered IDs", () => {
  const base: RelayState = { version: 1, deliveredTweetIds: ["a"], pendingTweetIds: [], source: { strategy: "list" }, baselineInitialized: true };
  assert.deepEqual(mergeStates({ ...base, deliveredTweetIds: ["b"] }, base).deliveredTweetIds.sort(), ["a", "b"]);
});

test("normalizes emusks list GraphQL pages", () => {
  const page = normalizeListTimeline({
    data: {
      list: {
        tweets_timeline: {
          timeline: {
            instructions: [{
              type: "TimelineAddEntries",
              entries: [
                {
                  entryId: "tweet-1",
                  content: {
                    itemContent: {
                      tweet_results: {
                        result: {
                          rest_id: "1",
                          legacy: { id_str: "1", full_text: "hello", created_at: "2026-01-01T00:00:00Z" },
                          core: { user_results: { result: { rest_id: "7", core: { name: "News", screen_name: "News_Funkin" }, avatar: { image_url: "https://pbs.twimg.com/profile_images/test.jpg" } } } },
                        },
                      },
                    },
                  },
                },
                { entryId: "cursor-bottom-1", content: { entryType: "TimelineTimelineCursor", cursorType: "Bottom", value: "next" } },
              ],
            }],
          },
        },
      },
    },
  });
  assert.equal(page.tweets[0]!.user?.username, "News_Funkin");
  assert.equal(page.nextCursor, "next");
});
