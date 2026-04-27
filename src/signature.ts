import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Validate Meta's `X-Hub-Signature-256` header against the raw request body.
 * Returns true if the signature matches the HMAC-SHA256 of the body keyed with `secret`.
 */
export function verifyMetaSignature(
  rawBody: Buffer | string,
  signatureHeader: string | undefined,
  secret: string,
): boolean {
  if (!signatureHeader || !signatureHeader.startsWith("sha256=")) return false;
  const provided = signatureHeader.slice("sha256=".length);
  const expected = createHmac("sha256", secret)
    .update(rawBody)
    .digest("hex");
  if (provided.length !== expected.length) return false;
  try {
    return timingSafeEqual(Buffer.from(provided, "hex"), Buffer.from(expected, "hex"));
  } catch {
    return false;
  }
}
