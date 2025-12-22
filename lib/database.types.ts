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
    Enums: {};
    CompositeTypes: {};
  };
};

// Helper types for easier usage
export type Conversation = Database["public"]["Tables"]["conversations"]["Row"];
export type ConversationInsert = Database["public"]["Tables"]["conversations"]["Insert"];
export type Message = Database["public"]["Tables"]["messages"]["Row"];
export type MessageInsert = Database["public"]["Tables"]["messages"]["Insert"];
export type MessageReference = Database["public"]["Tables"]["message_references"]["Row"];
export type MessageReferenceInsert = Database["public"]["Tables"]["message_references"]["Insert"];
export type MessageAttachment = Database["public"]["Tables"]["message_attachments"]["Row"];
