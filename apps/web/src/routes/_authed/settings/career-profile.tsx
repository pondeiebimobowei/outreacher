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
        <div className="h-8 w-48 animate-pulse rounded bg-slate-200" />
        <div className="h-64 animate-pulse rounded-lg bg-slate-100" />
      </div>
    );
  }

  return (
    <div className="max-w-4xl space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 pb-4">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold tracking-tight text-slate-900">Career Profile</h1>
            {status === 'dirty' && (
              <span className="inline-flex items-center rounded-md bg-amber-50 px-2 py-1 text-xs font-medium text-amber-800 ring-1 ring-amber-600/20 ring-inset">
                Unsaved changes
              </span>
            )}
            {status === 'saved' && (
              <span className="inline-flex items-center rounded-md bg-emerald-50 px-2 py-1 text-xs font-medium text-emerald-800 ring-1 ring-emerald-600/20 ring-inset">
                Saved
              </span>
            )}
          </div>
          <p className="mt-1 text-xs text-slate-500">
            Define your targeting goals and background to enable automated company research and
            outreach.
          </p>
        </div>
        <button
          type="button"
          onClick={(e) => void handleSave(e)}
          disabled={status === 'submitting'}
          className="inline-flex items-center justify-center rounded-md bg-slate-900 px-4 py-2 text-xs font-semibold text-white shadow-xs hover:bg-slate-800 disabled:opacity-50"
        >
          {status === 'submitting' ? 'Saving Profile...' : 'Save Profile'}
        </button>
      </div>

      {errorMessage && (
        <div
          role="alert"
          className="rounded-md border border-red-200 bg-red-50 p-4 text-xs text-red-700"
        >
          <span className="font-semibold">Error:</span> {errorMessage}
        </div>
      )}

      {successMessage && (
        <div className="rounded-md border border-emerald-200 bg-emerald-50 p-4 text-xs text-emerald-700">
          {successMessage}
        </div>
      )}

      <form onSubmit={(e) => void handleSave(e)} className="space-y-8">
        {/* Section 1: Targeting Preferences */}
        <section className="space-y-4 rounded-lg border border-slate-200 bg-white p-5 shadow-xs">
          <h2 className="text-sm font-semibold text-slate-900">1. Targeting Preferences</h2>
          <p className="text-xs text-slate-500">
            Primary drivers used by research engines to score company and opening relevance.
          </p>
          <div className="grid gap-4 sm:grid-cols-2">
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
        </section>

        {/* Section 2: Background & Positioning */}
        <section className="space-y-4 rounded-lg border border-slate-200 bg-white p-5 shadow-xs">
          <h2 className="text-sm font-semibold text-slate-900">2. Background & Positioning</h2>
          <p className="text-xs text-slate-500">
            Feeds AI outreach generation and evidence matching context.
          </p>
          <div className="space-y-4">
            <div>
              <label htmlFor="headline" className="block text-xs font-medium text-slate-700">
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
                className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 text-xs text-slate-900 focus:border-slate-800 focus:outline-hidden disabled:opacity-50"
              />
            </div>
            <div>
              <label htmlFor="summary" className="block text-xs font-medium text-slate-700">
                Professional Summary
              </label>
              <textarea
                id="summary"
                rows={3}
                value={summary}
                disabled={status === 'submitting'}
                onChange={(e) => {
                  setSummary(e.target.value);
                  markDirty();
                }}
                placeholder="Overview of your career narrative and core strengths..."
                className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 text-xs text-slate-900 focus:border-slate-800 focus:outline-hidden disabled:opacity-50"
              />
            </div>
            <div>
              <label
                htmlFor="experienceSummary"
                className="block text-xs font-medium text-slate-700"
              >
                Experience Highlights
              </label>
              <textarea
                id="experienceSummary"
                rows={3}
                value={experienceSummary}
                disabled={status === 'submitting'}
                onChange={(e) => {
                  setExperienceSummary(e.target.value);
                  markDirty();
                }}
                placeholder="Key technical achievements, team leadership scale, or domain impacts..."
                className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 text-xs text-slate-900 focus:border-slate-800 focus:outline-hidden disabled:opacity-50"
              />
            </div>
          </div>
        </section>

        {/* Section 3: Professional Links */}
        <section className="space-y-4 rounded-lg border border-slate-200 bg-white p-5 shadow-xs">
          <h2 className="text-sm font-semibold text-slate-900">3. Professional Links</h2>
          <p className="text-xs text-slate-500">
            External links included in outreach communications and verification evidence.
          </p>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="linkedinUrl" className="block text-xs font-medium text-slate-700">
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
                className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 text-xs text-slate-900 focus:border-slate-800 focus:outline-hidden disabled:opacity-50"
              />
            </div>
            <div>
              <label htmlFor="githubUrl" className="block text-xs font-medium text-slate-700">
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
                className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 text-xs text-slate-900 focus:border-slate-800 focus:outline-hidden disabled:opacity-50"
              />
            </div>
            <div>
              <label htmlFor="portfolioUrl" className="block text-xs font-medium text-slate-700">
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
                className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 text-xs text-slate-900 focus:border-slate-800 focus:outline-hidden disabled:opacity-50"
              />
            </div>
            <div>
              <label htmlFor="websiteUrl" className="block text-xs font-medium text-slate-700">
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
                className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 text-xs text-slate-900 focus:border-slate-800 focus:outline-hidden disabled:opacity-50"
              />
            </div>
          </div>
        </section>

        <div className="flex justify-end pt-2">
          <button
            type="submit"
            disabled={status === 'submitting'}
            className="inline-flex items-center justify-center rounded-md bg-slate-900 px-5 py-2.5 text-xs font-semibold text-white shadow-xs hover:bg-slate-800 disabled:opacity-50"
          >
            {status === 'submitting' ? 'Saving Profile...' : 'Save Profile'}
          </button>
        </div>
      </form>
    </div>
  );
}
