jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: {
    getItem: jest.fn(),
    setItem: jest.fn(),
    removeItem: jest.fn(),
    getAllKeys: jest.fn(),
    multiGet: jest.fn(),
    clear: jest.fn(),
  },
}));

jest.mock('react-native-mmkv', () => ({
  MMKV: jest.fn().mockImplementation(() => ({
    getBoolean: jest.fn(),
    getString: jest.fn(),
    set: jest.fn(),
    delete: jest.fn(),
    clearAll: jest.fn(),
  })),
}));

import { resolveImageUri } from '../imageStorage_Logic';

describe('resolveImageUri', () => {
  it('keeps external URLs intact', () => {
    const uri = 'https://cdn.example.com/media/render/asset_1?w=512&q=75&fmt=auto&exp=9999999999&sig=abc';
    expect(resolveImageUri(uri)).toBe(uri);
  });

  it('keeps data URL intact', () => {
    const uri = 'data:image/jpeg;base64,Zm9vYmFy';
    expect(resolveImageUri(uri)).toBe(uri);
  });

  it('keeps barcode URI intact', () => {
    const uri = 'barcode://pattern';
    expect(resolveImageUri(uri)).toBe(uri);
  });

  it('expands managed filename references to absolute uri', () => {
    const resolved = resolveImageUri('profile_123.jpg');
    expect(typeof resolved).toBe('string');
    expect(resolved).toContain('profile_123.jpg');
  });
});
