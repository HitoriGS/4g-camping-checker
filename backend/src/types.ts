export type CarrierId = "CHT" | "TWM" | "FET";

export type CoverageLevel = "good" | "fair" | "weak" | "unknown";

export interface CarrierResult {
  carrier: CarrierId;
  displayName: string;
  band4G: CoverageLevel;
  band5G: CoverageLevel;
  note?: string;
  unavailable?: boolean;
  reason?: string;
}

export type ReviewSentiment = "positive" | "negative" | "neutral";

export interface ReviewItem {
  author: string;
  rating: number | null;
  relativeTime: string;
  approxDate: string | null;
  text: string;
  matchedKeywords: string[];
  sentiment: ReviewSentiment;
}

export type SuitabilityLevel = "good" | "ok" | "bad";

export interface SuitabilityResult {
  score: number;
  level: SuitabilityLevel;
  summary: string;
}

export interface PlaceInfo {
  placeId: string;
  name: string;
  formattedAddress: string;
  lat: number;
  lng: number;
  mapUrl: string;
  rating?: number;
  userRatingsTotal?: number;
  addressComponents: GeocodeAddressComponent[];
}

export interface GeocodeAddressComponent {
  longName: string;
  shortName: string;
  types: string[];
}

export interface LookupResult {
  place: Omit<PlaceInfo, "addressComponents">;
  carriers: CarrierResult[];
  reviews: ReviewItem[];
  reviewsUnavailable?: boolean;
  reviewsUnavailableReason?: string;
  suitability: SuitabilityResult;
}

export type JobStep =
  | "queued"
  | "geocoding"
  | "carriers"
  | "reviews"
  | "aggregating"
  | "done";

export type JobStatus = "queued" | "running" | "done" | "error";

export interface Job {
  id: string;
  query: string;
  status: JobStatus;
  step?: JobStep;
  stepMessage?: string;
  result?: Partial<LookupResult>;
  error?: string;
  createdAt: number;
  updatedAt: number;
}

/**
 * 三家電信的涵蓋率地圖實測後發現都是「一個顏色同時代表一組 4G+5G 等級」的
 * 聯合圖例（見 docs/RECON_NOTES.md 校色記錄），不是 4G/5G 各自獨立的色票，
 * 所以一個色階要同時帶出 band4G 與 band5G 兩個結果。
 */
export interface JointColorTier {
  label: string;
  hex: string;
  band4G: CoverageLevel;
  band5G: CoverageLevel;
}
