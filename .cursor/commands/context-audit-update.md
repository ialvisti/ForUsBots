
---
tags: [folder-context, audit, documentation, maintenance]
---

# Folder Context Audit & Synchronization Task (Strict Tool-Driven Mode)

**Agent**: Claude Sonnet 4.5  
**Priority**: CRITICAL  
**Time Allocation**: USE MAXIMUM AVAILABLE BUDGET (QUALITY > SPEED)  
**Execution Mode**: TOOL-DRIVEN, MULTI-STEP, EVIDENCE-BASED

---

## 🔐 Non-Negotiable Protocol (Read This First)

You are connected to a real codebase via tools that can list directories and read files.

For this task you MUST:

1. **Plan briefly, then execute with tools**  
   - First, create a short, high-level plan for the current phase.  
   - Then follow that plan step by step, using directory/file tools continuously.

2. **Never describe a file you have not just read with tools**  
   - You may NOT assume or guess the contents of any file.  
   - Before you talk about any specific file, you MUST have read it during this session via tools.

3. **Track coverage explicitly**  
   - For every folder in scope, you MUST:
     - List all files and subfolders (inventory).
     - Show counts (e.g., “12 files, 3 subfolders”).
     - Track which items are already documented in the local `FOLDER_CONTEXT.md` and which are missing or outdated.

4. **No “ALL DONE” claims without inventory**  
   - You may NOT say “all files are audited”, “100% complete”, or similar unless:
     - You have shown a complete inventory for that folder, and  
     - Every entry is marked as `OK`, `OUTDATED`, or `MISSING_FROM_CONTEXT`.

5. **Be honest about limits**  
   - If you cannot read more files due to environment limits, you MUST:
     - Explicitly list which folders/files are still “NOT REVIEWED YET”.
     - NOT claim that the audit is complete.

You must follow this protocol throughout all phases. Do not skip steps, even if it seems repetitive.

---

## 🎯 Mission Statement

Perform a comprehensive, systematic audit of all `FOLDER_CONTEXT.md` files against the actual codebase to ensure **maximum possible accuracy and completeness** within the available tool and context budget. Identify discrepancies, outdated information, and missing content. Then update ALL context files so they closely match the current state of the repository.

This is a **critical documentation accuracy task** where:

- ✅ Quality > Speed  
- ✅ Thoroughness is mandatory  
- ✅ Every relevant file and folder must be inspected with tools  
- ✅ No assumptions – verify everything by reading actual files  
- ✅ All context files must be synchronized as far as tool limits allow  

---

## 📦 Scope of Allowed Writes

You may **ONLY MODIFY** these files:

```text
✏️  /FOLDER_CONTEXT.md
✏️  /src/FOLDER_CONTEXT.md
✏️  /src/bots/FOLDER_CONTEXT.md
✏️  /src/engine/FOLDER_CONTEXT.md
✏️  /src/engine/utils/FOLDER_CONTEXT.md
✏️  /src/extractors/FOLDER_CONTEXT.md
✏️  /src/providers/FOLDER_CONTEXT.md
✏️  /src/middleware/FOLDER_CONTEXT.md
✏️  /src/routes/FOLDER_CONTEXT.md
✏️  /docs/FOLDER_CONTEXT.md
✏️  /migrations/FOLDER_CONTEXT.md
✏️  /scripts/FOLDER_CONTEXT.md
✏️  /examples/FOLDER_CONTEXT.md
✏️  /forusall-portal-html-data/FOLDER_CONTEXT.md
```

**READ-ONLY** (everything else):

- All source code files (.js, .mjs, .ts, etc.)  
- All configuration files (.json, .yaml, .yml, .env, etc.)  
- All other documentation files  
- All tests  
- All HTML/CSS/image files  

🚫 **NEVER** modify code, configs, or non-context documentation.

---

## 🛠️ Tool Usage & Evidence Contract

When using tools (directory listing, file reading, search, etc.) you MUST obey:

1. **Read before you describe**  
   - Before describing a file’s purpose, exports, or behavior, call the appropriate tool to read it.  
   - Do NOT rely on memory of older runs or assumptions.

2. **Evidence in your write-up**  
   - Whenever you make a technical claim about a file or folder, include at least one of:
     - A specific function name, export, or class name from that file.  
     - A selector, URL, constant, or config key that only appears in that file.  
   - This “evidence” should be concrete enough that a human could verify it by opening the file.

3. **Coverage tables per folder**  
   - For each folder in scope (root, `/src`, `/src/bots`, etc.), you MUST create a `Coverage` table in your analysis, for example:

     ```markdown
     ### /src/bots Coverage

     | Path                            | Type       | Mentioned in FOLDER_CONTEXT? | Status            |
     |---------------------------------|------------|------------------------------|-------------------|
     | /src/bots/forusall-upload       | directory  | ✅                            | OK                |
     | /src/bots/forusall-emailtrigger | directory  | ❌                            | MISSING_FROM_CTX  |
     | /src/bots/README.md             | file       | ❌                            | MISSING_FROM_CTX  |
     ```

   - You MUST fill these tables based on actual directory listings, not guesses.

