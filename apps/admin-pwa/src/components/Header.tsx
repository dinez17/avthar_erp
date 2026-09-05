import { AppBar, Box, IconButton, Toolbar, Typography } from '@mui/material';
import MenuIcon from '@mui/icons-material/Menu';
import LogoutIcon from '@mui/icons-material/Logout';
import AccountCircleIcon from '@mui/icons-material/AccountCircle';
import { Link as RouterLink } from 'react-router-dom';
import { ThemeToggle } from './ThemeToggle';
import { useAuth } from '../auth/AuthProvider';
import { SIDEBAR_WIDTH } from './Sidebar';

interface HeaderProps {
  onMenuClick: () => void;
  isDesktop: boolean;
  title: string;
}

export function Header({ onMenuClick, isDesktop, title }: HeaderProps): JSX.Element {
  const { logout, user } = useAuth();
  return (
    <AppBar
      position="fixed"
      sx={{
        width: isDesktop ? `calc(100% - ${SIDEBAR_WIDTH}px)` : '100%',
        ml: isDesktop ? `${SIDEBAR_WIDTH}px` : 0,
        borderBottom: (t) => `1px solid ${t.palette.divider}`,
      }}
    >
      <Toolbar>
        {!isDesktop && (
          <IconButton edge="start" color="inherit" onClick={onMenuClick} aria-label="Open menu">
            <MenuIcon />
          </IconButton>
        )}
        <Typography variant="h6" sx={{ flexGrow: 1 }} noWrap>
          {title}
        </Typography>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          {user && (
            <Typography variant="body2" color="text.secondary">
              {user.email}
            </Typography>
          )}
          <IconButton
            color="inherit"
            component={RouterLink}
            to="/profile"
            aria-label="My profile"
          >
            <AccountCircleIcon />
          </IconButton>
          <ThemeToggle />
          <IconButton color="inherit" onClick={() => void logout()} aria-label="Sign out">
            <LogoutIcon />
          </IconButton>
        </Box>
      </Toolbar>
    </AppBar>
  );
}
