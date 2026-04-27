/**
 * Test utility functions for the Antfarm workflow system.
 */

/**
 * Generates a unique test ID in the format TEST-XXXXX where XXXXX is a random 5-character alphanumeric string.
 *
 * @returns A unique test ID string
 */
export function generateTestId(): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  let result = "TEST-";
  for (let i = 0; i < 5; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}
