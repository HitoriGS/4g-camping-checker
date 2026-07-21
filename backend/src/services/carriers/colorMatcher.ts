import sharp from "sharp";
import type { CoverageLevel, JointColorTier } from "../../types.js";
import { logger } from "../../utils/logger.js";

interface Rgb {
  r: number;
  g: number;
  b: number;
}

interface Lab {
  L: number;
  a: number;
  b: number;
}

/** 距離超過這個閾值就代表既不像任何圖例色，也不像有效資料，判為「無法判讀」。 */
const UNKNOWN_DISTANCE_THRESHOLD = 30;

export function hexToRgb(hex: string): Rgb {
  const clean = hex.replace("#", "");
  return {
    r: parseInt(clean.slice(0, 2), 16),
    g: parseInt(clean.slice(2, 4), 16),
    b: parseInt(clean.slice(4, 6), 16),
  };
}

function srgbChannelToLinear(c: number): number {
  const v = c / 255;
  return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
}

/** sRGB -> CIE Lab，用來算比較貼近人眼感知的色距 (CIE76)。 */
function rgbToLab({ r, g, b }: Rgb): Lab {
  const rl = srgbChannelToLinear(r);
  const gl = srgbChannelToLinear(g);
  const bl = srgbChannelToLinear(b);

  const x = rl * 0.4124 + gl * 0.3576 + bl * 0.1805;
  const y = rl * 0.2126 + gl * 0.7152 + bl * 0.0722;
  const z = rl * 0.0193 + gl * 0.1192 + bl * 0.9505;

  const refX = 0.95047;
  const refY = 1.0;
  const refZ = 1.08883;

  const fx = labPivot(x / refX);
  const fy = labPivot(y / refY);
  const fz = labPivot(z / refZ);

  return {
    L: 116 * fy - 16,
    a: 500 * (fx - fy),
    b: 200 * (fy - fz),
  };
}

function labPivot(t: number): number {
  return t > 0.008856 ? Math.cbrt(t) : t * 7.787 + 16 / 116;
}

function labDistance(a: Lab, b: Lab): number {
  return Math.sqrt((a.L - b.L) ** 2 + (a.a - b.a) ** 2 + (a.b - b.b) ** 2);
}

export interface JointClassifyResult {
  band4G: CoverageLevel;
  band5G: CoverageLevel;
  label: string;
  distance: number;
}

const UNKNOWN_RESULT: JointClassifyResult = {
  band4G: "unknown",
  band5G: "unknown",
  label: "無法判讀",
  distance: Infinity,
};

/**
 * 對一小塊區域的多個像素做多數決分類，避開單一像素被文字/圖標/反鋸齒干擾的問題。
 * 三家電信的圖例都是「一個顏色 = 一組 4G+5G 等級」的聯合圖例（見校色記錄），
 * 所以一次分類直接回傳 band4G 與 band5G 兩個值，而不是分開比對兩份色票。
 */
export function classifyJointSamplePixels(
  pixels: Rgb[],
  tiers: JointColorTier[],
): JointClassifyResult {
  const votes = new Map<string, { count: number; result: JointClassifyResult }>();

  for (const pixel of pixels) {
    const pixelLab = rgbToLab(pixel);
    let best: { tier: JointColorTier; distance: number } | null = null;

    for (const tier of tiers) {
      const distance = labDistance(pixelLab, rgbToLab(hexToRgb(tier.hex)));
      if (!best || distance < best.distance) {
        best = { tier, distance };
      }
    }

    if (!best) continue;
    const isUnknown = best.distance > UNKNOWN_DISTANCE_THRESHOLD;
    const result: JointClassifyResult = isUnknown
      ? { ...UNKNOWN_RESULT, distance: best.distance }
      : {
          band4G: best.tier.band4G,
          band5G: best.tier.band5G,
          label: best.tier.label,
          distance: best.distance,
        };

    const key = `${result.band4G}:${result.band5G}:${result.label}`;
    const existing = votes.get(key);
    if (existing) {
      existing.count += 1;
    } else {
      votes.set(key, { count: 1, result });
    }
  }

  let winner = UNKNOWN_RESULT;
  let winnerVotes = -1;
  for (const { count, result } of votes.values()) {
    if (count > winnerVotes) {
      winnerVotes = count;
      winner = result;
    }
  }

  return winner;
}

/**
 * 從一張截圖 Buffer 中，鎖定目標像素座標周圍一個 sampleSize x sampleSize 的區塊取樣。
 */
export async function samplePixelsAround(
  screenshotBuffer: Buffer,
  centerX: number,
  centerY: number,
  sampleSize = 9,
): Promise<Rgb[]> {
  const half = Math.floor(sampleSize / 2);
  const left = Math.max(0, centerX - half);
  const top = Math.max(0, centerY - half);

  try {
    const { data, info } = await sharp(screenshotBuffer)
      .extract({ left, top, width: sampleSize, height: sampleSize })
      .raw()
      .toBuffer({ resolveWithObject: true });

    const pixels: Rgb[] = [];
    const channels = info.channels;
    for (let i = 0; i < data.length; i += channels) {
      pixels.push({ r: data[i], g: data[i + 1], b: data[i + 2] });
    }
    return pixels;
  } catch (err) {
    logger.warn("colorMatcher", "像素取樣失敗", { error: String(err) });
    return [];
  }
}
