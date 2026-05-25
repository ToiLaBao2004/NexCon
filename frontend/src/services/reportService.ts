import api from "@/lib/axios";
import { getApiErrorMessage } from "@/lib/apiMessage";
import type { Mention } from "@/types/chat";

export type ReportReasonCategory =
  | "spam"
  | "harassment"
  | "hate_speech"
  | "sexual_content"
  | "violence"
  | "scam"
  | "impersonation"
  | "self_harm"
  | "other";

export interface CreateReportPayload {
  reasonCategory: ReportReasonCategory;
  description?: string;
  conversationId?: string;
}

export type ReportTargetType = "message" | "user";
export type ReportStatus = "pending" | "reviewing" | "resolved" | "dismissed";

export interface MyReport {
  _id: string;
  targetType: ReportTargetType;
  targetUserId: string;
  targetMessageId?: string | null;
  conversationId?: string | null;
  reasonCategory: ReportReasonCategory;
  description?: string;
  status: ReportStatus;
  createdAt: string;
  updatedAt?: string;
  targetUserSnapshot?: {
    displayName?: string;
    email?: string;
    avatarUrl?: string;
  };
  messageSnapshot?: {
    type?: string;
    content?: string;
    fileName?: string;
    mimeType?: string;
    mentions?: Mention[];
    createdAt?: string;
    senderInfo?: {
      displayName?: string;
      avatarUrl?: string;
    } | null;
  };
  review?: {
    reviewedAt?: string | null;
    note?: string;
  };
  resolution?: {
    decision?: "violation" | "no_violation" | null;
    actionTaken?: string;
    reporterMessage?: string;
    targetMessage?: string;
    targetViolationCount?: number | null;
    targetLocked?: boolean;
  };
}

function resolveReportError(error: any): string {
  return getApiErrorMessage(error, "Không thể gửi báo cáo. Vui lòng thử lại.");
}

export const reportService = {
  async reportMessage(messageId: string, payload: CreateReportPayload) {
    try {
      const response = await api.post(`/reports/messages/${messageId}`, payload);
      return response.data;
    } catch (error: any) {
      throw new Error(resolveReportError(error));
    }
  },

  async reportUser(userId: string, payload: CreateReportPayload) {
    try {
      const response = await api.post(`/reports/users/${userId}`, payload);
      return response.data;
    } catch (error: any) {
      throw new Error(resolveReportError(error));
    }
  },

  async getMyReports() {
    try {
      const response = await api.get("/reports/my");
      return response.data as { reports: MyReport[] };
    } catch (error: any) {
      throw new Error(resolveReportError(error));
    }
  },
};
