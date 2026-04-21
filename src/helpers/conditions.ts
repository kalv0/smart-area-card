import type { HassEntity } from "home-assistant-js-websocket";
import type { ConditionConfig } from "./types";

export const evaluateCondition = (
  states: Record<string, HassEntity>,
  condition?: ConditionConfig,
): boolean => {
  if (!condition) return false;

  const entity = states[condition.entity];
  if (!entity) return false;

  const current = entity.state;
  const target = condition.value;
  const currentNumber = Number(current);
  const targetNumber = Number(target);
  const numeric = Number.isFinite(currentNumber) && Number.isFinite(targetNumber);

  switch (condition.operator) {
    case "eq":
      return String(current) === String(target);
    case "neq":
      return String(current) !== String(target);
    case "gt":
      return numeric && currentNumber > targetNumber;
    case "gte":
      return numeric && currentNumber >= targetNumber;
    case "lt":
      return numeric && currentNumber < targetNumber;
    case "lte":
      return numeric && currentNumber <= targetNumber;
    case "in":
      return Array.isArray(target) && target.map(String).includes(String(current));
    case "not_in":
      return Array.isArray(target) && !target.map(String).includes(String(current));
    default:
      return false;
  }
};

export const evaluateConditions = (
  states: Record<string, HassEntity>,
  conditions?: ConditionConfig[],
): boolean => (conditions?.length ? conditions.some((condition) => evaluateCondition(states, condition)) : false);

export const evaluateAllConditions = (
  states: Record<string, HassEntity>,
  conditions?: ConditionConfig[],
): boolean => (conditions?.length ? conditions.every((condition) => evaluateCondition(states, condition)) : false);
