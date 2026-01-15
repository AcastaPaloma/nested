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
      builder_canvases: {
        Row: {
          id: string;
          user_id: string;
          name: string;
          description: string;
          nodes: Json;
          edges: Json;
          collaborators: string[];
          settings: Json;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          name?: string;
          description?: string;
          nodes?: Json;
          edges?: Json;
          collaborators?: string[];
          settings?: Json;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          name?: string;
          description?: string;
          nodes?: Json;
          edges?: Json;
          collaborators?: string[];
          settings?: Json;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
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
      build_jobs: {
        Row: {
          id: string;
          canvas_id: string;
          user_id: string;
          status: Database["public"]["Enums"]["build_status"];
          progress: number;
          canvas_snapshot: Json;
          config: Json;
          backboard_assistant_id: string | null;
          backboard_thread_id: string | null;
          logs: Json;
          artifacts: Json | null;
          error_message: string | null;
          error_details: Json | null;
          created_at: string;
          started_at: string | null;
          completed_at: string | null;
          updated_at: string;
        };
        Insert: {
          id?: string;
          canvas_id: string;
          user_id: string;
          status?: Database["public"]["Enums"]["build_status"];
          progress?: number;
          canvas_snapshot?: Json;
          config?: Json;
          backboard_assistant_id?: string | null;
          backboard_thread_id?: string | null;
          logs?: Json;
          artifacts?: Json | null;
          error_message?: string | null;
          error_details?: Json | null;
          created_at?: string;
          started_at?: string | null;
          completed_at?: string | null;
          updated_at?: string;
        };
        Update: {
          id?: string;
          canvas_id?: string;
          user_id?: string;
          status?: Database["public"]["Enums"]["build_status"];
          progress?: number;
          canvas_snapshot?: Json;
          config?: Json;
          backboard_assistant_id?: string | null;
          backboard_thread_id?: string | null;
          logs?: Json;
          artifacts?: Json | null;
          error_message?: string | null;
          error_details?: Json | null;
          created_at?: string;
          started_at?: string | null;
          completed_at?: string | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "build_jobs_canvas_id_fkey";
            columns: ["canvas_id"];
            isOneToOne: false;
            referencedRelation: "builder_canvases";
            referencedColumns: ["id"];
          }
        ];
      };
    };
    Views: {};
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
    };
    Enums: {
      build_status: "queued" | "analyzing" | "building" | "complete" | "failed" | "cancelled";
    };
    CompositeTypes: {};
  };
};

// Build status type
export type BuildStatus = Database["public"]["Enums"]["build_status"];

// Build job types
export type BuildJob = {
  id: string;
  canvas_id: string;
  user_id: string;
  status: BuildStatus;
  progress: number;
  canvas_snapshot: {
    nodes: unknown[];
    edges: unknown[];
    settings: Record<string, unknown>;
    name: string;
  };
  config: {
    model?: string;
    provider?: string;
    options?: Record<string, unknown>;
  };
  backboard_assistant_id: string | null;
  backboard_thread_id: string | null;
  logs: Array<{
    timestamp: string;
    level: "info" | "warn" | "error";
    message: string;
  }>;
  artifacts: {
    files?: Array<{
      path: string;
      content: string;
      language: string;
    }>;
    preview_url?: string;
  };
  error_message: string | null;
  error_details: Record<string, unknown> | null;
  created_at: string;
  started_at: string | null;
  completed_at: string | null;
  updated_at: string;
};

// Helper types for easier usage
export type Conversation = Database["public"]["Tables"]["conversations"]["Row"];
export type ConversationInsert = Database["public"]["Tables"]["conversations"]["Insert"];
export type Message = Database["public"]["Tables"]["messages"]["Row"];
export type MessageInsert = Database["public"]["Tables"]["messages"]["Insert"];
export type MessageReference = Database["public"]["Tables"]["message_references"]["Row"];
export type MessageReferenceInsert = Database["public"]["Tables"]["message_references"]["Insert"];
export type MessageAttachment = Database["public"]["Tables"]["message_attachments"]["Row"];
export type NodePosition = Database["public"]["Tables"]["node_positions"]["Row"];
export type NodePositionInsert = Database["public"]["Tables"]["node_positions"]["Insert"];
export type BuilderCanvas = Database["public"]["Tables"]["builder_canvases"]["Row"];
export type BuilderCanvasInsert = Database["public"]["Tables"]["builder_canvases"]["Insert"];
