import { Module } from '@nestjs/common';
import { CqrsModule } from '@nestjs/cqrs';
import { AccountsModule } from '../accounts/accounts.module';
import { DISPATCH_REPORT_REPOSITORY } from './domain/dispatch-report.repository';
import { DRIVER_CASH_REPOSITORY } from './domain/driver-cash.repository';
import { GATE_PASS_REPOSITORY } from './domain/gate-pass.repository';
import { GATE_PASS_SOURCE } from './domain/gate-pass-source';
import { PrismaDispatchReportRepository } from './infrastructure/prisma-dispatch-report.repository';
import { PrismaDriverCashRepository } from './infrastructure/prisma-driver-cash.repository';
import { PrismaGatePassRepository } from './infrastructure/prisma-gate-pass.repository';
import { PrismaGatePassSource } from './infrastructure/prisma-gate-pass-source';
import { DispatchReportController } from './presentation/dispatch-report.controller';
import { DriverCashController } from './presentation/driver-cash.controller';
import { GatePassController } from './presentation/gate-pass.controller';
import {
  CancelGatePassHandler,
  CloseTripHandler,
  CreateGatePassHandler,
  DeleteGatePassHandler,
  DeliverGatePassHandler,
  GateOutHandler,
  GatePassPrintHandler,
  GetGatePassHandler,
  ListGatePassesHandler,
  PendingDispatchHandler,
  ReturnGatePassHandler,
  SetGatePassLoadedHandler,
  UpdateGatePassHandler,
} from './application/gate-pass.handlers';
import {
  DriverCashHandler,
  FreightCollectionHandler,
  PendingAgeingHandler,
  VehicleRunningHandler,
} from './application/dispatch-report.handlers';
import {
  CreateHandoverHandler,
  DeleteHandoverHandler,
  DriverDueHandler,
  GetHandoverHandler,
  ListHandoversHandler,
  OutstandingDriversHandler,
} from './application/driver-cash.handlers';

/**
 * Dispatch: the gate pass that records goods physically leaving, what was loaded onto
 * the vehicle, and the proof that it arrived.
 */
@Module({
  // AccountsModule brings CashPostingService: a driver handover lands in the drawer's book.
  imports: [CqrsModule, AccountsModule],
  controllers: [GatePassController, DispatchReportController, DriverCashController],
  providers: [
    { provide: GATE_PASS_REPOSITORY, useClass: PrismaGatePassRepository },
    { provide: GATE_PASS_SOURCE, useClass: PrismaGatePassSource },
    ListGatePassesHandler,
    GetGatePassHandler,
    GatePassPrintHandler,
    PendingDispatchHandler,
    CreateGatePassHandler,
    UpdateGatePassHandler,
    SetGatePassLoadedHandler,
    GateOutHandler,
    CloseTripHandler,
    DeliverGatePassHandler,
    ReturnGatePassHandler,
    CancelGatePassHandler,
    DeleteGatePassHandler,
    { provide: DISPATCH_REPORT_REPOSITORY, useClass: PrismaDispatchReportRepository },
    FreightCollectionHandler,
    VehicleRunningHandler,
    DriverCashHandler,
    PendingAgeingHandler,
    { provide: DRIVER_CASH_REPOSITORY, useClass: PrismaDriverCashRepository },
    ListHandoversHandler,
    GetHandoverHandler,
    DriverDueHandler,
    OutstandingDriversHandler,
    CreateHandoverHandler,
    DeleteHandoverHandler,
  ],
  exports: [GATE_PASS_REPOSITORY],
})
export class DispatchModule {}
