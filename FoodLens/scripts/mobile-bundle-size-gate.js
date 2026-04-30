#!/usr/bin/env node

const fs = require('fs');
const os = require('os');
const path = require('path');
const zlib = require('zlib');
const { spawnSync } = require('child_process');

const MIB_BYTES = 1024 * 1024;
const HERMES_LIMIT_BYTES = Math.floor(6.8 * MIB_BYTES);
const SOURCEMAP_LIMIT_BYTES = 20 * MIB_BYTES;
const ASSET_PAYLOAD_LIMIT_BYTES = Math.floor(9.5 * MIB_BYTES);
const LUCIDE_SOURCE_WARNING_LIMIT = 1850;
const PACKAGE_SOURCE_MARKERS = [
  { key: 'lucideReactNative', pattern: 'node_modules/lucide-react-native/' },
  { key: 'shopifyReactNativeSkia', pattern: 'node_modules/@shopify/react-native-skia/' },
  { key: 'reactNativeGoogleMobileAds', pattern: 'node_modules/react-native-google-mobile-ads/' },
  { key: 'reactNativeMaps', pattern: 'node_modules/react-native-maps/' },
];

const parseArguments = (argv) => {
  const options = {
    outputDir: process.env.MOBILE_BUNDLE_OUTPUT_DIR || path.join(os.tmpdir(), 'foodlens-mobile-bundle-export'),
    summaryFile: process.env.MOBILE_BUNDLE_SUMMARY_FILE || '',
    skipExport: process.env.MOBILE_BUNDLE_SKIP_EXPORT === '1',
    allowStaleExport: process.env.MOBILE_BUNDLE_ALLOW_STALE_EXPORT === '1',
    requireFreshExport: false,
    explicitSkipExport: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];

    if (argument === '--output-dir') {
      const value = argv[index + 1];
      if (!value) {
        throw new Error('--output-dir requires a value');
      }
      options.outputDir = value;
      index += 1;
      continue;
    }

    if (argument === '--summary-file') {
      const value = argv[index + 1];
      if (!value) {
        throw new Error('--summary-file requires a value');
      }
      options.summaryFile = value;
      index += 1;
      continue;
    }

    if (argument === '--skip-export') {
      options.skipExport = true;
      options.explicitSkipExport = true;
      continue;
    }

    if (argument === '--allow-stale-export') {
      options.allowStaleExport = true;
      continue;
    }

    if (argument === '--require-fresh-export') {
      options.requireFreshExport = true;
      continue;
    }

    throw new Error(`Unknown argument: ${argument}`);
  }

  if (options.requireFreshExport && options.explicitSkipExport) {
    throw new Error('--require-fresh-export cannot be combined with --skip-export');
  }

  if (options.requireFreshExport) {
    options.skipExport = false;
    options.allowStaleExport = false;
  }

  if (options.skipExport && !options.allowStaleExport) {
    throw new Error(
      'Refusing to run bundle size gate against a stale export. Use --skip-export with --allow-stale-export only for explicit local rechecks.'
    );
  }

  return {
    outputDir: path.resolve(options.outputDir),
    summaryFile: path.resolve(options.summaryFile || path.join(options.outputDir, 'mobile-bundle-size-summary.json')),
    skipExport: options.skipExport,
    allowStaleExport: options.allowStaleExport,
    requireFreshExport: options.requireFreshExport,
  };
};

const ensureDirectory = (directory) => {
  fs.mkdirSync(directory, { recursive: true });
};

const removeDirectory = (directory) => {
  fs.rmSync(directory, { recursive: true, force: true });
};

const runExpoExport = (outputDir) => {
  const result = spawnSync(
    'npx',
    ['expo', 'export', '--platform', 'all', '--source-maps', '--dump-assetmap', '--output-dir', outputDir],
    {
      cwd: process.cwd(),
      env: process.env,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    }
  );

  if (result.status !== 0) {
    throw new Error(
      `Expo export failed with status ${result.status}\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`
    );
  }

  process.stdout.write(result.stdout);
  process.stderr.write(result.stderr);
};

const listFiles = (directory) => {
  const entries = fs.readdirSync(directory, { withFileTypes: true });
  const files = entries.flatMap((entry) => {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      return listFiles(entryPath);
    }
    if (entry.isFile()) {
      return [entryPath];
    }
    return [];
  });

  return files.sort((left, right) => left.localeCompare(right));
};

const toRelativePath = (outputDir, filePath) => path.relative(outputDir, filePath).split(path.sep).join('/');

const getFileSize = (filePath) => fs.statSync(filePath).size;

