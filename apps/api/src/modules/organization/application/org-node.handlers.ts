import { Inject } from '@nestjs/common';
import { CommandHandler, QueryHandler, type ICommandHandler, type IQueryHandler } from '@nestjs/cqrs';
import { ValidationError } from '@tiles-erp/shared';
import { getGstState, isGstStateCode } from '@tiles-erp/config';
import type { OrgNodeItem, Paginated } from '@tiles-erp/shared-types';
import {
  BRANCH_REPOSITORY,
  COMPANY_REPOSITORY,
  GATE_REPOSITORY,
  GODOWN_REPOSITORY,
  RACK_REPOSITORY,
  type OrgNodeRepository,
  type OrgNodeBulkRepository,
} from '../domain/org-node.repository';
import {
  BulkCreateGatesCommand,
  BulkCreateRacksCommand,
  BulkCreateOrgNodesCommandBase,
  CreateBranchCommand,
  CreateCompanyCommand,
  CreateGateCommand,
  CreateGodownCommand,
  CreateOrgNodeCommandBase,
  CreateRackCommand,
  DeleteBranchCommand,
  DeleteCompanyCommand,
  DeleteGateCommand,
  DeleteGodownCommand,
  DeleteOrgNodeCommandBase,
  DeleteRackCommand,
  UpdateBranchCommand,
  UpdateCompanyCommand,
  UpdateGateCommand,
  UpdateGodownCommand,
  UpdateOrgNodeCommandBase,
  UpdateRackCommand,
} from './org-node.commands';
import {
  ListBranchesQuery,
  ListCompaniesQuery,
  ListGatesQuery,
  ListGodownsQuery,
  ListOrgNodesQueryBase,
  ListRacksQuery,
} from './org-node.queries';
import {
  BRANCH_RULES,
  COMPANY_RULES,
  GATE_RULES,
  GODOWN_RULES,
  RACK_RULES,
  type OrgNodeRules,
} from './org-node.rules';

abstract class BaseCreateHandler implements ICommandHandler<CreateOrgNodeCommandBase, OrgNodeItem> {
  protected constructor(
    private readonly repo: OrgNodeRepository,
    private readonly rules: OrgNodeRules,
  ) {}

  async execute(command: CreateOrgNodeCommandBase): Promise<OrgNodeItem> {
    const { data } = command;
    if (this.rules.requiresParent && !data.parentId) {
      throw new ValidationError(`${this.rules.label} requires a parent`);
    }
    if (this.rules.requiresCode && !data.code?.trim()) {
      throw new ValidationError(`${this.rules.label} requires a code`);
    }
    const stateCode = data.stateCode?.trim() || null;
    if (stateCode && !isGstStateCode(stateCode)) {
      throw new ValidationError(`Unknown GST state code "${stateCode}"`);
    }
    const gstin = data.gstin?.trim().toUpperCase() || null;
    if (gstin && stateCode && !gstin.startsWith(stateCode)) {
      throw new ValidationError(
        `GSTIN state code (${gstin.slice(0, 2)}) does not match the selected state (${stateCode})`,
      );
    }
    return this.repo.create({
      name: data.name.trim(),
      code: data.code?.trim().toUpperCase() ?? null,
      legalName: data.legalName?.trim() ?? null,
      gstin,
      addressLine1: data.addressLine1?.trim() ?? null,
      addressLine2: data.addressLine2?.trim() ?? null,
      city: data.city?.trim() ?? null,
      state: (stateCode ? getGstState(stateCode)?.name : data.state?.trim()) ?? null,
      stateCode,
      pincode: data.pincode?.trim() ?? null,
      phone: data.phone?.trim() ?? null,
      email: data.email?.trim().toLowerCase() ?? null,
      parentId: data.parentId ?? null,
      isActive: data.isActive ?? true,
      createdBy: command.actorId,
    });
  }
}

abstract class BaseUpdateHandler implements ICommandHandler<UpdateOrgNodeCommandBase, OrgNodeItem> {
  protected constructor(private readonly repo: OrgNodeRepository) {}

