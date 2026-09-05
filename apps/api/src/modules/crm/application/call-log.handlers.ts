import { Inject } from '@nestjs/common';
import {
  CommandHandler,
  QueryHandler,
  type ICommandHandler,
  type IQueryHandler,
} from '@nestjs/cqrs';
import { NotFoundError, ValidationError } from '@tiles-erp/shared';
import type {
  CallLogItem,
  CreateCallLogInput,
  LeadStage,
  Paginated,
  PaginationQuery,
  UUID,
} from '@tiles-erp/shared-types';
import {
  CALL_LOG_REPOSITORY,
  type CallLogListFilter,
  type CallLogRepository,
  type LeadCallSideEffect,
} from '../domain/call-log.repository';

export class ListCallLogsQuery {
  constructor(
    public readonly pagination: PaginationQuery,
    public readonly filter: CallLogListFilter,
  ) {}
}

export class CreateCallLogCommand {
  constructor(
    public readonly data: CreateCallLogInput,
    public readonly actorId: UUID,
  ) {}
}

export class DeleteCallLogCommand {
  constructor(
    public readonly id: UUID,
    public readonly actorId: UUID,
  ) {}
}

const SETTLED: LeadStage[] = ['CONVERTED', 'NOT_INTERESTED'];

/**
 * What logging this call should do to its lead.
 *
 * A settled lead (converted or already dropped) is left alone — a courtesy call after the
 * sale should not reopen or re-close it. On an open lead: a "not interested" disposition
 * closes it with a reason, a callback sets the next follow-up to the callback time, and any
 * worked call at least nudges a brand-new lead into follow-up.
 */
function sideEffectFor(
  stage: LeadStage,
  data: CreateCallLogInput,
): LeadCallSideEffect | null {
  if (SETTLED.includes(stage)) return null;

  const effect: LeadCallSideEffect = {};
  if (data.disposition === 'NOT_INTERESTED') {
    effect.stage = 'NOT_INTERESTED';
    effect.lostReason = data.notes?.trim() || 'Marked not interested on a call';
    return effect;
  }
  if (stage === 'NEW') effect.stage = 'FOLLOW_UP';
  if (data.disposition === 'CALLBACK' && data.callbackAt) {
    effect.nextFollowUpAt = new Date(data.callbackAt);
  }
  return Object.keys(effect).length > 0 ? effect : null;
}

@QueryHandler(ListCallLogsQuery)
export class ListCallLogsHandler
  implements IQueryHandler<ListCallLogsQuery, Paginated<CallLogItem>>
{
  constructor(@Inject(CALL_LOG_REPOSITORY) private readonly calls: CallLogRepository) {}

  execute(query: ListCallLogsQuery): Promise<Paginated<CallLogItem>> {
    return this.calls.list(query.pagination, query.filter);
  }
}

@CommandHandler(CreateCallLogCommand)
export class CreateCallLogHandler implements ICommandHandler<CreateCallLogCommand, CallLogItem> {
  constructor(@Inject(CALL_LOG_REPOSITORY) private readonly calls: CallLogRepository) {}

  async execute(command: CreateCallLogCommand): Promise<CallLogItem> {
    const { data } = command;
    if (data.disposition === 'CALLBACK' && !data.callbackAt) {
      throw new ValidationError('A callback date and time is required for a callback');
    }
    if (data.durationSec !== undefined && data.durationSec < 0) {
      throw new ValidationError('Call duration cannot be negative');
    }

    const stage = await this.calls.leadStage(data.leadId);
    if (!stage) throw new NotFoundError('Lead not found');

    const sideEffect = sideEffectFor(stage, data);
    const callerName = await this.calls.callerName(command.actorId);
    return this.calls.create(
      { ...data, callerName, createdBy: command.actorId },
      sideEffect,
      command.actorId,
    );
  }
}

@CommandHandler(DeleteCallLogCommand)
export class DeleteCallLogHandler implements ICommandHandler<DeleteCallLogCommand, void> {
  constructor(@Inject(CALL_LOG_REPOSITORY) private readonly calls: CallLogRepository) {}

  execute(command: DeleteCallLogCommand): Promise<void> {
    return this.calls.softDelete(command.id, command.actorId);
  }
}
