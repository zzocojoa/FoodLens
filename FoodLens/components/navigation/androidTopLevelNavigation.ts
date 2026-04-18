import { isTopLevelNavPath } from './topLevelNavRegistry';

export const ANDROID_TOP_LEVEL_EXIT_WINDOW_MS = 2_000;

export const isAndroidTopLevelRoute = (pathname: string): boolean => {
  return isTopLevelNavPath(pathname);
};

export const shouldExitOnSecondBack = (
  nowMs: number,
  previousBackPressMs: number,
): boolean => {
  if (previousBackPressMs <= 0) {
    return false;
  }

  return nowMs - previousBackPressMs < ANDROID_TOP_LEVEL_EXIT_WINDOW_MS;
};
