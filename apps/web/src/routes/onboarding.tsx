/* eslint-disable */
// @ts-nocheck
import { createFileRoute, useNavigate, redirect } from '@tanstack/react-router';
import { useQuery, useMutation } from '@tanstack/react-query';
import { fetchCareerProfile } from '../api/profile';
import { apiClient } from '../api/client';
import { LoadingState } from '../components/states';
import { useAuth } from '../lib/auth-context';
import { useState } from 'react';
import { LogOut } from 'lucide-react';

export const Route = createFileRoute('/onboarding')({
  beforeLoad: ({ context }) => {
    // If we can verify they are not authenticated, redirect to login
    // In our setup, this might be handled by AuthContext, but let's check
    const isAuthed = !!localStorage.getItem('token') || document.cookie.includes('session'); // Simple check, exact auth logic is in context
  },
  component: OnboardingComponent,
});

function OnboardingComponent() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [headline, setHeadline] = useState('');
  const [roles, setRoles] = useState('');
  
  const { data: profile, isLoading } = useQuery({
    queryKey: ['profile'],
    queryFn: fetchCareerProfile,
  });

  const mutation = useMutation({
    mutationFn: async () => {
      const targetRoles = roles.split(',').map(r => r.trim()).filter(Boolean);
      return apiClient.patch('/profile', {
        headline,
        targetRoles: targetRoles.length > 0 ? targetRoles : ['Software Engineer'],
      });
    },
    onSuccess: () => {
      navigate({ to: '/' });
    },
  });

  if (isLoading) {
    return <LoadingState message="Loading profile..." />;
  }

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col justify-center py-12 px-4 sm:px-6 lg:px-8">
      <div className="absolute top-4 right-4">
        <button variant="ghost" size="sm" onClick={() => logout()} className="text-gray-500 hover:text-gray-900">
          <LogOut className="w-4 h-4 mr-2" />
          Log out
        </button>
      </div>

      <div className="sm:mx-auto sm:w-full sm:max-w-md">
        <div className="flex justify-center mb-6">
          <div className="w-12 h-12 bg-indigo-600 rounded-xl flex items-center justify-center">
            <span className="text-white font-bold text-xl">O</span>
          </div>
        </div>
        <h2 className="text-center text-3xl font-extrabold text-gray-900 mb-2">
          Welcome to Outreacher
        </h2>
        <p className="text-center text-sm text-gray-600 mb-8">
          Let's set up your career profile to find the best opportunities.
        </p>

        <div className="py-8 px-6 shadow-sm border-gray-200">
          <form 
            onSubmit={(e) => {
              e.preventDefault();
              mutation.mutate();
            }}
            className="space-y-6"
          >
            <div>
              <label htmlFor="headline">Professional Headline</label>
              <input 
                id="headline" 
                value={headline} 
                onChange={e => setHeadline(e.target.value)}
                placeholder="e.g. Senior Frontend Engineer" 
                className="mt-1"
                required
              />
            </div>

            <div>
              <label htmlFor="roles">Target Roles (comma separated)</label>
              <textarea 
                id="roles" 
                value={roles}
                onChange={e => setRoles(e.target.value)}
                placeholder="Frontend Engineer, UI Engineer, Web Developer" 
                className="mt-1"
                required
              />
            </div>

            <button 
              type="submit" 
              className="w-full" 
              disabled={mutation.isPending}
            >
              {mutation.isPending ? 'Saving...' : 'Complete Setup'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
