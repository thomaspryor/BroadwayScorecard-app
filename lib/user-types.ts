/**
 * User data types for ratings, reviews, watchlist, and profiles.
 * Matches the web project's src/types/user.ts with mobile adaptations.
 */

export interface UserProfile {
  id: string;
  display_name: string;
  avatar_url: string | null;
  default_visibility: 'public' | 'private';
  created_at: string;
  updated_at: string;
}

export interface UserReview {
  id: string;
  user_id: string;
  show_id: string;
  rating: number; // 0.5 to 5.0, half-star precision
  review_text: string | null;
  date_seen: string | null; // ISO date string (YYYY-MM-DD)
  visibility: 'public' | 'private';
  created_at: string;
  updated_at: string;
}

export interface WatchlistEntry {
  id: string;
  user_id: string;
  show_id: string;
  planned_date: string | null; // ISO date string (YYYY-MM-DD)
  created_at: string;
}

export interface UserList {
  id: string;
  user_id: string;
  name: string;
  description: string | null;
  is_ranked: boolean;
  created_at: string;
  updated_at: string;
  // Computed client-side from fetched items:
  item_count?: number;
  preview_show_ids?: string[]; // first 4 show IDs for thumbnail previews
  all_show_ids?: string[]; // all show IDs in the list
}

export interface ListItem {
  id: string;
  list_id: string;
  show_id: string;
  position: number;
  note: string | null;
  created_at: string;
}

/** Pending action for deferred auth flow */
export interface PendingAction {
  type: 'rating' | 'watchlist' | 'add-to-list';
  showId: string;
  rating?: number;
  reviewText?: string;
  dateSeen?: string;
  listId?: string; // for add-to-list
  returnRoute: string; // expo-router path (replaces web's returnUrl)
  timestamp: number;
}
