export interface PromptImage {
  name: string;
  dataUrl: string;
  bytes: number;
}

export const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;
export const MAX_IMAGES = 3;
export const MAX_IMAGE_BYTES = 2 * 1024 * 1024;
// Keep the base64 JSON request below common serverless body limits.
export const MAX_TOTAL_IMAGE_BYTES = 2.5 * 1024 * 1024;
export const MAX_SOURCE_IMAGE_BYTES = 20 * 1024 * 1024;
