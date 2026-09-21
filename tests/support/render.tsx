/**
 * Shared render helper for component contract tests.
 *
 * react-test-renderer requires `act()` around create under React 19 and an
 * explicitly configured act environment (there is no jest global setup here).
 */
import React from 'react';
import TestRenderer from 'react-test-renderer';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function render(element: React.ReactElement): Promise<TestRenderer.ReactTestRenderer> {
  let renderer!: TestRenderer.ReactTestRenderer;
  await TestRenderer.act(async () => {
    renderer = TestRenderer.create(element);
  });
  return renderer;
}
