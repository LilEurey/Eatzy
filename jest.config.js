/**
 * Pure-logic test harness. Only exercises framework-free modules under
 * src/lib/ (and the edge-function _shared/ helpers) — RN component rendering
 * is intentionally out of scope. Runs on ts-jest in a node environment so it
 * doesn't drag in the Expo/React Native transform stack.
 */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/src', '<rootDir>/supabase/functions'],
  testMatch: ['**/__tests__/**/*.test.ts'],
  moduleNameMapper: {
    // Anything that pulls the real Supabase client also pulls RN modules that
    // can't load under node — stub it. Tests that need DB behavior mock the
    // query builder explicitly.
    '^@/lib/supabase$': '<rootDir>/src/lib/__tests__/__mocks__/supabase.ts',
    '^@/(.*)$': '<rootDir>/src/$1',
  },
  transform: {
    // Transpile-only (isolatedModules is set in tsconfig.json) — `npm run lint`
    // and the editor cover types, and skipping the type-check cuts suite time ~10x.
    '^.+\\.tsx?$': ['ts-jest', { tsconfig: { jsx: 'react-jsx' } }],
  },
};
