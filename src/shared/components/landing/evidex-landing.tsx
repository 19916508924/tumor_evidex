import Image from 'next/image';
import type { ReactNode } from 'react';
import {
  IconArrowRight,
  IconBook2,
  IconCheck,
  IconDatabaseSearch,
  IconFileAnalytics,
  IconFileSearch,
  IconFlask2,
  IconLayersIntersect,
  IconLockCheck,
  IconNetwork,
  IconRoute,
  IconShieldCheck,
  IconSparkles,
  IconTestPipe2,
  IconUsersGroup,
} from '@tabler/icons-react';

import type { EvidexLandingContent } from '@/shared/types/evidex-landing';
import { localizedLandingHref } from '@/shared/lib/landing-href';

import { LandingApiCopy } from './landing-api-copy';
import { LandingEvidenceDemo } from './landing-evidence-demo';
import { LandingRevealSection } from './landing-reveal';

const sectionClass =
  'scroll-mt-24 px-4 py-18 sm:px-6 sm:py-24 lg:px-8 lg:py-28';

function ActionLink({
  action,
  locale,
  secondary = false,
}: {
  action: { label: string; href: string };
  locale: string;
  secondary?: boolean;
}) {
  return (
    <a
      href={localizedLandingHref(action.href, locale)}
      className={
        secondary
          ? 'inline-flex min-h-12 items-center justify-center gap-2 rounded-[10px] border border-[#9CB9DF] bg-white/80 px-5 text-sm font-semibold whitespace-nowrap text-[#0B3975] transition duration-200 hover:border-[#175CD3] hover:bg-white focus-visible:ring-2 focus-visible:ring-[#175CD3] focus-visible:ring-offset-2 focus-visible:outline-none active:translate-y-px'
          : 'inline-flex min-h-12 items-center justify-center gap-2 rounded-[10px] bg-[#175CD3] px-5 text-sm font-semibold whitespace-nowrap text-white shadow-[0_10px_25px_rgba(23,92,211,0.22)] transition duration-200 hover:bg-[#134EAE] focus-visible:ring-2 focus-visible:ring-[#175CD3] focus-visible:ring-offset-2 focus-visible:outline-none active:translate-y-px'
      }
    >
      {action.label}
      <IconArrowRight aria-hidden size={17} stroke={1.8} />
    </a>
  );
}

function StatusBadge({ children }: { children: ReactNode }) {
  return (
    <span className="inline-flex min-h-7 items-center rounded-full border border-[#8DB6EA] bg-[#EDF5FF] px-3 text-xs font-semibold text-[#0B4DA2]">
      {children}
    </span>
  );
}

function SectionHeading({
  title,
  description,
  className = '',
}: {
  title: string;
  description?: string;
  className?: string;
}) {
  return (
    <div className={`max-w-3xl ${className}`}>
      <h2 className="text-3xl font-semibold tracking-[-0.035em] text-balance text-[#0B1F3A] sm:text-4xl lg:text-5xl">
        {title}
      </h2>
      {description ? (
        <p className="mt-5 max-w-[65ch] text-base leading-8 text-[#52637A] sm:text-lg">
          {description}
        </p>
      ) : null}
    </div>
  );
}

function CheckList({ items }: { items: string[] }) {
  return (
    <ul className="grid gap-3">
      {items.map((item) => (
        <li key={item} className="flex gap-3 text-sm leading-6 text-[#334A67]">
          <IconCheck
            aria-hidden
            className="mt-1 shrink-0 text-[#175CD3]"
            size={16}
            stroke={2}
          />
          <span>{item}</span>
        </li>
      ))}
    </ul>
  );
}

