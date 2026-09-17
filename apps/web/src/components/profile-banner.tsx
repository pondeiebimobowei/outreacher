import { useEffect, useState } from 'react';
import { Link } from '@tanstack/react-router';
import { apiClient } from '../api/client';

interface ProfileData {
  headline: string | null;
  summary: string | null;
  skills: string[];
}

export function ProfileBanner() {
  const [isUninitialized, setIsUninitialized] = useState<boolean>(false);

  useEffect(() => {
    let isMounted = true;
    apiClient
      .get<ProfileData>('/profile')
      .then((profile) => {
        if (!isMounted) return;
        const isEmpty =
          !profile.headline && !profile.summary && (!profile.skills || profile.skills.length === 0);
        setIsUninitialized(isEmpty);
      })
      .catch(() => {
        // Ignore profile fetch errors in banner
      });

    return () => {
      isMounted = false;
    };
  }, []);

  if (!isUninitialized) {
    return null;
  }

  return (
    <div className="mb-6 rounded-lg border border-amber-200 bg-amber-50 p-4 text-amber-900 flex flex-col md:flex-row items-start md:items-center justify-between gap-3">
      <div>
        <h4 className="text-sm font-semibold text-amber-900">Career Profile Setup Required</h4>
        <p className="text-xs text-amber-700 mt-0.5">
          Your profile is currently unpopulated. Complete your target roles and background to enable
          automated company research and personalized outreach generation.
        </p>
      </div>
      <Link
        to="/settings"
        className="shrink-0 rounded-md bg-amber-900 px-3 py-1.5 text-xs font-semibold text-white shadow-xs hover:bg-amber-800"
      >
        Complete Profile
      </Link>
    </div>
  );
}
