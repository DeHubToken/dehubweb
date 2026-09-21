import { apiCall } from './core';

export interface ReportReason {
  id: string;
  label: string;
  description?: string;
}

// v2 Reports API

export async function getContentReportStatus(tokenId: number | string): Promise<{ reported: boolean }> {
  const response = await apiCall<any>(`/api/report/content/status/${tokenId}`, {
    requiresAuth: true,
  });
  return { reported: response?.result?.reported ?? response?.reported ?? false };
}

export async function getUserReportStatus(userId: string): Promise<{ reported: boolean }> {
  const response = await apiCall<any>(`/api/report/user/status/${userId}`, {
    requiresAuth: true,
  });
  return { reported: response?.result?.reported ?? response?.reported ?? false };
}

export async function getContentReportReasons(): Promise<ReportReason[]> {
  const response = await apiCall<{ result: ReportReason[] } | ReportReason[]>("/api/report/reasons/content");
  if (response && typeof response === 'object' && 'result' in response) {
    return response.result || [];
  }
  return Array.isArray(response) ? response : [];
}

export async function getUserReportReasons(): Promise<ReportReason[]> {
  const response = await apiCall<{ result: ReportReason[] } | ReportReason[]>("/api/report/reasons/user");
  if (response && typeof response === 'object' && 'result' in response) {
    return response.result || [];
  }
  return Array.isArray(response) ? response : [];
}

export async function reportContent(params: {
  tokenId: number;
  reason: string;
  description?: string;
}): Promise<{ success: boolean; message?: string }> {
  const response = await apiCall<any>("/api/report/content", {
    method: "POST",
    // The DTO's free-text field is `additionalInfo` (max 500) — `description`
    // was silently dropped, so reporters' context never reached moderation.
    body: {
      tokenId: params.tokenId,
      reason: params.reason,
      additionalInfo: params.description || undefined,
    },
    requiresAuth: true,
  });
  return { success: response?.success !== false, message: response?.message };
}

export async function reportUser(params: {
  userId: string;
  reason: string;
  description?: string;
}): Promise<{ success: boolean; message?: string }> {
  const response = await apiCall<any>("/api/report/user", {
    method: "POST",
    // Same `additionalInfo` contract as reportContent.
    body: {
      userId: params.userId,
      reason: params.reason,
      additionalInfo: params.description || undefined,
    },
    requiresAuth: true,
  });
  return { success: response?.success !== false, message: response?.message };
}

// Comment reports

/**
 * The server answers `{ result: true, data: [{ value, label }] }`; the modal
 * reads `{ id, label }`, so map here rather than teach it a second shape.
 */
export async function getCommentReportReasons(): Promise<ReportReason[]> {
  const response = await apiCall<any>('/api/report/reasons/comment');
  const rows = Array.isArray(response?.data) ? response.data : Array.isArray(response) ? response : [];
  return rows
    .map((row: any) => ({ id: String(row?.value ?? row?.id ?? ''), label: String(row?.label ?? row?.value ?? '') }))
    .filter((row: ReportReason) => row.id);
}

export async function getCommentReportStatus(commentId: number | string): Promise<{ reported: boolean }> {
  const response = await apiCall<any>(`/api/report/comment/status/${commentId}`, {
    requiresAuth: true,
  });
  return { reported: response?.data?.hasReported ?? false };
}

export async function reportComment(params: {
  commentId: number | string;
  reason: string;
  description?: string;
}): Promise<{ success: boolean; message?: string }> {
  const response = await apiCall<any>('/api/report/comment', {
    method: 'POST',
    body: {
      commentId: String(params.commentId),
      reason: params.reason,
      additionalInfo: params.description || undefined,
    },
    requiresAuth: true,
  });
  return { success: response?.result !== false, message: response?.message };
}