export function EvidexLanding({
  content,
  locale,
}: {
  content: EvidexLandingContent;
  locale: string;
}) {
  const { sections, status_labels: statuses } = content;
  const apiRequest = JSON.stringify(sections.integration.api.request, null, 2);
  const apiResponse = JSON.stringify(sections.integration.api.response, null, 2);

  const resultIcons = [IconFlask2, IconTestPipe2];
  const workflowIcons = [
    IconUsersGroup,
    IconSparkles,
    IconDatabaseSearch,
    IconShieldCheck,
  ];

  return (
    <main
      id="main-content"
      className="evidex-landing-page overflow-x-clip bg-[#F4F8FF] text-[#0B1F3A]"
    >
      <a
        href="#main-content"
        className="fixed top-2 left-2 z-[60] -translate-y-20 rounded-[10px] bg-[#0B1F3A] px-4 py-3 text-sm font-semibold text-white transition focus:translate-y-0"
      >
        {content.accessibility.skip_to_content}
      </a>

      <LandingRevealSection
        id={sections.hero.id}
        hero
        className="relative min-h-[100dvh] overflow-hidden px-4 pt-24 pb-16 sm:px-6 sm:pt-28 lg:px-8 lg:pt-32"
      >
        <div
          aria-hidden
          className="absolute top-[-18rem] right-[-14rem] size-[38rem] rounded-full bg-[#D8E8FF] opacity-80 blur-3xl"
        />
        <div className="relative mx-auto grid min-h-[calc(100dvh-8rem)] max-w-7xl items-start gap-10 xl:grid-cols-[minmax(0,0.9fr)_minmax(32rem,1.1fr)] xl:gap-14">
          <div className="max-w-2xl">
            <h1 className="text-4xl font-semibold tracking-[-0.045em] text-balance text-[#0B1F3A] sm:text-5xl lg:text-[3.45rem] lg:leading-[1.06]">
              {sections.hero.title}
            </h1>
            <p className="mt-6 max-w-[64ch] text-base leading-7 text-[#52637A] sm:text-lg sm:leading-8">
              {sections.hero.description}
            </p>
            <div className="mt-7 flex flex-col gap-3 sm:flex-row">
              <ActionLink action={sections.hero.primary_action} locale={locale} />
              <ActionLink
                action={sections.hero.secondary_action}
                locale={locale}
                secondary
              />
            </div>
          </div>

          <div className="grid gap-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <StatusBadge>{statuses.available}</StatusBadge>
              <p className="text-sm font-semibold text-[#243B5A]">
                {sections.hero.access_line}
              </p>
            </div>
            <LandingEvidenceDemo copy={content.live_demo} locale={locale} />
            <div className="grid gap-2 border-l-2 border-[#175CD3] pl-3">
              <p className="text-sm leading-6 text-[#52637A]">
                {sections.hero.barrier}
              </p>
              <p className="text-xs leading-5 text-[#52637A]">
                {sections.hero.status}
              </p>
            </div>
          </div>
        </div>
      </LandingRevealSection>

      <LandingRevealSection
        id={sections.pain.id}
        className={`${sectionClass} border-y border-[#C8D9EE] bg-white/55`}
      >
        <div className="mx-auto grid max-w-7xl gap-12 lg:grid-cols-[0.8fr_1.2fr] lg:gap-20">
          <div className="lg:sticky lg:top-28 lg:self-start">
            <SectionHeading
              title={sections.pain.title}
              description={sections.pain.description}
            />
          </div>
          <div className="grid gap-0">
            {sections.pain.scenarios.map((scenario) => (
              <article
                key={scenario.title}
                className="border-b border-[#BFD1E7] py-8 first:pt-0 last:border-b-0 last:pb-0"
              >
                <h3 className="text-xl font-semibold tracking-[-0.02em] text-[#0B1F3A] sm:text-2xl">
                  {scenario.title}
                </h3>
                <p className="mt-3 max-w-2xl text-base leading-7 text-[#52637A]">
                  {scenario.body}
                </p>
                <div className="mt-5 grid gap-2 sm:grid-cols-3">
                  {scenario.costs.map((cost) => (
                    <p
                      key={cost}
                      className="rounded-xl bg-[#EAF2FF] px-4 py-3 text-sm font-medium leading-5 text-[#334A67]"
                    >
                      {cost}
                    </p>
                  ))}
                </div>
              </article>
            ))}
          </div>
        </div>
      </LandingRevealSection>

      <LandingRevealSection id={sections.value.id} className={sectionClass}>
        <div className="mx-auto max-w-7xl">
          <SectionHeading title={sections.value.title} />
          <div className="mt-12 grid gap-5 lg:grid-cols-[1.15fr_0.85fr]">
            <article className="overflow-hidden rounded-2xl border border-[#B4CAE6] bg-white shadow-[0_18px_50px_rgba(20,70,140,0.08)]">
              <div className="relative aspect-[4/3] overflow-hidden border-b border-[#C8D9EE] bg-[#EAF2FF]">
                <Image
                  src="/imgs/evidex/evidence-flow.png"
                  alt={sections.value.patient.image_alt}
                  fill
                  sizes="(min-width: 1024px) 58vw, 100vw"
                  className="object-cover"
                />
              </div>
              <div className="p-6 sm:p-8">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <h3 className="text-2xl font-semibold tracking-[-0.025em]">
                    {sections.value.patient.title}
                  </h3>
                  <StatusBadge>{sections.value.patient.status}</StatusBadge>
                </div>
                <p className="mt-4 leading-7 text-[#52637A]">
                  {sections.value.patient.description}
                </p>
                <div className="mt-6">
                  <CheckList items={sections.value.patient.points} />
                </div>
                <p className="mt-6 rounded-xl bg-[#EAF2FF] p-4 text-sm font-semibold leading-6 text-[#0B3975]">
                  {sections.value.patient.outcome}
                </p>
              </div>
            </article>

            <article className="relative overflow-hidden rounded-2xl border border-[#7FA7DA] bg-[#0B3975] p-7 text-white shadow-[0_20px_60px_rgba(20,70,140,0.16)] sm:p-9">
              <div
                aria-hidden
                className="absolute -right-20 -bottom-20 size-64 rounded-full bg-[#175CD3] opacity-25 blur-3xl"
              />
              <div className="relative">
                <IconLayersIntersect
                  aria-hidden
                  className="text-[#9FC4FF]"
                  size={34}
                  stroke={1.4}
                />
                <h3 className="mt-8 text-3xl font-semibold tracking-[-0.03em]">
                  {sections.value.evidence.title}
                </h3>
                <p className="mt-4 leading-7 text-[#D6E6FB]">
                  {sections.value.evidence.description}
                </p>
                <ul className="mt-8 grid gap-4">
                  {sections.value.evidence.points.map((point) => (
                    <li key={point} className="flex gap-3 text-sm leading-6 text-[#E5F0FF]">
                      <IconCheck
                        aria-hidden
                        className="mt-1 shrink-0 text-[#9FC4FF]"
                        size={16}
                        stroke={2}
                      />
                      {point}
                    </li>
                  ))}
                </ul>
                <p className="mt-8 border-t border-white/20 pt-6 text-sm font-semibold leading-6 text-white">
                  {sections.value.evidence.outcome}
                </p>
                <p className="mt-5 text-xs leading-5 text-[#BFD7F6]">
                  {sections.value.evidence.status}
                </p>
              </div>
            </article>
          </div>
          <p className="mt-3 text-right text-xs text-[#52637A]">
            {sections.value.illustration_label}
          </p>
        </div>
      </LandingRevealSection>

      <LandingRevealSection
        id={sections.results.id}
        className={`${sectionClass} bg-[#EAF2FF]/70`}
      >
        <div className="mx-auto max-w-7xl">
          <SectionHeading title={sections.results.title} />
          <div className="mt-12 grid gap-5 lg:grid-cols-[1.1fr_0.9fr]">
            {[sections.results.drugs, sections.results.trials].map((result, index) => {
              const ResultIcon = resultIcons[index];
              return (
                <article
                  key={result.title}
                  className={`rounded-2xl border p-7 sm:p-9 ${
                    index === 0
                      ? 'border-[#8DB6EA] bg-white'
                      : 'border-[#B4CAE6] bg-[#F7FAFE]'
                  }`}
                >
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <ResultIcon
                      aria-hidden
                      className="text-[#175CD3]"
                      size={31}
                      stroke={1.5}
                    />
                    <StatusBadge>
                      {index === 0 ? statuses.available : statuses.planned}
                    </StatusBadge>
                  </div>
                  <h3 className="mt-8 text-3xl font-semibold tracking-[-0.03em]">
                    {result.title}
                  </h3>
                  <p className="mt-4 max-w-xl leading-7 text-[#52637A]">
                    {result.description}
                  </p>
                  <div className="mt-7">
                    <CheckList items={result.questions} />
                  </div>
                  <p className="mt-7 border-t border-[#C8D9EE] pt-5 text-sm font-semibold leading-6 text-[#0B3975]">
                    {result.status}
                  </p>
                  {'boundary' in result ? (
                    <p className="mt-3 text-xs leading-5 text-[#52637A]">
                      {result.boundary as string}
                    </p>
                  ) : null}
                </article>
              );
            })}
          </div>
        </div>
      </LandingRevealSection>

      <LandingRevealSection id={sections.workflow.id} className={sectionClass}>
        <div className="mx-auto max-w-7xl">
          <SectionHeading title={sections.workflow.title} />
          <div className="relative mt-14 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <div
              aria-hidden
              className="absolute top-7 right-[12%] left-[12%] hidden h-px bg-[#9CB9DF] xl:block"
            />
            {sections.workflow.steps.map((step, index) => {
              const StepIcon = workflowIcons[index];
              return (
                <article
                  key={step.title}
                  className="relative rounded-2xl border border-[#B4CAE6] bg-white p-6"
                >
                  <span className="relative flex size-14 items-center justify-center rounded-xl border border-[#8DB6EA] bg-[#EAF2FF] text-[#175CD3]">
                    <StepIcon aria-hidden size={26} stroke={1.5} />
                  </span>
                  <h3 className="mt-6 text-lg font-semibold">{step.title}</h3>
                  <p className="mt-3 text-sm leading-6 text-[#52637A]">
                    {step.description}
                  </p>
                </article>
              );
            })}
          </div>
        </div>
      </LandingRevealSection>

      <LandingRevealSection
        id={sections.integration.id}
        className={`${sectionClass} border-y border-[#C8D9EE] bg-white/65`}
      >
        <div className="mx-auto max-w-7xl">
          <SectionHeading title={sections.integration.title} />
          <div className="mt-12 grid gap-8 lg:grid-cols-[0.72fr_1.28fr]">
            <article className="flex flex-col rounded-2xl border border-[#B4CAE6] bg-[#F4F8FF] p-7 sm:p-8">
              <IconFileSearch
                aria-hidden
                className="text-[#175CD3]"
                size={32}
                stroke={1.5}
              />
              <h3 className="mt-8 text-2xl font-semibold">
                {sections.integration.workspace.title}
              </h3>
              <p className="mt-4 leading-7 text-[#52637A]">
                {sections.integration.workspace.description}
              </p>
              <div className="mt-7">
                <CheckList items={sections.integration.workspace.use_cases} />
              </div>
              <div className="mt-auto pt-8">
                <ActionLink
                  action={sections.integration.workspace.action}
                  locale={locale}
                />
              </div>
            </article>

            <article className="overflow-hidden rounded-2xl border border-[#7097CA] bg-[#0B1F3A] text-white shadow-[0_20px_60px_rgba(20,70,140,0.15)]">
              <div className="border-b border-white/15 p-6 sm:p-8">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <IconNetwork aria-hidden size={28} stroke={1.5} />
                    <h3 className="text-2xl font-semibold">
                      {sections.integration.api.title}
                    </h3>
                  </div>
                  <StatusBadge>{statuses.pilot}</StatusBadge>
                </div>
                <p className="mt-4 max-w-2xl leading-7 text-[#D4E2F4]">
                  {sections.integration.api.description}
                </p>
                <p className="mt-4 text-xs leading-5 text-[#AEC7E8]">
                  {sections.integration.api.status}
                </p>
              </div>
              <div className="grid lg:grid-cols-2">
                <div className="border-b border-white/15 p-5 lg:border-r lg:border-b-0">
                  <div className="mb-3 flex items-center justify-between gap-3">
                    <code className="font-mono text-xs text-[#AFCBEE]">
                      POST /api/v1/evidence-answer
                    </code>
                    <LandingApiCopy text={apiRequest} labels={content.copy} />
                  </div>
                  <pre className="max-w-full overflow-x-auto rounded-xl bg-[#07172B] p-4 text-xs leading-6 text-[#DDEAFF]">
                    <code>{apiRequest}</code>
                  </pre>
                </div>
                <div className="p-5">
                  <p className="mb-3 text-xs font-semibold text-[#AFCBEE]">
                    {sections.integration.api.action}
                  </p>
                  <pre className="max-w-full overflow-x-auto rounded-xl bg-[#07172B] p-4 text-xs leading-6 text-[#DDEAFF]">
                    <code>{apiResponse}</code>
                  </pre>
                </div>
              </div>
            </article>
          </div>
        </div>
      </LandingRevealSection>

      <LandingRevealSection id={sections.evidence.id} className={sectionClass}>
        <div className="mx-auto max-w-7xl">
          <SectionHeading
            title={sections.evidence.title}
            description={sections.evidence.description}
          />
          <div className="mt-12 grid gap-8 lg:grid-cols-[1fr_0.9fr]">
            <div className="rounded-2xl border border-[#8DB6EA]/70 bg-white/75 p-6 shadow-[0_20px_60px_rgba(20,70,140,0.1),inset_0_1px_0_rgba(255,255,255,0.9)] backdrop-blur-xl sm:p-8 supports-[not_(backdrop-filter:blur(1px))]:bg-white">
              <p className="text-sm font-semibold text-[#175CD3]">
                {sections.evidence.sample_label}
              </p>
              <p className="mt-2 font-mono text-sm font-semibold text-[#0B1F3A] sm:text-base">
                {sections.evidence.sample_input}
              </p>
              <div className="mt-8 grid gap-3">
                {sections.evidence.chain.map((item, index) => (
                  <div key={item} className="flex items-center gap-3">
                    <span className="flex size-10 shrink-0 items-center justify-center rounded-xl border border-[#9CB9DF] bg-[#EAF2FF] text-[#175CD3]">
                      {index === 0 ? (
                        <IconRoute aria-hidden size={19} stroke={1.6} />
                      ) : index === 1 ? (
                        <IconBook2 aria-hidden size={19} stroke={1.6} />
                      ) : index === 2 ? (
                        <IconDatabaseSearch aria-hidden size={19} stroke={1.6} />
                      ) : index === 3 ? (
                        <IconLockCheck aria-hidden size={19} stroke={1.6} />
                      ) : (
                        <IconFileAnalytics aria-hidden size={19} stroke={1.6} />
                      )}
                    </span>
                    <div className="h-px w-5 shrink-0 bg-[#9CB9DF]" aria-hidden />
                    <p className="min-w-0 flex-1 rounded-xl border border-[#C8D9EE] bg-[#F7FAFE] px-4 py-3 text-sm font-semibold text-[#243B5A]">
                      {item}
                    </p>
                  </div>
                ))}
              </div>
            </div>
            <div className="grid content-start gap-3 sm:grid-cols-2">
              {sections.evidence.features.map((feature, index) => (
                <p
                  key={feature}
                  className={`rounded-xl border border-[#B4CAE6] p-5 text-sm font-medium leading-6 text-[#334A67] ${
                    index === 0 || index === 5 ? 'bg-[#DCEBFF]' : 'bg-white'
                  }`}
                >
                  {feature}
                </p>
              ))}
            </div>
          </div>
        </div>
      </LandingRevealSection>

      <LandingRevealSection
        id={sections.trust.id}
        className={`${sectionClass} bg-[#0B3975] text-white`}
      >
        <div className="mx-auto max-w-7xl">
          <div className="max-w-4xl">
            <h2 className="text-3xl font-semibold tracking-[-0.035em] text-balance sm:text-4xl lg:text-5xl">
              {sections.trust.title}
            </h2>
            <p className="mt-5 text-sm leading-6 text-[#C9DCF4]">
              {sections.trust.coverage_note}
            </p>
          </div>
          <div className="mt-12 grid grid-cols-2 gap-x-5 gap-y-8 border-y border-white/20 py-8 sm:grid-cols-4 lg:grid-cols-7">
            {sections.trust.metrics.map((metric) => (
              <div key={metric.label}>
                <p className="font-mono text-3xl font-semibold text-white">
                  {metric.value}
                </p>
                <p className="mt-2 text-xs leading-5 text-[#C9DCF4]">
                  {metric.label}
                </p>
              </div>
            ))}
          </div>
          <div className="mt-10 grid gap-3 md:grid-cols-2 lg:grid-cols-3">
            {sections.trust.controls.map((control) => (
              <p
                key={control}
                className="flex gap-3 text-sm leading-6 text-[#E5F0FF]"
              >
                <IconShieldCheck
                  aria-hidden
                  className="mt-1 shrink-0 text-[#9FC4FF]"
                  size={17}
                  stroke={1.8}
                />
                {control}
              </p>
            ))}
          </div>
          <p className="mt-8 font-mono text-xs text-[#AFCBEE]">
            {sections.trust.release}
          </p>
        </div>
      </LandingRevealSection>

      <LandingRevealSection id={sections.roadmap.id} className={sectionClass}>
        <div className="mx-auto max-w-7xl">
          <SectionHeading title={sections.roadmap.title} />
          <div className="mt-12 grid gap-5 lg:grid-cols-2">
            <article className="rounded-2xl border border-[#76A5DE] bg-white p-7 sm:p-9">
              <div className="flex items-center justify-between gap-3">
                <h3 className="text-2xl font-semibold">
                  {sections.roadmap.available.title}
                </h3>
                <StatusBadge>{statuses.available}</StatusBadge>
              </div>
              <div className="mt-7">
                <CheckList items={sections.roadmap.available.items} />
              </div>
            </article>
            <article className="rounded-2xl border border-[#B4CAE6] bg-[#EAF2FF] p-7 sm:p-9">
              <div className="flex items-center justify-between gap-3">
                <h3 className="text-2xl font-semibold">
                  {sections.roadmap.direction.title}
                </h3>
                <StatusBadge>{statuses.direction}</StatusBadge>
              </div>
              <div className="mt-7">
                <CheckList items={sections.roadmap.direction.items} />
              </div>
            </article>
          </div>
        </div>
      </LandingRevealSection>

      <LandingRevealSection
        id={sections.faq.id}
        className={`${sectionClass} border-y border-[#C8D9EE] bg-white/65`}
      >
        <div className="mx-auto grid max-w-7xl gap-12 lg:grid-cols-[0.7fr_1.3fr]">
          <SectionHeading title={sections.faq.title} />
          <div className="grid gap-3">
            {sections.faq.items.map((item) => (
              <details
                key={item.question}
                className="group rounded-xl border border-[#B4CAE6] bg-white px-5 open:border-[#76A5DE]"
              >
                <summary className="flex min-h-16 cursor-pointer list-none items-center justify-between gap-4 py-4 font-semibold text-[#0B1F3A] focus-visible:ring-2 focus-visible:ring-[#175CD3] focus-visible:outline-none [&::-webkit-details-marker]:hidden">
                  {item.question}
                  <span
                    aria-hidden
                    className="text-xl font-normal text-[#175CD3] transition-transform duration-200 group-open:rotate-45"
                  >
                    +
                  </span>
                </summary>
                <p className="border-t border-[#D4E1F1] pt-4 pb-5 text-sm leading-7 text-[#52637A]">
                  {item.answer}
                </p>
              </details>
            ))}
          </div>
        </div>
      </LandingRevealSection>

      <LandingRevealSection
        id={sections.contact.id}
        className="scroll-mt-24 px-4 py-18 sm:px-6 sm:py-24 lg:px-8 lg:py-28"
      >
        <div className="relative mx-auto max-w-7xl overflow-hidden rounded-2xl border border-[#7FA7DA]/60 bg-white/72 px-6 py-12 text-center shadow-[0_28px_80px_rgba(20,70,140,0.14),inset_0_1px_0_rgba(255,255,255,0.95)] backdrop-blur-2xl supports-[not_(backdrop-filter:blur(1px))]:bg-white sm:px-10 sm:py-16">
          <div
            aria-hidden
            className="absolute -top-28 left-1/2 size-72 -translate-x-1/2 rounded-full bg-[#D8E8FF] blur-3xl"
          />
          <div className="relative mx-auto max-w-3xl">
            <h2 className="text-3xl font-semibold tracking-[-0.035em] text-balance sm:text-4xl lg:text-5xl">
              {sections.contact.title}
            </h2>
            <p className="mx-auto mt-5 max-w-[60ch] text-base leading-8 text-[#52637A]">
              {sections.contact.description}
            </p>
            <p className="mx-auto mt-4 max-w-2xl rounded-xl border border-[#B4CAE6] bg-[#F4F8FF] px-4 py-3 text-sm leading-6 text-[#334A67]">
              {sections.contact.demo_status}
            </p>
            <div className="mt-7 flex flex-col justify-center gap-3 sm:flex-row">
              <ActionLink action={sections.contact.primary_action} locale={locale} />
              <ActionLink
                action={sections.contact.secondary_action}
                locale={locale}
                secondary
              />
            </div>
            <p className="mt-5 text-xs leading-5 text-[#52637A]">
              {sections.contact.barrier}
            </p>
          </div>
        </div>
      </LandingRevealSection>
    </main>
  );
}
