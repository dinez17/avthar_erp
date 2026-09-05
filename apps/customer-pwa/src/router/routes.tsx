import { createBrowserRouter } from 'react-router-dom';
import { MainLayout } from '../layouts/MainLayout';
import { DashboardLayout } from '../layouts/DashboardLayout';
import { ProtectedRoute } from '../auth/ProtectedRoute';
import { OverviewPage } from '../pages/OverviewPage';
import { NotFoundPage } from '../pages/NotFoundPage';

export const router: ReturnType<typeof createBrowserRouter> = createBrowserRouter([
  {
    element: <MainLayout />,
    children: [
      {
        element: <ProtectedRoute />,
        children: [
          {
            element: <DashboardLayout />,
            children: [{ index: true, element: <OverviewPage /> }],
          },
        ],
      },
      { path: '*', element: <NotFoundPage /> },
    ],
  },
]);
