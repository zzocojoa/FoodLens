const TEST_MATCH_PATTERNS = ['**/__tests__/**/*.test.ts', '**/__tests__/**/*.test.tsx'];
const MODULE_NAME_MAPPER = {
    '^@/(.*)$': '<rootDir>/$1',
};

module.exports = {
    preset: 'jest-expo',
    testMatch: TEST_MATCH_PATTERNS,
    moduleNameMapper: MODULE_NAME_MAPPER,
};
