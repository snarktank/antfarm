# Antfarm Testing

This document describes the testing setup for the Antfarm project.

## Test Framework

Antfarm uses Node.js's built-in test runner (`node:test`) for all tests.

## Running Tests

Run all tests:
```bash
node --test tests/*.test.ts
```

Run a specific test file:
```bash
node --test tests/ant.test.ts
```

## Test Structure

- `tests/*.test.ts` - Integration and end-to-end tests
- `src/**/*.test.ts` - Unit tests for source modules

## Example: Hello-World Test

The `tests/ant.test.ts` file serves as a simple "hello-world" test demonstrating CLI integration testing. It verifies:

1. The `antfarm ant` command prints ASCII art with ant body characters
2. The output includes a quote on the last line
3. The ant command is hidden from help

### Running the hello-world test:

```bash
node --test tests/ant.test.ts
```

Expected output:
```
# tests 3
# suites 1
# pass 3
# fail 0
```

## Simple Version Test

The `tests/hello-world.test.ts` file provides a minimal test verifying the CLI can be invoked with `--version` and outputs the antfarm version string.

### Running the simple version test:

```bash
node --test tests/hello-world.test.ts
```

Expected output:
```
# tests 2
# suites 1
# pass 2
# fail 0
```

## Build Before Testing

Always run the build before testing to ensure the CLI is up-to-date:

```bash
npm run build
node --test tests/*.test.ts
```

## CI/CD

GitHub Actions runs on release events to inject version information. See `.github/workflows/inject-version.yml`.
