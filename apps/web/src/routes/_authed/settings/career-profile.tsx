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
  portfolioUrl: string | null;
  githubUrl: string | null;
  linkedinUrl: string | null;
  websiteUrl: string | null;
  currentRole: string | null;
  yearsExperience: string | null;
  careerGoals: string | null;
  backgroundAndPositioning: string | null;
  skills: string[];
}

export type FormStatus = 'idle' | 'submitting' | 'saved' | 'error';

// Helper for rendering empty state text
function DisplayValue({ value }: { value: string | null | undefined }) {
  if (!value || value.trim() === '') {
    return <span className="text-slate-400 italic">Not set</span>;
  }
  return <span className="text-slate-900">{value}</span>;
}

function DisplayTags({ tags }: { tags: string[] | undefined }) {
  if (!tags || tags.length === 0) {
    return <span className="text-slate-400 italic">Not set</span>;
  }
  return (
    <div className="flex flex-wrap gap-1.5 mt-1">
      {tags.map((t, idx) => (
        <span key={idx} className="px-2 py-1 bg-slate-100 text-slate-700 text-xs font-medium rounded-md">
          {t}
        </span>
      ))}
    </div>
  );
}

export function SettingsComponent() {
  const [initialLoading, setInitialLoading] = useState(true);
  const [globalError, setGlobalError] = useState<string | null>(null);

  // Baseline data from server
  const [baseline, setBaseline] = useState<CareerProfileData | null>(null);

  // Edit Mode state
  const [editModes, setEditModes] = useState<Record<string, boolean>>({
    targeting: false,
    background: false,
    links: false,
  });

  // Section status tracking
  const [statuses, setStatuses] = useState<Record<string, FormStatus>>({
    targeting: 'idle',
    background: 'idle',
    links: 'idle',
  });
  const [messages, setMessages] = useState<Record<string, string | null>>({});

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
  const [currentRole, setCurrentRole] = useState('');
  const [yearsExperience, setYearsExperience] = useState('');
  const [careerGoals, setCareerGoals] = useState('');
  const [backgroundAndPositioning, setBackgroundAndPositioning] = useState('');

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
    setCurrentRole(data.currentRole ?? '');
    setYearsExperience(data.yearsExperience ?? '');
    setCareerGoals(data.careerGoals ?? '');
    setBackgroundAndPositioning(data.backgroundAndPositioning ?? '');
  }, []);

  const fetchProfile = useCallback(async () => {
    setInitialLoading(true);
    setGlobalError(null);
    try {
      const profile = await apiClient.get<CareerProfileData>('/profile');
      setBaseline(profile);
      populateForm(profile);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to load profile';
      setGlobalError(msg);
    } finally {
      setInitialLoading(false);
    }
  }, [populateForm]);

  useEffect(() => {
    void fetchProfile();
  }, [fetchProfile]);

  const formatNull = (val: string): string | null => {
    const trimmed = val.trim();
    return trimmed === '' ? null : trimmed;
  };

  const handleSaveSection = async (section: string, payload: Partial<CareerProfileData>) => {
    if (statuses[section] === 'submitting') return;

    setStatuses(prev => ({ ...prev, [section]: 'submitting' }));
    setMessages(prev => ({ ...prev, [section]: null }));

    try {
      const updated = await apiClient.patch<CareerProfileData>('/profile', payload);
      setBaseline(updated);
      populateForm(updated);
      setStatuses(prev => ({ ...prev, [section]: 'idle' }));
      setEditModes(prev => ({ ...prev, [section]: false }));
    } catch (err: unknown) {
      const msg = err instanceof ApiError ? err.message : err instanceof Error ? err.message : 'Failed to save';
      setStatuses(prev => ({ ...prev, [section]: 'error' }));
      setMessages(prev => ({ ...prev, [section]: msg }));
    }
  };

  const cancelEdit = (section: string) => {
    if (baseline) populateForm(baseline);
    setEditModes(prev => ({ ...prev, [section]: false }));
    setStatuses(prev => ({ ...prev, [section]: 'idle' }));
    setMessages(prev => ({ ...prev, [section]: null }));
  };

  const saveTargeting = (e: FormEvent) => {
    e.preventDefault();
    handleSaveSection('targeting', {
      targetRoles,
      targetIndustries,
      targetLocations,
      skills,
    });
  };

  const saveBackground = (e: FormEvent) => {
    e.preventDefault();
    handleSaveSection('background', {
      headline: formatNull(headline),
      summary: formatNull(summary),
      experienceSummary: formatNull(experienceSummary),
      currentRole: formatNull(currentRole),
      yearsExperience: formatNull(yearsExperience),
      careerGoals: formatNull(careerGoals),
      backgroundAndPositioning: formatNull(backgroundAndPositioning),
    });
  };

  const saveLinks = (e: FormEvent) => {
    e.preventDefault();
    handleSaveSection('links', {
      portfolioUrl: formatNull(portfolioUrl),
      githubUrl: formatNull(githubUrl),
      linkedinUrl: formatNull(linkedinUrl),
      websiteUrl: formatNull(websiteUrl),
    });
  };

  // Completion Tracking Logic
  const checklist = [
    { id: 'targetRoles', title: 'Target role', isComplete: targetRoles.length > 0, helpText: 'Drives company research targeting' },
    { id: 'skills', title: 'Core skills', isComplete: skills.length > 0, helpText: 'Used for matching opportunities' },
    { id: 'targetIndustries', title: 'Target industries', isComplete: targetIndustries.length > 0, helpText: 'Focuses your outreach' },
    { id: 'currentRole', title: 'Current role', isComplete: !!currentRole.trim(), helpText: 'Provides context for outreach' },
    { id: 'yearsExperience', title: 'Years of experience', isComplete: !!yearsExperience.trim(), helpText: 'Establishes seniority level' },
    { id: 'headline', title: 'Professional headline', isComplete: !!headline.trim(), helpText: 'Your one-line elevator pitch' },
    { id: 'summary', title: 'Professional summary', isComplete: !!summary.trim(), helpText: 'Feeds AI generation context' },
    { id: 'careerGoals', title: 'Career goals', isComplete: !!careerGoals.trim(), helpText: 'Helps find the right fit' },
    { id: 'links', title: 'A professional link', isComplete: !!(linkedinUrl.trim() || githubUrl.trim() || portfolioUrl.trim() || websiteUrl.trim()), helpText: 'Provides research context' },
  ];

  const completedItems = checklist.filter(item => item.isComplete);
  const missingItems = checklist.filter(item => !item.isComplete);

  const progressPercent = Math.round((completedItems.length / checklist.length) * 100);

  if (initialLoading) {
    return (
      <div className="max-w-6xl space-y-4">
        <div className="h-8 w-48 animate-pulse rounded bg-slate-200" />
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 h-64 animate-pulse rounded bg-slate-100 border border-slate-200" />
          <div className="h-64 animate-pulse rounded bg-slate-100 border border-slate-200" />
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-6xl space-y-5 pb-6">
      <div className="pb-2">
        <h1 className="text-[24px] font-bold tracking-tight text-slate-900" style={{ fontFamily: 'Plus Jakarta Sans, sans-serif' }}>
          Settings
        </h1>
      </div>

      {globalError && (
        <div role="alert" className="border border-red-200 bg-red-50 p-3 text-xs text-red-700 flex items-start gap-2 rounded">
          <span className="font-bold shrink-0">Error:</span>
          <span>{globalError}</span>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_340px] gap-6 items-start">
        {/* Left Side: Forms / Cards */}
        <div className="space-y-6">

          {/* Section 1: Targeting Preferences */}
          <div className="rounded-xl border border-slate-200 bg-white overflow-hidden shadow-sm">
            <div className="px-6 py-4 flex justify-between items-start">
              <div>
                <h2 className="text-[17px] font-bold text-slate-900" style={{ fontFamily: 'Plus Jakarta Sans, sans-serif' }}>
                  Targeting Preferences
                </h2>
                <p className="text-[13px] text-slate-500 mt-0.5">
                  Primary drivers used by research engines to score company relevance.
                </p>
              </div>
              {!editModes.targeting && (
                <button
                  type="button"
                  onClick={() => setEditModes(prev => ({ ...prev, targeting: true }))}
                  className="flex items-center gap-1.5 text-sm font-medium text-slate-500 hover:text-slate-900 transition-colors"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                  </svg>
                  Edit
                </button>
              )}
            </div>

            {/* Read Only View */}
            {!editModes.targeting && (
              <div className="px-6 pb-6 pt-2">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-y-6 gap-x-8">
                  <div>
                    <h4 className="text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-0.5">Target Role</h4>
                    <div className="text-[14px]"><DisplayTags tags={targetRoles} /></div>
                  </div>
                  <div>
                    <h4 className="text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-0.5">Skills</h4>
                    <div className="text-[14px]"><DisplayTags tags={skills} /></div>
                  </div>
                  <div>
                    <h4 className="text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-0.5">Target Industries</h4>
                    <div className="text-[14px]"><DisplayTags tags={targetIndustries} /></div>
                  </div>
                  <div>
                    <h4 className="text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-0.5">Target Locations</h4>
                    <div className="text-[14px]"><DisplayTags tags={targetLocations} /></div>
                  </div>
                </div>
              </div>
            )}

            {/* Edit View */}
            {editModes.targeting && (
              <form onSubmit={saveTargeting} className="border-t border-slate-100 bg-slate-50/50 p-6">
                <div className="grid gap-5 sm:grid-cols-2 mb-6">
                  <TagInput id="targetRoles" label="Target Roles" tags={targetRoles} disabled={statuses['targeting'] === 'submitting'} onChange={setTargetRoles} placeholder="e.g. Staff Backend Engineer" />
                  <TagInput id="skills" label="Core Skills" tags={skills} disabled={statuses['targeting'] === 'submitting'} onChange={setSkills} placeholder="e.g. TypeScript, PostgreSQL" />
                  <TagInput id="targetIndustries" label="Target Industries" tags={targetIndustries} disabled={statuses['targeting'] === 'submitting'} onChange={setTargetIndustries} placeholder="e.g. Fintech, DevTools" />
                  <TagInput id="targetLocations" label="Target Locations" tags={targetLocations} disabled={statuses['targeting'] === 'submitting'} onChange={setTargetLocations} placeholder="e.g. Remote, New York, NY" />
                </div>
                <div className="flex justify-end gap-3 items-center">
                  {statuses.targeting === 'error' && <span className="text-red-500 text-sm mr-auto">{messages.targeting}</span>}
                  <button type="button" onClick={() => cancelEdit('targeting')} disabled={statuses['targeting'] === 'submitting'} className="px-4 py-2 text-sm font-medium text-slate-600 hover:text-slate-900 bg-white border border-slate-300 rounded-lg">Cancel</button>
                  <button type="submit" disabled={statuses['targeting'] === 'submitting'} className="px-4 py-2 text-sm font-medium text-white rounded-lg hover:opacity-90 disabled:opacity-50" style={{ background: 'var(--color-primary)' }}>{statuses['targeting'] === 'submitting' ? 'Saving...' : 'Save Changes'}</button>
                </div>
              </form>
            )}
          </div>

          {/* Section 2: Background & Positioning */}
          <div className="rounded-xl border border-slate-200 bg-white overflow-hidden shadow-sm">
            <div className="px-6 py-4 flex justify-between items-start">
              <div>
                <h2 className="text-[17px] font-bold text-slate-900" style={{ fontFamily: 'Plus Jakarta Sans, sans-serif' }}>
                  Professional Identity
                </h2>
                <p className="text-[13px] text-slate-500 mt-0.5">
                  Drives company research targeting, opportunity scoring, and contact relevance.
                </p>
              </div>
              {!editModes.background && (
                <button
                  type="button"
                  onClick={() => setEditModes(prev => ({ ...prev, background: true }))}
                  className="flex items-center gap-1.5 text-sm font-medium text-slate-500 hover:text-slate-900 transition-colors"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                  </svg>
                  Edit
                </button>
              )}
            </div>

            {/* Read Only View */}
            {!editModes.background && (
              <div className="px-6 pb-6 pt-2">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-y-6 gap-x-8">
                  <div>
                    <h4 className="text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-0.5">Current Role</h4>
                    <div className="text-[14px] mt-1"><DisplayValue value={currentRole} /></div>
                  </div>
                  <div>
                    <h4 className="text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-0.5">Experience</h4>
                    <div className="text-[14px] mt-1"><DisplayValue value={yearsExperience} /></div>
                  </div>
                  <div className="sm:col-span-2">
                    <h4 className="text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-0.5">Professional Headline</h4>
                    <div className="text-[14px] mt-1"><DisplayValue value={headline} /></div>
                  </div>
                  <div className="sm:col-span-2">
                    <h4 className="text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-0.5">Professional Summary</h4>
                    <div className="text-[14px] whitespace-pre-wrap mt-1"><DisplayValue value={summary} /></div>
                  </div>
                  <div className="sm:col-span-2">
                    <h4 className="text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-0.5">Experience Highlights</h4>
                    <div className="text-[14px] whitespace-pre-wrap mt-1"><DisplayValue value={experienceSummary} /></div>
                  </div>
                  <div className="sm:col-span-2">
                    <h4 className="text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-0.5">Career Goals</h4>
                    <div className="text-[14px] whitespace-pre-wrap mt-1"><DisplayValue value={careerGoals} /></div>
                  </div>
                  <div className="sm:col-span-2">
                    <h4 className="text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-0.5">Background & Positioning</h4>
                    <div className="text-[14px] whitespace-pre-wrap mt-1"><DisplayValue value={backgroundAndPositioning} /></div>
                  </div>
                </div>
              </div>
            )}

            {/* Edit View */}
            {editModes.background && (
              <form onSubmit={saveBackground} className="border-t border-slate-100 bg-slate-50/50 p-6 space-y-5">
                <div className="grid gap-5 sm:grid-cols-2">
                  <div>
                    <label htmlFor="currentRole" className="block text-xs font-bold uppercase tracking-wide text-slate-700 mb-1.5">Current Role</label>
                    <input id="currentRole" type="text" value={currentRole} disabled={statuses['background'] === 'submitting'} onChange={(e) => setCurrentRole(e.target.value)} className="block w-full px-3 py-2.5 text-sm rounded-lg border border-slate-300 text-slate-900 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none" />
                  </div>
                  <div>
                    <label htmlFor="yearsExperience" className="block text-xs font-bold uppercase tracking-wide text-slate-700 mb-1.5">Years of Experience</label>
                    <input id="yearsExperience" type="text" value={yearsExperience} disabled={statuses['background'] === 'submitting'} onChange={(e) => setYearsExperience(e.target.value)} className="block w-full px-3 py-2.5 text-sm rounded-lg border border-slate-300 text-slate-900 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none" />
                  </div>
                </div>
                <div>
                  <label htmlFor="headline" className="block text-xs font-bold uppercase tracking-wide text-slate-700 mb-1.5">Professional Headline</label>
                  <input id="headline" type="text" value={headline} disabled={statuses['background'] === 'submitting'} onChange={(e) => setHeadline(e.target.value)} className="block w-full px-3 py-2.5 text-sm rounded-lg border border-slate-300 text-slate-900 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none" />
                </div>
                <div>
                  <label htmlFor="summary" className="block text-xs font-bold uppercase tracking-wide text-slate-700 mb-1.5">Professional Summary</label>
                  <textarea id="summary" rows={3} value={summary} disabled={statuses['background'] === 'submitting'} onChange={(e) => setSummary(e.target.value)} className="block w-full px-3 py-2.5 text-sm rounded-lg border border-slate-300 text-slate-900 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none resize-none" />
                </div>
                <div>
                  <label htmlFor="experienceSummary" className="block text-xs font-bold uppercase tracking-wide text-slate-700 mb-1.5">Experience Highlights</label>
                  <textarea id="experienceSummary" rows={3} value={experienceSummary} disabled={statuses['background'] === 'submitting'} onChange={(e) => setExperienceSummary(e.target.value)} className="block w-full px-3 py-2.5 text-sm rounded-lg border border-slate-300 text-slate-900 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none resize-none" />
                </div>
                <div>
                  <label htmlFor="careerGoals" className="block text-xs font-bold uppercase tracking-wide text-slate-700 mb-1.5">Career Goals</label>
                  <textarea id="careerGoals" rows={2} value={careerGoals} disabled={statuses['background'] === 'submitting'} onChange={(e) => setCareerGoals(e.target.value)} className="block w-full px-3 py-2.5 text-sm rounded-lg border border-slate-300 text-slate-900 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none resize-none" />
                </div>
                <div>
                  <label htmlFor="backgroundAndPositioning" className="block text-xs font-bold uppercase tracking-wide text-slate-700 mb-1.5">Background and Positioning</label>
                  <textarea id="backgroundAndPositioning" rows={2} value={backgroundAndPositioning} disabled={statuses['background'] === 'submitting'} onChange={(e) => setBackgroundAndPositioning(e.target.value)} className="block w-full px-3 py-2.5 text-sm rounded-lg border border-slate-300 text-slate-900 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none resize-none" />
                </div>
                <div className="flex justify-end gap-3 items-center pt-2">
                  {statuses.background === 'error' && <span className="text-red-500 text-sm mr-auto">{messages.background}</span>}
                  <button type="button" onClick={() => cancelEdit('background')} disabled={statuses['background'] === 'submitting'} className="px-4 py-2 text-sm font-medium text-slate-600 hover:text-slate-900 bg-white border border-slate-300 rounded-lg">Cancel</button>
                  <button type="submit" disabled={statuses['background'] === 'submitting'} className="px-4 py-2 text-sm font-medium text-white rounded-lg hover:opacity-90 disabled:opacity-50" style={{ background: 'var(--color-primary)' }}>{statuses['background'] === 'submitting' ? 'Saving...' : 'Save Changes'}</button>
                </div>
              </form>
            )}
          </div>

          {/* Section 3: Professional Links */}
          <div className="rounded-xl border border-slate-200 bg-white overflow-hidden shadow-sm">
            <div className="px-6 py-4 flex justify-between items-start">
              <div>
                <h2 className="text-[17px] font-bold text-slate-900" style={{ fontFamily: 'Plus Jakarta Sans, sans-serif' }}>
                  Professional Links
                </h2>
                <p className="text-[13px] text-slate-500 mt-0.5">
                  External links included in outreach communications.
                </p>
              </div>
              {!editModes.links && (
                <button
                  type="button"
                  onClick={() => setEditModes(prev => ({ ...prev, links: true }))}
                  className="flex items-center gap-1.5 text-sm font-medium text-slate-500 hover:text-slate-900 transition-colors"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                  </svg>
                  Edit
                </button>
              )}
            </div>

            {/* Read Only View */}
            {!editModes.links && (
              <div className="px-6 pb-6 pt-2">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-y-6 gap-x-8">
                  <div>
                    <h4 className="text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-0.5">LinkedIn</h4>
                    <div className="text-[14px] mt-1">
                      {linkedinUrl ? <a href={linkedinUrl} target="_blank" rel="noreferrer" className="text-indigo-600 hover:underline">{linkedinUrl}</a> : <DisplayValue value={linkedinUrl} />}
                    </div>
                  </div>
                  <div>
                    <h4 className="text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-0.5">GitHub</h4>
                    <div className="text-[14px] mt-1">
                      {githubUrl ? <a href={githubUrl} target="_blank" rel="noreferrer" className="text-indigo-600 hover:underline">{githubUrl}</a> : <DisplayValue value={githubUrl} />}
                    </div>
                  </div>
                  <div>
                    <h4 className="text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-0.5">Portfolio</h4>
                    <div className="text-[14px] mt-1">
                      {portfolioUrl ? <a href={portfolioUrl} target="_blank" rel="noreferrer" className="text-indigo-600 hover:underline">{portfolioUrl}</a> : <DisplayValue value={portfolioUrl} />}
                    </div>
                  </div>
                  <div>
                    <h4 className="text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-0.5">Website</h4>
                    <div className="text-[14px] mt-1">
                      {websiteUrl ? <a href={websiteUrl} target="_blank" rel="noreferrer" className="text-indigo-600 hover:underline">{websiteUrl}</a> : <DisplayValue value={websiteUrl} />}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Edit View */}
            {editModes.links && (
              <form onSubmit={saveLinks} className="border-t border-slate-100 bg-slate-50/50 p-6 space-y-5">
                <div className="grid gap-5 sm:grid-cols-2">
                  <div>
                    <label htmlFor="linkedinUrl" className="block text-xs font-bold uppercase tracking-wide text-slate-700 mb-1.5">LinkedIn URL</label>
                    <input id="linkedinUrl" type="url" value={linkedinUrl} disabled={statuses['links'] === 'submitting'} onChange={(e) => setLinkedinUrl(e.target.value)} placeholder="https://linkedin.com/in/username" className="block w-full px-3 py-2.5 text-sm rounded-lg border border-slate-300 text-slate-900 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none" />
                  </div>
                  <div>
                    <label htmlFor="githubUrl" className="block text-xs font-bold uppercase tracking-wide text-slate-700 mb-1.5">GitHub URL</label>
                    <input id="githubUrl" type="url" value={githubUrl} disabled={statuses['links'] === 'submitting'} onChange={(e) => setGithubUrl(e.target.value)} placeholder="https://github.com/username" className="block w-full px-3 py-2.5 text-sm rounded-lg border border-slate-300 text-slate-900 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none" />
                  </div>
                  <div>
                    <label htmlFor="portfolioUrl" className="block text-xs font-bold uppercase tracking-wide text-slate-700 mb-1.5">Portfolio URL</label>
                    <input id="portfolioUrl" type="url" value={portfolioUrl} disabled={statuses['links'] === 'submitting'} onChange={(e) => setPortfolioUrl(e.target.value)} placeholder="https://portfolio.example.com" className="block w-full px-3 py-2.5 text-sm rounded-lg border border-slate-300 text-slate-900 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none" />
                  </div>
                  <div>
                    <label htmlFor="websiteUrl" className="block text-xs font-bold uppercase tracking-wide text-slate-700 mb-1.5">Website URL</label>
                    <input id="websiteUrl" type="url" value={websiteUrl} disabled={statuses['links'] === 'submitting'} onChange={(e) => setWebsiteUrl(e.target.value)} placeholder="https://website.example.com" className="block w-full px-3 py-2.5 text-sm rounded-lg border border-slate-300 text-slate-900 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none" />
                  </div>
                </div>
                <div className="flex justify-end gap-3 items-center pt-2">
                  {statuses.links === 'error' && <span className="text-red-500 text-sm mr-auto">{messages.links}</span>}
                  <button type="button" onClick={() => cancelEdit('links')} disabled={statuses['links'] === 'submitting'} className="px-4 py-2 text-sm font-medium text-slate-600 hover:text-slate-900 bg-white border border-slate-300 rounded-lg">Cancel</button>
                  <button type="submit" disabled={statuses['links'] === 'submitting'} className="px-4 py-2 text-sm font-medium text-white rounded-lg hover:opacity-90 disabled:opacity-50" style={{ background: 'var(--color-primary)' }}>{statuses['links'] === 'submitting' ? 'Saving...' : 'Save Changes'}</button>
                </div>
              </form>
            )}
          </div>
        </div>

        {/* Right Side: Profile Completeness Sidebar */}
        <div>
          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm sticky top-6">
            <div className="p-6 pb-5 border-b border-slate-100">
              <h3 className="text-[16px] font-bold text-slate-900 mb-1.5" style={{ fontFamily: 'Plus Jakarta Sans, sans-serif' }}>
                Profile completeness
              </h3>
              <p className="text-[13px] text-slate-500 leading-snug">
                A complete profile produces better results.
              </p>
            </div>

            <div className="px-6 py-5">
              <div className="flex items-baseline gap-2 mb-3">
                <span className="text-[40px] font-semibold tracking-tight text-slate-900 leading-none">
                  {progressPercent}%
                </span>
                <span className="text-[14px] text-slate-500 font-medium">complete</span>
              </div>

              <div className="h-2 w-full bg-slate-100 rounded-full overflow-hidden mb-8">
                <div
                  className="h-full bg-emerald-500 transition-all duration-1000 ease-out"
                  style={{ width: `${progressPercent}%` }}
                />
              </div>

              {missingItems.length > 0 && (
                <div className="mb-6">
                  <h4 className="text-[11px] font-bold tracking-wider text-slate-500 uppercase mb-3">
                    Would Help
                  </h4>
                  <ul className="space-y-4">
                    {missingItems.map(item => (
                      <li key={item.id} className="flex items-start">
                        <span className="flex items-center justify-center w-[18px] h-[18px] rounded-full border border-slate-300 mr-3 shrink-0 mt-0.5">
                          <span className="w-2 h-2 rounded-full bg-slate-300"></span>
                        </span>
                        <div>
                          <div className="text-[14px] font-semibold text-slate-800 leading-tight mb-0.5">{item.title}</div>
                          <div className="text-[13px] text-slate-500 leading-tight">{item.helpText}</div>
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {completedItems.length > 0 && (
                <div>
                  <h4 className="text-[11px] font-bold tracking-wider text-slate-500 uppercase mb-3">
                    Complete
                  </h4>
                  <ul className="space-y-3.5">
                    {completedItems.map(item => (
                      <li key={item.id} className="flex items-center text-slate-500">
                        <svg className="w-[18px] h-[18px] text-emerald-400 mr-3 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                        </svg>
                        <span className="text-[14px]">{item.title}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
