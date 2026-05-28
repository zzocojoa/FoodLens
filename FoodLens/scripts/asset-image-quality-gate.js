#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const zlib = require('zlib');

const KiB_BYTES = 1024;
const ROOT_DIR = path.resolve(__dirname, '..');
const PNG_SIGNATURE_HEX = '89504e470d0a1a0a';
const PNG_IHDR_LENGTH = 13;
const PNG_MINIMUM_BYTES = 45;
const JPEG_END_OF_IMAGE_MARKER = 0xd9;
const PNG_CRC32_POLYNOMIAL = 0xedb88320;
const PNG_PERCEPTUAL_GRID_SIZE = 8;
const FINGERPRINT_KEYS_BY_KIND = {
  'jpeg-scan-v1': ['kind', 'quantizationHash', 'scanHash', 'scanHistogramHash'],
  'png-pixel-v1': ['kind', 'decodedHash', 'luminanceHash', 'alphaHash'],
};
const CRITICAL_ASSETS = [
  {
    path: 'assets/images/guide-good.jpg',
    format: 'jpeg',
    width: 1024,
    height: 1024,
    minBytes: 180 * KiB_BYTES,
    maxBytes: 600 * KiB_BYTES,
    fingerprint: {
      kind: 'jpeg-scan-v1',
      quantizationHash: '8423b202e68ddf4404fecda87fa3abc7de552d38ae396b5b300577783f6ca099',
      scanHash: 'fbaf55f338b6007216a5cf8cc1c6f12e57e2c5eec9108f502e923c6079be1670',
      scanHistogramHash: '6882f5f37e832aea1496f84d21d9e5d71c9ff8f24b63362e5b204ea14dce51c9',
    },
  },
  {
    path: 'assets/images/guide-bad.jpg',
    format: 'jpeg',
    width: 1024,
    height: 1024,
    minBytes: 250 * KiB_BYTES,
    maxBytes: 700 * KiB_BYTES,
    fingerprint: {
      kind: 'jpeg-scan-v1',
      quantizationHash: '8423b202e68ddf4404fecda87fa3abc7de552d38ae396b5b300577783f6ca099',
      scanHash: '09c8a6195ac5f9f71b1bcd9a286a82b77fab59a1ea7bfcf727c9d30bd168b06c',
      scanHistogramHash: 'ac319e2229ae90dff436337b01a8123140a4241eae6be488d390de586f1e4a95',
    },
  },
  {
    path: 'assets/images/allergens/sesame.png',
    format: 'png',
    width: 1024,
    height: 1024,
    minBytes: 250 * KiB_BYTES,
    maxBytes: 700 * KiB_BYTES,
    fingerprint: {
      kind: 'png-pixel-v1',
      decodedHash: '478d435b7564870de6790e66ab89553f3ec21c15c402508f4fa750ccf4cb3f90',
      luminanceHash: '00001c7e7e300000',
      alphaHash: '00001c3e7e300000',
    },
  },
];
const ICON_SPLASH_SEPARATION_PAIRS = [
  {
    primaryPath: 'assets/images/splash-icon.png',
    comparisonPath: 'assets/images/icon.png',
  },
  {
    primaryPath: 'assets/images/splash-icon.png',
    comparisonPath: 'assets/images/ios-icon.png',
  },
  {
    primaryPath: 'assets/images/splash-icon.png',
    comparisonPath: 'assets/images/android-icon-background.png',
  },
  {
    primaryPath: 'assets/images/splash-icon.png',
    comparisonPath: 'assets/images/android-icon-foreground.png',
  },
];
const TRANSPARENT_RGB_ASSETS = [
  {
    path: 'assets/images/splash-icon.png',
    format: 'png',
    maxHiddenRgbPixels: 0,
  },
];

const createCrc32Table = () => {
  const table = [];
  for (let index = 0; index < 256; index += 1) {
    let value = index;
    for (let bit = 0; bit < 8; bit += 1) {
      value = value & 1 ? PNG_CRC32_POLYNOMIAL ^ (value >>> 1) : value >>> 1;
    }
    table.push(value >>> 0);
  }
  return table;
};

const PNG_CRC32_TABLE = createCrc32Table();

