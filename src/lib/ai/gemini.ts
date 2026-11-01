/** Kept so older imports keep working; everything lives in ./client now. */
export {
  aiJson as geminiJson,
  AiRateLimitError,
  GeminiRateLimitError,
  currentIntervalMs,
  parseThrottle,
  GEMINI_MODEL,
  type ThrottleScope,
} from "./client";
