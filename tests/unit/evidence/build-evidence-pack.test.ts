import { describe, expect, it } from 'vitest';

import {
  buildEvidencePack,
  toPublicResultGroups,
} from '@/shared/services/evidence/build-evidence-pack';
import type {
  EvidenceResultGroup,
  KnowledgeReleaseInfo,
  NormalizedEvidenceQuery,
} from '@/shared/types/evidence';

const query: NormalizedEvidenceQuery = {
  disease: 'NSCLC',
  gene: 'EGFR',
  alterationType: 'SNV',
  hgvsp: 'p.L858R',
  canonicalVariantKey: 'EGFR|SNV|p.L858R',
  jurisdiction: 'US',
  locale: 'zh-CN',
};

const release: KnowledgeReleaseInfo = {
  id: 'release-1',
  version: 'v0.1.0',
  literatureCutoffAt: '2026-09-01T00:00:00.000Z',
  regulatoryCutoffAt: '2026-09-01T00:00:00.000Z',
  gradingRuleVersion: 'evidex-therapeutic-v1',
};

const resultGroups: EvidenceResultGroup[] = [
  {
    scope: 'SAME_DISEASE',
    therapies: [
      {
        associationId: 'assoc-2',
        sourceDisease: {
          id: 'disease-nsclc',
          canonicalName: 'NSCLC',
          displayNameZh: '非小细胞肺癌',
          displayNameEn: 'Non-small cell lung cancer',
          lineage: 'SOLID',
        },
        variant: {
          id: 'variant-l858r',
          gene: 'EGFR',
          alterationType: 'SNV',
          hgvsp: 'p.L858R',
          canonicalKey: 'EGFR|SNV|p.L858R',
          applicability: 'EXACT',
        },
        drugs: [
          {
            id: 'drug-osimertinib',
            genericName: 'osimertinib',
            displayNameZh: '奥希替尼',
            displayNameEn: 'osimertinib',
            role: 'PRIMARY',
            sortOrder: 0,
          },
        ],
        direction: 'SENSITIVITY',
        approvedLevel: '1',
        sourceApprovedLevel: '1',
        gradingRationale: 'reviewed rationale',
        regulatoryAlignment: 'MATCHED_INDICATION',
        regulatoryApprovals: [
          {
            id: 'approval-2',
            authority: 'FDA',
            applicationNumber: '208065',
            approvalStatus: 'APPROVED',
            approvalDate: '2015-11-13',
            statusAsOf: '2026-09-01',
            indicationText: 'reviewed indication',
            biomarkerText: 'EGFR exon 19 deletions or exon 21 L858R',
            source: {
              id: 'source-fda',
              sourceType: 'FDA',
              externalId: '208065',
              title: 'FDA label',
              url: 'https://www.accessdata.fda.gov/example',
            },
          },
        ],
        evidenceClaims: [
          {
            id: 'evidence-2',
            claimType: 'EFFICACY',
            evidenceMaturity: 'MATURE_CLINICAL',
            studyType: 'randomized trial',
            studyName: 'Study A',
            populationSummary: 'EGFR-mutated advanced NSCLC',
            sampleSize: 100,
            diseaseStage: 'advanced',
            treatmentLine: 'first-line',
            priorTherapy: 'none',
            intervention: 'osimertinib',
            comparator: 'comparator',
            endpoint: 'PFS',
            effectValue: { hazardRatio: 0.5 },
            conclusion: 'reviewed conclusion',
            limitations: 'combined EGFR population',
            passages: [
              {
                id: 'passage-full',
                source: {
                  id: 'source-pubmed',
                  sourceType: 'PUBMED',
                  externalId: '12345678',
                  title: 'Study A',
                  url: 'https://pubmed.ncbi.nlm.nih.gov/12345678/',
                },
                section: 'Abstract',
                paragraphIndex: 1,
                locator: { part: 'results' },
                originalText: 'Full text allowed for display and model use.',
                publicExcerpt: null,
                displayPolicy: 'FULL_TEXT',
                modelUsePolicy: 'ALLOWED',
                supportRole: 'PRIMARY',
              },
              {
                id: 'passage-excerpt',
                source: {
                  id: 'source-pubmed',
                  sourceType: 'PUBMED',
                  externalId: '12345678',
                  title: 'Study A',
                  url: 'https://pubmed.ncbi.nlm.nih.gov/12345678/',
                },
                section: 'Discussion',
                paragraphIndex: 4,
                locator: {},
                originalText: 'Long licensed text that must not be displayed.',
                publicExcerpt: 'Reviewed short excerpt.',
                displayPolicy: 'EXCERPT',
                modelUsePolicy: 'ALLOWED',
                supportRole: 'LIMITATION',
              },
              {
                id: 'passage-internal',
                source: {
                  id: 'source-pubmed',
                  sourceType: 'PUBMED',
                  externalId: '12345678',
                  title: 'Study A',
                  url: 'https://pubmed.ncbi.nlm.nih.gov/12345678/',
                },
                section: 'Internal review',
                paragraphIndex: null,
                locator: {},
                originalText: 'Internal text allowed for model use.',
                publicExcerpt: null,
                displayPolicy: 'INTERNAL_ONLY',
                modelUsePolicy: 'ALLOWED',
                supportRole: 'CONTEXT',
              },
              {
                id: 'passage-prohibited',
                source: {
                  id: 'source-pubmed',
                  sourceType: 'PUBMED',
                  externalId: '12345678',
                  title: 'Study A',
                  url: 'https://pubmed.ncbi.nlm.nih.gov/12345678/',
                },
                section: 'Supplement',
                paragraphIndex: 2,
                locator: {},
                originalText: 'Must not be sent to the model.',
                publicExcerpt: null,
                displayPolicy: 'LINK_ONLY',
                modelUsePolicy: 'PROHIBITED',
                supportRole: 'CONTEXT',
              },
            ],
          },
        ],
      },
    ],
  },
  { scope: 'CROSS_INDICATION_EXACT_VARIANT', therapies: [] },
];

