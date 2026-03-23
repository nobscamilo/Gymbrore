const ALLOWED_GENAI_MODELS = new Set([
  "gemini-2.0-flash",
  "gemini-2.5-flash",
  "gemini-pro-latest",
  "gemini-2.5-pro",
]);

const DEFAULT_GENAI_MODEL = "gemini-2.0-flash";

export const resolveGenAiApiKey = (): string | null => {
  const geminiApiKey = process.env.GEMINI_API_KEY?.trim();
  if (geminiApiKey) {
    return geminiApiKey;
  }

  const googleGenAiApiKey = process.env.GOOGLE_GENAI_API_KEY?.trim();
  if (googleGenAiApiKey) {
    return googleGenAiApiKey;
  }

  return null;
};

export const resolveGenAiModel = (): string => {
  const preferredModel =
    process.env.GOOGLE_GENAI_MODEL ??
    process.env.GEMINI_MODEL ??
    DEFAULT_GENAI_MODEL;
  return ALLOWED_GENAI_MODELS.has(preferredModel)
    ? preferredModel
    : DEFAULT_GENAI_MODEL;
};
