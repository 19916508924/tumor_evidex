import { z } from 'zod';

import type {
  EvidenceAnswerDraft,
  EvidencePack,
  EvidenceScope,
} from '@/shared/types/evidence';

const statementSchema = z
  .object({
    text: z.string().trim().min(1).max(4_000),
    evidenceIds: z.array(z.string().min(1)),
    regulatoryApprovalIds: z.array(z.string().min(1)),
  })
  .strict()
  .refine(
    (statement) =>
      statement.evidenceIds.length > 0 ||
      statement.regulatoryApprovalIds.length > 0,
    { message: 'Statement must cite evidence or a regulatory approval' }
  );

const therapySchema = z
  .object({
    associationId: z.string().min(1),
    overview: z.string().trim().min(1).max(4_000),
    statements: z.array(statementSchema).min(1).max(50),
    limitations: z.array(z.string().trim().min(1).max(2_000)).max(30),
  })
  .strict();

export const evidenceAnswerSchema = z
  .object({
    overallSummary: z.string().trim().min(1).max(8_000),
    groups: z
      .array(
        z
          .object({
            scope: z.enum(['SAME_DISEASE', 'CROSS_INDICATION_EXACT_VARIANT']),
            therapies: z.array(therapySchema),
          })
          .strict()
      )
      .length(2),
    overallLimitations: z.array(z.string().trim().min(1).max(2_000)).max(30),
  })
  .strict();

export type EvidenceAnswerValidationResult =
  | { success: true; data: EvidenceAnswerDraft }
  | { success: false; issues: string[] };

export function validateEvidenceAnswer(
  draft: unknown,
  pack: EvidencePack,
  options: { maxSerializedLength?: number } = {}
): EvidenceAnswerValidationResult {
  const maxSerializedLength = options.maxSerializedLength ?? 48_000;
  let serializedDraft: string;
  try {
    serializedDraft = JSON.stringify(draft);
  } catch {
    return { success: false, issues: ['Output is not JSON serializable'] };
  }

  if (serializedDraft.length > maxSerializedLength) {
    return { success: false, issues: ['Output exceeds maximum length'] };
  }

  const parsed = evidenceAnswerSchema.safeParse(draft);
  if (!parsed.success) {
    return {
      success: false,
      issues: parsed.error.issues.map(
        (issue) => `${issue.path.join('.')}: ${issue.message}`
      ),
    };
  }

  const associationIndex = new Map<
    string,
    {
      scope: EvidenceScope;
      evidenceIds: Set<string>;
      approvalIds: Set<string>;
    }
  >();
  for (const group of pack.groups) {
    for (const therapy of group.therapies) {
      associationIndex.set(therapy.associationId, {
        scope: group.scope,
        evidenceIds: new Set(therapy.evidenceClaims.map((claim) => claim.id)),
        approvalIds: new Set(
          therapy.regulatoryApprovals.map((approval) => approval.id)
        ),
      });
    }
  }

  const issues: string[] = [];
  const seenScopes = new Set<EvidenceScope>();
  const seenAssociations = new Set<string>();

  for (const group of parsed.data.groups) {
    if (seenScopes.has(group.scope)) {
      issues.push(`Duplicate answer group: ${group.scope}`);
    }
    seenScopes.add(group.scope);

    for (const therapy of group.therapies) {
      const allowed = associationIndex.get(therapy.associationId);
      if (!allowed) {
        issues.push(`Unknown association: ${therapy.associationId}`);
        continue;
      }
      if (allowed.scope !== group.scope) {
        issues.push(
          `Association is in the wrong scope: ${therapy.associationId}`
        );
      }
      if (seenAssociations.has(therapy.associationId)) {
        issues.push(`Duplicate association: ${therapy.associationId}`);
      }
      seenAssociations.add(therapy.associationId);

      for (const statement of therapy.statements) {
        for (const evidenceId of statement.evidenceIds) {
          if (!allowed.evidenceIds.has(evidenceId)) {
            issues.push(`Unknown evidence: ${evidenceId}`);
          }
        }
        for (const approvalId of statement.regulatoryApprovalIds) {
          if (!allowed.approvalIds.has(approvalId)) {
            issues.push(`Unknown regulatory approval: ${approvalId}`);
          }
        }
      }
    }
  }

  for (const expectedScope of [
    'SAME_DISEASE',
    'CROSS_INDICATION_EXACT_VARIANT',
  ] as const) {
    if (!seenScopes.has(expectedScope)) {
      issues.push(`Missing answer group: ${expectedScope}`);
    }
  }

  for (const associationId of associationIndex.keys()) {
    if (!seenAssociations.has(associationId)) {
      issues.push(`Missing association: ${associationId}`);
    }
  }

  return issues.length > 0
    ? { success: false, issues }
    : { success: true, data: parsed.data };
}
