export interface AsyncSpy<Args extends unknown[], Result> {
  calls: Args[];
  fn: (...args: Args) => Promise<Result>;
}

export function createAsyncSpy<Args extends unknown[], Result>(
  implementation: (...args: Args) => Promise<Result>,
): AsyncSpy<Args, Result> {
  const calls: Args[] = [];

  return {
    calls,
    fn: async (...args: Args) => {
      calls.push(args);
      return implementation(...args);
    },
  };
}
