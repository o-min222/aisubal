import { z } from 'zod'
import { msg } from '@/i18n/translate'
import { MAX_INVITES } from '@/lib/moim-thread-rules'

const optUrl = z
  .string()
  .trim()
  .max(500)
  .refine((v) => !v || /^https?:\/\//i.test(v), msg('링크는 http(s)://로 시작해야 해요.'))
  .nullish()

export const moimInputSchema = z.object({
  title: z.string().trim().min(2, msg('제목은 2자 이상')).max(80),
  /** optional since A29: the details live in the 모임's comment thread */
  description: z.string().trim().max(4000).optional(),
  mode: z.enum(['offline', 'online']),
  venueName: z.string().trim().max(120).nullish(),
  venueAddress: z.string().trim().max(300).nullish(),
  mapUrl: optUrl,
  meetingUrl: optUrl,
  startsAt: z.string().min(10),
  /** date only: the time is still open (stored 23:59 KST) */
  timeTbd: z.boolean().optional(),
  endsAt: z.string().nullish(),
  applyDeadline: z.string().nullish(),
  /** absent = keep (edit) / server default (create); the minimal form doesn't ask */
  capacity: z.coerce.number().int().min(1).max(500).optional(),
  requiresApproval: z.boolean().optional(),
  feeNote: z.string().trim().max(200).nullish(),
  groupId: z.string().max(64).nullish(),
  membersOnly: z.boolean().optional(),
  questions: z
    .array(z.object({ label: z.string().trim().min(1).max(120), required: z.boolean() }))
    .max(5)
    .optional(),
  /** @handles to notify when the 모임 opens (create only) */
  invites: z.array(z.string().trim().max(40)).max(MAX_INVITES, msg('초대는 한 번에 30명까지예요')).optional(),
})
