import { AuthApiError } from '@/services/auth/authApi';
import { LOGIN_COPY } from '../../constants/login.constants';
import { loginAuthService } from '../loginAuthService';

jest.mock('@/services/storage', () => ({
  SafeStorage: {
    get: jest.fn(),
    set: jest.fn(),
    remove: jest.fn(),
  },
}));

describe('loginAuthService', () => {
  it('maps OAuth rate limits to retry guidance instead of raw error codes', () => {
    const message = loginAuthService.resolveAuthErrorMessage(
      new AuthApiError('Too many OAuth callback attempts. Try again later.', 'AUTH_RATE_LIMITED', 429),
      LOGIN_COPY
    );

    expect(message).toBe(LOGIN_COPY.providerRateLimited);
    expect(message).not.toContain('AUTH_RATE_LIMITED');
  });
});
