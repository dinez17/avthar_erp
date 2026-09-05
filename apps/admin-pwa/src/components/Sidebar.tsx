import {
  Box,
  Drawer,
  List,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Toolbar,
  Typography,
} from '@mui/material';
import type { SvgIconComponent } from '@mui/icons-material';
import SpaceDashboardIcon from '@mui/icons-material/SpaceDashboard';
import Inventory2Icon from '@mui/icons-material/Inventory2';
import WarehouseIcon from '@mui/icons-material/Warehouse';
import ReceiptLongIcon from '@mui/icons-material/ReceiptLong';
import DescriptionIcon from '@mui/icons-material/Description';
import PaymentsIcon from '@mui/icons-material/Payments';
import FolderIcon from '@mui/icons-material/Folder';
import PeopleIcon from '@mui/icons-material/People';
import LocalShippingIcon from '@mui/icons-material/LocalShipping';
import StorefrontIcon from '@mui/icons-material/Storefront';
import CampaignIcon from '@mui/icons-material/Campaign';
import AdsClickIcon from '@mui/icons-material/AdsClick';
import EventAvailableIcon from '@mui/icons-material/EventAvailable';
import VpnKeyIcon from '@mui/icons-material/VpnKey';
import AssessmentIcon from '@mui/icons-material/Assessment';
import SettingsIcon from '@mui/icons-material/Settings';
import ManageAccountsIcon from '@mui/icons-material/ManageAccounts';
import AdminPanelSettingsIcon from '@mui/icons-material/AdminPanelSettings';
import AccountTreeIcon from '@mui/icons-material/AccountTree';
import BusinessIcon from '@mui/icons-material/Business';
import StoreIcon from '@mui/icons-material/Store';
import Warehouse2Icon from '@mui/icons-material/Warehouse';
import DoorSlidingIcon from '@mui/icons-material/DoorSliding';
import ViewModuleIcon from '@mui/icons-material/ViewModule';
import HistoryIcon from '@mui/icons-material/History';
import CategoryIcon from '@mui/icons-material/Category';
import LocalOfferIcon from '@mui/icons-material/LocalOffer';
import LayersIcon from '@mui/icons-material/Layers';
import CollectionsBookmarkIcon from '@mui/icons-material/CollectionsBookmark';
import CurrencyRupeeIcon from '@mui/icons-material/CurrencyRupee';
import SellIcon from '@mui/icons-material/Sell';
import FireTruckIcon from '@mui/icons-material/FireTruck';
import AirportShuttleIcon from '@mui/icons-material/AirportShuttle';
import BadgeIcon from '@mui/icons-material/Badge';
import FactCheckIcon from '@mui/icons-material/FactCheck';
import SwapHorizIcon from '@mui/icons-material/SwapHoriz';
import ShoppingCartIcon from '@mui/icons-material/ShoppingCart';
import MoveToInboxIcon from '@mui/icons-material/MoveToInbox';
import ReceiptIcon from '@mui/icons-material/Receipt';
import AssignmentReturnIcon from '@mui/icons-material/AssignmentReturn';
import RequestQuoteIcon from '@mui/icons-material/RequestQuote';
import { NavLink } from 'react-router-dom';
import { NAV_ITEMS, type NavIconKey } from '../router/navigation';

const ICONS: Record<NavIconKey, SvgIconComponent> = {
  overview: SpaceDashboardIcon,
  users: ManageAccountsIcon,
  roles: AdminPanelSettingsIcon,
  departments: AccountTreeIcon,
  company: BusinessIcon,
  branch: StoreIcon,
  godown: Warehouse2Icon,
  gate: DoorSlidingIcon,
  rack: ViewModuleIcon,
  audit: HistoryIcon,
  category: CategoryIcon,
  brand: LocalOfferIcon,
  series: LayersIcon,
  collection: CollectionsBookmarkIcon,
  rates: CurrencyRupeeIcon,
  prices: SellIcon,
  transporter: FireTruckIcon,
  vehicle: AirportShuttleIcon,
  driver: BadgeIcon,
  count: FactCheckIcon,
  transfer: SwapHorizIcon,
  purchase: ShoppingCartIcon,
  grn: MoveToInboxIcon,
  invoice: ReceiptIcon,
  return: AssignmentReturnIcon,
  quotation: RequestQuoteIcon,
  products: Inventory2Icon,
  inventory: WarehouseIcon,
  orders: ReceiptLongIcon,
  invoices: DescriptionIcon,
  payments: PaymentsIcon,
  documents: FolderIcon,
  customers: PeopleIcon,
  suppliers: StorefrontIcon,
  crm: CampaignIcon,
  campaign: AdsClickIcon,
  visit: EventAvailableIcon,
  logistics: LocalShippingIcon,
  reports: AssessmentIcon,
  portal: VpnKeyIcon,
  settings: SettingsIcon,
};

export const SIDEBAR_WIDTH = 260;

interface SidebarProps {
  open: boolean;
  onClose: () => void;
  isDesktop: boolean;
  title: string;
}

export function Sidebar({ open, onClose, isDesktop, title }: SidebarProps): JSX.Element {
  const content = (
    <Box role="navigation" aria-label="Primary">
      <Toolbar sx={{ px: 2 }}>
        <Typography variant="h6" noWrap fontWeight={700}>
          {title}
        </Typography>
      </Toolbar>
      <List sx={{ px: 1 }}>
        {NAV_ITEMS.map((item) => {
          const Icon = ICONS[item.icon];
          return (
            <ListItemButton
              key={item.label}
              component={item.disabled ? 'div' : NavLink}
              to={item.disabled ? undefined : item.path}
              disabled={item.disabled}
              onClick={isDesktop ? undefined : onClose}
              sx={{ borderRadius: 1, mb: 0.5, '&.active': { bgcolor: 'action.selected' } }}
            >
              <ListItemIcon sx={{ minWidth: 40 }}>
                <Icon fontSize="small" />
              </ListItemIcon>
              <ListItemText primary={item.label} />
            </ListItemButton>
          );
        })}
      </List>
    </Box>
  );

  if (isDesktop) {
    return (
      <Drawer
        variant="permanent"
        open
        sx={{
          width: SIDEBAR_WIDTH,
          flexShrink: 0,
          '& .MuiDrawer-paper': { width: SIDEBAR_WIDTH, boxSizing: 'border-box' },
        }}
      >
        {content}
      </Drawer>
    );
  }
  return (
    <Drawer variant="temporary" open={open} onClose={onClose} ModalProps={{ keepMounted: true }}>
      <Box sx={{ width: SIDEBAR_WIDTH }}>{content}</Box>
    </Drawer>
  );
}
