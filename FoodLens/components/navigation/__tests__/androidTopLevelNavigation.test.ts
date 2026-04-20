import {
  isAndroidTopLevelRoute,
  shouldUseAndroidExitFlow,
  shouldExitOnSecondBack,
} from '../androidTopLevelNavigation';

describe('androidTopLevelNavigation', () => {
  it('matches only top-level floating-nav routes', () => {
    expect(isAndroidTopLevelRoute('/')).toBe(true);
    expect(isAndroidTopLevelRoute('/history')).toBe(true);
    expect(isAndroidTopLevelRoute('/allergies')).toBe(true);
    expect(isAndroidTopLevelRoute('/profile')).toBe(true);
    expect(isAndroidTopLevelRoute('/result')).toBe(false);
    expect(isAndroidTopLevelRoute('/scan/camera')).toBe(false);
  });

  it('requires a second back press inside the exit window', () => {
    expect(shouldExitOnSecondBack(2_500, 0)).toBe(false);
    expect(shouldExitOnSecondBack(2_500, 700)).toBe(true);
    expect(shouldExitOnSecondBack(5_000, 2_000)).toBe(false);
  });

  it('uses exit flow only when the route is top-level and there is no back stack', () => {
    expect(shouldUseAndroidExitFlow('/history', false)).toBe(true);
    expect(shouldUseAndroidExitFlow('/history', true)).toBe(false);
    expect(shouldUseAndroidExitFlow('/trip-stats', true)).toBe(false);
    expect(shouldUseAndroidExitFlow('/result', false)).toBe(false);
  });
});
