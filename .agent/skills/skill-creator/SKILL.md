---
name: skill-creator
description: Guide for creating effective skills. This skill should be used when users want to create a new skill (or update an existing skill) that extends the agent's capabilities with specialized knowledge, workflows, or tool integrations.
---

# Skill Creator

This skill provides guidance for creating effective skills.

## About Skills

Skills are modular, self-contained packages that extend the agent's capabilities by providing specialized knowledge, workflows, and tools. They transform the model from a general-purpose agent into a specialized agent equipped with codebase-specific procedural knowledge.

### What Skills Provide

1. Specialized workflows - Multi-step procedures for specific domains
2. Tool integrations - Instructions for working with specific file formats or APIs
3. Domain expertise - Codebase-specific knowledge, schemas, business logic
4. Bundled resources - Scripts, references, and assets for complex and repetitive tasks

## Core Principles

### Concise is Key
The context window is a public good. Only add context the agent doesn't already have. Prefer concise examples over verbose explanations.

### Anatomy of a Skill
Every skill consists of a required `SKILL.md` file and optional bundled resources:
```
skill-name/
├── SKILL.md (required)
│   ├── YAML frontmatter metadata (required)
│   │   ├── name: (required)
│   │   └── description: (required)
│   └── Markdown instructions (required)
└── Bundled Resources (optional)
    ├── scripts/          - Executable code (Python/Bash/etc.)
    ├── references/       - Documentation loaded into context as needed
    └── assets/           - Files used in output (templates, icons, etc.)
```

#### SKILL.md (required)
Every `SKILL.md` contains:
- **Frontmatter** (YAML): Contains `name` and `description` fields.
- **Body** (Markdown): Instructions and guidance for using the skill.

## Skill Creation Process

1. **Understand the Skill with Concrete Examples**: Establish what the skill should cover and what user queries it should trigger on.
2. **Plan reusable contents**: Identify necessary scripts, references, or assets.
3. **Initialize the Skill**: Create a subfolder inside `.agent/skills/<skill-name>/` with a `SKILL.md`.
4. **Edit the Skill**: Implement scripts/guides, delete unnecessary placeholders, and complete `SKILL.md`.
5. **Iterate**: Refine instructions based on real task performance.
