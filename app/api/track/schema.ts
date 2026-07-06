import { z } from "zod";

export const trackSchema = z.object({
  path: z.string().min(1).max(500),
  clubSlug: z.string().min(1).max(100),
  listSlug: z.string().min(1).max(100).nullish(),
  referrer: z.string().max(1000).nullish(),
});

export type TrackPayload = z.infer<typeof trackSchema>;
