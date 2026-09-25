import { useState, useEffect, useRef } from 'react';
import { createFileRoute, useNavigate, Navigate } from '@tanstack/react-router';
import { useQuery, useMutation } from '@tanstack/react-query';
import { fetchCareerProfile } from '../api/profile';
import { apiClient } from '../api/client';
import { LoadingState } from '../components/states/LoadingState';
import { useAuth } from '../lib/auth-context';
import { TagInput } from '../components/ui/tag-input';
import { HugeiconsIcon } from '@hugeicons/react';
import { CheckIcon, ArrowRightIcon, ArrowLeftIcon, AlertCircleIcon, LogOutIcon } from '@hugeicons/core-free-icons';;

export const Route = createFileRoute('/onboarding')({
  component: OnboardingComponent,
});

type StepId = 'role' | 'skills' | 'summary' | 'links';

interface StepConfig {
  id: StepId;
  label: string;
  hint: string;
}

const STEPS: StepConfig[] = [
  { id: 'role', label: 'Role & Direction', hint: 'Where you are and what positions you are targeting next.' },
  { id: 'skills', label: 'Core Skills', hint: 'Add up to 50 skills that shape how Outreacher evaluates fit.' },
  { id: 'summary', label: 'Professional Summary', hint: "How you'd introduce yourself to companies." },
  { id: 'links', label: 'Presence & Links', hint: 'Optional professional links to your work.' },
];

const SKILL_SUGGESTIONS = [
  'React', 'TypeScript', 'Node.js', 'Python', 'Product Design', 'Figma',
  'Product Management', 'Data Analysis', 'SQL', 'Leadership', 'Go', 'Rust',
  'UX Research', 'Growth', 'iOS', 'Android', 'Fintech', 'Machine Learning',
];

interface OnboardingFormData {
  headline: string;
  targetRoles: string[];
  skills: string[];
  summary: string;
  linkedinUrl: string;
  githubUrl: string;
  portfolioUrl: string;
  currentRole: string;
  yearsExperience: string;
  careerGoals: string;
  backgroundAndPositioning: string;
  targetIndustries: string[];
  targetLocations: string[];
  experienceSummary: string;
  websiteUrl: string;
}

const formatNull = (val: string) => {
  const trimmed = val.trim();
  return trimmed === '' ? null : trimmed;
};

