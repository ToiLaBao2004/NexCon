import api from "@/lib/axios";
import type { ModerationStatusResponse } from "@/types/moderation";

export const moderationService = {
  async getMyModerationStatus(limit = 30): Promise<ModerationStatusResponse> {
    const response = await api.get("/users/me/moderation", {
      params: { limit },
    });
    return response.data;
  },
};
