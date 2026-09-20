import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../database/prisma.service';
import { InboundReply } from '@repo/db';

export type CorrelationResult = 
  | { status: 'CORRELATED'; campaignContactId: string }
  | { status: 'UNCORRELATED' }
  | { status: 'AMBIGUOUS' };

@Injectable()
export class ReplyCorrelationService {
  private readonly logger = new Logger(ReplyCorrelationService.name);

  constructor(private readonly prisma: PrismaService) {}

  private formatMessageId(id: string): string {
    const clean = id.trim().replace(/^<|>$/g, '');
    return `<${clean}>`;
  }

  async correlate(inboundReply: InboundReply, toEmail: string, inReplyTo: string | null, references: string[]): Promise<CorrelationResult> {
    const workspaceId = inboundReply.workspaceId;

    // RULE 1: Exact token match
    const tokenMatch = toEmail.match(/reply\+([a-zA-Z0-9_-]+)@/i);
    if (tokenMatch && tokenMatch[1]) {
      const token = tokenMatch[1];
      const send = await this.prisma.emailSend.findUnique({
        where: {
          replyToToken: token
        },
        select: {
          campaignContactId: true,
          workspaceId: true
        }
      });

      if (send && send.workspaceId === workspaceId) {
        return { status: 'CORRELATED', campaignContactId: send.campaignContactId };
      }
    }

    // RULE 2: In-Reply-To match
    if (inReplyTo) {
      const formattedInReplyTo = this.formatMessageId(inReplyTo);
      const sends = await this.prisma.emailSend.findMany({
        where: {
          workspaceId: workspaceId,
          messageId: formattedInReplyTo
        },
        select: { campaignContactId: true },
        distinct: ['campaignContactId']
      });

      if (sends.length === 1) {
        return { status: 'CORRELATED', campaignContactId: sends[0].campaignContactId };
      }
      
      if (sends.length > 1) {
        return { status: 'AMBIGUOUS' };
      }
    }

    // RULE 3: References match
    if (references && references.length > 0) {
      const formattedReferences = references.map(r => this.formatMessageId(r));
      const sends = await this.prisma.emailSend.findMany({
        where: {
          workspaceId: workspaceId,
          messageId: { in: formattedReferences }
        },
        select: { campaignContactId: true },
        distinct: ['campaignContactId']
      });

      if (sends.length === 1) {
        return { status: 'CORRELATED', campaignContactId: sends[0].campaignContactId };
      }
      
      if (sends.length > 1) {
        return { status: 'AMBIGUOUS' };
      }
    }

    return { status: 'UNCORRELATED' };
  }
}
