export type RawUser = {
  id?: string;
  name?: string;
  username?: string;
  profile_image_url?: string;
  profileImageUrl?: string;
  profile_image_url_https?: string;
  profile_picture?: { url?: string; original?: string };
};

export type RawMedia = {
  type?: string;
  media_url_https?: string;
  media_url?: string;
  url?: string;
  preview_image_url?: string;
  thumbnail_url?: string;
};

export type RawTweet = {
  id: string;
  text?: string;
  created_at?: string;
  user?: RawUser;
  in_reply_to_status_id?: string | null;
  quoting?: RawTweet | null;
  retweeting?: RawTweet | null;
  media?: RawMedia[];
  urls?: Array<{ url?: string; expanded_url?: string; display_url?: string }>;
};

export type FeedPost = {
  id: string;
  text: string;
  createdAt: string;
  author: { name: string; username: string; avatarUrl?: string };
  mediaUrls: string[];
  tweetUrl: string;
  quoted?: { id: string; text: string; username: string; url: string };
};

export type ProviderPage = { tweets: RawTweet[]; nextCursor?: string };

export type RelayState = {
  version: 1;
  deliveredTweetIds: string[];
  pendingTweetIds: string[];
  source: { strategy: "list"; cursor?: string; lastSeenTweetId?: string };
  lastSuccessfulSync?: string;
  baselineInitialized: boolean;
};

export type DiscordPayload = {
  content: string;
  username: string;
  allowed_mentions: { parse: []; roles: string[] };
};

export interface FeedProvider {
  fetch(cursor?: string): Promise<ProviderPage>;
}

export interface StateStore {
  load(): Promise<RelayState | null>;
  save(state: RelayState): Promise<void>;
}
