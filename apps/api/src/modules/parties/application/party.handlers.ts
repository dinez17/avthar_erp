import { Inject } from '@nestjs/common';
import {
  CommandHandler,
  QueryHandler,
  type ICommandHandler,
  type IQueryHandler,
} from '@nestjs/cqrs';
import { getGstState, isGstStateCode } from '@tiles-erp/config';
import { ConflictError, NotFoundError, ValidationError } from '@tiles-erp/shared';
import type {
  CreatePartyInput,
  Paginated,
  PaginationQuery,
  PartyItem,
  UpdatePartyInput,
  UUID,
} from '@tiles-erp/shared-types';
import {
  CUSTOMER_REPOSITORY,
  SUPPLIER_REPOSITORY,
  type PartyListFilter,
  type PartyRepository,
} from '../domain/party.repository';

/** Party-specific validation rules applied by the generic handlers. */
interface PartyRules {
  requiresPhone: boolean;
  /** Blocks two records sharing a phone number (customers). */
  uniquePhone?: boolean;
  isCreate?: boolean;
}

export class ListPartiesQueryBase {
  constructor(
    public readonly pagination: PaginationQuery,
    public readonly filter: PartyListFilter,
  ) {}
}
export class ListCustomersQuery extends ListPartiesQueryBase {}
export class ListSuppliersQuery extends ListPartiesQueryBase {}

export class GetPartyQueryBase {
  constructor(public readonly id: UUID) {}
}
export class GetCustomerQuery extends GetPartyQueryBase {}
export class GetSupplierQuery extends GetPartyQueryBase {}

export class NextPartyCodeQueryBase {}
export class NextCustomerCodeQuery extends NextPartyCodeQueryBase {}
export class NextSupplierCodeQuery extends NextPartyCodeQueryBase {}

export class CreatePartyCommandBase {
  constructor(
    public readonly data: CreatePartyInput,
    public readonly actorId: UUID,
  ) {}
}
export class CreateCustomerCommand extends CreatePartyCommandBase {}
export class CreateSupplierCommand extends CreatePartyCommandBase {}

export class UpdatePartyCommandBase {
  constructor(
    public readonly id: UUID,
    public readonly data: UpdatePartyInput,
    public readonly actorId: UUID,
  ) {}
}
export class UpdateCustomerCommand extends UpdatePartyCommandBase {}
export class UpdateSupplierCommand extends UpdatePartyCommandBase {}

export class DeletePartyCommandBase {
  constructor(
    public readonly id: UUID,
    public readonly actorId: UUID,
  ) {}
}
export class DeleteCustomerCommand extends DeletePartyCommandBase {}
export class DeleteSupplierCommand extends DeletePartyCommandBase {}

/**
 * Normalises party input and enforces the GSTIN/state-code agreement used across the
 * system: a GSTIN always begins with the two-digit code of its registered state.
 */
function normalise<T extends CreatePartyInput | UpdatePartyInput>(
  data: T,
  label: string,
  rules: PartyRules = { requiresPhone: false },
): T {
  const stateCode = data.stateCode === null ? null : data.stateCode?.trim();
  if (stateCode && !isGstStateCode(stateCode)) {
    throw new ValidationError(`Unknown GST state code "${stateCode}"`);
  }
  const gstin = data.gstin === null ? null : data.gstin?.trim().toUpperCase();
  if (gstin && stateCode && !gstin.startsWith(stateCode)) {
    throw new ValidationError(
      `GSTIN state code (${gstin.slice(0, 2)}) does not match the selected state (${stateCode})`,
    );
  }
  if (rules.requiresPhone) {
    const phone = data.phone?.trim();
    // On create the field must be present; on update an explicitly blank value is rejected.
    if (phone === '' || (rules.isCreate && !phone)) {
      throw new ValidationError(`${label} phone number is required`);
    }
  }
  if (data.creditLimit !== undefined && data.creditLimit !== null && data.creditLimit < 0) {
    throw new ValidationError(`${label} credit limit cannot be negative`);
  }
  if (data.creditDays !== undefined && data.creditDays !== null && data.creditDays < 0) {
    throw new ValidationError(`${label} credit days cannot be negative`);
  }
  if (
    data.paymentTermDays !== undefined &&
    data.paymentTermDays !== null &&
    data.paymentTermDays < 0
  ) {
    throw new ValidationError(`${label} payment term days cannot be negative`);
  }

  return {
    ...data,
    name: data.name?.trim(),
    code: data.code?.trim().toUpperCase(),
    gstin,
    panNumber: data.panNumber === null ? null : data.panNumber?.trim().toUpperCase(),
    email: data.email === null ? null : data.email?.trim().toLowerCase(),
    stateCode,
    state: stateCode ? (getGstState(stateCode)?.name ?? null) : data.state,
  } as T;
}

abstract class BaseListHandler implements IQueryHandler<ListPartiesQueryBase, Paginated<PartyItem>> {
  protected constructor(private readonly repo: PartyRepository) {}

  execute(query: ListPartiesQueryBase): Promise<Paginated<PartyItem>> {
    return this.repo.list(query.pagination, query.filter);
  }
}

abstract class BaseGetHandler implements IQueryHandler<GetPartyQueryBase, PartyItem> {
  protected constructor(
    private readonly repo: PartyRepository,
    private readonly label: string,
  ) {}

  async execute(query: GetPartyQueryBase): Promise<PartyItem> {
    const party = await this.repo.findById(query.id);
    if (!party) throw new NotFoundError(`${this.label} not found`);
    return party;
  }
}

abstract class BaseNextCodeHandler implements IQueryHandler<NextPartyCodeQueryBase, string> {
  protected constructor(private readonly repo: PartyRepository) {}

