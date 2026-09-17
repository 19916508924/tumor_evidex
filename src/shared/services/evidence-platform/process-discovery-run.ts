import {
  civicRelationshipProposals,
  findExistingCivicAssociation,
  sourceConfirmsCivicTherapies,
} from './civic-evidence-relations';
import type {
  CivicCandidateProvenance,
  CivicSourceAdapter,
} from './civic-source-adapter';
import type { DiscoveryRunRepository } from './discovery-run';
import {
  extractEvidenceDraftWithTrace,
  type EvidenceExtractionGenerator,
} from './extract-evidence-draft';
import type { PubmedSourceAdapter } from './pubmed-source-adapter';
import { screenEvidenceEligibility } from './screen-evidence-eligibility';
import { hashArtifact, SkillExecutionError } from './skill-runtime';
import {
  submitPubmedAssociationCandidate,
  submitPubmedCandidate,
  type AssociationReviewContext,
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
          if (discoverySourceType === 'CIVIC') {
            stage = 'resolve_civic_associations';
            const civicResult = await processCivicCandidate({
              source: fetchedSource,
              provenance: civicProvenance,
              strategyAssociationId: query.associationId,
              upstreamRepository: _input.upstreamRepository,
              extractionGenerator: _input.extractionGenerator,
              workflowVersion: _input.workflowVersion,
              agentVersion: _input.agentVersion,
            });
            terminalPersistAttempted = civicResult.terminalPersistAttempted;
            if (civicResult.candidateId) {
              await _input.repository.attachCandidateToDiscoveryStrategy(
                civicResult.candidateId,
                query.strategyId
              );
            }
            const progress =
              await _input.repository.recordDiscoveryDocumentOutcome({
                runId: _input.runId,
                externalId: pmid,
                outcome: civicResult.outcome,
                candidateDocumentId: civicResult.candidateId,
                ...(civicResult.errorCode
                  ? {
                      errorCode: civicResult.errorCode,
                      errorSummary: civicResult.errorSummary,
                    }
                  : {}),
              });
            counts = progress.counts;
            processedDocumentCount = progress.processedDocumentCount;
            continue;
          }
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

async function processCivicCandidate(input: {
  source: CandidateSourceInput;
  provenance: CivicCandidateProvenance | undefined;
  strategyAssociationId: string;
  upstreamRepository: UpstreamWorkflowRepository;
  extractionGenerator: EvidenceExtractionGenerator;
  workflowVersion: string;
  agentVersion: string;
}): Promise<{
  outcome: 'DUPLICATE' | 'EXCLUDED' | 'READY_FOR_REVIEW' | 'FAILED';
  candidateId?: string;
  errorCode?: string;
  errorSummary?: string;
  terminalPersistAttempted: boolean;
}> {
  const existing = await input.upstreamRepository.findDuplicate({
    sourceType: 'PUBMED',
    externalId: input.source.pmid,
    doi: input.source.doi ?? null,
    documentHash: input.source.documentHash,
  });
  let candidateId = existing?.candidateId;
  let terminalPersistAttempted = false;
  const associations = await resolveCivicAssociationContexts(input);
  const targetContext = associations[0];
  if (!targetContext) {
    const code = 'CIVIC_TARGET_CONTEXT_UNAVAILABLE';
    const message =
      'The configured disease and variant target cannot be resolved for source screening.';
    if (input.upstreamRepository.createCandidateOutcome) {
      terminalPersistAttempted = true;
      const terminal = await input.upstreamRepository.createCandidateOutcome({
        source: input.source,
        associationId: input.strategyAssociationId,
        workflowVersion: input.workflowVersion,
        status: 'NEEDS_HUMAN',
        reason: {
          code,
          message,
          stage: 'resolve_civic_target',
          ruleVersion: 'civic-pilot-v3',
          retryable: true,
        },
      });
      candidateId = terminal.candidateId;
    } else if (!candidateId) {
      throw new Error('Candidate outcome repository is not configured');
    }
    return {
      outcome: 'FAILED',
      candidateId,
      errorCode: code,
      errorSummary: message,
      terminalPersistAttempted,
    };
  }

  const eligibility = await screenEvidenceEligibility({
    source: input.source,
    association: targetContext,
  });
  if (eligibility.decision.decision !== 'INCLUDE') {
    const status =
      eligibility.decision.decision === 'EXCLUDE' ? 'EXCLUDED' : 'NEEDS_HUMAN';
    if (input.upstreamRepository.createCandidateOutcome) {
      terminalPersistAttempted = true;
      const terminal = await input.upstreamRepository.createCandidateOutcome({
        source: input.source,
        associationId: targetContext.id,
        workflowVersion: input.workflowVersion,
        status,
        reason: {
          code: eligibility.decision.code,
          message: eligibility.decision.reason,
          stage: 'screen_evidence_eligibility',
          ruleVersion: 'eligibility-v2',
          retryable: status === 'NEEDS_HUMAN',
        },
        skillTraces: [eligibility.trace],
      });
      candidateId = terminal.candidateId;
    } else if (!candidateId) {
      throw new Error('Candidate outcome repository is not configured');
    }
    return {
      outcome: status === 'EXCLUDED' ? 'EXCLUDED' : 'FAILED',
      candidateId,
      ...(status === 'NEEDS_HUMAN'
        ? {
            errorCode: eligibility.decision.code,
            errorSummary: eligibility.decision.reason,
          }
        : {}),
      terminalPersistAttempted,
    };
  }

  const proposals = civicRelationshipProposals(input.provenance).filter(
    (proposal) =>
      sourceConfirmsCivicTherapies(
        input.source,
        proposal.therapies,
        associations
      )
  );
  if (proposals.length === 0) {
    const code = 'CIVIC_RELATION_NOT_CONFIRMED_IN_SOURCE';
    const message =
      'The accessible source confirms the target but does not mention every therapy in a CIViC relationship.';
    if (input.upstreamRepository.createCandidateOutcome) {
      terminalPersistAttempted = true;
      const terminal = await input.upstreamRepository.createCandidateOutcome({
        source: input.source,
        associationId: targetContext.id,
        workflowVersion: input.workflowVersion,
        status: 'NEEDS_HUMAN',
        reason: {
          code,
          message,
          stage: 'verify_civic_relationship',
          ruleVersion: 'civic-pilot-v3',
          retryable: true,
        },
        skillTraces: [eligibility.trace],
      });
      candidateId = terminal.candidateId;
    } else if (!candidateId) {
      throw new Error('Candidate outcome repository is not configured');
    }
    return {
      outcome: 'FAILED',
      candidateId,
      errorCode: code,
      errorSummary: message,
      terminalPersistAttempted,
    };
  }

  let createdCount = 0;
  let duplicateCount = 0;
  const unresolved: Array<{
    status: 'EXCLUDED' | 'NEEDS_HUMAN';
    code: string;
    message: string;
    association: AssociationReviewContext;
  }> = [];
  for (const proposal of proposals) {
    const association = input.upstreamRepository
      .ensureCivicAssociationReviewContext
      ? await input.upstreamRepository.ensureCivicAssociationReviewContext({
          diseaseId: input.provenance!.query.diseaseId,
          variantId: input.provenance!.query.variantId,
          therapies: proposal.therapies,
          direction: proposal.direction,
          variantApplicability: proposal.variantApplicability,
          sourcePmid: input.source.pmid,
        })
      : findExistingCivicAssociation(proposal.therapies, associations);
    if (!association) {
      unresolved.push({
        status: 'NEEDS_HUMAN',
        code: 'CIVIC_ASSOCIATION_STAGING_FAILED',
        message: 'The source-confirmed CIViC relationship could not be staged.',
        association: targetContext,
      });
      continue;
    }
    if (candidateId && input.upstreamRepository.findCandidateAssociationDraft) {
      const associationDraft =
        await input.upstreamRepository.findCandidateAssociationDraft(
          candidateId,
          association.id
        );
      if (associationDraft) {
        duplicateCount += 1;
        continue;
      }
    }
    const extraction = await extractEvidenceDraftWithTrace({
      source: input.source,
      association,
      generator: input.extractionGenerator,
    });
    const created = await submitPubmedAssociationCandidate({
      source: input.source,
      draft: extraction.draft,
      repository: input.upstreamRepository,
      workflowVersion: input.workflowVersion,
      agentVersion: input.agentVersion,
      skillVersions: [eligibility.trace, ...extraction.traces].map(
        (trace) => `${trace.skillId}@${trace.skillVersion}`
      ),
      skillTraces: [eligibility.trace, ...extraction.traces],
    });
    candidateId = created.candidateId;
    if (created.duplicate) duplicateCount += 1;
    else createdCount += 1;
  }
  if (createdCount > 0) {
    return {
      outcome: 'READY_FOR_REVIEW',
      candidateId,
      terminalPersistAttempted,
    };
  }
  if (duplicateCount > 0) {
    return {
      outcome: 'DUPLICATE',
      candidateId,
      terminalPersistAttempted,
    };
  }

  const firstUnresolved = unresolved[0];
  if (!firstUnresolved) {
    throw new Error('CIViC candidate did not resolve to a processing outcome');
  }
  if (input.upstreamRepository.createCandidateOutcome) {
    terminalPersistAttempted = true;
    const terminal = await input.upstreamRepository.createCandidateOutcome({
      source: input.source,
      associationId: firstUnresolved.association.id,
      workflowVersion: input.workflowVersion,
      status: firstUnresolved.status,
      reason: {
        code: firstUnresolved.code,
        message: firstUnresolved.message,
        stage: 'screen_evidence_eligibility',
        ruleVersion: 'eligibility-v2',
        retryable: firstUnresolved.status === 'NEEDS_HUMAN',
      },
    });
    candidateId = terminal.candidateId;
  } else if (!candidateId) {
    throw new Error('Candidate outcome repository is not configured');
  }
  return {
    outcome: firstUnresolved.status === 'EXCLUDED' ? 'EXCLUDED' : 'FAILED',
    candidateId,
    ...(firstUnresolved.status === 'NEEDS_HUMAN'
      ? {
          errorCode: firstUnresolved.code,
          errorSummary: firstUnresolved.message,
        }
      : {}),
    terminalPersistAttempted,
  };
}

async function resolveCivicAssociationContexts(input: {
  provenance: CivicCandidateProvenance | undefined;
  strategyAssociationId: string;
  upstreamRepository: UpstreamWorkflowRepository;
}) {
  if (
    input.provenance &&
    input.upstreamRepository.listAssociationReviewContexts
  ) {
    const contexts =
      await input.upstreamRepository.listAssociationReviewContexts({
        diseaseId: input.provenance.query.diseaseId,
        variantId: input.provenance.query.variantId,
      });
    if (contexts.length > 0) return contexts;
  }
  const association =
    await input.upstreamRepository.getAssociationReviewContext(
      input.strategyAssociationId
    );
  return association ? [association] : [];
}
