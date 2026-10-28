export const limits = {
  content: 2000,
  contact: 200,
  userId: 128,
  projectVersion: 64,
  sourcePage: 2048,
  note: 5000,
  images: 3,
  imageBytes: 5 * 1024 * 1024,
  requestBytes: 16 * 1024 * 1024,
  metadataBytes: 16384,
  pixels: 20000000,
} as const;
