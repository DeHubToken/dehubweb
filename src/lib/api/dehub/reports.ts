import { apiCall } from './core';

export interface DeHubReport {
  id: string;
  tokenId: number;
  reporterId: string;
  reason: string;
  description?: string;
  status: 'pending' | 'reviewed' | 'resolved' | 'dismissed';
  createdAt: string;
  updatedAt?: string;
}

export interface ReportSubmission {
  tokenId: number;
  reason: string;
  description?: string;
}

export interface ReportReason {
  id: string;
  label: string;
  description?: string;
}

export async function getAllReports(): Promise<DeHubReport[]> {
  const response = await apiCall<{ result: DeHubReport[] } | DeHubReport[]>("/api/nft/reports", {
    requiresAuth: true,
  });
  
  if (response && typeof response === 'object' && 'result' in response) {
    return response.result || [];
  }
  if (Array.isArray(response)) {
    return response;
  }
  return [];
}

export async function getReportsForNFT(tokenId: number | string): Promise<DeHubReport[]> {
  const response = await apiCall<{ result: DeHubReport[] } | DeHubReport[]>(`/api/reports/${tokenId}`, {
    requiresAuth: true,
  });
  
  if (response && typeof response === 'object' && 'result' in response) {
    return response.result || [];
  }
  if (Array.isArray(response)) {
    return response;
  }
  return [];
}

export async function submitReport(data: ReportSubmission): Promise<{ success: boolean; reportId?: string; message?: string }> {
  try {
    const response = await apiCall<{ success?: boolean; result?: { id: string }; message?: string; _id?: string }>("/api/nft/reports", {
      method: "POST",
      body: data as unknown as Record<string, unknown>,
      requiresAuth: true,
    });
    
    const reportId = response?.result?.id || response?._id;
    
    return { 
      success: response?.success !== false, 
      reportId,
      message: response?.message || 'Report submitted successfully',
    };
  } catch (error: any) {
    console.error('[submitReport] Error:', error);
    throw error;
  }
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
    body: params as Record<string, unknown>,
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
    body: params as Record<string, unknown>,
    requiresAuth: true,
  });
  return { success: response?.success !== false, message: response?.message };
}
