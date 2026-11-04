import { randomBytes } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { ApiError } from "../http/errors.ts";

/**
 * Where uploaded menu photos go. Local disk now; an S3-style store can
 * implement the same interface later without touching the routes.
 */
export interface ImageStore {
  /** Returns the public path, e.g. "/uploads/3f9a….webp". */
  save(file: Buffer): Promise<{ url: string; width: number; height: number; bytes: number }>;
}

export const IMAGE_LIMITS = {
  maxEdge: 1600,
  minEdge: 200,
  /** Refuse decompression bombs. */
  maxInputPixels: 40_000_000,
  quality: 80,
} as const;

/**
 * Decode → auto-rotate → resize → re-encode as WebP. Re-encoding means the
 * stored file is always a clean image: EXIF (incl. GPS) and anything hidden
 * in the original are dropped, and non-images fail to decode.
 */
export async function processImage(input: Buffer): Promise<{ data: Buffer; width: number; height: number }> {
  let pipeline;
  try {
    pipeline = sharp(input, { limitInputPixels: IMAGE_LIMITS.maxInputPixels, failOn: "error" });
    const meta = await pipeline.metadata();
    if (!meta.width || !meta.height) throw new Error("no dimensions");
    if (Math.min(meta.width, meta.height) < IMAGE_LIMITS.minEdge) {
      throw new ApiError(422, "IMAGE_TOO_SMALL", `Please use a photo at least ${IMAGE_LIMITS.minEdge} px on each side.`);
    }
  } catch (e) {
    if (e instanceof ApiError) throw e;
    throw new ApiError(415, "UNSUPPORTED_IMAGE", "That file isn't a supported image (JPEG, PNG, WebP or AVIF).");
  }
  const { data, info } = await pipeline
    .rotate()
    .resize({ width: IMAGE_LIMITS.maxEdge, height: IMAGE_LIMITS.maxEdge, fit: "inside", withoutEnlargement: true })
    .webp({ quality: IMAGE_LIMITS.quality })
    .toBuffer({ resolveWithObject: true });
  return { data, width: info.width, height: info.height };
}

export function createLocalImageStore(dir: string): ImageStore {
  const root = path.resolve(dir);
  return {
    async save(file) {
      const { data, width, height } = await processImage(file);
      await mkdir(root, { recursive: true });
      const name = `${randomBytes(16).toString("hex")}.webp`;
      await writeFile(path.join(root, name), data, { flag: "wx" });
      return { url: `/uploads/${name}`, width, height, bytes: data.length };
    },
  };
}
