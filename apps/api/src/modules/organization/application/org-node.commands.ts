import type { CreateOrgNodeInput, UpdateOrgNodeInput, UUID } from '@tiles-erp/shared-types';

abstract class BaseOrgCommand {
  constructor(public readonly actorId: UUID) {}
}

export class CreateOrgNodeCommandBase extends BaseOrgCommand {
  constructor(
    public readonly data: CreateOrgNodeInput,
    actorId: UUID,
  ) {
    super(actorId);
  }
}

export class UpdateOrgNodeCommandBase extends BaseOrgCommand {
  constructor(
    public readonly id: UUID,
    public readonly data: UpdateOrgNodeInput,
    actorId: UUID,
  ) {
    super(actorId);
  }
}

export class DeleteOrgNodeCommandBase extends BaseOrgCommand {
  constructor(
    public readonly id: UUID,
    actorId: UUID,
  ) {
    super(actorId);
  }
}

// Concrete command classes: the CQRS bus routes by class identity, so each entity
// gets its own subclass even though the payload shape is shared.
export class CreateCompanyCommand extends CreateOrgNodeCommandBase {}
export class UpdateCompanyCommand extends UpdateOrgNodeCommandBase {}
export class DeleteCompanyCommand extends DeleteOrgNodeCommandBase {}
export class CreateBranchCommand extends CreateOrgNodeCommandBase {}
export class UpdateBranchCommand extends UpdateOrgNodeCommandBase {}
export class DeleteBranchCommand extends DeleteOrgNodeCommandBase {}
export class CreateGodownCommand extends CreateOrgNodeCommandBase {}
export class UpdateGodownCommand extends UpdateOrgNodeCommandBase {}
export class DeleteGodownCommand extends DeleteOrgNodeCommandBase {}
export class CreateGateCommand extends CreateOrgNodeCommandBase {}
export class UpdateGateCommand extends UpdateOrgNodeCommandBase {}
export class DeleteGateCommand extends DeleteOrgNodeCommandBase {}
export class CreateRackCommand extends CreateOrgNodeCommandBase {}
export class UpdateRackCommand extends UpdateOrgNodeCommandBase {}
export class DeleteRackCommand extends DeleteOrgNodeCommandBase {}

export class BulkCreateOrgNodesCommandBase extends BaseOrgCommand {
  constructor(
    public readonly data: {
      parentId: UUID;
      isActive?: boolean;
      items: { name: string; code: string }[];
    },
    actorId: UUID,
  ) {
    super(actorId);
  }
}

export class BulkCreateGatesCommand extends BulkCreateOrgNodesCommandBase {}
export class BulkCreateRacksCommand extends BulkCreateOrgNodesCommandBase {}
