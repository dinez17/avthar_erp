import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import type { Job } from 'bullmq';
import type { Prisma } from '@prisma/client';
import { QUEUE_NAMES } from '@tiles-erp/config';
import type { AuditJobData } from '@tiles-erp/shared-types';
import { PrismaService } from '../prisma.service';

/** Consumes the `audit` queue and persists audit trail entries. */
@Processor(QUEUE_NAMES.AUDIT)
export class AuditProcessor extends WorkerHost {
  private readonly logger = new Logger(AuditProcessor.name);

  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async process(job: Job<AuditJobData>): Promise<void> {
    const { entity, entityId, action, userId, changes } = job.data;
    await this.prisma.auditLog.create({
      data: {
        entity,
        entityId,
        action,
        userId,
        changes: (changes ?? undefined) as Prisma.InputJsonValue | undefined,
      },
    });
    this.logger.log(`Audit: ${action} ${entity}#${entityId}`);
  }
}
