import { Module } from '@nestjs/common';
import { CqrsModule } from '@nestjs/cqrs';
import {
  DRIVER_REPOSITORY,
  TRANSPORTER_REPOSITORY,
  VEHICLE_REPOSITORY,
} from './domain/logistics.repositories';
import {
  PrismaDriverRepository,
  PrismaTransporterRepository,
  PrismaVehicleRepository,
} from './infrastructure/prisma-logistics.repositories';
import {
  DriversController,
  TransportersController,
  VehiclesController,
} from './presentation/logistics.controllers';
import {
  CreateDriverHandler,
  CreateTransporterHandler,
  CreateVehicleHandler,
  DeleteDriverHandler,
  DeleteTransporterHandler,
  DeleteVehicleHandler,
  ListDriversHandler,
  ListTransportersHandler,
  ListVehiclesHandler,
  NextDriverCodeHandler,
  NextTransporterCodeHandler,
  UpdateDriverHandler,
  UpdateTransporterHandler,
  UpdateVehicleHandler,
} from './application/logistics.handlers';

/** Logistics masters: transporters, vehicles and drivers. */
@Module({
  imports: [CqrsModule],
  controllers: [TransportersController, VehiclesController, DriversController],
  providers: [
    { provide: TRANSPORTER_REPOSITORY, useClass: PrismaTransporterRepository },
    { provide: VEHICLE_REPOSITORY, useClass: PrismaVehicleRepository },
    { provide: DRIVER_REPOSITORY, useClass: PrismaDriverRepository },
    ListTransportersHandler,
    NextTransporterCodeHandler,
    CreateTransporterHandler,
    UpdateTransporterHandler,
    DeleteTransporterHandler,
    ListVehiclesHandler,
    CreateVehicleHandler,
    UpdateVehicleHandler,
    DeleteVehicleHandler,
    ListDriversHandler,
    NextDriverCodeHandler,
    CreateDriverHandler,
    UpdateDriverHandler,
    DeleteDriverHandler,
  ],
})
export class LogisticsModule {}