  execute(command: UpdateOrgNodeCommandBase): Promise<OrgNodeItem> {
    const { data } = command;
    const normalize = (value: string | null | undefined): string | null | undefined =>
      value === null ? null : value?.trim();
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
    return this.repo.update(command.id, {
      name: data.name?.trim(),
      code: data.code?.trim().toUpperCase(),
      legalName: normalize(data.legalName),
      gstin,
      addressLine1: normalize(data.addressLine1),
      addressLine2: normalize(data.addressLine2),
      city: normalize(data.city),
      state: stateCode ? (getGstState(stateCode)?.name ?? null) : normalize(data.state),
      stateCode,
      pincode: normalize(data.pincode),
      phone: normalize(data.phone),
      email: data.email === null ? null : data.email?.trim().toLowerCase(),
      isActive: data.isActive,
      updatedBy: command.actorId,
      version: data.version,
    });
  }
}

abstract class BaseDeleteHandler implements ICommandHandler<DeleteOrgNodeCommandBase, void> {
  protected constructor(private readonly repo: OrgNodeRepository) {}

  execute(command: DeleteOrgNodeCommandBase): Promise<void> {
    return this.repo.softDelete(command.id, command.actorId);
  }
}

abstract class BaseListHandler
  implements IQueryHandler<ListOrgNodesQueryBase, Paginated<OrgNodeItem>>
{
  protected constructor(private readonly repo: OrgNodeRepository) {}

  execute(query: ListOrgNodesQueryBase): Promise<Paginated<OrgNodeItem>> {
    return this.repo.list(query.pagination, query.parentId);
  }
}

// ---- Company ----
@CommandHandler(CreateCompanyCommand)
export class CreateCompanyHandler extends BaseCreateHandler {
  constructor(@Inject(COMPANY_REPOSITORY) repo: OrgNodeRepository) {
    super(repo, COMPANY_RULES);
  }
}
@CommandHandler(UpdateCompanyCommand)
export class UpdateCompanyHandler extends BaseUpdateHandler {
  constructor(@Inject(COMPANY_REPOSITORY) repo: OrgNodeRepository) {
    super(repo);
  }
}
@CommandHandler(DeleteCompanyCommand)
export class DeleteCompanyHandler extends BaseDeleteHandler {
  constructor(@Inject(COMPANY_REPOSITORY) repo: OrgNodeRepository) {
    super(repo);
  }
}
@QueryHandler(ListCompaniesQuery)
export class ListCompaniesHandler extends BaseListHandler {
  constructor(@Inject(COMPANY_REPOSITORY) repo: OrgNodeRepository) {
    super(repo);
  }
}

// ---- Branch ----
@CommandHandler(CreateBranchCommand)
export class CreateBranchHandler extends BaseCreateHandler {
  constructor(@Inject(BRANCH_REPOSITORY) repo: OrgNodeRepository) {
    super(repo, BRANCH_RULES);
  }
}
@CommandHandler(UpdateBranchCommand)
export class UpdateBranchHandler extends BaseUpdateHandler {
  constructor(@Inject(BRANCH_REPOSITORY) repo: OrgNodeRepository) {
    super(repo);
  }
}
@CommandHandler(DeleteBranchCommand)
export class DeleteBranchHandler extends BaseDeleteHandler {
  constructor(@Inject(BRANCH_REPOSITORY) repo: OrgNodeRepository) {
    super(repo);
  }
}
@QueryHandler(ListBranchesQuery)
export class ListBranchesHandler extends BaseListHandler {
  constructor(@Inject(BRANCH_REPOSITORY) repo: OrgNodeRepository) {
    super(repo);
  }
}

// ---- Godown ----
@CommandHandler(CreateGodownCommand)
export class CreateGodownHandler extends BaseCreateHandler {
  constructor(@Inject(GODOWN_REPOSITORY) repo: OrgNodeRepository) {
    super(repo, GODOWN_RULES);
  }
}
@CommandHandler(UpdateGodownCommand)
export class UpdateGodownHandler extends BaseUpdateHandler {
  constructor(@Inject(GODOWN_REPOSITORY) repo: OrgNodeRepository) {
    super(repo);
  }
}
@CommandHandler(DeleteGodownCommand)
export class DeleteGodownHandler extends BaseDeleteHandler {
  constructor(@Inject(GODOWN_REPOSITORY) repo: OrgNodeRepository) {
    super(repo);
  }
}
@QueryHandler(ListGodownsQuery)
export class ListGodownsHandler extends BaseListHandler {
  constructor(@Inject(GODOWN_REPOSITORY) repo: OrgNodeRepository) {
    super(repo);
  }
}

