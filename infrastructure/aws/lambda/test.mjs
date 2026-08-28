import assert from "node:assert/strict";
import test from "node:test";
import sharp from "sharp";

process.env.ORIGINALS_BUCKET = "test-originals";
process.env.WEB_BUCKET = "test-web";
const { createDerivatives, parseSourceKey, SourceValidationError } = await import("./index.mjs");

test("parses only immutable source keys", () => {
  assert.deepEqual(
    parseSourceKey("originals/moments/moment-1/photos/photo-1/source.jpg"),
    { momentId: "moment-1", photoId: "photo-1", extension: "jpg" },
  );
  assert.equal(parseSourceKey("processing-results/photo-1.json"), null);
  assert.equal(parseSourceKey("originals/moments/../photos/photo/source.jpg"), null);
});

test("creates deterministic WebP dimensions without enlargement", async () => {
  const source = await sharp({
    create: { width: 2000, height: 1000, channels: 3, background: "#59728a" },
  }).jpeg().toBuffer();
  const derivatives = await createDerivatives(source, "jpg");
  assert.deepEqual(
    { width: derivatives.display.width, height: derivatives.display.height },
    { width: 1536, height: 768 },
  );
  assert.deepEqual(
    { width: derivatives.thumbnail.width, height: derivatives.thumbnail.height },
    { width: 768, height: 384 },
  );
  assert.equal((await sharp(derivatives.display.data).metadata()).format, "webp");
});

test("rejects content whose detected type differs from its source extension", async () => {
  const png = await sharp({
    create: { width: 16, height: 16, channels: 3, background: "white" },
  }).png().toBuffer();
  await assert.rejects(
    createDerivatives(png, "jpg"),
    (error) => error instanceof SourceValidationError && error.code === "TYPE_MISMATCH",
  );
});
