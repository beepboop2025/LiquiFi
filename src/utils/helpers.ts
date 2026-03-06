import { randInt, randIntInclusive } from "./math";

export const backendId = (prefix = "id"): string =>
  `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

export const createId = (prefix: string): string =>
  `${prefix}-${Date.now()}-${randIntInclusive(1000, 9999)}`;

export const randomOf = <T>(list: T[]): T | undefined =>
  Array.isArray(list) && list.length > 0 ? list[randInt(0, list.length)] : undefined;

export const shortHash = (input?: string): string => {
  const str = input || `${Date.now()}-${Math.random()}`;
  let h1 = 5381;
  let h2 = 52711;
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i);
    h1 = ((h1 << 5) + h1 + ch) >>> 0;
    h2 = ((h2 << 5) + h2 + ch) >>> 0;
  }
  return `${h1.toString(16).slice(0, 4)}...${h2.toString(16).slice(0, 4)}`;
};

export const isInfraCounterparty = (name = ""): boolean =>
  /ccil|triparty|liquid/i.test(name);

export const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));
