/**
 * The one place a check's outcome is decided.
 *
 * Its own file, and not a function inside `bench/run.ts`, because `run.ts` is a script: importing
 * it to test `grade` would execute the entire benchmark suite as a side effect of the import.
 * `bench/fault.test.ts` proves this function says FAIL for each way a check can fail, which is
 * only worth anything if importing it is free.
 *
 * `count > 0` alone was the old rule and it only ever meant "collected" [COMPLAINS #2,
 * ENGINEERING §3.1]. A check that observes a failure and reports it now fails whatever its case
 * count says; a check that collected nothing still fails whatever its failure list says.
 */
export function grade(result: { count: number; failures: string[] }): boolean {
  return result.count > 0 && result.failures.length === 0
}