const toMiB = (bytes) => Number((bytes / MIB_BYTES).toFixed(3));

const createSizeRecord = (bytes) => ({
  bytes,
  mib: toMiB(bytes),
});

const matchesPlatform = (relativePath, platform) => {
  const normalized = relativePath.toLowerCase();
  return normalized.includes(`/${platform}/`) || normalized.includes(`${platform}-`) || normalized.includes(`.${platform}.`);
};

const findLargestFileForPlatform = (files, outputDir, platform, predicate) => {
  const matchingFiles = files
    .map((filePath) => ({
      path: toRelativePath(outputDir, filePath),
      bytes: getFileSize(filePath),
    }))
    .filter((file) => predicate(file.path))
    .filter((file) => matchesPlatform(file.path, platform))
    .sort((left, right) => right.bytes - left.bytes || left.path.localeCompare(right.path));

  return matchingFiles.length > 0 ? matchingFiles[0] : null;
};

const findHermesBytecodeSizes = (files, outputDir) => {
  const isHermesBytecode = (relativePath) => {
    const lowerPath = relativePath.toLowerCase();
    return lowerPath.endsWith('.hbc') || lowerPath.endsWith('.hbc.bundle');
  };

  const iosFile = findLargestFileForPlatform(files, outputDir, 'ios', isHermesBytecode);
  const androidFile = findLargestFileForPlatform(files, outputDir, 'android', isHermesBytecode);

  return {
    ios: iosFile ? { path: iosFile.path, ...createSizeRecord(iosFile.bytes) } : null,
    android: androidFile ? { path: androidFile.path, ...createSizeRecord(androidFile.bytes) } : null,
  };
};

const findSourcemapSizes = (files, outputDir) => {
  const isSourcemap = (relativePath) => relativePath.toLowerCase().endsWith('.map');
  const iosFile = findLargestFileForPlatform(files, outputDir, 'ios', isSourcemap);
  const androidFile = findLargestFileForPlatform(files, outputDir, 'android', isSourcemap);
  const webFile = findLargestFileForPlatform(files, outputDir, 'web', isSourcemap);

  return {
    ios: iosFile ? { path: iosFile.path, ...createSizeRecord(iosFile.bytes) } : null,
    android: androidFile ? { path: androidFile.path, ...createSizeRecord(androidFile.bytes) } : null,
    web: webFile ? { path: webFile.path, ...createSizeRecord(webFile.bytes) } : null,
  };
};

const findWebEntrySize = (files, outputDir) => {
  const jsFiles = files
    .map((filePath) => ({
      filePath,
      path: toRelativePath(outputDir, filePath),
      bytes: getFileSize(filePath),
    }))
    .filter((file) => {
      const lowerPath = file.path.toLowerCase();
      return lowerPath.endsWith('.js') && !lowerPath.endsWith('.map') && matchesPlatform(file.path, 'web');
    })
    .sort((left, right) => right.bytes - left.bytes || left.path.localeCompare(right.path));

  if (jsFiles.length === 0) {
    return null;
  }

  const entryFile = jsFiles[0];
  const gzipBytes = zlib.gzipSync(fs.readFileSync(entryFile.filePath)).length;

  return {
    path: entryFile.path,
    ...createSizeRecord(entryFile.bytes),
    gzip: createSizeRecord(gzipBytes),
  };
};

const readJsonFile = (filePath) => {
  const rawContent = fs.readFileSync(filePath, 'utf8');
  try {
    return JSON.parse(rawContent);
  } catch (error) {
    throw new Error(`Failed to parse JSON file ${filePath}: ${error.message}`);
  }
};

const collectAssetMapFileNames = (value) => {
  if (Array.isArray(value)) {
    return value.flatMap((item) => collectAssetMapFileNames(item));
  }

  if (value && typeof value === 'object') {
    const files = Array.isArray(value.files) ? value.files.filter((fileName) => typeof fileName === 'string') : [];
    const nestedFiles = Object.values(value).flatMap((item) => collectAssetMapFileNames(item));
    return [...files, ...nestedFiles];
  }

  return [];
};

const getAssetFilesFromAssetMap = (files, outputDir) => {
  const assetMapPath = files.find((filePath) => path.basename(filePath) === 'assetmap.json');
  if (!assetMapPath) {
    return [];
  }

  const assetMap = readJsonFile(assetMapPath);
  const assetFileNames = Array.from(new Set(collectAssetMapFileNames(assetMap))).sort((left, right) =>
    left.localeCompare(right)
  );
  const absoluteFiles = assetFileNames
    .map((fileName) => path.resolve(outputDir, fileName))
    .filter((filePath) => fs.existsSync(filePath) && fs.statSync(filePath).isFile());

  return absoluteFiles.sort((left, right) => left.localeCompare(right));
};

