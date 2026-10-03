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
      absence_notifications: {
        Row: {
          attendance_id: string | null
          center_id: string
          channel: Database["public"]["Enums"]["notification_channel"]
          guardian_phone_used: string | null
          id: string
          is_demo: boolean
          is_repeat: boolean
          is_series: boolean
          message_body: string | null
          sent_at: string
          sent_by: string | null
          status: Database["public"]["Enums"]["absence_notification_status"]
          student_id: string
          template_used: string | null
        }
        Insert: {
          attendance_id?: string | null
          center_id: string
          channel: Database["public"]["Enums"]["notification_channel"]
          guardian_phone_used?: string | null
          id?: string
          is_demo?: boolean
          is_repeat?: boolean
          is_series?: boolean
          message_body?: string | null
          sent_at?: string
          sent_by?: string | null
          status?: Database["public"]["Enums"]["absence_notification_status"]
          student_id: string
          template_used?: string | null
        }
        Update: {
          attendance_id?: string | null
          center_id?: string
          channel?: Database["public"]["Enums"]["notification_channel"]
          guardian_phone_used?: string | null
          id?: string
          is_demo?: boolean
          is_repeat?: boolean
          is_series?: boolean
          message_body?: string | null
          sent_at?: string
          sent_by?: string | null
          status?: Database["public"]["Enums"]["absence_notification_status"]
          student_id?: string
          template_used?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "absence_notifications_attendance_id_fkey"
            columns: ["attendance_id"]
            isOneToOne: false
            referencedRelation: "absences_to_notify"
            referencedColumns: ["attendance_id"]
          },
          {
            foreignKeyName: "absence_notifications_attendance_id_fkey"
            columns: ["attendance_id"]
            isOneToOne: false
            referencedRelation: "attendance"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "absence_notifications_center_id_fkey"
            columns: ["center_id"]
            isOneToOne: false
            referencedRelation: "centers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "absence_notifications_sent_by_fkey"
            columns: ["sent_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "absence_notifications_student_id_center_id_fkey"
            columns: ["student_id", "center_id"]
            isOneToOne: false
            referencedRelation: "follow_up_queue"
            referencedColumns: ["student_id", "center_id"]
          },
          {
            foreignKeyName: "absence_notifications_student_id_center_id_fkey"
            columns: ["student_id", "center_id"]
            isOneToOne: false
            referencedRelation: "student_directory"
            referencedColumns: ["id", "center_id"]
          },
          {
            foreignKeyName: "absence_notifications_student_id_center_id_fkey"
            columns: ["student_id", "center_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id", "center_id"]
          },
        ]
      }
      alerts: {
        Row: {
          created_at: string
          id: string
          is_demo: boolean
          payload: Json
          resolved: boolean
          student_id: string
          type: Database["public"]["Enums"]["alert_type"]
        }
        Insert: {
          created_at?: string
          id?: string
          is_demo?: boolean
          payload?: Json
          resolved?: boolean
          student_id: string
          type: Database["public"]["Enums"]["alert_type"]
        }
        Update: {
          created_at?: string
          id?: string
          is_demo?: boolean
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
          is_demo: boolean
          marked_at: string
          note: string | null
          session_date: string
          status: Database["public"]["Enums"]["attendance_status"]
          student_id: string
          subject_id: string
          teacher_id: string | null
        }
        Insert: {
          id?: string
          is_demo?: boolean
          marked_at?: string
          note?: string | null
          session_date: string
          status: Database["public"]["Enums"]["attendance_status"]
          student_id: string
          subject_id: string
          teacher_id?: string | null
        }
        Update: {
          id?: string
          is_demo?: boolean
          marked_at?: string
          note?: string | null
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
            referencedRelation: "absences_to_notify"
            referencedColumns: ["subject_id"]
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
      billing_run_lines: {
        Row: {
          amount_due: number
          amount_full: number
          billing_run_id: string
          center_id: string
          discount_amount: number
          discount_conflict: boolean
          discount_id: string | null
          discount_snapshot: Json | null
          due_date: string
          enrollment_id: string | null
          id: string
          invoice_id: string | null
          is_demo: boolean
          pack_enrollment_id: string | null
          period_end: string
          period_start: string
          stopped_at: string | null
          student_id: string
        }
        Insert: {
          amount_due: number
          amount_full: number
          billing_run_id: string
          center_id: string
          discount_amount?: number
          discount_conflict?: boolean
          discount_id?: string | null
          discount_snapshot?: Json | null
          due_date: string
          enrollment_id?: string | null
          id?: string
          invoice_id?: string | null
          is_demo?: boolean
          pack_enrollment_id?: string | null
          period_end: string
          period_start: string
          stopped_at?: string | null
          student_id: string
        }
        Update: {
          amount_due?: number
          amount_full?: number
          billing_run_id?: string
          center_id?: string
          discount_amount?: number
          discount_conflict?: boolean
          discount_id?: string | null
          discount_snapshot?: Json | null
          due_date?: string
          enrollment_id?: string | null
          id?: string
          invoice_id?: string | null
          is_demo?: boolean
          pack_enrollment_id?: string | null
          period_end?: string
          period_start?: string
          stopped_at?: string | null
          student_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "billing_run_lines_billing_run_id_center_id_fkey"
            columns: ["billing_run_id", "center_id"]
            isOneToOne: false
            referencedRelation: "billing_runs"
            referencedColumns: ["id", "center_id"]
          },
          {
            foreignKeyName: "billing_run_lines_discount_id_center_id_fkey"
            columns: ["discount_id", "center_id"]
            isOneToOne: false
            referencedRelation: "discount_overlaps"
            referencedColumns: ["discount_id", "center_id"]
          },
          {
            foreignKeyName: "billing_run_lines_discount_id_center_id_fkey"
            columns: ["discount_id", "center_id"]
            isOneToOne: false
            referencedRelation: "discount_overlaps"
            referencedColumns: ["other_discount_id", "center_id"]
          },
          {
            foreignKeyName: "billing_run_lines_discount_id_center_id_fkey"
            columns: ["discount_id", "center_id"]
            isOneToOne: false
            referencedRelation: "discounts"
            referencedColumns: ["id", "center_id"]
          },
          {
            foreignKeyName: "billing_run_lines_enrollment_id_student_id_fkey"
            columns: ["enrollment_id", "student_id"]
            isOneToOne: false
            referencedRelation: "class_rosters"
            referencedColumns: ["id", "student_id"]
          },
          {
            foreignKeyName: "billing_run_lines_enrollment_id_student_id_fkey"
            columns: ["enrollment_id", "student_id"]
            isOneToOne: false
            referencedRelation: "enrollments"
            referencedColumns: ["id", "student_id"]
          },
          {
            foreignKeyName: "billing_run_lines_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "follow_up_queue"
            referencedColumns: ["oldest_invoice_id"]
          },
          {
            foreignKeyName: "billing_run_lines_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "billing_run_lines_pack_enrollment_id_student_id_fkey"
            columns: ["pack_enrollment_id", "student_id"]
            isOneToOne: false
            referencedRelation: "pack_enrollments"
            referencedColumns: ["id", "student_id"]
          },
          {
            foreignKeyName: "billing_run_lines_student_id_center_id_fkey"
            columns: ["student_id", "center_id"]
            isOneToOne: false
            referencedRelation: "follow_up_queue"
            referencedColumns: ["student_id", "center_id"]
          },
          {
            foreignKeyName: "billing_run_lines_student_id_center_id_fkey"
            columns: ["student_id", "center_id"]
            isOneToOne: false
            referencedRelation: "student_directory"
            referencedColumns: ["id", "center_id"]
          },
          {
            foreignKeyName: "billing_run_lines_student_id_center_id_fkey"
            columns: ["student_id", "center_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id", "center_id"]
          },
        ]
      }
      billing_runs: {
        Row: {
          cancel_reason: string | null
          cancelled_at: string | null
          cancelled_by: string | null
          center_id: string
          closed_at: string | null
          confirmed_at: string | null
          confirmed_by: string | null
          generated_at: string
          generated_by: string | null
          id: string
          is_demo: boolean
          notes: string | null
          period_month: number
          period_year: number
          sent_at: string | null
          status: Database["public"]["Enums"]["billing_run_status"]
          student_count: number
          total_expected: number
        }
        Insert: {
          cancel_reason?: string | null
          cancelled_at?: string | null
          cancelled_by?: string | null
          center_id: string
          closed_at?: string | null
          confirmed_at?: string | null
          confirmed_by?: string | null
          generated_at?: string
          generated_by?: string | null
          id?: string
          is_demo?: boolean
          notes?: string | null
          period_month: number
          period_year: number
          sent_at?: string | null
          status?: Database["public"]["Enums"]["billing_run_status"]
          student_count?: number
          total_expected?: number
        }
        Update: {
          cancel_reason?: string | null
          cancelled_at?: string | null
          cancelled_by?: string | null
          center_id?: string
          closed_at?: string | null
          confirmed_at?: string | null
          confirmed_by?: string | null
          generated_at?: string
          generated_by?: string | null
          id?: string
          is_demo?: boolean
          notes?: string | null
          period_month?: number
          period_year?: number
          sent_at?: string | null
          status?: Database["public"]["Enums"]["billing_run_status"]
          student_count?: number
          total_expected?: number
        }
        Relationships: [
          {
            foreignKeyName: "billing_runs_cancelled_by_center_id_fkey"
            columns: ["cancelled_by", "center_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id", "center_id"]
          },
          {
            foreignKeyName: "billing_runs_center_id_fkey"
            columns: ["center_id"]
            isOneToOne: false
            referencedRelation: "centers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "billing_runs_confirmed_by_center_id_fkey"
            columns: ["confirmed_by", "center_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id", "center_id"]
          },
          {
            foreignKeyName: "billing_runs_generated_by_center_id_fkey"
            columns: ["generated_by", "center_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id", "center_id"]
          },
        ]
      }
      cash_movements: {
        Row: {
          amount: number
          cash_session_id: string
          center_id: string
          corrects_session_id: string | null
          created_at: string
          created_by: string | null
          expense_id: string | null
          id: string
          is_demo: boolean
          kind: Database["public"]["Enums"]["cash_movement_kind"]
          payroll_line_id: string | null
          reason: string
          receipt_id: string | null
        }
        Insert: {
          amount: number
          cash_session_id: string
          center_id: string
          corrects_session_id?: string | null
          created_at?: string
          created_by?: string | null
          expense_id?: string | null
          id?: string
          is_demo?: boolean
          kind: Database["public"]["Enums"]["cash_movement_kind"]
          payroll_line_id?: string | null
          reason: string
          receipt_id?: string | null
        }
        Update: {
          amount?: number
          cash_session_id?: string
          center_id?: string
          corrects_session_id?: string | null
          created_at?: string
          created_by?: string | null
          expense_id?: string | null
          id?: string
          is_demo?: boolean
          kind?: Database["public"]["Enums"]["cash_movement_kind"]
          payroll_line_id?: string | null
          reason?: string
          receipt_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "cash_movements_cash_session_id_center_id_fkey"
            columns: ["cash_session_id", "center_id"]
            isOneToOne: false
            referencedRelation: "cash_sessions"
            referencedColumns: ["id", "center_id"]
          },
          {
            foreignKeyName: "cash_movements_corrects_session_id_center_id_fkey"
            columns: ["corrects_session_id", "center_id"]
            isOneToOne: false
            referencedRelation: "cash_sessions"
            referencedColumns: ["id", "center_id"]
          },
          {
            foreignKeyName: "cash_movements_created_by_center_id_fkey"
            columns: ["created_by", "center_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id", "center_id"]
          },
          {
            foreignKeyName: "cash_movements_expense_id_center_id_fkey"
            columns: ["expense_id", "center_id"]
            isOneToOne: false
            referencedRelation: "expenses"
            referencedColumns: ["id", "center_id"]
          },
          {
            foreignKeyName: "cash_movements_payroll_line_id_center_id_fkey"
            columns: ["payroll_line_id", "center_id"]
            isOneToOne: false
            referencedRelation: "payroll_lines"
            referencedColumns: ["id", "center_id"]
          },
          {
            foreignKeyName: "cash_movements_receipt_id_center_id_fkey"
            columns: ["receipt_id", "center_id"]
            isOneToOne: false
            referencedRelation: "receipts"
            referencedColumns: ["id", "center_id"]
          },
        ]
      }
      cash_sessions: {
        Row: {
          assistant_id: string | null
          center_id: string
          closed_at: string | null
          closed_by: string | null
          counted_cash: number | null
          expected_by_method: Json | null
          expected_cash: number | null
          id: string
          is_demo: boolean
          is_shared: boolean
          notes: string | null
          opened_at: string
          opened_by: string | null
          opening_float: number
          session_date: string
          status: Database["public"]["Enums"]["cash_session_status"]
          validated_at: string | null
          validated_by: string | null
          validation_notes: string | null
          variance: number | null
          variance_reason: string | null
        }
        Insert: {
          assistant_id?: string | null
          center_id: string
          closed_at?: string | null
          closed_by?: string | null
          counted_cash?: number | null
          expected_by_method?: Json | null
          expected_cash?: number | null
          id?: string
          is_demo?: boolean
          is_shared?: boolean
          notes?: string | null
          opened_at?: string
          opened_by?: string | null
          opening_float?: number
          session_date?: string
          status?: Database["public"]["Enums"]["cash_session_status"]
          validated_at?: string | null
          validated_by?: string | null
          validation_notes?: string | null
          variance?: number | null
          variance_reason?: string | null
        }
        Update: {
          assistant_id?: string | null
          center_id?: string
          closed_at?: string | null
          closed_by?: string | null
          counted_cash?: number | null
          expected_by_method?: Json | null
          expected_cash?: number | null
          id?: string
          is_demo?: boolean
          is_shared?: boolean
          notes?: string | null
          opened_at?: string
          opened_by?: string | null
          opening_float?: number
          session_date?: string
          status?: Database["public"]["Enums"]["cash_session_status"]
          validated_at?: string | null
          validated_by?: string | null
          validation_notes?: string | null
          variance?: number | null
          variance_reason?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "cash_sessions_assistant_id_center_id_fkey"
            columns: ["assistant_id", "center_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id", "center_id"]
          },
          {
            foreignKeyName: "cash_sessions_center_id_fkey"
            columns: ["center_id"]
            isOneToOne: false
            referencedRelation: "centers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cash_sessions_closed_by_center_id_fkey"
            columns: ["closed_by", "center_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id", "center_id"]
          },
          {
            foreignKeyName: "cash_sessions_opened_by_center_id_fkey"
            columns: ["opened_by", "center_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id", "center_id"]
          },
          {
            foreignKeyName: "cash_sessions_validated_by_center_id_fkey"
            columns: ["validated_by", "center_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id", "center_id"]
          },
        ]
      }
      center_branding: {
        Row: {
          accent_color: string | null
          brand_name: string | null
          center_id: string
          custom_domain: string | null
          domain_verified: boolean
          email_sender_name: string | null
          favicon_url: string | null
          is_demo: boolean
          login_background_url: string | null
          logo_url: string | null
          primary_color: string | null
          secondary_color: string | null
          support_email: string | null
          support_phone: string | null
          updated_at: string
        }
        Insert: {
          accent_color?: string | null
          brand_name?: string | null
          center_id: string
          custom_domain?: string | null
          domain_verified?: boolean
          email_sender_name?: string | null
          favicon_url?: string | null
          is_demo?: boolean
          login_background_url?: string | null
          logo_url?: string | null
          primary_color?: string | null
          secondary_color?: string | null
          support_email?: string | null
          support_phone?: string | null
          updated_at?: string
        }
        Update: {
          accent_color?: string | null
          brand_name?: string | null
          center_id?: string
          custom_domain?: string | null
          domain_verified?: boolean
          email_sender_name?: string | null
          favicon_url?: string | null
          is_demo?: boolean
          login_background_url?: string | null
          logo_url?: string | null
          primary_color?: string | null
          secondary_color?: string | null
          support_email?: string | null
          support_phone?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "center_branding_center_id_fkey"
            columns: ["center_id"]
            isOneToOne: true
            referencedRelation: "centers"
            referencedColumns: ["id"]
          },
        ]
      }
      center_events: {
        Row: {
          action: string
          actor_id: string | null
          center_id: string
          created_at: string
          entity_id: string | null
          id: number
          is_demo: boolean
          payload: Json
        }
        Insert: {
          action: string
          actor_id?: string | null
          center_id: string
          created_at?: string
          entity_id?: string | null
          id?: never
          is_demo?: boolean
          payload?: Json
        }
        Update: {
          action?: string
          actor_id?: string | null
          center_id?: string
          created_at?: string
          entity_id?: string | null
          id?: never
          is_demo?: boolean
          payload?: Json
        }
        Relationships: [
          {
            foreignKeyName: "center_events_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "center_events_center_id_fkey"
            columns: ["center_id"]
            isOneToOne: false
            referencedRelation: "centers"
            referencedColumns: ["id"]
          },
        ]
      }
      center_types: {
        Row: {
          code: string
          is_custom: boolean
          is_demo: boolean
          label: string
          sort_order: number
          terms: Json
        }
        Insert: {
          code: string
          is_custom?: boolean
          is_demo?: boolean
          label: string
          sort_order?: number
          terms: Json
        }
        Update: {
          code?: string
          is_custom?: boolean
          is_demo?: boolean
          label?: string
          sort_order?: number
          terms?: Json
        }
        Relationships: []
      }
      centers: {
        Row: {
          absence_notification_enabled: boolean
          absence_notification_template: string | null
          activated_at: string | null
          address: string | null
          auto_reenrollment_enabled: boolean
          billing_generation_day: number
          billing_interval: Database["public"]["Enums"]["billing_interval"]
          cancelled_at: string | null
          cash_session_per_assistant: boolean
          cash_variance_alert_threshold: number
          center_type: string
          created_at: string
          current_period_end: string | null
          custom_terms: Json
          grace_days: number
          id: string
          is_demo: boolean
          name: string
          notes: string | null
          owner_contact_email: string | null
          owner_contact_name: string | null
          owner_contact_phone: string | null
          payment_due_day: number
          payment_reminders_enabled: boolean
          phone: string | null
          price: number | null
          receipt_format: Database["public"]["Enums"]["receipt_format"]
          receipt_whatsapp_template: string | null
          reminder_days_before: number
          reminder_template_due_today: string | null
          reminder_template_overdue: string | null
          reminder_template_upcoming: string | null
          risk_attendance_threshold: number
          slug: string
          status: Database["public"]["Enums"]["center_status"]
        }
        Insert: {
          absence_notification_enabled?: boolean
          absence_notification_template?: string | null
          activated_at?: string | null
          address?: string | null
          auto_reenrollment_enabled?: boolean
          billing_generation_day?: number
          billing_interval?: Database["public"]["Enums"]["billing_interval"]
          cancelled_at?: string | null
          cash_session_per_assistant?: boolean
          cash_variance_alert_threshold?: number
          center_type?: string
          created_at?: string
          current_period_end?: string | null
          custom_terms?: Json
          grace_days?: number
          id?: string
          is_demo?: boolean
          name: string
          notes?: string | null
          owner_contact_email?: string | null
          owner_contact_name?: string | null
          owner_contact_phone?: string | null
          payment_due_day?: number
          payment_reminders_enabled?: boolean
          phone?: string | null
          price?: number | null
          receipt_format?: Database["public"]["Enums"]["receipt_format"]
          receipt_whatsapp_template?: string | null
          reminder_days_before?: number
          reminder_template_due_today?: string | null
          reminder_template_overdue?: string | null
          reminder_template_upcoming?: string | null
          risk_attendance_threshold?: number
          slug: string
          status?: Database["public"]["Enums"]["center_status"]
        }
        Update: {
          absence_notification_enabled?: boolean
          absence_notification_template?: string | null
          activated_at?: string | null
          address?: string | null
          auto_reenrollment_enabled?: boolean
          billing_generation_day?: number
          billing_interval?: Database["public"]["Enums"]["billing_interval"]
          cancelled_at?: string | null
          cash_session_per_assistant?: boolean
          cash_variance_alert_threshold?: number
          center_type?: string
          created_at?: string
          current_period_end?: string | null
          custom_terms?: Json
          grace_days?: number
          id?: string
          is_demo?: boolean
          name?: string
          notes?: string | null
          owner_contact_email?: string | null
          owner_contact_name?: string | null
          owner_contact_phone?: string | null
          payment_due_day?: number
          payment_reminders_enabled?: boolean
          phone?: string | null
          price?: number | null
          receipt_format?: Database["public"]["Enums"]["receipt_format"]
          receipt_whatsapp_template?: string | null
          reminder_days_before?: number
          reminder_template_due_today?: string | null
          reminder_template_overdue?: string | null
          reminder_template_upcoming?: string | null
          risk_attendance_threshold?: number
          slug?: string
          status?: Database["public"]["Enums"]["center_status"]
        }
        Relationships: [
          {
            foreignKeyName: "centers_center_type_fkey"
            columns: ["center_type"]
            isOneToOne: false
            referencedRelation: "center_types"
            referencedColumns: ["code"]
          },
        ]
      }
      discounts: {
        Row: {
          center_id: string
          granted_at: string
          granted_by: string | null
          id: string
          is_active: boolean
          is_demo: boolean
          pack_id: string | null
          reason: Database["public"]["Enums"]["discount_reason"]
          reason_note: string | null
          scope: Database["public"]["Enums"]["discount_scope"]
          student_id: string
          subject_id: string | null
          type: Database["public"]["Enums"]["discount_type"]
          updated_at: string
          valid_from: string
          valid_to: string | null
          value: number
        }
        Insert: {
          center_id: string
          granted_at?: string
          granted_by?: string | null
          id?: string
          is_active?: boolean
          is_demo?: boolean
          pack_id?: string | null
          reason: Database["public"]["Enums"]["discount_reason"]
          reason_note?: string | null
          scope: Database["public"]["Enums"]["discount_scope"]
          student_id: string
          subject_id?: string | null
          type: Database["public"]["Enums"]["discount_type"]
          updated_at?: string
          valid_from?: string
          valid_to?: string | null
          value: number
        }
        Update: {
          center_id?: string
          granted_at?: string
          granted_by?: string | null
          id?: string
          is_active?: boolean
          is_demo?: boolean
          pack_id?: string | null
          reason?: Database["public"]["Enums"]["discount_reason"]
          reason_note?: string | null
          scope?: Database["public"]["Enums"]["discount_scope"]
          student_id?: string
          subject_id?: string | null
          type?: Database["public"]["Enums"]["discount_type"]
          updated_at?: string
          valid_from?: string
          valid_to?: string | null
          value?: number
        }
        Relationships: [
          {
            foreignKeyName: "discounts_center_id_fkey"
            columns: ["center_id"]
            isOneToOne: false
            referencedRelation: "centers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "discounts_granted_by_fkey"
            columns: ["granted_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "discounts_pack_id_center_id_fkey"
            columns: ["pack_id", "center_id"]
            isOneToOne: false
            referencedRelation: "packs"
            referencedColumns: ["id", "center_id"]
          },
          {
            foreignKeyName: "discounts_student_id_center_id_fkey"
            columns: ["student_id", "center_id"]
            isOneToOne: false
            referencedRelation: "follow_up_queue"
            referencedColumns: ["student_id", "center_id"]
          },
          {
            foreignKeyName: "discounts_student_id_center_id_fkey"
            columns: ["student_id", "center_id"]
            isOneToOne: false
            referencedRelation: "student_directory"
            referencedColumns: ["id", "center_id"]
          },
          {
            foreignKeyName: "discounts_student_id_center_id_fkey"
            columns: ["student_id", "center_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id", "center_id"]
          },
          {
            foreignKeyName: "discounts_subject_id_center_id_fkey"
            columns: ["subject_id", "center_id"]
            isOneToOne: false
            referencedRelation: "subject_catalog"
            referencedColumns: ["id", "center_id"]
          },
          {
            foreignKeyName: "discounts_subject_id_center_id_fkey"
            columns: ["subject_id", "center_id"]
            isOneToOne: false
            referencedRelation: "subjects"
            referencedColumns: ["id", "center_id"]
          },
        ]
      }
      enrollments: {
        Row: {
          active: boolean
          billing_day: number | null
          id: string
          is_demo: boolean
          pack_enrollment_id: string | null
          price_agreed: number
          start_date: string
          student_id: string
          subject_id: string
        }
        Insert: {
          active?: boolean
          billing_day?: number | null
          id?: string
          is_demo?: boolean
          pack_enrollment_id?: string | null
          price_agreed: number
          start_date?: string
          student_id: string
          subject_id: string
        }
        Update: {
          active?: boolean
          billing_day?: number | null
          id?: string
          is_demo?: boolean
          pack_enrollment_id?: string | null
          price_agreed?: number
          start_date?: string
          student_id?: string
          subject_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "enrollments_pack_enrollment_id_fkey"
            columns: ["pack_enrollment_id"]
            isOneToOne: false
            referencedRelation: "pack_enrollments"
            referencedColumns: ["id"]
          },
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
            referencedRelation: "absences_to_notify"
            referencedColumns: ["subject_id"]
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
      expense_categories: {
        Row: {
          center_id: string
          created_at: string
          icon: string
          id: string
          is_active: boolean
          is_demo: boolean
          is_recurring: boolean
          name: string
          sort_order: number
        }
        Insert: {
          center_id: string
          created_at?: string
          icon?: string
          id?: string
          is_active?: boolean
          is_demo?: boolean
          is_recurring?: boolean
          name: string
          sort_order?: number
        }
        Update: {
          center_id?: string
          created_at?: string
          icon?: string
          id?: string
          is_active?: boolean
          is_demo?: boolean
          is_recurring?: boolean
          name?: string
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "expense_categories_center_id_fkey"
            columns: ["center_id"]
            isOneToOne: false
            referencedRelation: "centers"
            referencedColumns: ["id"]
          },
        ]
      }
      expenses: {
        Row: {
          amount: number
          category_id: string
          center_id: string
          created_at: string
          deleted_at: string | null
          deleted_by: string | null
          expense_date: string
          id: string
          is_demo: boolean
          is_recurring: boolean
          label: string
          notes: string | null
          payment_method: Database["public"]["Enums"]["payment_method"] | null
          period_month: number
          period_year: number
          receipt_url: string | null
          recorded_by: string | null
          recurrence_day: number | null
          recurrence_source_id: string | null
          status: Database["public"]["Enums"]["expense_status"]
          updated_at: string
        }
        Insert: {
          amount: number
          category_id: string
          center_id: string
          created_at?: string
          deleted_at?: string | null
          deleted_by?: string | null
          expense_date?: string
          id?: string
          is_demo?: boolean
          is_recurring?: boolean
          label: string
          notes?: string | null
          payment_method?: Database["public"]["Enums"]["payment_method"] | null
          period_month: number
          period_year: number
          receipt_url?: string | null
          recorded_by?: string | null
          recurrence_day?: number | null
          recurrence_source_id?: string | null
          status?: Database["public"]["Enums"]["expense_status"]
          updated_at?: string
        }
        Update: {
          amount?: number
          category_id?: string
          center_id?: string
          created_at?: string
          deleted_at?: string | null
          deleted_by?: string | null
          expense_date?: string
          id?: string
          is_demo?: boolean
          is_recurring?: boolean
          label?: string
          notes?: string | null
          payment_method?: Database["public"]["Enums"]["payment_method"] | null
          period_month?: number
          period_year?: number
          receipt_url?: string | null
          recorded_by?: string | null
          recurrence_day?: number | null
          recurrence_source_id?: string | null
          status?: Database["public"]["Enums"]["expense_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "expenses_category_id_center_id_fkey"
            columns: ["category_id", "center_id"]
            isOneToOne: false
            referencedRelation: "expense_categories"
            referencedColumns: ["id", "center_id"]
          },
          {
            foreignKeyName: "expenses_center_id_fkey"
            columns: ["center_id"]
            isOneToOne: false
            referencedRelation: "centers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expenses_deleted_by_fkey"
            columns: ["deleted_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expenses_recorded_by_fkey"
            columns: ["recorded_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expenses_recurrence_source_id_fkey"
            columns: ["recurrence_source_id"]
            isOneToOne: false
            referencedRelation: "expenses"
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
          is_demo: boolean
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
          is_demo?: boolean
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
          is_demo?: boolean
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
          amount_full: number
          amount_paid: number
          billing_run_id: string | null
          discount_amount: number
          discount_conflict: boolean
          discount_id: string | null
          discount_snapshot: Json | null
          due_date: string
          enrollment_id: string | null
          id: string
          is_demo: boolean
          overdue_from: string | null
          pack_enrollment_id: string | null
          paid_at: string | null
          paid_by: string | null
          payment_method: Database["public"]["Enums"]["payment_method"] | null
          period_end: string
          period_start: string
          receipt_id: string | null
          status: Database["public"]["Enums"]["invoice_status"]
          student_id: string
        }
        Insert: {
          amount_due: number
          amount_full: number
          amount_paid?: number
          billing_run_id?: string | null
          discount_amount?: number
          discount_conflict?: boolean
          discount_id?: string | null
          discount_snapshot?: Json | null
          due_date: string
          enrollment_id?: string | null
          id?: string
          is_demo?: boolean
          overdue_from?: string | null
          pack_enrollment_id?: string | null
          paid_at?: string | null
          paid_by?: string | null
          payment_method?: Database["public"]["Enums"]["payment_method"] | null
          period_end: string
          period_start: string
          receipt_id?: string | null
          status?: Database["public"]["Enums"]["invoice_status"]
          student_id: string
        }
        Update: {
          amount_due?: number
          amount_full?: number
          amount_paid?: number
          billing_run_id?: string | null
          discount_amount?: number
          discount_conflict?: boolean
          discount_id?: string | null
          discount_snapshot?: Json | null
          due_date?: string
          enrollment_id?: string | null
          id?: string
          is_demo?: boolean
          overdue_from?: string | null
          pack_enrollment_id?: string | null
          paid_at?: string | null
          paid_by?: string | null
          payment_method?: Database["public"]["Enums"]["payment_method"] | null
          period_end?: string
          period_start?: string
          receipt_id?: string | null
          status?: Database["public"]["Enums"]["invoice_status"]
          student_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "invoices_billing_run_id_fkey"
            columns: ["billing_run_id"]
            isOneToOne: false
            referencedRelation: "billing_runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_discount_id_fkey"
            columns: ["discount_id"]
            isOneToOne: false
            referencedRelation: "discount_overlaps"
            referencedColumns: ["discount_id"]
          },
          {
            foreignKeyName: "invoices_discount_id_fkey"
            columns: ["discount_id"]
            isOneToOne: false
            referencedRelation: "discount_overlaps"
            referencedColumns: ["other_discount_id"]
          },
          {
            foreignKeyName: "invoices_discount_id_fkey"
            columns: ["discount_id"]
            isOneToOne: false
            referencedRelation: "discounts"
            referencedColumns: ["id"]
          },
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
            foreignKeyName: "invoices_pack_enrollment_fkey"
            columns: ["pack_enrollment_id", "student_id"]
            isOneToOne: false
            referencedRelation: "pack_enrollments"
            referencedColumns: ["id", "student_id"]
          },
          {
            foreignKeyName: "invoices_paid_by_fkey"
            columns: ["paid_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_receipt_id_fkey"
            columns: ["receipt_id"]
            isOneToOne: false
            referencedRelation: "receipts"
            referencedColumns: ["id"]
          },
        ]
      }
      levels: {
        Row: {
          center_id: string
          id: string
          is_demo: boolean
          name: string
          sort_order: number
        }
        Insert: {
          center_id: string
          id?: string
          is_demo?: boolean
          name: string
          sort_order?: number
        }
        Update: {
          center_id?: string
          id?: string
          is_demo?: boolean
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
      pack_enrollments: {
        Row: {
          active: boolean
          billing_day: number | null
          created_at: string
          id: string
          is_demo: boolean
          pack_id: string
          price_agreed: number
          start_date: string
          student_id: string
        }
        Insert: {
          active?: boolean
          billing_day?: number | null
          created_at?: string
          id?: string
          is_demo?: boolean
          pack_id: string
          price_agreed: number
          start_date?: string
          student_id: string
        }
        Update: {
          active?: boolean
          billing_day?: number | null
          created_at?: string
          id?: string
          is_demo?: boolean
          pack_id?: string
          price_agreed?: number
          start_date?: string
          student_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "pack_enrollments_pack_id_fkey"
            columns: ["pack_id"]
            isOneToOne: false
            referencedRelation: "packs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pack_enrollments_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "follow_up_queue"
            referencedColumns: ["student_id"]
          },
          {
            foreignKeyName: "pack_enrollments_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "student_directory"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pack_enrollments_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      pack_subjects: {
        Row: {
          is_demo: boolean
          pack_id: string
          subject_id: string
        }
        Insert: {
          is_demo?: boolean
          pack_id: string
          subject_id: string
        }
        Update: {
          is_demo?: boolean
          pack_id?: string
          subject_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "pack_subjects_pack_id_fkey"
            columns: ["pack_id"]
            isOneToOne: false
            referencedRelation: "packs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pack_subjects_subject_id_fkey"
            columns: ["subject_id"]
            isOneToOne: false
            referencedRelation: "absences_to_notify"
            referencedColumns: ["subject_id"]
          },
          {
            foreignKeyName: "pack_subjects_subject_id_fkey"
            columns: ["subject_id"]
            isOneToOne: false
            referencedRelation: "subject_catalog"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pack_subjects_subject_id_fkey"
            columns: ["subject_id"]
            isOneToOne: false
            referencedRelation: "subjects"
            referencedColumns: ["id"]
          },
        ]
      }
      packs: {
        Row: {
          active: boolean
          center_id: string
          created_at: string
          id: string
          is_demo: boolean
          level_id: string
          monthly_price: number
          name: string
        }
        Insert: {
          active?: boolean
          center_id: string
          created_at?: string
          id?: string
          is_demo?: boolean
          level_id: string
          monthly_price: number
          name: string
        }
        Update: {
          active?: boolean
          center_id?: string
          created_at?: string
          id?: string
          is_demo?: boolean
          level_id?: string
          monthly_price?: number
          name?: string
        }
        Relationships: [
          {
            foreignKeyName: "packs_center_id_fkey"
            columns: ["center_id"]
            isOneToOne: false
            referencedRelation: "centers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "packs_level_id_center_id_fkey"
            columns: ["level_id", "center_id"]
            isOneToOne: false
            referencedRelation: "levels"
            referencedColumns: ["id", "center_id"]
          },
        ]
      }
      payment_reminders: {
        Row: {
          amount_reminded: number | null
          billing_run_id: string | null
          center_id: string
          channel: Database["public"]["Enums"]["notification_channel"]
          days_overdue: number | null
          guardian_phone_used: string | null
          id: string
          invoice_id: string
          is_demo: boolean
          is_repeat: boolean
          message_body: string | null
          message_id: string
          reminder_type: Database["public"]["Enums"]["payment_reminder_type"]
          sent_at: string
          sent_by: string | null
          status: Database["public"]["Enums"]["payment_reminder_status"]
          student_id: string
          template_used: string | null
        }
        Insert: {
          amount_reminded?: number | null
          billing_run_id?: string | null
          center_id: string
          channel: Database["public"]["Enums"]["notification_channel"]
          days_overdue?: number | null
          guardian_phone_used?: string | null
          id?: string
          invoice_id: string
          is_demo?: boolean
          is_repeat?: boolean
          message_body?: string | null
          message_id: string
          reminder_type: Database["public"]["Enums"]["payment_reminder_type"]
          sent_at?: string
          sent_by?: string | null
          status?: Database["public"]["Enums"]["payment_reminder_status"]
          student_id: string
          template_used?: string | null
        }
        Update: {
          amount_reminded?: number | null
          billing_run_id?: string | null
          center_id?: string
          channel?: Database["public"]["Enums"]["notification_channel"]
          days_overdue?: number | null
          guardian_phone_used?: string | null
          id?: string
          invoice_id?: string
          is_demo?: boolean
          is_repeat?: boolean
          message_body?: string | null
          message_id?: string
          reminder_type?: Database["public"]["Enums"]["payment_reminder_type"]
          sent_at?: string
          sent_by?: string | null
          status?: Database["public"]["Enums"]["payment_reminder_status"]
          student_id?: string
          template_used?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "payment_reminders_billing_run_id_center_id_fkey"
            columns: ["billing_run_id", "center_id"]
            isOneToOne: false
            referencedRelation: "billing_runs"
            referencedColumns: ["id", "center_id"]
          },
          {
            foreignKeyName: "payment_reminders_center_id_fkey"
            columns: ["center_id"]
            isOneToOne: false
            referencedRelation: "centers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_reminders_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "follow_up_queue"
            referencedColumns: ["oldest_invoice_id"]
          },
          {
            foreignKeyName: "payment_reminders_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_reminders_sent_by_center_id_fkey"
            columns: ["sent_by", "center_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id", "center_id"]
          },
          {
            foreignKeyName: "payment_reminders_student_id_center_id_fkey"
            columns: ["student_id", "center_id"]
            isOneToOne: false
            referencedRelation: "follow_up_queue"
            referencedColumns: ["student_id", "center_id"]
          },
          {
            foreignKeyName: "payment_reminders_student_id_center_id_fkey"
            columns: ["student_id", "center_id"]
            isOneToOne: false
            referencedRelation: "student_directory"
            referencedColumns: ["id", "center_id"]
          },
          {
            foreignKeyName: "payment_reminders_student_id_center_id_fkey"
            columns: ["student_id", "center_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id", "center_id"]
          },
        ]
      }
      payroll_lines: {
        Row: {
          adjustment_amount: number
          adjustment_reason: string | null
          center_id: string
          computed_amount: number
          detail: Json
          final_amount: number | null
          id: string
          is_demo: boolean
          paid_at: string | null
          paid_by: string | null
          pay_mode: Database["public"]["Enums"]["pay_mode"] | null
          payment_method: Database["public"]["Enums"]["payment_method"] | null
          payroll_period_id: string
          teacher_id: string
          teacher_name: string
          updated_at: string
        }
        Insert: {
          adjustment_amount?: number
          adjustment_reason?: string | null
          center_id: string
          computed_amount?: number
          detail?: Json
          final_amount?: number | null
          id?: string
          is_demo?: boolean
          paid_at?: string | null
          paid_by?: string | null
          pay_mode?: Database["public"]["Enums"]["pay_mode"] | null
          payment_method?: Database["public"]["Enums"]["payment_method"] | null
          payroll_period_id: string
          teacher_id: string
          teacher_name: string
          updated_at?: string
        }
        Update: {
          adjustment_amount?: number
          adjustment_reason?: string | null
          center_id?: string
          computed_amount?: number
          detail?: Json
          final_amount?: number | null
          id?: string
          is_demo?: boolean
          paid_at?: string | null
          paid_by?: string | null
          pay_mode?: Database["public"]["Enums"]["pay_mode"] | null
          payment_method?: Database["public"]["Enums"]["payment_method"] | null
          payroll_period_id?: string
          teacher_id?: string
          teacher_name?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "payroll_lines_paid_by_fkey"
            columns: ["paid_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payroll_lines_payroll_period_id_center_id_fkey"
            columns: ["payroll_period_id", "center_id"]
            isOneToOne: false
            referencedRelation: "payroll_periods"
            referencedColumns: ["id", "center_id"]
          },
          {
            foreignKeyName: "payroll_lines_teacher_id_fkey"
            columns: ["teacher_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      payroll_periods: {
        Row: {
          center_id: string
          created_at: string
          id: string
          is_demo: boolean
          month: number
          status: Database["public"]["Enums"]["payroll_status"]
          total_amount: number
          validated_at: string | null
          validated_by: string | null
          year: number
        }
        Insert: {
          center_id: string
          created_at?: string
          id?: string
          is_demo?: boolean
          month: number
          status?: Database["public"]["Enums"]["payroll_status"]
          total_amount?: number
          validated_at?: string | null
          validated_by?: string | null
          year: number
        }
        Update: {
          center_id?: string
          created_at?: string
          id?: string
          is_demo?: boolean
          month?: number
          status?: Database["public"]["Enums"]["payroll_status"]
          total_amount?: number
          validated_at?: string | null
          validated_by?: string | null
          year?: number
        }
        Relationships: [
          {
            foreignKeyName: "payroll_periods_center_id_fkey"
            columns: ["center_id"]
            isOneToOne: false
            referencedRelation: "centers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payroll_periods_validated_by_fkey"
            columns: ["validated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      platform_events: {
        Row: {
          action: string
          actor_id: string | null
          center_id: string | null
          id: number
          is_demo: boolean
          occurred_at: string
          payload: Json
        }
        Insert: {
          action: string
          actor_id?: string | null
          center_id?: string | null
          id?: never
          is_demo?: boolean
          occurred_at?: string
          payload?: Json
        }
        Update: {
          action?: string
          actor_id?: string | null
          center_id?: string | null
          id?: never
          is_demo?: boolean
          occurred_at?: string
          payload?: Json
        }
        Relationships: [
          {
            foreignKeyName: "platform_events_center_id_fkey"
            columns: ["center_id"]
            isOneToOne: false
            referencedRelation: "centers"
            referencedColumns: ["id"]
          },
        ]
      }
      platform_notifications: {
        Row: {
          center_id: string | null
          created_at: string
          id: number
          is_demo: boolean
          kind: string
          payload: Json
          recipient: string | null
          scheduled_for: string
          sent_at: string | null
        }
        Insert: {
          center_id?: string | null
          created_at?: string
          id?: never
          is_demo?: boolean
          kind: string
          payload?: Json
          recipient?: string | null
          scheduled_for: string
          sent_at?: string | null
        }
        Update: {
          center_id?: string | null
          created_at?: string
          id?: never
          is_demo?: boolean
          kind?: string
          payload?: Json
          recipient?: string | null
          scheduled_for?: string
          sent_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "platform_notifications_center_id_fkey"
            columns: ["center_id"]
            isOneToOne: false
            referencedRelation: "centers"
            referencedColumns: ["id"]
          },
        ]
      }
      platform_settings: {
        Row: {
          id: number
          is_demo: boolean
          support_email: string | null
          support_name: string | null
          support_phone: string | null
          updated_at: string
        }
        Insert: {
          id?: number
          is_demo?: boolean
          support_email?: string | null
          support_name?: string | null
          support_phone?: string | null
          updated_at?: string
        }
        Update: {
          id?: number
          is_demo?: boolean
          support_email?: string | null
          support_name?: string | null
          support_phone?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          active: boolean
          center_id: string | null
          created_at: string
          full_name: string
          id: string
          is_demo: boolean
          pay_mode: Database["public"]["Enums"]["pay_mode"] | null
          phone: string | null
          photo_url: string | null
          role: Database["public"]["Enums"]["user_role"]
        }
        Insert: {
          active?: boolean
          center_id?: string | null
          created_at?: string
          full_name: string
          id: string
          is_demo?: boolean
          pay_mode?: Database["public"]["Enums"]["pay_mode"] | null
          phone?: string | null
          photo_url?: string | null
          role: Database["public"]["Enums"]["user_role"]
        }
        Update: {
          active?: boolean
          center_id?: string | null
          created_at?: string
          full_name?: string
          id?: string
          is_demo?: boolean
          pay_mode?: Database["public"]["Enums"]["pay_mode"] | null
          phone?: string | null
          photo_url?: string | null
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
      receipt_counters: {
        Row: {
          center_id: string
          is_demo: boolean
          last_number: number
          year: number
        }
        Insert: {
          center_id: string
          is_demo?: boolean
          last_number: number
          year: number
        }
        Update: {
          center_id?: string
          is_demo?: boolean
          last_number?: number
          year?: number
        }
        Relationships: [
          {
            foreignKeyName: "receipt_counters_center_id_fkey"
            columns: ["center_id"]
            isOneToOne: false
            referencedRelation: "centers"
            referencedColumns: ["id"]
          },
        ]
      }
      receipts: {
        Row: {
          amount_full: number
          amount_paid: number
          balance_due: number
          cancel_reason: string | null
          cancels_receipt_id: string | null
          cash_session_id: string | null
          center_id: string
          center_snapshot: Json
          discount_applied: number
          id: string
          is_demo: boolean
          issued_at: string
          issued_by: string | null
          issued_by_name: string | null
          kind: Database["public"]["Enums"]["receipt_kind"]
          level_name: string | null
          payment_method: Database["public"]["Enums"]["payment_method"]
          pdf_url: string | null
          period_end: string
          period_start: string
          printed_at: string | null
          receipt_number: string | null
          receipt_seq: number
          receipt_year: number
          student_id: string | null
          student_name: string
          subjects_covered: Json
          whatsapp_sent_at: string | null
        }
        Insert: {
          amount_full: number
          amount_paid: number
          balance_due?: number
          cancel_reason?: string | null
          cancels_receipt_id?: string | null
          cash_session_id?: string | null
          center_id: string
          center_snapshot: Json
          discount_applied?: number
          id?: string
          is_demo?: boolean
          issued_at?: string
          issued_by?: string | null
          issued_by_name?: string | null
          kind?: Database["public"]["Enums"]["receipt_kind"]
          level_name?: string | null
          payment_method: Database["public"]["Enums"]["payment_method"]
          pdf_url?: string | null
          period_end: string
          period_start: string
          printed_at?: string | null
          receipt_number?: string | null
          receipt_seq: number
          receipt_year: number
          student_id?: string | null
          student_name: string
          subjects_covered: Json
          whatsapp_sent_at?: string | null
        }
        Update: {
          amount_full?: number
          amount_paid?: number
          balance_due?: number
          cancel_reason?: string | null
          cancels_receipt_id?: string | null
          cash_session_id?: string | null
          center_id?: string
          center_snapshot?: Json
          discount_applied?: number
          id?: string
          is_demo?: boolean
          issued_at?: string
          issued_by?: string | null
          issued_by_name?: string | null
          kind?: Database["public"]["Enums"]["receipt_kind"]
          level_name?: string | null
          payment_method?: Database["public"]["Enums"]["payment_method"]
          pdf_url?: string | null
          period_end?: string
          period_start?: string
          printed_at?: string | null
          receipt_number?: string | null
          receipt_seq?: number
          receipt_year?: number
          student_id?: string | null
          student_name?: string
          subjects_covered?: Json
          whatsapp_sent_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "receipts_cancels_receipt_id_fkey"
            columns: ["cancels_receipt_id"]
            isOneToOne: true
            referencedRelation: "receipts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "receipts_cash_session_fkey"
            columns: ["cash_session_id", "center_id"]
            isOneToOne: false
            referencedRelation: "cash_sessions"
            referencedColumns: ["id", "center_id"]
          },
          {
            foreignKeyName: "receipts_center_id_fkey"
            columns: ["center_id"]
            isOneToOne: false
            referencedRelation: "centers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "receipts_issued_by_fkey"
            columns: ["issued_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "receipts_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "follow_up_queue"
            referencedColumns: ["student_id"]
          },
          {
            foreignKeyName: "receipts_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "student_directory"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "receipts_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      reenrollment_intents: {
        Row: {
          applied_at: string | null
          billing_run_id: string
          center_id: string
          decided_at: string | null
          decided_by: string | null
          id: string
          intent: Database["public"]["Enums"]["reenrollment_intent"]
          is_demo: boolean
          period_month: number
          period_year: number
          reason: string | null
          student_id: string
          subjects_added: Json
          subjects_dropped: Json
          subjects_kept: Json
        }
        Insert: {
          applied_at?: string | null
          billing_run_id: string
          center_id: string
          decided_at?: string | null
          decided_by?: string | null
          id?: string
          intent?: Database["public"]["Enums"]["reenrollment_intent"]
          is_demo?: boolean
          period_month: number
          period_year: number
          reason?: string | null
          student_id: string
          subjects_added?: Json
          subjects_dropped?: Json
          subjects_kept?: Json
        }
        Update: {
          applied_at?: string | null
          billing_run_id?: string
          center_id?: string
          decided_at?: string | null
          decided_by?: string | null
          id?: string
          intent?: Database["public"]["Enums"]["reenrollment_intent"]
          is_demo?: boolean
          period_month?: number
          period_year?: number
          reason?: string | null
          student_id?: string
          subjects_added?: Json
          subjects_dropped?: Json
          subjects_kept?: Json
        }
        Relationships: [
          {
            foreignKeyName: "reenrollment_intents_billing_run_id_center_id_fkey"
            columns: ["billing_run_id", "center_id"]
            isOneToOne: false
            referencedRelation: "billing_runs"
            referencedColumns: ["id", "center_id"]
          },
          {
            foreignKeyName: "reenrollment_intents_decided_by_center_id_fkey"
            columns: ["decided_by", "center_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id", "center_id"]
          },
          {
            foreignKeyName: "reenrollment_intents_student_id_center_id_fkey"
            columns: ["student_id", "center_id"]
            isOneToOne: false
            referencedRelation: "follow_up_queue"
            referencedColumns: ["student_id", "center_id"]
          },
          {
            foreignKeyName: "reenrollment_intents_student_id_center_id_fkey"
            columns: ["student_id", "center_id"]
            isOneToOne: false
            referencedRelation: "student_directory"
            referencedColumns: ["id", "center_id"]
          },
          {
            foreignKeyName: "reenrollment_intents_student_id_center_id_fkey"
            columns: ["student_id", "center_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id", "center_id"]
          },
        ]
      }
      rooms: {
        Row: {
          capacity: number | null
          center_id: string
          created_at: string
          equipment: Json
          floor: string | null
          id: string
          is_active: boolean
          is_demo: boolean
          name: string
          notes: string | null
        }
        Insert: {
          capacity?: number | null
          center_id: string
          created_at?: string
          equipment?: Json
          floor?: string | null
          id?: string
          is_active?: boolean
          is_demo?: boolean
          name: string
          notes?: string | null
        }
        Update: {
          capacity?: number | null
          center_id?: string
          created_at?: string
          equipment?: Json
          floor?: string | null
          id?: string
          is_active?: boolean
          is_demo?: boolean
          name?: string
          notes?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "rooms_center_id_fkey"
            columns: ["center_id"]
            isOneToOne: false
            referencedRelation: "centers"
            referencedColumns: ["id"]
          },
        ]
      }
      schedule_conflicts_log: {
        Row: {
          attempted_slot: Json
          center_id: string
          conflict_type: Database["public"]["Enums"]["schedule_conflict_type"]
          conflicting_slot_id: string | null
          created_at: string
          created_by: string | null
          id: string
          is_demo: boolean
          resolved_how: string | null
        }
        Insert: {
          attempted_slot: Json
          center_id: string
          conflict_type: Database["public"]["Enums"]["schedule_conflict_type"]
          conflicting_slot_id?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          is_demo?: boolean
          resolved_how?: string | null
        }
        Update: {
          attempted_slot?: Json
          center_id?: string
          conflict_type?: Database["public"]["Enums"]["schedule_conflict_type"]
          conflicting_slot_id?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          is_demo?: boolean
          resolved_how?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "schedule_conflicts_log_center_id_fkey"
            columns: ["center_id"]
            isOneToOne: false
            referencedRelation: "centers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "schedule_conflicts_log_conflicting_slot_id_fkey"
            columns: ["conflicting_slot_id"]
            isOneToOne: false
            referencedRelation: "schedule_slots"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "schedule_conflicts_log_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
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
          is_demo: boolean
          level_id: string
          room: string
          room_id: string | null
          start_time: string
          subject_id: string
          teacher_id: string
        }
        Insert: {
          center_id: string
          day_of_week: number
          end_time: string
          id?: string
          is_demo?: boolean
          level_id: string
          room: string
          room_id?: string | null
          start_time: string
          subject_id: string
          teacher_id: string
        }
        Update: {
          center_id?: string
          day_of_week?: number
          end_time?: string
          id?: string
          is_demo?: boolean
          level_id?: string
          room?: string
          room_id?: string | null
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
            foreignKeyName: "schedule_slots_room_fkey"
            columns: ["room_id", "center_id"]
            isOneToOne: false
            referencedRelation: "rooms"
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
          is_demo: boolean
          level_id: string
          notes: string | null
          notes_updated_at: string | null
          notes_updated_by: string | null
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
          is_demo?: boolean
          level_id: string
          notes?: string | null
          notes_updated_at?: string | null
          notes_updated_by?: string | null
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
          is_demo?: boolean
          level_id?: string
          notes?: string | null
          notes_updated_at?: string | null
          notes_updated_by?: string | null
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
          {
            foreignKeyName: "students_notes_updated_by_fkey"
            columns: ["notes_updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      subjects: {
        Row: {
          center_id: string
          created_at: string
          id: string
          is_demo: boolean
          level_id: string
          monthly_price: number
          name: string
        }
        Insert: {
          center_id: string
          created_at?: string
          id?: string
          is_demo?: boolean
          level_id: string
          monthly_price: number
          name: string
        }
        Update: {
          center_id?: string
          created_at?: string
          id?: string
          is_demo?: boolean
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
      subscription_payments: {
        Row: {
          amount: number
          center_id: string
          created_at: string
          id: string
          is_demo: boolean
          method: Database["public"]["Enums"]["subscription_payment_method"]
          paid_at: string
          period_covered_end: string | null
          period_covered_start: string | null
          recorded_by: string | null
          reference: string | null
        }
        Insert: {
          amount: number
          center_id: string
          created_at?: string
          id?: string
          is_demo?: boolean
          method: Database["public"]["Enums"]["subscription_payment_method"]
          paid_at?: string
          period_covered_end?: string | null
          period_covered_start?: string | null
          recorded_by?: string | null
          reference?: string | null
        }
        Update: {
          amount?: number
          center_id?: string
          created_at?: string
          id?: string
          is_demo?: boolean
          method?: Database["public"]["Enums"]["subscription_payment_method"]
          paid_at?: string
          period_covered_end?: string | null
          period_covered_start?: string | null
          recorded_by?: string | null
          reference?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "subscription_payments_center_id_fkey"
            columns: ["center_id"]
            isOneToOne: false
            referencedRelation: "centers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "subscription_payments_recorded_by_fkey"
            columns: ["recorded_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      subscriptions: {
        Row: {
          amount: number
          auto_renew: boolean
          billing_interval: Database["public"]["Enums"]["billing_interval"]
          center_id: string
          created_at: string
          current_period_end: string | null
          current_period_start: string | null
          id: string
          is_demo: boolean
          plan: Database["public"]["Enums"]["subscription_plan"]
          started_at: string
          status: Database["public"]["Enums"]["center_status"]
        }
        Insert: {
          amount?: number
          auto_renew?: boolean
          billing_interval?: Database["public"]["Enums"]["billing_interval"]
          center_id: string
          created_at?: string
          current_period_end?: string | null
          current_period_start?: string | null
          id?: string
          is_demo?: boolean
          plan?: Database["public"]["Enums"]["subscription_plan"]
          started_at?: string
          status?: Database["public"]["Enums"]["center_status"]
        }
        Update: {
          amount?: number
          auto_renew?: boolean
          billing_interval?: Database["public"]["Enums"]["billing_interval"]
          center_id?: string
          created_at?: string
          current_period_end?: string | null
          current_period_start?: string | null
          id?: string
          is_demo?: boolean
          plan?: Database["public"]["Enums"]["subscription_plan"]
          started_at?: string
          status?: Database["public"]["Enums"]["center_status"]
        }
        Relationships: [
          {
            foreignKeyName: "subscriptions_center_id_fkey"
            columns: ["center_id"]
            isOneToOne: true
            referencedRelation: "centers"
            referencedColumns: ["id"]
          },
        ]
      }
      support_sessions: {
        Row: {
          actor_id: string
          center_id: string
          ended_at: string | null
          expires_at: string
          id: string
          is_demo: boolean
          reason: string
          started_at: string
        }
        Insert: {
          actor_id: string
          center_id: string
          ended_at?: string | null
          expires_at: string
          id?: string
          is_demo?: boolean
          reason: string
          started_at?: string
        }
        Update: {
          actor_id?: string
          center_id?: string
          ended_at?: string | null
          expires_at?: string
          id?: string
          is_demo?: boolean
          reason?: string
          started_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "support_sessions_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "support_sessions_center_id_fkey"
            columns: ["center_id"]
            isOneToOne: false
            referencedRelation: "centers"
            referencedColumns: ["id"]
          },
        ]
      }
      teacher_assignments: {
        Row: {
          id: string
          is_demo: boolean
          level_id: string
          subject_id: string
          teacher_id: string
        }
        Insert: {
          id?: string
          is_demo?: boolean
          level_id: string
          subject_id: string
          teacher_id: string
        }
        Update: {
          id?: string
          is_demo?: boolean
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
      teacher_commissions: {
        Row: {
          center_id: string
          created_at: string
          created_by: string | null
          effective_from: string
          effective_to: string | null
          id: string
          is_demo: boolean
          level_id: string
          rate_percent: number
          subject_id: string
          teacher_id: string
        }
        Insert: {
          center_id: string
          created_at?: string
          created_by?: string | null
          effective_from: string
          effective_to?: string | null
          id?: string
          is_demo?: boolean
          level_id: string
          rate_percent: number
          subject_id: string
          teacher_id: string
        }
        Update: {
          center_id?: string
          created_at?: string
          created_by?: string | null
          effective_from?: string
          effective_to?: string | null
          id?: string
          is_demo?: boolean
          level_id?: string
          rate_percent?: number
          subject_id?: string
          teacher_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "teacher_commissions_center_id_fkey"
            columns: ["center_id"]
            isOneToOne: false
            referencedRelation: "centers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "teacher_commissions_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "teacher_commissions_subject_id_level_id_fkey"
            columns: ["subject_id", "level_id"]
            isOneToOne: false
            referencedRelation: "subject_catalog"
            referencedColumns: ["id", "level_id"]
          },
          {
            foreignKeyName: "teacher_commissions_subject_id_level_id_fkey"
            columns: ["subject_id", "level_id"]
            isOneToOne: false
            referencedRelation: "subjects"
            referencedColumns: ["id", "level_id"]
          },
          {
            foreignKeyName: "teacher_commissions_teacher_id_center_id_fkey"
            columns: ["teacher_id", "center_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id", "center_id"]
          },
        ]
      }
      teacher_salaries: {
        Row: {
          center_id: string
          created_at: string
          created_by: string | null
          effective_from: string
          effective_to: string | null
          id: string
          is_demo: boolean
          monthly_amount: number
          teacher_id: string
        }
        Insert: {
          center_id: string
          created_at?: string
          created_by?: string | null
          effective_from: string
          effective_to?: string | null
          id?: string
          is_demo?: boolean
          monthly_amount: number
          teacher_id: string
        }
        Update: {
          center_id?: string
          created_at?: string
          created_by?: string | null
          effective_from?: string
          effective_to?: string | null
          id?: string
          is_demo?: boolean
          monthly_amount?: number
          teacher_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "teacher_salaries_center_id_fkey"
            columns: ["center_id"]
            isOneToOne: false
            referencedRelation: "centers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "teacher_salaries_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "teacher_salaries_teacher_id_center_id_fkey"
            columns: ["teacher_id", "center_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id", "center_id"]
          },
        ]
      }
    }
    Views: {
      absences_to_notify: {
        Row: {
          attendance_id: string | null
          center_id: string | null
          end_time: string | null
          full_name: string | null
          guardian_name: string | null
          guardian_phone: string | null
          in_series: boolean | null
          level_name: string | null
          notified_at: string | null
          notified_by: string | null
          notified_channel:
            | Database["public"]["Enums"]["notification_channel"]
            | null
          photo_url: string | null
          session_date: string | null
          start_time: string | null
          student_id: string | null
          subject_id: string | null
          subject_name: string | null
          teacher_name: string | null
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
            foreignKeyName: "students_center_id_fkey"
            columns: ["center_id"]
            isOneToOne: false
            referencedRelation: "centers"
            referencedColumns: ["id"]
          },
        ]
      }
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
            referencedRelation: "absences_to_notify"
            referencedColumns: ["subject_id"]
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
      discount_overlaps: {
        Row: {
          center_id: string | null
          discount_id: string | null
          other_discount_id: string | null
          student_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "discounts_center_id_fkey"
            columns: ["center_id"]
            isOneToOne: false
            referencedRelation: "centers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "discounts_student_id_center_id_fkey"
            columns: ["student_id", "center_id"]
            isOneToOne: false
            referencedRelation: "follow_up_queue"
            referencedColumns: ["student_id", "center_id"]
          },
          {
            foreignKeyName: "discounts_student_id_center_id_fkey"
            columns: ["student_id", "center_id"]
            isOneToOne: false
            referencedRelation: "student_directory"
            referencedColumns: ["id", "center_id"]
          },
          {
            foreignKeyName: "discounts_student_id_center_id_fkey"
            columns: ["student_id", "center_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id", "center_id"]
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
          discounts: Json | null
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
      admin_collection_overview: { Args: never; Returns: Json }
      admin_discount_summary: {
        Args: { p_month?: string }
        Returns: {
          amount: number
          reason: Database["public"]["Enums"]["discount_reason"]
          students: number
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
      admin_financial_summary: {
        Args: { p_months?: number }
        Returns: {
          collected: number
          discount_students: number
          discounts: number
          expected: number
          expenses: number
          month_start: string
          payroll: number
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
          photo_url: string
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
      admin_pack_report: {
        Args: never
        Returns: {
          active: boolean
          agreed_revenue: number
          level_id: string
          level_name: string
          level_sort: number
          monthly_price: number
          pack_id: string
          pack_name: string
          subscribers: number
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
      billing_run_review: {
        Args: { p_run_id: string }
        Returns: {
          amount_due: number
          amount_full: number
          applied_at: string
          at_risk: boolean
          attendance_count: number
          attendance_rate: number
          decided_at: string
          decided_by_name: string
          discount_amount: number
          full_name: string
          guardian_name: string
          guardian_phone: string
          intent: Database["public"]["Enums"]["reenrollment_intent"]
          level_name: string
          lines: Json
          low_attendance: boolean
          overdue_amount: number
          overdue_invoices: number
          photo_url: string
          reason: string
          student_id: string
        }[]
      }
      cancel_billing_run: {
        Args: { p_reason: string; p_run_id: string }
        Returns: undefined
      }
      cancel_receipt: {
        Args: { p_reason: string; p_receipt_id: string }
        Returns: {
          amount_full: number
          amount_paid: number
          balance_due: number
          cancel_reason: string | null
          cancels_receipt_id: string | null
          cash_session_id: string | null
          center_id: string
          center_snapshot: Json
          discount_applied: number
          id: string
          is_demo: boolean
          issued_at: string
          issued_by: string | null
          issued_by_name: string | null
          kind: Database["public"]["Enums"]["receipt_kind"]
          level_name: string | null
          payment_method: Database["public"]["Enums"]["payment_method"]
          pdf_url: string | null
          period_end: string
          period_start: string
          printed_at: string | null
          receipt_number: string | null
          receipt_seq: number
          receipt_year: number
          student_id: string | null
          student_name: string
          subjects_covered: Json
          whatsapp_sent_at: string | null
        }
        SetofOptions: {
          from: "*"
          to: "receipts"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      cash_month_overview: { Args: { p_month?: string }; Returns: Json }
      cash_session_history: {
        Args: { p_from: string; p_to: string }
        Returns: {
          cash_collected: number
          closed_at: string
          closed_by_name: string
          corrections: number
          counted_cash: number
          expected_cash: number
          holder_name: string
          id: string
          is_shared: boolean
          opened_at: string
          opened_by_name: string
          session_date: string
          status: Database["public"]["Enums"]["cash_session_status"]
          total_collected: number
          transactions: number
          validated_by_name: string
          variance: number
          variance_reason: string
        }[]
      }
      cash_session_summary: { Args: { p_session_id: string }; Returns: Json }
      center_branding_settings: {
        Args: { p_center_id: string }
        Returns: {
          accent_color: string
          brand_name: string
          custom_domain: string
          domain_verified: boolean
          editable: boolean
          email_sender_name: string
          favicon_url: string
          login_background_url: string
          logo_url: string
          plan: Database["public"]["Enums"]["subscription_plan"]
          primary_color: string
          secondary_color: string
          support_email: string
          support_phone: string
        }[]
      }
      center_for_host: {
        Args: { p_domain?: string; p_slug?: string }
        Returns: {
          branding: Json
          center_id: string
          name: string
          slug: string
          white_label: boolean
        }[]
      }
      close_cash_session: {
        Args: {
          p_counted: number
          p_expected?: number
          p_notes?: string
          p_reason?: string
          p_session_id: string
        }
        Returns: Json
      }
      confirm_billing_run: { Args: { p_run_id: string }; Returns: Json }
      create_student: {
        Args: {
          p_billing_day?: number
          p_full_name: string
          p_guardian_name?: string
          p_guardian_phone?: string
          p_level_id: string
          p_notes?: string
          p_pack_id?: string
          p_photo_path?: string
          p_student_id: string
          p_subject_ids: string[]
        }
        Returns: string
      }
      custom_access_token_hook: { Args: { event: Json }; Returns: Json }
      delete_expense: { Args: { p_expense_id: string }; Returns: undefined }
      mark_invoice_paid: {
        Args: { p_invoice_id: string }
        Returns: {
          amount_due: number
          amount_full: number
          amount_paid: number
          billing_run_id: string | null
          discount_amount: number
          discount_conflict: boolean
          discount_id: string | null
          discount_snapshot: Json | null
          due_date: string
          enrollment_id: string | null
          id: string
          is_demo: boolean
          overdue_from: string | null
          pack_enrollment_id: string | null
          paid_at: string | null
          paid_by: string | null
          payment_method: Database["public"]["Enums"]["payment_method"] | null
          period_end: string
          period_start: string
          receipt_id: string | null
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
      mark_receipt_printed: {
        Args: { p_receipt_id: string }
        Returns: undefined
      }
      my_center_access: {
        Args: never
        Returns: {
          blocked: boolean
          branding: Json
          center_id: string
          center_name: string
          contact_email: string
          contact_name: string
          contact_phone: string
          current_period_end: string
          days_before_suspension: number
          plan: Database["public"]["Enums"]["subscription_plan"]
          status: Database["public"]["Enums"]["center_status"]
          support_expires_at: string
          support_mode: boolean
          suspension_date: string
          vocabulary: Json
        }[]
      }
      open_cash_session: { Args: { p_opening_float?: number }; Returns: string }
      payment_reminder_queue: {
        Args: { p_run_id?: string; p_student_id?: string }
        Returns: {
          amount_due: number
          billing_run_id: string
          days_overdue: number
          due_date: string
          followed_up_at: string
          full_name: string
          guardian_name: string
          guardian_phone: string
          invoice_ids: string[]
          last_channel: Database["public"]["Enums"]["notification_channel"]
          last_sent_at: string
          last_sent_by_name: string
          level_name: string
          pack_flags: boolean[]
          period_month: number
          period_year: number
          photo_url: string
          reminder_type: Database["public"]["Enums"]["payment_reminder_type"]
          student_id: string
          subject_names: string[]
          suggested: boolean
        }[]
      }
      payroll_mark_paid: {
        Args: {
          p_line_id: string
          p_method: Database["public"]["Enums"]["payment_method"]
          p_paid_at: string
        }
        Returns: {
          adjustment_amount: number
          adjustment_reason: string | null
          center_id: string
          computed_amount: number
          detail: Json
          final_amount: number | null
          id: string
          is_demo: boolean
          paid_at: string | null
          paid_by: string | null
          pay_mode: Database["public"]["Enums"]["pay_mode"] | null
          payment_method: Database["public"]["Enums"]["payment_method"] | null
          payroll_period_id: string
          teacher_id: string
          teacher_name: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "payroll_lines"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      payroll_refresh: {
        Args: { p_month: number; p_year: number }
        Returns: {
          center_id: string
          created_at: string
          id: string
          is_demo: boolean
          month: number
          status: Database["public"]["Enums"]["payroll_status"]
          total_amount: number
          validated_at: string | null
          validated_by: string | null
          year: number
        }
        SetofOptions: {
          from: "*"
          to: "payroll_periods"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      payroll_set_adjustment: {
        Args: { p_amount: number; p_line_id: string; p_reason: string }
        Returns: {
          adjustment_amount: number
          adjustment_reason: string | null
          center_id: string
          computed_amount: number
          detail: Json
          final_amount: number | null
          id: string
          is_demo: boolean
          paid_at: string | null
          paid_by: string | null
          pay_mode: Database["public"]["Enums"]["pay_mode"] | null
          payment_method: Database["public"]["Enums"]["payment_method"] | null
          payroll_period_id: string
          teacher_id: string
          teacher_name: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "payroll_lines"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      payroll_unlock: {
        Args: { p_period_id: string; p_reason: string }
        Returns: {
          center_id: string
          created_at: string
          id: string
          is_demo: boolean
          month: number
          status: Database["public"]["Enums"]["payroll_status"]
          total_amount: number
          validated_at: string | null
          validated_by: string | null
          year: number
        }
        SetofOptions: {
          from: "*"
          to: "payroll_periods"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      payroll_validate: {
        Args: { p_period_id: string }
        Returns: {
          center_id: string
          created_at: string
          id: string
          is_demo: boolean
          month: number
          status: Database["public"]["Enums"]["payroll_status"]
          total_amount: number
          validated_at: string | null
          validated_by: string | null
          year: number
        }
        SetofOptions: {
          from: "*"
          to: "payroll_periods"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      platform_billing_months: {
        Args: never
        Returns: {
          collected: number
          expected: number
          month: string
        }[]
      }
      platform_center: {
        Args: { p_center_id: string }
        Returns: {
          activated_at: string
          auto_renew: boolean
          billing_interval: Database["public"]["Enums"]["billing_interval"]
          branding: Json
          cancelled_at: string
          center_id: string
          center_type: string
          center_type_label: string
          created_at: string
          current_period_end: string
          current_period_start: string
          custom_terms: Json
          days_remaining: number
          grace_days: number
          name: string
          notes: string
          owner_contact_email: string
          owner_contact_name: string
          owner_contact_phone: string
          plan: Database["public"]["Enums"]["subscription_plan"]
          price: number
          slug: string
          status: Database["public"]["Enums"]["center_status"]
          students_count: number
          subscription_started_at: string
          users_count: number
        }[]
      }
      platform_center_events: {
        Args: { p_center_id: string }
        Returns: {
          action: string
          actor_name: string
          event_id: number
          occurred_at: string
          payload: Json
        }[]
      }
      platform_center_users: {
        Args: { p_center_id: string }
        Returns: {
          active: boolean
          confirmed: boolean
          created_at: string
          email: string
          full_name: string
          last_sign_in_at: string
          role: Database["public"]["Enums"]["user_role"]
          user_id: string
        }[]
      }
      platform_centers: {
        Args: never
        Returns: {
          activated_at: string
          billing_interval: Database["public"]["Enums"]["billing_interval"]
          center_id: string
          center_type: string
          center_type_label: string
          created_at: string
          current_period_end: string
          days_remaining: number
          name: string
          plan: Database["public"]["Enums"]["subscription_plan"]
          price: number
          slug: string
          status: Database["public"]["Enums"]["center_status"]
          students_count: number
        }[]
      }
      platform_create_center: {
        Args: {
          p_activation_date: string
          p_admin_full_name: string
          p_admin_phone: string
          p_admin_user_id: string
          p_billing_interval: Database["public"]["Enums"]["billing_interval"]
          p_center_type: string
          p_custom_terms: Json
          p_first_period_end: string
          p_grace_days: number
          p_name: string
          p_notes: string
          p_owner_contact_email: string
          p_owner_contact_name: string
          p_owner_contact_phone: string
          p_plan: Database["public"]["Enums"]["subscription_plan"]
          p_price: number
          p_slug: string
          p_status: Database["public"]["Enums"]["center_status"]
        }
        Returns: string
      }
      platform_end_support: { Args: never; Returns: undefined }
      platform_log_invitation: {
        Args: {
          p_center_id: string
          p_password_link?: boolean
          p_user_id: string
        }
        Returns: undefined
      }
      platform_overdue_centers: {
        Args: never
        Returns: {
          amount_due: number
          billing_interval: Database["public"]["Enums"]["billing_interval"]
          center_id: string
          current_period_end: string
          days_overdue: number
          name: string
          owner_contact_email: string
          owner_contact_name: string
          owner_contact_phone: string
          status: Database["public"]["Enums"]["center_status"]
        }[]
      }
      platform_overview: {
        Args: never
        Returns: {
          active_count: number
          cancelled_count: number
          collected_this_month: number
          monthly_recurring_revenue: number
          past_due_count: number
          students_count: number
          suspended_count: number
          trial_count: number
          users_count: number
        }[]
      }
      platform_payments: {
        Args: { p_center_id?: string }
        Returns: {
          amount: number
          center_id: string
          center_name: string
          method: Database["public"]["Enums"]["subscription_payment_method"]
          paid_at: string
          payment_id: string
          period_covered_end: string
          period_covered_start: string
          recorded_by_name: string
          reference: string
        }[]
      }
      platform_record_payment: {
        Args: {
          p_amount: number
          p_center_id: string
          p_method: Database["public"]["Enums"]["subscription_payment_method"]
          p_paid_at: string
          p_reference?: string
        }
        Returns: string
      }
      platform_set_domain_verified: {
        Args: { p_center_id: string; p_verified: boolean }
        Returns: undefined
      }
      platform_set_due_date: {
        Args: { p_center_id: string; p_due_date: string; p_reason?: string }
        Returns: undefined
      }
      platform_set_pricing: {
        Args: {
          p_billing_interval: Database["public"]["Enums"]["billing_interval"]
          p_center_id: string
          p_grace_days: number
          p_plan: Database["public"]["Enums"]["subscription_plan"]
          p_price: number
        }
        Returns: undefined
      }
      platform_set_status: {
        Args: {
          p_center_id: string
          p_reason: string
          p_status: Database["public"]["Enums"]["center_status"]
        }
        Returns: undefined
      }
      platform_settings_get: {
        Args: never
        Returns: {
          support_email: string
          support_name: string
          support_phone: string
          updated_at: string
        }[]
      }
      platform_start_support: {
        Args: { p_center_id: string; p_reason: string }
        Returns: string
      }
      platform_upcoming_due: {
        Args: never
        Returns: {
          billing_interval: Database["public"]["Enums"]["billing_interval"]
          center_id: string
          current_period_end: string
          days_remaining: number
          name: string
          owner_contact_email: string
          owner_contact_phone: string
          price: number
          status: Database["public"]["Enums"]["center_status"]
        }[]
      }
      platform_upcoming_notifications: {
        Args: { p_from?: string }
        Returns: {
          center_id: string
          center_name: string
          kind: string
          notification_id: number
          recipient: string
          scheduled_for: string
          sent_at: string
        }[]
      }
      platform_update_center: {
        Args: {
          p_center_id: string
          p_center_type: string
          p_custom_terms: Json
          p_name: string
          p_notes: string
          p_owner_contact_email: string
          p_owner_contact_name: string
          p_owner_contact_phone: string
          p_slug: string
        }
        Returns: undefined
      }
      platform_update_settings: {
        Args: {
          p_support_email: string
          p_support_name: string
          p_support_phone: string
        }
        Returns: undefined
      }
      prepare_billing_run: { Args: never; Returns: string }
      record_cash_correction: {
        Args: { p_amount: number; p_reason: string; p_session_id: string }
        Returns: string
      }
      record_cash_movement: {
        Args: {
          p_amount: number
          p_kind: Database["public"]["Enums"]["cash_movement_kind"]
          p_reason: string
        }
        Returns: string
      }
      record_payment: {
        Args: {
          p_invoice_ids: string[]
          p_method: Database["public"]["Enums"]["payment_method"]
          p_student_id: string
        }
        Returns: {
          amount_full: number
          amount_paid: number
          balance_due: number
          cancel_reason: string | null
          cancels_receipt_id: string | null
          cash_session_id: string | null
          center_id: string
          center_snapshot: Json
          discount_applied: number
          id: string
          is_demo: boolean
          issued_at: string
          issued_by: string | null
          issued_by_name: string | null
          kind: Database["public"]["Enums"]["receipt_kind"]
          level_name: string | null
          payment_method: Database["public"]["Enums"]["payment_method"]
          pdf_url: string | null
          period_end: string
          period_start: string
          printed_at: string | null
          receipt_number: string | null
          receipt_seq: number
          receipt_year: number
          student_id: string | null
          student_name: string
          subjects_covered: Json
          whatsapp_sent_at: string | null
        }
        SetofOptions: {
          from: "*"
          to: "receipts"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      record_payment_reminder: {
        Args: {
          p_channel: Database["public"]["Enums"]["notification_channel"]
          p_due_date: string
          p_is_repeat?: boolean
          p_message?: string
          p_phone?: string
          p_run_id: string
          p_student_id: string
          p_template?: string
        }
        Returns: string
      }
      reenrollment_overview: { Args: never; Returns: Json }
      set_attendance_note: {
        Args: { p_attendance_id: string; p_note: string }
        Returns: undefined
      }
      set_my_photo: { Args: { p_path?: string }; Returns: undefined }
      set_reenrollment_intent: {
        Args: {
          p_dropped_sources?: string[]
          p_intent: Database["public"]["Enums"]["reenrollment_intent"]
          p_reason?: string
          p_run_id: string
          p_student_id: string
        }
        Returns: undefined
      }
      set_teacher_commission: {
        Args: {
          p_effective_from: string
          p_rate_percent: number
          p_subject_id: string
          p_teacher_id: string
        }
        Returns: {
          center_id: string
          created_at: string
          created_by: string | null
          effective_from: string
          effective_to: string | null
          id: string
          is_demo: boolean
          level_id: string
          rate_percent: number
          subject_id: string
          teacher_id: string
        }
        SetofOptions: {
          from: "*"
          to: "teacher_commissions"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      set_teacher_pay: {
        Args: {
          p_effective_from: string
          p_monthly_amount?: number
          p_pay_mode: Database["public"]["Enums"]["pay_mode"]
          p_rates?: Json
          p_teacher_id: string
        }
        Returns: undefined
      }
      set_teacher_salary: {
        Args: {
          p_effective_from: string
          p_monthly_amount: number
          p_teacher_id: string
        }
        Returns: {
          center_id: string
          created_at: string
          created_by: string | null
          effective_from: string
          effective_to: string | null
          id: string
          is_demo: boolean
          monthly_amount: number
          teacher_id: string
        }
        SetofOptions: {
          from: "*"
          to: "teacher_salaries"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      slot_conflicts: {
        Args: {
          p_day_of_week: number
          p_end_time: string
          p_level_id: string
          p_room_id: string
          p_slot_id?: string
          p_start_time: string
          p_teacher_id: string
        }
        Returns: {
          conflict_type: Database["public"]["Enums"]["schedule_conflict_type"]
          day_of_week: number
          end_time: string
          enrolled: number
          level_name: string
          room_name: string
          slot_id: string
          start_time: string
          subject_name: string
          teacher_name: string
        }[]
      }
      stale_cash_sessions: {
        Args: never
        Returns: {
          holder_name: string
          id: string
          is_shared: boolean
          opened_by_name: string
          session_date: string
        }[]
      }
      student_absence_follow_ups: {
        Args: { p_student_id: string }
        Returns: {
          author_name: string
          channel: Database["public"]["Enums"]["follow_up_channel"]
          created_at: string
          follow_up_id: string
          note: string
        }[]
      }
      student_attendance: {
        Args: { p_student_id: string }
        Returns: {
          attendance_id: string
          end_time: string
          level_name: string
          note: string
          session_date: string
          start_time: string
          status: Database["public"]["Enums"]["attendance_status"]
          subject_id: string
          subject_name: string
          teacher_name: string
        }[]
      }
      update_center_branding: {
        Args: {
          p_accent_color: string
          p_brand_name: string
          p_center_id: string
          p_custom_domain?: string
          p_email_sender_name: string
          p_favicon_url: string
          p_login_background_url: string
          p_logo_url: string
          p_primary_color: string
          p_secondary_color: string
          p_support_email: string
          p_support_phone: string
        }
        Returns: undefined
      }
      validate_cash_session: {
        Args: { p_notes?: string; p_session_id: string }
        Returns: undefined
      }
    }
    Enums: {
      absence_notification_status: "prepared" | "sent" | "failed" | "no_phone"
      alert_type: "consecutive_absences" | "overdue_payment"
      attendance_status: "present" | "absent"
      billing_interval: "month" | "year"
      billing_run_status:
        | "draft"
        | "confirmed"
        | "sent"
        | "closed"
        | "cancelled"
      cash_movement_kind:
        | "refund"
        | "expense"
        | "teacher_pay"
        | "bank_deposit"
        | "float_change"
        | "correction"
      cash_session_status: "open" | "closed" | "validated"
      center_status: "trial" | "active" | "past_due" | "suspended" | "cancelled"
      discount_reason: "sibling" | "social" | "merit" | "referral" | "other"
      discount_scope: "all_subjects" | "specific_subject"
      discount_type: "percentage" | "fixed_amount"
      expense_status: "draft" | "confirmed"
      follow_up_channel: "phone" | "whatsapp" | "in_person"
      follow_up_type: "payment" | "absence"
      invoice_status: "pending" | "paid" | "overdue"
      notification_channel: "whatsapp" | "phone_call" | "in_person"
      pay_mode: "fixed_salary" | "commission"
      payment_method: "cash" | "bank_transfer" | "card" | "cheque"
      payment_reminder_status: "prepared" | "sent" | "failed" | "no_phone"
      payment_reminder_type: "upcoming" | "due_today" | "overdue"
      payroll_status: "draft" | "validated" | "paid"
      receipt_format: "a5" | "ticket_80mm"
      receipt_kind: "payment" | "cancellation"
      reenrollment_intent: "pending" | "confirmed" | "dropped" | "paused"
      schedule_conflict_type: "room" | "teacher" | "level"
      subscription_payment_method: "bank_transfer" | "cash" | "card"
      subscription_plan: "standard" | "white_label"
      user_role: "admin" | "assistant" | "teacher" | "super_admin"
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
      absence_notification_status: ["prepared", "sent", "failed", "no_phone"],
      alert_type: ["consecutive_absences", "overdue_payment"],
      attendance_status: ["present", "absent"],
      billing_interval: ["month", "year"],
      billing_run_status: ["draft", "confirmed", "sent", "closed", "cancelled"],
      cash_movement_kind: [
        "refund",
        "expense",
        "teacher_pay",
        "bank_deposit",
        "float_change",
        "correction",
      ],
      cash_session_status: ["open", "closed", "validated"],
      center_status: ["trial", "active", "past_due", "suspended", "cancelled"],
      discount_reason: ["sibling", "social", "merit", "referral", "other"],
      discount_scope: ["all_subjects", "specific_subject"],
      discount_type: ["percentage", "fixed_amount"],
      expense_status: ["draft", "confirmed"],
      follow_up_channel: ["phone", "whatsapp", "in_person"],
      follow_up_type: ["payment", "absence"],
      invoice_status: ["pending", "paid", "overdue"],
      notification_channel: ["whatsapp", "phone_call", "in_person"],
      pay_mode: ["fixed_salary", "commission"],
      payment_method: ["cash", "bank_transfer", "card", "cheque"],
      payment_reminder_status: ["prepared", "sent", "failed", "no_phone"],
      payment_reminder_type: ["upcoming", "due_today", "overdue"],
      payroll_status: ["draft", "validated", "paid"],
      receipt_format: ["a5", "ticket_80mm"],
      receipt_kind: ["payment", "cancellation"],
      reenrollment_intent: ["pending", "confirmed", "dropped", "paused"],
      schedule_conflict_type: ["room", "teacher", "level"],
      subscription_payment_method: ["bank_transfer", "cash", "card"],
      subscription_plan: ["standard", "white_label"],
      user_role: ["admin", "assistant", "teacher", "super_admin"],
    },
  },
} as const

