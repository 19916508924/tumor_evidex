import type { CivicSourceAdapter } from './civic-source-adapter';
import type { DiscoveryRunRepository } from './discovery-run';
import {
  extractEvidenceDraftWithTrace,
  type EvidenceExtractionGenerator,
} from './extract-evidence-draft';
import type { PubmedSourceAdapter } from './pubmed-source-adapter';
import { screenEvidenceEligibility } from './screen-evidence-eligibility';
import { hashArtifact, SkillExecutionError } from './skill-runtime';
import {
  submitPubmedCandidate,
  type CandidateSourceInput,
  type UpstreamWorkflowRepository,
} from './upstream-workflow';

export async function processPersistentDiscoveryRun(_input: {
  runId: string;
  repository: DiscoveryRunRepository;
  upstreamRepository: UpstreamWorkflowRepository;
  pubmed: PubmedSourceAdapter;
  civic?: CivicSourceAdapter;
  extractionGenerator: EvidenceExtractionGenerator;
  workflowVersion: string;
  agentVersion: string;
  pageSize?: number;
}) {
  const plan = await _input.repository.beginDiscoveryRun(_input.runId);
  if (!plan) return { status: 'NOT_RUNNABLE' as const };
  let counts = { ...plan.run.counts };
  let processedDocumentCount = plan.run.processedDocumentCount;
  let uniqueDiscoveredCount = plan.run.uniqueDiscoveredCount;
  const errors: string[] = [];
  const pageSize = Math.min(200, Math.max(1, _input.pageSize ?? 20));
  const discoverySourceType = plan.run.source ?? 'PUBMED';
  if (discoverySourceType === 'CIVIC' && !_input.civic) {
    throw new Error('CIViC source adapter is not configured');
  }
  const discoverySource =
    discoverySourceType === 'CIVIC' ? _input.civic! : _input.pubmed;
  let limitReached = false;

  for (const query of plan.queries) {
    if (query.exhausted || limitReached) continue;
    let cursor = query.sourceCursor;
    let exhausted = false;
    while (!exhausted && !limitReached) {
      const control = await _input.repository.getDiscoveryRunStatus(
        _input.runId
      );
      if (control === 'PAUSED' || control === 'CANCELLED') {
        return { status: control };
      }
      if (control !== 'RUNNING') return { status: 'NOT_RUNNABLE' as const };
      const remaining =
        plan.run.documentLimit === null
          ? pageSize
          : plan.run.documentLimit - uniqueDiscoveredCount;
      if (remaining <= 0) {
        limitReached = true;
        break;
      }
      const page = await discoverySource.searchPage({
        query: query.query,
        from: plan.run.windowFrom.slice(0, 10),
        to: plan.run.windowTo.slice(0, 10),
        cursor,
        pageSize: Math.min(
          discoverySourceType === 'CIVIC' ? 100 : pageSize,
          remaining
        ),
      });
      const civicPage =
        discoverySourceType === 'CIVIC'
          ? (page as Awaited<ReturnType<CivicSourceAdapter['searchPage']>>)
          : null;
      for (const pmid of page.ids) {
        const civicProvenance = civicPage?.provenanceById[pmid];
        const claimed = await _input.repository.claimDiscoveryDocument({
          runId: _input.runId,
          externalId: pmid,
          strategyId: query.strategyId,
        });
        uniqueDiscoveredCount = claimed.uniqueDiscoveredCount;
        if (
          discoverySourceType === 'CIVIC' &&
          civicProvenance &&
          _input.repository.recordDiscoveryProvenance
        ) {
          await _input.repository.recordDiscoveryProvenance({
            runId: _input.runId,
            externalId: pmid,
            strategyId: query.strategyId,
            provenance: civicProvenance,
          });
        }
        if (claimed.limitReached) {
          limitReached = true;
          break;
        }
        if (!claimed.shouldProcess) continue;
        let source: Partial<CandidateSourceInput> & {
          pmid: string;
          url: string;
        } = failedSource(pmid);
        let stage = 'fetch_pubmed_metadata';
        let terminalPersistAttempted = false;
        try {
          const fetchedSource = await _input.pubmed.fetchDocument(pmid);
          source = fetchedSource;
          stage = 'deduplicate_source_document';
          const duplicate = await _input.upstreamRepository.findDuplicate({
            sourceType: 'PUBMED',
            externalId: fetchedSource.pmid,
            doi: fetchedSource.doi ?? null,
            documentHash: fetchedSource.documentHash,
          });
          if (duplicate) {
            await _input.repository.attachCandidateToDiscoveryStrategy(
              duplicate.candidateId,
              query.strategyId
            );
            const progress =
              await _input.repository.recordDiscoveryDocumentOutcome({
                runId: _input.runId,
                externalId: pmid,
                outcome: 'DUPLICATE',
                candidateDocumentId: duplicate.candidateId,
              });
            counts = progress.counts;
            processedDocumentCount = progress.processedDocumentCount;
            continue;
          }
          const association =
            await _input.upstreamRepository.getAssociationReviewContext(
              query.associationId
            );
          if (!association) {
            throw new Error('Configured association is unavailable');
          }
          if (
            discoverySourceType === 'CIVIC' &&
            !matchesCivicAssociation(
              civicProvenance,
              association.therapyNames ?? []
            )
          ) {
            if (!_input.upstreamRepository.createCandidateOutcome) {
              throw new Error('Candidate outcome repository is not configured');
            }
            stage = 'verify_civic_association';
            terminalPersistAttempted = true;
            const terminal =
              await _input.upstreamRepository.createCandidateOutcome({
                source: fetchedSource,
                associationId: association.id,
                workflowVersion: _input.workflowVersion,
                status: 'NEEDS_HUMAN',
                reason: {
                  code: 'CIVIC_THERAPY_ASSOCIATION_REVIEW_REQUIRED',
                  message:
                    'CIViC molecular profile or therapy does not exactly match the configured association.',
                  stage,
                  ruleVersion: 'civic-pilot-v1',
                  retryable: true,
                },
              });
            await _input.repository.attachCandidateToDiscoveryStrategy(
              terminal.candidateId,
              query.strategyId
            );
            const progress =
              await _input.repository.recordDiscoveryDocumentOutcome({
                runId: _input.runId,
                externalId: pmid,
                outcome: 'FAILED',
                candidateDocumentId: terminal.candidateId,
                errorCode: 'CIVIC_THERAPY_ASSOCIATION_REVIEW_REQUIRED',
                errorSummary:
                  'CIViC candidate requires association-level human review.',
              });
            counts = progress.counts;
            processedDocumentCount = progress.processedDocumentCount;
            continue;
          }
          stage = 'screen_evidence_eligibility';
          const eligibility = await screenEvidenceEligibility({
            source: fetchedSource,
            association,
          });
          if (eligibility.decision.decision !== 'INCLUDE') {
            if (!_input.upstreamRepository.createCandidateOutcome) {
              throw new Error('Candidate outcome repository is not configured');
            }
            terminalPersistAttempted = true;
            const status =
              eligibility.decision.decision === 'EXCLUDE'
                ? 'EXCLUDED'
                : 'NEEDS_HUMAN';
            const terminal =
              await _input.upstreamRepository.createCandidateOutcome({
                source: fetchedSource,
                associationId: association.id,
                workflowVersion: _input.workflowVersion,
                status,
                reason: {
                  code: eligibility.decision.code,
                  message: eligibility.decision.reason,
                  stage,
                  ruleVersion: eligibility.decision.ruleVersion,
                  retryable: status === 'NEEDS_HUMAN',
                },
                skillTraces: [eligibility.trace],
              });
            await _input.repository.attachCandidateToDiscoveryStrategy(
              terminal.candidateId,
              query.strategyId
            );
            const progress =
              await _input.repository.recordDiscoveryDocumentOutcome({
                runId: _input.runId,
                externalId: pmid,
                outcome: status === 'EXCLUDED' ? 'EXCLUDED' : 'FAILED',
                candidateDocumentId: terminal.candidateId,
                ...(status === 'NEEDS_HUMAN'
                  ? {
                      errorCode: eligibility.decision.code,
                      errorSummary: eligibility.decision.reason,
                    }
                  : {}),
              });
            counts = progress.counts;
            processedDocumentCount = progress.processedDocumentCount;
            continue;
          }
          stage = 'extract_evidence_claims';
          const extraction = await extractEvidenceDraftWithTrace({
            source: fetchedSource,
            association,
            generator: _input.extractionGenerator,
          });
          const created = await submitPubmedCandidate({
            source: fetchedSource,
            draft: extraction.draft,
            repository: _input.upstreamRepository,
            workflowVersion: _input.workflowVersion,
            agentVersion: _input.agentVersion,
            skillVersions: [eligibility.trace, ...extraction.traces].map(
              (trace) => `${trace.skillId}@${trace.skillVersion}`
            ),
            skillTraces: [eligibility.trace, ...extraction.traces],
          });
          await _input.repository.attachCandidateToDiscoveryStrategy(
            created.candidateId,
            query.strategyId
          );
          const progress =
            await _input.repository.recordDiscoveryDocumentOutcome({
              runId: _input.runId,
              externalId: pmid,
              outcome: created.duplicate ? 'DUPLICATE' : 'READY_FOR_REVIEW',
              candidateDocumentId: created.candidateId,
            });
          counts = progress.counts;
          processedDocumentCount = progress.processedDocumentCount;
        } catch (error) {
          const message =
            error instanceof Error ? error.message : 'Unknown candidate error';
          errors.push(message);
          let candidateDocumentId: string | undefined;
          if (
            !terminalPersistAttempted &&
            _input.upstreamRepository.createCandidateOutcome
          ) {
            terminalPersistAttempted = true;
            const code = errorCode(error);
            const terminal =
              await _input.upstreamRepository.createCandidateOutcome({
                source,
                associationId: query.associationId,
                workflowVersion: _input.workflowVersion,
                status: 'FAILED',
                reason: {
                  code,
                  message,
                  stage,
                  retryable: retryableError(code),
                },
                failedStep: {
                  stepKey:
                    error instanceof SkillExecutionError && error.skillId
                      ? error.skillId
                      : stage,
                  attempt:
                    error instanceof SkillExecutionError
                      ? Math.max(1, error.attempts)
                      : 1,
                  errorCode: code,
                  errorSummary: message,
                  inputHash:
                    error instanceof SkillExecutionError && error.inputHash
                      ? error.inputHash
                      : hashArtifact(source),
                  agentVersionId:
                    error instanceof SkillExecutionError
                      ? error.agentVersionId
                      : undefined,
                  skillVersionId:
                    error instanceof SkillExecutionError
                      ? error.skillVersionId
                      : undefined,
                },
              });
            candidateDocumentId = terminal.candidateId;
            await _input.repository.attachCandidateToDiscoveryStrategy(
              terminal.candidateId,
              query.strategyId
            );
          }
          const progress =
            await _input.repository.recordDiscoveryDocumentOutcome({
              runId: _input.runId,
              externalId: pmid,
              outcome: 'FAILED',
              candidateDocumentId,
              errorCode: errorCode(error),
              errorSummary: message,
            });
          counts = progress.counts;
          processedDocumentCount = progress.processedDocumentCount;
        }
      }
      cursor = page.nextCursor;
      exhausted = page.nextCursor === null;
      await _input.repository.saveDiscoveryQueryProgress({
        queryId: query.id,
        sourceCursor: cursor,
        exhausted,
      });
    }
  }

  const status =
    counts.failed === 0
      ? 'SUCCEEDED'
      : counts.readyForReview > 0 || counts.duplicate > 0
        ? 'PARTIAL_SUCCESS'
        : 'FAILED';
  await _input.repository.finishDiscoveryRun({
    runId: _input.runId,
    status,
    errorCode: errors.length ? 'CANDIDATE_PROCESSING_FAILED' : null,
    errorSummary: errors.length ? errors.slice(0, 10).join('; ') : null,
  });
  return {
    status,
    counts,
    uniqueDiscoveredCount,
    processedDocumentCount,
  };
}

