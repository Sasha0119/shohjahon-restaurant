import type { RequestHandler } from "express";
import multer from "multer";
import { audit } from "../audit.ts";
import type { Db } from "../db.ts";
import { ApiError, errors } from "../http/errors.ts";
import type { createRegistrar } from "../http/registrar.ts";
import type { ImageStore } from "./image-store.ts";

type On = ReturnType<typeof createRegistrar>["on"];

export function registerUploadRoutes(on: On, db: Db, store: ImageStore, maxMb: number) {
  const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: maxMb * 1024 * 1024, files: 1, fields: 0, parts: 2 },
  }).single("image");

  // Multer errors → our error format.
  const receive: RequestHandler = (req, res, next) =>
    upload(req, res, (err: unknown) => {
      if (!err) return next();
      if (err instanceof multer.MulterError) {
        if (err.code === "LIMIT_FILE_SIZE") {
          return next(new ApiError(413, "IMAGE_TOO_LARGE", `Photos can be up to ${maxMb} MB.`));
        }
        return next(errors.badRequest("BAD_UPLOAD", "Send one photo in the \"image\" field."));
      }
      next(err);
    });

  on("POST", "/api/admin/uploads/images", receive, async (req, res) => {
    if (!req.file) throw errors.badRequest("BAD_UPLOAD", "Send one photo in the \"image\" field.");
    const saved = await store.save(req.file.buffer);
    await audit(db, {
      actor: { type: "staff", staffId: req.staff!.id },
      action: "image.uploaded",
      entityType: "image",
      entityId: saved.url,
      data: { bytes: saved.bytes, width: saved.width, height: saved.height },
      ip: req.ip,
    });
    res.status(201).json(saved);
  });
}

