/**
 * Phase 3A infrastructure placeholder.
 *
 * S3 notifications must remain disabled while this code is deployed. The real
 * idempotent image processor, derivative generation, and processing-result
 * writes are Phase 3C work.
 */
export async function handler(event) {
  const recordCount = Array.isArray(event?.Records) ? event.Records.length : 0;

  console.log(
    JSON.stringify({
      phase: "3A",
      status: "placeholder",
      recordCount,
    }),
  );

  return {
    phase: "3A",
    status: "placeholder",
    recordCount,
  };
}