const getTopLevelHashedAssetFiles = (files, outputDir) =>
  files.filter((filePath) => {
    const relativePath = toRelativePath(outputDir, filePath);
    const parts = relativePath.split('/');
    if (parts.length !== 2 || parts[0] !== 'assets') {
      return false;
    }

    return /^[a-f0-9]{32}(?:\.[a-z0-9]+)?$/i.test(parts[1]);
  });

const getAssetFilesFromDirectory = (files, outputDir) =>
  files.filter((filePath) => {
    const relativePath = toRelativePath(outputDir, filePath);
    return relativePath.startsWith('assets/');
  });

const summarizeAssets = (files, outputDir) => {
  const hashedAssetFiles = getTopLevelHashedAssetFiles(files, outputDir);
  const assetMapFiles = getAssetFilesFromAssetMap(files, outputDir);
  const assetFiles =
    hashedAssetFiles.length > 0
      ? hashedAssetFiles
      : assetMapFiles.length > 0
        ? assetMapFiles
        : getAssetFilesFromDirectory(files, outputDir);
  const uniqueAssetFiles = Array.from(new Set(assetFiles)).sort((left, right) => left.localeCompare(right));
  const totalBytes = uniqueAssetFiles.reduce((total, filePath) => total + getFileSize(filePath), 0);
  const largestFiles = uniqueAssetFiles
    .map((filePath) => ({
      path: toRelativePath(outputDir, filePath),
      ...createSizeRecord(getFileSize(filePath)),
    }))
    .sort((left, right) => right.bytes - left.bytes || left.path.localeCompare(right.path))
    .slice(0, 20);

  return {
    derivation:
      hashedAssetFiles.length > 0
        ? 'top-level-hashed-assets'
        : assetMapFiles.length > 0
          ? 'assetmap-source-files'
          : 'assets-directory',
    total: createSizeRecord(totalBytes),
    fileCount: uniqueAssetFiles.length,
    largestFiles,
  };
};

const createEmptySourceCounts = () => ({
  lucideReactNative: 0,
  shopifyReactNativeSkia: 0,
  reactNativeGoogleMobileAds: 0,
  reactNativeMaps: 0,
  appCode: 0,
  total: 0,
});

const countSources = (sources) => {
  const uniqueSources = Array.from(new Set(sources)).sort((left, right) => left.localeCompare(right));

  return uniqueSources.reduce((counts, source) => {
    const normalizedSource = source.split('\\').join('/');
    const matchingMarker = PACKAGE_SOURCE_MARKERS.find((marker) => normalizedSource.includes(marker.pattern));
    const nextCounts = { ...counts, total: counts.total + 1 };

    if (matchingMarker) {
      return {
        ...nextCounts,
        [matchingMarker.key]: nextCounts[matchingMarker.key] + 1,
      };
    }

    if (!normalizedSource.includes('node_modules/')) {
      return {
        ...nextCounts,
        appCode: nextCounts.appCode + 1,
      };
    }

    return nextCounts;
  }, createEmptySourceCounts());
};

const summarizeSourcemapSources = (sourceMaps, outputDir) =>
  Object.fromEntries(
    Object.entries(sourceMaps).map(([platform, mapRecord]) => {
      if (!mapRecord) {
        return [platform, createEmptySourceCounts()];
      }

      const mapPath = path.join(outputDir, mapRecord.path);
      const mapJson = readJsonFile(mapPath);
      const sources = Array.isArray(mapJson.sources) ? mapJson.sources.filter((source) => typeof source === 'string') : [];
      return [platform, countSources(sources)];
    })
  );

const createThresholdResult = (name, measuredRecord, limitBytes, severity) => {
  if (!measuredRecord) {
    return {
      name,
      severity,
      status: severity === 'fail' ? 'failed' : 'warning',
      measured: null,
      limit: createSizeRecord(limitBytes),
      message: `${name} measurement was not found`,
    };
  }

  const status = measuredRecord.bytes <= limitBytes ? 'passed' : severity === 'fail' ? 'failed' : 'warning';

  return {
    name,
    severity,
    status,
    measured: createSizeRecord(measuredRecord.bytes),
    limit: createSizeRecord(limitBytes),
    message: `${name} ${status}: measured ${measuredRecord.bytes} bytes, limit ${limitBytes} bytes`,
  };
};

