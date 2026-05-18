import { z } from "zod";

export const clubLevelSchema = z.object({
  clubId: z.string().min(1),
  level: z.enum(["regular", "provincial", "national"]),
  province: z.string().nullable().optional(),
});

export type ClubLevelInput = z.infer<typeof clubLevelSchema>;
