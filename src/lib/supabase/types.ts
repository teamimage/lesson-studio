// Generated from the Supabase project schema (supabase/migrations).
// Regenerate after a migration with the Supabase MCP `generate_typescript_types`
// tool or `supabase gen types typescript`.

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type Database = {
  __InternalSupabase: {
    PostgrestVersion: "14.18";
  };
  public: {
    Tables: {
      ai_usage: {
        Row: {
          score_id: string | null;
          audio_seconds: number;
          cache_read_tokens: number;
          cache_write_tokens: number;
          cost_usd: number;
          created_at: string;
          id: string;
          input_tokens: number;
          kind: string;
          lesson_id: string | null;
          model: string;
          output_tokens: number;
          practice_session_id: string | null;
          practice_week_id: string | null;
          provider: string;
          recording_id: string | null;
          teacher_id: string;
        };
        Insert: {
          score_id?: string | null;
          audio_seconds?: number;
          cache_read_tokens?: number;
          cache_write_tokens?: number;
          cost_usd?: number;
          created_at?: string;
          id?: string;
          input_tokens?: number;
          kind: string;
          lesson_id?: string | null;
          model: string;
          output_tokens?: number;
          practice_session_id?: string | null;
          practice_week_id?: string | null;
          provider: string;
          recording_id?: string | null;
          teacher_id: string;
        };
        Update: {
          score_id?: string | null;
          audio_seconds?: number;
          cache_read_tokens?: number;
          cache_write_tokens?: number;
          cost_usd?: number;
          created_at?: string;
          id?: string;
          input_tokens?: number;
          kind?: string;
          lesson_id?: string | null;
          model?: string;
          output_tokens?: number;
          practice_session_id?: string | null;
          practice_week_id?: string | null;
          provider?: string;
          recording_id?: string | null;
          teacher_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "ai_usage_practice_session_id_fkey";
            columns: ["practice_session_id"];
            isOneToOne: false;
            referencedRelation: "practice_sessions";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "ai_usage_practice_week_id_fkey";
            columns: ["practice_week_id"];
            isOneToOne: false;
            referencedRelation: "practice_weeks";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "ai_usage_score_id_fkey";
            columns: ["score_id"];
            isOneToOne: false;
            referencedRelation: "scores";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "ai_usage_lesson_id_fkey";
            columns: ["lesson_id"];
            isOneToOne: false;
            referencedRelation: "lessons";
            referencedColumns: ["id"];
          },
        ];
      };
      lesson_transcripts: {
        Row: {
          audio_seconds: number | null;
          created_at: string;
          draft: Json | null;
          error: string | null;
          id: string;
          lesson_id: string;
          provider_job_id: string | null;
          recording_id: string;
          status: string;
          teacher_id: string;
          transcript: string | null;
          updated_at: string;
        };
        Insert: {
          audio_seconds?: number | null;
          created_at?: string;
          draft?: Json | null;
          error?: string | null;
          id?: string;
          lesson_id: string;
          provider_job_id?: string | null;
          recording_id: string;
          status?: string;
          teacher_id: string;
          transcript?: string | null;
          updated_at?: string;
        };
        Update: {
          audio_seconds?: number | null;
          created_at?: string;
          draft?: Json | null;
          error?: string | null;
          id?: string;
          lesson_id?: string;
          provider_job_id?: string | null;
          recording_id?: string;
          status?: string;
          teacher_id?: string;
          transcript?: string | null;
          updated_at?: string;
        };
        Relationships: [];
      };
      app_admins: {
        Row: { user_id: string; created_at: string };
        Insert: { user_id: string; created_at?: string };
        Update: { user_id?: string; created_at?: string };
        Relationships: [];
      };
      assignments: {
        Row: {
          listen_times: number | null;
          reference_recording_id: string | null;
          created_at: string;
          every_day: boolean;
          how: string | null;
          id: string;
          kind: Database["public"]["Enums"]["assignment_kind"];
          lesson_id: string;
          sort_order: number;
          student_id: string;
          title: string;
        };
        Insert: {
          listen_times?: number | null;
          reference_recording_id?: string | null;
          created_at?: string;
          every_day?: boolean;
          how?: string | null;
          id?: string;
          kind?: Database["public"]["Enums"]["assignment_kind"];
          lesson_id: string;
          sort_order?: number;
          student_id: string;
          title: string;
        };
        Update: {
          listen_times?: number | null;
          reference_recording_id?: string | null;
          created_at?: string;
          every_day?: boolean;
          how?: string | null;
          id?: string;
          kind?: Database["public"]["Enums"]["assignment_kind"];
          lesson_id?: string;
          sort_order?: number;
          student_id?: string;
          title?: string;
        };
        Relationships: [
          {
            foreignKeyName: "assignments_lesson_id_fkey";
            columns: ["lesson_id"];
            isOneToOne: false;
            referencedRelation: "lessons";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "assignments_student_id_fkey";
            columns: ["student_id"];
            isOneToOne: false;
            referencedRelation: "students";
            referencedColumns: ["id"];
          },
        ];
      };
      lesson_pieces: {
        Row: {
          activity: Database["public"]["Enums"]["piece_activity"];
          id: string;
          lesson_id: string;
          notes: string | null;
          repertoire_id: string | null;
          sort_order: number;
          title: string;
        };
        Insert: {
          activity?: Database["public"]["Enums"]["piece_activity"];
          id?: string;
          lesson_id: string;
          notes?: string | null;
          repertoire_id?: string | null;
          sort_order?: number;
          title: string;
        };
        Update: {
          activity?: Database["public"]["Enums"]["piece_activity"];
          id?: string;
          lesson_id?: string;
          notes?: string | null;
          repertoire_id?: string | null;
          sort_order?: number;
          title?: string;
        };
        Relationships: [
          {
            foreignKeyName: "lesson_pieces_lesson_id_fkey";
            columns: ["lesson_id"];
            isOneToOne: false;
            referencedRelation: "lessons";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "lesson_pieces_repertoire_id_fkey";
            columns: ["repertoire_id"];
            isOneToOne: false;
            referencedRelation: "repertoire";
            referencedColumns: ["id"];
          },
        ];
      };
      lessons: {
        Row: {
          approved_at: string | null;
          created_at: string;
          duration_minutes: number | null;
          focus_points: string | null;
          id: string;
          lesson_date: string;
          main_recording_id: string | null;
          next_lesson_date: string | null;
          parent_message: string | null;
          status: Database["public"]["Enums"]["lesson_status"];
          student_id: string;
          suggestions: string | null;
          summary: string | null;
          teacher_id: string;
          teacher_notes: string | null;
          updated_at: string;
        };
        Insert: {
          approved_at?: string | null;
          created_at?: string;
          duration_minutes?: number | null;
          focus_points?: string | null;
          id?: string;
          lesson_date?: string;
          main_recording_id?: string | null;
          next_lesson_date?: string | null;
          parent_message?: string | null;
          status?: Database["public"]["Enums"]["lesson_status"];
          student_id: string;
          suggestions?: string | null;
          summary?: string | null;
          teacher_id: string;
          teacher_notes?: string | null;
          updated_at?: string;
        };
        Update: {
          approved_at?: string | null;
          created_at?: string;
          duration_minutes?: number | null;
          focus_points?: string | null;
          id?: string;
          lesson_date?: string;
          main_recording_id?: string | null;
          next_lesson_date?: string | null;
          parent_message?: string | null;
          status?: Database["public"]["Enums"]["lesson_status"];
          student_id?: string;
          suggestions?: string | null;
          summary?: string | null;
          teacher_id?: string;
          teacher_notes?: string | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "lessons_student_id_fkey";
            columns: ["student_id"];
            isOneToOne: false;
            referencedRelation: "students";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "lessons_teacher_id_fkey";
            columns: ["teacher_id"];
            isOneToOne: false;
            referencedRelation: "teachers";
            referencedColumns: ["id"];
          },
        ];
      };
      parents: {
        Row: {
          created_at: string;
          email: string;
          id: string;
          name: string;
          supervises_practice: boolean;
          teacher_id: string;
          user_id: string | null;
        };
        Insert: {
          created_at?: string;
          email: string;
          id?: string;
          name: string;
          supervises_practice?: boolean;
          teacher_id: string;
          user_id?: string | null;
        };
        Update: {
          created_at?: string;
          email?: string;
          id?: string;
          name?: string;
          supervises_practice?: boolean;
          teacher_id?: string;
          user_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "parents_teacher_id_fkey";
            columns: ["teacher_id"];
            isOneToOne: false;
            referencedRelation: "teachers";
            referencedColumns: ["id"];
          },
        ];
      };
      music_rights_confirmations: {
        Row: {
          id: string;
          teacher_id: string;
          student_id: string | null;
          score_id: string | null;
          confirmed_by: string;
          confirmed_email: string;
          confirmed_at: string;
          statement_version: string;
          statement: string;
          action: string;
          file_names: string[];
        };
        Insert: {
          id?: string;
          teacher_id: string;
          student_id?: string | null;
          score_id?: string | null;
          confirmed_by?: string;
          confirmed_email?: string;
          confirmed_at?: string;
          statement_version: string;
          statement: string;
          action?: string;
          file_names?: string[];
        };
        Update: {
          id?: string;
          teacher_id?: string;
          student_id?: string | null;
          score_id?: string | null;
          confirmed_by?: string;
          confirmed_email?: string;
          confirmed_at?: string;
          statement_version?: string;
          statement?: string;
          action?: string;
          file_names?: string[];
        };
        Relationships: [];
      };
      recording_consents: {
        Row: {
          id: string;
          teacher_id: string;
          student_id: string | null;
          student_name: string;
          signer_name: string;
          signer_relationship: string;
          signer_email: string;
          signature_png: string;
          signed_at: string;
          collected_by: string;
          collected_email: string;
          collected_how: string;
          statement_version: string;
          statement: string;
          revoked_at: string | null;
          revoked_by: string | null;
          revoked_email: string | null;
          revoked_reason: string | null;
        };
        Insert: {
          id?: string;
          teacher_id: string;
          student_id?: string | null;
          student_name?: string;
          signer_name: string;
          signer_relationship?: string;
          signer_email?: string;
          signature_png?: string;
          signed_at?: string;
          collected_by?: string;
          collected_email?: string;
          collected_how?: string;
          statement_version: string;
          statement: string;
          revoked_at?: string | null;
          revoked_by?: string | null;
          revoked_email?: string | null;
          revoked_reason?: string | null;
        };
        Update: {
          id?: string;
          teacher_id?: string;
          student_id?: string | null;
          student_name?: string;
          signer_name?: string;
          signer_relationship?: string;
          signer_email?: string;
          signature_png?: string;
          signed_at?: string;
          collected_by?: string;
          collected_email?: string;
          collected_how?: string;
          statement_version?: string;
          statement?: string;
          revoked_at?: string | null;
          revoked_by?: string | null;
          revoked_email?: string | null;
          revoked_reason?: string | null;
        };
        Relationships: [];
      };
      lesson_slots: {
        Row: {
          id: string;
          teacher_id: string;
          student_id: string;
          weekday: number;
          start_time: string;
          minutes: number;
          starts_on: string | null;
          ends_on: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          teacher_id: string;
          student_id: string;
          weekday: number;
          start_time: string;
          minutes?: number;
          starts_on?: string | null;
          ends_on?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          teacher_id?: string;
          student_id?: string;
          weekday?: number;
          start_time?: string;
          minutes?: number;
          starts_on?: string | null;
          ends_on?: string | null;
          created_at?: string;
        };
        Relationships: [];
      };
      lesson_slot_changes: {
        Row: {
          id: string;
          teacher_id: string;
          student_id: string;
          slot_id: string | null;
          kind: "cancel" | "move" | "extra";
          on_date: string;
          new_date: string | null;
          new_time: string | null;
          minutes: number | null;
          note: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          teacher_id: string;
          student_id: string;
          slot_id?: string | null;
          kind: "cancel" | "move" | "extra";
          on_date: string;
          new_date?: string | null;
          new_time?: string | null;
          minutes?: number | null;
          note?: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          teacher_id?: string;
          student_id?: string;
          slot_id?: string | null;
          kind?: "cancel" | "move" | "extra";
          on_date?: string;
          new_date?: string | null;
          new_time?: string | null;
          minutes?: number | null;
          note?: string;
          created_at?: string;
        };
        Relationships: [];
      };
      practice_weeks: {
        Row: {
          created_at: string;
          error: string | null;
          generated_at: string | null;
          id: string;
          review: Json | null;
          session_count: number;
          status: "generating" | "done" | "error";
          student_id: string;
          teacher_id: string;
          through_date: string | null;
          updated_at: string;
          week_start: string;
        };
        Insert: {
          created_at?: string;
          error?: string | null;
          generated_at?: string | null;
          id?: string;
          review?: Json | null;
          session_count?: number;
          status?: "generating" | "done" | "error";
          student_id: string;
          teacher_id: string;
          through_date?: string | null;
          updated_at?: string;
          week_start: string;
        };
        Update: {
          created_at?: string;
          error?: string | null;
          generated_at?: string | null;
          id?: string;
          review?: Json | null;
          session_count?: number;
          status?: "generating" | "done" | "error";
          student_id?: string;
          teacher_id?: string;
          through_date?: string | null;
          updated_at?: string;
          week_start?: string;
        };
        Relationships: [
          {
            foreignKeyName: "practice_weeks_student_id_fkey";
            columns: ["student_id"];
            isOneToOne: false;
            referencedRelation: "students";
            referencedColumns: ["id"];
          },
        ];
      };
      practice_sessions: {
        Row: {
          activity: Json | null;
          analysis: Json | null;
          applied: boolean;
          counted: boolean | null;
          created_at: string;
          created_by: string | null;
          duration_seconds: number;
          ended_at: string | null;
          error: string | null;
          id: string;
          lesson_id: string | null;
          media: string;
          mime_type: string | null;
          playing_seconds: number;
          practice_date: string;
          provider_job_id: string | null;
          recording_missing: boolean;
          size_bytes: number | null;
          started_at: string;
          status: string;
          storage_path: string | null;
          student_id: string;
          teacher_id: string;
          transcript: string | null;
          updated_at: string;
        };
        Insert: {
          activity?: Json | null;
          analysis?: Json | null;
          applied?: boolean;
          counted?: boolean | null;
          created_at?: string;
          created_by?: string | null;
          duration_seconds?: number;
          ended_at?: string | null;
          error?: string | null;
          id?: string;
          lesson_id?: string | null;
          media?: string;
          mime_type?: string | null;
          playing_seconds?: number;
          practice_date?: string;
          provider_job_id?: string | null;
          recording_missing?: boolean;
          size_bytes?: number | null;
          started_at: string;
          status?: string;
          storage_path?: string | null;
          student_id: string;
          teacher_id: string;
          transcript?: string | null;
          updated_at?: string;
        };
        Update: {
          activity?: Json | null;
          analysis?: Json | null;
          applied?: boolean;
          counted?: boolean | null;
          created_at?: string;
          created_by?: string | null;
          duration_seconds?: number;
          ended_at?: string | null;
          error?: string | null;
          id?: string;
          lesson_id?: string | null;
          media?: string;
          mime_type?: string | null;
          playing_seconds?: number;
          practice_date?: string;
          provider_job_id?: string | null;
          recording_missing?: boolean;
          size_bytes?: number | null;
          started_at?: string;
          status?: string;
          storage_path?: string | null;
          student_id?: string;
          teacher_id?: string;
          transcript?: string | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "practice_sessions_student_id_fkey";
            columns: ["student_id"];
            isOneToOne: false;
            referencedRelation: "students";
            referencedColumns: ["id"];
          },
        ];
      };
      practice_logs: {
        Row: {
          listen_plays: Json;
          completed_assignment_ids: string[];
          created_at: string;
          id: string;
          listened: boolean;
          logged_by: string | null;
          minutes: number | null;
          parent_note: string | null;
          practice_date: string;
          student_id: string;
          updated_at: string;
        };
        Insert: {
          listen_plays?: Json;
          completed_assignment_ids?: string[];
          created_at?: string;
          id?: string;
          listened?: boolean;
          logged_by?: string | null;
          minutes?: number | null;
          parent_note?: string | null;
          practice_date?: string;
          student_id: string;
          updated_at?: string;
        };
        Update: {
          listen_plays?: Json;
          completed_assignment_ids?: string[];
          created_at?: string;
          id?: string;
          listened?: boolean;
          logged_by?: string | null;
          minutes?: number | null;
          parent_note?: string | null;
          practice_date?: string;
          student_id?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "practice_logs_student_id_fkey";
            columns: ["student_id"];
            isOneToOne: false;
            referencedRelation: "students";
            referencedColumns: ["id"];
          },
        ];
      };
      reference_recordings: {
        Row: {
          book: string | null;
          created_at: string;
          duration_seconds: number | null;
          file_name: string | null;
          id: string;
          instrument: string | null;
          link_url: string | null;
          mime_type: string | null;
          rights_confirmation_id: string | null;
          rights_confirmed_at: string | null;
          rights_confirmed_email: string | null;
          rights_version: string | null;
          score_id: string | null;
          size_bytes: number | null;
          source: string;
          status: string;
          storage_path: string | null;
          teacher_id: string;
          title: string;
          track_no: number | null;
        };
        Insert: {
          book?: string | null;
          created_at?: string;
          duration_seconds?: number | null;
          file_name?: string | null;
          id?: string;
          instrument?: string | null;
          link_url?: string | null;
          mime_type?: string | null;
          rights_confirmation_id?: string | null;
          rights_confirmed_at?: string | null;
          rights_confirmed_email?: string | null;
          rights_version?: string | null;
          score_id?: string | null;
          size_bytes?: number | null;
          source?: string;
          status?: string;
          storage_path?: string | null;
          teacher_id: string;
          title: string;
          track_no?: number | null;
        };
        Update: {
          book?: string | null;
          created_at?: string;
          duration_seconds?: number | null;
          file_name?: string | null;
          id?: string;
          instrument?: string | null;
          link_url?: string | null;
          mime_type?: string | null;
          rights_confirmation_id?: string | null;
          rights_confirmed_at?: string | null;
          rights_confirmed_email?: string | null;
          rights_version?: string | null;
          score_id?: string | null;
          size_bytes?: number | null;
          source?: string;
          status?: string;
          storage_path?: string | null;
          teacher_id?: string;
          title?: string;
          track_no?: number | null;
        };
        Relationships: [];
      };
      reference_rights_confirmations: {
        Row: {
          confirmed_at: string;
          confirmed_by: string;
          confirmed_email: string;
          file_names: string[];
          id: string;
          statement: string;
          statement_version: string;
          teacher_id: string;
        };
        Insert: {
          confirmed_at?: string;
          confirmed_by?: string;
          confirmed_email?: string;
          file_names?: string[];
          id?: string;
          statement: string;
          statement_version: string;
          teacher_id: string;
        };
        Update: {
          confirmed_at?: string;
          confirmed_by?: string;
          confirmed_email?: string;
          file_names?: string[];
          id?: string;
          statement?: string;
          statement_version?: string;
          teacher_id?: string;
        };
        Relationships: [];
      };
      recordings: {
        Row: {
          archived_at: string | null;
          created_at: string;
          duration_seconds: number | null;
          file_name: string;
          id: string;
          label: string | null;
          lesson_id: string;
          mime_type: string;
          size_bytes: number;
          started_at: string | null;
          started_at_source: string | null;
          status: string;
          storage_path: string;
          stream_error: string | null;
          stream_hls_url: string | null;
          stream_status: string | null;
          stream_uid: string | null;
          student_id: string;
          teacher_id: string;
        };
        Insert: {
          archived_at?: string | null;
          created_at?: string;
          duration_seconds?: number | null;
          file_name: string;
          id?: string;
          label?: string | null;
          lesson_id: string;
          mime_type?: string;
          size_bytes?: number;
          started_at?: string | null;
          started_at_source?: string | null;
          status?: string;
          storage_path: string;
          stream_error?: string | null;
          stream_hls_url?: string | null;
          stream_status?: string | null;
          stream_uid?: string | null;
          student_id: string;
          teacher_id: string;
        };
        Update: {
          archived_at?: string | null;
          created_at?: string;
          duration_seconds?: number | null;
          file_name?: string;
          id?: string;
          label?: string | null;
          lesson_id?: string;
          mime_type?: string;
          size_bytes?: number;
          started_at?: string | null;
          started_at_source?: string | null;
          status?: string;
          storage_path?: string;
          stream_error?: string | null;
          stream_hls_url?: string | null;
          stream_status?: string | null;
          stream_uid?: string | null;
          student_id?: string;
          teacher_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "recordings_lesson_id_fkey";
            columns: ["lesson_id"];
            isOneToOne: false;
            referencedRelation: "lessons";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "recordings_student_id_fkey";
            columns: ["student_id"];
            isOneToOne: false;
            referencedRelation: "students";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "recordings_teacher_id_fkey";
            columns: ["teacher_id"];
            isOneToOne: false;
            referencedRelation: "teachers";
            referencedColumns: ["id"];
          },
        ];
      };
      repertoire: {
        Row: {
          book: string | null;
          created_at: string;
          id: string;
          last_played_on: string | null;
          notes: string | null;
          started_on: string | null;
          status: Database["public"]["Enums"]["repertoire_status"];
          student_id: string;
          title: string;
        };
        Insert: {
          book?: string | null;
          created_at?: string;
          id?: string;
          last_played_on?: string | null;
          notes?: string | null;
          started_on?: string | null;
          status?: Database["public"]["Enums"]["repertoire_status"];
          student_id: string;
          title: string;
        };
        Update: {
          book?: string | null;
          created_at?: string;
          id?: string;
          last_played_on?: string | null;
          notes?: string | null;
          started_on?: string | null;
          status?: Database["public"]["Enums"]["repertoire_status"];
          student_id?: string;
          title?: string;
        };
        Relationships: [
          {
            foreignKeyName: "repertoire_student_id_fkey";
            columns: ["student_id"];
            isOneToOne: false;
            referencedRelation: "students";
            referencedColumns: ["id"];
          },
        ];
      };
      scores: {
        Row: {
          analysis: Json | null;
          melody: Json | null;
          analysis_at: string | null;
          analysis_error: string | null;
          analysis_status: string;
          source_name: string | null;
          source_path: string | null;
          source_size: number | null;
          title_auto: boolean;
          rights_confirmation_id: string | null;
          rights_confirmed_at: string | null;
          rights_confirmed_email: string | null;
          rights_version: string | null;
          archived: boolean;
          created_at: string;
          id: string;
          kind: string;
          pages: Json;
          repertoire_id: string | null;
          sort_order: number;
          student_id: string;
          teacher_id: string;
          title: string;
        };
        Insert: {
          analysis?: Json | null;
          melody?: Json | null;
          analysis_at?: string | null;
          analysis_error?: string | null;
          analysis_status?: string;
          source_name?: string | null;
          source_path?: string | null;
          source_size?: number | null;
          title_auto?: boolean;
          rights_confirmation_id?: string | null;
          rights_confirmed_at?: string | null;
          rights_confirmed_email?: string | null;
          rights_version?: string | null;
          archived?: boolean;
          created_at?: string;
          id?: string;
          kind?: string;
          pages?: Json;
          repertoire_id?: string | null;
          sort_order?: number;
          student_id: string;
          teacher_id: string;
          title: string;
        };
        Update: {
          analysis?: Json | null;
          melody?: Json | null;
          analysis_at?: string | null;
          analysis_error?: string | null;
          analysis_status?: string;
          source_name?: string | null;
          source_path?: string | null;
          source_size?: number | null;
          title_auto?: boolean;
          rights_confirmation_id?: string | null;
          rights_confirmed_at?: string | null;
          rights_confirmed_email?: string | null;
          rights_version?: string | null;
          archived?: boolean;
          created_at?: string;
          id?: string;
          kind?: string;
          pages?: Json;
          repertoire_id?: string | null;
          sort_order?: number;
          student_id?: string;
          teacher_id?: string;
          title?: string;
        };
        Relationships: [
          {
            foreignKeyName: "scores_repertoire_id_fkey";
            columns: ["repertoire_id"];
            isOneToOne: false;
            referencedRelation: "repertoire";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "scores_student_id_fkey";
            columns: ["student_id"];
            isOneToOne: false;
            referencedRelation: "students";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "scores_teacher_id_fkey";
            columns: ["teacher_id"];
            isOneToOne: false;
            referencedRelation: "teachers";
            referencedColumns: ["id"];
          },
        ];
      };
      stand_events: {
        Row: {
          at: string;
          created_at: string;
          id: string;
          kind: string;
          lesson_id: string;
          note: string | null;
          page: number | null;
          rect: Json | null;
          score_id: string | null;
          student_id: string;
          teacher_id: string;
        };
        Insert: {
          at: string;
          created_at?: string;
          id?: string;
          kind: string;
          lesson_id: string;
          note?: string | null;
          page?: number | null;
          rect?: Json | null;
          score_id?: string | null;
          student_id: string;
          teacher_id: string;
        };
        Update: {
          at?: string;
          created_at?: string;
          id?: string;
          kind?: string;
          lesson_id?: string;
          note?: string | null;
          page?: number | null;
          rect?: Json | null;
          score_id?: string | null;
          student_id?: string;
          teacher_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "stand_events_lesson_id_fkey";
            columns: ["lesson_id"];
            isOneToOne: false;
            referencedRelation: "lessons";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "stand_events_score_id_fkey";
            columns: ["score_id"];
            isOneToOne: false;
            referencedRelation: "scores";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "stand_events_student_id_fkey";
            columns: ["student_id"];
            isOneToOne: false;
            referencedRelation: "students";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "stand_events_teacher_id_fkey";
            columns: ["teacher_id"];
            isOneToOne: false;
            referencedRelation: "teachers";
            referencedColumns: ["id"];
          },
        ];
      };
      student_parents: {
        Row: {
          parent_id: string;
          student_id: string;
        };
        Insert: {
          parent_id: string;
          student_id: string;
        };
        Update: {
          parent_id?: string;
          student_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "student_parents_parent_id_fkey";
            columns: ["parent_id"];
            isOneToOne: false;
            referencedRelation: "parents";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "student_parents_student_id_fkey";
            columns: ["student_id"];
            isOneToOne: false;
            referencedRelation: "students";
            referencedColumns: ["id"];
          },
        ];
      };
      students: {
        Row: {
          active: boolean;
          age: number | null;
          created_at: string;
          current_book: string | null;
          goals: string | null;
          id: string;
          instrument: string;
          lesson_day: string | null;
          lesson_time: string | null;
          method: string;
          name: string;
          notes: string | null;
          photo_path: string | null;
          photo_updated_at: string | null;
          teacher_id: string;
        };
        Insert: {
          active?: boolean;
          age?: number | null;
          created_at?: string;
          current_book?: string | null;
          goals?: string | null;
          id?: string;
          instrument: string;
          lesson_day?: string | null;
          lesson_time?: string | null;
          method?: string;
          name: string;
          notes?: string | null;
          photo_path?: string | null;
          photo_updated_at?: string | null;
          teacher_id: string;
        };
        Update: {
          active?: boolean;
          age?: number | null;
          created_at?: string;
          current_book?: string | null;
          goals?: string | null;
          id?: string;
          instrument?: string;
          lesson_day?: string | null;
          lesson_time?: string | null;
          method?: string;
          name?: string;
          notes?: string | null;
          photo_path?: string | null;
          photo_updated_at?: string | null;
          teacher_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "students_teacher_id_fkey";
            columns: ["teacher_id"];
            isOneToOne: false;
            referencedRelation: "teachers";
            referencedColumns: ["id"];
          },
        ];
      };
      teachers: {
        Row: {
          created_at: string;
          id: string;
          name: string;
          studio_name: string;
          user_id: string;
          /** Missing until teaching-assistant.sql has run. */
          review_tone?: string;
          teaching_profile?: Json | null;
        };
        Insert: {
          created_at?: string;
          id?: string;
          name?: string;
          studio_name?: string;
          user_id: string;
          review_tone?: string;
          teaching_profile?: Json | null;
        };
        Update: {
          created_at?: string;
          id?: string;
          name?: string;
          studio_name?: string;
          user_id?: string;
          review_tone?: string;
          teaching_profile?: Json | null;
        };
        Relationships: [];
      };
      student_reminders: {
        Row: {
          id: string;
          student_id: string;
          kind: string;
          text: string;
          status: string;
          lesson_id: string | null;
          sort_order: number;
          created_at: string;
          updated_at: string;
          cleared_at: string | null;
        };
        Insert: {
          id?: string;
          student_id: string;
          kind?: string;
          text: string;
          status?: string;
          lesson_id?: string | null;
          sort_order?: number;
          created_at?: string;
          updated_at?: string;
          cleared_at?: string | null;
        };
        Update: {
          id?: string;
          student_id?: string;
          kind?: string;
          text?: string;
          status?: string;
          lesson_id?: string | null;
          sort_order?: number;
          created_at?: string;
          updated_at?: string;
          cleared_at?: string | null;
        };
        Relationships: [];
      };
      teaching_assistant_messages: {
        Row: {
          id: string;
          teacher_id: string;
          role: string;
          content: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          teacher_id: string;
          role: string;
          content: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          teacher_id?: string;
          role?: string;
          content?: string;
          created_at?: string;
        };
        Relationships: [];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      admin_delete_user: { Args: { uid: string }; Returns: undefined };
      admin_storage_usage: {
        Args: never;
        Returns: { bucket_id: string; files: number; bytes: number }[];
      };
      admin_unlinked_videos: {
        Args: never;
        Returns: { name: string; bytes: number; created_at: string }[];
      };
      admin_list_users: {
        Args: never;
        Returns: { id: string; email: string; created_at: string; last_sign_in_at: string | null }[];
      };
      admin_make_teacher: { Args: { uid: string }; Returns: string };
      is_app_admin: { Args: never; Returns: boolean };
      my_parent_ids: { Args: never; Returns: string[] };
      my_teacher_id: { Args: never; Returns: string };
      parents_student: { Args: { sid: string }; Returns: boolean };
      teaches_student: { Args: { sid: string }; Returns: boolean };
    };
    Enums: {
      assignment_kind:
        | "piece"
        | "technique"
        | "review"
        | "listening"
        | "game"
        | "theory"
        | "other";
      lesson_status: "draft" | "approved";
      piece_activity:
        | "started"
        | "worked_on"
        | "polished"
        | "reviewed"
        | "performed";
      repertoire_status:
        | "preview"
        | "learning"
        | "polishing"
        | "review"
        | "performed";
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type PublicSchema = Database["public"];

export type Tables<T extends keyof PublicSchema["Tables"]> =
  PublicSchema["Tables"][T]["Row"];
export type TablesInsert<T extends keyof PublicSchema["Tables"]> =
  PublicSchema["Tables"][T]["Insert"];
export type TablesUpdate<T extends keyof PublicSchema["Tables"]> =
  PublicSchema["Tables"][T]["Update"];
export type Enums<T extends keyof PublicSchema["Enums"]> =
  PublicSchema["Enums"][T];

export const Constants = {
  public: {
    Enums: {
      assignment_kind: [
        "piece",
        "technique",
        "review",
        "listening",
        "game",
        "theory",
        "other",
      ],
      lesson_status: ["draft", "approved"],
      piece_activity: [
        "started",
        "worked_on",
        "polished",
        "reviewed",
        "performed",
      ],
      repertoire_status: [
        "preview",
        "learning",
        "polishing",
        "review",
        "performed",
      ],
    },
  },
} as const;