// ---- Gate ----
@CommandHandler(CreateGateCommand)
export class CreateGateHandler extends BaseCreateHandler {
  constructor(@Inject(GATE_REPOSITORY) repo: OrgNodeRepository) {
    super(repo, GATE_RULES);
  }
}
@CommandHandler(UpdateGateCommand)
export class UpdateGateHandler extends BaseUpdateHandler {
  constructor(@Inject(GATE_REPOSITORY) repo: OrgNodeRepository) {
    super(repo);
  }
}
@CommandHandler(DeleteGateCommand)
export class DeleteGateHandler extends BaseDeleteHandler {
  constructor(@Inject(GATE_REPOSITORY) repo: OrgNodeRepository) {
    super(repo);
  }
}
@QueryHandler(ListGatesQuery)
export class ListGatesHandler extends BaseListHandler {
  constructor(@Inject(GATE_REPOSITORY) repo: OrgNodeRepository) {
    super(repo);
  }
}

// ---- Rack ----
@CommandHandler(CreateRackCommand)
export class CreateRackHandler extends BaseCreateHandler {
  constructor(@Inject(RACK_REPOSITORY) repo: OrgNodeRepository) {
    super(repo, RACK_RULES);
  }
}
@CommandHandler(UpdateRackCommand)
export class UpdateRackHandler extends BaseUpdateHandler {
  constructor(@Inject(RACK_REPOSITORY) repo: OrgNodeRepository) {
    super(repo);
  }
}
@CommandHandler(DeleteRackCommand)
export class DeleteRackHandler extends BaseDeleteHandler {
  constructor(@Inject(RACK_REPOSITORY) repo: OrgNodeRepository) {
    super(repo);
  }
}
@QueryHandler(ListRacksQuery)
export class ListRacksHandler extends BaseListHandler {
  constructor(@Inject(RACK_REPOSITORY) repo: OrgNodeRepository) {
    super(repo);
  }
}

const MAX_BULK_ITEMS = 200;

abstract class BaseBulkCreateHandler
  implements ICommandHandler<BulkCreateOrgNodesCommandBase, OrgNodeItem[]>
{
  protected constructor(
    private readonly repo: OrgNodeBulkRepository,
    private readonly rules: OrgNodeRules,
  ) {}

  async execute(command: BulkCreateOrgNodesCommandBase): Promise<OrgNodeItem[]> {
    const { data } = command;
    if (data.items.length === 0) {
      throw new ValidationError('At least one item is required');
    }
    if (data.items.length > MAX_BULK_ITEMS) {
      throw new ValidationError(`At most ${MAX_BULK_ITEMS} items per request`);
    }

    const items = data.items.map((item) => ({
      name: item.name.trim(),
      code: item.code.trim().toUpperCase(),
    }));
    const invalid = items.find((item) => item.name.length === 0 || item.code.length === 0);
    if (invalid) {
      throw new ValidationError(`Every ${this.rules.label.toLowerCase()} needs a name and a code`);
    }

    const seen = new Set<string>();
    const duplicates = new Set<string>();
    for (const item of items) {
      if (seen.has(item.code)) duplicates.add(item.code);
      seen.add(item.code);
    }
    if (duplicates.size > 0) {
      throw new ValidationError(`Duplicate codes in request: ${[...duplicates].join(', ')}`);
    }

    return this.repo.bulkCreate({
      parentId: data.parentId,
      isActive: data.isActive ?? true,
      createdBy: command.actorId,
      items,
    });
  }
}

@CommandHandler(BulkCreateGatesCommand)
export class BulkCreateGatesHandler extends BaseBulkCreateHandler {
  constructor(@Inject(GATE_REPOSITORY) repo: OrgNodeBulkRepository) {
    super(repo, GATE_RULES);
  }
}

@CommandHandler(BulkCreateRacksCommand)
export class BulkCreateRacksHandler extends BaseBulkCreateHandler {
  constructor(@Inject(RACK_REPOSITORY) repo: OrgNodeBulkRepository) {
    super(repo, RACK_RULES);
  }
}