  execute(): Promise<string> {
    return this.repo.nextCode();
  }
}

abstract class BaseCreateHandler implements ICommandHandler<CreatePartyCommandBase, PartyItem> {
  protected constructor(
    private readonly repo: PartyRepository,
    private readonly label: string,
    private readonly rules: PartyRules = { requiresPhone: false },
  ) {}

  protected async assertPhoneAvailable(phone?: string | null, excludeId?: UUID): Promise<void> {
    if (!this.rules.uniquePhone || !phone) return;
    const owner = await this.repo.findByPhone(phone, excludeId);
    if (owner) {
      throw new ConflictError(
        `Phone ${phone} already belongs to ${owner.name} (${owner.code}).`,
      );
    }
  }

  async execute(command: CreatePartyCommandBase): Promise<PartyItem> {
    const data = normalise(command.data, this.label, { ...this.rules, isCreate: true });
    const code = data.code || (await this.repo.nextCode());
    if (await this.repo.codeExists(code)) {
      throw new ConflictError(`${this.label} code "${code}" is already in use`);
    }
    await this.assertPhoneAvailable(data.phone);
    return this.repo.create({ ...data, code, createdBy: command.actorId });
  }
}

abstract class BaseUpdateHandler implements ICommandHandler<UpdatePartyCommandBase, PartyItem> {
  protected constructor(
    private readonly repo: PartyRepository,
    private readonly label: string,
    private readonly rules: PartyRules = { requiresPhone: false },
  ) {}

  async execute(command: UpdatePartyCommandBase): Promise<PartyItem> {
    const data = normalise(command.data, this.label, { ...this.rules, isCreate: false });
    if (data.code && (await this.repo.codeExists(data.code, command.id))) {
      throw new ConflictError(`${this.label} code "${data.code}" is already in use`);
    }
    if (this.rules.uniquePhone && data.phone) {
      const owner = await this.repo.findByPhone(data.phone, command.id);
      if (owner) {
        throw new ConflictError(
          `Phone ${data.phone} already belongs to ${owner.name} (${owner.code}).`,
        );
      }
    }
    return this.repo.update(command.id, { ...data, updatedBy: command.actorId });
  }
}

abstract class BaseDeleteHandler implements ICommandHandler<DeletePartyCommandBase, void> {
  protected constructor(private readonly repo: PartyRepository) {}

  execute(command: DeletePartyCommandBase): Promise<void> {
    return this.repo.softDelete(command.id, command.actorId);
  }
}

// ---- Customers ----
@QueryHandler(ListCustomersQuery)
export class ListCustomersHandler extends BaseListHandler {
  constructor(@Inject(CUSTOMER_REPOSITORY) repo: PartyRepository) {
    super(repo);
  }
}
@QueryHandler(GetCustomerQuery)
export class GetCustomerHandler extends BaseGetHandler {
  constructor(@Inject(CUSTOMER_REPOSITORY) repo: PartyRepository) {
    super(repo, 'Customer');
  }
}
@QueryHandler(NextCustomerCodeQuery)
export class NextCustomerCodeHandler extends BaseNextCodeHandler {
  constructor(@Inject(CUSTOMER_REPOSITORY) repo: PartyRepository) {
    super(repo);
  }
}
@CommandHandler(CreateCustomerCommand)
export class CreateCustomerHandler extends BaseCreateHandler {
  constructor(@Inject(CUSTOMER_REPOSITORY) repo: PartyRepository) {
    super(repo, 'Customer', { requiresPhone: true, uniquePhone: true });
  }
}
@CommandHandler(UpdateCustomerCommand)
export class UpdateCustomerHandler extends BaseUpdateHandler {
  constructor(@Inject(CUSTOMER_REPOSITORY) repo: PartyRepository) {
    super(repo, 'Customer', { requiresPhone: true, uniquePhone: true });
  }
}
@CommandHandler(DeleteCustomerCommand)
export class DeleteCustomerHandler extends BaseDeleteHandler {
  constructor(@Inject(CUSTOMER_REPOSITORY) repo: PartyRepository) {
    super(repo);
  }
}

// ---- Suppliers ----
@QueryHandler(ListSuppliersQuery)
export class ListSuppliersHandler extends BaseListHandler {
  constructor(@Inject(SUPPLIER_REPOSITORY) repo: PartyRepository) {
    super(repo);
  }
}
@QueryHandler(GetSupplierQuery)
export class GetSupplierHandler extends BaseGetHandler {
  constructor(@Inject(SUPPLIER_REPOSITORY) repo: PartyRepository) {
    super(repo, 'Supplier');
  }
}
@QueryHandler(NextSupplierCodeQuery)
export class NextSupplierCodeHandler extends BaseNextCodeHandler {
  constructor(@Inject(SUPPLIER_REPOSITORY) repo: PartyRepository) {
    super(repo);
  }
}
@CommandHandler(CreateSupplierCommand)
export class CreateSupplierHandler extends BaseCreateHandler {
  constructor(@Inject(SUPPLIER_REPOSITORY) repo: PartyRepository) {
    super(repo, 'Supplier');
  }
}
@CommandHandler(UpdateSupplierCommand)
export class UpdateSupplierHandler extends BaseUpdateHandler {
  constructor(@Inject(SUPPLIER_REPOSITORY) repo: PartyRepository) {
    super(repo, 'Supplier');
  }
}
@CommandHandler(DeleteSupplierCommand)
export class DeleteSupplierHandler extends BaseDeleteHandler {
  constructor(@Inject(SUPPLIER_REPOSITORY) repo: PartyRepository) {
    super(repo);
  }
}
