import { getConfig } from "./config.js";
import { EmusksListProvider } from "./providers/emusks.js";
import { sendDiscord } from "./services/discord.js";
import { synchronize } from "./services/feed.js";
import { FileStateStore } from "./services/state.js";

async function main(): Promise<void> {
  const config = getConfig();
  const provider = await EmusksListProvider.create(config.xAuthToken);
  const result = await synchronize(provider, new FileStateStore(config.statePath), config.dryRun || !config.discordWebhookUrl ? async (post) => {
    console.log(`[dry-run] ${post.id} @${post.author.username} ${post.tweetUrl}`);
  } : (post) => sendDiscord(config.discordWebhookUrl!, post));
  console.log(result.baseline ? "Baseline initialized; no posts sent" : `Synchronization complete; delivered ${result.delivered} post(s)`);
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : "Unknown error";
  console.error(`Relay failed: ${message}`);
  process.exitCode = 1;
});
