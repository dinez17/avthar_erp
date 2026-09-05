import { Inject } from '@nestjs/common';
import {
  CommandBus,
  CommandHandler,
  QueryHandler,
  type ICommandHandler,
  type IQueryHandler,
} from '@nestjs/cqrs';
import { NotFoundError, ValidationError } from '@tiles-erp/shared';
import type {
  ChangeLeadStageInput,
  ConvertLeadInput,
  ConvertLeadResult,
  CreateLeadInput,
  CreateQuotationInput,
  LeadItem,
  LeadStageSummary,
  Paginated,
  PaginationQuery,
  QuotationItem,
  UpdateLeadInput,
  UUID,
} from '@tiles-erp/shared-types';
import { CreateQuotationCommand } from '../../sales/application/quotation.handlers';
import type { PricingRights } from '../../sales/application/price-guard';
import {
  LEAD_REPOSITORY,
  type LeadListFilter,
  type LeadRepository,
} from '../domain/lead.repository';

// ---- Queries & commands ----

export class ListLeadsQuery {
  constructor(
    public readonly pagination: PaginationQuery,
    public readonly filter: LeadListFilter,
  ) {}
}

export class GetLeadQuery {
  constructor(public readonly id: UUID) {}
}

export class LeadPipelineQuery {
  constructor(public readonly filter: LeadListFilter) {}
}

export class NextLeadCodeQuery {}

export class CreateLeadCommand {
  constructor(
    public readonly data: CreateLeadInput,
    public readonly actorId: UUID,
  ) {}
}

export class UpdateLeadCommand {
  constructor(
    public readonly id: UUID,
    public readonly data: UpdateLeadInput,
    public readonly actorId: UUID,
  ) {}
}

export class ChangeLeadStageCommand {
  constructor(
    public readonly id: UUID,
    public readonly data: ChangeLeadStageInput,
    public readonly actorId: UUID,
  ) {}
}

export class ConvertLeadCommand {
  constructor(
    public readonly id: UUID,
    public readonly data: ConvertLeadInput,
    public readonly actorId: UUID,
    /** The same pricing rights the quotation desk enforces for this actor. */
    public readonly rights: PricingRights,
  ) {}
}

export class DeleteLeadCommand {
  constructor(
    public readonly id: UUID,
    public readonly actorId: UUID,
  ) {}
}

// ---- Normalisation ----

const trimmed = (value?: string | null): string | null | undefined => {
  if (value === undefined) return undefined;
  if (value === null) return null;
  const t = value.trim();
  return t.length > 0 ? t : null;
};

/** Cleans a create/update payload: trims text, tidies the code and email, checks numbers. */
function normalise<T extends CreateLeadInput | UpdateLeadInput>(data: T): T {
  if (data.expectedValue !== undefined && data.expectedValue !== null && data.expectedValue < 0) {
    throw new ValidationError('Expected value cannot be negative');
  }
  const email = data.email === undefined ? undefined : (trimmed(data.email)?.toLowerCase() ?? null);
  return {
    ...data,
    name: data.name?.trim(),
    code: data.code?.trim().toUpperCase(),
    companyName: trimmed(data.companyName),
    phone: trimmed(data.phone),
    altPhone: trimmed(data.altPhone),
    email,
    city: trimmed(data.city),
    notes: trimmed(data.notes),
  } as T;
}

// ---- Query handlers ----

@QueryHandler(ListLeadsQuery)
export class ListLeadsHandler implements IQueryHandler<ListLeadsQuery, Paginated<LeadItem>> {
  constructor(@Inject(LEAD_REPOSITORY) private readonly leads: LeadRepository) {}

  execute(query: ListLeadsQuery): Promise<Paginated<LeadItem>> {
    return this.leads.list(query.pagination, query.filter);
  }
}

@QueryHandler(GetLeadQuery)
export class GetLeadHandler implements IQueryHandler<GetLeadQuery, LeadItem> {
  constructor(@Inject(LEAD_REPOSITORY) private readonly leads: LeadRepository) {}

  async execute(query: GetLeadQuery): Promise<LeadItem> {
    const lead = await this.leads.findById(query.id);
    if (!lead) throw new NotFoundError('Lead not found');
    return lead;
  }
}

@QueryHandler(LeadPipelineQuery)
export class LeadPipelineHandler implements IQueryHandler<LeadPipelineQuery, LeadStageSummary[]> {
  constructor(@Inject(LEAD_REPOSITORY) private readonly leads: LeadRepository) {}

  execute(query: LeadPipelineQuery): Promise<LeadStageSummary[]> {
    return this.leads.pipeline(query.filter);
  }
}

@QueryHandler(NextLeadCodeQuery)
export class NextLeadCodeHandler implements IQueryHandler<NextLeadCodeQuery, string> {
  constructor(@Inject(LEAD_REPOSITORY) private readonly leads: LeadRepository) {}

  execute(): Promise<string> {
    return this.leads.nextCode();
  }
}

// ---- Command handlers ----

@CommandHandler(CreateLeadCommand)
export class CreateLeadHandler implements ICommandHandler<CreateLeadCommand, LeadItem> {
  constructor(@Inject(LEAD_REPOSITORY) private readonly leads: LeadRepository) {}

