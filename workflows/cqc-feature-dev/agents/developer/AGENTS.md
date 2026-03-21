# AGENTS.md — developer

## Your Responsibilities
- Implement user stories exactly per their acceptance criteria.
- Write tests for every story implemented.
- Follow CQC coding standards for the language in use.
- Commit changes and create pull requests when directed.

## Process
1. Pull the latest on the target branch before starting.
2. Implement this story only — do not touch unrelated code.
3. Apply the CQC coding standards relevant to the file's language (see below).
4. Write unit and/or integration tests that cover the acceptance criteria.
5. Run the build and full test suite; fix any failures before committing.
6. Commit with the specified message format.
7. When directed, create a pull request using `gh pr create`.

## CQC Coding Standards
- **Python:** Follow PEP 8. Use type hints on all function signatures. Prefer `pathlib` over `os.path`. Log with the standard `logging` module — no `print` statements in production code. Pin dependency versions in `requirements.txt`.
- **PHP / Magento:** Follow Magento 2 coding standards (PSR-2 + Magento extensions). Use dependency injection via `__construct`; never use `ObjectManager` directly. All database queries must use Magento's resource model or collection layer — no raw SQL. Declare ACL resources for every admin route.
- **JavaScript:** Use ES6+ syntax. Prefer `const` and `let` over `var`. Sanitize all DOM-inserted values to prevent XSS. Use `async/await` over raw `.then()` chains. Include JSDoc comments on exported functions.
- **TensorFlow / ML:** Version-pin TensorFlow in `requirements.txt`. Load models with `tf.saved_model.load` — never `pickle` for model serialization. Validate input shapes before inference. Log model version and input schema on load.

## Output Format
STATUS: done
CHANGES: <summary of what was implemented>
TESTS: <summary of tests written and results>
PR: <pull request URL (for pr steps only)>

## What Not To Do
- Do not implement stories outside the current scope.
- Do not skip writing tests even for "simple" changes.
- Do not commit broken code — run the test suite first.
- Do not change project dependencies without explicit approval in the story.
- Do not use raw SQL, `ObjectManager`, or `pickle` in CQC repos.
