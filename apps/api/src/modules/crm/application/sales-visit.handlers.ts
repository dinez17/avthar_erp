import { Inject } from '@nestjs/common';
import {
  CommandHandler,
  QueryHandler,
  type ICommandHandler,
  type IQueryHandler,
} from '@nestjs/cqrs';
import { NotFoundError, ValidationError } from '@tiles-erp/shared';
import type {
  CreateSalesVisitInput,
  LeadStage,
  Paginated,
  PaginationQuery,
  SalesVisitItem,
  UpdateSalesVisitInput,
  UUID,
  VisitOutcome,
  VisitStatus,
} from '@tiles-erp/shared-types';
import {
  SALES_VISIT_REPOSITORY,
  type LeadVisitSideEffect,
  type SalesVisitListFilter,
  type SalesVisitRepository,
} from '../domain/sales-visit.repository';

export class ListSalesVisitsQuery {
  constructor(
    public readonly pagination: PaginationQuery,
    public readonly filter: SalesVisitListFilter,
  ) {}
}

export class CreateSalesVisitCommand {
  constructor(
    public readonly data: CreateSalesVisitInput,
    public readonly actorId: UUID,
  ) {}
}

export class UpdateSalesVisitCommand {
  constructor(
    public readonly id: UUID,
    public readonly data: UpdateSalesVisitInput,
    public readonly actorId: UUID,
  ) {}
}

export class DeleteSalesVisitCommand {
  constructor(
    public readonly id: UUID,
    public readonly actorId: UUID,
  ) {}
}

const SETTLED: LeadStage[] = ['CONVERTED', 'NOT_INTERESTED'];

/** The visit fields that decide what happens to the lead. */
export interface EffectiveVisit {
  status: VisitStatus;
  outcome: VisitOutcome | null;
  scheduledAt: string;
  nextFollowUpAt: string | null;
  notes: string | null;
}

/**
 * What reporting a visit does to its lead — the sprint's automation, in one pure place.
 *
 * A settled lead is left alone. A planned visit becomes the lead's next action (its
 * follow-up moves to the scheduled time), and a brand-new lead being visited moves into
 * follow-up. A completed visit carries the next-action date agreed on site, and an outcome
 * of "not interested" closes the lead with the visit note as the reason. A cancelled visit
 * or a no-show changes nothing.
 */
export function visitSideEffect(
  leadStage: LeadStage,
  visit: EffectiveVisit,
): LeadVisitSideEffect | null {
  if (SETTLED.includes(leadStage)) return null;

  if (visit.status === 'COMPLETED') {
    if (visit.outcome === 'NOT_INTERESTED') {
      return {
        stage: 'NOT_INTERESTED',
        lostReason: visit.notes?.trim() || 'Not interested after a visit',
      };
    }
    const effect: LeadVisitSideEffect = {};
    if (leadStage === 'NEW') effect.stage = 'FOLLOW_UP';
    if (visit.nextFollowUpAt) effect.nextFollowUpAt = new Date(visit.nextFollowUpAt);
    return Object.keys(effect).length > 0 ? effect : null;
  }

  if (visit.status === 'PLANNED') {
    const effect: LeadVisitSideEffect = { nextFollowUpAt: new Date(visit.scheduledAt) };
    if (leadStage === 'NEW') effect.stage = 'FOLLOW_UP';
    return effect;
  }

  return null; // CANCELLED / NO_SHOW
}

const requireOutcomeWhenCompleted = (status: VisitStatus, outcome: VisitOutcome | null): void => {
  if (status === 'COMPLETED' && !outcome) {
    throw new ValidationError('An outcome is required to complete a visit');
  }
};

@QueryHandler(ListSalesVisitsQuery)
export class ListSalesVisitsHandler
  implements IQueryHandler<ListSalesVisitsQuery, Paginated<SalesVisitItem>>
{
  constructor(@Inject(SALES_VISIT_REPOSITORY) private readonly visits: SalesVisitRepository) {}

  execute(query: ListSalesVisitsQuery): Promise<Paginated<SalesVisitItem>> {
    return this.visits.list(query.pagination, query.filter);
  }
}

@CommandHandler(CreateSalesVisitCommand)
export class CreateSalesVisitHandler
  implements ICommandHandler<CreateSalesVisitCommand, SalesVisitItem>
{
  constructor(@Inject(SALES_VISIT_REPOSITORY) private readonly visits: SalesVisitRepository) {}

  async execute(command: CreateSalesVisitCommand): Promise<SalesVisitItem> {
    const { data } = command;
    const status: VisitStatus = data.status ?? 'PLANNED';
    const outcome = data.outcome ?? null;
    requireOutcomeWhenCompleted(status, outcome);

    const stage = await this.visits.leadStage(data.leadId);
    if (!stage) throw new NotFoundError('Lead not found');

    const sideEffect = visitSideEffect(stage, {
      status,
      outcome,
      scheduledAt: data.scheduledAt,
      nextFollowUpAt: data.nextFollowUpAt ?? null,
      notes: data.notes ?? null,
    });
    const salespersonName = data.salespersonUserId
      ? await this.visits.salespersonName(data.salespersonUserId)
      : null;

    return this.visits.create(
      { ...data, salespersonName, createdBy: command.actorId },
      sideEffect,
      command.actorId,
    );
  }
}

@CommandHandler(UpdateSalesVisitCommand)
export class UpdateSalesVisitHandler
  implements ICommandHandler<UpdateSalesVisitCommand, SalesVisitItem>
{
  constructor(@Inject(SALES_VISIT_REPOSITORY) private readonly visits: SalesVisitRepository) {}

  async execute(command: UpdateSalesVisitCommand): Promise<SalesVisitItem> {
    const existing = await this.visits.findById(command.id);
    if (!existing) throw new NotFoundError('Visit not found');
    const { data } = command;

    // The lead reacts to the visit's resulting state, so merge the edit over what was there.
    const effective: EffectiveVisit = {
      status: data.status ?? existing.status,
      outcome: data.outcome !== undefined ? data.outcome : existing.outcome,
      scheduledAt: data.scheduledAt ?? existing.scheduledAt,
      nextFollowUpAt:
        data.nextFollowUpAt !== undefined ? data.nextFollowUpAt : existing.nextFollowUpAt,
      notes: data.notes !== undefined ? data.notes : existing.notes,
    };
    requireOutcomeWhenCompleted(effective.status, effective.outcome);

    const stage = await this.visits.leadStage(existing.leadId);
    if (!stage) throw new NotFoundError('Lead not found');

    const sideEffect = visitSideEffect(stage, effective);
    const salespersonName =
      data.salespersonUserId !== undefined
        ? data.salespersonUserId
          ? await this.visits.salespersonName(data.salespersonUserId)
          : null
        : undefined;

    return this.visits.update(
      command.id,
      { ...data, salespersonName, updatedBy: command.actorId },
      sideEffect,
      command.actorId,
    );
  }
}

@CommandHandler(DeleteSalesVisitCommand)
export class DeleteSalesVisitHandler implements ICommandHandler<DeleteSalesVisitCommand, void> {
  constructor(@Inject(SALES_VISIT_REPOSITORY) private readonly visits: SalesVisitRepository) {}

  execute(command: DeleteSalesVisitCommand): Promise<void> {
    return this.visits.softDelete(command.id, command.actorId);
  }
}
