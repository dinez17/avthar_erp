import { Module } from '@nestjs/common';
import { CqrsModule } from '@nestjs/cqrs';
import { CASH_COUNT_REPOSITORY } from './domain/cash-count.repository';
import { CASH_ENTRY_REPOSITORY } from './domain/cash-entry.repository';
import { LEDGER_ACCOUNT_REPOSITORY } from './domain/ledger-account.repository';
import { CashPostingService } from './infrastructure/cash-posting.service';
import { PrismaCashCountRepository } from './infrastructure/prisma-cash-count.repository';
import { PrismaCashEntryRepository } from './infrastructure/prisma-cash-entry.repository';
import { PrismaLedgerAccountRepository } from './infrastructure/prisma-ledger-account.repository';
import { CashBookController } from './presentation/cash-book.controller';
import { CashCountController } from './presentation/cash-count.controller';
import { LedgerAccountController } from './presentation/ledger-account.controller';

/**
 * Cash boxes, bank accounts, expense heads and the book they all write into.
 *
 * `CashPostingService` is exported rather than kept private: sales and purchase post into
 * the book too, and one posting primitive shared between them is what keeps a drawer from
 * being overdrawn by a module that forgot to check.
 */
@Module({
  imports: [CqrsModule],
  controllers: [LedgerAccountController, CashBookController, CashCountController],
  providers: [
    CashPostingService,
    { provide: LEDGER_ACCOUNT_REPOSITORY, useClass: PrismaLedgerAccountRepository },
    { provide: CASH_ENTRY_REPOSITORY, useClass: PrismaCashEntryRepository },
    { provide: CASH_COUNT_REPOSITORY, useClass: PrismaCashCountRepository },
  ],
  exports: [
    LEDGER_ACCOUNT_REPOSITORY,
    CASH_ENTRY_REPOSITORY,
    CASH_COUNT_REPOSITORY,
    CashPostingService,
  ],
})
export class AccountsModule {}
