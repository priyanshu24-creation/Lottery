import { z } from 'zod';

export const loginSchema = z.object({
  email: z.string().email().max(254),
  password: z.string().min(1).max(200)
});

export const lotterySchema = z.object({
  name: z.string().trim().min(2).max(120),
  slug: z.string().trim().min(2).max(140).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  description: z.string().max(2000).optional().default(''),
  draw_schedule: z.string().max(500).optional().default(''),
  is_active: z.boolean().optional().default(true)
});

export const resultSchema = z.object({
  lottery_id: z.string().uuid(),
  draw_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  draw_label: z.string().max(120).optional().default(''),
  winning_numbers: z.array(z.string().trim().min(1).max(40)).max(50),
  prize_info: z.array(z.object({
    label: z.string().trim().min(1).max(120),
    value: z.string().trim().max(300)
  })).max(50).optional().default([]),
  status: z.enum(['draft', 'published']).default('draft'),
  source_name: z.string().max(200).optional().default(''),
  source_url: z.string().url().max(1000).or(z.literal('')).optional().default(''),
  verification_notes: z.string().max(3000).optional().default('')
});

export const userRegistrationSchema = z.object({
  name: z.string().trim().min(2).max(120),
  email: z.string().email().max(254),
  password: z.string().min(12).max(200)
});

export const gameSchema = z.object({
  name: z.string().trim().min(2).max(120),
  slug: z.string().trim().min(2).max(140).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  description: z.string().max(3000).optional().default(''),
  rules: z.record(z.unknown()).optional().default({}),
  prize_info: z.array(z.object({ matches: z.number().int().min(0).max(50), points: z.number().int().min(0).max(1000000) })).max(50).optional().default([]),
  number_min: z.number().int().min(0).max(1000000),
  number_max: z.number().int().min(1).max(1000000),
  selection_count: z.number().int().min(1).max(50),
  entry_cost: z.number().int().min(1).max(1000000),
  is_active: z.boolean().optional().default(true)
}).superRefine((value, ctx) => {
  if (value.number_max <= value.number_min) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['number_max'], message: 'Maximum must be greater than minimum.' });
  if (value.number_max - value.number_min + 1 < value.selection_count) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['selection_count'], message: 'Selection count exceeds the available number range.' });
});

export const drawSchema = z.object({
  game_id: z.string().uuid(),
  draw_at: z.string().datetime({ offset: true }),
  entry_closes_at: z.string().datetime({ offset: true })
}).superRefine((value, ctx) => {
  if (new Date(value.entry_closes_at) > new Date(value.draw_at)) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['entry_closes_at'], message: 'Entry close time must be before the draw.' });
});

export const entrySchema = z.object({
  draw_id: z.string().uuid(),
  numbers: z.array(z.number().int()).min(1).max(50)
});

export const announcementSchema = z.object({
  title: z.string().trim().min(2).max(160),
  body: z.string().trim().min(2).max(5000),
  is_published: z.boolean().optional().default(false)
});
