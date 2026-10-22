import Emusks from "emusks";
import { LIST_ID } from "../config.js";
import type { FeedProvider, ProviderPage, RawTweet } from "../types.js";

type TimelineClient = { lists: { timeline: (id: string, opts?: { count?: number; cursor?: string }) => Promise<{ tweets: RawTweet[]; nextCursor?: string }> } };

type Json = Record<string, any>;

function findInstructions(value: unknown): Json[] | null {
  if (!value || typeof value !== "object") return null;
  if (Array.isArray((value as Json).instructions)) return (value as Json).instructions;
  for (const child of Object.values(value as Json)) {
    const found = findInstructions(child);
    if (found) return found;
  }
  return null;
}

function parseUser(raw: Json | undefined): RawTweet["user"] {
  if (!raw) return undefined;
  const legacy = raw.legacy ?? raw.core ?? raw;
  const username = legacy.screen_name ?? legacy.username ?? raw.username;
  if (!username) return undefined;
  const image = raw.avatar?.image_url ?? legacy.profile_image_url_https ?? legacy.profile_image_url;
  return {
    id: raw.rest_id ?? raw.id ?? legacy.id_str ?? legacy.id,
    name: legacy.name ?? username,
    username,
    ...(image ? { profile_picture: { url: image, original: image.replace("_normal", "") } } : {}),
  };
}

function parseTweet(raw: Json | undefined): RawTweet | undefined {
  if (!raw || raw.__typename === "TweetTombstone" || raw.__typename === "TweetUnavailable") return undefined;
  const data = raw.data?.tweet ?? raw;
  const legacy = data.legacy ?? data;
  const user = parseUser(data.core?.user_results?.result ?? data.user_results?.result ?? data.user);
  if (!data.rest_id && !legacy.id_str) return undefined;
  const quoted = parseTweet(data.quoted_status_result?.result ?? legacy.quoted_status);
  const retweeting = parseTweet(legacy.retweeted_status_result?.result ?? legacy.retweeted_status);
  return {
    id: data.rest_id ?? legacy.id_str,
    text: legacy.full_text ?? legacy.text ?? data.text ?? "",
    created_at: legacy.created_at ?? data.created_at,
    user,
    in_reply_to_status_id: legacy.in_reply_to_status_id_str ?? data.in_reply_to_status_id_str ?? null,
    quoting: quoted,
    retweeting,
    media: legacy.extended_entities?.media ?? legacy.entities?.media ?? [],
    urls: legacy.entities?.urls ?? [],
  };
}

function entryTweet(entry: Json): RawTweet | undefined {
  const content = entry.content ?? entry.item?.itemContent ?? {};
  const direct = parseTweet(content.itemContent?.tweet_results?.result ?? content.tweet_results?.result);
  if (direct) return direct;
  for (const item of content.items ?? []) {
    const tweet = parseTweet(item.item?.itemContent?.tweet_results?.result ?? item.item?.itemContent?.tweetResult?.result);
    if (tweet) return tweet;
  }
  return undefined;
}

export function normalizeListTimeline(raw: unknown): ProviderPage {
  const direct = raw as { tweets?: RawTweet[]; nextCursor?: string };
  if (Array.isArray(direct?.tweets)) return { tweets: direct.tweets, ...(direct.nextCursor ? { nextCursor: direct.nextCursor } : {}) };
  const tweets: RawTweet[] = [];
  let nextCursor: string | undefined;
  for (const instruction of findInstructions(raw) ?? []) {
    for (const entry of instruction.entries ?? (instruction.entry ? [instruction.entry] : [])) {
      const tweet = entryTweet(entry);
      if (tweet) tweets.push(tweet);
      const content = entry.content ?? {};
      const cursor = content.value ?? content.itemContent?.value;
      if ((entry.entryId ?? "").includes("cursor-bottom") || content.cursorType === "Bottom") nextCursor = cursor;
    }
    for (const item of instruction.moduleItems ?? []) {
      const tweet = parseTweet(item.item?.itemContent?.tweet_results?.result);
      if (tweet) tweets.push(tweet);
    }
  }
  return { tweets: [...new Map(tweets.map((tweet) => [tweet.id, tweet])).values()], ...(nextCursor ? { nextCursor } : {}) };
}

export class EmusksListProvider implements FeedProvider {
  private constructor(private readonly client: TimelineClient) {}

  static async create(authToken: string): Promise<EmusksListProvider> {
    const client = new Emusks() as unknown as { login: (token: string) => Promise<unknown>; lists: TimelineClient["lists"] };
    await client.login(authToken);
    return new EmusksListProvider(client);
  }

  async fetch(cursor?: string): Promise<ProviderPage> {
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const raw = await this.client.lists.timeline(LIST_ID, { count: 50, ...(cursor ? { cursor } : {}) });
        return normalizeListTimeline(raw);
      } catch (error) {
        const status = (error as { status?: number }).status;
        if (status !== 429 || attempt === 2) throw error;
        await new Promise((resolve) => setTimeout(resolve, Math.min(30_000, 1_000 * 2 ** attempt)));
      }
    }
    throw new Error("Unreachable");
  }
}
