// supabase/functions/ai-handler/__tests__/test_harness.ts

export function assert(condition: unknown, message = "assertion failed"): asserts condition {
  if (!condition) throw new Error(message);
}

export function assertEquals<T>(actual: T, expected: T, message?: string) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) {
    throw new Error(
      message ?? `assertEquals failed\nexpected: ${e}\nactual:   ${a}`,
    );
  }
}

export function assertNotEquals<T>(actual: T, expected: T, message?: string) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a === e) {
    throw new Error(
      message ?? `assertNotEquals failed\nnotExpected: ${e}\nactual:      ${a}`,
    );
  }
}
