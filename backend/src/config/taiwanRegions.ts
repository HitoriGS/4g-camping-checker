import type { GeocodeAddressComponent } from "../types.js";

/**
 * Google 地理編碼有時回傳「台」有時「臺」，電信官網下拉選單用字不一定一致，
 * 這裡統一正規化成「台」，比對時兩邊都跑一次正規化即可。
 */
export function normalizeCountyName(name: string): string {
  return name.replace(/臺/g, "台").trim();
}

export interface RegionParts {
  county: string | null;
  district: string | null;
  road: string | null;
}

/**
 * 從 Google Geocoding 回傳的 address_components 中萃取「縣市／鄉鎮市區／路名」，
 * 給 TWM / FET 的下拉選單表單使用。Google 對台灣地址的分類：
 * - administrative_area_level_1 = 縣市
 * - administrative_area_level_2 / locality = 鄉鎮市區（依地區而異）
 * - route = 路名
 */
export function extractRegionParts(components: GeocodeAddressComponent[]): RegionParts {
  const findByType = (type: string) =>
    components.find((c) => c.types.includes(type))?.longName ?? null;

  const county = findByType("administrative_area_level_1");
  const district =
    findByType("administrative_area_level_2") ??
    findByType("administrative_area_level_3") ??
    findByType("locality");
  const road = findByType("route");

  return {
    county: county ? normalizeCountyName(county) : null,
    district: district ? normalizeCountyName(district) : null,
    road,
  };
}
