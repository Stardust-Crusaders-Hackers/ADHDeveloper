<!-- ADH_DIRDOCS_START -->
# Subdirectory guide

Directory: `mcpServer\src`

## Conceptual purpose
Holds main implementation and system use cases.

## Architectural role
Acts as the project operational core and typically depends on support layers.

## Contents
- `agents`: Subdirectory grouping related responsibilities.
- `handlers.ts`: TypeScript source with typed logic.
- `index.ts`: TypeScript source with typed logic.
- `languageService.ts`: TypeScript source with typed logic.
- `orchestrator`: Subdirectory grouping related responsibilities.
- `registry`: Subdirectory grouping related responsibilities.
- `shared.ts`: TypeScript source with typed logic.
- `sseServer.ts`: TypeScript source with typed logic.
- `tools`: Subdirectory grouping related responsibilities.
- `types.ts`: TypeScript source with typed logic.


## Recommended way of working here
- Keep clear module boundaries.
- Avoid mixing domain logic with infrastructure details.
<!-- ADH_DIRDOCS_END -->
