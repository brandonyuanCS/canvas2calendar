# Shared Types

This directory contains **cross-cutting concern types** that are used across multiple packages in the monorepo.

## Purpose

Types in this directory should only include data structures that:
1. Are used by **multiple packages** (not just one)
2. Represent **shared domain concepts** (Canvas events, user preferences, etc.)
3. Define **interface contracts** (storage interfaces, API responses, etc.)

## Organization

### `canvas.ts`
Canvas event and ICS parsing types.
- **Used by**: `ics-parser`, `storage`, `background`, UI components
- **Contains**: `CanvasEvent`, `ParsedICS`, `CanvasMetadata`

### `preferences.ts`
User sync preferences and configuration types.
- **Used by**: UI components, `storage`, `background`, API endpoints
- **Contains**: `SyncPreferences`, `DEFAULT_PREFERENCES`, event type enums

### `storage.ts`
Storage interface contracts and types.
- **Used by**: `storage` package, all storage consumers
- **Contains**: `BaseStorageType`, `ValueOrUpdateType`
- **Note**: This is the **single source of truth** for storage interfaces

### `sync-reports.ts`
Sync operation result types.
- **Used by**: `background`, API endpoints, UI components
- **Contains**: `SyncReport`, `TaskSyncReport`, `CentralSyncReport`, `ApiSyncReport`

## Guidelines

### ✅ DO add types here if:
- The type is used by 2+ packages
- The type represents a core domain concept
- The type defines a shared interface contract

### ❌ DON'T add types here if:
- The type is specific to one package's implementation
- The type is only used internally within a package
- The type represents external API responses (Google, Supabase, etc.)

### Domain-Specific Types Belong in Their Packages
- Google API types → `packages/google-api/lib/types.ts`
- Supabase DB types → `packages/supabase/lib/types.ts`
- Storage state types → `packages/storage/lib/impl/canvas-types.ts`
- HMR types → `packages/hmr/lib/types.ts`
- i18n types → `packages/i18n/lib/types.ts`

## Import Patterns

### From other packages (preferred):
```typescript
import type { CanvasEvent, SyncPreferences } from '@extension/shared';
```

### Within the shared package:
```typescript
import type { BaseStorageType } from '../types/storage.js';
```

## Maintenance

When adding a new type:
1. Determine if it's truly cross-cutting or domain-specific
2. Add JSDoc comments explaining the type's purpose
3. Export from `index.ts`
4. Document which packages use it
