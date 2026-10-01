import { http } from '@/core/api/httpClient';
import type { CurrentUser, LoginRequest, LoginResponse } from './types';

export const authService = {
  login: (req: LoginRequest) => http.post<LoginResponse>('/auth/login', req),
  me: () => http.get<CurrentUser>('/auth/me'),
  logout: () => http.post<void>('/auth/logout'),
};
