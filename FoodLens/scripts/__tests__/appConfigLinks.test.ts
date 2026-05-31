const ORIGINAL_ENV = process.env;

const loadAppConfig = (): Record<string, unknown> => {
  jest.resetModules();
  return require('../../app.config.js') as Record<string, unknown>;
};

describe('app.config OAuth App Links', () => {
  beforeEach(() => {
    jest.resetModules();
    process.env = {
      ...ORIGINAL_ENV,
      APP_VARIANT: 'production',
      EXPO_PUBLIC_GOOGLE_MAPS_API_KEY: 'test-maps-key',
    };
    delete process.env['EXPO_PUBLIC_OAUTH_REDIRECT_BASE_URL'];
  });

  afterAll(() => {
    process.env = ORIGINAL_ENV;
  });

  it('adds iOS Universal Links and Android App Links from the OAuth redirect base URL', () => {
    process.env['EXPO_PUBLIC_OAUTH_REDIRECT_BASE_URL'] = 'https://links.foodlens.example.com';

    const config = loadAppConfig();
    const expo = config['expo'] as Record<string, unknown>;
    const ios = expo['ios'] as Record<string, unknown>;
    const android = expo['android'] as Record<string, unknown>;

    expect(ios['associatedDomains']).toEqual(['applinks:links.foodlens.example.com']);
    expect(android['intentFilters']).toEqual([
      {
        action: 'VIEW',
        autoVerify: true,
        data: [
          {
            scheme: 'https',
            host: 'links.foodlens.example.com',
            pathPrefix: '/oauth/',
          },
        ],
        category: ['BROWSABLE', 'DEFAULT'],
      },
    ]);
    expect(expo['scheme']).toBeUndefined();
  });

  it('omits Universal Links and App Links when the redirect base URL is not configured', () => {
    const config = loadAppConfig();
    const expo = config['expo'] as Record<string, unknown>;
    const ios = expo['ios'] as Record<string, unknown>;
    const android = expo['android'] as Record<string, unknown>;

    expect(ios['associatedDomains']).toBeUndefined();
    expect(android['intentFilters']).toBeUndefined();
    expect(expo['scheme']).toBeUndefined();
  });

  it('keeps the foodlens custom scheme only for development builds', () => {
    process.env['APP_VARIANT'] = 'development';

    const config = loadAppConfig();
    const expo = config['expo'] as Record<string, unknown>;

    expect(expo['scheme']).toBe('foodlens');
  });

  it('rejects non-origin OAuth redirect base URLs', () => {
    process.env['EXPO_PUBLIC_OAUTH_REDIRECT_BASE_URL'] =
      'https://links.foodlens.example.com/oauth/google-callback';

    expect(() => loadAppConfig()).toThrow(
      'EXPO_PUBLIC_OAUTH_REDIRECT_BASE_URL must be an HTTPS origin without credentials, port, path, query, or fragment.'
    );
  });
});
