import { randomBytes } from 'node:crypto';
import { Inject } from '@nestjs/common';
import {
  CommandHandler,
  QueryHandler,
  type ICommandHandler,
  type IQueryHandler,
} from '@nestjs/cqrs';
import { ConflictError, ValidationError } from '@tiles-erp/shared';
import type {
  CreatePortalAccountInput,
  Paginated,
  PaginationQuery,
  PortalAccountCreated,
  PortalAccountItem,
  PortalMe,
  UUID,
} from '@tiles-erp/shared-types';
import { PasswordService } from '../../auth/infrastructure/password.service';
import {
  PORTAL_ACCOUNT_REPOSITORY,
  type PortalAccountListFilter,
  type PortalAccountRepository,
} from '../domain/portal-account.repository';

/** A readable one-time password: two short base32-ish groups. */
const generatePassword = (): string =>
  randomBytes(9).toString('base64').replace(/[+/=]/g, '').slice(0, 10);

export class GetPortalMeQuery {
  constructor(public readonly userId: UUID) {}
}

export class ListPortalAccountsQuery {
  constructor(
    public readonly pagination: PaginationQuery,
    public readonly filter: PortalAccountListFilter,
  ) {}
}

export class CreatePortalAccountCommand {
  constructor(
    public readonly data: CreatePortalAccountInput,
    public readonly actorId: UUID,
  ) {}
}

export class SetPortalAccountActiveCommand {
  constructor(
    public readonly id: UUID,
    public readonly isActive: boolean,
    public readonly actorId: UUID,
  ) {}
}

export class DeletePortalAccountCommand {
  constructor(
    public readonly id: UUID,
    public readonly actorId: UUID,
  ) {}
}

@QueryHandler(GetPortalMeQuery)
export class GetPortalMeHandler implements IQueryHandler<GetPortalMeQuery, PortalMe> {
  constructor(@Inject(PORTAL_ACCOUNT_REPOSITORY) private readonly accounts: PortalAccountRepository) {}

  execute(query: GetPortalMeQuery): Promise<PortalMe> {
    return this.accounts.partiesForUser(query.userId);
  }
}

@QueryHandler(ListPortalAccountsQuery)
export class ListPortalAccountsHandler
  implements IQueryHandler<ListPortalAccountsQuery, Paginated<PortalAccountItem>>
{
  constructor(@Inject(PORTAL_ACCOUNT_REPOSITORY) private readonly accounts: PortalAccountRepository) {}

  execute(query: ListPortalAccountsQuery): Promise<Paginated<PortalAccountItem>> {
    return this.accounts.list(query.pagination, query.filter);
  }
}

@CommandHandler(CreatePortalAccountCommand)
export class CreatePortalAccountHandler
  implements ICommandHandler<CreatePortalAccountCommand, PortalAccountCreated>
{
  constructor(
    @Inject(PORTAL_ACCOUNT_REPOSITORY) private readonly accounts: PortalAccountRepository,
    private readonly passwords: PasswordService,
  ) {}

  async execute(command: CreatePortalAccountCommand): Promise<PortalAccountCreated> {
    const data = command.data;
    const partyId = data.partyType === 'SUPPLIER' ? data.supplierId : data.customerId;
    if (!partyId) {
      throw new ValidationError(
        `A ${data.partyType === 'SUPPLIER' ? 'supplier' : 'customer'} is required`,
      );
    }
    const partyName = await this.accounts.partyName(data.partyType, partyId);
    if (!partyName) throw new ValidationError('That party does not exist');

    const email = data.email.trim().toLowerCase();
    if (!email) throw new ValidationError('An email is required');
    const fullName = data.fullName.trim();
    if (!fullName) throw new ValidationError('A contact name is required');

    // Reuse an existing login for this email, or mint one with a temporary password.
    let userId = await this.accounts.findUserIdByEmail(email);
    let temporaryPassword: string | null = null;
    if (!userId) {
      const password = data.password?.trim() || generatePassword();
      temporaryPassword = data.password ? null : password;
      const passwordHash = await this.passwords.hash(password);
      userId = await this.accounts.provisionUser({
        email,
        fullName,
        passwordHash,
        roleName: data.partyType,
        createdBy: command.actorId,
      });
    }

    if (await this.accounts.linkExists(userId, data.partyType, partyId)) {
      throw new ConflictError('That login already has a portal account for this party');
    }
    const account = await this.accounts.createAccount(
      userId,
      data.partyType,
      partyId,
      command.actorId,
    );
    return { account, temporaryPassword };
  }
}

@CommandHandler(SetPortalAccountActiveCommand)
export class SetPortalAccountActiveHandler
  implements ICommandHandler<SetPortalAccountActiveCommand, PortalAccountItem>
{
  constructor(@Inject(PORTAL_ACCOUNT_REPOSITORY) private readonly accounts: PortalAccountRepository) {}

  execute(command: SetPortalAccountActiveCommand): Promise<PortalAccountItem> {
    return this.accounts.setActive(command.id, command.isActive, command.actorId);
  }
}

@CommandHandler(DeletePortalAccountCommand)
export class DeletePortalAccountHandler
  implements ICommandHandler<DeletePortalAccountCommand, void>
{
  constructor(@Inject(PORTAL_ACCOUNT_REPOSITORY) private readonly accounts: PortalAccountRepository) {}

  execute(command: DeletePortalAccountCommand): Promise<void> {
    return this.accounts.softDelete(command.id, command.actorId);
  }
}
