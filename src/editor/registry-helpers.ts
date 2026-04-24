import type { EntityRegistryEntry, DeviceRegistryEntry } from "../types/ha-extensions";

export function normalizeDomains(values?: string[]): string[] {
  const cleaned = [...new Set((values ?? []).map((item) => item.trim()).filter(Boolean))];
  return cleaned.length ? cleaned : ["*"];
}

export function areaEntityIds(
  entityRegistry: EntityRegistryEntry[],
  deviceRegistry: DeviceRegistryEntry[],
  areaId?: string,
  domains?: string[],
): string[] {
  const normalizedAreaId = (areaId ?? "").trim();
  if (!normalizedAreaId) return [];
  const allowedDomains = new Set((domains ?? []).map((item) => item.trim()).filter(Boolean));
  const devicesById = new Map(deviceRegistry.map((item) => [item.id, item]));
  return entityRegistry
    .filter((entry) => {
      const domain = entry.entity_id.split(".")[0] ?? "";
      if (allowedDomains.size && !allowedDomains.has(domain)) return false;
      if (entry.area_id === normalizedAreaId) return true;
      return Boolean(entry.device_id && devicesById.get(entry.device_id)?.area_id === normalizedAreaId);
    })
    .map((entry) => entry.entity_id)
    .sort((a, b) => a.localeCompare(b));
}

export function areaEntityIdsFiltered(
  entityRegistry: EntityRegistryEntry[],
  deviceRegistry: DeviceRegistryEntry[],
  states: Record<string, { attributes?: Record<string, unknown> }>,
  areaId?: string,
  domains?: string[],
  deviceClasses?: string[],
): string[] {
  const normalizedAreaId = (areaId ?? "").trim();
  if (!normalizedAreaId) return [];
  const allowedDomains = new Set((domains ?? []).map((d) => d.trim()).filter(Boolean));
  const allowedClasses = deviceClasses && deviceClasses.length ? new Set(deviceClasses) : null;
  const devicesById = new Map(deviceRegistry.map((item) => [item.id, item]));
  return entityRegistry
    .filter((entry) => {
      const domain = entry.entity_id.split(".")[0] ?? "";
      if (allowedDomains.size && !allowedDomains.has(domain)) return false;
      const inArea =
        entry.area_id === normalizedAreaId ||
        Boolean(entry.device_id && devicesById.get(entry.device_id)?.area_id === normalizedAreaId);
      if (!inArea) return false;
      if (!allowedClasses) return true;
      const dc = states[entry.entity_id]?.attributes?.device_class as string | undefined;
      return dc ? allowedClasses.has(dc) : false;
    })
    .map((entry) => entry.entity_id)
    .sort((a, b) => a.localeCompare(b));
}

export function buildEntitySelector(
  uniqueDomains: string[],
  includeEntities?: string[],
  extra?: Record<string, unknown>,
): Record<string, unknown> {
  const entitySpec: Record<string, unknown> = { ...(extra ?? {}) };
  if (uniqueDomains.length) entitySpec.domain = uniqueDomains;
  if (includeEntities !== undefined) entitySpec.include_entities = includeEntities;
  return { entity: entitySpec };
}

export function buildEntitySelectorFiltered(
  uniqueDomains: string[],
  includeEntities?: string[],
  deviceClasses?: string[],
): Record<string, unknown> {
  const entitySpec: Record<string, unknown> = {};
  if (uniqueDomains.length) entitySpec.domain = uniqueDomains;
  if (includeEntities !== undefined) {
    entitySpec.include_entities = includeEntities;
  } else if (deviceClasses && deviceClasses.length) {
    entitySpec.device_class = deviceClasses.length === 1 ? deviceClasses[0] : deviceClasses;
  }
  return { entity: entitySpec };
}
