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
import AssessmentIcon from '@mui/icons-material/Assessment';
import SettingsIcon from '@mui/icons-material/Settings';
import { NavLink } from 'react-router-dom';
import { NAV_ITEMS, type NavIconKey } from '../router/navigation';

const ICONS: Record<NavIconKey, SvgIconComponent> = {
  overview: SpaceDashboardIcon,
  products: Inventory2Icon,
  inventory: WarehouseIcon,
  orders: ReceiptLongIcon,
  invoices: DescriptionIcon,
  payments: PaymentsIcon,
  documents: FolderIcon,
  customers: PeopleIcon,
  suppliers: StorefrontIcon,
  crm: CampaignIcon,
  logistics: LocalShippingIcon,
  reports: AssessmentIcon,
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
