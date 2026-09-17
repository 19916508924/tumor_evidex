import {
  extractEvidenceDraftWithTrace,
  type EvidenceExtractionGenerator,
} from './extract-evidence-draft';
import type { PubmedSourceAdapter } from './pubmed-source-adapter';
import { screenEvidenceEligibility } from './screen-evidence-eligibility';
import type { UpstreamWorkflowRepository } from './upstream-workflow';

export async function processCandidateRetry(_input: {
  candidateId: string;
  repository: UpstreamWorkflowRepository;
  generator: EvidenceExtractionGenerator;
  agentVersion: string;
  pubmed: Pick<PubmedSourceAdapter, 'fetchDocument'>;
}) {
  if (
    !_input.repository.getCandidateRetryContext ||
    !_input.repository.saveCandidateRetry
  ) {
    throw new Error('Candidate retry repository is not configured');
  }
  const context = await _input.repository.getCandidateRetryContext(
    _input.candidateId
  );
  if (!context) {
    return {
      candidateId: _input.candidateId,
      status: 'ALREADY_PROCESSED' as const,
    };
  }
  const source =
    context.source ?? (await _input.pubmed.fetchDocument(context.pmid));
  const eligibility = await screenEvidenceEligibility({
    source,
    association: context.association,
  });
  if (eligibility.decision.decision !== 'INCLUDE') {
    throw Object.assign(new Error(eligibility.decision.reason), {
      code: eligibility.decision.code,
    });
  }
  const extraction = await extractEvidenceDraftWithTrace({
    source,
    association: context.association,
    generator: _input.generator,
  });
  return _input.repository.saveCandidateRetry({
    candidateId: _input.candidateId,
    source,
    draft: extraction.draft,
    agentVersion: _input.agentVersion,
    skillVersions: [eligibility.trace, ...extraction.traces].map(
      (trace) => `${trace.skillId}@${trace.skillVersion}`
    ),
    skillTraces: [eligibility.trace, ...extraction.traces],
  });
}
