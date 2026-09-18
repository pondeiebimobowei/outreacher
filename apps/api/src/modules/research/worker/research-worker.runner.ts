import {
  Injectable,
  Logger,
  OnApplicationBootstrap,
  OnApplicationShutdown,
} from '@nestjs/common';
import { ResearchWorker } from './research.worker';

@Injectable()
export class ResearchWorkerRunner
  implements OnApplicationBootstrap, OnApplicationShutdown
{
  private readonly logger = new Logger(ResearchWorkerRunner.name);
  private timer: NodeJS.Timeout | null = null;
  private isProcessing = false;

  constructor(private readonly researchWorker: ResearchWorker) {}

  onApplicationBootstrap() {
    this.logger.log('Starting ResearchWorkerRunner background polling loop...');
    this.scheduleNextRun(1000);
  }

  onApplicationShutdown() {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }

  private scheduleNextRun(delayMs: number) {
    this.timer = setTimeout(() => {
      void this.poll();
    }, delayMs);
  }

  private async poll() {
    if (this.isProcessing) return;
    this.isProcessing = true;

    try {
      // 1. Recover any stale running jobs (>60s)
      await this.researchWorker.recoverStaleJobs();

      // 2. Claim and process next available pending job
      const claimed = await this.researchWorker.claimNextJob();
      if (claimed) {
        this.logger.log(
          `Claimed research job ${claimed.job.id} (attempt ${claimed.claimedAttempt}) for processing...`,
        );
        const success = await this.researchWorker.processJob(claimed);
        this.logger.log(
          `Finished processing research job ${claimed.job.id}: ${
            success ? 'COMPLETED' : 'FAILED/RETRY'
          }`,
        );
        // Process next available job immediately
        this.scheduleNextRun(100);
      } else {
        // No pending jobs, poll again in 2 seconds
        this.scheduleNextRun(2000);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.error(`Error in ResearchWorkerRunner polling loop: ${msg}`);
      this.scheduleNextRun(5000);
    } finally {
      this.isProcessing = false;
    }
  }
}
