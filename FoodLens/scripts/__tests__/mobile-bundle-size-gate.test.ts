const mobileBundleSizeGate = require('../mobile-bundle-size-gate.js');

describe('mobile-bundle-size-gate', () => {
  const originalMobileBundleSkipExport = process.env['MOBILE_BUNDLE_SKIP_EXPORT'];
  const originalMobileBundleAllowStaleExport = process.env['MOBILE_BUNDLE_ALLOW_STALE_EXPORT'];

  beforeEach(() => {
    delete process.env['MOBILE_BUNDLE_SKIP_EXPORT'];
    delete process.env['MOBILE_BUNDLE_ALLOW_STALE_EXPORT'];
  });

  afterEach(() => {
    if (originalMobileBundleSkipExport === undefined) {
      delete process.env['MOBILE_BUNDLE_SKIP_EXPORT'];
    } else {
      process.env['MOBILE_BUNDLE_SKIP_EXPORT'] = originalMobileBundleSkipExport;
    }

    if (originalMobileBundleAllowStaleExport === undefined) {
      delete process.env['MOBILE_BUNDLE_ALLOW_STALE_EXPORT'];
    } else {
      process.env['MOBILE_BUNDLE_ALLOW_STALE_EXPORT'] = originalMobileBundleAllowStaleExport;
    }
  });

  it('refuses to run against a stale export unless explicitly allowed', () => {
    expect(() => mobileBundleSizeGate.parseArguments(['--skip-export'])).toThrow(
      'Refusing to run bundle size gate against a stale export',
    );
  });

  it('allows an explicit stale export recheck for local diagnostics', () => {
    const options = mobileBundleSizeGate.parseArguments(['--skip-export', '--allow-stale-export']);

    expect(options.skipExport).toBe(true);
    expect(options.allowStaleExport).toBe(true);
  });

  it('refuses stale export mode from environment without the explicit allow flag', () => {
    process.env['MOBILE_BUNDLE_SKIP_EXPORT'] = '1';
    delete process.env['MOBILE_BUNDLE_ALLOW_STALE_EXPORT'];

    expect(() => mobileBundleSizeGate.parseArguments([])).toThrow(
      'Refusing to run bundle size gate against a stale export',
    );
  });

  it('forces a fresh export when required even if stale export environment flags are set', () => {
    process.env['MOBILE_BUNDLE_SKIP_EXPORT'] = '1';
    process.env['MOBILE_BUNDLE_ALLOW_STALE_EXPORT'] = '1';

    const options = mobileBundleSizeGate.parseArguments(['--require-fresh-export']);

    expect(options.skipExport).toBe(false);
    expect(options.allowStaleExport).toBe(false);
    expect(options.requireFreshExport).toBe(true);
  });

  it('rejects conflicting fresh and stale export command line flags', () => {
    expect(() => mobileBundleSizeGate.parseArguments(['--require-fresh-export', '--skip-export'])).toThrow(
      '--require-fresh-export cannot be combined with --skip-export',
    );
  });
});
