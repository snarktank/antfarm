/**
 * Returns a greeting message.
 * @param name - The name to greet. Defaults to "World" if not provided.
 * @returns A greeting string in the format "Hello, {name}!"
 */
export function hello(name?: string): string {
  const target = name ?? "World";
  return `Hello, ${target}!`;
}
