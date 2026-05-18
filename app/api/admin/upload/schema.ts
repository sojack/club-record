import { z } from "zod";

// recordSchema mirrors only the fields the upload route reads off each record.
// Two fields are deliberately NOT here:
//  - is_world_record: the CSVUploader sends it (it's on CSVRecord) but this
//    route never stores it, so zod's default unknown-key stripping drops it.
//  - sort_order: never sent by the client; the route assigns it from the
//    array index. Both omissions are intentional, not oversights.
const recordSchema = z.object({
  event_name: z.string(),
  time_ms: z.number().int().nonnegative(),
  swimmer_name: z.string(),
  swimmer_name_2: z.string().nullable(),
  swimmer_name_3: z.string().nullable(),
  swimmer_name_4: z.string().nullable(),
  age_group: z.string().nullable(),
  record_club: z.string().nullable(),
  province: z.string().nullable(),
  record_date: z.string().nullable(),
  location: z.string().nullable(),
  is_national: z.boolean(),
  is_current_national: z.boolean(),
  is_provincial: z.boolean(),
  is_current_provincial: z.boolean(),
  is_split: z.boolean(),
  is_relay_split: z.boolean(),
  is_new: z.boolean(),
});

export const uploadSchema = z.object({
  clubId: z.string().min(1),
  title: z.string().min(1),
  slug: z.string().min(1),
  courseType: z.enum(["LCM", "SCM", "SCY"]),
  gender: z.enum(["male", "female", "mixed"]).nullish(),
  recordType: z
    .enum(["individual", "relay"])
    .nullish()
    .transform((v) => v ?? "individual"),
  records: z.array(recordSchema),
});

export type UploadInput = z.infer<typeof uploadSchema>;
