export type NativeCallAction = {
  action: 'answer' | 'decline';
  type?: string | null;
  callType?: string | null;
  conversationId?: string | null;
  roomName?: string | null;
  callId?: string | null;
};

let pendingNativeCallAction: NativeCallAction | null = null;

function valueMatches(expected?: string | null, actual?: string | null) {
  return !expected || !actual || String(expected) === String(actual);
}

export function rememberNativeCallAction(action: NativeCallAction) {
  pendingNativeCallAction = action;
}

export function consumePendingNativeCallAction(match: {
  type: 'direct-call' | 'group-call';
  conversationId?: string | null;
  roomName?: string | null;
  callId?: string | null;
}) {
  const action = pendingNativeCallAction;
  if (!action) return null;
  if (action.type && action.type !== match.type) return null;
  if (!valueMatches(action.conversationId, match.conversationId)) return null;
  if (!valueMatches(action.roomName, match.roomName)) return null;
  if (!valueMatches(action.callId, match.callId)) return null;

  pendingNativeCallAction = null;
  return action;
}
