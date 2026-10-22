import type { FeedPost, RawTweet } from "../types.js";
import { ACCOUNTS } from "../config.js";

const allowed = new Set(ACCOUNTS.map((name) => name.toLowerCase()));

export function isEligible(tweet: RawTweet): boolean {
  const username = tweet.user?.username?.toLowerCase();
  return Boolean(username && allowed.has(username) && !tweet.in_reply_to_status_id && !tweet.retweeting && !tweet.id.includes("-"));
}

export function toFeedPost(tweet: RawTweet): FeedPost {
  if (!tweet.user?.username || !tweet.id) throw new Error("Tweet is missing required author or id");
  const author = tweet.user;
  const username = author.username;
  if (!username) throw new Error("Tweet author is missing username");
  const avatarUrl = author.profile_picture?.original ?? author.profile_picture?.url ?? author.profile_image_url ?? author.profileImageUrl ?? author.profile_image_url_https;
  const quoted = tweet.quoting?.id && tweet.quoting.user?.username ? {
    id: tweet.quoting.id,
    text: tweet.quoting.text ?? "",
    username: tweet.quoting.user.username,
    url: `https://x.com/${tweet.quoting.user.username}/status/${tweet.quoting.id}`,
  } : undefined;
  const mediaUrls = (tweet.media ?? []).map((media) => media.media_url_https ?? media.media_url ?? media.url ?? media.preview_image_url ?? media.thumbnail_url).filter((url): url is string => Boolean(url));
  return {
    id: tweet.id,
    text: tweet.text ?? "",
    createdAt: tweet.created_at ? new Date(tweet.created_at).toISOString() : new Date().toISOString(),
    author: { name: author.name ?? username, username, ...(avatarUrl ? { avatarUrl } : {}) },
    mediaUrls,
    tweetUrl: `https://x.com/${username}/status/${tweet.id}`,
    ...(quoted ? { quoted } : {}),
  };
}

export function chronological(posts: FeedPost[]): FeedPost[] {
  return [...posts].sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt));
}
