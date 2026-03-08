import axios from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { AuthResponse, Child, Contact, ScheduleBlock, GapInfo, ChatResponse } from '../types';

// Change this to your Railway URL after deployment
const BASE_URL = __DEV__
  ? 'http://10.0.2.2:8000'  // Android emulator
  : 'https://kids-schedule-production-ff25.up.railway.app';  // Production

const api = axios.create({ baseURL: BASE_URL });

// Add auth token to all requests
api.interceptors.request.use(async (config) => {
  const token = await AsyncStorage.getItem('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// ===== AUTH =====
export const authAPI = {
  register: async (role: string, name: string, phone?: string, familyCode?: string): Promise<AuthResponse> => {
    const { data } = await api.post('/auth/register', {
      role, name, phone, family_code: familyCode,
    });
    await AsyncStorage.setItem('token', data.token);
    await AsyncStorage.setItem('user', JSON.stringify(data));
    return data;
  },

  login: async (phone: string, familyCode: string): Promise<AuthResponse> => {
    const { data } = await api.post('/auth/login', { phone, family_code: familyCode });
    await AsyncStorage.setItem('token', data.token);
    await AsyncStorage.setItem('user', JSON.stringify(data));
    return data;
  },

  getUser: async (): Promise<AuthResponse | null> => {
    const user = await AsyncStorage.getItem('user');
    return user ? JSON.parse(user) : null;
  },

  logout: async () => {
    await AsyncStorage.removeItem('token');
    await AsyncStorage.removeItem('user');
  },

  updatePushToken: async (pushToken: string) => {
    await api.post('/auth/push-token', null, { params: { push_token: pushToken } });
  },
};

// ===== CHILDREN =====
export const childrenAPI = {
  list: async (): Promise<Child[]> => {
    const { data } = await api.get('/children/');
    return data;
  },
  create: async (child: Omit<Child, 'id'>): Promise<Child> => {
    const { data } = await api.post('/children/', child);
    return data;
  },
  update: async (id: string, child: Omit<Child, 'id'>): Promise<Child> => {
    const { data } = await api.put(`/children/${id}`, child);
    return data;
  },
  delete: async (id: string) => {
    await api.delete(`/children/${id}`);
  },
};

// ===== CONTACTS =====
export const contactsAPI = {
  list: async (): Promise<Contact[]> => {
    const { data } = await api.get('/contacts/');
    return data;
  },
  create: async (contact: Omit<Contact, 'id'>): Promise<Contact> => {
    const { data } = await api.post('/contacts/', contact);
    return data;
  },
  update: async (id: string, contact: Omit<Contact, 'id'>): Promise<Contact> => {
    const { data } = await api.put(`/contacts/${id}`, contact);
    return data;
  },
  delete: async (id: string) => {
    await api.delete(`/contacts/${id}`);
  },
};

// ===== SCHEDULE =====
export const scheduleAPI = {
  get: async (childId: string, day?: number): Promise<ScheduleBlock[]> => {
    const params = day !== undefined ? { day } : {};
    const { data } = await api.get(`/schedule/${childId}`, { params });
    return data;
  },
  createBlock: async (block: any): Promise<ScheduleBlock> => {
    const { data } = await api.post('/schedule/blocks', block);
    return data;
  },
  deleteBlock: async (blockId: string) => {
    await api.delete(`/schedule/blocks/${blockId}`);
  },
  detectGaps: async (childId: string, day?: number): Promise<GapInfo[]> => {
    const params: any = { child_id: childId };
    if (day !== undefined) params.day = day;
    const { data } = await api.post('/schedule/detect-gaps', null, { params });
    return data;
  },
};

// ===== CHAT =====
export const chatAPI = {
  send: async (message: string): Promise<ChatResponse> => {
    const { data } = await api.post('/chat/', { message });
    return data;
  },
};

// ===== CHECKIN =====
export const checkinAPI = {
  record: async (childId: string, eventType: string, rawMessage: string, sourcePhone?: string) => {
    const { data } = await api.post('/checkin/', {
      child_id: childId, event_type: eventType, raw_message: rawMessage, source_phone: sourcePhone,
    });
    return data;
  },
  getToday: async (childId: string) => {
    const { data } = await api.get(`/checkin/${childId}/today`);
    return data;
  },
};

// ===== ONBOARDING =====
export const onboardingAPI = {
  analyzeSms: async (messages: any[]) => {
    const { data } = await api.post('/onboarding/analyze-sms', { messages });
    return data;
  },
  analyzeAll: async (smsMessages: any[], notifications: any[]) => {
    const { data } = await api.post('/onboarding/analyze-all', {
      sms_messages: smsMessages,
      notifications,
    });
    return data;
  },
  analyzeSchedulePhoto: async (imageBase64: string, childName?: string) => {
    const { data } = await api.post('/onboarding/analyze-schedule-photo', {
      image_base64: imageBase64,
      child_name: childName,
    });
    return data;
  },
};

// ===== MESSAGES =====
export const messagesAPI = {
  list: async (days: number = 7, channel?: string) => {
    const params: any = { days };
    if (channel) params.channel = channel;
    const { data } = await api.get('/messages/', { params });
    return data;
  },
};

// ===== NOTIFICATION =====
export const notificationAPI = {
  process: async (rawMessage: string, sourceApp: string, sourceChannel: string) => {
    const { data } = await api.post('/checkin/notification', {
      raw_message: rawMessage,
      source_app: sourceApp,
      source_channel: sourceChannel,
    });
    return data;
  },
};

export default api;
