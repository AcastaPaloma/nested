// Database types generated from Supabase schema
// This matches the schema we applied to the database

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type Database = {
  public: {
    Tables: {
      conversations: {
        Row: {
          id: string;
          user_id: string;
          name: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          name?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          name?: string;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      messages: {
        Row: {
          id: string;
          conversation_id: string;
          parent_id: string | null;
          role: "user" | "assistant";
          content: string;
          model: string | null;
          provider: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          conversation_id: string;
          parent_id?: string | null;
          role: "user" | "assistant";
          content: string;
          model?: string | null;
          provider?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          conversation_id?: string;
          parent_id?: string | null;
          role?: "user" | "assistant";
          content?: string;
          model?: string | null;
          provider?: string | null;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "messages_conversation_id_fkey";
            columns: ["conversation_id"];
            isOneToOne: false;
            referencedRelation: "conversations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "messages_parent_id_fkey";
            columns: ["parent_id"];
            isOneToOne: false;
            referencedRelation: "messages";
            referencedColumns: ["id"];
          }
        ];
      };
      message_references: {
        Row: {
          id: string;
          source_message_id: string;
          target_message_id: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          source_message_id: string;
          target_message_id: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          source_message_id?: string;
          target_message_id?: string;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "message_references_source_message_id_fkey";
            columns: ["source_message_id"];
            isOneToOne: false;
            referencedRelation: "messages";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "message_references_target_message_id_fkey";
            columns: ["target_message_id"];
            isOneToOne: false;
            referencedRelation: "messages";
            referencedColumns: ["id"];
          }
        ];
      };
      message_links: {
        Row: {
          id: string;
          source_message_id: string;
          target_message_id: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          source_message_id: string;
          target_message_id: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          source_message_id?: string;
          target_message_id?: string;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "message_links_source_message_id_fkey";
            columns: ["source_message_id"];
            isOneToOne: false;
            referencedRelation: "messages";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "message_links_target_message_id_fkey";
            columns: ["target_message_id"];
            isOneToOne: false;
            referencedRelation: "messages";
            referencedColumns: ["id"];
          }
        ];
      };
      message_attachments: {
        Row: {
          id: string;
          message_id: string;
          file_name: string;
          file_path: string;
          file_size: number;
          mime_type: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          message_id: string;
          file_name: string;
          file_path: string;
          file_size: number;
          mime_type: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          message_id?: string;
          file_name?: string;
          file_path?: string;
          file_size?: number;
          mime_type?: string;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "message_attachments_message_id_fkey";
            columns: ["message_id"];
            isOneToOne: false;
            referencedRelation: "messages";
            referencedColumns: ["id"];
          }
        ];
      };
      node_positions: {
        Row: {
          id: string;
          conversation_id: string;
          message_id: string;
          x: number;
          y: number;
          width: number | null;
          height: number | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          conversation_id: string;
          message_id: string;
          x: number;
          y: number;
          width?: number | null;
          height?: number | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          conversation_id?: string;
          message_id?: string;
          x?: number;
          y?: number;
          width?: number | null;
          height?: number | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "node_positions_conversation_id_fkey";
            columns: ["conversation_id"];
            isOneToOne: false;
            referencedRelation: "conversations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "node_positions_message_id_fkey";
            columns: ["message_id"];
            isOneToOne: false;
            referencedRelation: "messages";
            referencedColumns: ["id"];
          }
        ];
      };
      codex_runs: {
        Row: {
          id: string;
          message_id: string | null;
          conversation_id: string;
          user_id: string;
          thread_id: string | null;
          turn_id: string | null;
          parent_run_id: string | null;
          model: string;
          status: "pending" | "in_progress" | "completed" | "failed" | "interrupted";
          error_details: Json | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          message_id?: string | null;
          conversation_id: string;
          user_id: string;
          thread_id?: string | null;
          turn_id?: string | null;
          parent_run_id?: string | null;
          model: string;
          status?: "pending" | "in_progress" | "completed" | "failed" | "interrupted";
          error_details?: Json | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          message_id?: string | null;
          conversation_id?: string;
          user_id?: string;
          thread_id?: string | null;
          turn_id?: string | null;
          parent_run_id?: string | null;
          model?: string;
          status?: "pending" | "in_progress" | "completed" | "failed" | "interrupted";
          error_details?: Json | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "codex_runs_conversation_id_fkey";
            columns: ["conversation_id"];
            isOneToOne: false;
            referencedRelation: "conversations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "codex_runs_message_id_fkey";
            columns: ["message_id"];
            isOneToOne: true;
            referencedRelation: "messages";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "codex_runs_parent_run_id_fkey";
            columns: ["parent_run_id"];
            isOneToOne: false;
            referencedRelation: "codex_runs";
            referencedColumns: ["id"];
          }
        ];
      };
      codex_companions: {
        Row: {
          id: string;
          user_id: string;
          token_hash: string;
          name: string;
          authenticated: boolean;
          account_type: string | null;
          email: string | null;
          plan_type: string | null;
          models: Json;
          rate_limits: Json;
          last_error: string | null;
          last_seen_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          token_hash: string;
          name?: string;
          authenticated?: boolean;
          account_type?: string | null;
          email?: string | null;
          plan_type?: string | null;
          models?: Json;
          rate_limits?: Json;
          last_error?: string | null;
          last_seen_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          token_hash?: string;
          name?: string;
          authenticated?: boolean;
          account_type?: string | null;
          email?: string | null;
          plan_type?: string | null;
          models?: Json;
          rate_limits?: Json;
          last_error?: string | null;
          last_seen_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      codex_jobs: {
        Row: {
          id: string;
          kind: "turn" | "archive";
          run_id: string | null;
          user_id: string;
          assistant_message_id: string | null;
          user_message_id: string | null;
          companion_id: string | null;
          model: string | null;
          prompt: string | null;
          action: Json | null;
          status: "pending" | "claimed" | "in_progress" | "completed" | "failed" | "interrupted";
          output_text: string;
          thread_id: string | null;
          turn_id: string | null;
          cancel_requested: boolean;
          error_details: Json | null;
          claimed_at: string | null;
          heartbeat_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          kind?: "turn" | "archive";
          run_id?: string | null;
          user_id: string;
          assistant_message_id?: string | null;
          user_message_id?: string | null;
          companion_id?: string | null;
          model?: string | null;
          prompt?: string | null;
          action?: Json | null;
          status?: "pending" | "claimed" | "in_progress" | "completed" | "failed" | "interrupted";
          output_text?: string;
          thread_id?: string | null;
          turn_id?: string | null;
          cancel_requested?: boolean;
          error_details?: Json | null;
          claimed_at?: string | null;
          heartbeat_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          kind?: "turn" | "archive";
          run_id?: string | null;
          user_id?: string;
          assistant_message_id?: string | null;
          user_message_id?: string | null;
          companion_id?: string | null;
          model?: string | null;
          prompt?: string | null;
          action?: Json | null;
          status?: "pending" | "claimed" | "in_progress" | "completed" | "failed" | "interrupted";
          output_text?: string;
          thread_id?: string | null;
          turn_id?: string | null;
          cancel_requested?: boolean;
          error_details?: Json | null;
          claimed_at?: string | null;
          heartbeat_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
    };
    Views: { [_ in never]: never };
    Functions: {
      get_root_message_id: {
        Args: { message_id: string };
        Returns: string;
      };
      get_message_ancestry: {
        Args: { message_id: string };
        Returns: Database["public"]["Tables"]["messages"]["Row"][];
      };
      get_message_descendants: {
        Args: { message_id: string };
        Returns: Database["public"]["Tables"]["messages"]["Row"][];
      };
      get_tree_messages: {
        Args: { root_id: string };
        Returns: Database["public"]["Tables"]["messages"]["Row"][];
      };
      claim_codex_run: {
        Args: { assistant_message_id: string; selected_model: string };
        Returns: Array<{
          run_id: string;
          parent_run_id: string | null;
          parent_thread_id: string | null;
          parent_turn_id: string | null;
          should_fork: boolean;
        }>;
      };
    };
    Enums: { [_ in never]: never };
    CompositeTypes: { [_ in never]: never };
  };
};

// Helper types for easier usage
export type Conversation = Database["public"]["Tables"]["conversations"]["Row"];
export type ConversationInsert = Database["public"]["Tables"]["conversations"]["Insert"];
export type Message = Database["public"]["Tables"]["messages"]["Row"];
export type MessageInsert = Database["public"]["Tables"]["messages"]["Insert"];
export type MessageReference = Database["public"]["Tables"]["message_references"]["Row"];
export type MessageReferenceInsert = Database["public"]["Tables"]["message_references"]["Insert"];
export type MessageLink = Database["public"]["Tables"]["message_links"]["Row"];
export type MessageLinkInsert = Database["public"]["Tables"]["message_links"]["Insert"];
export type MessageAttachment = Database["public"]["Tables"]["message_attachments"]["Row"];
export type NodePosition = Database["public"]["Tables"]["node_positions"]["Row"];
export type NodePositionInsert = Database["public"]["Tables"]["node_positions"]["Insert"];
export type CodexRun = Database["public"]["Tables"]["codex_runs"]["Row"];
export type CodexCompanion = Database["public"]["Tables"]["codex_companions"]["Row"];
export type CodexJob = Database["public"]["Tables"]["codex_jobs"]["Row"];