function isValidUrl(val: string): boolean {
  const trimmed = val.trim();
  if (!trimmed) return true;
  try {
    const u = new URL(trimmed);
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch {
    return false;
  }
}

function OnboardingComponent() {
  const { status, user, logout } = useAuth();
  const navigate = useNavigate();
  const [step, setStep] = useState(0);
  const [done, setDone] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [serverError, setServerError] = useState<string | null>(null);
  const cardRef = useRef<HTMLDivElement>(null);

  const { data: initialProfile, isLoading: isProfileLoading } = useQuery({
    queryKey: ['profile'],
    queryFn: fetchCareerProfile,
    enabled: status === 'authenticated',
  });

  const [form, setForm] = useState<OnboardingFormData>({
    headline: '',
    targetRoles: [],
    skills: [],
    summary: '',
    linkedinUrl: '',
    githubUrl: '',
    portfolioUrl: '',
    currentRole: '',
    yearsExperience: '',
    careerGoals: '',
    backgroundAndPositioning: '',
    targetIndustries: [],
    targetLocations: [],
    experienceSummary: '',
    websiteUrl: '',
  });

  const [initialized, setInitialized] = useState(false);
  useEffect(() => {
    if (initialProfile && !initialized) {
      setForm({
        headline: initialProfile.headline ?? '',
        targetRoles: initialProfile.targetRoles ?? [],
        skills: initialProfile.skills ?? [],
        summary: initialProfile.summary ?? '',
        linkedinUrl: initialProfile.linkedinUrl ?? '',
        githubUrl: initialProfile.githubUrl ?? '',
        portfolioUrl: initialProfile.portfolioUrl ?? '',
        currentRole: initialProfile.currentRole ?? '',
        yearsExperience: initialProfile.yearsExperience ?? '',
        careerGoals: initialProfile.careerGoals ?? '',
        backgroundAndPositioning: initialProfile.backgroundAndPositioning ?? '',
        targetIndustries: initialProfile.targetIndustries ?? [],
        targetLocations: initialProfile.targetLocations ?? [],
        experienceSummary: initialProfile.experienceSummary ?? '',
        websiteUrl: initialProfile.websiteUrl ?? '',
      });
      setInitialized(true);
    }
  }, [initialProfile, initialized]);

  function update<K extends keyof OnboardingFormData>(key: K, value: OnboardingFormData[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
    if (errors[key]) {
      setErrors((prev) => {
        const next = { ...prev };
        delete next[key];
        return next;
      });
    }
    if (serverError) setServerError(null);
  }

  const mutation = useMutation({
    mutationFn: async (payload: OnboardingFormData) => {
      return apiClient.patch('/profile', {
        headline: payload.headline.trim() || null,
        targetRoles: payload.targetRoles,
        skills: payload.skills,
        summary: payload.summary.trim() || null,
        linkedinUrl: formatNull(payload.linkedinUrl),
        githubUrl: formatNull(payload.githubUrl),
        portfolioUrl: formatNull(payload.portfolioUrl),
        currentRole: formatNull(payload.currentRole),
        yearsExperience: formatNull(payload.yearsExperience),
        careerGoals: formatNull(payload.careerGoals),
        backgroundAndPositioning: formatNull(payload.backgroundAndPositioning),
        targetIndustries: payload.targetIndustries,
        targetLocations: payload.targetLocations,
        experienceSummary: formatNull(payload.experienceSummary),
        websiteUrl: formatNull(payload.websiteUrl),
      });
    },
    onSuccess: () => {
      setDone(true);
    },
    onError: (err) => {
      setServerError(err instanceof Error ? err.message : 'Failed to save profile. Please try again.');
    },
  });

  function validateStep(stepIndex: number): Record<string, string> {
    const errs: Record<string, string> = {};
    if (stepIndex === 0) {
      if (!form.headline.trim()) {
        errs.headline = 'Professional headline is required.';
      } else if (form.headline.length > 120) {
        errs.headline = 'Headline must be 120 characters or fewer.';
      }
      if (form.targetRoles.length === 0) {
        errs.targetRoles = 'Please add at least one target role.';
      } else if (form.targetRoles.length > 20) {
        errs.targetRoles = 'Maximum 20 target roles.';
      }
      if (form.currentRole && form.currentRole.length > 120) {
        errs.currentRole = 'Current role must be 120 characters or fewer.';
      }
      if (form.yearsExperience && form.yearsExperience.length > 120) {
        errs.yearsExperience = 'Years of experience must be 120 characters or fewer.';
      }
      if (form.targetIndustries.length > 20) {
        errs.targetIndustries = 'Maximum 20 target industries.';
      }
      if (form.targetLocations.length > 20) {
        errs.targetLocations = 'Maximum 20 target locations.';
      }
    } else if (stepIndex === 1) {
      if (form.skills.length === 0) {
        errs.skills = 'Please add at least one core skill.';
      } else if (form.skills.length > 50) {
        errs.skills = 'Maximum 50 skills.';
      }
    } else if (stepIndex === 2) {
      if (form.summary.length > 2000) {
        errs.summary = 'Summary must be 2000 characters or fewer.';
      }
      if (form.experienceSummary.length > 5000) {
        errs.experienceSummary = 'Experience summary must be 5000 characters or fewer.';
      }
      if (form.careerGoals.length > 2000) {
        errs.careerGoals = 'Career goals must be 2000 characters or fewer.';
      }
      if (form.backgroundAndPositioning.length > 5000) {
        errs.backgroundAndPositioning = 'Background and positioning must be 5000 characters or fewer.';
      }
    } else if (stepIndex === 3) {
      if (form.linkedinUrl.trim() && !isValidUrl(form.linkedinUrl)) {
        errs.linkedinUrl = 'Please enter a valid URL (e.g. https://linkedin.com/in/...).';
      }
      if (form.githubUrl.trim() && !isValidUrl(form.githubUrl)) {
        errs.githubUrl = 'Please enter a valid URL (e.g. https://github.com/...).';
      }
      if (form.portfolioUrl.trim() && !isValidUrl(form.portfolioUrl)) {
        errs.portfolioUrl = 'Please enter a valid URL (e.g. https://...).';
      }
      if (form.websiteUrl.trim() && !isValidUrl(form.websiteUrl)) {
        errs.websiteUrl = 'Please enter a valid URL (e.g. https://...).';
      }
    }
    return errs;
  }

  function handleNext() {
    const errs = validateStep(step);
    if (Object.keys(errs).length > 0) {
      setErrors(errs);
      return;
    }
    setErrors({});
    setServerError(null);

    if (step < STEPS.length - 1) {
      setStep((s) => s + 1);
      if (typeof cardRef.current?.scrollTo === 'function') {
        cardRef.current.scrollTo(0, 0);
      }
      return;
    }

    // Final step — trigger real PATCH /profile
    mutation.mutate(form);
  }

  function handleBack() {
    if (step > 0) {
      setStep((s) => s - 1);
      setErrors({});
      setServerError(null);
    }
  }

  if (status === 'unauthenticated') {
    return <Navigate to="/login" replace />;
  }

  if (status === 'loading' || isProfileLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center p-4 bg-(--color-background)">
        <LoadingState message="Loading onboarding..." />
      </div>
    );
  }

  if (done) {
    const firstName = user?.firstName || 'there';
    return (
      <div className="min-h-screen flex items-center justify-center p-6 bg-(--color-background)">
        <div className="w-full max-w-130 text-center py-8">
          <div className="w-16 h-16 rounded-none-none mx-auto flex items-center justify-center mb-6 text-indigo-700 ">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M22 2L11 13M22 2L15 22 11 13 2 9l20-7z" />
            </svg>
          </div>
          <h2 className="text-[26px] font-bold mb-2 font-heading tracking-tight text-(--color-primary)">
            You're all set, {firstName}.
          </h2>
          <p className="text-[15px] max-w-[420px] mx-auto leading-relaxed text-muted-fg font-body">
            Outreacher has everything it needs to help you find the right companies, identify relevant contacts, and send outreach grounded in evidence.
          </p>
          <button
            type="button"
            onClick={() => navigate({ to: '/dashboard' })}
            className="mt-8 inline-flex items-center gap-2 px-7 py-3 rounded-none-none font-semibold text-[15px]  bg-(--color-primary) text-white -xs hover:bg-opacity-95 active:scale-[0.99] font-heading cursor-pointer"
          >
            <span>Enter Outreacher</span>
            <HugeiconsIcon icon={ArrowRightIcon} size={16} />
          </button>
        </div>
      </div>
    );
  }

  const currentStep = STEPS[step];
  const isLastStep = step === STEPS.length - 1;

  return (
    <div className="min-h-screen flex flex-col bg-(--color-background)">
      {/* Header */}
      <header className="flex items-center justify-between px-4 sm:px-8 h-15 shrink-0 border-b border-border bg-(--color-card) select-none">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-none-none flex items-center justify-center bg-[var(--color-accent)] -xs">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M22 2L11 13M22 2L15 22 11 13 2 9l20-7z" />
            </svg>
          </div>
          <span className="font-bold text-[15px] font-heading tracking-tight text-(--color-primary)">
            Outreacher
          </span>
        </div>
        <div className="flex items-center gap-4">
          <button
            type="button"
            onClick={() => navigate({ to: '/' })}
            className="text-[12.5px] text-muted-fg hover:text-(--color-primary)  font-body cursor-pointer"
          >
            Skip for now
          </button>
          <button
            type="button"
            onClick={() => void logout()}
            className="text-[12.5px] text-muted-fg hover:text-red-600  font-body flex items-center gap-1 cursor-pointer"
          >
            <HugeiconsIcon icon={LogOutIcon} size={13} />
            <span>Log out</span>
          </button>
        </div>
      </header>

      {/* Content */}
      <div className="flex-1 flex items-start justify-center px-4 sm:px-6 py-8 sm:py-10 overflow-y-auto">
        <div ref={cardRef} className="w-full max-w-135">
          {/* Stepper */}
          <div className="flex items-center gap-0 mb-8 select-none" aria-label="Onboarding Progress">
            {STEPS.map((s, i) => {
              const doneStep = i < step;
              const activeStep = i === step;
              return (
                <div key={s.id} className="flex items-center flex-1 last:flex-none">
                  <div className="flex flex-col items-center gap-1.5">
                    <div
                      className={`w-7 h-7 rounded-none-full flex items-center justify-center text-[12px] font-bold  font-heading ${doneStep
                        ? 'bg-[var(--color-accent)] text-white'
                        : activeStep
                          ? 'bg-(--color-primary) text-white -xs ring-2 ring-[var(--color-accent)]/30'
                          : 'bg-slate-100 text-slate-400 border border-slate-200'
                        }`}
                      aria-current={activeStep ? 'step' : undefined}
                    >
                      {doneStep ? <HugeiconsIcon icon={CheckIcon} size={13} strokeWidth={2.5} /> : i + 1}
                    </div>
                    <span
                      className={`text-[11px] font-medium hidden sm:block font-heading ${activeStep
                        ? 'text-(--color-primary) font-semibold'
                        : doneStep
                          ? 'text-[var(--color-accent)]'
                          : 'text-slate-400'
                        }`}
                    >
                      {s.label}
                    </span>
                  </div>
                  {i < STEPS.length - 1 && (
                    <div
                      className={`flex-1 h-px mx-2 mb-4  ${doneStep ? 'bg-[var(--color-accent)]' : 'bg-[var(--color-border)]'
                        }`}
                    />
                  )}
                </div>
              );
            })}
          </div>

          {/* Card */}
          <div className="rounded-none-none p-6 sm:p-8 bg-(--color-card) border border-border -xs">
            <div className="mb-6">
              <h2 className="text-[22px] font-bold leading-tight font-heading tracking-tight text-(--color-primary)">
                {currentStep.label}
              </h2>
              <p className="text-[14px] mt-1 text-muted-fg font-body">
                {currentStep.hint}
              </p>
            </div>

            {serverError && (
              <div role="alert" className="flex items-start gap-2.5 px-4 py-3 rounded-none-none mb-6 text-[13px] bg-[#FEF2F2] border border-[#FECACA] text-[#B91C1C]">
                <HugeiconsIcon icon={AlertCircleIcon} size={15} className="mt-0.5 shrink-0" />
                <span className="font-body leading-relaxed">{serverError}</span>
              </div>
            )}

            {/* Step 1: Role & Direction */}
            {step === 0 && (
              <div className="flex flex-col gap-5">
                <div>
                  <label htmlFor="headline" className="block text-[13px] font-medium mb-1.5 font-heading text-(--color-primary)">
                    Professional Headline
                  </label>
                  <p className="text-[12.5px] mb-2 text-muted-fg font-body">
                    A concise statement of what you do professionally (e.g. Senior Frontend Engineer).
                  </p>
                  <div className="relative">
                    <input
                      id="headline"
                      type="text"
                      maxLength={120}
                      value={form.headline}
                      onChange={(e) => update('headline', e.target.value)}
                      placeholder="e.g. Senior Frontend Engineer"
                      className="w-full px-4 py-2.5 rounded-none-none text-[14px] outline-none  border bg-(--color-card) text-(--color-primary) font-body"
                      style={{
                        borderColor: errors.headline ? '#FCA5A5' : 'var(--color-border)',
                        backgroundColor: errors.headline ? '#FEF2F2' : 'var(--color-card)',
                      }}
                      onFocus={(e) => {
                        if (!errors.headline) e.currentTarget.style.borderColor = 'var(--color-accent)';
                      }}
                      onBlur={(e) => {
                        if (!errors.headline) e.currentTarget.style.borderColor = 'var(--color-border)';
                      }}
                    />
                  </div>
                  {errors.headline && (
                    <p className="mt-1.5 text-[12px] flex items-center gap-1 text-[#EF4444] font-body">
                      <HugeiconsIcon icon={AlertCircleIcon} size={12} /> {errors.headline}
                    </p>
                  )}
                </div>

                <div>
                  <TagInput
                    id="targetRoles"
                    label="Target Roles"
                    tags={form.targetRoles}
                    onChange={(roles) => update('targetRoles', roles)}
                    placeholder="Type a role and press Enter (e.g. Frontend Engineer)..."
                  />
                  <p className="text-[12px] mt-1 text-muted-fg font-body">
                    Add up to 20 roles you are actively targeting.
                  </p>
                  {errors.targetRoles && (
                    <p className="mt-1.5 text-[12px] flex items-center gap-1 text-[#EF4444] font-body">
                      <HugeiconsIcon icon={AlertCircleIcon} size={12} /> {errors.targetRoles}
                    </p>
                  )}
                </div>

                <div>
                  <TagInput
                    id="targetIndustries"
                    label="Target Industries"
                    tags={form.targetIndustries}
                    onChange={(industries) => update('targetIndustries', industries)}
                    placeholder="Type an industry and press Enter (e.g. Fintech)..."
                  />
                  <p className="text-[12px] mt-1 text-muted-fg font-body">
                    Add industries you are interested in.
                  </p>
                  {errors.targetIndustries && (
                    <p className="mt-1.5 text-[12px] flex items-center gap-1 text-[#EF4444] font-body">
                      <HugeiconsIcon icon={AlertCircleIcon} size={12} /> {errors.targetIndustries}
                    </p>
                  )}
                </div>

                <div>
                  <TagInput
                    id="targetLocations"
                    label="Target Locations"
                    tags={form.targetLocations}
                    onChange={(locations) => update('targetLocations', locations)}
                    placeholder="Type a location and press Enter (e.g. Remote, New York)..."
                  />
                  <p className="text-[12px] mt-1 text-muted-fg font-body">
                    Add locations you are targeting for your next role.
                  </p>
                  {errors.targetLocations && (
                    <p className="mt-1.5 text-[12px] flex items-center gap-1 text-[#EF4444] font-body">
                      <HugeiconsIcon icon={AlertCircleIcon} size={12} /> {errors.targetLocations}
                    </p>
                  )}
                </div>

                <div>
                  <label htmlFor="currentRole" className="block text-[13px] font-medium mb-1.5 font-heading text-(--color-primary)">
                    Current Role
                  </label>
                  <p className="text-[12.5px] mb-2 text-muted-fg font-body">
                    Your current or most recent job title.
                  </p>
                  <div className="relative">
                    <input
                      id="currentRole"
                      type="text"
                      maxLength={120}
                      value={form.currentRole}
                      onChange={(e) => update('currentRole', e.target.value)}
                      placeholder="e.g. Senior Software Engineer"
                      className="w-full px-4 py-2.5 rounded-none-none text-[14px] outline-none  border bg-(--color-card) text-(--color-primary) font-body"
                      style={{
                        borderColor: errors.currentRole ? '#FCA5A5' : 'var(--color-border)',
                        backgroundColor: errors.currentRole ? '#FEF2F2' : 'var(--color-card)',
                      }}
                      onFocus={(e) => {
                        if (!errors.currentRole) e.currentTarget.style.borderColor = 'var(--color-accent)';
                      }}
                      onBlur={(e) => {
                        if (!errors.currentRole) e.currentTarget.style.borderColor = 'var(--color-border)';
                      }}
                    />
                  </div>
                  {errors.currentRole && (
                    <p className="mt-1.5 text-[12px] flex items-center gap-1 text-[#EF4444] font-body">
                      <HugeiconsIcon icon={AlertCircleIcon} size={12} /> {errors.currentRole}
                    </p>
                  )}
                </div>

                <div>
                  <label htmlFor="yearsExperience" className="block text-[13px] font-medium mb-1.5 font-heading text-(--color-primary)">
                    Years of Experience
                  </label>
                  <p className="text-[12.5px] mb-2 text-muted-fg font-body">
                    How many years of professional experience do you have?
                  </p>
                  <div className="relative">
                    <input
                      id="yearsExperience"
                      type="text"
                      maxLength={120}
                      value={form.yearsExperience}
                      onChange={(e) => update('yearsExperience', e.target.value)}
                      placeholder="e.g. 5+ years"
                      className="w-full px-4 py-2.5 rounded-none-none text-[14px] outline-none  border bg-(--color-card) text-(--color-primary) font-body"
                      style={{
                        borderColor: errors.yearsExperience ? '#FCA5A5' : 'var(--color-border)',
                        backgroundColor: errors.yearsExperience ? '#FEF2F2' : 'var(--color-card)',
                      }}
                      onFocus={(e) => {
                        if (!errors.yearsExperience) e.currentTarget.style.borderColor = 'var(--color-accent)';
                      }}
                      onBlur={(e) => {
                        if (!errors.yearsExperience) e.currentTarget.style.borderColor = 'var(--color-border)';
                      }}
                    />
                  </div>
                  {errors.yearsExperience && (
                    <p className="mt-1.5 text-[12px] flex items-center gap-1 text-[#EF4444] font-body">
                      <HugeiconsIcon icon={AlertCircleIcon} size={12} /> {errors.yearsExperience}
                    </p>
                  )}
                </div>
              </div>
            )}

            {/* Step 2: Core Skills */}
            {step === 1 && (
              <div className="flex flex-col gap-4">
                <div>
                  <TagInput
                    id="skills"
                    label="Core Skills"
                    tags={form.skills}
                    onChange={(skills) => update('skills', skills)}
                    placeholder="Type a skill and press Enter (e.g. React)..."
                  />
                  <p className="text-[12.5px] mt-1 text-muted-fg font-body">
                    Add up to 50 skills. These shape how Outreacher evaluates company and contact relevance.
                  </p>
                  {errors.skills && (
                    <p className="mt-1.5 text-[12px] flex items-center gap-1 text-[#EF4444] font-body">
                      <HugeiconsIcon icon={AlertCircleIcon} size={12} /> {errors.skills}
                    </p>
                  )}
                </div>

                {/* Quick-add suggestions */}
                <div>
                  <span className="block text-[11.5px] font-semibold uppercase tracking-wider text-slate-500 mb-2 font-heading">
                    Quick suggestions:
                  </span>
                  <div className="flex flex-wrap gap-1.5">
                    {SKILL_SUGGESTIONS.filter((s) => !form.skills.includes(s)).slice(0, 8).map((s) => (
                      <button
                        key={s}
                        type="button"
                        onClick={() => {
                          if (form.skills.length < 50) {
                            update('skills', [...form.skills, s]);
                          }
                        }}
                        className="text-[11.5px] px-2.5 py-1 rounded-none-none  bg-(--color-muted) text-muted-fg border border-border hover:border-[var(--color-accent)] hover:text-[var(--color-accent)] font-body cursor-pointer"
                      >
                        + {s}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* Step 3: Professional Summary */}
            {step === 2 && (
                <>
                <div>
                <label htmlFor="summary" className="block text-[13px] font-medium mb-1.5 font-heading text-(--color-primary)">
                  Professional Summary
                </label>
                <p className="text-[12.5px] mb-2.5 text-muted-fg font-body">
                  Write as you'd introduce yourself. This informs outreach generation — never invented.
                </p>
                <div className="relative">
                  <textarea
                    id="summary"
                    rows={6}
                    maxLength={2000}
                    value={form.summary}
                    onChange={(e) => update('summary', e.target.value)}
                    placeholder="e.g. I'm a software engineer with 6 years of experience building payment infrastructure at scale. I've led backend systems handling millions of transactions and I'm looking for my next challenge..."
                    className="w-full px-4 py-3 rounded-none-none text-[14px] outline-none  resize-none border bg-(--color-card) text-(--color-primary) font-body leading-relaxed"
                    style={{
                      borderColor: errors.summary ? '#FCA5A5' : 'var(--color-border)',
                      backgroundColor: errors.summary ? '#FEF2F2' : 'var(--color-card)',
                    }}
                    onFocus={(e) => {
                      if (!errors.summary) e.currentTarget.style.borderColor = 'var(--color-accent)';
                    } }
                    onBlur={(e) => {
                      if (!errors.summary) e.currentTarget.style.borderColor = 'var(--color-border)';
                    } } />
                  <span
                    className={`absolute bottom-3 right-3 text-[11.5px] font-body ${form.summary.length > 1800 ? 'text-amber-500' : 'text-muted-fg'}`}
                  >
                    {form.summary.length}/2000
                  </span>
                </div>
                {errors.summary && (
                  <p className="mt-1.5 text-[12px] flex items-center gap-1 text-[#EF4444] font-body">
                    <HugeiconsIcon icon={AlertCircleIcon} size={12} /> {errors.summary}
                  </p>
                )}
              </div><div className="mt-5">
                  <label htmlFor="experienceSummary" className="block text-[13px] font-medium mb-1.5 font-heading text-(--color-primary)">
                    Experience Summary
                  </label>
                  <p className="text-[12.5px] mb-2.5 text-muted-fg font-body">
                    A brief summary of your past experience.
                  </p>
                  <div className="relative">
                    <textarea
                      id="experienceSummary"
                      rows={4}
                      maxLength={5000}
                      value={form.experienceSummary}
                      onChange={(e) => update('experienceSummary', e.target.value)}
                      placeholder="e.g. Worked at Google for 4 years on search infrastructure..."
                      className="w-full px-4 py-3 rounded-none-none text-[14px] outline-none  resize-none border bg-(--color-card) text-(--color-primary) font-body leading-relaxed"
                      style={{
                        borderColor: errors.experienceSummary ? '#FCA5A5' : 'var(--color-border)',
                        backgroundColor: errors.experienceSummary ? '#FEF2F2' : 'var(--color-card)',
                      }}
                      onFocus={(e) => {
                        if (!errors.experienceSummary) e.currentTarget.style.borderColor = 'var(--color-accent)';
                      } }
                      onBlur={(e) => {
                        if (!errors.experienceSummary) e.currentTarget.style.borderColor = 'var(--color-border)';
                      } } />
                  </div>
                  {errors.experienceSummary && (
                    <p className="mt-1.5 text-[12px] flex items-center gap-1 text-[#EF4444] font-body">
                      <HugeiconsIcon icon={AlertCircleIcon} size={12} /> {errors.experienceSummary}
                    </p>
                  )}
                </div><div className="mt-5">
                  <label htmlFor="careerGoals" className="block text-[13px] font-medium mb-1.5 font-heading text-(--color-primary)">
                    Career Goals
                  </label>
                  <p className="text-[12.5px] mb-2.5 text-muted-fg font-body">
                    What are you looking for next in your career?
                  </p>
                  <div className="relative">
                    <textarea
                      id="careerGoals"
                      rows={4}
                      maxLength={2000}
                      value={form.careerGoals}
                      onChange={(e) => update('careerGoals', e.target.value)}
                      placeholder="e.g. Seeking a leadership role in a fast-paced environment..."
                      className="w-full px-4 py-3 rounded-none-none text-[14px] outline-none  resize-none border bg-(--color-card) text-(--color-primary) font-body leading-relaxed"
                      style={{
                        borderColor: errors.careerGoals ? '#FCA5A5' : 'var(--color-border)',
                        backgroundColor: errors.careerGoals ? '#FEF2F2' : 'var(--color-card)',
                      }}
                      onFocus={(e) => {
                        if (!errors.careerGoals) e.currentTarget.style.borderColor = 'var(--color-accent)';
                      } }
                      onBlur={(e) => {
                        if (!errors.careerGoals) e.currentTarget.style.borderColor = 'var(--color-border)';
                      } } />
                  </div>
                  {errors.careerGoals && (
                    <p className="mt-1.5 text-[12px] flex items-center gap-1 text-[#EF4444] font-body">
                      <HugeiconsIcon icon={AlertCircleIcon} size={12} /> {errors.careerGoals}
                    </p>
                  )}
                </div><div className="mt-5">
                  <label htmlFor="backgroundAndPositioning" className="block text-[13px] font-medium mb-1.5 font-heading text-(--color-primary)">
                    Background & Positioning
                  </label>
                  <p className="text-[12.5px] mb-2.5 text-muted-fg font-body">
                    Context on your background and how you position yourself.
                  </p>
                  <div className="relative">
                    <textarea
                      id="backgroundAndPositioning"
                      rows={4}
                      maxLength={5000}
                      value={form.backgroundAndPositioning}
                      onChange={(e) => update('backgroundAndPositioning', e.target.value)}
                      placeholder="Details about your background..."
                      className="w-full px-4 py-3 rounded-none-none text-[14px] outline-none  resize-none border bg-(--color-card) text-(--color-primary) font-body leading-relaxed"
                      style={{
                        borderColor: errors.backgroundAndPositioning ? '#FCA5A5' : 'var(--color-border)',
                        backgroundColor: errors.backgroundAndPositioning ? '#FEF2F2' : 'var(--color-card)',
                      }}
                      onFocus={(e) => {
                        if (!errors.backgroundAndPositioning) e.currentTarget.style.borderColor = 'var(--color-accent)';
                      } }
                      onBlur={(e) => {
                        if (!errors.backgroundAndPositioning) e.currentTarget.style.borderColor = 'var(--color-border)';
                      } } />
                  </div>
                  {errors.backgroundAndPositioning && (
                    <p className="mt-1.5 text-[12px] flex items-center gap-1 text-[#EF4444] font-body">
                      <HugeiconsIcon icon={AlertCircleIcon} size={12} /> {errors.backgroundAndPositioning}
                    </p>
                  )}
                </div></>
            )}

            {/* Step 4: Presence & Links */}
            {step === 3 && (
              <div className="flex flex-col gap-4">
                <p className="text-[13px] text-muted-fg font-body">
                  All fields are optional. Add links relevant to your target role.
                </p>

                {/* LinkedIn */}
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label htmlFor="linkedinUrl" className="text-[13px] font-medium font-heading text-(--color-primary)">
                      LinkedIn URL
                    </label>
                    <span className="text-[11px] font-normal px-1.5 py-0.5 rounded-none bg-(--color-muted) text-muted-fg font-body">
                      Optional
                    </span>
                  </div>
                  <div className="relative">
                    <div className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-fg pointer-events-none">
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M16 8a6 6 0 0 1 6 6v7h-4v-7a2 2 0 0 0-2-2 2 2 0 0 0-2 2v7h-4v-7a6 6 0 0 1 6-6zM2 9h4v12H2zM4 6a2 2 0 1 1 0-4 2 2 0 0 1 0 4z" />
                      </svg>
                    </div>
                    <input
                      id="linkedinUrl"
                      type="url"
                      value={form.linkedinUrl}
                      onChange={(e) => update('linkedinUrl', e.target.value)}
                      placeholder="https://linkedin.com/in/username"
                      className="w-full pl-9 pr-4 py-2.5 rounded-none-none text-[14px] outline-none  border bg-(--color-card) text-(--color-primary) font-body"
                      style={{
                        borderColor: errors.linkedinUrl ? '#FCA5A5' : 'var(--color-border)',
                        backgroundColor: errors.linkedinUrl ? '#FEF2F2' : 'var(--color-card)',
                      }}
                      onFocus={(e) => {
                        if (!errors.linkedinUrl) e.currentTarget.style.borderColor = 'var(--color-accent)';
                      }}
                      onBlur={(e) => {
                        if (!errors.linkedinUrl) e.currentTarget.style.borderColor = 'var(--color-border)';
                      }}
                    />
                  </div>
                  {errors.linkedinUrl && (
                    <p className="mt-1.5 text-[12px] flex items-center gap-1 text-[#EF4444] font-body">
                      <HugeiconsIcon icon={AlertCircleIcon} size={12} /> {errors.linkedinUrl}
                    </p>
                  )}
                </div>

                {/* GitHub */}
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label htmlFor="githubUrl" className="text-[13px] font-medium font-heading text-(--color-primary)">
                      GitHub URL
                    </label>
                    <span className="text-[11px] font-normal px-1.5 py-0.5 rounded-none bg-(--color-muted) text-muted-fg font-body">
                      Optional
                    </span>
                  </div>
                  <div className="relative">
                    <div className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-fg pointer-events-none">
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M9 19c-5 1.5-5-2.5-7-3m14 6v-3.87a3.37 3.37 0 0 0-.94-2.61c3.14-.35 6.44-1.54 6.44-7A5.44 5.44 0 0 0 20 4.77 5.07 5.07 0 0 0 19.91 1S18.73.65 16 2.48a13.38 13.38 0 0 0-7 0C6.27.65 5.09 1 5.09 1A5.07 5.07 0 0 0 5 4.77a5.44 5.44 0 0 0-1.5 3.78c0 5.42 3.3 6.61 6.44 7A3.37 3.37 0 0 0 9 18.13V22" />
                      </svg>
                    </div>
                    <input
                      id="githubUrl"
                      type="url"
                      value={form.githubUrl}
                      onChange={(e) => update('githubUrl', e.target.value)}
                      placeholder="https://github.com/username"
                      className="w-full pl-9 pr-4 py-2.5 rounded-none-none text-[14px] outline-none  border bg-(--color-card) text-(--color-primary) font-body"
                      style={{
                        borderColor: errors.githubUrl ? '#FCA5A5' : 'var(--color-border)',
                        backgroundColor: errors.githubUrl ? '#FEF2F2' : 'var(--color-card)',
                      }}
                      onFocus={(e) => {
                        if (!errors.githubUrl) e.currentTarget.style.borderColor = 'var(--color-accent)';
                      }}
                      onBlur={(e) => {
                        if (!errors.githubUrl) e.currentTarget.style.borderColor = 'var(--color-border)';
                      }}
                    />
                  </div>
                  {errors.githubUrl && (
                    <p className="mt-1.5 text-[12px] flex items-center gap-1 text-[#EF4444] font-body">
                      <HugeiconsIcon icon={AlertCircleIcon} size={12} /> {errors.githubUrl}
                    </p>
                  )}
                </div>

                {/* Portfolio */}
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label htmlFor="portfolioUrl" className="text-[13px] font-medium font-heading text-(--color-primary)">
                      Portfolio URL
                    </label>
                    <span className="text-[11px] font-normal px-1.5 py-0.5 rounded-none bg-(--color-muted) text-muted-fg font-body">
                      Optional
                    </span>
                  </div>
                  <div className="relative">
                    <div className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-fg pointer-events-none">
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
                      </svg>
                    </div>
                    <input
                      id="portfolioUrl"
                      type="url"
                      value={form.portfolioUrl}
                      onChange={(e) => update('portfolioUrl', e.target.value)}
                      placeholder="https://yourportfolio.com"
                      className="w-full pl-9 pr-4 py-2.5 rounded-none-none text-[14px] outline-none  border bg-(--color-card) text-(--color-primary) font-body"
                      style={{
                        borderColor: errors.portfolioUrl ? '#FCA5A5' : 'var(--color-border)',
                        backgroundColor: errors.portfolioUrl ? '#FEF2F2' : 'var(--color-card)',
                      }}
                      onFocus={(e) => {
                        if (!errors.portfolioUrl) e.currentTarget.style.borderColor = 'var(--color-accent)';
                      }}
                      onBlur={(e) => {
                        if (!errors.portfolioUrl) e.currentTarget.style.borderColor = 'var(--color-border)';
                      }}
                    />
                  </div>
                  {errors.portfolioUrl && (
                    <p className="mt-1.5 text-[12px] flex items-center gap-1 text-[#EF4444] font-body">
                      <HugeiconsIcon icon={AlertCircleIcon} size={12} /> {errors.portfolioUrl}
                    </p>
                  )}
                </div>

                {/* Website */}
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label htmlFor="websiteUrl" className="text-[13px] font-medium font-heading text-(--color-primary)">
                      Website URL
                    </label>
                    <span className="text-[11px] font-normal px-1.5 py-0.5 rounded-none bg-(--color-muted) text-muted-fg font-body">
                      Optional
                    </span>
                  </div>
                  <div className="relative">
                    <div className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-fg pointer-events-none">
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
                      </svg>
                    </div>
                    <input
                      id="websiteUrl"
                      type="url"
                      value={form.websiteUrl}
                      onChange={(e) => update('websiteUrl', e.target.value)}
                      placeholder="https://yoursite.com"
                      className="w-full pl-9 pr-4 py-2.5 rounded-none-none text-[14px] outline-none  border bg-(--color-card) text-(--color-primary) font-body"
                      style={{
                        borderColor: errors.websiteUrl ? '#FCA5A5' : 'var(--color-border)',
                        backgroundColor: errors.websiteUrl ? '#FEF2F2' : 'var(--color-card)',
                      }}
                      onFocus={(e) => {
                        if (!errors.websiteUrl) e.currentTarget.style.borderColor = 'var(--color-accent)';
                      }}
                      onBlur={(e) => {
                        if (!errors.websiteUrl) e.currentTarget.style.borderColor = 'var(--color-border)';
                      }}
                    />
                  </div>
                  {errors.websiteUrl && (
                    <p className="mt-1.5 text-[12px] flex items-center gap-1 text-[#EF4444] font-body">
                      <HugeiconsIcon icon={AlertCircleIcon} size={12} /> {errors.websiteUrl}
                    </p>
                  )}
                </div>
              </div>
            )}

            {/* Navigation buttons */}
            <div className="flex items-center justify-between mt-8 pt-5 border-t border-border">
              <button
                type="button"
                onClick={handleBack}
                disabled={step === 0}
                className={`flex items-center gap-1.5 text-[13.5px] font-medium  font-body cursor-pointer ${step === 0 ? 'invisible pointer-events-none' : 'text-muted-fg hover:text-(--color-primary)'
                  }`}
              >
                <HugeiconsIcon icon={ArrowLeftIcon} size={15} /> Back
              </button>

              <button
                type="button"
                onClick={handleNext}
                disabled={mutation.isPending}
                className="flex items-center gap-2 px-6 py-2.5 rounded-none-none text-[14px] font-semibold  bg-(--color-primary) text-white -xs font-heading cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed hover:bg-opacity-95 active:scale-[0.99]"
              >
                {mutation.isPending ? (
                  <>
                    <svg className="animate-spin h-4 w-4 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                      <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
                    </svg>
                    <span>Saving profile…</span>
                  </>
                ) : isLastStep ? (
                  <>
                    <span>Complete profile</span>
                    <HugeiconsIcon icon={CheckIcon} size={14} strokeWidth={2.5} />
                  </>
                ) : (
                  <>
                    <span>Continue</span>
                    <HugeiconsIcon icon={ArrowRightIcon} size={14} />
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Reassurance subtext */}
          <p className="text-center text-[12px] mt-4 text-muted-fg font-body">
            You can update this information at any time in your profile settings.
          </p>
        </div>
      </div>
    </div>
  );
}
