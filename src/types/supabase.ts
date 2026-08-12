export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      _migrations: {
        Row: {
          applied_at: string | null
          name: string
        }
        Insert: {
          applied_at?: string | null
          name: string
        }
        Update: {
          applied_at?: string | null
          name?: string
        }
        Relationships: []
      }
      brew_sessions: {
        Row: {
          assessment_cache_json: string | null
          brief_json: string | null
          colour_identity: string | null
          commander_name: string | null
          concept_description: string | null
          conversation_json: string | null
          created_at: string
          decision_log_json: string | null
          deck_id: number | null
          id: number
          model_id: string | null
          path_type: string | null
          refinement_history_json: string | null
          skeleton_json: string | null
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          assessment_cache_json?: string | null
          brief_json?: string | null
          colour_identity?: string | null
          commander_name?: string | null
          concept_description?: string | null
          conversation_json?: string | null
          created_at?: string
          decision_log_json?: string | null
          deck_id?: number | null
          id?: never
          model_id?: string | null
          path_type?: string | null
          refinement_history_json?: string | null
          skeleton_json?: string | null
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          assessment_cache_json?: string | null
          brief_json?: string | null
          colour_identity?: string | null
          commander_name?: string | null
          concept_description?: string | null
          conversation_json?: string | null
          created_at?: string
          decision_log_json?: string | null
          deck_id?: number | null
          id?: never
          model_id?: string | null
          path_type?: string | null
          refinement_history_json?: string | null
          skeleton_json?: string | null
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "brew_sessions_deck_id_fkey"
            columns: ["deck_id"]
            isOneToOne: false
            referencedRelation: "decks"
            referencedColumns: ["id"]
          },
        ]
      }
      commander_content: {
        Row: {
          card_name: string
          created_at: string | null
          distilled_at: string | null
          distilled_summary: string | null
          fetched_at: string | null
          id: number
          key_points: string[] | null
          source: string
          source_url: string | null
          title: string | null
        }
        Insert: {
          card_name: string
          created_at?: string | null
          distilled_at?: string | null
          distilled_summary?: string | null
          fetched_at?: string | null
          id?: number
          key_points?: string[] | null
          source: string
          source_url?: string | null
          title?: string | null
        }
        Update: {
          card_name?: string
          created_at?: string | null
          distilled_at?: string | null
          distilled_summary?: string | null
          fetched_at?: string | null
          id?: number
          key_points?: string[] | null
          source?: string
          source_url?: string | null
          title?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "commander_content_card_name_fkey"
            columns: ["card_name"]
            isOneToOne: false
            referencedRelation: "ref_cards"
            referencedColumns: ["name"]
          },
        ]
      }
      commander_strategies: {
        Row: {
          card_name: string
          edhrec_themes: string[] | null
          edhrec_url: string | null
          fetched_at: string | null
          primary_strategy: string | null
          secondary_strategies: string[] | null
          theme_count: number | null
          updated_at: string | null
        }
        Insert: {
          card_name: string
          edhrec_themes?: string[] | null
          edhrec_url?: string | null
          fetched_at?: string | null
          primary_strategy?: string | null
          secondary_strategies?: string[] | null
          theme_count?: number | null
          updated_at?: string | null
        }
        Update: {
          card_name?: string
          edhrec_themes?: string[] | null
          edhrec_url?: string | null
          fetched_at?: string | null
          primary_strategy?: string | null
          secondary_strategies?: string[] | null
          theme_count?: number | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "commander_strategies_card_name_fkey"
            columns: ["card_name"]
            isOneToOne: true
            referencedRelation: "ref_cards"
            referencedColumns: ["name"]
          },
        ]
      }
      debrief_actions: {
        Row: {
          action_applied: boolean
          action_type: string
          add_card: string
          created_at: string
          cut_card: string
          id: number
          reason: string
          session_id: number
          user_id: string
        }
        Insert: {
          action_applied?: boolean
          action_type: string
          add_card: string
          created_at?: string
          cut_card: string
          id?: never
          reason: string
          session_id: number
          user_id: string
        }
        Update: {
          action_applied?: boolean
          action_type?: string
          add_card?: string
          created_at?: string
          cut_card?: string
          id?: never
          reason?: string
          session_id?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "debrief_actions_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "debrief_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      debrief_sessions: {
        Row: {
          brief_json: string | null
          completed_at: string | null
          conversation_json: string | null
          created_at: string
          current_rec_index: number | null
          deck_id: number
          id: number
          recommendations_json: string | null
          status: string
          user_id: string
        }
        Insert: {
          brief_json?: string | null
          completed_at?: string | null
          conversation_json?: string | null
          created_at?: string
          current_rec_index?: number | null
          deck_id: number
          id?: never
          recommendations_json?: string | null
          status?: string
          user_id: string
        }
        Update: {
          brief_json?: string | null
          completed_at?: string | null
          conversation_json?: string | null
          created_at?: string
          current_rec_index?: number | null
          deck_id?: number
          id?: never
          recommendations_json?: string | null
          status?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "debrief_sessions_deck_id_fkey"
            columns: ["deck_id"]
            isOneToOne: false
            referencedRelation: "decks"
            referencedColumns: ["id"]
          },
        ]
      }
      deck_cards: {
        Row: {
          card_name: string
          categories: string | null
          copy_id: number | null
          dead_weight_flag: string | null
          dead_weight_reason: string | null
          deck_id: number
          id: number
          is_commander: boolean | null
          ownership_status: string | null
          proxy_of_deck_id: number | null
          quantity: number | null
          scryfall_id: string | null
          set_code: string | null
          tags: string | null
          user_id: string
        }
        Insert: {
          card_name: string
          categories?: string | null
          copy_id?: number | null
          dead_weight_flag?: string | null
          dead_weight_reason?: string | null
          deck_id: number
          id?: never
          is_commander?: boolean | null
          ownership_status?: string | null
          proxy_of_deck_id?: number | null
          quantity?: number | null
          scryfall_id?: string | null
          set_code?: string | null
          tags?: string | null
          user_id: string
        }
        Update: {
          card_name?: string
          categories?: string | null
          copy_id?: number | null
          dead_weight_flag?: string | null
          dead_weight_reason?: string | null
          deck_id?: number
          id?: never
          is_commander?: boolean | null
          ownership_status?: string | null
          proxy_of_deck_id?: number | null
          quantity?: number | null
          scryfall_id?: string | null
          set_code?: string | null
          tags?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "deck_cards_copy_id_fkey"
            columns: ["copy_id"]
            isOneToOne: false
            referencedRelation: "user_copies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deck_cards_deck_id_fkey"
            columns: ["deck_id"]
            isOneToOne: false
            referencedRelation: "decks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deck_cards_physical_copy_id_fkey"
            columns: ["copy_id"]
            isOneToOne: false
            referencedRelation: "user_copies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deck_cards_proxy_of_deck_id_fkey"
            columns: ["proxy_of_deck_id"]
            isOneToOne: false
            referencedRelation: "decks"
            referencedColumns: ["id"]
          },
        ]
      }
      deck_combos: {
        Row: {
          content: string
          deck_id: number
          generated_at: string | null
          user_id: string
        }
        Insert: {
          content: string
          deck_id: number
          generated_at?: string | null
          user_id: string
        }
        Update: {
          content?: string
          deck_id?: number
          generated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "deck_combos_deck_id_fkey"
            columns: ["deck_id"]
            isOneToOne: true
            referencedRelation: "decks"
            referencedColumns: ["id"]
          },
        ]
      }
      deck_documentation: {
        Row: {
          deck_id: number
          matchup_notes: string | null
          mulligan_guide: string | null
          strategy_playstyle: string | null
          strengths_weaknesses: string | null
          synergy_lines: string | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          deck_id: number
          matchup_notes?: string | null
          mulligan_guide?: string | null
          strategy_playstyle?: string | null
          strengths_weaknesses?: string | null
          synergy_lines?: string | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          deck_id?: number
          matchup_notes?: string | null
          mulligan_guide?: string | null
          strategy_playstyle?: string | null
          strengths_weaknesses?: string | null
          synergy_lines?: string | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "deck_documentation_deck_id_fkey"
            columns: ["deck_id"]
            isOneToOne: true
            referencedRelation: "decks"
            referencedColumns: ["id"]
          },
        ]
      }
      deck_folders: {
        Row: {
          color: string | null
          created_at: string
          id: number
          name: string
          position: number
          updated_at: string
          user_id: string
        }
        Insert: {
          color?: string | null
          created_at?: string
          id?: number
          name: string
          position?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          color?: string | null
          created_at?: string
          id?: number
          name?: string
          position?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      deck_health: {
        Row: {
          computed_at: string
          deck_id: number
          overall_status: string
          result_json: string
          user_id: string
        }
        Insert: {
          computed_at?: string
          deck_id: number
          overall_status: string
          result_json: string
          user_id: string
        }
        Update: {
          computed_at?: string
          deck_id?: number
          overall_status?: string
          result_json?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "deck_health_deck_id_fkey"
            columns: ["deck_id"]
            isOneToOne: true
            referencedRelation: "decks"
            referencedColumns: ["id"]
          },
        ]
      }
      deck_mana_analysis: {
        Row: {
          content: string
          deck_id: number
          generated_at: string | null
          user_id: string
        }
        Insert: {
          content: string
          deck_id: number
          generated_at?: string | null
          user_id: string
        }
        Update: {
          content?: string
          deck_id?: number
          generated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "deck_mana_analysis_deck_id_fkey"
            columns: ["deck_id"]
            isOneToOne: true
            referencedRelation: "decks"
            referencedColumns: ["id"]
          },
        ]
      }
      deck_notes: {
        Row: {
          content: string
          created_at: string | null
          deck_id: number
          id: number
          user_id: string
        }
        Insert: {
          content: string
          created_at?: string | null
          deck_id: number
          id?: never
          user_id: string
        }
        Update: {
          content?: string
          created_at?: string | null
          deck_id?: number
          id?: never
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "deck_notes_deck_id_fkey"
            columns: ["deck_id"]
            isOneToOne: false
            referencedRelation: "decks"
            referencedColumns: ["id"]
          },
        ]
      }
      deck_overview_content: {
        Row: {
          content: string
          deck_id: number
          generated_at: string | null
          user_id: string
        }
        Insert: {
          content: string
          deck_id: number
          generated_at?: string | null
          user_id: string
        }
        Update: {
          content?: string
          deck_id?: number
          generated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "deck_overview_content_deck_id_fkey"
            columns: ["deck_id"]
            isOneToOne: true
            referencedRelation: "decks"
            referencedColumns: ["id"]
          },
        ]
      }
      deck_priority: {
        Row: {
          deck_id: number
          priority: number
          updated_at: string | null
          user_id: string
        }
        Insert: {
          deck_id: number
          priority?: number
          updated_at?: string | null
          user_id: string
        }
        Update: {
          deck_id?: number
          priority?: number
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "deck_priority_deck_id_fkey"
            columns: ["deck_id"]
            isOneToOne: true
            referencedRelation: "decks"
            referencedColumns: ["id"]
          },
        ]
      }
      deck_ratings: {
        Row: {
          content: string
          deck_id: number
          generated_at: string | null
          user_id: string
        }
        Insert: {
          content: string
          deck_id: number
          generated_at?: string | null
          user_id: string
        }
        Update: {
          content?: string
          deck_id?: number
          generated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "deck_ratings_deck_id_fkey"
            columns: ["deck_id"]
            isOneToOne: true
            referencedRelation: "decks"
            referencedColumns: ["id"]
          },
        ]
      }
      deck_strategy: {
        Row: {
          bracket: number | null
          budget_ceiling: number | null
          budget_mode: string | null
          deck_id: number
          format_rules: string | null
          frustration: string | null
          health_overrides: string | null
          strategy_notes: string | null
          table_context: string | null
          updated_at: string | null
          user_id: string
          win_condition: string | null
        }
        Insert: {
          bracket?: number | null
          budget_ceiling?: number | null
          budget_mode?: string | null
          deck_id: number
          format_rules?: string | null
          frustration?: string | null
          health_overrides?: string | null
          strategy_notes?: string | null
          table_context?: string | null
          updated_at?: string | null
          user_id: string
          win_condition?: string | null
        }
        Update: {
          bracket?: number | null
          budget_ceiling?: number | null
          budget_mode?: string | null
          deck_id?: number
          format_rules?: string | null
          frustration?: string | null
          health_overrides?: string | null
          strategy_notes?: string | null
          table_context?: string | null
          updated_at?: string | null
          user_id?: string
          win_condition?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "deck_strategy_deck_id_fkey"
            columns: ["deck_id"]
            isOneToOne: true
            referencedRelation: "decks"
            referencedColumns: ["id"]
          },
        ]
      }
      deck_upgrades: {
        Row: {
          content: string
          cut_flag: string | null
          deck_id: number
          generated_at: string | null
          owned: boolean | null
          price: number | null
          suggested_cut: string | null
          synergy_score: number | null
          user_id: string
        }
        Insert: {
          content: string
          cut_flag?: string | null
          deck_id: number
          generated_at?: string | null
          owned?: boolean | null
          price?: number | null
          suggested_cut?: string | null
          synergy_score?: number | null
          user_id: string
        }
        Update: {
          content?: string
          cut_flag?: string | null
          deck_id?: number
          generated_at?: string | null
          owned?: boolean | null
          price?: number | null
          suggested_cut?: string | null
          synergy_score?: number | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "deck_upgrades_deck_id_fkey"
            columns: ["deck_id"]
            isOneToOne: true
            referencedRelation: "decks"
            referencedColumns: ["id"]
          },
        ]
      }
      decks: {
        Row: {
          allocate: boolean
          bracket: string | null
          card_count: number | null
          colour_identity: string | null
          commander_id: string | null
          commander_name: string | null
          commander_scryfall_id: string | null
          deck_type: string | null
          folder_id: number | null
          format: string | null
          id: number
          is_active: boolean
          is_precon_mod: boolean | null
          last_synced_at: string | null
          name: string
          precon_url: string | null
          raw_json: string | null
          source_platform: string | null
          source_url: string | null
          status: string
          user_id: string
        }
        Insert: {
          allocate?: boolean
          bracket?: string | null
          card_count?: number | null
          colour_identity?: string | null
          commander_id?: string | null
          commander_name?: string | null
          commander_scryfall_id?: string | null
          deck_type?: string | null
          folder_id?: number | null
          format?: string | null
          id: number
          is_active?: boolean
          is_precon_mod?: boolean | null
          last_synced_at?: string | null
          name: string
          precon_url?: string | null
          raw_json?: string | null
          source_platform?: string | null
          source_url?: string | null
          status?: string
          user_id: string
        }
        Update: {
          allocate?: boolean
          bracket?: string | null
          card_count?: number | null
          colour_identity?: string | null
          commander_id?: string | null
          commander_name?: string | null
          commander_scryfall_id?: string | null
          deck_type?: string | null
          folder_id?: number | null
          format?: string | null
          id?: number
          is_active?: boolean
          is_precon_mod?: boolean | null
          last_synced_at?: string | null
          name?: string
          precon_url?: string | null
          raw_json?: string | null
          source_platform?: string | null
          source_url?: string | null
          status?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "decks_commander_id_fkey"
            columns: ["commander_id"]
            isOneToOne: false
            referencedRelation: "ref_commanders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "decks_commander_id_fkey"
            columns: ["commander_id"]
            isOneToOne: false
            referencedRelation: "v_commander_archetypes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "decks_folder_id_fkey"
            columns: ["folder_id"]
            isOneToOne: false
            referencedRelation: "deck_folders"
            referencedColumns: ["id"]
          },
        ]
      }
      oracle_messages: {
        Row: {
          content: string
          context_deck_id: number | null
          context_type: string | null
          created_at: string
          id: string
          role: string
          session_id: string | null
          user_id: string
        }
        Insert: {
          content: string
          context_deck_id?: number | null
          context_type?: string | null
          created_at?: string
          id?: string
          role: string
          session_id?: string | null
          user_id: string
        }
        Update: {
          content?: string
          context_deck_id?: number | null
          context_type?: string | null
          created_at?: string
          id?: string
          role?: string
          session_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "oracle_messages_context_deck_id_fkey"
            columns: ["context_deck_id"]
            isOneToOne: false
            referencedRelation: "decks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "oracle_messages_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "oracle_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      oracle_sessions: {
        Row: {
          id: string
          user_id: string
          started_at: string
          last_message_at: string
          message_count: number
          summary: string | null
          session_name: string | null
          session_type: 'exploration' | 'deck' | 'collection' | 'general'
          context_deck_id: number | null
          archived_at: string | null
          status: 'active' | 'exploring' | 'building' | 'complete'
          commander_name: string | null
          committed_deck_id: number | null
        }
        Insert: {
          id?: string
          user_id: string
          started_at?: string
          last_message_at?: string
          message_count?: number
          summary?: string | null
          session_name?: string | null
          session_type?: 'exploration' | 'deck' | 'collection' | 'general'
          context_deck_id?: number | null
          archived_at?: string | null
          status?: 'active' | 'exploring' | 'building' | 'complete'
          commander_name?: string | null
          committed_deck_id?: number | null
        }
        Update: {
          id?: string
          user_id?: string
          started_at?: string
          last_message_at?: string
          message_count?: number
          summary?: string | null
          session_name?: string | null
          session_type?: 'exploration' | 'deck' | 'collection' | 'general'
          context_deck_id?: number | null
          archived_at?: string | null
          status?: 'active' | 'exploring' | 'building' | 'complete'
          commander_name?: string | null
          committed_deck_id?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "oracle_sessions_context_deck_id_fkey"
            columns: ["context_deck_id"]
            isOneToOne: false
            referencedRelation: "decks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "oracle_sessions_committed_deck_id_fkey"
            columns: ["committed_deck_id"]
            isOneToOne: false
            referencedRelation: "decks"
            referencedColumns: ["id"]
          },
        ]
      }
      precon_cards: {
        Row: {
          card_name: string
          id: number
          precon_url: string
        }
        Insert: {
          card_name: string
          id?: never
          precon_url: string
        }
        Update: {
          card_name?: string
          id?: never
          precon_url?: string
        }
        Relationships: []
      }
      precon_mod_state: {
        Row: {
          budget_spent: number | null
          deck_id: number
          id: number
          rarity_common_used: number | null
          rarity_mythic_used: number | null
          rarity_rare_used: number | null
          rarity_uncommon_used: number | null
          sol_ring_removed: boolean | null
          swaps_used: number | null
          updated_at: string
          user_id: string
        }
        Insert: {
          budget_spent?: number | null
          deck_id: number
          id?: never
          rarity_common_used?: number | null
          rarity_mythic_used?: number | null
          rarity_rare_used?: number | null
          rarity_uncommon_used?: number | null
          sol_ring_removed?: boolean | null
          swaps_used?: number | null
          updated_at?: string
          user_id: string
        }
        Update: {
          budget_spent?: number | null
          deck_id?: number
          id?: never
          rarity_common_used?: number | null
          rarity_mythic_used?: number | null
          rarity_rare_used?: number | null
          rarity_uncommon_used?: number | null
          sol_ring_removed?: boolean | null
          swaps_used?: number | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "precon_mod_state_deck_id_fkey"
            columns: ["deck_id"]
            isOneToOne: true
            referencedRelation: "decks"
            referencedColumns: ["id"]
          },
        ]
      }
      ref_cards: {
        Row: {
          can_be_commander: boolean | null
          color_identity: string
          commander_legal: boolean
          default_category: Json | null
          edhrec_rank: number | null
          is_creature: boolean
          is_legendary: boolean
          keywords: string[] | null
          mana_cost: string | null
          mana_value: number | null
          name: string
          oracle_text: string | null
          power: string | null
          toughness: string | null
          type_line: string
        }
        Insert: {
          can_be_commander?: boolean | null
          color_identity?: string
          commander_legal?: boolean
          default_category?: Json | null
          edhrec_rank?: number | null
          is_creature?: boolean
          is_legendary?: boolean
          keywords?: string[] | null
          mana_cost?: string | null
          mana_value?: number | null
          name: string
          oracle_text?: string | null
          power?: string | null
          toughness?: string | null
          type_line: string
        }
        Update: {
          can_be_commander?: boolean | null
          color_identity?: string
          commander_legal?: boolean
          default_category?: Json | null
          edhrec_rank?: number | null
          is_creature?: boolean
          is_legendary?: boolean
          keywords?: string[] | null
          mana_cost?: string | null
          mana_value?: number | null
          name?: string
          oracle_text?: string | null
          power?: string | null
          toughness?: string | null
          type_line?: string
        }
        Relationships: []
      }
      ref_commander_cards: {
        Row: {
          card_name: string
          card_role: string
          commander_id: string
          id: string
          is_flexible: boolean | null
          position: number
        }
        Insert: {
          card_name: string
          card_role: string
          commander_id: string
          id?: string
          is_flexible?: boolean | null
          position?: number
        }
        Update: {
          card_name?: string
          card_role?: string
          commander_id?: string
          id?: string
          is_flexible?: boolean | null
          position?: number
        }
        Relationships: [
          {
            foreignKeyName: "ref_commander_cards_commander_id_fkey"
            columns: ["commander_id"]
            isOneToOne: false
            referencedRelation: "ref_commanders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ref_commander_cards_commander_id_fkey"
            columns: ["commander_id"]
            isOneToOne: false
            referencedRelation: "v_commander_archetypes"
            referencedColumns: ["id"]
          },
        ]
      }
      ref_commander_insights: {
        Row: {
          archetype: string | null
          build_variant: string | null
          card_mentions: string[] | null
          commander_id: string
          confidence: number | null
          content: string
          created_at: string | null
          id: string
          insight_type: string
          source_author: string | null
          source_date: string | null
          source_title: string | null
          source_type: string
          source_url: string | null
          taxonomy_tags: string[] | null
          updated_at: string | null
        }
        Insert: {
          archetype?: string | null
          build_variant?: string | null
          card_mentions?: string[] | null
          commander_id: string
          confidence?: number | null
          content: string
          created_at?: string | null
          id?: string
          insight_type: string
          source_author?: string | null
          source_date?: string | null
          source_title?: string | null
          source_type: string
          source_url?: string | null
          taxonomy_tags?: string[] | null
          updated_at?: string | null
        }
        Update: {
          archetype?: string | null
          build_variant?: string | null
          card_mentions?: string[] | null
          commander_id?: string
          confidence?: number | null
          content?: string
          created_at?: string | null
          id?: string
          insight_type?: string
          source_author?: string | null
          source_date?: string | null
          source_title?: string | null
          source_type?: string
          source_url?: string | null
          taxonomy_tags?: string[] | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ref_commander_insights_commander_id_fkey"
            columns: ["commander_id"]
            isOneToOne: false
            referencedRelation: "ref_commanders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ref_commander_insights_commander_id_fkey"
            columns: ["commander_id"]
            isOneToOne: false
            referencedRelation: "v_commander_archetypes"
            referencedColumns: ["id"]
          },
        ]
      }
      ref_commander_taxonomy: {
        Row: {
          commander_id: string
          confidence: number | null
          created_at: string | null
          id: string
          relevance: string
          source: string
          taxonomy_slug: string
        }
        Insert: {
          commander_id: string
          confidence?: number | null
          created_at?: string | null
          id?: string
          relevance?: string
          source?: string
          taxonomy_slug: string
        }
        Update: {
          commander_id?: string
          confidence?: number | null
          created_at?: string | null
          id?: string
          relevance?: string
          source?: string
          taxonomy_slug?: string
        }
        Relationships: [
          {
            foreignKeyName: "ref_commander_taxonomy_commander_id_fkey"
            columns: ["commander_id"]
            isOneToOne: false
            referencedRelation: "ref_commanders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ref_commander_taxonomy_commander_id_fkey"
            columns: ["commander_id"]
            isOneToOne: false
            referencedRelation: "v_commander_archetypes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ref_commander_taxonomy_taxonomy_slug_fkey"
            columns: ["taxonomy_slug"]
            isOneToOne: false
            referencedRelation: "ref_taxonomy"
            referencedColumns: ["slug"]
          },
        ]
      }
      ref_commanders: {
        Row: {
          canonical_key: string
          color_identity: string
          created_at: string | null
          display_name: string
          edhrec_deck_count: number | null
          edhrec_rank: number | null
          edhrec_synced_at: string | null
          id: string
          last_synced_at: string | null
          leadership_type: string
          legal_brawl: boolean | null
          legal_commander: boolean | null
          legal_oathbreaker: boolean | null
          needs_insights: boolean | null
          salt_score: number | null
          scryfall_id: string | null
          similar_commanders: Json | null
          updated_at: string | null
        }
        Insert: {
          canonical_key: string
          color_identity: string
          created_at?: string | null
          display_name: string
          edhrec_deck_count?: number | null
          edhrec_rank?: number | null
          edhrec_synced_at?: string | null
          id?: string
          last_synced_at?: string | null
          leadership_type: string
          legal_brawl?: boolean | null
          legal_commander?: boolean | null
          legal_oathbreaker?: boolean | null
          needs_insights?: boolean | null
          salt_score?: number | null
          scryfall_id?: string | null
          similar_commanders?: Json | null
          updated_at?: string | null
        }
        Update: {
          canonical_key?: string
          color_identity?: string
          created_at?: string | null
          display_name?: string
          edhrec_deck_count?: number | null
          edhrec_rank?: number | null
          edhrec_synced_at?: string | null
          id?: string
          last_synced_at?: string | null
          leadership_type?: string
          legal_brawl?: boolean | null
          legal_commander?: boolean | null
          legal_oathbreaker?: boolean | null
          needs_insights?: boolean | null
          salt_score?: number | null
          scryfall_id?: string | null
          similar_commanders?: Json | null
          updated_at?: string | null
        }
        Relationships: []
      }
      ref_edhrec_recommendations: {
        Row: {
          card_name: string
          card_type: string | null
          commander_id: string
          created_at: string | null
          deck_count: number | null
          id: string
          inclusion_rate: number | null
          position: number | null
          synergy_score: number | null
          updated_at: string | null
        }
        Insert: {
          card_name: string
          card_type?: string | null
          commander_id: string
          created_at?: string | null
          deck_count?: number | null
          id?: string
          inclusion_rate?: number | null
          position?: number | null
          synergy_score?: number | null
          updated_at?: string | null
        }
        Update: {
          card_name?: string
          card_type?: string | null
          commander_id?: string
          created_at?: string | null
          deck_count?: number | null
          id?: string
          inclusion_rate?: number | null
          position?: number | null
          synergy_score?: number | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ref_edhrec_recommendations_commander_id_fkey"
            columns: ["commander_id"]
            isOneToOne: false
            referencedRelation: "ref_commanders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ref_edhrec_recommendations_commander_id_fkey"
            columns: ["commander_id"]
            isOneToOne: false
            referencedRelation: "v_commander_archetypes"
            referencedColumns: ["id"]
          },
        ]
      }
      ref_precons: {
        Row: {
          archidekt_url: string | null
          card_count: number | null
          color_identity: string | null
          commander_name: string | null
          commander_scryfall_id: string | null
          created_at: string | null
          id: string
          moxfield_url: string | null
          name: string
          release_date: string | null
          set_code: string
          set_name: string
          updated_at: string | null
        }
        Insert: {
          archidekt_url?: string | null
          card_count?: number | null
          color_identity?: string | null
          commander_name?: string | null
          commander_scryfall_id?: string | null
          created_at?: string | null
          id?: string
          moxfield_url?: string | null
          name: string
          release_date?: string | null
          set_code: string
          set_name: string
          updated_at?: string | null
        }
        Update: {
          archidekt_url?: string | null
          card_count?: number | null
          color_identity?: string | null
          commander_name?: string | null
          commander_scryfall_id?: string | null
          created_at?: string | null
          id?: string
          moxfield_url?: string | null
          name?: string
          release_date?: string | null
          set_code?: string
          set_name?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      ref_printings: {
        Row: {
          cmc: number | null
          collector_number: string
          color_identity: string[] | null
          colors: string[] | null
          digital: boolean | null
          image_uri_art_crop: string | null
          image_uri_large: string | null
          image_uri_normal: string | null
          image_uri_small: string | null
          layout: string | null
          legality_commander: string | null
          mana_cost: string | null
          name: string
          oracle_id: string
          price_eur: number | null
          price_eur_foil: number | null
          price_usd: number | null
          price_usd_foil: number | null
          rarity: string
          released_at: string | null
          reprint: boolean | null
          scryfall_id: string
          set_code: string
          set_name: string
          type_line: string | null
          updated_at: string
        }
        Insert: {
          cmc?: number | null
          collector_number: string
          color_identity?: string[] | null
          colors?: string[] | null
          digital?: boolean | null
          image_uri_art_crop?: string | null
          image_uri_large?: string | null
          image_uri_normal?: string | null
          image_uri_small?: string | null
          layout?: string | null
          legality_commander?: string | null
          mana_cost?: string | null
          name: string
          oracle_id: string
          price_eur?: number | null
          price_eur_foil?: number | null
          price_usd?: number | null
          price_usd_foil?: number | null
          rarity: string
          released_at?: string | null
          reprint?: boolean | null
          scryfall_id: string
          set_code: string
          set_name: string
          type_line?: string | null
          updated_at?: string
        }
        Update: {
          cmc?: number | null
          collector_number?: string
          color_identity?: string[] | null
          colors?: string[] | null
          digital?: boolean | null
          image_uri_art_crop?: string | null
          image_uri_large?: string | null
          image_uri_normal?: string | null
          image_uri_small?: string | null
          layout?: string | null
          legality_commander?: string | null
          mana_cost?: string | null
          name?: string
          oracle_id?: string
          price_eur?: number | null
          price_eur_foil?: number | null
          price_usd?: number | null
          price_usd_foil?: number | null
          rarity?: string
          released_at?: string | null
          reprint?: boolean | null
          scryfall_id?: string
          set_code?: string
          set_name?: string
          type_line?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      ref_rulings: {
        Row: {
          comment: string
          created_at: string | null
          id: number
          oracle_id: string
          published_at: string
          source: string
        }
        Insert: {
          comment: string
          created_at?: string | null
          id?: number
          oracle_id: string
          published_at: string
          source: string
        }
        Update: {
          comment?: string
          created_at?: string | null
          id?: number
          oracle_id?: string
          published_at?: string
          source?: string
        }
        Relationships: []
      }
      ref_taxonomy: {
        Row: {
          category: string
          created_at: string | null
          description: string | null
          display_name: string
          edhrec_aliases: string[] | null
          knowledge_file: string | null
          parent_slug: string | null
          slug: string
          updated_at: string | null
        }
        Insert: {
          category: string
          created_at?: string | null
          description?: string | null
          display_name: string
          edhrec_aliases?: string[] | null
          knowledge_file?: string | null
          parent_slug?: string | null
          slug: string
          updated_at?: string | null
        }
        Update: {
          category?: string
          created_at?: string | null
          description?: string | null
          display_name?: string
          edhrec_aliases?: string[] | null
          knowledge_file?: string | null
          parent_slug?: string | null
          slug?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ref_taxonomy_parent_slug_fkey"
            columns: ["parent_slug"]
            isOneToOne: false
            referencedRelation: "ref_taxonomy"
            referencedColumns: ["slug"]
          },
        ]
      }
      sync_meta: {
        Row: {
          key: string
          updated_at: string | null
          value: string | null
        }
        Insert: {
          key: string
          updated_at?: string | null
          value?: string | null
        }
        Update: {
          key?: string
          updated_at?: string | null
          value?: string | null
        }
        Relationships: []
      }
      sync_runs: {
        Row: {
          completed_at: string | null
          decks_failed: number | null
          decks_processed: number | null
          decks_succeeded: number | null
          details: string | null
          id: number
          started_at: string
          trigger: string
          user_id: string
        }
        Insert: {
          completed_at?: string | null
          decks_failed?: number | null
          decks_processed?: number | null
          decks_succeeded?: number | null
          details?: string | null
          id?: never
          started_at: string
          trigger: string
          user_id: string
        }
        Update: {
          completed_at?: string | null
          decks_failed?: number | null
          decks_processed?: number | null
          decks_succeeded?: number | null
          details?: string | null
          id?: never
          started_at?: string
          trigger?: string
          user_id?: string
        }
        Relationships: []
      }
      upgrade_change_log: {
        Row: {
          add_card: string
          cut_card: string
          date: string
          deck_id: number
          id: number
          reason: string | null
          skipped: boolean
          user_id: string
        }
        Insert: {
          add_card: string
          cut_card: string
          date?: string
          deck_id: number
          id?: never
          reason?: string | null
          skipped?: boolean
          user_id: string
        }
        Update: {
          add_card?: string
          cut_card?: string
          date?: string
          deck_id?: number
          id?: never
          reason?: string | null
          skipped?: boolean
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "upgrade_change_log_deck_id_fkey"
            columns: ["deck_id"]
            isOneToOne: false
            referencedRelation: "decks"
            referencedColumns: ["id"]
          },
        ]
      }
      user_cards: {
        Row: {
          card_name: string
          color_identity: string | null
          created_at: string | null
          id: number
          oracle_id: string
          type_line: string | null
          user_id: string
        }
        Insert: {
          card_name: string
          color_identity?: string | null
          created_at?: string | null
          id?: never
          oracle_id: string
          type_line?: string | null
          user_id: string
        }
        Update: {
          card_name?: string
          color_identity?: string | null
          created_at?: string | null
          id?: never
          oracle_id?: string
          type_line?: string | null
          user_id?: string
        }
        Relationships: []
      }
      user_copies: {
        Row: {
          acquired_at: string | null
          card_id: number
          condition: string | null
          created_at: string | null
          finish: string | null
          id: number
          is_proxy: boolean
          language: string | null
          location_id: number | null
          missing: boolean
          printing_id: string | null
          proxy_for_card_id: number | null
          purchase_price: number | null
          purchase_price_usd: number | null
          purchased_at: string | null
          source_tag: string | null
          user_id: string
        }
        Insert: {
          acquired_at?: string | null
          card_id: number
          condition?: string | null
          created_at?: string | null
          finish?: string | null
          id?: never
          is_proxy?: boolean
          language?: string | null
          location_id?: number | null
          missing?: boolean
          printing_id?: string | null
          proxy_for_card_id?: number | null
          purchase_price?: number | null
          purchase_price_usd?: number | null
          purchased_at?: string | null
          source_tag?: string | null
          user_id: string
        }
        Update: {
          acquired_at?: string | null
          card_id?: number
          condition?: string | null
          created_at?: string | null
          finish?: string | null
          id?: never
          is_proxy?: boolean
          language?: string | null
          location_id?: number | null
          missing?: boolean
          printing_id?: string | null
          proxy_for_card_id?: number | null
          purchase_price?: number | null
          purchase_price_usd?: number | null
          purchased_at?: string | null
          source_tag?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "physical_copies_card_definition_id_fkey"
            columns: ["card_id"]
            isOneToOne: false
            referencedRelation: "user_cards"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "physical_copies_proxy_for_definition_id_fkey"
            columns: ["proxy_for_card_id"]
            isOneToOne: false
            referencedRelation: "user_cards"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "physical_copies_storage_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "user_locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_copies_card_id_fkey"
            columns: ["card_id"]
            isOneToOne: false
            referencedRelation: "user_cards"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_copies_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "user_locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_copies_proxy_for_card_id_fkey"
            columns: ["proxy_for_card_id"]
            isOneToOne: false
            referencedRelation: "user_cards"
            referencedColumns: ["id"]
          },
        ]
      }
      user_locations: {
        Row: {
          color: string | null
          created_at: string | null
          deck_id: number | null
          description: string | null
          id: number
          name: string
          sort_order: number | null
          type: string
          user_id: string
        }
        Insert: {
          color?: string | null
          created_at?: string | null
          deck_id?: number | null
          description?: string | null
          id?: never
          name: string
          sort_order?: number | null
          type?: string
          user_id: string
        }
        Update: {
          color?: string | null
          created_at?: string | null
          deck_id?: number | null
          description?: string | null
          id?: never
          name?: string
          sort_order?: number | null
          type?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_locations_deck_id_fkey"
            columns: ["deck_id"]
            isOneToOne: false
            referencedRelation: "decks"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      collection_rollup: {
        Row: {
          allocated_count: number | null
          card_name: string | null
          oracle_id: string | null
          owned_count: number | null
          proxy_count: number | null
          shortfall: number | null
          type_line: string | null
          user_id: string | null
        }
        Relationships: []
      }
      v_commander_archetypes: {
        Row: {
          archetypes: string[] | null
          color_identity: string | null
          display_name: string | null
          id: string | null
          mechanics: string[] | null
          tribes: string[] | null
        }
        Relationships: []
      }
    }
    Functions: {
      allocation_clear_active_decks: {
        Args: { p_user_id: string }
        Returns: undefined
      }
      assign_free_copy: {
        Args: {
          p_card_name: string
          p_physical_copy_id: number
          p_target_deck_id: number
          p_user_id: string
        }
        Returns: Json
      }
      assign_physical_copy: {
        Args: { p_copy_id: number; p_target_deck_card_id: number }
        Returns: Json
      }
      batch_assign_deck: { Args: { p_assignments: Json }; Returns: undefined }
      get_bulk_price_to_add: {
        Args: never
        Returns: {
          card_definition_id: number
          price_to_add: number
        }[]
      }
      get_cheapest_printing: {
        Args: { p_oracle_id: string }
        Returns: {
          image_uri_normal: string
          price_usd: number
          scryfall_id: string
          set_code: string
          set_name: string
        }[]
      }
      get_collection_rollup: {
        Args: { p_user_id: string }
        Returns: {
          card_definition_id: number
          card_name: string
          color_identity: string
          oracle_id: string
          owned_valuation: number
          price_to_add: number
          total_quantity: number
          type_line: string
        }[]
      }
      get_price_to_add: { Args: { card_def_id: number }; Returns: number }
      get_printings_by_name: {
        Args: { p_name: string }
        Returns: {
          collector_number: string
          image_uri_normal: string
          oracle_id: string
          price_usd: number
          price_usd_foil: number
          rarity: string
          released_at: string
          scryfall_id: string
          set_code: string
          set_name: string
        }[]
      }
      get_shared_cards: {
        Args: { p_user_id: string }
        Returns: {
          card_name: string
          deck_count: number
          deck_ids: string
          owned_copies: number
        }[]
      }
      mark_copy_missing: {
        Args: { p_physical_copy_id: number; p_user_id: string }
        Returns: Json
      }
      reassign_to_deck: {
        Args: {
          p_card_name: string
          p_physical_copy_id: number
          p_target_deck_id: number
          p_user_id: string
        }
        Returns: Json
      }
      show_limit: { Args: never; Returns: number }
      show_trgm: { Args: { "": string }; Returns: string[] }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
A new version of Supabase CLI is available: v2.111.0 (currently installed v2.75.0)
We recommend updating regularly for new features and bug fixes: https://supabase.com/docs/guides/cli/getting-started#updating-the-supabase-cli
