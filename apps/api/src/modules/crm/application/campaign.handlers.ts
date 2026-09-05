import { Inject } from '@nestjs/common';
import {
  CommandHandler,
  QueryHandler,
  type ICommandHandler,
  type IQueryHandler,
} from '@nestjs/cqrs';
import { NotFoundError, ValidationError } from '@tiles-erp/shared';
import type {
  CampaignItem,
  CampaignPerformanceRow,
  CreateCampaignInput,
  Paginated,
  PaginationQuery,
  UpdateCampaignInput,
  UUID,
} from '@tiles-erp/shared-types';
import {
  CAMPAIGN_REPOSITORY,
  type CampaignListFilter,
  type CampaignPerformanceAggregate,
  type CampaignRepository,
} from '../domain/campaign.repository';

const round2 = (value: number): number => Math.round(value * 100) / 100;

export class ListCampaignsQuery {
  constructor(
    public readonly pagination: PaginationQuery,
    public readonly filter: CampaignListFilter,
  ) {}
}

export class GetCampaignQuery {
  constructor(public readonly id: UUID) {}
}

export class NextCampaignCodeQuery {}

export class CampaignPerformanceQuery {}

export class CreateCampaignCommand {
  constructor(
    public readonly data: CreateCampaignInput,
    public readonly actorId: UUID,
  ) {}
}

export class UpdateCampaignCommand {
  constructor(
    public readonly id: UUID,
    public readonly data: UpdateCampaignInput,
    public readonly actorId: UUID,
  ) {}
}

export class DeleteCampaignCommand {
  constructor(
    public readonly id: UUID,
    public readonly actorId: UUID,
  ) {}
}

/**
 * Turns raw attribution counts into the report's ratios. Kept pure and exported so the
 * cost-per and ROI arithmetic — and its divide-by-zero guards — can be tested directly.
 */
export function toPerformanceRow(agg: CampaignPerformanceAggregate): CampaignPerformanceRow {
  const { budget, leadsCount, convertedCount, convertedValue } = agg;
  return {
    campaignId: agg.campaignId,
    code: agg.code,
    name: agg.name,
    channel: agg.channel,
    status: agg.status,
    budget,
    leadsCount,
    convertedCount,
    notInterestedCount: agg.notInterestedCount,
    openCount: agg.openCount,
    pipelineValue: round2(agg.pipelineValue),
    convertedValue: round2(convertedValue),
    costPerLead: leadsCount > 0 ? round2(budget / leadsCount) : null,
    costPerConversion: convertedCount > 0 ? round2(budget / convertedCount) : null,
    conversionRate: leadsCount > 0 ? round2(convertedCount / leadsCount) : 0,
    roiPct: budget > 0 ? round2(((convertedValue - budget) / budget) * 100) : null,
  };
}

function normalise<T extends CreateCampaignInput | UpdateCampaignInput>(data: T): T {
  if (data.budget !== undefined && data.budget !== null && data.budget < 0) {
    throw new ValidationError('Budget cannot be negative');
  }
  if (data.startDate && data.endDate && new Date(data.endDate) < new Date(data.startDate)) {
    throw new ValidationError('End date cannot be before the start date');
  }
  return {
    ...data,
    name: data.name?.trim(),
    code: data.code?.trim().toUpperCase(),
    objective: data.objective?.trim() || undefined,
    notes: data.notes?.trim() || undefined,
  } as T;
}

@QueryHandler(ListCampaignsQuery)
export class ListCampaignsHandler
  implements IQueryHandler<ListCampaignsQuery, Paginated<CampaignItem>>
{
  constructor(@Inject(CAMPAIGN_REPOSITORY) private readonly campaigns: CampaignRepository) {}

  execute(query: ListCampaignsQuery): Promise<Paginated<CampaignItem>> {
    return this.campaigns.list(query.pagination, query.filter);
  }
}

@QueryHandler(GetCampaignQuery)
export class GetCampaignHandler implements IQueryHandler<GetCampaignQuery, CampaignItem> {
  constructor(@Inject(CAMPAIGN_REPOSITORY) private readonly campaigns: CampaignRepository) {}

  async execute(query: GetCampaignQuery): Promise<CampaignItem> {
    const campaign = await this.campaigns.findById(query.id);
    if (!campaign) throw new NotFoundError('Campaign not found');
    return campaign;
  }
}

@QueryHandler(NextCampaignCodeQuery)
export class NextCampaignCodeHandler implements IQueryHandler<NextCampaignCodeQuery, string> {
  constructor(@Inject(CAMPAIGN_REPOSITORY) private readonly campaigns: CampaignRepository) {}

  execute(): Promise<string> {
    return this.campaigns.nextCode();
  }
}

@QueryHandler(CampaignPerformanceQuery)
export class CampaignPerformanceHandler
  implements IQueryHandler<CampaignPerformanceQuery, CampaignPerformanceRow[]>
{
  constructor(@Inject(CAMPAIGN_REPOSITORY) private readonly campaigns: CampaignRepository) {}

  async execute(): Promise<CampaignPerformanceRow[]> {
    const aggregates = await this.campaigns.performanceAggregates();
    return aggregates.map(toPerformanceRow);
  }
}

@CommandHandler(CreateCampaignCommand)
export class CreateCampaignHandler implements ICommandHandler<CreateCampaignCommand, CampaignItem> {
  constructor(@Inject(CAMPAIGN_REPOSITORY) private readonly campaigns: CampaignRepository) {}

  async execute(command: CreateCampaignCommand): Promise<CampaignItem> {
    const data = normalise(command.data);
    if (!data.name) throw new ValidationError('A campaign name is required');

    const code = data.code || (await this.campaigns.nextCode());
    if (await this.campaigns.codeExists(code)) {
      throw new ValidationError(`Campaign code "${code}" is already in use`);
    }
    return this.campaigns.create({ ...data, code, createdBy: command.actorId });
  }
}

@CommandHandler(UpdateCampaignCommand)
export class UpdateCampaignHandler implements ICommandHandler<UpdateCampaignCommand, CampaignItem> {
  constructor(@Inject(CAMPAIGN_REPOSITORY) private readonly campaigns: CampaignRepository) {}

  async execute(command: UpdateCampaignCommand): Promise<CampaignItem> {
    const data = normalise(command.data);
    if (data.code && (await this.campaigns.codeExists(data.code, command.id))) {
      throw new ValidationError(`Campaign code "${data.code}" is already in use`);
    }
    return this.campaigns.update(command.id, { ...data, updatedBy: command.actorId });
  }
}

@CommandHandler(DeleteCampaignCommand)
export class DeleteCampaignHandler implements ICommandHandler<DeleteCampaignCommand, void> {
  constructor(@Inject(CAMPAIGN_REPOSITORY) private readonly campaigns: CampaignRepository) {}

  execute(command: DeleteCampaignCommand): Promise<void> {
    return this.campaigns.softDelete(command.id, command.actorId);
  }
}
