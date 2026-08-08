import { z } from 'zod';

// Conservative placeholder schemas — extend when backend contract is known
export const DryRunResponseSchema = z.any();
export const ProductionImportResponseSchema = z.any();
export const RPCResultSchema = z.any();
export const LeadPreviewSchema = z.object({
  id: z.string().optional(),
  name: z.string().optional(),
  email: z.string().optional(),
});

export const PhoneReviewRowSchema = z.object({
  phone: z.string().nullable().optional(),
  candidates: z.array(z.string()).optional(),
});

export type LeadPreview = z.infer<typeof LeadPreviewSchema>;
export type PhoneReviewRow = z.infer<typeof PhoneReviewRowSchema>;
