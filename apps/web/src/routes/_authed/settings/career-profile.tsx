import { useState, useEffect, useCallback, FormEvent } from 'react';
import { createFileRoute } from '@tanstack/react-router';
import { apiClient, ApiError } from '../../../api/client';
import { TagInput } from '../../../components/ui/tag-input';

export const Route = createFileRoute('/_authed/settings/career-profile')({
  component: SettingsComponent,
});

export interface CareerProfileData {
  id: string;
  workspaceId: string;
  headline: string | null;
  summary: string | null;
  experienceSummary: string | null;
  targetRoles: string[];
  targetIndustries: string[];
  targetLocations: string[];
  skills: string[];
  portfolioUrl: string | null;
  githubUrl: string | null;
  linkedinUrl: string | null;
  websiteUrl: string | null;
}

export type FormStatus = 'loading' | 'ready' | 'dirty' | 'submitting' | 'saved' | 'error';

export function SettingsComponent() {
  const [status, setStatus] = useState<FormStatus>('loading');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Baseline data from server
  const [, setBaseline] = useState<CareerProfileData | null>(null);

  // Editable form fields
  const [headline, setHeadline] = useState('');
  const [summary, setSummary] = useState('');
  const [experienceSummary, setExperienceSummary] = useState('');
  const [targetRoles, setTargetRoles] = useState<string[]>([]);
  const [targetIndustries, setTargetIndustries] = useState<string[]>([]);
  const [targetLocations, setTargetLocations] = useState<string[]>([]);
  const [skills, setSkills] = useState<string[]>([]);
  const [portfolioUrl, setPortfolioUrl] = useState('');
  const [githubUrl, setGithubUrl] = useState('');
  const [linkedinUrl, setLinkedinUrl] = useState('');
  const [websiteUrl, setWebsiteUrl] = useState('');

  const populateForm = useCallback((data: CareerProfileData) => {
    setHeadline(data.headline ?? '');
    setSummary(data.summary ?? '');
    setExperienceSummary(data.experienceSummary ?? '');
    setTargetRoles(data.targetRoles ?? []);
    setTargetIndustries(data.targetIndustries ?? []);
    setTargetLocations(data.targetLocations ?? []);
    setSkills(data.skills ?? []);
    setPortfolioUrl(data.portfolioUrl ?? '');
    setGithubUrl(data.githubUrl ?? '');
    setLinkedinUrl(data.linkedinUrl ?? '');
    setWebsiteUrl(data.websiteUrl ?? '');
  }, []);

  const fetchProfile = useCallback(async () => {
    setStatus('loading');
    setErrorMessage(null);
    try {
      const profile = await apiClient.get<CareerProfileData>('/profile');
      setBaseline(profile);
      populateForm(profile);
      setStatus('ready');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to load profile';
      setErrorMessage(msg);
      setStatus('error');
    }
  }, [populateForm]);

  useEffect(() => {
    void fetchProfile();
  }, [fetchProfile]);

  // Unsaved changes browser navigation guard
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (status === 'dirty') {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, [status]);

  const markDirty = () => {
    if (status !== 'loading' && status !== 'submitting') {
      setStatus('dirty');
      setSuccessMessage(null);
    }
  };

  const handleSave = async (e: FormEvent) => {
    e.preventDefault();
    if (status === 'submitting') return;

    setStatus('submitting');
    setErrorMessage(null);
    setSuccessMessage(null);

    const formatNull = (val: string): string | null => {
      const trimmed = val.trim();
      return trimmed === '' ? null : trimmed;
    };

    const payload = {
      headline: formatNull(headline),
      summary: formatNull(summary),
      experienceSummary: formatNull(experienceSummary),
      targetRoles,
      targetIndustries,
      targetLocations,
      skills,
      portfolioUrl: formatNull(portfolioUrl),
      githubUrl: formatNull(githubUrl),
      linkedinUrl: formatNull(linkedinUrl),
      websiteUrl: formatNull(websiteUrl),
    };

    try {
      const updated = await apiClient.patch<CareerProfileData>('/profile', payload);
      setBaseline(updated);
      populateForm(updated);
      setStatus('saved');
      setSuccessMessage('Career profile saved successfully.');
    } catch (err: unknown) {
      if (err instanceof ApiError) {
        setErrorMessage(err.message);
      } else if (err instanceof Error) {
        setErrorMessage(err.message);
      } else {
        setErrorMessage('An unexpected error occurred while saving.');
      }
      setStatus('error');
    }
  };

  if (status === 'loading') {
    return (
      <div className="max-w-4xl space-y-6">
        <div className="h-8 w-48 animate-pulse rounded-none-none bg-slate-200" />
        <div className="h-64 animate-pulse rounded-none-none bg-slate-100 border border-slate-200" />
      </div>
    );
  }

  return (
    <div className="max-w-4xl space-y-6 pb-12">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 pb-5">
        <div>
          <div className="flex items-center gap-3">
            <h1
              className="text-[22px] font-bold tracking-tight text-slate-900"
              style={{ fontFamily: 'Plus Jakarta Sans, sans-serif' }}
            >
              Career Profile
            </h1>
            {status === 'dirty' && (
              <span
                className="inline-flex items-center gap-1.5 rounded-none-full px-2.5 py-0.5 text-[11px] font-bold tracking-wide"
                style={{
                  background: '#FFFBEB',
                  color: '#B45309',
                  border: '1px solid #FDE68A',
                  fontFamily: 'Plus Jakarta Sans, sans-serif',
                }}
              >
                <span className="w-1.5 h-1.5 rounded-none-full bg-amber-500" />
                Unsaved changes
              </span>
            )}
            {status === 'saved' && (
              <span
                className="inline-flex items-center gap-1.5 rounded-none-full px-2.5 py-0.5 text-[11px] font-bold tracking-wide"
                style={{
                  background: '#ECFDF5',
                  color: '#065F46',
                  border: '1px solid #A7F3D0',
                  fontFamily: 'Plus Jakarta Sans, sans-serif',
                }}
              >
                <span className="w-1.5 h-1.5 rounded-none-full bg-emerald-500" />
                Saved
              </span>
            )}
          </div>
          <p
            className="mt-1 text-[13px] text-slate-500"
            style={{ fontFamily: 'sans-serif' }}
          >
            Define your targeting goals and background to enable automated company research and
            outreach.
          </p>
        </div>
        <button
          type="button"
          onClick={(e) => void handleSave(e)}
          disabled={status === 'submitting'}
          className="inline-flex items-center justify-center rounded-none-none px-4 py-2 text-[13px] font-semibold text-white -xs -opacity hover:opacity-90 disabled:opacity-50"
          style={{
            background: 'var(--color-primary)',
            fontFamily: 'Plus Jakarta Sans, sans-serif',
          }}
        >
          {status === 'submitting' ? 'Saving Profile...' : 'Save Profile'}
        </button>
      </div>

      {errorMessage && (
        <div
          role="alert"
          className="rounded-none-none border border-red-200 bg-red-50 p-4 text-[13px] text-red-700 flex items-start gap-2.5 -xs"
          style={{ fontFamily: 'sans-serif' }}
        >
          <span className="font-bold shrink-0">Error:</span>
          <span>{errorMessage}</span>
        </div>
      )}

      {successMessage && (
        <div
          className="rounded-none-none border border-emerald-200 bg-emerald-50 p-4 text-[13px] text-emerald-800 flex items-start gap-2.5 -xs"
          style={{ fontFamily: 'sans-serif' }}
        >
          <span>{successMessage}</span>
        </div>
      )}

      <form onSubmit={(e) => void handleSave(e)} className="space-y-6">
        {/* Section 1: Targeting Preferences */}
        <section className="rounded-none-none border border-slate-200 bg-slate-50 overflow-hidden -xs">
          <div className="px-6 py-4 border-b border-slate-100 bg-slate-50/50">
            <h2
              className="text-[15px] font-bold text-slate-900"
              style={{ fontFamily: 'Plus Jakarta Sans, sans-serif' }}
            >
              1. Targeting Preferences
            </h2>
            <p
              className="text-[12px] text-slate-500 mt-0.5"
              style={{ fontFamily: 'sans-serif' }}
            >
              Primary drivers used by research engines to score company and opening relevance.
            </p>
          </div>
          <div className="p-6">
            <div className="grid gap-5 sm:grid-cols-2">
              <TagInput
                id="targetRoles"
                label="Target Roles"
                tags={targetRoles}
                disabled={status === 'submitting'}
                onChange={(newTags) => {
                  setTargetRoles(newTags);
                  markDirty();
                }}
                placeholder="e.g. Staff Backend Engineer"
              />
              <TagInput
                id="skills"
                label="Core Skills"
                tags={skills}
                disabled={status === 'submitting'}
                onChange={(newTags) => {
                  setSkills(newTags);
                  markDirty();
                }}
                placeholder="e.g. TypeScript, PostgreSQL"
              />
              <TagInput
                id="targetIndustries"
                label="Target Industries"
                tags={targetIndustries}
                disabled={status === 'submitting'}
                onChange={(newTags) => {
                  setTargetIndustries(newTags);
                  markDirty();
                }}
                placeholder="e.g. Fintech, DevTools"
              />
              <TagInput
                id="targetLocations"
                label="Target Locations"
                tags={targetLocations}
                disabled={status === 'submitting'}
                onChange={(newTags) => {
                  setTargetLocations(newTags);
                  markDirty();
                }}
                placeholder="e.g. Remote, New York, NY"
              />
            </div>
          </div>
        </section>

        {/* Section 2: Background & Positioning */}
        <section className="rounded-none-none border border-slate-200 bg-slate-50 overflow-hidden -xs">
          <div className="px-6 py-4 border-b border-slate-100 bg-slate-50/50">
            <h2
              className="text-[15px] font-bold text-slate-900"
              style={{ fontFamily: 'Plus Jakarta Sans, sans-serif' }}
            >
              2. Background & Positioning
            </h2>
            <p
              className="text-[12px] text-slate-500 mt-0.5"
              style={{ fontFamily: 'sans-serif' }}
            >
              Feeds AI outreach generation and evidence matching context.
            </p>
          </div>
          <div className="p-6 space-y-5">
            <div>
              <label
                htmlFor="headline"
                className="block text-[12px] font-bold uppercase tracking-wide text-slate-700 mb-1"
                style={{ fontFamily: 'Plus Jakarta Sans, sans-serif' }}
              >
                Professional Headline
              </label>
              <input
                id="headline"
                type="text"
                value={headline}
                disabled={status === 'submitting'}
                onChange={(e) => {
                  setHeadline(e.target.value);
                  markDirty();
                }}
                placeholder="e.g. Staff Engineer specializing in high-throughput backend architecture"
                className="block w-full px-3.5 py-2.5 text-[13.5px] rounded-none-none border border-slate-300 text-slate-900 -xs focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none disabled:opacity-50 disabled:bg-slate-50 "
                style={{ fontFamily: 'sans-serif' }}
              />
            </div>
            <div>
              <label
                htmlFor="summary"
                className="block text-[12px] font-bold uppercase tracking-wide text-slate-700 mb-1"
                style={{ fontFamily: 'Plus Jakarta Sans, sans-serif' }}
              >
                Professional Summary
              </label>
              <textarea
                id="summary"
                rows={4}
                value={summary}
                disabled={status === 'submitting'}
                onChange={(e) => {
                  setSummary(e.target.value);
                  markDirty();
                }}
                placeholder="Overview of your career narrative and core strengths..."
                className="block w-full px-3.5 py-2.5 text-[13.5px] rounded-none-none border border-slate-300 text-slate-900 -xs focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none disabled:opacity-50 disabled:bg-slate-50 resize-none  leading-relaxed"
                style={{ fontFamily: 'sans-serif' }}
              />
            </div>
            <div>
              <label
                htmlFor="experienceSummary"
                className="block text-[12px] font-bold uppercase tracking-wide text-slate-700 mb-1"
                style={{ fontFamily: 'Plus Jakarta Sans, sans-serif' }}
              >
                Experience Highlights
              </label>
              <textarea
                id="experienceSummary"
                rows={4}
                value={experienceSummary}
                disabled={status === 'submitting'}
                onChange={(e) => {
                  setExperienceSummary(e.target.value);
                  markDirty();
                }}
                placeholder="Key technical achievements, team leadership scale, or domain impacts..."
                className="block w-full px-3.5 py-2.5 text-[13.5px] rounded-none-none border border-slate-300 text-slate-900 -xs focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none disabled:opacity-50 disabled:bg-slate-50 resize-none  leading-relaxed"
                style={{ fontFamily: 'sans-serif' }}
              />
            </div>
          </div>
        </section>

        {/* Section 3: Professional Links */}
        <section className="rounded-none-none border border-slate-200 bg-slate-50 overflow-hidden -xs">
          <div className="px-6 py-4 border-b border-slate-100 bg-slate-50/50">
            <h2
              className="text-[15px] font-bold text-slate-900"
              style={{ fontFamily: 'Plus Jakarta Sans, sans-serif' }}
            >
              3. Professional Links
            </h2>
            <p
              className="text-[12px] text-slate-500 mt-0.5"
              style={{ fontFamily: 'sans-serif' }}
            >
              External links included in outreach communications and verification evidence.
            </p>
          </div>
          <div className="p-6">
            <div className="grid gap-5 sm:grid-cols-2">
              <div>
                <label
                  htmlFor="linkedinUrl"
                  className="block text-[12px] font-bold uppercase tracking-wide text-slate-700 mb-1"
                  style={{ fontFamily: 'Plus Jakarta Sans, sans-serif' }}
                >
                  LinkedIn URL
                </label>
                <input
                  id="linkedinUrl"
                  type="url"
                  value={linkedinUrl}
                  disabled={status === 'submitting'}
                  onChange={(e) => {
                    setLinkedinUrl(e.target.value);
                    markDirty();
                  }}
                  placeholder="https://linkedin.com/in/username"
                  className="block w-full px-3.5 py-2.5 text-[13.5px] rounded-none-none border border-slate-300 text-slate-900 -xs focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none disabled:opacity-50 disabled:bg-slate-50 "
                  style={{ fontFamily: 'sans-serif' }}
                />
              </div>
              <div>
                <label
                  htmlFor="githubUrl"
                  className="block text-[12px] font-bold uppercase tracking-wide text-slate-700 mb-1"
                  style={{ fontFamily: 'Plus Jakarta Sans, sans-serif' }}
                >
                  GitHub URL
                </label>
                <input
                  id="githubUrl"
                  type="url"
                  value={githubUrl}
                  disabled={status === 'submitting'}
                  onChange={(e) => {
                    setGithubUrl(e.target.value);
                    markDirty();
                  }}
                  placeholder="https://github.com/username"
                  className="block w-full px-3.5 py-2.5 text-[13.5px] rounded-none-none border border-slate-300 text-slate-900 -xs focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none disabled:opacity-50 disabled:bg-slate-50 "
                  style={{ fontFamily: 'sans-serif' }}
                />
              </div>
              <div>
                <label
                  htmlFor="portfolioUrl"
                  className="block text-[12px] font-bold uppercase tracking-wide text-slate-700 mb-1"
                  style={{ fontFamily: 'Plus Jakarta Sans, sans-serif' }}
                >
                  Portfolio URL
                </label>
                <input
                  id="portfolioUrl"
                  type="url"
                  value={portfolioUrl}
                  disabled={status === 'submitting'}
                  onChange={(e) => {
                    setPortfolioUrl(e.target.value);
                    markDirty();
                  }}
                  placeholder="https://portfolio.example.com"
                  className="block w-full px-3.5 py-2.5 text-[13.5px] rounded-none-none border border-slate-300 text-slate-900 -xs focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none disabled:opacity-50 disabled:bg-slate-50 "
                  style={{ fontFamily: 'sans-serif' }}
                />
              </div>
              <div>
                <label
                  htmlFor="websiteUrl"
                  className="block text-[12px] font-bold uppercase tracking-wide text-slate-700 mb-1"
                  style={{ fontFamily: 'Plus Jakarta Sans, sans-serif' }}
                >
                  Website URL
                </label>
                <input
                  id="websiteUrl"
                  type="url"
                  value={websiteUrl}
                  disabled={status === 'submitting'}
                  onChange={(e) => {
                    setWebsiteUrl(e.target.value);
                    markDirty();
                  }}
                  placeholder="https://website.example.com"
                  className="block w-full px-3.5 py-2.5 text-[13.5px] rounded-none-none border border-slate-300 text-slate-900 -xs focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none disabled:opacity-50 disabled:bg-slate-50 "
                  style={{ fontFamily: 'sans-serif' }}
                />
              </div>
            </div>
          </div>
        </section>

        <div className="flex justify-end pt-2">
          <button
            type="submit"
            disabled={status === 'submitting'}
            className="inline-flex items-center justify-center rounded-none-none px-5 py-2.5 text-[13px] font-semibold text-white -xs -opacity hover:opacity-90 disabled:opacity-50"
            style={{
              background: 'var(--color-primary)',
              fontFamily: 'Plus Jakarta Sans, sans-serif',
            }}
          >
            {status === 'submitting' ? 'Saving Profile...' : 'Save Profile'}
          </button>
        </div>
      </form>
    </div>
  );
}
