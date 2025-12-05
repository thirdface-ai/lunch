import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import SupabaseService from '../services/supabaseService';
import { FinalResult } from '../types';

// Query keys for React Query
const QUERY_KEYS = {
  favorites: ['favorites'] as const,
  favoritesList: () => [...QUERY_KEYS.favorites, 'list'] as const,
};

/**
 * Hook for managing favorites with TanStack Query
 */
export const useFavorites = () => {
  const queryClient = useQueryClient();

  // Query: Get all favorites
  const {
    data: favorites = [],
    isLoading: isLoadingFavorites,
    error: favoritesError,
  } = useQuery({
    queryKey: QUERY_KEYS.favoritesList(),
    queryFn: async () => {
      const result = await SupabaseService.getFavorites();
      return result;
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
  });

  // Mutation: Add favorite
  const addFavoriteMutation = useMutation({
    mutationFn: (result: FinalResult) => SupabaseService.addFavorite(result),
    onSuccess: () => {
      // Invalidate and refetch favorites
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.favorites });
    },
  });

  // Mutation: Remove favorite
  const removeFavoriteMutation = useMutation({
    mutationFn: (placeId: string) => SupabaseService.removeFavorite(placeId),
    onSuccess: () => {
      // Invalidate and refetch favorites
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.favorites });
    },
  });

  // Helper to check if a place is favorited
  const isFavorite = (placeId: string): boolean => {
    return favorites.some(f => f.place_id === placeId);
  };

  // Toggle favorite status
  const toggleFavorite = async (result: FinalResult): Promise<boolean> => {
    if (isFavorite(result.place_id)) {
      await removeFavoriteMutation.mutateAsync(result.place_id);
      return false;
    } else {
      await addFavoriteMutation.mutateAsync(result);
      return true;
    }
  };

  return {
    favorites,
    isLoadingFavorites,
    favoritesError,
    addFavorite: addFavoriteMutation.mutate,
    removeFavorite: removeFavoriteMutation.mutate,
    toggleFavorite,
    isFavorite,
    isAddingFavorite: addFavoriteMutation.isPending,
    isRemovingFavorite: removeFavoriteMutation.isPending,
  };
};

export default useFavorites;

