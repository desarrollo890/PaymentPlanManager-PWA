import { schemas } from './schemas.ts';
import type { EntityType } from './generated.ts';
export function operationVersion(type: EntityType): 1 | 2 { return schemas.operationV2!.properties!.entityType!.enum!.includes(type) ? 2 : 1; }
