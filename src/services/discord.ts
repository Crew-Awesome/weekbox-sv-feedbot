import type { DiscordPayload, FeedPost } from "../types.js";

export function discordPostUrl(tweetUrl: string): string {
  const url = new URL(tweetUrl);
  if (url.hostname === "x.com") url.hostname = "fixupx.com";
  return url.toString();
}

export function formatDiscord(post: FeedPost): DiscordPayload {
  return {
    content: `**New post from @${post.author.username}**\n${discordPostUrl(post.tweetUrl)}`,
    username: "Weekbox Relay",
    allowed_mentions: { parse: [] },
  };
}

export async function sendDiscord(webhookUrl: string, post: FeedPost, fetchImpl = fetch): Promise<void> {
  for (let attempt = 0; attempt < 5; attempt++) {
    const response = await fetchImpl(`${webhookUrl}?wait=true`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(formatDiscord(post)),
    });
    if (response.ok) return;
    if (response.status !== 429) throw new Error(`Discord webhook failed with HTTP ${response.status}`);
    const body = await response.json().catch(() => ({})) as { retry_after?: number };
    const delay = Math.min(Math.max((body.retry_after ?? 1) * 1000, 250), 30_000);
    await new Promise((resolve) => setTimeout(resolve, delay));
  }
  throw new Error("Discord webhook remained rate limited after 5 attempts");
}
