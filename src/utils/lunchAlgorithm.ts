
import { HungerVibe, PricePoint, GooglePlace } from '../types';

// Helper to generate specific search queries based on the user's vibe
export const getSearchQueriesForVibe = (vibe: HungerVibe | null): string[] => {
  if (!vibe) return ['restaurant', 'lunch', 'food', 'new opening']; // Fallback for pure freestyle

  let queries: string[];
  switch (vibe) {
    case HungerVibe.GRAB_AND_GO:
      queries = ['quick bites', 'takeout food', 'food truck', 'bakery', 'new opening'];
      break;
    case HungerVibe.LIGHT_AND_CLEAN:
      queries = ['healthy restaurant', 'salad bar', 'sushi', 'vietnamese restaurant', 'new opening'];
      break;
    case HungerVibe.HEARTY_AND_RICH:
      queries = ['comfort food', 'ramen shop', 'burger joint', 'italian restaurant', 'new opening'];
      break;
    case HungerVibe.SPICY_AND_BOLD:
      queries = ['spicy food', 'thai restaurant', 'indian restaurant', 'sichuan cuisine', 'new opening'];
      break;
    case HungerVibe.VIEW_AND_VIBE:
      queries = ['restaurant with a view', 'rooftop restaurant', 'beautiful restaurant', 'new opening'];
      break;
    case HungerVibe.AUTHENTIC_AND_CLASSIC:
      queries = ['classic diner', 'traditional cuisine', 'historic restaurant'];
      break;
    default:
      queries = ['restaurant', 'new opening'];
  }
  return [...queries, 'restaurant'];
};

// Revised scoring function that prioritizes proximity within the allowed range
export const calculateCandidateScore = (
  p: GooglePlace,
  price: PricePoint | null,
  durationSeconds: number | undefined,
  maxDurationSeconds: number
): number => {
    let score = 0;
    const MAX_PROXIMITY_SCORE = 15;

    // 1. Proximity Score (Weight: 15)
    if (durationSeconds !== undefined) {
        const proximityRatio = durationSeconds / maxDurationSeconds;
        const proximityScore = MAX_PROXIMITY_SCORE * (1 - proximityRatio);
        score += Math.max(0, proximityScore);
    }
    
    // 2. Price Match Score (Weight: 10)
    const priceLevel = p.price_level;
    let priceMatchScore = 0;
    if (priceLevel !== undefined && price !== null) {
        switch (price) {
            case PricePoint.INTERN:
                if (priceLevel <= 1) priceMatchScore = 10;
                else if (priceLevel === 2) priceMatchScore = 5;
                else priceMatchScore = -5;
                break;
            case PricePoint.SENIOR:
                if (priceLevel >= 2 && priceLevel <= 3) priceMatchScore = 10;
                else if (priceLevel === 1 || priceLevel === 4) priceMatchScore = 5;
                break;
            case PricePoint.COMPANY_CARD:
                if (priceLevel >= 3) priceMatchScore = 10;
                else if (priceLevel === 2) priceMatchScore = 5;
                else priceMatchScore = -5;
                break;
        }
    } else {
        // Neutral/High score if no price preference or no data
        priceMatchScore = 7; 
    }
    score += priceMatchScore;

    const rating = p.rating || 0;
    const reviews = p.user_ratings_total || 0;

    // 3. "Hidden Gem" Score (Weight: 5)
    if (rating > 4.3 && reviews >= 50 && reviews < 750) {
        score += 5;
    }

    // 4. "Fresh Drop" Score (Weight: 8)
    if (rating >= 4.0 && reviews < 50 && reviews > 0) {
        score += 8;
    }

    // 5. Raw Rating Score (Weight: 1 per star)
    score += rating;

    return score;
};
