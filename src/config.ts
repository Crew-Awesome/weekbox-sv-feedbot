export const ACCOUNTS = [
  "News_Funkin",
  "Discussingfnf",
  "FNF_Developers",
  "Funkininterview",
  "GameBananaFNF",
  "WeekBoxTeam",
  "DirectMania",
  "FunkCon24",
] as const;

export const LIST_ID = "2113396718679269783";

export type Config = {
  xAuthToken: string;
  discordWebhookUrl?: string;
  dryRun: boolean;
  statePath: string;
};

export function getConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const xAuthToken = env.X_AUTH_TOKEN?.trim();
  if (!xAuthToken) throw new Error("X_AUTH_TOKEN is required");
  const webhook = env.DISCORD_WEBHOOK_URL?.trim();
  const dryRun = env.DRY_RUN === "true";
  if (!dryRun && !webhook) throw new Error("DISCORD_WEBHOOK_URL is required unless DRY_RUN=true");
  if (webhook && !/^https:\/\/discord(?:app)?\.com\/api\/webhooks\//.test(webhook)) {
    throw new Error("DISCORD_WEBHOOK_URL must be a Discord webhook URL");
  }
  return { xAuthToken, discordWebhookUrl: webhook, dryRun, statePath: env.RELAY_STATE_PATH ?? ".relay-state/state.json" };
}
