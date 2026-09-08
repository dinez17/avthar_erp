import { useEffect, useState } from 'react';
import {
  Box,
  Collapse,
  Drawer,
  List,
  ListItemButton,
  ListItemText,
  Stack,
  Toolbar,
  Typography,
} from '@mui/material';
import type { SvgIconComponent } from '@mui/icons-material';
import SpaceDashboardIcon from '@mui/icons-material/SpaceDashboard';
import ReceiptLongIcon from '@mui/icons-material/ReceiptLong';
import ShoppingCartIcon from '@mui/icons-material/ShoppingCart';
import Inventory2Icon from '@mui/icons-material/Inventory2';
import LocalShippingIcon from '@mui/icons-material/LocalShipping';
import AccountBalanceWalletIcon from '@mui/icons-material/AccountBalanceWallet';
import GroupsIcon from '@mui/icons-material/Groups';
import CategoryIcon from '@mui/icons-material/Category';
import AdminPanelSettingsIcon from '@mui/icons-material/AdminPanelSettings';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import { BrandMark } from '../app/branding';
import { NavLink, useLocation } from 'react-router-dom';
import {
  NAV_HOME,
  NAV_SECTIONS,
  groupIdForPath,
  type NavGroup,
  type NavIconKey,
} from '../router/navigation';

const ICONS: Record<NavIconKey, SvgIconComponent> = {
  dashboard: SpaceDashboardIcon,
  sales: ReceiptLongIcon,
  purchase: ShoppingCartIcon,
  inventory: Inventory2Icon,
  dispatch: LocalShippingIcon,
  accounts: AccountBalanceWalletIcon,
  crm: GroupsIcon,
  masters: CategoryIcon,
  admin: AdminPanelSettingsIcon,
};

export const SIDEBAR_WIDTH = 264;

const OPEN_GROUPS_KEY = 'tiles-erp.nav.open-groups';

/** Which groups were left open, per browser. A convenience, so a failure is harmless. */
const readOpenGroups = (): string[] => {
  try {
    const raw = window.localStorage.getItem(OPEN_GROUPS_KEY);
    return raw ? (JSON.parse(raw) as string[]) : [];
  } catch {
    return [];
  }
};

const writeOpenGroups = (ids: string[]): void => {
  try {
    window.localStorage.setItem(OPEN_GROUPS_KEY, JSON.stringify(ids));
  } catch {
    // A browser with site data blocked still gets a working menu.
  }
};

/** The rounded, tinted square that anchors each group. */
function GroupIcon({ icon, active }: { icon: NavIconKey; active: boolean }): JSX.Element {
  const Icon = ICONS[icon];
  return (
    <Box
      className="nav-chip"
      sx={{
        width: 30,
        height: 30,
        borderRadius: '9px',
        display: 'grid',
        placeItems: 'center',
        flex: 'none',
        bgcolor: active ? 'primary.light' : 'action.hover',
        color: active ? 'primary.main' : 'text.secondary',
        transition: 'background-color .15s, color .15s',
      }}
    >
      <Icon sx={{ fontSize: 18 }} />
    </Box>
  );
}

interface GroupProps {
  group: NavGroup;
  open: boolean;
  containsRoute: boolean;
  onToggle: () => void;
  onNavigate: () => void;
}

function NavGroupBlock({
  group,
  open,
  containsRoute,
  onToggle,
  onNavigate,
}: GroupProps): JSX.Element {
  const lit = open || containsRoute;

  return (
    <Box component="li" sx={{ listStyle: 'none' }}>
      <ListItemButton onClick={onToggle} aria-expanded={open} sx={{ gap: 1.4, px: 1.25, py: 1 }}>
        <GroupIcon icon={group.icon} active={lit} />
        <ListItemText
          primary={group.label}
          primaryTypographyProps={{
            fontSize: '0.85rem',
            fontWeight: lit ? 600 : 500,
            color: lit ? 'text.primary' : 'text.secondary',
          }}
        />
        {!open && (
          <Typography
            variant="caption"
            sx={{
              fontWeight: 600,
              color: 'text.disabled',
              bgcolor: 'action.hover',
              borderRadius: 20,
              px: 0.9,
              lineHeight: 1.6,
            }}
          >
            {group.items.length}
          </Typography>
        )}
        <ChevronRightIcon
          sx={{
            fontSize: 18,
            color: 'text.disabled',
            transform: open ? 'rotate(90deg)' : 'none',
            transition: 'transform .18s ease',
          }}
        />
      </ListItemButton>

      <Collapse in={open} unmountOnExit>
        <Stack
          component="ul"
          sx={{ listStyle: 'none', m: 0, p: 0, pl: '41px', gap: '1px', mt: '2px', mb: 0.75 }}
        >
          {group.items.map((item) => (
            <Box component="li" key={item.path} sx={{ listStyle: 'none' }}>
              <ListItemButton
                component={item.disabled ? 'div' : NavLink}
                to={item.disabled ? undefined : item.path}
                disabled={item.disabled}
                onClick={onNavigate}
                sx={{
                  py: 0.65,
                  px: 1.4,
                  borderRadius: '7px',
                  color: 'text.secondary',
                  '&.active': {
                    bgcolor: 'action.selected',
                    color: 'primary.main',
                    fontWeight: 600,
                  },
                }}
              >
                <ListItemText
                  primary={item.label}
                  primaryTypographyProps={{ fontSize: '0.8rem', fontWeight: 'inherit' }}
                />
              </ListItemButton>
            </Box>
          ))}
        </Stack>
      </Collapse>
    </Box>
  );
}

