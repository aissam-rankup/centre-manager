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
      alerts: {
        Row: {
          created_at: string
          id: string
          payload: Json
          resolved: boolean
          student_id: string
          type: Database["public"]["Enums"]["alert_type"]
        }
        Insert: {
          created_at?: string
          id?: string
          payload?: Json
          resolved?: boolean
          student_id: string
          type: Database["public"]["Enums"]["alert_type"]
        }
        Update: {
          created_at?: string
          id?: string
          payload?: Json
          resolved?: boolean
          student_id?: string
          type?: Database["public"]["Enums"]["alert_type"]
        }
        Relationships: [
          {
            foreignKeyName: "alerts_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "follow_up_queue"
            referencedColumns: ["student_id"]
          },
          {
            foreignKeyName: "alerts_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "student_directory"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "alerts_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      attendance: {
        Row: {
          id: string
          marked_at: string
          session_date: string
          status: Database["public"]["Enums"]["attendance_status"]
          student_id: string
          subject_id: string
          teacher_id: string | null
        }
        Insert: {
          id?: string
          marked_at?: string
          session_date: string
          status: Database["public"]["Enums"]["attendance_status"]
          student_id: string
          subject_id: string
          teacher_id?: string | null
        }
        Update: {
          id?: string
          marked_at?: string
          session_date?: string
          status?: Database["public"]["Enums"]["attendance_status"]
          student_id?: string
          subject_id?: string
          teacher_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "attendance_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "follow_up_queue"
            referencedColumns: ["student_id"]
          },
          {
            foreignKeyName: "attendance_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "student_directory"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attendance_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attendance_subject_id_fkey"
            columns: ["subject_id"]
            isOneToOne: false
            referencedRelation: "subject_catalog"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attendance_subject_id_fkey"
            columns: ["subject_id"]
            isOneToOne: false
            referencedRelation: "subjects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attendance_teacher_id_fkey"
            columns: ["teacher_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      centers: {
        Row: {
          created_at: string
          id: string
          name: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
        }
        Relationships: []
      }
      enrollments: {
        Row: {
          active: boolean
          billing_day: number | null
          id: string
          price_agreed: number
          start_date: string
          student_id: string
          subject_id: string
        }
        Insert: {
          active?: boolean
          billing_day?: number | null
          id?: string
          price_agreed: number
          start_date?: string
          student_id: string
          subject_id: string
        }
        Update: {
          active?: boolean
          billing_day?: number | null
          id?: string
          price_agreed?: number
          start_date?: string
          student_id?: string
          subject_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "enrollments_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "follow_up_queue"
            referencedColumns: ["student_id"]
          },
          {
            foreignKeyName: "enrollments_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "student_directory"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "enrollments_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "enrollments_subject_id_fkey"
            columns: ["subject_id"]
            isOneToOne: false
            referencedRelation: "subject_catalog"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "enrollments_subject_id_fkey"
            columns: ["subject_id"]
            isOneToOne: false
            referencedRelation: "subjects"
            referencedColumns: ["id"]
          },
        ]
      }
      follow_ups: {
        Row: {
          channel: Database["public"]["Enums"]["follow_up_channel"]
          created_at: string
          created_by: string | null
          id: string
          invoice_id: string | null
          note: string | null
          student_id: string
          type: Database["public"]["Enums"]["follow_up_type"]
        }
        Insert: {
          channel: Database["public"]["Enums"]["follow_up_channel"]
          created_at?: string
          created_by?: string | null
          id?: string
          invoice_id?: string | null
          note?: string | null
          student_id: string
          type: Database["public"]["Enums"]["follow_up_type"]
        }
        Update: {
          channel?: Database["public"]["Enums"]["follow_up_channel"]
          created_at?: string
          created_by?: string | null
          id?: string
          invoice_id?: string | null
          note?: string | null
          student_id?: string
          type?: Database["public"]["Enums"]["follow_up_type"]
        }
        Relationships: [
          {
            foreignKeyName: "follow_ups_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "follow_ups_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "follow_up_queue"
            referencedColumns: ["oldest_invoice_id"]
          },
          {
            foreignKeyName: "follow_ups_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "follow_ups_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "follow_up_queue"
            referencedColumns: ["student_id"]
          },
          {
            foreignKeyName: "follow_ups_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "student_directory"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "follow_ups_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      invoices: {
        Row: {
          amount_due: number
          amount_paid: number
          due_date: string
          enrollment_id: string
          id: string
          paid_at: string | null
          paid_by: string | null
          period_end: string
          period_start: string
          status: Database["public"]["Enums"]["invoice_status"]
          student_id: string
        }
        Insert: {
          amount_due: number
          amount_paid?: number
          due_date: string
          enrollment_id: string
          id?: string
          paid_at?: string | null
          paid_by?: string | null
          period_end: string
          period_start: string
          status?: Database["public"]["Enums"]["invoice_status"]
          student_id: string
        }
        Update: {
          amount_due?: number
          amount_paid?: number
          due_date?: string
          enrollment_id?: string
          id?: string
          paid_at?: string | null
          paid_by?: string | null
          period_end?: string
          period_start?: string
          status?: Database["public"]["Enums"]["invoice_status"]
          student_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "invoices_enrollment_id_student_id_fkey"
            columns: ["enrollment_id", "student_id"]
            isOneToOne: false
            referencedRelation: "class_rosters"
            referencedColumns: ["id", "student_id"]
          },
          {
            foreignKeyName: "invoices_enrollment_id_student_id_fkey"
            columns: ["enrollment_id", "student_id"]
            isOneToOne: false
            referencedRelation: "enrollments"
            referencedColumns: ["id", "student_id"]
          },
          {
            foreignKeyName: "invoices_paid_by_fkey"
            columns: ["paid_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      levels: {
        Row: {
          center_id: string
          id: string
          name: string
          sort_order: number
        }
        Insert: {
          center_id: string
          id?: string
          name: string
          sort_order?: number
        }
        Update: {
          center_id?: string
          id?: string
          name?: string
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "levels_center_id_fkey"
            columns: ["center_id"]
            isOneToOne: false
            referencedRelation: "centers"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          active: boolean
          center_id: string
          created_at: string
          full_name: string
          id: string
          phone: string | null
          role: Database["public"]["Enums"]["user_role"]
        }
        Insert: {
          active?: boolean
          center_id: string
          created_at?: string
          full_name: string
          id: string
          phone?: string | null
          role: Database["public"]["Enums"]["user_role"]
        }
        Update: {
          active?: boolean
          center_id?: string
          created_at?: string
          full_name?: string
          id?: string
          phone?: string | null
          role?: Database["public"]["Enums"]["user_role"]
        }
        Relationships: [
          {
            foreignKeyName: "profiles_center_id_fkey"
            columns: ["center_id"]
            isOneToOne: false
            referencedRelation: "centers"
            referencedColumns: ["id"]
          },
        ]
      }
      schedule_slots: {
        Row: {
          center_id: string
          day_of_week: number
          end_time: string
          id: string
          level_id: string
          room: string
          start_time: string
          subject_id: string
          teacher_id: string
        }
        Insert: {
          center_id: string
          day_of_week: number
          end_time: string
          id?: string
          level_id: string
          room: string
          start_time: string
          subject_id: string
          teacher_id: string
        }
        Update: {
          center_id?: string
          day_of_week?: number
          end_time?: string
          id?: string
          level_id?: string
          room?: string
          start_time?: string
          subject_id?: string
          teacher_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "schedule_slots_center_id_fkey"
            columns: ["center_id"]
            isOneToOne: false
            referencedRelation: "centers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "schedule_slots_level_id_center_id_fkey"
            columns: ["level_id", "center_id"]
            isOneToOne: false
            referencedRelation: "levels"
            referencedColumns: ["id", "center_id"]
          },
          {
            foreignKeyName: "schedule_slots_subject_id_level_id_fkey"
            columns: ["subject_id", "level_id"]
            isOneToOne: false
            referencedRelation: "subject_catalog"
            referencedColumns: ["id", "level_id"]
          },
          {
            foreignKeyName: "schedule_slots_subject_id_level_id_fkey"
            columns: ["subject_id", "level_id"]
            isOneToOne: false
            referencedRelation: "subjects"
            referencedColumns: ["id", "level_id"]
          },
          {
            foreignKeyName: "schedule_slots_teacher_id_center_id_fkey"
            columns: ["teacher_id", "center_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id", "center_id"]
          },
        ]
      }
      students: {
        Row: {
          center_id: string
          created_at: string
          created_by: string | null
          full_name: string
          guardian_name: string | null
          guardian_phone: string | null
          id: string
          level_id: string
          notes: string | null
          photo_url: string | null
          search_name: string | null
        }
        Insert: {
          center_id: string
          created_at?: string
          created_by?: string | null
          full_name: string
          guardian_name?: string | null
          guardian_phone?: string | null
          id?: string
          level_id: string
          notes?: string | null
          photo_url?: string | null
          search_name?: string | null
        }
        Update: {
          center_id?: string
          created_at?: string
          created_by?: string | null
          full_name?: string
          guardian_name?: string | null
          guardian_phone?: string | null
          id?: string
          level_id?: string
          notes?: string | null
          photo_url?: string | null
          search_name?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "students_center_id_fkey"
            columns: ["center_id"]
            isOneToOne: false
            referencedRelation: "centers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "students_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "students_level_id_center_id_fkey"
            columns: ["level_id", "center_id"]
            isOneToOne: false
            referencedRelation: "levels"
            referencedColumns: ["id", "center_id"]
          },
        ]
      }
      subjects: {
        Row: {
          center_id: string
          created_at: string
          id: string
          level_id: string
          monthly_price: number
          name: string
        }
        Insert: {
          center_id: string
          created_at?: string
          id?: string
          level_id: string
          monthly_price: number
          name: string
        }
        Update: {
          center_id?: string
          created_at?: string
          id?: string
          level_id?: string
          monthly_price?: number
          name?: string
        }
        Relationships: [
          {
            foreignKeyName: "subjects_center_id_fkey"
            columns: ["center_id"]
            isOneToOne: false
            referencedRelation: "centers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "subjects_level_id_center_id_fkey"
            columns: ["level_id", "center_id"]
            isOneToOne: false
            referencedRelation: "levels"
            referencedColumns: ["id", "center_id"]
          },
        ]
      }
      teacher_assignments: {
        Row: {
          id: string
          level_id: string
          subject_id: string
          teacher_id: string
        }
        Insert: {
          id?: string
          level_id: string
          subject_id: string
          teacher_id: string
        }
        Update: {
          id?: string
          level_id?: string
          subject_id?: string
          teacher_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "teacher_assignments_subject_id_level_id_fkey"
            columns: ["subject_id", "level_id"]
            isOneToOne: false
            referencedRelation: "subject_catalog"
            referencedColumns: ["id", "level_id"]
          },
          {
            foreignKeyName: "teacher_assignments_subject_id_level_id_fkey"
            columns: ["subject_id", "level_id"]
            isOneToOne: false
            referencedRelation: "subjects"
            referencedColumns: ["id", "level_id"]
          },
          {
            foreignKeyName: "teacher_assignments_teacher_id_fkey"
            columns: ["teacher_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      class_rosters: {
        Row: {
          active: boolean | null
          id: string | null
          start_date: string | null
          student_id: string | null
          subject_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "enrollments_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "follow_up_queue"
            referencedColumns: ["student_id"]
          },
          {
            foreignKeyName: "enrollments_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "student_directory"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "enrollments_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "enrollments_subject_id_fkey"
            columns: ["subject_id"]
            isOneToOne: false
            referencedRelation: "subject_catalog"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "enrollments_subject_id_fkey"
            columns: ["subject_id"]
            isOneToOne: false
            referencedRelation: "subjects"
            referencedColumns: ["id"]
          },
        ]
      }
      follow_up_queue: {
        Row: {
          center_id: string | null
          days_overdue: number | null
          followed_up_today: boolean | null
          full_name: string | null
          guardian_name: string | null
          guardian_phone: string | null
          last_follow_up_at: string | null
          level_name: string | null
          oldest_due_date: string | null
          oldest_invoice_id: string | null
          overdue_amount: number | null
          overdue_count: number | null
          photo_url: string | null
          student_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "students_center_id_fkey"
            columns: ["center_id"]
            isOneToOne: false
            referencedRelation: "centers"
            referencedColumns: ["id"]
          },
        ]
      }
      open_absence_alerts: {
        Row: {
          absence_count: number | null
          center_id: string | null
          created_at: string | null
          full_name: string | null
          guardian_name: string | null
          guardian_phone: string | null
          id: string | null
          last_session_date: string | null
          level_name: string | null
          photo_url: string | null
          student_id: string | null
          subject_name: string | null
        }
        Relationships: [
          {
            foreignKeyName: "alerts_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "follow_up_queue"
            referencedColumns: ["student_id"]
          },
          {
            foreignKeyName: "alerts_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "student_directory"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "alerts_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "students_center_id_fkey"
            columns: ["center_id"]
            isOneToOne: false
            referencedRelation: "centers"
            referencedColumns: ["id"]
          },
        ]
      }
      student_directory: {
        Row: {
          center_id: string | null
          created_at: string | null
          full_name: string | null
          guardian_name: string | null
          guardian_phone: string | null
          id: string | null
          is_overdue: boolean | null
          level_id: string | null
          level_name: string | null
          level_sort_order: number | null
          overdue_amount: number | null
          overdue_count: number | null
          photo_url: string | null
          search_name: string | null
          unpaid_amount: number | null
        }
        Relationships: [
          {
            foreignKeyName: "students_center_id_fkey"
            columns: ["center_id"]
            isOneToOne: false
            referencedRelation: "centers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "students_level_id_center_id_fkey"
            columns: ["level_id", "center_id"]
            isOneToOne: false
            referencedRelation: "levels"
            referencedColumns: ["id", "center_id"]
          },
        ]
      }
      subject_catalog: {
        Row: {
          center_id: string | null
          id: string | null
          level_id: string | null
          name: string | null
        }
        Insert: {
          center_id?: string | null
          id?: string | null
          level_id?: string | null
          name?: string | null
        }
        Update: {
          center_id?: string | null
          id?: string | null
          level_id?: string | null
          name?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "subjects_center_id_fkey"
            columns: ["center_id"]
            isOneToOne: false
            referencedRelation: "centers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "subjects_level_id_center_id_fkey"
            columns: ["level_id", "center_id"]
            isOneToOne: false
            referencedRelation: "levels"
            referencedColumns: ["id", "center_id"]
          },
        ]
      }
    }
    Functions: {
      admin_absence_rates: {
        Args: { p_days?: number; p_level_id?: string }
        Returns: {
          absence_rate: number
          absent_count: number
          level_id: string
          level_name: string
          level_sort: number
          subject_id: string
          subject_name: string
          total_count: number
        }[]
      }
      admin_enrollment_report: {
        Args: never
        Returns: {
          active_enrollments: number
          agreed_revenue: number
          level_id: string
          level_name: string
          level_sort: number
          level_students: number
          monthly_price: number
          subject_id: string
          subject_name: string
        }[]
      }
      admin_list_users: {
        Args: never
        Returns: {
          active: boolean
          created_at: string
          email: string
          full_name: string
          id: string
          last_sign_in_at: string
          phone: string
          role: Database["public"]["Enums"]["user_role"]
        }[]
      }
      admin_month_revenue: {
        Args: { p_level_id?: string }
        Returns: {
          collected_amount: number
          expected_amount: number
          invoice_count: number
          month_start: string
          paid_count: number
          student_count: number
        }[]
      }
      assistant_dashboard_stats: {
        Args: never
        Returns: {
          absences_today: number
          open_absence_alerts: number
          overdue_amount: number
          overdue_count: number
          overdue_students: number
          unpaid_amount: number
          unpaid_count: number
        }[]
      }
      create_student: {
        Args: {
          p_full_name: string
          p_guardian_name?: string
          p_guardian_phone?: string
          p_level_id: string
          p_notes?: string
          p_photo_path?: string
          p_student_id: string
          p_subject_ids: string[]
        }
        Returns: string
      }
      custom_access_token_hook: { Args: { event: Json }; Returns: Json }
      mark_invoice_paid: {
        Args: { p_invoice_id: string }
        Returns: {
          amount_due: number
          amount_paid: number
          due_date: string
          enrollment_id: string
          id: string
          paid_at: string | null
          paid_by: string | null
          period_end: string
          period_start: string
          status: Database["public"]["Enums"]["invoice_status"]
          student_id: string
        }
        SetofOptions: {
          from: "*"
          to: "invoices"
          isOneToOne: true
          isSetofReturn: false
        }
      }
    }
    Enums: {
      alert_type: "consecutive_absences" | "overdue_payment"
      attendance_status: "present" | "absent"
      follow_up_channel: "phone" | "whatsapp" | "in_person"
      follow_up_type: "payment" | "absence"
      invoice_status: "pending" | "paid" | "overdue"
      user_role: "admin" | "assistant" | "teacher"
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      alert_type: ["consecutive_absences", "overdue_payment"],
      attendance_status: ["present", "absent"],
      follow_up_channel: ["phone", "whatsapp", "in_person"],
      follow_up_type: ["payment", "absence"],
      invoice_status: ["pending", "paid", "overdue"],
      user_role: ["admin", "assistant", "teacher"],
    },
  },
} as const