const hashBuffer = (buffer) => crypto.createHash('sha256').update(buffer).digest('hex');

const calculateCrc32 = (buffer, startOffset, endOffset) => {
  let crc = 0xffffffff;
  for (let offset = startOffset; offset < endOffset; offset += 1) {
    crc = PNG_CRC32_TABLE[(crc ^ buffer[offset]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
};

const readPngMetadata = (buffer) => {
  if (buffer.length < PNG_MINIMUM_BYTES) {
    throw new Error('PNG header is incomplete');
  }

  const signature = buffer.subarray(0, 8).toString('hex');
  if (signature !== PNG_SIGNATURE_HEX) {
    throw new Error('PNG signature mismatch');
  }

  const ihdrLength = buffer.readUInt32BE(8);
  const ihdrType = buffer.subarray(12, 16).toString('ascii');
  if (ihdrLength !== PNG_IHDR_LENGTH || ihdrType !== 'IHDR') {
    throw new Error('PNG IHDR chunk is missing or invalid');
  }

  const chunks = [];
  let offset = 8;
  let foundImageEnd = false;
  while (offset < buffer.length) {
    if (offset + 12 > buffer.length) {
      throw new Error(`PNG chunk header is incomplete at offset ${offset}`);
    }

    const chunkLength = buffer.readUInt32BE(offset);
    const chunkType = buffer.subarray(offset + 4, offset + 8).toString('ascii');
    const chunkEndOffset = offset + 12 + chunkLength;
    if (chunkEndOffset > buffer.length) {
      throw new Error(`PNG chunk is incomplete at offset ${offset}`);
    }

    const storedCrc = buffer.readUInt32BE(offset + 8 + chunkLength);
    const calculatedCrc = calculateCrc32(buffer, offset + 4, offset + 8 + chunkLength);
    if (storedCrc !== calculatedCrc) {
      throw new Error(`PNG chunk CRC mismatch at offset ${offset}`);
    }

    chunks.push({
      type: chunkType,
      dataOffset: offset + 8,
      dataLength: chunkLength,
    });

    offset = chunkEndOffset;
    if (chunkType === 'IEND') {
      foundImageEnd = true;
      break;
    }
  }

  if (!foundImageEnd) {
    throw new Error('PNG IEND chunk was not found');
  }

  if (offset !== buffer.length) {
    throw new Error('PNG has trailing bytes after IEND');
  }

  return {
    width: buffer.readUInt32BE(16),
    height: buffer.readUInt32BE(20),
    bitDepth: buffer[24],
    colorType: buffer[25],
    compressionMethod: buffer[26],
    filterMethod: buffer[27],
    interlaceMethod: buffer[28],
    chunks,
  };
};

const readPngDimensions = (buffer) => {
  const metadata = readPngMetadata(buffer);
  return {
    width: metadata.width,
    height: metadata.height,
  };
};

const getPngBytesPerPixel = (metadata) => {
  if (metadata.bitDepth !== 8) {
    throw new Error(`Unsupported PNG bit depth for pixel fingerprint: ${metadata.bitDepth}`);
  }
  if (metadata.colorType === 0) {
    return 1;
  }
  if (metadata.colorType === 2) {
    return 3;
  }
  if (metadata.colorType === 4) {
    return 2;
  }
  if (metadata.colorType === 6) {
    return 4;
  }
  throw new Error(`Unsupported PNG color type for pixel fingerprint: ${metadata.colorType}`);
};

const paethPredictor = (left, up, upLeft) => {
  const estimate = left + up - upLeft;
  const leftDistance = Math.abs(estimate - left);
  const upDistance = Math.abs(estimate - up);
  const upLeftDistance = Math.abs(estimate - upLeft);
  if (leftDistance <= upDistance && leftDistance <= upLeftDistance) {
    return left;
  }
  if (upDistance <= upLeftDistance) {
    return up;
  }
  return upLeft;
};

const unfilterPngScanlines = (inflated, metadata, bytesPerPixel) => {
  const rowLength = metadata.width * bytesPerPixel;
  const expectedLength = (rowLength + 1) * metadata.height;
  if (inflated.length !== expectedLength) {
    throw new Error(`PNG inflated payload length ${inflated.length} does not match expected ${expectedLength}`);
  }

  const output = Buffer.alloc(rowLength * metadata.height);
  for (let rowIndex = 0; rowIndex < metadata.height; rowIndex += 1) {
    const sourceOffset = rowIndex * (rowLength + 1);
    const targetOffset = rowIndex * rowLength;
    const filterType = inflated[sourceOffset];
    const previousOffset = rowIndex > 0 ? targetOffset - rowLength : -1;

    for (let columnOffset = 0; columnOffset < rowLength; columnOffset += 1) {
      const rawValue = inflated[sourceOffset + 1 + columnOffset];
      const left = columnOffset >= bytesPerPixel ? output[targetOffset + columnOffset - bytesPerPixel] : 0;
      const up = previousOffset >= 0 ? output[previousOffset + columnOffset] : 0;
      const upLeft = previousOffset >= 0 && columnOffset >= bytesPerPixel
        ? output[previousOffset + columnOffset - bytesPerPixel]
        : 0;

      if (filterType === 0) {
        output[targetOffset + columnOffset] = rawValue;
      } else if (filterType === 1) {
        output[targetOffset + columnOffset] = (rawValue + left) & 0xff;
      } else if (filterType === 2) {
        output[targetOffset + columnOffset] = (rawValue + up) & 0xff;
      } else if (filterType === 3) {
        output[targetOffset + columnOffset] = (rawValue + Math.floor((left + up) / 2)) & 0xff;
      } else if (filterType === 4) {
        output[targetOffset + columnOffset] = (rawValue + paethPredictor(left, up, upLeft)) & 0xff;
      } else {
        throw new Error(`Unsupported PNG filter type ${filterType} at row ${rowIndex}`);
      }
    }
  }
  return output;
};

const readPngPixelData = (buffer) => {
  const metadata = readPngMetadata(buffer);
  if (metadata.compressionMethod !== 0 || metadata.filterMethod !== 0 || metadata.interlaceMethod !== 0) {
    throw new Error('Unsupported PNG compression, filter, or interlace method for pixel fingerprint');
  }

  const idatBuffers = metadata.chunks
    .filter((chunk) => chunk.type === 'IDAT')
    .map((chunk) => buffer.subarray(chunk.dataOffset, chunk.dataOffset + chunk.dataLength));
  if (idatBuffers.length === 0) {
    throw new Error('PNG IDAT chunk was not found');
  }

  const bytesPerPixel = getPngBytesPerPixel(metadata);
  const inflated = zlib.inflateSync(Buffer.concat(idatBuffers));
  const pixelData = unfilterPngScanlines(inflated, metadata, bytesPerPixel);
  return {
    metadata,
    bytesPerPixel,
    pixelData,
  };
};

const readPngPixel = (pixelData, metadata, bytesPerPixel, x, y) => {
  const offset = (y * metadata.width + x) * bytesPerPixel;
  if (metadata.colorType === 0) {
    const gray = pixelData[offset];
    return { red: gray, green: gray, blue: gray, alpha: 255 };
  }
  if (metadata.colorType === 2) {
    return {
      red: pixelData[offset],
      green: pixelData[offset + 1],
      blue: pixelData[offset + 2],
      alpha: 255,
    };
  }
  if (metadata.colorType === 4) {
    const gray = pixelData[offset];
    return {
      red: gray,
      green: gray,
      blue: gray,
      alpha: pixelData[offset + 1],
    };
  }
  if (metadata.colorType === 6) {
    return {
      red: pixelData[offset],
      green: pixelData[offset + 1],
      blue: pixelData[offset + 2],
      alpha: pixelData[offset + 3],
    };
  }
  throw new Error(`Unsupported PNG color type for pixel read: ${metadata.colorType}`);
};

const calculatePngAverageHashes = (pixelData, metadata, bytesPerPixel) => {
  const luminanceCells = [];
  const alphaCells = [];
  for (let gridY = 0; gridY < PNG_PERCEPTUAL_GRID_SIZE; gridY += 1) {
    for (let gridX = 0; gridX < PNG_PERCEPTUAL_GRID_SIZE; gridX += 1) {
      const startX = Math.floor((gridX * metadata.width) / PNG_PERCEPTUAL_GRID_SIZE);
      const endX = Math.floor(((gridX + 1) * metadata.width) / PNG_PERCEPTUAL_GRID_SIZE);
      const startY = Math.floor((gridY * metadata.height) / PNG_PERCEPTUAL_GRID_SIZE);
      const endY = Math.floor(((gridY + 1) * metadata.height) / PNG_PERCEPTUAL_GRID_SIZE);
      let luminanceTotal = 0;
      let alphaTotal = 0;
      let pixelCount = 0;

      for (let y = startY; y < endY; y += 1) {
        for (let x = startX; x < endX; x += 1) {
          const pixel = readPngPixel(pixelData, metadata, bytesPerPixel, x, y);
          luminanceTotal += (pixel.red * 299 + pixel.green * 587 + pixel.blue * 114) / 1000;
          alphaTotal += pixel.alpha;
          pixelCount += 1;
        }
      }

      luminanceCells.push(luminanceTotal / pixelCount);
      alphaCells.push(alphaTotal / pixelCount);
    }
  }

  const buildAverageHash = (cells) => {
    const average = cells.reduce((total, value) => total + value, 0) / cells.length;
    let bits = 0n;
    cells.forEach((value) => {
      bits = (bits << 1n) | (value >= average ? 1n : 0n);
    });
    return bits.toString(16).padStart(16, '0');
  };

  return {
    luminanceHash: buildAverageHash(luminanceCells),
    alphaHash: buildAverageHash(alphaCells),
  };
};

const normalizePngPixelData = (pixelData, metadata, bytesPerPixel) => {
  const normalizedPixelData = Buffer.alloc(metadata.width * metadata.height * 4);
  for (let y = 0; y < metadata.height; y += 1) {
    for (let x = 0; x < metadata.width; x += 1) {
      const pixel = readPngPixel(pixelData, metadata, bytesPerPixel, x, y);
      const offset = (y * metadata.width + x) * 4;
      normalizedPixelData[offset] = pixel.red;
      normalizedPixelData[offset + 1] = pixel.green;
      normalizedPixelData[offset + 2] = pixel.blue;
      normalizedPixelData[offset + 3] = pixel.alpha;
    }
  }
  return normalizedPixelData;
};

const isJpegStartOfFrameMarker = (marker) =>
  (marker >= 0xc0 && marker <= 0xc3) ||
  (marker >= 0xc5 && marker <= 0xc7) ||
  (marker >= 0xc9 && marker <= 0xcb) ||
  (marker >= 0xcd && marker <= 0xcf);

const readJpegDimensions = (buffer) => {
  if (buffer.length < 4 || buffer[0] !== 0xff || buffer[1] !== 0xd8) {
    throw new Error('JPEG signature mismatch');
  }

  if (buffer[buffer.length - 2] !== 0xff || buffer[buffer.length - 1] !== JPEG_END_OF_IMAGE_MARKER) {
    throw new Error('JPEG end-of-image marker was not found');
  }

  let offset = 2;
  while (offset < buffer.length) {
    if (buffer[offset] !== 0xff) {
      offset += 1;
      continue;
    }

    const marker = buffer[offset + 1];
    if (marker === 0xd9 || marker === 0xda) {
      break;
    }

    if (offset + 4 > buffer.length) {
      throw new Error(`JPEG segment header is incomplete at offset ${offset}`);
    }

    const segmentLength = buffer.readUInt16BE(offset + 2);
    if (segmentLength < 2) {
      throw new Error(`Invalid JPEG segment length at offset ${offset}`);
    }

    if (offset + 2 + segmentLength > buffer.length) {
      throw new Error(`JPEG segment is incomplete at offset ${offset}`);
    }

    if (isJpegStartOfFrameMarker(marker)) {
      if (segmentLength < 8) {
        throw new Error(`JPEG start-of-frame segment is incomplete at offset ${offset}`);
      }

      return {
        width: buffer.readUInt16BE(offset + 7),
        height: buffer.readUInt16BE(offset + 5),
      };
    }

    offset += 2 + segmentLength;
  }

  throw new Error('JPEG dimensions were not found');
};

const readJpegFingerprintData = (buffer) => {
  if (buffer.length < 4 || buffer[0] !== 0xff || buffer[1] !== 0xd8) {
    throw new Error('JPEG signature mismatch');
  }
  if (buffer[buffer.length - 2] !== 0xff || buffer[buffer.length - 1] !== JPEG_END_OF_IMAGE_MARKER) {
    throw new Error('JPEG end-of-image marker was not found');
  }

  const quantizationTables = [];
  let offset = 2;
  while (offset < buffer.length) {
    if (buffer[offset] !== 0xff) {
      offset += 1;
      continue;
    }
    const marker = buffer[offset + 1];
    if (marker === 0xd9) {
      break;
    }
    if (offset + 4 > buffer.length) {
      throw new Error(`JPEG segment header is incomplete at offset ${offset}`);
    }
    const segmentLength = buffer.readUInt16BE(offset + 2);
    if (segmentLength < 2) {
      throw new Error(`Invalid JPEG segment length at offset ${offset}`);
    }
    if (offset + 2 + segmentLength > buffer.length) {
      throw new Error(`JPEG segment is incomplete at offset ${offset}`);
    }

    const segmentDataStart = offset + 4;
    const segmentDataEnd = offset + 2 + segmentLength;
    if (marker === 0xdb) {
      quantizationTables.push(buffer.subarray(segmentDataStart, segmentDataEnd));
    }
    if (marker === 0xda) {
      return {
        quantizationTables,
        scanData: buffer.subarray(segmentDataEnd, buffer.length - 2),
      };
    }

    offset += 2 + segmentLength;
  }

  throw new Error('JPEG scan payload was not found');
};

const createByteHistogramHash = (buffer) => {
  const buckets = Buffer.alloc(16 * 4);
  for (const value of buffer.values()) {
    const bucketIndex = Math.floor(value / 16);
    const offset = bucketIndex * 4;
    buckets.writeUInt32BE(buckets.readUInt32BE(offset) + 1, offset);
  }
  return hashBuffer(buckets);
};

const createPngFingerprint = (buffer) => {
  const { metadata, bytesPerPixel, pixelData } = readPngPixelData(buffer);
  const normalizedPixelData = normalizePngPixelData(pixelData, metadata, bytesPerPixel);
  const averageHashes = calculatePngAverageHashes(pixelData, metadata, bytesPerPixel);
  return {
    kind: 'png-pixel-v1',
    decodedHash: hashBuffer(normalizedPixelData),
    luminanceHash: averageHashes.luminanceHash,
    alphaHash: averageHashes.alphaHash,
  };
};

const createJpegFingerprint = (buffer) => {
  const fingerprintData = readJpegFingerprintData(buffer);
  return {
    kind: 'jpeg-scan-v1',
    quantizationHash: hashBuffer(Buffer.concat(fingerprintData.quantizationTables)),
    scanHash: hashBuffer(fingerprintData.scanData),
    scanHistogramHash: createByteHistogramHash(fingerprintData.scanData),
  };
};

const createImageFingerprint = (buffer, format) => {
  if (format === 'png') {
    return createPngFingerprint(buffer);
  }
  if (format === 'jpeg') {
    return createJpegFingerprint(buffer);
  }
  throw new Error(`Unsupported image format for fingerprint: ${format}`);
};

const compareFingerprintSchema = (fingerprint, label) => {
  const requiredKeys = FINGERPRINT_KEYS_BY_KIND[fingerprint.kind];
  if (!requiredKeys) {
    return [`${label} fingerprint kind ${fingerprint.kind} is not supported`];
  }

  const actualKeys = Object.keys(fingerprint).sort((left, right) => left.localeCompare(right));
  const expectedKeys = requiredKeys.slice().sort((left, right) => left.localeCompare(right));
  const missingKeys = expectedKeys.filter((key) => !actualKeys.includes(key));
  const unexpectedKeys = actualKeys.filter((key) => !expectedKeys.includes(key));
  const errors = [];
  if (missingKeys.length > 0) {
    errors.push(`${label} fingerprint missing required fields: ${missingKeys.join(', ')}`);
  }
  if (unexpectedKeys.length > 0) {
    errors.push(`${label} fingerprint has unexpected fields: ${unexpectedKeys.join(', ')}`);
  }
  return errors;
};

const compareImageFingerprint = (actualFingerprint, expectedFingerprint) => {
  if (!expectedFingerprint) {
    return [];
  }
  const expectedSchemaErrors = compareFingerprintSchema(expectedFingerprint, 'expected');
  if (expectedSchemaErrors.length > 0) {
    return expectedSchemaErrors;
  }
  if (actualFingerprint.kind !== expectedFingerprint.kind) {
    return [`fingerprint kind ${actualFingerprint.kind}, expected ${expectedFingerprint.kind}`];
  }
  const actualSchemaErrors = compareFingerprintSchema(actualFingerprint, 'actual');
  if (actualSchemaErrors.length > 0) {
    return actualSchemaErrors;
  }
  return FINGERPRINT_KEYS_BY_KIND[expectedFingerprint.kind]
    .filter((key) => actualFingerprint[key] !== expectedFingerprint[key])
    .map((key) => `fingerprint ${key} mismatch`);
};

const readImageDimensions = (buffer, format) => {
  if (format === 'png') {
    return readPngDimensions(buffer);
  }
  if (format === 'jpeg') {
    return readJpegDimensions(buffer);
  }
  throw new Error(`Unsupported image format: ${format}`);
};

const createAssetResult = (asset, rootDir) => {
  const assetPath = path.join(rootDir, asset.path);
  if (!fs.existsSync(assetPath)) {
    return {
      asset,
      ok: false,
      errors: [`missing asset: ${asset.path}`],
    };
  }

  const buffer = fs.readFileSync(assetPath);
  let dimensions;
  try {
    dimensions = readImageDimensions(buffer, asset.format);
  } catch (error) {
    return {
      asset,
      ok: false,
      bytes: buffer.length,
      errors: [`invalid image metadata: ${error.message}`],
    };
  }

  const errors = [];
  let fingerprint;
  try {
    fingerprint = createImageFingerprint(buffer, asset.format);
    errors.push(...compareImageFingerprint(fingerprint, asset.fingerprint));
  } catch (error) {
    errors.push(`invalid image fingerprint: ${error.message}`);
  }

  if (dimensions.width !== asset.width || dimensions.height !== asset.height) {
    errors.push(
      `dimensions ${dimensions.width}x${dimensions.height}, expected ${asset.width}x${asset.height}`
    );
  }

  if (buffer.length < asset.minBytes) {
    errors.push(`file size ${buffer.length} bytes is below ${asset.minBytes} bytes`);
  }

  if (buffer.length > asset.maxBytes) {
    errors.push(`file size ${buffer.length} bytes is above ${asset.maxBytes} bytes`);
  }

  return {
    asset,
    ok: errors.length === 0,
    dimensions,
    fingerprint,
    bytes: buffer.length,
    errors,
  };
};

const createAssetSeparationResult = (pair, rootDir) => {
  const primaryAbsolutePath = path.join(rootDir, pair.primaryPath);
  const comparisonAbsolutePath = path.join(rootDir, pair.comparisonPath);
  const errors = [];

  if (!fs.existsSync(primaryAbsolutePath)) {
    errors.push(`missing asset: ${pair.primaryPath}`);
  }

  if (!fs.existsSync(comparisonAbsolutePath)) {
    errors.push(`missing asset: ${pair.comparisonPath}`);
  }

  if (errors.length > 0) {
    return {
      asset: { path: pair.primaryPath },
      pair,
      ok: false,
      errors,
    };
  }

  const primaryHash = hashBuffer(fs.readFileSync(primaryAbsolutePath));
  const comparisonHash = hashBuffer(fs.readFileSync(comparisonAbsolutePath));
  if (primaryHash === comparisonHash) {
    errors.push(`${pair.primaryPath} must not reuse ${pair.comparisonPath}`);
  }

  return {
    asset: { path: pair.primaryPath },
    pair,
    ok: errors.length === 0,
    primaryHash,
    comparisonHash,
    errors,
  };
};

const countTransparentPixelsWithRgbData = (buffer) => {
  const { metadata, bytesPerPixel, pixelData } = readPngPixelData(buffer);
  let hiddenRgbPixelCount = 0;

  for (let y = 0; y < metadata.height; y += 1) {
    for (let x = 0; x < metadata.width; x += 1) {
      const pixel = readPngPixel(pixelData, metadata, bytesPerPixel, x, y);
      if (pixel.alpha === 0 && (pixel.red !== 0 || pixel.green !== 0 || pixel.blue !== 0)) {
        hiddenRgbPixelCount += 1;
      }
    }
  }

  return hiddenRgbPixelCount;
};

const createTransparentRgbResult = (asset, rootDir) => {
  const assetPath = path.join(rootDir, asset.path);
  if (!fs.existsSync(assetPath)) {
    return {
      asset,
      ok: false,
      errors: [`missing asset: ${asset.path}`],
    };
  }

  const errors = [];
  let hiddenRgbPixelCount = 0;
  try {
    hiddenRgbPixelCount = countTransparentPixelsWithRgbData(fs.readFileSync(assetPath));
    if (hiddenRgbPixelCount > asset.maxHiddenRgbPixels) {
      errors.push(
        `transparent pixels with hidden RGB data ${hiddenRgbPixelCount}, expected at most ${asset.maxHiddenRgbPixels}`
      );
    }
  } catch (error) {
    errors.push(`invalid transparent RGB metadata: ${error.message}`);
  }

  return {
    asset,
    ok: errors.length === 0,
    hiddenRgbPixelCount,
    errors,
  };
};

const runAssetImageQualityGate = (rootDir) => {
  const results = CRITICAL_ASSETS.map((asset) => createAssetResult(asset, rootDir));
  const separationResults = ICON_SPLASH_SEPARATION_PAIRS.map((pair) =>
    createAssetSeparationResult(pair, rootDir)
  );
  const transparentRgbResults = TRANSPARENT_RGB_ASSETS.map((asset) =>
    createTransparentRgbResult(asset, rootDir)
  );
  const failures = [...results, ...separationResults, ...transparentRgbResults].filter(
    (result) => !result.ok
  );
  return {
    ok: failures.length === 0,
    results,
    separationResults,
    transparentRgbResults,
    failures,
  };
};

const main = () => {
  const result = runAssetImageQualityGate(ROOT_DIR);

  result.results.forEach((entry) => {
    if (!entry.ok) {
      console.error(`[asset-image-quality] ${entry.asset.path}: ${entry.errors.join('; ')}`);
      return;
    }

    console.log(
      `[asset-image-quality] ${entry.asset.path}: ${entry.dimensions.width}x${entry.dimensions.height}, ${entry.bytes} bytes`
    );
  });
  result.separationResults.forEach((entry) => {
    if (!entry.ok) {
      console.error(`[asset-image-quality] ${entry.asset.path}: ${entry.errors.join('; ')}`);
      return;
    }

    console.log(
      `[asset-image-quality] ${entry.pair.primaryPath}: distinct from ${entry.pair.comparisonPath}`
    );
  });
  result.transparentRgbResults.forEach((entry) => {
    if (!entry.ok) {
      console.error(`[asset-image-quality] ${entry.asset.path}: ${entry.errors.join('; ')}`);
      return;
    }

    console.log(
      `[asset-image-quality] ${entry.asset.path}: transparent RGB pixels ${entry.hiddenRgbPixelCount}`
    );
  });

  if (!result.ok) {
    throw new Error(`Asset image quality gate failed: ${result.failures.length} failure(s)`);
  }
};

if (require.main === module) {
  try {
    main();
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
}

module.exports = {
  CRITICAL_ASSETS,
  ICON_SPLASH_SEPARATION_PAIRS,
  TRANSPARENT_RGB_ASSETS,
  compareImageFingerprint,
  createAssetSeparationResult,
  createTransparentRgbResult,
  createImageFingerprint,
  readImageDimensions,
  readJpegFingerprintData,
  readPngPixelData,
  runAssetImageQualityGate,
};