function failedSource(pmid: string) {
  return {
    pmid,
    title: `PubMed PMID ${pmid}`,
    abstract: 'Metadata retrieval did not complete.',
    url: `https://pubmed.ncbi.nlm.nih.gov/${pmid}/`,
  };
}

function retryableError(code: string) {
  return ![
    'INVALID_SKILL_INPUT',
    'INVALID_SKILL_OUTPUT',
    'SKILL_NOT_ACTIVE',
    'SKILL_NOT_ALLOWED',
  ].includes(code);
}

function errorCode(error: unknown) {
  if (
    error &&
    typeof error === 'object' &&
    'code' in error &&
    typeof error.code === 'string'
  ) {
    return error.code;
  }
  return 'CANDIDATE_PROCESSING_FAILED';
}

function matchesCivicAssociation(
  provenance:
    | Awaited<
        ReturnType<CivicSourceAdapter['searchPage']>
      >['provenanceById'][string]
    | undefined,
  therapyNames: string[]
) {
  if (!provenance || therapyNames.length === 0) return false;
  const expected = therapyNames.map(normalizeTherapyName);
  return provenance.evidenceItems.some((item) => {
    if (item.applicability !== 'EXACT') return false;
    const observed = item.therapies.map(normalizeTherapyName);
    return expected.every((therapy) => observed.includes(therapy));
  });
}

function normalizeTherapyName(value: string) {
  return value.normalize('NFKC').trim().replace(/\s+/g, ' ').toLowerCase();
}
