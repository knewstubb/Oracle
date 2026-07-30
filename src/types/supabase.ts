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
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
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
          id: number
          card_id: number
          printing_id: string | null
          finish: string
          language: string
          is_proxy: boolean
          missing: boolean
          proxy_for_card_id: number | null
          condition: string | null
          purchase_price: number | null
          location_id: number | null
          acquired_at: string | null
          created_at: string | null
          source_tag: string | null
          user_id: string
        }
        Insert: {
          id?: never
          card_id: number
          printing_id?: string | null
          finish?: string
          language?: string
          is_proxy?: boolean
          missing?: boolean
          proxy_for_card_id?: number | null
          condition?: string | null
          purchase_price?: number | null
          location_id?: number | null
          acquired_at?: string | null
          created_at?: string | null
          source_tag?: string | null
          user_id: string
        }
        Update: {
          id?: never
          card_id?: number
          printing_id?: string | null
          finish?: string
          language?: string
          is_proxy?: boolean
          missing?: boolean
          proxy_for_card_id?: number | null
          condition?: string | null
          purchase_price?: number | null
          location_id?: number | null
          acquired_at?: string | null
          created_at?: string | null
          source_tag?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_copies_card_id_fkey"
            columns: ["card_id"]
            isOneToOne: false
            referencedRelation: "user_cards"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_copies_proxy_for_card_id_fkey"
            columns: ["proxy_for_card_id"]
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
          dead_weight_flag: string | null
          dead_weight_reason: string | null
          deck_id: number
          id: number
          is_commander: boolean | null
          ownership_status: string | null
          copy_id: number | null
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
          dead_weight_flag?: string | null
          dead_weight_reason?: string | null
          deck_id: number
          id?: never
          is_commander?: boolean | null
          ownership_status?: string | null
          copy_id?: number | null
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
          dead_weight_flag?: string | null
          dead_weight_reason?: string | null
          deck_id?: number
          id?: never
          is_commander?: boolean | null
          ownership_status?: string | null
          copy_id?: number | null
          proxy_of_deck_id?: number | null
          quantity?: number | null
          scryfall_id?: string | null
          set_code?: string | null
          tags?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "deck_cards_deck_id_fkey"
            columns: ["deck_id"]
            isOneToOne: false
            referencedRelation: "decks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deck_cards_copy_id_fkey"
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
      ref_commander_cards: {
        Row: {
          card_name: string
          card_role: string
          id: string
          is_flexible: boolean | null
          commander_id: string
          position: number
        }
        Insert: {
          card_name: string
          card_role: string
          id?: string
          is_flexible?: boolean | null
          commander_id: string
          position?: number
        }
        Update: {
          card_name?: string
          card_role?: string
          id?: string
          is_flexible?: boolean | null
          commander_id?: string
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
        ]
      }
      ref_commanders: {
        Row: {
          canonical_key: string
          color_identity: string
          created_at: string | null
          display_name: string
          id: string
          leadership_type: string
          legal_brawl: boolean | null
          legal_commander: boolean | null
          legal_oathbreaker: boolean | null
          updated_at: string | null
        }
        Insert: {
          canonical_key: string
          color_identity: string
          created_at?: string | null
          display_name: string
          id?: string
          leadership_type: string
          legal_brawl?: boolean | null
          legal_commander?: boolean | null
          legal_oathbreaker?: boolean | null
          updated_at?: string | null
        }
        Update: {
          canonical_key?: string
          color_identity?: string
          created_at?: string | null
          display_name?: string
          id?: string
          leadership_type?: string
          legal_brawl?: boolean | null
          legal_commander?: boolean | null
          legal_oathbreaker?: boolean | null
          updated_at?: string | null
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
          commander_name: string | null
          commander_scryfall_id: string | null
          deck_type: string | null
          format: string | null
          id: number
          is_precon_mod: boolean | null
          last_synced_at: string | null
          commander_id: string | null
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
          commander_name?: string | null
          commander_scryfall_id?: string | null
          deck_type?: string | null
          format?: string | null
          id: number
          is_precon_mod?: boolean | null
          last_synced_at?: string | null
          commander_id?: string | null
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
          commander_name?: string | null
          commander_scryfall_id?: string | null
          deck_type?: string | null
          format?: string | null
          id?: number
          is_precon_mod?: boolean | null
          last_synced_at?: string | null
          commander_id?: string | null
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
        ]
      }
      ref_cards: {
        Row: {
          can_be_commander: boolean
          color_identity: string
          commander_legal: boolean
          default_category: string | null
          edhrec_rank: number | null
          is_creature: boolean
          is_legendary: boolean
          mana_cost: string | null
          mana_value: number | null
          name: string
          oracle_text: string | null
          power: string | null
          toughness: string | null
          type_line: string
        }
        Insert: {
          can_be_commander?: boolean
          color_identity?: string
          commander_legal?: boolean
          default_category?: string | null
          edhrec_rank?: number | null
          is_creature?: boolean
          is_legendary?: boolean
          mana_cost?: string | null
          mana_value?: number | null
          name: string
          oracle_text?: string | null
          power?: string | null
          toughness?: string | null
          type_line: string
        }
        Update: {
          can_be_commander?: boolean
          color_identity?: string
          commander_legal?: boolean
          default_category?: string | null
          edhrec_rank?: number | null
          is_creature?: boolean
          is_legendary?: boolean
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
      ref_commander_insights: {
        Row: {
          id: string
          commander_id: string
          build_variant: string | null
          insight_type: string
          content: string
          source_type: string
          source_url: string | null
          source_title: string | null
          source_author: string | null
          source_date: string | null
          confidence: number | null
          card_mentions: string[] | null
          created_at: string | null
          updated_at: string | null
        }
        Insert: {
          id?: string
          commander_id: string
          build_variant?: string | null
          insight_type: string
          content: string
          source_type: string
          source_url?: string | null
          source_title?: string | null
          source_author?: string | null
          source_date?: string | null
          confidence?: number | null
          card_mentions?: string[] | null
          created_at?: string | null
          updated_at?: string | null
        }
        Update: {
          id?: string
          commander_id?: string
          build_variant?: string | null
          insight_type?: string
          content?: string
          source_type?: string
          source_url?: string | null
          source_title?: string | null
          source_author?: string | null
          source_date?: string | null
          confidence?: number | null
          card_mentions?: string[] | null
          created_at?: string | null
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
        ]
      }
      commander_strategies: {
        Row: {
          card_name: string
          edhrec_url: string | null
          edhrec_themes: string[] | null
          primary_strategy: string | null
          secondary_strategies: string[] | null
          theme_count: number
          fetched_at: string | null
          updated_at: string
        }
        Insert: {
          card_name: string
          edhrec_url?: string | null
          edhrec_themes?: string[] | null
          primary_strategy?: string | null
          secondary_strategies?: string[] | null
          theme_count?: number
          fetched_at?: string | null
          updated_at?: string
        }
        Update: {
          card_name?: string
          edhrec_url?: string | null
          edhrec_themes?: string[] | null
          primary_strategy?: string | null
          secondary_strategies?: string[] | null
          theme_count?: number
          fetched_at?: string | null
          updated_at?: string
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
      commander_content: {
        Row: {
          id: number
          card_name: string
          source: string
          source_url: string | null
          title: string | null
          raw_content: string | null
          distilled_summary: string | null
          key_points: string[] | null
          fetched_at: string | null
          distilled_at: string | null
          created_at: string | null
        }
        Insert: {
          id?: never
          card_name: string
          source: string
          source_url?: string | null
          title?: string | null
          raw_content?: string | null
          distilled_summary?: string | null
          key_points?: string[] | null
          fetched_at?: string | null
          distilled_at?: string | null
          created_at?: string | null
        }
        Update: {
          id?: never
          card_name?: string
          source?: string
          source_url?: string | null
          title?: string | null
          raw_content?: string | null
          distilled_summary?: string | null
          key_points?: string[] | null
          fetched_at?: string | null
          distilled_at?: string | null
          created_at?: string | null
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
      oracle_to_printings: {
        Row: {
          oracle_id: string
          printing_id: string
        }
        Insert: {
          oracle_id: string
          printing_id: string
        }
        Update: {
          oracle_id?: string
          printing_id?: string
        }
        Relationships: []
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
      ref_printings: {
        Row: {
          scryfall_id: string
          oracle_id: string
          name: string
          set_code: string
          set_name: string
          collector_number: string
          rarity: string
          price_usd: number | null
          price_usd_foil: number | null
          price_eur: number | null
          price_eur_foil: number | null
          image_uri_small: string | null
          image_uri_normal: string | null
          image_uri_large: string | null
          image_uri_art_crop: string | null
          type_line: string | null
          mana_cost: string | null
          cmc: number | null
          colors: string[] | null
          color_identity: string[] | null
          legality_commander: string | null
          layout: string | null
          released_at: string | null
          reprint: boolean | null
          digital: boolean | null
          updated_at: string
        }
        Insert: {
          scryfall_id: string
          oracle_id: string
          name: string
          set_code: string
          set_name: string
          collector_number: string
          rarity: string
          price_usd?: number | null
          price_usd_foil?: number | null
          price_eur?: number | null
          price_eur_foil?: number | null
          image_uri_small?: string | null
          image_uri_normal?: string | null
          image_uri_large?: string | null
          image_uri_art_crop?: string | null
          type_line?: string | null
          mana_cost?: string | null
          cmc?: number | null
          colors?: string[] | null
          color_identity?: string[] | null
          legality_commander?: string | null
          layout?: string | null
          released_at?: string | null
          reprint?: boolean | null
          digital?: boolean | null
          updated_at?: string
        }
        Update: {
          scryfall_id?: string
          oracle_id?: string
          name?: string
          set_code?: string
          set_name?: string
          collector_number?: string
          rarity?: string
          price_usd?: number | null
          price_usd_foil?: number | null
          price_eur?: number | null
          price_eur_foil?: number | null
          image_uri_small?: string | null
          image_uri_normal?: string | null
          image_uri_large?: string | null
          image_uri_art_crop?: string | null
          type_line?: string | null
          mana_cost?: string | null
          cmc?: number | null
          colors?: string[] | null
          color_identity?: string[] | null
          legality_commander?: string | null
          layout?: string | null
          released_at?: string | null
          reprint?: boolean | null
          digital?: boolean | null
          updated_at?: string
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
      printing_set_info: {
        Row: {
          edition_name: string
          scryfall_printing_id: string
          set_code: string
        }
        Insert: {
          edition_name?: string
          scryfall_printing_id: string
          set_code?: string
        }
        Update: {
          edition_name?: string
          scryfall_printing_id?: string
          set_code?: string
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
      user_locations: {
        Row: {
          id: number
          type: string
          name: string
          deck_id: number | null
          description: string | null
          color: string | null
          sort_order: number | null
          user_id: string
          created_at: string | null
        }
        Insert: {
          id?: never
          type?: string
          name: string
          deck_id?: number | null
          description?: string | null
          color?: string | null
          sort_order?: number | null
          user_id: string
          created_at?: string | null
        }
        Update: {
          id?: never
          type?: string
          name?: string
          deck_id?: number | null
          description?: string | null
          color?: string | null
          sort_order?: number | null
          user_id?: string
          created_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "user_locations_deck_id_fkey"
            columns: ["deck_id"]
            isOneToOne: true
            referencedRelation: "decks"
            referencedColumns: ["id"]
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
      shared_cards: {
        Row: {
          card_name: string | null
          deck_count: number | null
          deck_ids: string | null
          owned_copies: number | null
        }
        Relationships: []
      }
    }
    Functions: {
      allocation_clear_active_decks: {
        Args: { p_user_id: string }
        Returns: undefined
      }
      batch_assign_deck: { Args: { p_assignments: Json }; Returns: undefined }
      get_bulk_price_to_add: {
        Args: never
        Returns: {
          card_definition_id: number
          price_to_add: number
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
      get_shared_cards: {
        Args: { p_user_id: string }
        Returns: {
          card_name: string
          deck_count: number
          deck_ids: string
          owned_copies: number
        }[]
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
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {},
  },
} as const
