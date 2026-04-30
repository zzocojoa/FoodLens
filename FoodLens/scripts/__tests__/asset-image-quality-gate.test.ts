import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

const assetImageQualityGate = require('../asset-image-quality-gate.js');

const projectRootDir = path.resolve(__dirname, '..', '..');
const criticalAssetPaths = [
  'assets/images/guide-good.jpg',
  'assets/images/guide-bad.jpg',
  'assets/images/allergens/sesame.png',
];

const createTempRoot = (): string => fs.mkdtempSync(path.join(os.tmpdir(), 'foodlens-asset-quality-'));

const cleanupTempRoot = (rootDir: string): void => {
  fs.rmSync(rootDir, { recursive: true, force: true });
};

const copyCriticalAssets = (rootDir: string): void => {
  criticalAssetPaths.forEach((assetPath: string) => {
    const sourcePath = path.join(projectRootDir, assetPath);
    const destinationPath = path.join(rootDir, assetPath);
    fs.mkdirSync(path.dirname(destinationPath), { recursive: true });
    fs.copyFileSync(sourcePath, destinationPath);
  });
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
