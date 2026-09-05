import { Chip } from '@mui/material';
import type { ColDef, ICellRendererParams } from 'ag-grid-community';
import { GST_STATES } from '@tiles-erp/config';
import type { LogisticsEndpoint } from './api';

/** Declarative form-field descriptor rendered by LogisticsPage. */
export interface FieldSpec {
  name: string;
  label: string;
  kind: 'text' | 'number' | 'date' | 'select' | 'switch' | 'multiline';
  options?: { value: string; label: string }[];
  /** Populated at runtime, e.g. transporter list. */
  optionSource?: 'transporters' | 'states';
  required?: boolean;
  helper?: string;
  section: string;
  /** Field is disabled while editing (e.g. auto-assigned codes). */
  width?: number;
}

export interface LogisticsEntityConfig {
  key: string;
  endpoint: LogisticsEndpoint;
  title: string;
  subtitle: string;
  singular: string;
  hasCode: boolean;
  filterByTransporter: boolean;
  searchPlaceholder: string;
  fields: FieldSpec[];
  columns: ColDef<Record<string, unknown>>[];
}

const statusColumn: ColDef<Record<string, unknown>> = {
  field: 'isActive',
  headerName: 'Status',
  maxWidth: 110,
  cellRenderer: (p: ICellRendererParams) => (
    <Chip
      label={p.value ? 'Active' : 'Inactive'}
      color={p.value ? 'success' : 'default'}
      size="small"
    />
  ),
};

const dateFormatter = (p: { value: unknown }): string =>
  p.value ? new Date(p.value as string).toLocaleDateString() : '';

