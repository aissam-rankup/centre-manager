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
      center_branding: {
        Row: {
          accent_color: string | null
          brand_name: string | null
          center_id: string
          custom_domain: string | null
          domain_verified: boolean
          email_sender_name: string | null
          favicon_url: string | null
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
      center_types: {
        Row: {
          code: string
          is_custom: boolean
          label: string
          sort_order: number
          terms: Json
        }
        Insert: {
          code: string
          is_custom?: boolean
          label: string
          sort_order?: number
          terms: Json
        }
        Update: {
          code?: string
          is_custom?: boolean
          label?: string
          sort_order?: number
          terms?: Json
        }
        Relationships: []
      }
      centers: {
        Row: {
          activated_at: string | null
          billing_interval: Database["public"]["Enums"]["billing_interval"]
          cancelled_at: string | null
          center_type: string
          created_at: string
          current_period_end: string | null
          custom_terms: Json
          grace_days: number
          id: string
          name: string
          notes: string | null
          owner_contact_email: string | null
          owner_contact_name: string | null
          owner_contact_phone: string | null
          price: number | null
          slug: string
          status: Database["public"]["Enums"]["center_status"]
        }
        Insert: {
          activated_at?: string | null
          billing_interval?: Database["public"]["Enums"]["billing_interval"]
          cancelled_at?: string | null
          center_type?: string
          created_at?: string
          current_period_end?: string | null
          custom_terms?: Json
          grace_days?: number
          id?: string
          name: string
          notes?: string | null
          owner_contact_email?: string | null
          owner_contact_name?: string | null
          owner_contact_phone?: string | null
          price?: number | null
          slug: string
          status?: Database["public"]["Enums"]["center_status"]
        }
        Update: {
          activated_at?: string | null
          billing_interval?: Database["public"]["Enums"]["billing_interval"]
          cancelled_at?: string | null
          center_type?: string
          created_at?: string
          current_period_end?: string | null
          custom_terms?: Json
          grace_days?: number
          id?: string
          name?: string
          notes?: string | null
          owner_contact_email?: string | null
          owner_contact_name?: string | null
          owner_contact_phone?: string | null
          price?: number | null
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
      enrollments: {
        Row: {
          active: boolean
          billing_day: number | null
          id: string
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
          enrollment_id: string | null
          id: string
          pack_enrollment_id: string | null
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
          enrollment_id?: string | null
          id?: string
          pack_enrollment_id?: string | null
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
          enrollment_id?: string | null
          id?: string
          pack_enrollment_id?: string | null
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
      pack_enrollments: {
        Row: {
          active: boolean
          billing_day: number | null
          created_at: string
          id: string
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
          pack_id: string
          subject_id: string
        }
        Insert: {
          pack_id: string
          subject_id: string
        }
        Update: {
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
          level_id: string
          monthly_price: number
          name: string
        }
        Insert: {
          active?: boolean
          center_id: string
          created_at?: string
          id?: string
          level_id: string
          monthly_price: number
          name: string
        }
        Update: {
          active?: boolean
          center_id?: string
          created_at?: string
          id?: string
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
      platform_events: {
        Row: {
          action: string
          actor_id: string | null
          center_id: string | null
          id: number
          occurred_at: string
          payload: Json
        }
        Insert: {
          action: string
          actor_id?: string | null
          center_id?: string | null
          id?: never
          occurred_at?: string
          payload?: Json
        }
        Update: {
          action?: string
          actor_id?: string | null
          center_id?: string | null
          id?: never
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
          support_email: string | null
          support_name: string | null
          support_phone: string | null
          updated_at: string
        }
        Insert: {
          id?: number
          support_email?: string | null
          support_name?: string | null
          support_phone?: string | null
          updated_at?: string
        }
        Update: {
          id?: number
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
      subscription_payments: {
        Row: {
          amount: number
          center_id: string
          created_at: string
          id: string
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
          reason: string
          started_at: string
        }
        Insert: {
          actor_id: string
          center_id: string
          ended_at?: string | null
          expires_at: string
          id?: string
          reason: string
          started_at?: string
        }
        Update: {
          actor_id?: string
          center_id?: string
          ended_at?: string | null
          expires_at?: string
          id?: string
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
      mark_invoice_paid: {
        Args: { p_invoice_id: string }
        Returns: {
          amount_due: number
          amount_paid: number
          due_date: string
          enrollment_id: string | null
          id: string
          pack_enrollment_id: string | null
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
      my_center_access: {
        Args: never
        Returns: {
          blocked: boolean
          center_id: string
          center_name: string
          contact_email: string
          contact_name: string
          contact_phone: string
          current_period_end: string
          days_before_suspension: number
          status: Database["public"]["Enums"]["center_status"]
          support_expires_at: string
          support_mode: boolean
          suspension_date: string
          vocabulary: Json
        }[]
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
      set_my_photo: { Args: { p_path?: string }; Returns: undefined }
    }
    Enums: {
      alert_type: "consecutive_absences" | "overdue_payment"
      attendance_status: "present" | "absent"
      billing_interval: "month" | "year"
      center_status: "trial" | "active" | "past_due" | "suspended" | "cancelled"
      follow_up_channel: "phone" | "whatsapp" | "in_person"
      follow_up_type: "payment" | "absence"
      invoice_status: "pending" | "paid" | "overdue"
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
      alert_type: ["consecutive_absences", "overdue_payment"],
      attendance_status: ["present", "absent"],
      billing_interval: ["month", "year"],
      center_status: ["trial", "active", "past_due", "suspended", "cancelled"],
      follow_up_channel: ["phone", "whatsapp", "in_person"],
      follow_up_type: ["payment", "absence"],
      invoice_status: ["pending", "paid", "overdue"],
      subscription_payment_method: ["bank_transfer", "cash", "card"],
      subscription_plan: ["standard", "white_label"],
      user_role: ["admin", "assistant", "teacher", "super_admin"],
    },
  },
} as const

