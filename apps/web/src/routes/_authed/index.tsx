import { createFileRoute } from '@tanstack/react-router';
import { ErrorState } from '../../components/states';
import { AttentionSection } from '../../features/home/components/AttentionSection';
import { ContinueWorkingSection } from '../../features/home/components/ContinueWorkingSection';
import { HomeEmptyWorkspace } from '../../features/home/components/HomeEmptyWorkspace';
import { HomeLoadingState } from '../../features/home/components/HomeLoadingState';
import { HomePrimaryAction } from '../../features/home/components/HomePrimaryAction';
import { RecentActivityFeed } from '../../features/home/components/RecentActivityFeed';
import { WorkspaceHeader } from '../../features/home/components/WorkspaceHeader';
import { useWorkspaceSummary } from '../../features/home/hooks/use-workspace-summary';

export const Route = createFileRoute('/_authed/')({
  component: HomeComponent,
});

function HomeComponent() {
  const { data, isLoading, isError, error, refetch } = useWorkspaceSummary();

  return (
    <div className="max-w-6xl mx-auto space-y-6 sm:space-y-8 pb-12">
      {/* 1. Workspace Identity */}
      <WorkspaceHeader />

      {/* 2. Loading State */}
      {isLoading && <HomeLoadingState />}

      {/* 3. Complete Endpoint Failure State */}
      {!isLoading && isError && (
        <div className="py-4">
          <ErrorState
            title="Unable to load workspace"
            message={
              error instanceof Error
                ? error.message
                : 'We could not retrieve your workspace summary. Your existing work has not been modified.'
            }
            retryLabel="Try again"
            onRetry={() => void refetch()}
          />
        </div>
      )}

      {/* 4. Populated or Empty State */}
      {!isLoading && !isError && data && (
        <>
          {data.isEmptyWorkspace ? (
            <HomeEmptyWorkspace />
          ) : (
            <div className="space-y-8">
              {/* Needs Attention */}
              <AttentionSection
                items={data.attentionItems}
                isDegraded={data.workDegraded}
              />

              {/* Primary Next Action / Start Workflow */}
              <HomePrimaryAction />

              {/* Continue Working */}
              <ContinueWorkingSection
                items={data.continueItems}
                isDegraded={data.workDegraded}
              />

              {/* Recent Activity (Orientation Layer) */}
              <RecentActivityFeed
                items={data.recentActivity}
                isDegraded={data.activityDegraded}
              />
            </div>
          )}
        </>
      )}
    </div>
  );
}
