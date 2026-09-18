export const SUPPRESSION_CHECKER_TOKEN = 'ISuppressionChecker';

export interface ISuppressionChecker {
  isSuppressed(workspaceId: string, email: string): Promise<boolean>;
}
