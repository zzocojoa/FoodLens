import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as zlib from 'zlib';

const assetImageQualityGate = require('../asset-image-quality-gate.js');

type AssetSeparationPair = {
  primaryPath: string;
  comparisonPath: string;
};

const projectRootDir = path.resolve(__dirname, '..', '..');
const criticalAssetPaths = [
  'assets/images/guide-good.jpg',
  'assets/images/guide-bad.jpg',
  'assets/images/allergens/sesame.png',
];
const assetSeparationPaths = assetImageQualityGate.ICON_SPLASH_SEPARATION_PAIRS.flatMap(
  (pair: AssetSeparationPair): string[] => [pair.primaryPath, pair.comparisonPath]
);
const gateAssetPaths = Array.from(new Set([...criticalAssetPaths, ...assetSeparationPaths]));
const pngCrc32Polynomial = 0xedb88320;

const createTempRoot = (): string => fs.mkdtempSync(path.join(os.tmpdir(), 'foodlens-asset-quality-'));

const cleanupTempRoot = (rootDir: string): void => {
  fs.rmSync(rootDir, { recursive: true, force: true });
};

const copyCriticalAssets = (rootDir: string): void => {
  gateAssetPaths.forEach((assetPath: string) => {
    const sourcePath = path.join(projectRootDir, assetPath);
    const destinationPath = path.join(rootDir, assetPath);
    fs.mkdirSync(path.dirname(destinationPath), { recursive: true });
    fs.copyFileSync(sourcePath, destinationPath);
  });
};

const createPngCrc32Table = (): number[] => {
  const table: number[] = [];
  for (let index = 0; index < 256; index += 1) {
    let value = index;
    for (let bit = 0; bit < 8; bit += 1) {
      value = value & 1 ? pngCrc32Polynomial ^ (value >>> 1) : value >>> 1;
    }
    table.push(value >>> 0);
  }
  return table;
};

const pngCrc32Table = createPngCrc32Table();