describe('buildEvidencePack', () => {
  it('uses only model-allowed passages and sorts IDs deterministically', () => {
    const reversed = structuredClone(resultGroups);
    reversed[0].therapies[0].evidenceClaims[0].passages.reverse();

    const pack = buildEvidencePack({ query, release, resultGroups: reversed });
    const passages = pack.groups[0].therapies[0].evidenceClaims[0].passages;

    expect(passages.map(({ id }) => id)).toEqual([
      'passage-excerpt',
      'passage-full',
      'passage-internal',
    ]);
    expect(JSON.stringify(pack)).not.toContain(
      'Must not be sent to the model.'
    );
  });

  it('returns only text allowed by each display policy to public clients', () => {
    const publicGroups = toPublicResultGroups(resultGroups);
    const passages = publicGroups[0].therapies[0].evidenceClaims[0].passages;

    expect(passages).toEqual([
      expect.objectContaining({
        id: 'passage-excerpt',
        text: 'Reviewed short excerpt.',
      }),
      expect.objectContaining({
        id: 'passage-full',
        text: 'Full text allowed for display and model use.',
      }),
      expect.not.objectContaining({ text: expect.anything() }),
      expect.not.objectContaining({ text: expect.anything() }),
    ]);
    expect(JSON.stringify(publicGroups)).not.toContain(
      'Long licensed text that must not be displayed.'
    );
    expect(JSON.stringify(publicGroups)).not.toContain(
      'Internal text allowed for model use.'
    );
  });

  it('stably sorts groups, therapies, drugs, approvals and claims', () => {
    const base = structuredClone(resultGroups[0].therapies[0]);
    base.drugs.push({
      ...base.drugs[0],
      id: 'drug-a',
      genericName: 'combination-a',
      role: 'COMBINATION_COMPONENT',
      sortOrder: 0,
    });
    base.regulatoryApprovals.push({
      ...base.regulatoryApprovals[0],
      id: 'approval-1',
    });
    base.evidenceClaims.push({
      ...structuredClone(base.evidenceClaims[0]),
      id: 'evidence-1',
    });

    const sameLevelLater = structuredClone(base);
    sameLevelLater.associationId = 'assoc-z';
    sameLevelLater.drugs[0].genericName = 'zeta';
    const lowerLevel = structuredClone(base);
    lowerLevel.associationId = 'assoc-level-3a';
    lowerLevel.approvedLevel = '3A';
    const resistance = structuredClone(base);
    resistance.associationId = 'assoc-resistance';
    resistance.direction = 'RESISTANCE';
    resistance.approvedLevel = 'R1';
    const sameNameEarlier = structuredClone(base);
    sameNameEarlier.associationId = 'assoc-1';

    const pack = buildEvidencePack({
      query,
      release,
      resultGroups: [
        { scope: 'CROSS_INDICATION_EXACT_VARIANT', therapies: [] },
        {
          scope: 'SAME_DISEASE',
          therapies: [
            resistance,
            sameLevelLater,
            lowerLevel,
            base,
            sameNameEarlier,
          ],
        },
      ],
    });

    expect(pack.groups.map(({ scope }) => scope)).toEqual([
      'SAME_DISEASE',
      'CROSS_INDICATION_EXACT_VARIANT',
    ]);
    expect(
      pack.groups[0].therapies.map(({ associationId }) => associationId)
    ).toEqual([
      'assoc-1',
      'assoc-2',
      'assoc-z',
      'assoc-level-3a',
      'assoc-resistance',
    ]);
    expect(pack.groups[0].therapies[0].drugs.map(({ id }) => id)).toEqual([
      'drug-a',
      'drug-osimertinib',
    ]);
    expect(
      pack.groups[0].therapies[0].regulatoryApprovals.map(({ id }) => id)
    ).toEqual(['approval-1', 'approval-2']);
    expect(
      pack.groups[0].therapies[0].evidenceClaims.map(({ id }) => id)
    ).toEqual(['evidence-1', 'evidence-2']);
  });
});
