import * as p from '@clack/prompts';

function assertNotCancelled<T>(value: T | symbol): asserts value is T {
  if (p.isCancel(value)) {
    p.cancel('Cancelled.');
    process.exit(0);
  }
}

export async function confirm(message: string): Promise<boolean> {
  const result = await p.confirm({ message });
  assertNotCancelled(result);
  return result;
}

export async function textInput(
  message: string,
  opts?: {
    default?: string;
    validate?: (value: string | undefined) => string | Error | undefined;
  },
): Promise<string> {
  const result = await p.text({
    message,
    defaultValue: opts?.default,
    placeholder: opts?.default,
    validate: opts?.validate,
  });
  assertNotCancelled(result);
  return result;
}

export async function select(
  message: string,
  options: { label: string; value: string }[],
): Promise<string> {
  const result = await p.select({ message, options });
  assertNotCancelled(result);
  return result;
}
