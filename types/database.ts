export interface Club {
  id: string;
  user_id: string;
  short_name: string;
  full_name: string;
  logo_url: string | null;
  slug: string;
  created_at: string;
}

export type ClubMemberRole = 'owner' | 'editor' | 'viewer';

export interface ClubMember {
  id: string;
  club_id: string;
  user_id: string;
  role: ClubMemberRole;
  created_at: string;
}

export interface ClubMemberWithEmail extends ClubMember {
  email: string;
}

export interface ClubWithMembership extends Club {
  membership?: { role: ClubMemberRole };
}

export interface RecordList {
  id: string;
  club_id: string;
  title: string;
  slug: string;
  course_type: "SCM" | "SCY" | "LCM";
  created_at: string;
}

export interface SwimRecord {
  id: string;
  record_list_id: string;
  event_name: string;
  time_ms: number;
  swimmer_name: string;
  record_date: string | null;
  location: string | null;
  sort_order: number;
  is_national: boolean;
  is_current_national: boolean;
  is_provincial: boolean;
  is_current_provincial: boolean;
  is_split: boolean;
  is_relay_split: boolean;
  is_new: boolean;
  is_world_record: boolean;
  superseded_by: string | null;  // ID of the record that broke this one
  is_current: boolean;           // false if this record has been broken
  created_at: string;
}

export interface RecordWithHistory {
  current: SwimRecord;
  history: SwimRecord[];  // Previous records that were broken, ordered by record_date desc
}

export interface StandardEvent {
  id: number;
  name: string;
  sort_order: number;
}

export interface Database {
  public: {
    Tables: {
      clubs: {
        Row: Club;
        Insert: Omit<Club, "id" | "created_at">;
        Update: Partial<Omit<Club, "id" | "created_at">>;
      };
      club_members: {
        Row: ClubMember;
        Insert: Omit<ClubMember, "id" | "created_at">;
        Update: Partial<Omit<ClubMember, "id" | "created_at">>;
      };
      record_lists: {
        Row: RecordList;
        Insert: Omit<RecordList, "id" | "created_at">;
        Update: Partial<Omit<RecordList, "id" | "created_at">>;
      };
      records: {
        Row: SwimRecord;
        Insert: Omit<SwimRecord, "id" | "created_at">;
        Update: Partial<Omit<SwimRecord, "id" | "created_at">>;
      };
      standard_events: {
        Row: StandardEvent;
        Insert: Omit<StandardEvent, "id">;
        Update: Partial<Omit<StandardEvent, "id">>;
      };
    };
  };
}