export const LOGISTICS_ENTITIES: Record<string, LogisticsEntityConfig> = {
  transporters: {
    key: 'transporters',
    endpoint: '/transporters',
    title: 'Transporters',
    subtitle: 'Transport companies moving your goods.',
    singular: 'transporter',
    hasCode: true,
    filterByTransporter: false,
    searchPlaceholder: 'Search by name, code, phone or city…',
    fields: [
      { name: 'code', label: 'Code', kind: 'text', section: 'Identity', helper: 'Auto-generated' },
      { name: 'name', label: 'Name', kind: 'text', section: 'Identity', required: true },
      { name: 'gstin', label: 'GSTIN', kind: 'text', section: 'Identity' },
      {
        name: 'stateCode',
        label: 'State',
        kind: 'select',
        optionSource: 'states',
        section: 'Identity',
      },
      { name: 'contactPerson', label: 'Contact person', kind: 'text', section: 'Contact' },
      { name: 'phone', label: 'Phone', kind: 'text', section: 'Contact' },
      { name: 'email', label: 'Email', kind: 'text', section: 'Contact' },
      { name: 'addressLine1', label: 'Address', kind: 'text', section: 'Contact' },
      { name: 'city', label: 'City', kind: 'text', section: 'Contact' },
      { name: 'pincode', label: 'PIN code', kind: 'text', section: 'Contact' },
      { name: 'notes', label: 'Notes', kind: 'multiline', section: 'Other' },
      { name: 'isActive', label: 'Active', kind: 'switch', section: 'Other' },
    ],
    columns: [
      { field: 'code', headerName: 'Code', maxWidth: 120 },
      { field: 'name', headerName: 'Name', minWidth: 200 },
      { field: 'phone', headerName: 'Phone', maxWidth: 140 },
      { field: 'city', headerName: 'City', maxWidth: 130 },
      { field: 'gstin', headerName: 'GSTIN', minWidth: 170 },
      { field: 'vehicleCount', headerName: 'Vehicles', maxWidth: 110 },
      { field: 'driverCount', headerName: 'Drivers', maxWidth: 110 },
      statusColumn,
    ],
  },

  vehicles: {
    key: 'vehicles',
    endpoint: '/vehicles',
    title: 'Vehicles',
    subtitle: 'Owned and hired vehicles available for dispatch.',
    singular: 'vehicle',
    hasCode: false,
    filterByTransporter: true,
    searchPlaceholder: 'Search by registration number or make…',
    fields: [
      {
        name: 'number',
        label: 'Registration number',
        kind: 'text',
        section: 'Identity',
        required: true,
        helper: 'e.g. TN01AB1234',
      },
      {
        name: 'type',
        label: 'Type',
        kind: 'select',
        section: 'Identity',
        options: [
          { value: 'TRUCK', label: 'Truck' },
          { value: 'TEMPO', label: 'Tempo' },
          { value: 'TRAILER', label: 'Trailer' },
          { value: 'PICKUP', label: 'Pickup' },
          { value: 'CONTAINER', label: 'Container' },
        ],
      },
      {
        name: 'ownership',
        label: 'Ownership',
        kind: 'select',
        section: 'Identity',
        options: [
          { value: 'OWNED', label: 'Owned' },
          { value: 'HIRED', label: 'Hired' },
        ],
      },
      {
        name: 'transporterId',
        label: 'Transporter',
        kind: 'select',
        optionSource: 'transporters',
        section: 'Identity',
        helper: 'Required for hired vehicles',
      },
      { name: 'make', label: 'Make / model', kind: 'text', section: 'Details' },
      { name: 'capacityTons', label: 'Capacity (tons)', kind: 'number', section: 'Details' },
      { name: 'insuranceExpiry', label: 'Insurance expiry', kind: 'date', section: 'Compliance' },
      { name: 'fitnessExpiry', label: 'Fitness expiry', kind: 'date', section: 'Compliance' },
      { name: 'notes', label: 'Notes', kind: 'multiline', section: 'Other' },
      { name: 'isActive', label: 'Active', kind: 'switch', section: 'Other' },
    ],
    columns: [
      { field: 'number', headerName: 'Number', minWidth: 150 },
      { field: 'type', headerName: 'Type', maxWidth: 120 },
      { field: 'ownership', headerName: 'Ownership', maxWidth: 130 },
      { field: 'transporterName', headerName: 'Transporter', minWidth: 160 },
      { field: 'capacityTons', headerName: 'Capacity (t)', maxWidth: 130 },
      {
        field: 'insuranceExpiry',
        headerName: 'Insurance',
        maxWidth: 130,
        valueFormatter: dateFormatter,
      },
      {
        field: 'fitnessExpiry',
        headerName: 'Fitness',
        maxWidth: 130,
        valueFormatter: dateFormatter,
      },
      statusColumn,
    ],
  },

  drivers: {
    key: 'drivers',
    endpoint: '/drivers',
    title: 'Drivers',
    subtitle: 'Drivers available for trips, with licence details.',
    singular: 'driver',
    hasCode: true,
    filterByTransporter: true,
    searchPlaceholder: 'Search by name, code, phone or licence…',
    fields: [
      { name: 'code', label: 'Code', kind: 'text', section: 'Identity', helper: 'Auto-generated' },
      { name: 'name', label: 'Name', kind: 'text', section: 'Identity', required: true },
      { name: 'phone', label: 'Phone', kind: 'text', section: 'Identity', required: true },
      { name: 'altPhone', label: 'Alt phone', kind: 'text', section: 'Identity' },
      {
        name: 'transporterId',
        label: 'Transporter',
        kind: 'select',
        optionSource: 'transporters',
        section: 'Identity',
        helper: 'Leave blank for in-house drivers',
      },
      { name: 'licenseNumber', label: 'Licence number', kind: 'text', section: 'Licence' },
      { name: 'licenseExpiry', label: 'Licence expiry', kind: 'date', section: 'Licence' },
      { name: 'addressLine1', label: 'Address', kind: 'text', section: 'Contact' },
      { name: 'city', label: 'City', kind: 'text', section: 'Contact' },
      { name: 'notes', label: 'Notes', kind: 'multiline', section: 'Other' },
      { name: 'isActive', label: 'Active', kind: 'switch', section: 'Other' },
    ],
    columns: [
      { field: 'code', headerName: 'Code', maxWidth: 120 },
      { field: 'name', headerName: 'Name', minWidth: 180 },
      { field: 'phone', headerName: 'Phone', maxWidth: 140 },
      { field: 'licenseNumber', headerName: 'Licence', minWidth: 150 },
      {
        field: 'licenseExpiry',
        headerName: 'Expires',
        maxWidth: 130,
        valueFormatter: dateFormatter,
      },
      { field: 'transporterName', headerName: 'Transporter', minWidth: 150 },
      { field: 'city', headerName: 'City', maxWidth: 130 },
      statusColumn,
    ],
  },
};

export const STATE_OPTIONS = GST_STATES.map((s) => ({ value: s.code, label: `${s.name} (${s.code})` }));
