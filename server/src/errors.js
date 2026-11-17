import { ZodError } from "zod";

export class HttpError extends Error {
  constructor(status, message, code) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export const errorHandler = (err, _req, res, _next) => {
  if (err instanceof ZodError) {
    res.status(400).json({ error: "Invalid request", issues: err.issues.map((i) => ({ path: i.path.join("."), message: i.message })) });
    return;
  }
  if (err instanceof HttpError) {
    res.status(err.status).json({ error: err.message, code: err.code });
    return;
  }
  if (err?.name === "CastError") {
    res.status(404).json({ error: "Not found" });
    return;
  }
  if (err?.type === "entity.parse.failed") {
    res.status(400).json({ error: "Malformed JSON" });
    return;
  }
  console.error(err);
  res.status(500).json({ error: "Internal error" });
};
