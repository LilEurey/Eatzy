# .gitignore templates

Write the `.gitignore` **before the initial commit**. Combine sections when a project uses several stacks (e.g. a Python API with a React frontend). When unsure of the stack, start with "Always" plus the closest match.

## Always (include in every project)

```gitignore
# Secrets — never commit these
.env
.env.*
!.env.example
*.pem
*.key
credentials.json
secrets.yml

# OS noise
.DS_Store
Thumbs.db
desktop.ini

# Editors
.vscode/
.idea/
*.swp
*.swo

# Logs and temp
*.log
logs/
tmp/
.cache/
```

Committing a `.env.example` with dummy values is good practice — it documents which variables the project needs without leaking any.

## Node / JavaScript / TypeScript

```gitignore
node_modules/
dist/
build/
.next/
out/
coverage/
*.tsbuildinfo
.npm
.pnpm-debug.log*
.yarn/cache
```

Keep the lockfile (`package-lock.json`, `pnpm-lock.yaml`, `yarn.lock`) **tracked** — it's what makes installs reproducible.

## Python

```gitignore
__pycache__/
*.py[cod]
*.egg-info/
.venv/
venv/
env/
.pytest_cache/
.mypy_cache/
.ruff_cache/
.coverage
htmlcov/
dist/
build/
.ipynb_checkpoints/
```

## Go

```gitignore
bin/
vendor/
*.exe
*.test
*.out
```

## Rust

```gitignore
target/
**/*.rs.bk
```

Track `Cargo.lock` for binaries; it's conventionally ignored for libraries.

## Java / Kotlin

```gitignore
target/
build/
*.class
*.jar
!gradle/wrapper/gradle-wrapper.jar
.gradle/
out/
```

## Ruby

```gitignore
*.gem
.bundle/
vendor/bundle/
log/
tmp/
.byebug_history
```

## PHP / Laravel

```gitignore
/vendor/
/node_modules/
/public/storage
/storage/*.key
.env
.phpunit.result.cache
```

## Data science / notebooks

```gitignore
.ipynb_checkpoints/
*.csv
*.parquet
*.h5
data/raw/
models/
mlruns/
```

Be careful with blanket `*.csv` — if small reference data is meant to be tracked, use a narrower path like `data/raw/` and add a `!data/reference/small.csv` negation.

## Mobile

**iOS / Swift:**
```gitignore
DerivedData/
*.xcuserstate
xcuserdata/
Pods/
.build/
```

**Android:**
```gitignore
*.iml
.gradle/
local.properties
build/
captures/
.externalNativeBuild/
```

## Fixing an already-tracked file

If something that should be ignored is already committed, adding it to `.gitignore` does nothing — git keeps tracking files it already knows about. Untrack it while keeping it on disk:

```bash
git rm -r --cached node_modules/
git commit -m "chore: untrack node_modules"
```

This removes it from future commits but it remains in history. If the file was a **secret**, treat it as compromised and rotate the credential — removing it from history requires rewriting every commit since (`git filter-repo`), which breaks all existing clones and should only be done with the user's explicit understanding.