const createSourceWarning = (platform, counts) => {
  const measured = counts.lucideReactNative;
  const status = measured <= LUCIDE_SOURCE_WARNING_LIMIT ? 'passed' : 'warning';

  return {
    name: `${platform} lucide-react-native source count`,
    severity: 'warning',
    status,
    measured,
    limit: LUCIDE_SOURCE_WARNING_LIMIT,
    message: `${platform} lucide-react-native source count ${status}: measured ${measured}, warning limit ${LUCIDE_SOURCE_WARNING_LIMIT}`,
  };
};

const createChecks = (summary) => {
  const checks = [
    createThresholdResult('ios Hermes bytecode', summary.hermesBytecode.ios, HERMES_LIMIT_BYTES, 'fail'),
    createThresholdResult('android Hermes bytecode', summary.hermesBytecode.android, HERMES_LIMIT_BYTES, 'fail'),
    createThresholdResult('ios sourcemap', summary.sourcemaps.ios, SOURCEMAP_LIMIT_BYTES, 'fail'),
    createThresholdResult('android sourcemap', summary.sourcemaps.android, SOURCEMAP_LIMIT_BYTES, 'fail'),
    createThresholdResult('web sourcemap', summary.sourcemaps.web, SOURCEMAP_LIMIT_BYTES, 'fail'),
    createThresholdResult('asset payload', summary.assets.total, ASSET_PAYLOAD_LIMIT_BYTES, 'fail'),
    createSourceWarning('ios', summary.sourcemapSourceCounts.ios),
    createSourceWarning('android', summary.sourcemapSourceCounts.android),
    createSourceWarning('web', summary.sourcemapSourceCounts.web),
  ];

  return {
    policy: {
      hermesBytecode: 'fail above 6.8 MiB per native platform',
      sourcemap: 'fail above 20 MiB per platform',
      assetPayload: 'fail above 9.5 MiB',
      lucideReactNativeSources: 'warning above 1850 sources; warning does not fail the gate',
    },
    checks,
    failedChecks: checks.filter((check) => check.status === 'failed').map((check) => check.name),
    warnings: checks.filter((check) => check.status === 'warning').map((check) => check.name),
  };
};

const createSummary = (outputDir, exportMode) => {
  const files = listFiles(outputDir);
  const hermesBytecode = findHermesBytecodeSizes(files, outputDir);
  const sourcemaps = findSourcemapSizes(files, outputDir);
  const webEntry = findWebEntrySize(files, outputDir);
  const assets = summarizeAssets(files, outputDir);
  const sourcemapSourceCounts = summarizeSourcemapSources(sourcemaps, outputDir);
  const summary = {
    exportCommand: 'npx expo export --platform all --source-maps --dump-assetmap --output-dir <outputDir>',
    exportMode,
    generatedAt: new Date().toISOString(),
    thresholds: {
      hermesBytecode: createSizeRecord(HERMES_LIMIT_BYTES),
      sourcemap: createSizeRecord(SOURCEMAP_LIMIT_BYTES),
      assetPayload: createSizeRecord(ASSET_PAYLOAD_LIMIT_BYTES),
      lucideReactNativeSourceWarning: LUCIDE_SOURCE_WARNING_LIMIT,
    },
    hermesBytecode,
    sourcemaps,
    webEntry,
    assets,
    sourcemapSourceCounts,
  };

  return {
    ...summary,
    gate: createChecks(summary),
  };
};

const writeSummary = (summaryFile, summary) => {
  ensureDirectory(path.dirname(summaryFile));
  fs.writeFileSync(summaryFile, `${JSON.stringify(summary, null, 2)}\n`);
};

const main = () => {
  const options = parseArguments(process.argv.slice(2));

  if (!options.skipExport) {
    removeDirectory(options.outputDir);
    ensureDirectory(options.outputDir);
    runExpoExport(options.outputDir);
  }

  if (!fs.existsSync(options.outputDir)) {
    throw new Error(`Export output directory does not exist: ${options.outputDir}`);
  }

  const exportMode = options.skipExport ? 'stale-export-recheck' : 'fresh-export';
  const summary = createSummary(options.outputDir, exportMode);
  writeSummary(options.summaryFile, summary);

  console.log(`Mobile bundle size summary: ${options.summaryFile}`);

  if (summary.gate.warnings.length > 0) {
    console.warn(`Mobile bundle size warnings: ${summary.gate.warnings.join(', ')}`);
  }

  if (summary.gate.failedChecks.length > 0) {
    throw new Error(`Mobile bundle size gate failed: ${summary.gate.failedChecks.join(', ')}`);
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
  createSummary,
  parseArguments,
};
