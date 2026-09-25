import { z } from "zod";

export const attendanceSchema = z.object({
  slotId: z.uuid(),
  entries: z
    .array(z.object({ studentId: z.uuid(), status: z.enum(["present", "absent"]) }))
    .min(1)
    .max(200),
});

export type AttendanceInput = z.infer<typeof attendanceSchema>;
