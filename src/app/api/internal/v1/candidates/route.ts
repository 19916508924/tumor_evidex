import { z } from 'zod';

import { getCurrentUserWithPermission, PERMISSIONS } from '@/core/rbac';
import { extractEvidenceDraftWithTrace } from '@/shared/services/evidence-platform/extract-evidence-draft';
import { assertTrustedMutationOrigin } from '@/shared/services/evidence-platform/http';
import { getEvidencePlatformRuntime } from '@/shared/services/evidence-platform/runtime';
import { screenEvidenceEligibility } from '@/shared/services/evidence-platform/screen-evidence-eligibility';
import { submitPubmedCandidate } from '@/shared/services/evidence-platform/upstream-workflow';

import { internalRoute, opsListQuery } from '../route-helpers';

export const runtime = 'nodejs';

const requestSchema = z
  .object({
    pmid: z.string().regex(/^[1-9][0-9]{0,9}$/),
    associationId: z.string().trim().min(1).max(200),
  })
  .strict();

export async function GET(request: Request) {
  return internalRoute(request, async () =>
    getEvidencePlatformRuntime().operationsRepository.listCandidates(
      opsListQuery(request)
    )
  );
}

export async function POST(request: Request) {
  try {
    assertTrustedMutationOrigin(request);
  } catch {
    return Response.json(
      { code: -1, message: 'UNTRUSTED_ORIGIN' },
      { status: 403 }
    );
  }
  const actor = await getCurrentUserWithPermission({
    code: PERMISSIONS.ADMIN_ACCESS,
  });
  if (!actor) {
    return Response.json(
      { code: -1, message: 'AUTHENTICATION_REQUIRED' },
      { status: 401 }
    );
  }
  let parsed;
  try {
    parsed = requestSchema.parse(await request.json());
  } catch {
    return Response.json(
      { code: -1, message: 'INVALID_INPUT' },
      { status: 400 }
    );
  }
  const platform = getEvidencePlatformRuntime();
  try {
    const source = await platform.pubmed.fetchDocument(parsed.pmid);
    const duplicate = await platform.upstreamRepository.findDuplicate({
      sourceType: 'PUBMED',
      externalId: source.pmid,
      doi: source.doi ?? null,
      documentHash: source.documentHash,
    });
    if (duplicate) {
      return Response.json({
        code: 0,
        message: 'ok',
        data: { ...duplicate, duplicate: true },
      });
    }
    const association =
      await platform.upstreamRepository.getAssociationReviewContext(
        parsed.associationId
      );
    if (!association) {
      return Response.json(
        { code: -1, message: 'ASSOCIATION_NOT_FOUND' },
        { status: 404 }
      );
    }
    const workflowVersion =
      process.env.EVIDEX_INGESTION_WORKFLOW_VERSION || 'single-pubmed-v3';
    const eligibility = await screenEvidenceEligibility({
      source,
      association,
    });
    if (eligibility.decision.decision !== 'INCLUDE') {
      if (!platform.upstreamRepository.createCandidateOutcome) {
        throw new Error('Candidate outcome repository is not configured');
      }
      const status =
        eligibility.decision.decision === 'EXCLUDE'
          ? 'EXCLUDED'
          : 'NEEDS_HUMAN';
      const data = await platform.upstreamRepository.createCandidateOutcome({
        source,
        associationId: association.id,
        workflowVersion,
        status,
        reason: {
          code: eligibility.decision.code,
          message: eligibility.decision.reason,
          stage: 'screen_evidence_eligibility',
          ruleVersion: eligibility.decision.ruleVersion,
          retryable: status === 'NEEDS_HUMAN',
        },
        skillTraces: [eligibility.trace],
      });
      return Response.json({ code: 0, message: 'ok', data }, { status: 201 });
    }
    const extraction = await extractEvidenceDraftWithTrace({
      source,
      association,
      generator: platform.extractionGenerator,
    });
    const data = await submitPubmedCandidate({
      source,
      draft: extraction.draft,
      repository: platform.upstreamRepository,
      workflowVersion,
      agentVersion:
        process.env.EVIDEX_EXTRACTION_AGENT_VERSION || 'extraction-agent@1.0.0',
      skillVersions: [eligibility.trace, ...extraction.traces].map(
        (trace) => `${trace.skillId}@${trace.skillVersion}`
      ),
      skillTraces: [eligibility.trace, ...extraction.traces],
    });
    return Response.json({ code: 0, message: 'ok', data }, { status: 201 });
  } catch (error) {
    console.error('PubMed candidate submission failed', error);
    return Response.json(
      { code: -1, message: 'CANDIDATE_PROCESSING_FAILED' },
      { status: 422 }
    );
  }
}
