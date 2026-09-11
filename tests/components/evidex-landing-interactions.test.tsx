import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { LandingApiCopy } from '@/shared/components/landing/landing-api-copy';
import {
  LandingEvidenceDemo,
  type LandingEvidenceDemoCopy,
} from '@/shared/components/landing/landing-evidence-demo';

const copy: LandingEvidenceDemoCopy = {
  eyebrow: 'Live evidence workflow',
  title: 'Query the current knowledge release',
  description: 'Uses the real API.',
  disease_label: 'Cancer type',
  variant_label: 'Genomic variant',
  submit: 'Run evidence query',
  submitting: 'Retrieving reviewed evidence',
  idle_title: 'Ready for a structured query',
  idle_body: 'No identity data is sent.',
  result_title: 'Traceable evidence retrieved',
  summary_unavailable: 'Summary unavailable. Structured evidence remains.',
  no_evidence: 'No curated evidence in this release.',
  out_of_scope: 'Outside the current scope.',
  error: 'Evidence service unavailable.',
  therapy_count: 'Therapy matches',
  claim_count: 'Evidence claims',
  source_count: 'Source records',
  release_label: 'Knowledge release',
  open_workspace: 'Open Chinese workspace',
  language_note: 'The workspace summary is in Chinese.',
  result_region: 'Evidence query result',
};

const answered = {
  status: 'ANSWERED',
  knowledge: { release: 'v0.2.0' },
  resultGroups: [
    {
      scope: 'SAME_DISEASE',
      therapies: [
        {
          associationId: 'association-1',
          drugs: [
            {
              id: 'drug-1',
              displayNameEn: 'Osimertinib',
              displayNameZh: '奥希替尼',
            },
          ],
          evidenceClaims: [{ id: 'claim-1' }, { id: 'claim-2' }],
          regulatoryApprovals: [{ id: 'approval-1' }],
        },
      ],
    },
  ],
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('LandingEvidenceDemo', () => {
  it('submits a supported query and renders only data returned by the real API', async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ code: 0, message: 'ok', data: answered }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    );
    vi.stubGlobal('fetch', fetchMock);

    render(<LandingEvidenceDemo copy={copy} locale="en" />);
    expect(screen.getByText(copy.idle_title)).toBeVisible();

    await user.click(screen.getByRole('button', { name: copy.submit }));

    expect(fetchMock).toHaveBeenCalledWith('/api/v1/evidence-answer', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        disease: 'NSCLC',
        biomarkers: [{ gene: 'EGFR', alterationType: 'SNV', hgvsp: 'p.L858R' }],
        jurisdiction: 'US',
        locale: 'zh-CN',
      }),
    });
    expect(await screen.findByText(copy.result_title)).toBeVisible();
    expect(screen.getByText('Osimertinib')).toBeVisible();
    expect(screen.getByText('1', { selector: 'dd' })).toBeVisible();
    expect(screen.getByText('2', { selector: 'dd' })).toBeVisible();
    expect(screen.getByText('v0.2.0')).toBeVisible();
  });

  it('updates the canonical query when a colorectal variant is selected', async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          code: 0,
          message: 'ok',
          data: { ...answered, status: 'SUMMARY_UNAVAILABLE' },
        }),
        { status: 200, headers: { 'content-type': 'application/json' } }
      )
    );
    vi.stubGlobal('fetch', fetchMock);
    render(<LandingEvidenceDemo copy={copy} locale="en" />);

    await user.selectOptions(screen.getByLabelText(copy.disease_label), 'CRC');
    await user.selectOptions(
      screen.getByLabelText(copy.variant_label),
      'KRAS|SNV|p.G12D'
    );
    await user.click(screen.getByRole('button', { name: copy.submit }));

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/v1/evidence-answer',
      expect.objectContaining({
        body: JSON.stringify({
          disease: 'CRC',
          biomarkers: [
            { gene: 'KRAS', alterationType: 'SNV', hgvsp: 'p.G12D' },
          ],
          jurisdiction: 'US',
          locale: 'zh-CN',
        }),
      })
    );
    expect(await screen.findByText(copy.summary_unavailable)).toBeVisible();
    expect(screen.getByText('Osimertinib')).toBeVisible();
  });

  it.each([
    ['NO_CURATED_EVIDENCE', 'no_evidence'],
    ['OUT_OF_SCOPE', 'out_of_scope'],
  ] as const)(
    'renders the %s business state without a fabricated result',
    async (status, key) => {
      const user = userEvent.setup();
      vi.stubGlobal(
        'fetch',
        vi
          .fn()
          .mockResolvedValue(
            new Response(
              JSON.stringify({ code: 0, message: 'ok', data: { status } }),
              { status: 200, headers: { 'content-type': 'application/json' } }
            )
          )
      );
      render(<LandingEvidenceDemo copy={copy} locale="en" />);
      await user.click(screen.getByRole('button', { name: copy.submit }));

      expect(await screen.findByText(copy[key])).toBeVisible();
      expect(screen.queryByText(copy.result_title)).not.toBeInTheDocument();
    }
  );

  it('renders an error and allows retry after an HTTP failure', async () => {
    const user = userEvent.setup();
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ code: -1, message: 'failed' }), {
          status: 500,
        })
      )
    );
    render(<LandingEvidenceDemo copy={copy} locale="en" />);
    await user.click(screen.getByRole('button', { name: copy.submit }));

    expect(await screen.findByText(copy.error)).toBeVisible();
    expect(screen.getByRole('button', { name: copy.submit })).toBeEnabled();
  });
});

describe('LandingApiCopy', () => {
  it('copies the documented request and exposes an accessible success state', async () => {
    const user = userEvent.setup();
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText },
    });

    render(
      <LandingApiCopy
        text={'{"disease":"NSCLC"}'}
        labels={{
          idle: 'Copy API request',
          success: 'Copied',
          error: 'Copy failed',
        }}
      />
    );
    await user.click(screen.getByRole('button', { name: 'Copy API request' }));

    expect(writeText).toHaveBeenCalledWith('{"disease":"NSCLC"}');
    expect(screen.getByRole('button', { name: 'Copied' })).toBeVisible();
    expect(screen.getByRole('status')).toHaveTextContent('Copied');
  });

  it('shows a failure state when the clipboard is unavailable', async () => {
    const user = userEvent.setup();
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: vi.fn().mockRejectedValue(new Error('blocked')) },
    });
    render(
      <LandingApiCopy
        text="request"
        labels={{
          idle: 'Copy API request',
          success: 'Copied',
          error: 'Copy failed',
        }}
      />
    );
    await user.click(screen.getByRole('button', { name: 'Copy API request' }));

    expect(screen.getByRole('button', { name: 'Copy failed' })).toBeVisible();
  });
});
