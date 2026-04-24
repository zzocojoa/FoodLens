import { FloatingBottomNavItemKey } from './floatingBottomNav.constants';

export type TopLevelNavRouteDefinition = {
  activeItem: FloatingBottomNavItemKey;
  href: '/(tabs)' | '/history' | '/allergies' | '/profile';
  pathname: '/' | '/history' | '/allergies' | '/profile';
};

export const TOP_LEVEL_NAV_ROUTES: readonly TopLevelNavRouteDefinition[] = [
  {
    activeItem: 'home',
    href: '/(tabs)',
    pathname: '/',
  },
  {
    activeItem: 'allergies',
    href: '/allergies',
    pathname: '/allergies',
  },
  {
    activeItem: 'history',
    href: '/history',
    pathname: '/history',
  },
  {
    activeItem: 'profile',
    href: '/profile',
    pathname: '/profile',
  },
];

export const isTopLevelNavPath = (pathname: string): boolean => {
  return TOP_LEVEL_NAV_ROUTES.some((route) => route.pathname === pathname);
};

export const getTopLevelNavHref = (
  activeItem: FloatingBottomNavItemKey
): '/(tabs)' | '/history' | '/allergies' | '/profile' => {
  const matchedRoute = TOP_LEVEL_NAV_ROUTES.find((route) => route.activeItem === activeItem);

  if (!matchedRoute) {
    throw new Error(`Unknown top-level nav item: ${activeItem}`);
  }

  return matchedRoute.href;
};
