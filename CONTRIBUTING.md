# Contributing to Lunch Decider

First off, thank you for considering contributing to Lunch Decider! 🍜

This document provides guidelines and steps for contributing. Following these guidelines helps communicate that you respect the time of the developers managing this project.

## Table of Contents

- [Code of Conduct](#code-of-conduct)
- [Getting Started](#getting-started)
- [How Can I Contribute?](#how-can-i-contribute)
- [Development Workflow](#development-workflow)
- [Style Guidelines](#style-guidelines)
- [Commit Messages](#commit-messages)
- [Pull Request Process](#pull-request-process)

## Code of Conduct

This project and everyone participating in it is governed by our [Code of Conduct](CODE_OF_CONDUCT.md). By participating, you are expected to uphold this code.

## Getting Started

### Prerequisites

- Node.js 18+
- npm or yarn
- Git
- A code editor (we recommend VS Code with the ESLint and Prettier extensions)

### Setting Up Your Development Environment

1. **Fork the repository** on GitHub

2. **Clone your fork** locally:
   ```bash
   git clone https://github.com/YOUR_USERNAME/lunch-decider.git
   cd lunch-decider
   ```

3. **Add the upstream remote**:
   ```bash
   git remote add upstream https://github.com/thirdface/lunch-decider.git
   ```

4. **Install dependencies**:
   ```bash
   npm install
   ```

5. **Set up environment variables**:
   ```bash
   cp env.example .env.local
   # Edit .env.local with your API keys
   ```

6. **Start the development server**:
   ```bash
   npm run dev
   ```

## How Can I Contribute?

### 🐛 Reporting Bugs

Before creating a bug report, please check [existing issues](https://github.com/thirdface/lunch-decider/issues) to avoid duplicates.

When creating a bug report, include:

- **Clear title** describing the issue
- **Steps to reproduce** the behavior
- **Expected behavior** vs what actually happened
- **Screenshots** if applicable
- **Environment details** (browser, OS, Node version)

Use this template:

```markdown
## Bug Description
A clear description of the bug.

## Steps to Reproduce
1. Go to '...'
2. Click on '...'
3. See error

## Expected Behavior
What you expected to happen.

## Actual Behavior
What actually happened.

## Screenshots
If applicable.

## Environment
- OS: [e.g., macOS 14.0]
- Browser: [e.g., Chrome 120]
- Node version: [e.g., 18.19.0]
```

### 💡 Suggesting Features

Feature suggestions are welcome! Please:

1. Check [existing issues](https://github.com/thirdface/lunch-decider/issues) for similar suggestions
2. Open a new issue with the `enhancement` label
3. Describe the feature and why it would be useful
4. Include mockups or examples if possible

### 📝 Improving Documentation

Documentation improvements are always welcome:

- Fix typos or unclear wording
- Add examples or tutorials
- Improve code comments
- Update outdated information

### 🔧 Contributing Code

Look for issues labeled:
- `good first issue` — great for newcomers
- `help wanted` — we'd love assistance
- `bug` — something needs fixing
- `enhancement` — new features

## Development Workflow

### Branch Naming

Use descriptive branch names:

```
feature/add-cuisine-filter
fix/map-marker-clustering
docs/api-reference
refactor/gemini-service
```

### Running Tests

```bash
# Run all tests
npm test

# Run tests in watch mode
npm test -- --watch

# Run tests with coverage
npm run test:coverage
```

### Building

```bash
# Build for production
npm run build

# Preview the build
npm run preview
```

### Linting

We use ESLint and TypeScript for code quality:

```bash
# Type check
npx tsc --noEmit

# The build command includes type checking
npm run build
```

## Style Guidelines

### TypeScript

- Use TypeScript for all new code
- Define explicit types for function parameters and return values
- Use interfaces for object shapes
- Avoid `any` — use `unknown` if type is truly unknown

```typescript
// ✅ Good
interface UserPreferences {
  vibe: HungerVibe | null;
  budget: PricePoint;
}

function processPreferences(prefs: UserPreferences): Result {
  // ...
}

// ❌ Avoid
function processPreferences(prefs: any): any {
  // ...
}
```

### React Components

- Use functional components with hooks
- Keep components focused and single-purpose
- Extract complex logic into custom hooks
- Use TypeScript for props

```typescript
// ✅ Good
interface ButtonProps {
  label: string;
  onClick: () => void;
  variant?: 'primary' | 'secondary';
}

const Button: React.FC<ButtonProps> = ({ label, onClick, variant = 'primary' }) => {
  // ...
};
```

### CSS / Tailwind

- Follow the design system in `.cursorrules`
- Use CSS variables for colors
- Use the spacing scale (4px base unit)
- Prefer Tailwind utilities over custom CSS

```tsx
// ✅ Good - uses design system
<button className="px-4 py-2 bg-braun-orange text-white">

// ❌ Avoid - arbitrary values
<button className="px-[13px] py-[7px] bg-[#ff4400]">
```

### File Organization

- One component per file
- Co-locate tests with source files (`*.test.ts`)
- Use barrel exports for directories (`index.ts`)

## Commit Messages

We follow [Conventional Commits](https://www.conventionalcommits.org/):

```
type(scope): description

[optional body]

[optional footer]
```

### Types

- `feat` — new feature
- `fix` — bug fix
- `docs` — documentation only
- `style` — formatting, no code change
- `refactor` — code change that neither fixes a bug nor adds a feature
- `test` — adding or updating tests
- `chore` — maintenance tasks

### Examples

```
feat(search): add cuisine type filter

fix(map): resolve marker clustering on zoom

docs(readme): add deployment instructions

refactor(hooks): extract distance calculation logic

test(gemini): add unit tests for decideLunch
```

## Pull Request Process

### Before Submitting

1. **Update your fork**:
   ```bash
   git fetch upstream
   git rebase upstream/main
   ```

2. **Run all checks**:
   ```bash
   npm test
   npm run build
   ```

3. **Write/update tests** for your changes

4. **Update documentation** if needed

### Submitting

1. Push your branch to your fork
2. Open a Pull Request against `main`
3. Fill out the PR template completely
4. Link any related issues

### PR Template

```markdown
## Description
Brief description of what this PR does.

## Type of Change
- [ ] Bug fix
- [ ] New feature
- [ ] Documentation update
- [ ] Refactoring
- [ ] Other (please describe)

## How Has This Been Tested?
Describe testing approach.

## Checklist
- [ ] My code follows the style guidelines
- [ ] I have performed a self-review
- [ ] I have commented hard-to-understand areas
- [ ] I have updated documentation
- [ ] My changes generate no new warnings
- [ ] I have added tests
- [ ] All tests pass locally
```

### Review Process

1. A maintainer will review your PR
2. Address any requested changes
3. Once approved, a maintainer will merge

### After Merge

- Delete your branch
- Celebrate! 🎉

## Questions?

- Open a [Discussion](https://github.com/thirdface/lunch-decider/discussions)
- Check existing issues and discussions first
- Be patient — maintainers are volunteers

---

Thank you for contributing! Every contribution, no matter how small, makes Lunch Decider better for everyone. 🍜