  async execute(command: CreateLeadCommand): Promise<LeadItem> {
    const data = normalise(command.data);
    if (!data.name) throw new ValidationError('A lead name is required');
    await this.leads.assertReferences(
      data.customerId ?? null,
      data.branchId ?? null,
      data.campaignId ?? null,
    );

    const code = data.code || (await this.leads.nextCode());
    if (await this.leads.codeExists(code)) {
      throw new ValidationError(`Lead code "${code}" is already in use`);
    }
    const ownerName = data.ownerUserId ? await this.leads.ownerName(data.ownerUserId) : null;
    return this.leads.create({ ...data, code, ownerName, createdBy: command.actorId });
  }
}

@CommandHandler(UpdateLeadCommand)
export class UpdateLeadHandler implements ICommandHandler<UpdateLeadCommand, LeadItem> {
  constructor(@Inject(LEAD_REPOSITORY) private readonly leads: LeadRepository) {}

  async execute(command: UpdateLeadCommand): Promise<LeadItem> {
    const data = normalise(command.data);
    await this.leads.assertReferences(
      data.customerId ?? null,
      data.branchId ?? null,
      data.campaignId ?? null,
    );
    if (data.code && (await this.leads.codeExists(data.code, command.id))) {
      throw new ValidationError(`Lead code "${data.code}" is already in use`);
    }
    // Re-resolve the owner snapshot only when the owner itself was part of the edit.
    const ownerName =
      data.ownerUserId !== undefined
        ? data.ownerUserId
          ? await this.leads.ownerName(data.ownerUserId)
          : null
        : undefined;
    return this.leads.update(command.id, { ...data, ownerName, updatedBy: command.actorId });
  }
}

@CommandHandler(ChangeLeadStageCommand)
export class ChangeLeadStageHandler implements ICommandHandler<ChangeLeadStageCommand, LeadItem> {
  constructor(@Inject(LEAD_REPOSITORY) private readonly leads: LeadRepository) {}

  async execute(command: ChangeLeadStageCommand): Promise<LeadItem> {
    const lead = await this.leads.findById(command.id);
    if (!lead) throw new NotFoundError('Lead not found');

    // CONVERTED is only ever reached by conversion, so it can never be set by hand.
    if ((command.data.stage as string) === 'CONVERTED') {
      throw new ValidationError('Convert the lead to reach the converted stage');
    }
    if (command.data.stage === 'NOT_INTERESTED' && !command.data.lostReason?.trim()) {
      throw new ValidationError('A reason is required when marking a lead not interested');
    }
    return this.leads.changeStage(command.id, command.data, command.actorId);
  }
}

@CommandHandler(ConvertLeadCommand)
export class ConvertLeadHandler implements ICommandHandler<ConvertLeadCommand, ConvertLeadResult> {
  constructor(
    @Inject(LEAD_REPOSITORY) private readonly leads: LeadRepository,
    private readonly commandBus: CommandBus,
  ) {}

  async execute(command: ConvertLeadCommand): Promise<ConvertLeadResult> {
    const lead = await this.leads.findById(command.id);
    if (!lead) throw new NotFoundError('Lead not found');
    if (lead.convertedQuotationId) {
      throw new ValidationError('This lead has already been converted to a quotation');
    }
    if (command.data.lines.length === 0) {
      throw new ValidationError('Add at least one product to quote');
    }

    // A quotation must be raised at a branch. Prefer the branch chosen at conversion,
    // fall back to the lead's own, and refuse rather than guess when neither is set.
    const branchId = command.data.branchId ?? lead.branchId ?? undefined;
    if (!branchId) {
      throw new ValidationError('This lead has no branch. Choose a branch to quote from.');
    }
    const customerId = command.data.customerId ?? lead.customerId ?? undefined;

    // Everything but the products is carried from the lead; the quotation desk itself
    // then prices the lines, applies the branch floor and enforces the pricing rights.
    const quotationInput: CreateQuotationInput = {
      customerId: customerId ?? undefined,
      customerName: lead.companyName ?? lead.name,
      customerMobile: lead.phone ?? undefined,
      salesmanUserId: lead.ownerUserId ?? undefined,
      branchId,
      validUntil: command.data.validUntil,
      remarks: command.data.remarks,
      lines: command.data.lines,
    };

    const quotation = await this.commandBus.execute<CreateQuotationCommand, QuotationItem>(
      new CreateQuotationCommand(quotationInput, command.actorId, command.rights),
    );

    // Snapshot who actually did the conversion — not necessarily the lead's owner.
    const convertedByName = await this.leads.ownerName(command.actorId);
    const converted = await this.leads.markConverted(
      lead.id,
      lead.version,
      quotation.id,
      command.actorId,
      convertedByName,
    );
    return { lead: converted, quotation };
  }
}

@CommandHandler(DeleteLeadCommand)
export class DeleteLeadHandler implements ICommandHandler<DeleteLeadCommand, void> {
  constructor(@Inject(LEAD_REPOSITORY) private readonly leads: LeadRepository) {}

  execute(command: DeleteLeadCommand): Promise<void> {
    return this.leads.softDelete(command.id, command.actorId);
  }
}
