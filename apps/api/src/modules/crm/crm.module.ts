import { Module } from '@nestjs/common';
import { CqrsModule } from '@nestjs/cqrs';
import { SalesModule } from '../sales/sales.module';
import { LEAD_REPOSITORY } from './domain/lead.repository';
import { CALL_LOG_REPOSITORY } from './domain/call-log.repository';
import { CAMPAIGN_REPOSITORY } from './domain/campaign.repository';
import { SALES_VISIT_REPOSITORY } from './domain/sales-visit.repository';
import { PrismaLeadRepository } from './infrastructure/prisma-lead.repository';
import { PrismaCallLogRepository } from './infrastructure/prisma-call-log.repository';
import { PrismaCampaignRepository } from './infrastructure/prisma-campaign.repository';
import { PrismaSalesVisitRepository } from './infrastructure/prisma-sales-visit.repository';
import { LeadController } from './presentation/lead.controller';
import { CallLogController } from './presentation/call-log.controller';
import { CampaignController } from './presentation/campaign.controller';
import { SalesVisitController } from './presentation/sales-visit.controller';
import {
  ChangeLeadStageHandler,
  ConvertLeadHandler,
  CreateLeadHandler,
  DeleteLeadHandler,
  GetLeadHandler,
  LeadPipelineHandler,
  ListLeadsHandler,
  NextLeadCodeHandler,
  UpdateLeadHandler,
} from './application/lead.handlers';
import {
  CreateCallLogHandler,
  DeleteCallLogHandler,
  ListCallLogsHandler,
} from './application/call-log.handlers';
import {
  CampaignPerformanceHandler,
  CreateCampaignHandler,
  DeleteCampaignHandler,
  GetCampaignHandler,
  ListCampaignsHandler,
  NextCampaignCodeHandler,
  UpdateCampaignHandler,
} from './application/campaign.handlers';
import {
  CreateSalesVisitHandler,
  DeleteSalesVisitHandler,
  ListSalesVisitsHandler,
  UpdateSalesVisitHandler,
} from './application/sales-visit.handlers';

const handlers = [
  ListLeadsHandler,
  GetLeadHandler,
  LeadPipelineHandler,
  NextLeadCodeHandler,
  CreateLeadHandler,
  UpdateLeadHandler,
  ChangeLeadStageHandler,
  ConvertLeadHandler,
  DeleteLeadHandler,
  ListCallLogsHandler,
  CreateCallLogHandler,
  DeleteCallLogHandler,
  ListCampaignsHandler,
  GetCampaignHandler,
  NextCampaignCodeHandler,
  CampaignPerformanceHandler,
  CreateCampaignHandler,
  UpdateCampaignHandler,
  DeleteCampaignHandler,
  ListSalesVisitsHandler,
  CreateSalesVisitHandler,
  UpdateSalesVisitHandler,
  DeleteSalesVisitHandler,
];

/**
 * CRM: the leads a salesperson or telecaller works towards a quotation. Conversion is the
 * point of the module — a lead that never reaches a quotation is just a spreadsheet — and
 * it runs the lead's products through the existing quotation desk rather than pricing them
 * again here. SalesModule is imported so that CreateQuotationCommand is registered and its
 * repositories are available to the shared command bus.
 */
@Module({
  imports: [CqrsModule, SalesModule],
  controllers: [
    LeadController,
    CallLogController,
    CampaignController,
    SalesVisitController,
  ],
  providers: [
    { provide: LEAD_REPOSITORY, useClass: PrismaLeadRepository },
    { provide: CALL_LOG_REPOSITORY, useClass: PrismaCallLogRepository },
    { provide: CAMPAIGN_REPOSITORY, useClass: PrismaCampaignRepository },
    { provide: SALES_VISIT_REPOSITORY, useClass: PrismaSalesVisitRepository },
    ...handlers,
  ],
})
export class CrmModule {}
