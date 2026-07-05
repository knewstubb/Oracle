/**
 * Supabase Database Types for The Oracle
 *
 * Comprehensive type definitions matching the Postgres schema (31 tables + 1 view).
 * These types follow the structure produced by `supabase gen types typescript`.
 *
 * This file will be replaced by auto-generated types once the schema is live:
 *   npx supabase gen types typescript --project-id <id> > src/types/supabase.ts
 *
 * Until then, these hand-written types provide full type safety on query builder calls.
 */

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  public: {
    Tables: {
      _migrations: {
        Row: {
          name: string
          applied_at: string
        }
        Insert: {
          name: string
          applied_at?: string
        }
        Update: {
          name?: string
          applied_at?: string
        }
        Relationships: []
      }
      sets: {
        Row: {
          code: string
          name: string
        }
        Insert: {
          code: string
          name: string
        }
        Update: {
          code?: string
          name?: string
        }
        Relationships: []
      }
      sync_meta: {
        Row: {
          key: string
          value: string | null
          updated_at: string
        }
        Insert: {
          key: string
          value?: string | null
          updated_at?: string
        }
        Update: {
          key?: string
          value?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      card_metadata: {
        Row: {
          card_name: string
          rarity: string | null
          price_usd: number | null
          set_code: string | null
          type_line: string | null
          mana_cost: string | null
          cmc: number | null
          updated_at: string
        }
        Insert: {
          card_name: string
          rarity?: string | null
          price_usd?: number | null
          set_code?: string | null
          type_line?: string | null
          mana_cost?: string | null
          cmc?: number | null
          updated_at?: string
        }
        Update: {
          card_name?: string
          rarity?: string | null
          price_usd?: number | null
          set_code?: string | null
          type_line?: string | null
          mana_cost?: string | null
          cmc?: number | null
          updated_at?: string
        }
        Relationships: []
      }
      precon_cards: {
        Row: {
          id: number
          precon_url: string
          card_name: string
        }
        Insert: {
          id?: never
          precon_url: string
          card_name: string
        }
        Update: {
          id?: never
          precon_url?: string
          card_name?: string
        }
        Relationships: []
      }
      card_kingdom_prices: {
        Row: {
          scryfall_printing_id: string
          price_retail: number
          is_foil: boolean
          updated_at: string
        }
        Insert: {
          scryfall_printing_id: string
          price_retail: number
          is_foil?: boolean
          updated_at?: string
        }
        Update: {
          scryfall_printing_id?: string
          price_retail?: number
          is_foil?: boolean
          updated_at?: string
        }
        Relationships: []
      }
      oracle_to_printings: {
        Row: {
          oracle_id: string
          scryfall_printing_id: string
        }
        Insert: {
          oracle_id: string
          scryfall_printing_id: string
        }
        Update: {
          oracle_id?: string
          scryfall_printing_id?: string
        }
        Relationships: []
      }
      card_definitions: {
        Row: {
          id: number
          oracle_id: string
          card_name: string
          color_identity: string
          type_line: string
          user_id: string
          created_at: string
        }
        Insert: {
          id?: never
          oracle_id: string
          card_name: string
          color_identity?: string
          type_line?: string
          user_id: string
          created_at?: string
        }
        Update: {
          id?: never
          oracle_id?: string
          card_name?: string
          color_identity?: string
          type_line?: string
          user_id?: string
          created_at?: string
        }
        Relationships: []
      }
      decks: {
        Row: {
          id: number
          name: string
          commander_name: string | null
          commander_scryfall_id: string | null
          colour_identity: string | null
          card_count: number | null
          last_synced_at: string | null
          raw_json: string | null
          precon_url: string | null
          deck_type: string
          bracket: string | null
          status: string
          is_precon_mod: boolean
          user_id: string
        }
        Insert: {
          id: number
          name: string
          commander_name?: string | null
          commander_scryfall_id?: string | null
          colour_identity?: string | null
          card_count?: number | null
          last_synced_at?: string | null
          raw_json?: string | null
          precon_url?: string | null
          deck_type?: string
          bracket?: string | null
          status?: string
          is_precon_mod?: boolean
          user_id: string
        }
        Update: {
          id?: number
          name?: string
          commander_name?: string | null
          commander_scryfall_id?: string | null
          colour_identity?: string | null
          card_count?: number | null
          last_synced_at?: string | null
          raw_json?: string | null
          precon_url?: string | null
          deck_type?: string
          bracket?: string | null
          status?: string
          is_precon_mod?: boolean
          user_id?: string
        }
        Relationships: []
      }
      collection: {
        Row: {
          id: number
          card_name: string
          scryfall_id: string | null
          set_code: string | null
          quantity: number
          foil: boolean
          finish: string
          condition: string
          date_added: string | null
          language: string
          purchase_price: number
          collector_number: string | null
          color_identity: string | null
          types: string | null
          edition_name: string | null
          user_id: string
        }
        Insert: {
          id?: never
          card_name: string
          scryfall_id?: string | null
          set_code?: string | null
          quantity?: number
          foil?: boolean
          finish?: string
          condition?: string
          date_added?: string | null
          language?: string
          purchase_price?: number
          collector_number?: string | null
          color_identity?: string | null
          types?: string | null
          edition_name?: string | null
          user_id: string
        }
        Update: {
          id?: never
          card_name?: string
          scryfall_id?: string | null
          set_code?: string | null
          quantity?: number
          foil?: boolean
          finish?: string
          condition?: string
          date_added?: string | null
          language?: string
          purchase_price?: number
          collector_number?: string | null
          color_identity?: string | null
          types?: string | null
          edition_name?: string | null
          user_id?: string
        }
        Relationships: []
      }
      physical_copies: {
        Row: {
          id: number
          card_definition_id: number
          scryfall_printing_id: string | null
          is_proxy: boolean
          proxy_for_definition_id: number | null
          condition: string | null
          is_foil: boolean
          acquired_at: string | null
          quantity: number
          user_id: string
          created_at: string
        }
        Insert: {
          id?: never
          card_definition_id: number
          scryfall_printing_id?: string | null
          is_proxy?: boolean
          proxy_for_definition_id?: number | null
          condition?: string | null
          is_foil?: boolean
          acquired_at?: string | null
          quantity?: number
          user_id: string
          created_at?: string
        }
        Update: {
          id?: never
          card_definition_id?: number
          scryfall_printing_id?: string | null
          is_proxy?: boolean
          proxy_for_definition_id?: number | null
          condition?: string | null
          is_foil?: boolean
          acquired_at?: string | null
          quantity?: number
          user_id?: string
          created_at?: string
        }
        Relationships: []
      }
      deck_cards: {
        Row: {
          id: number
          deck_id: number
          card_name: string
          scryfall_id: string | null
          set_code: string | null
          quantity: number
          categories: string | null
          tags: string | null
          is_commander: boolean
          dead_weight_flag: string | null
          dead_weight_reason: string | null
          ownership_status: string | null
          proxy_of_deck_id: number | null
          physical_copy_id: number | null
          card_definition_id: number | null
          is_generic_land: boolean
          user_id: string
        }
        Insert: {
          id?: never
          deck_id: number
          card_name: string
          scryfall_id?: string | null
          set_code?: string | null
          quantity?: number
          categories?: string | null
          tags?: string | null
          is_commander?: boolean
          dead_weight_flag?: string | null
          dead_weight_reason?: string | null
          ownership_status?: string | null
          proxy_of_deck_id?: number | null
          physical_copy_id?: number | null
          card_definition_id?: number | null
          is_generic_land?: boolean
          user_id: string
        }
        Update: {
          id?: never
          deck_id?: number
          card_name?: string
          scryfall_id?: string | null
          set_code?: string | null
          quantity?: number
          categories?: string | null
          tags?: string | null
          is_commander?: boolean
          dead_weight_flag?: string | null
          dead_weight_reason?: string | null
          ownership_status?: string | null
          proxy_of_deck_id?: number | null
          physical_copy_id?: number | null
          card_definition_id?: number | null
          is_generic_land?: boolean
          user_id?: string
        }
        Relationships: []
      }
      generic_land_preferences: {
        Row: {
          card_definition_id: number
          scryfall_printing_id: string
          updated_at: string
        }
        Insert: {
          card_definition_id: number
          scryfall_printing_id: string
          updated_at?: string
        }
        Update: {
          card_definition_id?: number
          scryfall_printing_id?: string
          updated_at?: string
        }
        Relationships: []
      }
      deck_allocations: {
        Row: {
          id: number
          card_name: string
          scryfall_id: string | null
          set_code: string | null
          collector_number: string | null
          deck_id: number
          role: string
          priority_override: boolean
          written_to_archidekt: boolean
          written_at: string | null
          assigned_at: string
          user_id: string
        }
        Insert: {
          id?: never
          card_name: string
          scryfall_id?: string | null
          set_code?: string | null
          collector_number?: string | null
          deck_id: number
          role: string
          priority_override?: boolean
          written_to_archidekt?: boolean
          written_at?: string | null
          assigned_at?: string
          user_id: string
        }
        Update: {
          id?: never
          card_name?: string
          scryfall_id?: string | null
          set_code?: string | null
          collector_number?: string | null
          deck_id?: number
          role?: string
          priority_override?: boolean
          written_to_archidekt?: boolean
          written_at?: string | null
          assigned_at?: string
          user_id?: string
        }
        Relationships: []
      }
      proxy_allocations: {
        Row: {
          id: number
          card_name: string
          deck_id: number
          role: string
          assigned_at: string
          written_to_archidekt: boolean
          written_at: string | null
          user_id: string
        }
        Insert: {
          id?: never
          card_name: string
          deck_id: number
          role: string
          assigned_at?: string
          written_to_archidekt?: boolean
          written_at?: string | null
          user_id: string
        }
        Update: {
          id?: never
          card_name?: string
          deck_id?: number
          role?: string
          assigned_at?: string
          written_to_archidekt?: boolean
          written_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      deck_priority: {
        Row: {
          deck_id: number
          priority: number
          user_id: string
          updated_at: string
        }
        Insert: {
          deck_id: number
          priority?: number
          user_id: string
          updated_at?: string
        }
        Update: {
          deck_id?: number
          priority?: number
          user_id?: string
          updated_at?: string
        }
        Relationships: []
      }
      deck_strategy: {
        Row: {
          deck_id: number
          win_condition: string | null
          table_context: string | null
          bracket: number | null
          budget_mode: string | null
          budget_ceiling: number | null
          frustration: string | null
          strategy_notes: string | null
          format_rules: string | null
          health_overrides: string | null
          user_id: string
          updated_at: string
        }
        Insert: {
          deck_id: number
          win_condition?: string | null
          table_context?: string | null
          bracket?: number | null
          budget_mode?: string | null
          budget_ceiling?: number | null
          frustration?: string | null
          strategy_notes?: string | null
          format_rules?: string | null
          health_overrides?: string | null
          user_id: string
          updated_at?: string
        }
        Update: {
          deck_id?: number
          win_condition?: string | null
          table_context?: string | null
          bracket?: number | null
          budget_mode?: string | null
          budget_ceiling?: number | null
          frustration?: string | null
          strategy_notes?: string | null
          format_rules?: string | null
          health_overrides?: string | null
          user_id?: string
          updated_at?: string
        }
        Relationships: []
      }
      deck_health: {
        Row: {
          deck_id: number
          result_json: string
          overall_status: string
          user_id: string
          computed_at: string
        }
        Insert: {
          deck_id: number
          result_json: string
          overall_status: string
          user_id: string
          computed_at?: string
        }
        Update: {
          deck_id?: number
          result_json?: string
          overall_status?: string
          user_id?: string
          computed_at?: string
        }
        Relationships: []
      }
      deck_documentation: {
        Row: {
          deck_id: number
          strategy_playstyle: string | null
          synergy_lines: string | null
          strengths_weaknesses: string | null
          matchup_notes: string | null
          mulligan_guide: string | null
          user_id: string
          updated_at: string
        }
        Insert: {
          deck_id: number
          strategy_playstyle?: string | null
          synergy_lines?: string | null
          strengths_weaknesses?: string | null
          matchup_notes?: string | null
          mulligan_guide?: string | null
          user_id: string
          updated_at?: string
        }
        Update: {
          deck_id?: number
          strategy_playstyle?: string | null
          synergy_lines?: string | null
          strengths_weaknesses?: string | null
          matchup_notes?: string | null
          mulligan_guide?: string | null
          user_id?: string
          updated_at?: string
        }
        Relationships: []
      }
      deck_notes: {
        Row: {
          id: number
          deck_id: number
          content: string
          user_id: string
          created_at: string
        }
        Insert: {
          id?: never
          deck_id: number
          content: string
          user_id: string
          created_at?: string
        }
        Update: {
          id?: never
          deck_id?: number
          content?: string
          user_id?: string
          created_at?: string
        }
        Relationships: []
      }
      deck_overview_content: {
        Row: {
          deck_id: number
          content: string
          user_id: string
          generated_at: string
        }
        Insert: {
          deck_id: number
          content: string
          user_id: string
          generated_at?: string
        }
        Update: {
          deck_id?: number
          content?: string
          user_id?: string
          generated_at?: string
        }
        Relationships: []
      }
      deck_combos: {
        Row: {
          deck_id: number
          content: string
          user_id: string
          generated_at: string
        }
        Insert: {
          deck_id: number
          content: string
          user_id: string
          generated_at?: string
        }
        Update: {
          deck_id?: number
          content?: string
          user_id?: string
          generated_at?: string
        }
        Relationships: []
      }
      deck_mana_analysis: {
        Row: {
          deck_id: number
          content: string
          user_id: string
          generated_at: string
        }
        Insert: {
          deck_id: number
          content: string
          user_id: string
          generated_at?: string
        }
        Update: {
          deck_id?: number
          content?: string
          user_id?: string
          generated_at?: string
        }
        Relationships: []
      }
      deck_upgrades: {
        Row: {
          deck_id: number
          content: string
          owned: boolean
          suggested_cut: string | null
          cut_flag: string | null
          price: number | null
          synergy_score: number | null
          user_id: string
          generated_at: string
        }
        Insert: {
          deck_id: number
          content: string
          owned?: boolean
          suggested_cut?: string | null
          cut_flag?: string | null
          price?: number | null
          synergy_score?: number | null
          user_id: string
          generated_at?: string
        }
        Update: {
          deck_id?: number
          content?: string
          owned?: boolean
          suggested_cut?: string | null
          cut_flag?: string | null
          price?: number | null
          synergy_score?: number | null
          user_id?: string
          generated_at?: string
        }
        Relationships: []
      }
      deck_ratings: {
        Row: {
          deck_id: number
          content: string
          user_id: string
          generated_at: string
        }
        Insert: {
          deck_id: number
          content: string
          user_id: string
          generated_at?: string
        }
        Update: {
          deck_id?: number
          content?: string
          user_id?: string
          generated_at?: string
        }
        Relationships: []
      }
      dead_weight_dismissals: {
        Row: {
          id: number
          deck_id: number
          card_name: string
          user_id: string
          dismissed_at: string
        }
        Insert: {
          id?: never
          deck_id: number
          card_name: string
          user_id: string
          dismissed_at?: string
        }
        Update: {
          id?: never
          deck_id?: number
          card_name?: string
          user_id?: string
          dismissed_at?: string
        }
        Relationships: []
      }
      debrief_sessions: {
        Row: {
          id: number
          deck_id: number
          status: string
          brief_json: string | null
          recommendations_json: string | null
          current_rec_index: number
          conversation_json: string | null
          user_id: string
          created_at: string
          completed_at: string | null
        }
        Insert: {
          id?: never
          deck_id: number
          status?: string
          brief_json?: string | null
          recommendations_json?: string | null
          current_rec_index?: number
          conversation_json?: string | null
          user_id: string
          created_at?: string
          completed_at?: string | null
        }
        Update: {
          id?: never
          deck_id?: number
          status?: string
          brief_json?: string | null
          recommendations_json?: string | null
          current_rec_index?: number
          conversation_json?: string | null
          user_id?: string
          created_at?: string
          completed_at?: string | null
        }
        Relationships: []
      }
      debrief_actions: {
        Row: {
          id: number
          session_id: number
          action_type: string
          cut_card: string
          add_card: string
          reason: string
          notion_logged: boolean
          user_id: string
          created_at: string
        }
        Insert: {
          id?: never
          session_id: number
          action_type: string
          cut_card: string
          add_card: string
          reason: string
          notion_logged?: boolean
          user_id: string
          created_at?: string
        }
        Update: {
          id?: never
          session_id?: number
          action_type?: string
          cut_card?: string
          add_card?: string
          reason?: string
          notion_logged?: boolean
          user_id?: string
          created_at?: string
        }
        Relationships: []
      }
      brew_sessions: {
        Row: {
          id: number
          deck_id: number | null
          status: string
          path_type: string | null
          commander_name: string | null
          colour_identity: string | null
          concept_description: string | null
          brief_json: string | null
          skeleton_json: string | null
          refinement_history_json: string
          conversation_json: string
          decision_log_json: string
          assessment_cache_json: string
          model_id: string | null
          user_id: string
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: never
          deck_id?: number | null
          status?: string
          path_type?: string | null
          commander_name?: string | null
          colour_identity?: string | null
          concept_description?: string | null
          brief_json?: string | null
          skeleton_json?: string | null
          refinement_history_json?: string
          conversation_json?: string
          decision_log_json?: string
          assessment_cache_json?: string
          model_id?: string | null
          user_id: string
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: never
          deck_id?: number | null
          status?: string
          path_type?: string | null
          commander_name?: string | null
          colour_identity?: string | null
          concept_description?: string | null
          brief_json?: string | null
          skeleton_json?: string | null
          refinement_history_json?: string
          conversation_json?: string
          decision_log_json?: string
          assessment_cache_json?: string
          model_id?: string | null
          user_id?: string
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      precon_mod_state: {
        Row: {
          id: number
          deck_id: number
          swaps_used: number
          sol_ring_removed: boolean
          rarity_mythic_used: number
          rarity_rare_used: number
          rarity_uncommon_used: number
          rarity_common_used: number
          budget_spent: number
          user_id: string
          updated_at: string
        }
        Insert: {
          id?: never
          deck_id: number
          swaps_used?: number
          sol_ring_removed?: boolean
          rarity_mythic_used?: number
          rarity_rare_used?: number
          rarity_uncommon_used?: number
          rarity_common_used?: number
          budget_spent?: number
          user_id: string
          updated_at?: string
        }
        Update: {
          id?: never
          deck_id?: number
          swaps_used?: number
          sol_ring_removed?: boolean
          rarity_mythic_used?: number
          rarity_rare_used?: number
          rarity_uncommon_used?: number
          rarity_common_used?: number
          budget_spent?: number
          user_id?: string
          updated_at?: string
        }
        Relationships: []
      }
      upgrade_change_log: {
        Row: {
          id: number
          deck_id: number
          cut_card: string
          add_card: string
          reason: string
          skipped: boolean
          user_id: string
          date: string
        }
        Insert: {
          id?: never
          deck_id: number
          cut_card: string
          add_card: string
          reason?: string
          skipped?: boolean
          user_id: string
          date?: string
        }
        Update: {
          id?: never
          deck_id?: number
          cut_card?: string
          add_card?: string
          reason?: string
          skipped?: boolean
          user_id?: string
          date?: string
        }
        Relationships: []
      }
      sync_runs: {
        Row: {
          id: number
          started_at: string
          completed_at: string | null
          trigger: string
          decks_processed: number
          decks_succeeded: number
          decks_failed: number
          details: string | null
          user_id: string
        }
        Insert: {
          id?: never
          started_at: string
          completed_at?: string | null
          trigger: string
          decks_processed?: number
          decks_succeeded?: number
          decks_failed?: number
          details?: string | null
          user_id: string
        }
        Update: {
          id?: never
          started_at?: string
          completed_at?: string | null
          trigger?: string
          decks_processed?: number
          decks_succeeded?: number
          decks_failed?: number
          details?: string | null
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      shared_cards: {
        Row: {
          card_name: string
          deck_count: number
          deck_ids: string
          owned_copies: number
        }
        Relationships: []
      }
    }
    Functions: {
      get_price_to_add: {
        Args: {
          card_def_id: number
        }
        Returns: number | null
      }
      get_bulk_price_to_add: {
        Args: Record<string, never>
        Returns: Array<{
          card_definition_id: number
          price_to_add: number | null
        }>
      }
      get_collection_rollup: {
        Args: {
          p_user_id: string
        }
        Returns: Array<{
          card_definition_id: number
          card_name: string
          oracle_id: string
          color_identity: string
          type_line: string
          total_quantity: number
          price_to_add: number | null
          owned_valuation: number | null
        }>
      }
      get_shared_cards: {
        Args: {
          p_user_id: string
        }
        Returns: Array<{
          card_name: string
          deck_count: number
          deck_ids: string
          owned_copies: number
        }>
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

/**
 * Helper types for convenient access to table row types.
 * Usage: type Deck = Tables<'decks'>
 */
export type Tables<T extends keyof Database['public']['Tables']> =
  Database['public']['Tables'][T]['Row']

export type InsertDto<T extends keyof Database['public']['Tables']> =
  Database['public']['Tables'][T]['Insert']

export type UpdateDto<T extends keyof Database['public']['Tables']> =
  Database['public']['Tables'][T]['Update']