4. **No hallucinated completion**  
   - If a file or folder has not been read, mark it explicitly as `NOT_REVIEWED_YET`.  
   - Do NOT treat “skipped” or “not reviewed” as “OK” or “done”.

---

## 📐 Phase 1: Discovery & Deep Analysis (READ-ONLY)

You will perform Phase 1 **folder by folder**, not all at once. Do not move to Phase 2 until you have:

- Completed Phase 1 for all targeted folders, and  
- Produced coverage tables plus findings for each one.

### Phase 1.1: Root Directory Inventory

**Objective**: Build a complete, evidence-based inventory of the project root.

**Actions**:

1. Use directory tools to list `/` contents.  
2. For each file/folder in root, document:
   - Name  
   - Type (file/directory)  
   - Purpose (based on actual contents; read files as needed)  
   - Whether it is currently documented in `/FOLDER_CONTEXT.md`.

3. Read `/FOLDER_CONTEXT.md` in full.  
4. Compare inventory vs context file:
   - ✅ Files mentioned and exist  
   - ⚠️ Files mentioned but don’t exist (outdated)  
   - ❌ Files exist but not mentioned (missing)

5. Produce a **Root Coverage Table** as described in the Tool Contract.

**Document Findings (example structure)**:

```markdown
## Root Directory Audit

### Coverage

| Path           | Type      | Mentioned in FOLDER_CONTEXT? | Status            |
|----------------|-----------|------------------------------|-------------------|
| package.json   | file      | ✅                            | OK                |
| Dockerfile     | file      | ✅                            | OK                |
| render.yaml    | file      | ❌                            | MISSING_FROM_CTX  |
| .gitignore     | file      | ✅                            | OUTDATED          |
| /src           | directory | ✅                            | OK                |
| /docs          | directory | ✅                            | OK                |
| /migrations    | directory | ✅                            | OK                |
| /scripts       | directory | ✅                            | OK                |
| /examples      | directory | ✅                            | OK                |

### Files Listed in Context vs Reality
- package.json ✅ (exists, purpose documented)
- Dockerfile ✅ (exists, purpose documented)
- .gitignore ⚠️ (exists but description outdated)

### Files Missing from Context
- render.yaml ❌ (exists but NOT documented)

### Outdated Information
- Example: Context says "Express 4.x" but code uses Express 5.x (verified by reading `server.js` / `package.json`).

### Action Plan for `/FOLDER_CONTEXT.md`
1. Add missing files to "Key Files" section.
2. Update framework/library version references.
3. Fix any incorrect statements about bot count or structure.
```

Repeat this style of analysis for each phase and folder below.

---

### Phase 1.2: `/src` Directory Structure Analysis

**Objective**: Build a complete, tool-verified overview of `/src/`.

**Actions**:

1. Read `/src/FOLDER_CONTEXT.md`.  
2. List all files and subdirectories in `/src/` with tools.  
3. For each item:
   - Describe its purpose based on actual contents.  
   - Indicate whether it is documented in `/src/FOLDER_CONTEXT.md`.

4. Construct a `/src Coverage` table similar to the root example.  
5. Verify:
   - Entry points (e.g., `index.js`, `server.js`) are correctly described.  
   - All subdirectories in `/src/` are listed in the context file.  
   - Architecture description in `/src/FOLDER_CONTEXT.md` matches reality.

Use the same pattern for all subsequent Phase 1 steps:

- Phase 1.3: `/src/bots` Deep Analysis  
- Phase 1.4: `/src/engine` Deep Analysis  
- Phase 1.5: `/src/engine/utils` Deep Analysis  
- Phase 1.6: `/src/extractors` Deep Analysis  
- Phase 1.7: `/src/providers` Deep Analysis  
- Phase 1.8: `/src/middleware` Deep Analysis  
- Phase 1.9: `/src/routes` Deep Analysis  
- Phase 1.10: `/docs` Structure Analysis  
- Phase 1.11: `/migrations` Analysis  
- Phase 1.12: `/scripts` Analysis  
- Phase 1.13: `/examples` Analysis  
- Phase 1.14: `/forusall-portal-html-data` Analysis  

For each folder:

- Use tools to list all contents.  
- Read representative or key files to understand their roles.  
- Build a coverage table.  
- Summarize mismatches vs the corresponding `FOLDER_CONTEXT.md`.

You may reuse the detailed templates from the original prompt (bot-by-bot, extractor-by-extractor, selectors, etc.), but now they MUST be based on actual file reads and coverage tables.

---

## 📊 Phase 2: Consolidated Analysis & Planning

Only start Phase 2 once Phase 1 coverage tables and findings exist for all folders.

### Phase 2.1: Consolidate All Findings

**Objective**: Combine all Phase 1 findings into a master audit report.

**Actions**:

1. Review all folder-level findings.  
2. Categorize issues by severity:
   - 🔴 CRITICAL – missing whole sections or entire components.  
   - 🟠 HIGH – core parts are outdated or inaccurate.  
   - 🟡 MEDIUM – missing important details.  
   - 🟢 LOW – minor improvements, extra examples, copy tweaks.

