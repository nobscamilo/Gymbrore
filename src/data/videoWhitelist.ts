export type VideoIntent = "technique" | "warmup" | "cooldown";
export type SessionPhase = "warmup" | "cooldown";

export type WhitelistChannelId =
  | "squat_university"
  | "jeff_nippard"
  | "e3_rehab"
  | "renaissance_periodization";

type WhitelistChannel = {
  id: WhitelistChannelId;
  name: string;
  handlePath: string;
  url: string;
};

export const TRUSTED_YOUTUBE_CHANNELS: Record<WhitelistChannelId, WhitelistChannel> = {
  squat_university: {
    id: "squat_university",
    name: "Squat University",
    handlePath: "@SquatUniversity",
    url: "https://www.youtube.com/@SquatUniversity",
  },
  jeff_nippard: {
    id: "jeff_nippard",
    name: "Jeff Nippard",
    handlePath: "@JeffNippard",
    url: "https://www.youtube.com/@JeffNippard",
  },
  e3_rehab: {
    id: "e3_rehab",
    name: "E3 Rehab",
    handlePath: "@E3Rehab",
    url: "https://www.youtube.com/@E3Rehab",
  },
  renaissance_periodization: {
    id: "renaissance_periodization",
    name: "Renaissance Periodization",
    handlePath: "@RenaissancePeriodization",
    url: "https://www.youtube.com/@RenaissancePeriodization",
  },
};

// Movement-pattern whitelist routing. Keep these strict to avoid noisy sources.
export const CHANNEL_BY_PATTERN: Record<
  "squat" | "hinge" | "lunge" | "push" | "pull" | "core" | "cardio" | "mobility" | "isolation",
  WhitelistChannelId
> = {
  squat: "squat_university",
  hinge: "squat_university",
  lunge: "squat_university",
  push: "jeff_nippard",
  pull: "jeff_nippard",
  isolation: "renaissance_periodization",
  core: "e3_rehab",
  cardio: "e3_rehab",
  mobility: "e3_rehab",
};

export const SESSION_PHASE_VIDEO_WHITELIST: Record<SessionPhase, { en: string; es: string }> = {
  warmup: {
    en: "https://www.youtube.com/@E3Rehab/search?query=full+body+dynamic+warm+up",
    es: "https://www.youtube.com/@E3Rehab/search?query=full+body+dynamic+warm+up",
  },
  cooldown: {
    en: "https://www.youtube.com/@E3Rehab/search?query=full+body+cool+down+mobility+breathing",
    es: "https://www.youtube.com/@E3Rehab/search?query=full+body+cool+down+mobility+breathing",
  },
};

export const buildWhitelistedChannelSearchUrl = (
  channelId: WhitelistChannelId,
  query: string
): string => {
  const channel = TRUSTED_YOUTUBE_CHANNELS[channelId];
  return `https://www.youtube.com/${channel.handlePath}/search?query=${encodeURIComponent(query)}`;
};

export const buildWhitelistedGlobalSearchUrl = (
  channelId: WhitelistChannelId,
  query: string
): string => {
  const channel = TRUSTED_YOUTUBE_CHANNELS[channelId];
  const searchQuery = `${query} ${channel.name}`;
  return `https://www.youtube.com/results?search_query=${encodeURIComponent(searchQuery)}`;
};