interface SidebarProps {
  open: boolean;
  onClose: () => void;
  isDesktop: boolean;
  title: string;
}

export function Sidebar({ open, onClose, isDesktop, title }: SidebarProps): JSX.Element {
  const { pathname } = useLocation();
  const activeGroup = groupIdForPath(pathname);
  const [openGroups, setOpenGroups] = useState<string[]>(readOpenGroups);

  // A deep link or a page reload should land with the owning group already open,
  // otherwise the highlighted item is hidden inside a collapsed section.
  useEffect(() => {
    if (!activeGroup) return;
    setOpenGroups((prev) => (prev.includes(activeGroup) ? prev : [...prev, activeGroup]));
  }, [activeGroup]);

  // Persistence lives here rather than inside the state updater: React 18's
  // StrictMode invokes updaters twice in development, so writing to storage from
  // one runs the side effect twice per change.
  useEffect(() => {
    writeOpenGroups(openGroups);
  }, [openGroups]);

  const toggle = (id: string): void => {
    setOpenGroups((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const closeOnMobile = (): void => {
    if (!isDesktop) onClose();
  };

  const content = (
    <Box
      role="navigation"
      aria-label="Primary"
      sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}
    >
      <Toolbar sx={{ px: 2.5, gap: 1.4, borderBottom: '1px solid', borderColor: 'divider' }}>
        <BrandMark size={34} />
        <Box sx={{ minWidth: 0 }}>
          <Typography
            noWrap
            sx={{
              fontFamily: 'Plus Jakarta Sans, Inter, sans-serif',
              fontWeight: 800,
              fontSize: '0.9rem',
              lineHeight: 1.2,
            }}
          >
            {title}
          </Typography>
          <Typography variant="caption" color="text.disabled" sx={{ lineHeight: 1.2 }}>
            Tiles ERP
          </Typography>
        </Box>
      </Toolbar>

      <Box sx={{ flex: 1, overflowY: 'auto', px: 1.5, pt: 1.75, pb: 3 }}>
        <List disablePadding>
          <ListItemButton
            component={NavLink}
            to={NAV_HOME.path}
            end
            onClick={closeOnMobile}
            sx={{
              gap: 1.4,
              px: 1.25,
              py: 1,
              mb: 0.5,
              '&.active': {
                bgcolor: 'primary.main',
                color: 'primary.contrastText',
                boxShadow: '0 4px 12px rgba(58,87,232,.28)',
                '& .nav-chip': { bgcolor: 'rgba(255,255,255,.2)', color: '#fff' },
                '&:hover': { bgcolor: 'primary.dark' },
              },
            }}
          >
            <GroupIcon icon={NAV_HOME.icon} active={pathname === '/'} />
            <ListItemText
              primary={NAV_HOME.label}
              primaryTypographyProps={{ fontSize: '0.85rem', fontWeight: 600 }}
            />
          </ListItemButton>

          {NAV_SECTIONS.map((section) => (
            <Box key={section.eyebrow}>
              <Typography
                variant="overline"
                sx={{ display: 'block', color: 'text.disabled', px: 1.25, pt: 2, pb: 0.75 }}
              >
                {section.eyebrow}
              </Typography>
              {section.groups.map((group) => (
                <NavGroupBlock
                  key={group.id}
                  group={group}
                  open={openGroups.includes(group.id)}
                  containsRoute={activeGroup === group.id}
                  onToggle={() => toggle(group.id)}
                  onNavigate={closeOnMobile}
                />
              ))}
            </Box>
          ))}
        </List>
      </Box>
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
      <Box sx={{ width: SIDEBAR_WIDTH, height: '100%' }}>{content}</Box>
    </Drawer>
  );
}