3. Count total issues per context file (as in your original template).  
4. Produce a clear summary table per `FOLDER_CONTEXT.md` indicating:
   - Total issues.  
   - Severity breakdown.  
   - High-level update plan.

---

## 🧭 Phase 3: Updating `FOLDER_CONTEXT.md` Files (WRITE-ONLY)

For each `FOLDER_CONTEXT.md` file (root, `/src`, `/src/bots`, etc.):

### Before Updating:

1. Re-read the current `FOLDER_CONTEXT.md`.  
2. Re-read your Phase 1 findings and Phase 2 plan for that file.  
3. Note current structure, sections, and any examples to preserve.

### During Update:

You MUST:

1. **Preserve correct content**  
   - Keep accurate sections as-is or with minor clarifications.

2. **Fix outdated or incorrect information**  
   - Update anything that conflicts with the code or folder inventory.  
   - Remove references to files/bots/extractors that no longer exist.

3. **Add missing content**  
   - Document any new bots, engine modules, utils, extractors, routes, selectors, migrations, or scripts that exist but were not described.

4. **Maintain a consistent structure**  
   Use (or adapt) this structure:

   ```markdown
   # /path/to/folder/ – Folder Context

   ## Purpose
   Short, clear purpose statement for this folder.

   ## What's Here
   Inventory of key files and subfolders, with brief descriptions.

   ## Key Files (if applicable)
   File-by-file breakdown of the most important items.

   ## When to Work Here
   When and why a developer should modify this folder.

   ## DO NOT Work Here For
   Things that should NOT be done in this folder (to avoid misuse).

   ## Best Practices
   Folder-specific guidelines and patterns.

   ## Common Patterns
   Code patterns, helpers, or conventions used here.

   ## Testing
   How to test changes related to this folder.

   ## Dependencies
   What other modules, services, or configs this folder depends on.

   ## Future Enhancements
   Optional ideas for future improvements.
   ```

5. **Align examples with actual code**  
   - Any code snippets MUST match actual files (function names, signatures, exports, selectors).  
   - Do not invent new APIs or functions that don’t exist.

### After Each Update:

- Re-read the updated `FOLDER_CONTEXT.md`.  
- Check markdown structure and headings.  
- Verify that all references (paths, functions, selectors) match reality.  
- Ensure that the content aligns with your Phase 1 coverage table for that folder.

---

## 🔁 Phase 4: Cross-File Consistency & Verification

**Objective**: Ensure that all `FOLDER_CONTEXT.md` files form a coherent, accurate map of the project.

**Actions**:

1. **Terminology & naming**  
   - Use consistent terms across all files (e.g., “bot”, “jobCtx”, “participant page”, etc.).  
   - Align naming of folders, modules, and endpoints.

2. **Cross-references**  
   - When one context file mentions another folder, ensure that the target `FOLDER_CONTEXT.md` actually documents that part.  
   - Fix any mismatches (e.g., references to old queue APIs, outdated endpoints, or removed bots).

3. **Technical verification**  
   - Spot-check several examples, selectors, and function signatures across multiple context files.  
   - Confirm they all match actual code by re-reading relevant files with tools.

4. **Project-level artifacts**  
   - If there is a `PROJECT_STRUCTURE.md` or similar high-level doc, ensure that it is compatible with the updated `FOLDER_CONTEXT.md` files (you may not edit it, but you should highlight mismatches).

---

## 📊 Phase 5: Final Report & Summary

When you have updated all `FOLDER_CONTEXT.md` files within the available tool/context budget, produce a **Final Audit Report** including:

1. **Summary of Work**  
   - Which `FOLDER_CONTEXT.md` files were updated.  
   - Which ones were only partially audited due to limits (if any).  
   - Rough counts of lines added/removed per file (approximate is fine).

2. **Issue Resolution**  
   - List critical/high issues that were fixed per file.  
   - Note any remaining issues that could not be fully resolved and why (e.g., not enough tool budget to read all fixtures).

3. **Coverage Status**  
   - For each folder, summarize:
     - `Fully Audited`, `Partially Audited`, or `Not Audited`.  
     - Pointers to the relevant coverage tables.

4. **Recommendations for Future Maintenance**  
   - How to keep `FOLDER_CONTEXT.md` files up-to-date when new bots/modules/routes are added.  
   - Suggestions for periodic re-audit (e.g., quarterly).

---

## ✅ Success Criteria (Realistic but Strict)

This task is considered successful when:

- ✅ All targeted folders have **coverage tables** based on actual directory listings.  
- ✅ All `FOLDER_CONTEXT.md` files have been reviewed and updated where needed, within the available tool/context limits.  
- ✅ All code examples, function signatures, selectors, and endpoints mentioned in context files match real code.  
- ✅ All cross-references are consistent (no references to non-existent modules or APIs).  
- ✅ Any incomplete areas are clearly marked as such, with explicit “NOT_REVIEWED_YET” notes (no pretending they are covered).  
- ✅ A clear final report has been produced summarizing updates, coverage, and remaining gaps.

---

**Begin now with Phase 1, Step 1.1.**  
First, outline your plan for the root directory audit, then immediately start listing the root folder contents using tools and building the root coverage table.
```