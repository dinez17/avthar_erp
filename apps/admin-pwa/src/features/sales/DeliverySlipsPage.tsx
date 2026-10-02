import PrintIcon from '@mui/icons-material/Print';
import { IconButton, Tooltip } from '@mui/material';
import type { ColDef, ICellRendererParams } from 'ag-grid-community';
import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { usePagination } from '@tiles-erp/hooks';
import { PageContainer } from '@tiles-erp/ui';
import { DataTable } from '../../components/DataTable';
import { type DeliverySlipListItem, useDeliverySlips } from './invoices-api';

/** Restricted dispatch view: enough context to choose a posted delivery slip, and no billing data. */
export function DeliverySlipsPage(): JSX.Element {
  const navigate = useNavigate();
  const pagination = usePagination();
  const { data, isFetching } = useDeliverySlips(pagination.query);

  const columns = useMemo<ColDef<DeliverySlipListItem>[]>(() => [
    { field: 'invoiceNumber', headerName: 'Invoice no', minWidth: 170 },
    {
      field: 'invoiceDate',
      headerName: 'Date',
      minWidth: 120,
      valueFormatter: (params) => params.value
        ? new Date(params.value as string).toLocaleDateString('en-IN')
        : '',
    },
    { field: 'customerName', headerName: 'Customer', minWidth: 220 },
    { field: 'customerMobile', headerName: 'Phone', minWidth: 140 },
    { field: 'branchName', headerName: 'Branch', minWidth: 200 },
    { field: 'godownName', headerName: 'Godown', minWidth: 180 },
    { field: 'salesmanName', headerName: 'Salesman', minWidth: 150 },
    { field: 'itemCount', headerName: 'Items', maxWidth: 90 },
    { field: 'totalBoxes', headerName: 'Boxes', maxWidth: 90 },
    { field: 'totalPieces', headerName: 'Pcs', maxWidth: 90 },
    {
      headerName: 'Delivery slip',
      maxWidth: 130,
      cellRenderer: (params: ICellRendererParams<DeliverySlipListItem>) => (
        <Tooltip title="View and print delivery slip">
          <IconButton
            size="small"
            color="primary"
            onClick={() => params.data && navigate(
              `/sales-invoices/${params.data.invoiceId}/print?document=delivery&paper=80mm&godownId=${params.data.godownId}`,
            )}
          >
            <PrintIcon fontSize="small" />
          </IconButton>
        </Tooltip>
      ),
    },
  ], [navigate]);

  return (
    <PageContainer
      title="Delivery slips"
      subtitle="View posted delivery details and issue each godown-wise slip once."
    >
      <DataTable
        rows={data?.items ?? []}
        columns={columns}
        meta={data?.meta}
        pagination={pagination}
        loading={isFetching}
        searchPlaceholder="Search invoice number or customer…"
        exportable={false}
      />
    </PageContainer>
  );
}
