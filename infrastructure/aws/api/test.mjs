import assert from "node:assert/strict";
import { objectPath, parseCookieHeader, parseUploadBatch, recordId, validateMomentInput } from "./index.mjs";

assert.deepEqual(parseCookieHeader("a=1; our_pictures_session=token"), { a: "1", our_pictures_session: "token" });
assert.deepEqual(validateMomentInput({ date: "2026-09-03", title: " x ", location: "", caption: "" }), { date: "2026-09-03", title: "x", location: null, caption: null });
assert.equal(parseUploadBatch({ files: [{ clientId: "one", filename: "a.jpg", contentType: "image/jpeg", byteSize: 1, checksum: `${"A".repeat(43)}=` }] })[0].extension, "jpg");
assert.throws(() => parseUploadBatch({ files: [] }));
assert.equal(recordId("2026-08-27"), "2026-08-27");
assert.throws(() => recordId("../bad"));
assert.equal(objectPath("/photos/sample-01.jpg"), "/photos/sample-01.jpg");
assert.equal(objectPath("moments/id/photo.webp"), "/moments/id/photo.webp");
console.log("serverless API checks passed");
