import { Outlet } from 'react-router-dom';
import { PwaInstallPrompt } from '../components/PwaInstallPrompt';

/** Top-level application frame shared by every route. */
export function MainLayout(): JSX.Element {
  return (
    <>
      <Outlet />
      <PwaInstallPrompt />
    </>
  );
}
