#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const KiB_BYTES = 1024;
const ROOT_DIR = path.resolve(__dirname, '..');
const PNG_SIGNATURE_HEX = '89504e470d0a1a0a';
const PNG_IHDR_LENGTH = 13;
const PNG_MINIMUM_BYTES = 45;
const JPEG_END_OF_IMAGE_MARKER = 0xd9;
const PNG_CRC32_POLYNOMIAL = 0xedb88320;
const CRITICAL_ASSETS = [
  {
    path: 'assets/images/guide-good.jpg',
    format: 'jpeg',
    width: 1024,
    height: 1024,
    minBytes: 180 * KiB_BYTES,
    maxBytes: 600 * KiB_BYTES,
  },
  {
    path: 'assets/images/guide-bad.jpg',
    format: 'jpeg',
    width: 1024,
    height: 1024,
    minBytes: 250 * KiB_BYTES,
    maxBytes: 700 * KiB_BYTES,
  },
  {
    path: 'assets/images/allergens/sesame.png',
    format: 'png',
    width: 1024,
    height: 1024,
    minBytes: 250 * KiB_BYTES,
    maxBytes: 700 * KiB_BYTES,
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

const calculateCrc32 = (buffer, startOffset, endOffset) => {
  let crc = 0xffffffff;
  for (let offset = startOffset; offset < endOffset; offset += 1) {
    crc = PNG_CRC32_TABLE[(crc ^ buffer[offset]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
};

const readPngDimensions = (buffer) => {
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
  };
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
    bytes: buffer.length,
    errors,
  };
};

const runAssetImageQualityGate = (rootDir) => {
  const results = CRITICAL_ASSETS.map((asset) => createAssetResult(asset, rootDir));
  const failures = results.filter((result) => !result.ok);
  return {
    ok: failures.length === 0,
    results,
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
  readImageDimensions,
  runAssetImageQualityGate,
};
