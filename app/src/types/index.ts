export interface AuthResponse {
  user_id: string;
  family_id: string;
  family_code: string;
  role: 'mom' | 'caregiver';
  token: string;
}

export interface Child {
  id: string;
  name: string;
  grade: number;
  school: string | null;
}

export interface Contact {
  id: string;
  name: string;
  role: 'teacher' | 'caregiver' | 'shuttle' | 'admin';
  phone: string | null;
  channel: 'kakao' | 'sms' | 'hiclass' | 'phone';
  linked_child_ids: string[] | null;
  organization: string | null;
}

export interface ScheduleBlock {
  id: string;
  activity_name: string;
  activity_type: string;
  day_of_week: number;
  start_time: string;
  end_time: string;
  guardian_contact_id: string | null;
  guardian_name: string | null;
  block_type: 'activity' | 'transition';
  notes: string | null;
}

export interface GapInfo {
  day_of_week: number;
  start_time: string;
  end_time: string;
  before_activity: string | null;
  after_activity: string | null;
}

export interface DraftMessage {
  contact_id: string;
  contact_name: string;
  channel: string;
  draft_text: string;
  app_package: string | null;
}

export interface ChatResponse {
  response: string;
  action_type: string | null;
  draft_messages: DraftMessage[] | null;
  schedule_changes: any | null;
  gaps_detected: GapInfo[] | null;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
  action_type?: string;
  draft_messages?: DraftMessage[];
  gaps_detected?: GapInfo[];
}

export interface TimelineItem {
  block_id: string;
  activity_name: string;
  block_type: string;
  start_time: string;
  end_time: string;
  guardian_name: string | null;
  status: 'completed' | 'current' | 'upcoming' | 'missed';
  checkin_events: { type: string; time: string; message: string }[];
}
