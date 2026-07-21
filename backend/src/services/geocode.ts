import type { GeocodeAddressComponent, PlaceInfo } from "../types.js";
import { logger } from "../utils/logger.js";

const TEXT_SEARCH_URL = "https://maps.googleapis.com/maps/api/place/textsearch/json";
const DETAILS_URL = "https://maps.googleapis.com/maps/api/place/details/json";

export class GeocodeNotFoundError extends Error {
  constructor(query: string) {
    super(`找不到「${query}」這個地點，請確認名稱是否正確，或加上縣市/鄉鎮名稱再試一次。`);
    this.name = "GeocodeNotFoundError";
  }
}

interface TextSearchResponse {
  status: string;
  results: { place_id: string }[];
  error_message?: string;
}

interface DetailsResponse {
  status: string;
  error_message?: string;
  result: {
    name: string;
    formatted_address: string;
    geometry: { location: { lat: number; lng: number } };
    url: string;
    rating?: number;
    user_ratings_total?: number;
    address_components: { long_name: string; short_name: string; types: string[] }[];
  };
}

function getApiKey(): string {
  const key = process.env.GOOGLE_MAPS_API_KEY;
  if (!key) {
    throw new Error("後端未設定 GOOGLE_MAPS_API_KEY 環境變數");
  }
  return key;
}

/**
 * 用 Google Places Text Search + Place Details 取得地點的正式名稱、地址、座標、
 * 地圖連結與地址元件（後者用來轉換成 TWM/FET 表單需要的縣市/鄉鎮市區/路名）。
 * 這一步全程走官方 API，合法穩定，不涉及任何頁面自動化操作。
 */
export async function geocodePlace(query: string): Promise<PlaceInfo> {
  const apiKey = getApiKey();

  const searchUrl = new URL(TEXT_SEARCH_URL);
  searchUrl.searchParams.set("query", query);
  searchUrl.searchParams.set("region", "tw");
  searchUrl.searchParams.set("language", "zh-TW");
  searchUrl.searchParams.set("key", apiKey);

  const searchRes = await fetch(searchUrl);
  const searchData = (await searchRes.json()) as TextSearchResponse;

  if (searchData.status === "ZERO_RESULTS") {
    throw new GeocodeNotFoundError(query);
  }
  if (searchData.status !== "OK") {
    logger.error("geocode", "Text Search API 錯誤", searchData);
    throw new Error(
      `Google 地理定位服務錯誤（${searchData.status}）：${searchData.error_message ?? "請檢查 GOOGLE_MAPS_API_KEY 是否正確、Places API 是否已啟用、Google Cloud 專案是否已啟用計費"}`,
    );
  }
  if (searchData.results.length === 0) {
    throw new GeocodeNotFoundError(query);
  }

  const placeId = searchData.results[0].place_id;

  const detailsUrl = new URL(DETAILS_URL);
  detailsUrl.searchParams.set("place_id", placeId);
  detailsUrl.searchParams.set(
    "fields",
    "name,formatted_address,geometry,url,rating,user_ratings_total,address_component",
  );
  detailsUrl.searchParams.set("language", "zh-TW");
  detailsUrl.searchParams.set("key", apiKey);

  const detailsRes = await fetch(detailsUrl);
  const detailsData = (await detailsRes.json()) as DetailsResponse;

  if (detailsData.status !== "OK") {
    logger.error("geocode", "Place Details API 錯誤", detailsData);
    throw new Error(`地點詳細資料查詢錯誤：${detailsData.status}`);
  }

  const result = detailsData.result;
  const addressComponents: GeocodeAddressComponent[] = result.address_components.map((c) => ({
    longName: c.long_name,
    shortName: c.short_name,
    types: c.types,
  }));

  return {
    placeId,
    name: result.name,
    formattedAddress: result.formatted_address,
    lat: result.geometry.location.lat,
    lng: result.geometry.location.lng,
    mapUrl: result.url,
    rating: result.rating,
    userRatingsTotal: result.user_ratings_total,
    addressComponents,
  };
}