const calculatePngCrc32 = (buffer: Buffer): number => {
  let crc = 0xffffffff;
  for (const value of buffer.values()) {
    crc = pngCrc32Table[(crc ^ value) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
};

const createPngChunk = (type: string, data: Buffer): Buffer => {
  const typeBuffer = Buffer.from(type, 'ascii');
  const lengthBuffer = Buffer.alloc(4);
  const crcBuffer = Buffer.alloc(4);
  lengthBuffer.writeUInt32BE(data.length, 0);
  crcBuffer.writeUInt32BE(calculatePngCrc32(Buffer.concat([typeBuffer, data])), 0);
  return Buffer.concat([lengthBuffer, typeBuffer, data, crcBuffer]);
};

const createSolidPng = (colorType: number, pixel: Buffer): Buffer => {
  const width = 8;
  const height = 8;
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = colorType;
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  const rows: Buffer[] = [];
  for (let rowIndex = 0; rowIndex < height; rowIndex += 1) {
    const row = Buffer.alloc(1 + width * pixel.length);
    row[0] = 0;
    for (let columnIndex = 0; columnIndex < width; columnIndex += 1) {
      pixel.copy(row, 1 + columnIndex * pixel.length);
    }
    rows.push(row);
  }

  return Buffer.concat([
    Buffer.from('89504e470d0a1a0a', 'hex'),
    createPngChunk('IHDR', ihdr),
    createPngChunk('IDAT', zlib.deflateSync(Buffer.concat(rows))),
    createPngChunk('IEND', Buffer.alloc(0)),
  ]);
};

const corruptFirstPngDataChunk = (buffer: Buffer): Buffer => {
  const corruptedBuffer = Buffer.from(buffer);
  let offset = 8;
  while (offset + 12 <= corruptedBuffer.length) {
    const chunkLength = corruptedBuffer.readUInt32BE(offset);
    const chunkType = corruptedBuffer.subarray(offset + 4, offset + 8).toString('ascii');
    if (chunkType === 'IDAT' && chunkLength > 0) {
      corruptedBuffer[offset + 8] = corruptedBuffer[offset + 8] ^ 0xff;
      return corruptedBuffer;
    }
    offset += 12 + chunkLength;
  }
  throw new Error('IDAT chunk was not found');
};

const createJpegPayloadRegression = (buffer: Buffer): Buffer => {
  const mutatedBuffer = Buffer.from(buffer);
  let offset = 2;
  while (offset + 4 < mutatedBuffer.length) {
    if (mutatedBuffer[offset] !== 0xff) {
      offset += 1;
      continue;
    }

    const marker = mutatedBuffer[offset + 1];
    if (marker === 0xda) {
      const segmentLength = mutatedBuffer.readUInt16BE(offset + 2);
      const payloadStart = offset + 2 + segmentLength;
      const payloadEnd = mutatedBuffer.length - 2;
      if (payloadStart >= payloadEnd) {
        throw new Error('JPEG scan payload is empty');
      }
      const mutationOffset = payloadStart + Math.floor((payloadEnd - payloadStart) / 2);
      mutatedBuffer[mutationOffset] = mutatedBuffer[mutationOffset] ^ 0x01;
      return mutatedBuffer;
    }

    if (marker === 0xd9) {
      break;
    }

    const segmentLength = mutatedBuffer.readUInt16BE(offset + 2);
    offset += 2 + segmentLength;
  }
  throw new Error('JPEG scan payload was not found');
};

describe('asset-image-quality-gate', () => {
  it('keeps compressed critical images inside the reviewed quality envelope', () => {
    const result = assetImageQualityGate.runAssetImageQualityGate(projectRootDir);

    expect(result.failures).toEqual([]);
    expect(result.ok).toBe(true);
    expect(result.results.map((entry: { asset: { path: string } }) => entry.asset.path)).toEqual([
      'assets/images/guide-good.jpg',
      'assets/images/guide-bad.jpg',
      'assets/images/allergens/sesame.png',
    ]);
    expect(
      result.separationResults.map(
        (entry: { pair: AssetSeparationPair }): [string, string] => [
          entry.pair.primaryPath,
          entry.pair.comparisonPath,
        ]
      )
    ).toEqual([
      ['assets/images/splash-icon.png', 'assets/images/icon.png'],
      ['assets/images/splash-icon.png', 'assets/images/ios-icon.png'],
      ['assets/images/splash-icon.png', 'assets/images/android-icon-background.png'],
      ['assets/images/splash-icon.png', 'assets/images/android-icon-foreground.png'],
    ]);
    expect(
      result.transparentRgbResults.map((entry: { asset: { path: string } }) => entry.asset.path)
    ).toEqual(['assets/images/splash-icon.png']);
  });

  it('rejects a splash asset that reuses launcher icon bytes', () => {
    const rootDir = createTempRoot();

    try {
      copyCriticalAssets(rootDir);
      fs.copyFileSync(
        path.join(rootDir, 'assets/images/android-icon-background.png'),
        path.join(rootDir, 'assets/images/splash-icon.png')
      );

      const result = assetImageQualityGate.runAssetImageQualityGate(rootDir);
      const separationFailure = result.failures.find(
        (entry: { pair?: AssetSeparationPair }): boolean =>
          entry.pair?.comparisonPath === 'assets/images/android-icon-background.png'
      );

      expect(result.ok).toBe(false);
      if (!separationFailure) {
        throw new Error('expected splash/icon separation failure');
      }
      expect(separationFailure.errors.join(' ')).toContain(
        'assets/images/splash-icon.png must not reuse assets/images/android-icon-background.png'
      );
    } finally {
      cleanupTempRoot(rootDir);
    }
  });

  it('rejects a splash asset with hidden RGB data in transparent pixels', () => {
    const rootDir = createTempRoot();

    try {
      copyCriticalAssets(rootDir);
      fs.writeFileSync(
        path.join(rootDir, 'assets/images/splash-icon.png'),
        createSolidPng(6, Buffer.from([255, 255, 255, 0]))
      );

      const result = assetImageQualityGate.runAssetImageQualityGate(rootDir);
      const transparentRgbFailure = result.failures.find(
        (entry: { asset?: { path: string } }): boolean =>
          entry.asset?.path === 'assets/images/splash-icon.png'
      );

      expect(result.ok).toBe(false);
      if (!transparentRgbFailure) {
        throw new Error('expected transparent RGB failure');
      }
      expect(transparentRgbFailure.errors.join(' ')).toContain(
        'transparent pixels with hidden RGB data'
      );
    } finally {
      cleanupTempRoot(rootDir);
    }
  });

  it('rejects a PNG that has matching dimensions but a corrupt chunk layout', () => {
    const rootDir = createTempRoot();

    try {
      copyCriticalAssets(rootDir);
      const sesamePath = path.join(rootDir, 'assets/images/allergens/sesame.png');
      const sesameBuffer = fs.readFileSync(sesamePath);
      sesameBuffer.write('JHDR', 12, 'ascii');
      fs.writeFileSync(sesamePath, sesameBuffer);

      const result = assetImageQualityGate.runAssetImageQualityGate(rootDir);

      expect(result.ok).toBe(false);
      expect(result.failures).toHaveLength(1);
      expect(result.failures[0].asset.path).toBe('assets/images/allergens/sesame.png');
      expect(result.failures[0].errors.join(' ')).toContain('PNG IHDR chunk is missing or invalid');
    } finally {
      cleanupTempRoot(rootDir);
    }
  });

  it('rejects a PNG that has matching dimensions but corrupt payload bytes', () => {
    const rootDir = createTempRoot();

    try {
      copyCriticalAssets(rootDir);
      const sesamePath = path.join(rootDir, 'assets/images/allergens/sesame.png');
      const sesameBuffer = fs.readFileSync(sesamePath);
      fs.writeFileSync(sesamePath, corruptFirstPngDataChunk(sesameBuffer));

      const result = assetImageQualityGate.runAssetImageQualityGate(rootDir);

      expect(result.ok).toBe(false);
      expect(result.failures).toHaveLength(1);
      expect(result.failures[0].asset.path).toBe('assets/images/allergens/sesame.png');
      expect(result.failures[0].errors.join(' ')).toContain('PNG chunk CRC mismatch');
    } finally {
      cleanupTempRoot(rootDir);
    }
  });

  it('keeps PNG decoded hashes stable across RGB and RGBA recompression', () => {
    const rgbPng = createSolidPng(2, Buffer.from([44, 122, 203]));
    const rgbaPng = createSolidPng(6, Buffer.from([44, 122, 203, 255]));

    const rgbFingerprint = assetImageQualityGate.createImageFingerprint(rgbPng, 'png');
    const rgbaFingerprint = assetImageQualityGate.createImageFingerprint(rgbaPng, 'png');

    expect(rgbFingerprint).toEqual(rgbaFingerprint);
  });

  it('rejects incomplete golden fingerprint updates', () => {
    const actualFingerprint = {
      kind: 'png-pixel-v1',
      decodedHash: 'decoded',
      luminanceHash: 'luminance',
      alphaHash: 'alpha',
    };
    const expectedFingerprint = {
      kind: 'png-pixel-v1',
      decodedHash: 'decoded',
    };

    expect(assetImageQualityGate.compareImageFingerprint(actualFingerprint, expectedFingerprint)).toEqual([
      'expected fingerprint missing required fields: alphaHash, luminanceHash',
    ]);
  });

  it('rejects a JPEG that has matching metadata but no end-of-image marker', () => {
    const rootDir = createTempRoot();

    try {
      copyCriticalAssets(rootDir);
      const guidePath = path.join(rootDir, 'assets/images/guide-good.jpg');
      const guideBuffer = fs.readFileSync(guidePath);
      guideBuffer[guideBuffer.length - 2] = 0x00;
      guideBuffer[guideBuffer.length - 1] = 0x00;
      fs.writeFileSync(guidePath, guideBuffer);

      const result = assetImageQualityGate.runAssetImageQualityGate(rootDir);

      expect(result.ok).toBe(false);
      expect(result.failures).toHaveLength(1);
      expect(result.failures[0].asset.path).toBe('assets/images/guide-good.jpg');
      expect(result.failures[0].errors.join(' ')).toContain('JPEG end-of-image marker was not found');
    } finally {
      cleanupTempRoot(rootDir);
    }
  });

  it('rejects a JPEG payload regression that preserves dimensions and file size', () => {
    const rootDir = createTempRoot();

    try {
      copyCriticalAssets(rootDir);
      const guidePath = path.join(rootDir, 'assets/images/guide-good.jpg');
      const guideBuffer = fs.readFileSync(guidePath);
      fs.writeFileSync(guidePath, createJpegPayloadRegression(guideBuffer));

      const result = assetImageQualityGate.runAssetImageQualityGate(rootDir);

      expect(fs.statSync(guidePath).size).toBe(guideBuffer.length);
      expect(result.ok).toBe(false);
      expect(result.failures).toHaveLength(1);
      expect(result.failures[0].asset.path).toBe('assets/images/guide-good.jpg');
    } finally {
      cleanupTempRoot(rootDir);
    }
  });

  it('rejects images outside the reviewed file size envelope', () => {
    const rootDir = createTempRoot();

    try {
      copyCriticalAssets(rootDir);
      const guidePath = path.join(rootDir, 'assets/images/guide-good.jpg');
      const guideBuffer = fs.readFileSync(guidePath);
      const oversizedBuffer = Buffer.concat([
        guideBuffer.subarray(0, guideBuffer.length - 2),
        Buffer.alloc(400 * 1024),
        guideBuffer.subarray(guideBuffer.length - 2),
      ]);
      fs.writeFileSync(guidePath, oversizedBuffer);

      const result = assetImageQualityGate.runAssetImageQualityGate(rootDir);

      expect(result.ok).toBe(false);
      expect(result.failures).toHaveLength(1);
      expect(result.failures[0].asset.path).toBe('assets/images/guide-good.jpg');
      expect(result.failures[0].errors.join(' ')).toContain('is above');
    } finally {
      cleanupTempRoot(rootDir);
    }
  });
});
