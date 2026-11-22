import { z } from 'zod'

const optUrl = z
  .string()
  .trim()
  .max(500)
  .refine((v) => !v || /^https?:\/\//i.test(v), '링크는 http(s)://로 시작해야 해요.')
  .nullish()

export const moimInputSchema = z.object({
  title: z.string().trim().min(2, '제목은 2자 이상').max(80),
  description: z.string().trim().min(1, '소개를 입력해주세요').max(4000),
  mode: z.enum(['offline', 'online']),
  venueName: z.string().trim().max(120).nullish(),
  venueAddress: z.string().trim().max(300).nullish(),
  mapUrl: optUrl,
  meetingUrl: optUrl,
  startsAt: z.string().min(10),
  endsAt: z.string().nullish(),
  applyDeadline: z.string().nullish(),
  capacity: z.coerce.number().int().min(1).max(500),
  requiresApproval: z.boolean(),
  feeNote: z.string().trim().max(200).nullish(),
  groupId: z.string().max(64).nullish(),
  membersOnly: z.boolean().optional(),
  questions: z
    .array(z.object({ label: z.string().trim().min(1).max(120), required: z.boolean() }))
    .max(5)
    .optional(),
})
export type MoimInputBody = z.infer<typeof moimInputSchema>
