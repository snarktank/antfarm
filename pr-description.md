## Summary

This PR adds a simple hello world function that outputs 'Hello World' to the console.

## Changes

- Created `src/lib/hello.ts` with a `helloWorld()` function
- Created `src/lib/hello.test.ts` with comprehensive tests

## Testing

All tests pass (3/3):
- Verifies the function exists
- Verifies it returns void (not a Promise)
- Verifies it outputs "Hello World" to console

TypeScript compilation successful.

## Acceptance Criteria

- [x] Function outputs 'Hello World' to console
- [x] Function is synchronous and returns void
- [x] Tests verify the functionality
- [x] Code follows project conventions
