import {
  Injectable,
  Logger,
  OnApplicationBootstrap,
  OnApplicationShutdown,
} from '@nestjs/common';
import { ContactDiscoveryWorker } from './contact-discovery.worker';

@Injectable()
export class ContactDiscoveryWorkerRunner
  implements OnApplicationBootstrap, OnApplicationShutdown
{
  private readonly logger = new Logger(ContactDiscoveryWorkerRunner.name);
  private timer: NodeJS.Timeout | null = null;
  private isProcessing = false;

  constructor(private readonly worker: ContactDiscoveryWorker) {}

  onApplicationBootstrap() {
    this.logger.log('Starting ContactDiscoveryWorkerRunner background polling loop...');
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
      await this.worker.recoverStaleJobs();

      const claimed = await this.worker.claimNextJob();
      if (claimed) {
        this.logger.log(
          `Claimed contact discovery job ${claimed.job.id} (attempt ${claimed.claimedAttempt})`,
        );
        const success = await this.worker.processJob(claimed);
        this.logger.log(
          `Finished processing contact discovery job ${claimed.job.id}: ${
            success ? 'COMPLETED' : 'FAILED/RETRY'
          }`,
        );
        this.scheduleNextRun(100);
      } else {
        this.scheduleNextRun(2000);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.error(`Error in ContactDiscoveryWorkerRunner polling loop: ${msg}`);
      this.scheduleNextRun(5000);
    } finally {
      this.isProcessing = false;
    }
  }
}
