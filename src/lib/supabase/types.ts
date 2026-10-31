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
      assignments: {
        Row: {
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
      practice_logs: {
        Row: {
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
      recordings: {
        Row: {
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
          student_id: string;
          teacher_id: string;
        };
        Insert: {
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
          student_id: string;
          teacher_id: string;
        };
        Update: {
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
        };
        Insert: {
          created_at?: string;
          id?: string;
          name?: string;
          studio_name?: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          name?: string;
          studio_name?: string;
          user_id?: string;
        };
        Relationships: [];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
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
