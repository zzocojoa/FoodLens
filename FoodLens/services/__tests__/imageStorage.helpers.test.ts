import { createManagedFilename, extractExtension } from '../imageStorage.helpers';

describe('imageStorage.helpers', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('defaults content uri inputs without safe dot extensions to jpg', () => {
    expect(extractExtension('content://com.android.providers.media.documents/document/image:3952')).toBe('jpg');
    expect(extractExtension('ph://7F2C19C2-1A3B-4DC6-96CF-5C4F0C4A1A01')).toBe('jpg');
    expect(extractExtension('assets-library://asset/asset?id=1000000001&ext=JPG')).toBe('jpg');
  });

  it('does not leak content uri separators into managed filenames', () => {
    jest.spyOn(Date, 'now').mockReturnValue(1720000000000);
    jest.spyOn(Math, 'random').mockReturnValue(0.123456789);

    const filename = createManagedFilename(
      'content://com.android.providers.media.documents/document/image:3952',
    );

    expect(filename).toMatch(/^photo_1720000000000_[a-z0-9]{6}\.jpg$/);
    expect(filename).not.toContain(':');
    expect(filename).not.toContain('/');
  });

  it('preserves png and webp extensions for normal filenames and urls', () => {
    expect(extractExtension('/var/mobile/Containers/Data/photo.png')).toBe('png');
    expect(extractExtension('https://cdn.example.com/assets/rendered-image.webp?width=512')).toBe(
      'webp',
    );
  });
});
