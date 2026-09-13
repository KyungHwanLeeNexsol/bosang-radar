import { randomUUID } from "node:crypto";
import { getDb } from "../db/client";
import { geminiRequestObservations } from "../db/schema";
import type { GeminiRequestObservation } from "./gemini-fetch-observer";

export async function recordGeminiRequestObservation(
  jobId: string,
  observation: GeminiRequestObservation
): Promise<void> {
  await getDb()
    .insert(geminiRequestObservations)
    .values({
      id: randomUUID(),
      jobId,
      ...observation,
      observedAt: new Date(),
    });
}
