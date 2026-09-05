import { Module } from '@nestjs/common';
import { CqrsModule } from '@nestjs/cqrs';
import { AUDIT_REPOSITORY } from './domain/audit.repository';
import { PrismaAuditRepository } from './infrastructure/prisma-audit.repository';
import { AuditController } from './presentation/audit.controller';
import { ListAuditEntitiesHandler, ListAuditLogsHandler } from './application/audit.handlers';

/** Read-only audit trail viewer. Events are captured by the global AuditInterceptor. */
@Module({
  imports: [CqrsModule],
  controllers: [AuditController],
  providers: [
    { provide: AUDIT_REPOSITORY, useClass: PrismaAuditRepository },
    ListAuditLogsHandler,
    ListAuditEntitiesHandler,
  ],
})
export class AuditModule {}
