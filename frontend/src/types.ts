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

export interface ReviewItem {
  author: string;
  rating: number | null;
  relativeTime: string;
  approxDate: string | null;
  text: string;
  matchedKeywords: string[];
  sentiment: "positive" | "negative" | "neutral";
}

export type SuitabilityLevel = "good" | "ok" | "bad";

export interface SuitabilityResult {
  score: number;
  level: SuitabilityLevel;
  summary: string;
}

export interface PlaceInfo {
  name: string;
  formattedAddress: string;
  lat: number;
  lng: number;
  mapUrl: string;
  rating?: number;
  userRatingsTotal?: number;
}

export interface LookupResult {
  place: PlaceInfo;
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

export interface JobStatusResponse {
  status: "queued" | "running" | "done" | "error";
  step?: JobStep;
  stepMessage?: string;
  result?: Partial<LookupResult>;
  error?: string;
  warmingUp?: boolean;
}
