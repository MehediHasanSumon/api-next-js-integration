import api from "@/lib/axios";
import type {
  Attachment,
  ChatUser,
  Conversation,
  ConversationActionResponse,
  ConversationId,
  ConversationListItem,
  ConversationParticipant,
  ConversationRequestResponse,
  ConversationShowResponse,
  ForwardMessagePayload,
  ForwardMessageResponse,
  ListConversationsParams,
  ListMessagesParams,
  MarkReadPayload,
  MarkReadResponse,
  Message,
  MessageId,
  MessageListResponse,
  MessageReactionMutationResponse,
  MessageType,
  PaginatedResponse,
  ParticipantState,
  ReactionAggregate,
  RemoveMessageForEverywhereResponse,
  RemoveMessageForYouResponse,
  RequestAction,
  SendMessagePayload,
  SendMessageResponse,
  UpdateMessagePayload,
  UpdateMessageResponse,
  UploadAttachmentResponse,
  StartConversationPayload,
  StartConversationResponse,
  ToggleMessageReactionPayload,
  TypingResponse,
} from "@/types/chat";

export type {
  Attachment,
  AttachmentPayload,
  ChatUser,
  Conversation,
  ConversationActionResponse,
  ConversationFilter,
  ConversationId,
  ConversationListItem,
  ConversationParticipant,
  ConversationRequestResponse,
  ConversationShowResponse,
  DemoConversationSummary,
  DemoThreadMessage,
  ForwardMessagePayload,
  ForwardMessageResponse,
  ListConversationsParams,
  ListMessagesParams,
  MarkReadPayload,
  MarkReadResponse,
  Message,
  MessageDeletionState,
  MessageId,
  MessageListResponse,
  MessageReactionAction,
  MessageReactionMutationData,
  MessageReactionMutationResponse,
  MessageRemovalMode,
  MessageType,
  PaginatedResponse,
  ParticipantState,
  ReactionAggregate,
  RemoveMessageForEverywhereResponse,
  RemoveMessageForYouResponse,
  RequestAction,
  SendMessagePayload,
  SendMessageResponse,
  UpdateMessagePayload,
  UpdateMessageResponse,
  UploadAttachmentResponse,
  StartConversationPayload,
  StartConversationResponse,
  ToggleMessageReactionPayload,
  TypingResponse,
} from "@/types/chat";

const CHAT_BASE = "/chat/conversations";
const CHAT_MESSAGE_BASE = "/chat/messages";

const cleanParams = <T extends object>(params: T): Partial<T> => {
  const output: Partial<T> = {};

  for (const key of Object.keys(params) as Array<keyof T>) {
    const value = params[key];

    if (value !== undefined && value !== null && value !== "") {
      output[key] = value;
    }
  }

  return output;
};

const conversationPath = (conversationId: ConversationId): string => `${CHAT_BASE}/${conversationId}`;
const messagePath = (messageId: MessageId): string => `${CHAT_MESSAGE_BASE}/${messageId}`;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const toNumber = (value: unknown, fallback = 0): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const toNullableString = (value: unknown): string | null => {
  if (typeof value === "string") {
    return value;
  }

  if (value === null || value === undefined) {
    return null;
  }

  return String(value);
};

const toIdentifier = (value: unknown, fallback: string | number = ""): ConversationId => {
  if (typeof value === "string" || typeof value === "number") {
    return value;
  }

  return fallback;
};

const toNullableIdentifier = (value: unknown): ConversationId | null => {
  if (value === null || value === undefined) {
    return null;
  }

  if (typeof value === "string" || typeof value === "number") {
    return value;
  }

  return null;
};

const normalizeChatUser = (value: unknown): ChatUser | undefined => {
  if (!isRecord(value)) {
    return undefined;
  }

  return {
    id: toNumber(value.id),
    name: toNullableString(value.name) ?? "",
    email: toNullableString(value.email) ?? "",
    last_seen_at: toNullableString(value.last_seen_at ?? value.lastSeenAt),
  };
};

const normalizeAttachment = (value: unknown): Attachment | null => {
  if (!isRecord(value)) {
    return null;
  }

  const createdAt = toNullableString(value.created_at) ?? new Date().toISOString();

  return {
    id: toIdentifier(value.id),
    message_id: toIdentifier(value.message_id),
    uploader_id: value.uploader_id === null || value.uploader_id === undefined ? null : toNumber(value.uploader_id),
    attachment_type: (toNullableString(value.attachment_type) as Attachment["attachment_type"]) ?? "file",
    storage_disk: toNullableString(value.storage_disk),
    storage_path: toNullableString(value.storage_path) ?? "",
    original_name: toNullableString(value.original_name),
    mime_type: toNullableString(value.mime_type) ?? "application/octet-stream",
    extension: toNullableString(value.extension),
    size_bytes: toNumber(value.size_bytes),
    width: value.width === null || value.width === undefined ? null : toNumber(value.width),
    height: value.height === null || value.height === undefined ? null : toNumber(value.height),
    duration_ms: value.duration_ms === null || value.duration_ms === undefined ? null : toNumber(value.duration_ms),
    checksum_sha256: toNullableString(value.checksum_sha256),
    metadata: isRecord(value.metadata) ? value.metadata : null,
    created_at: createdAt,
    updated_at: toNullableString(value.updated_at) ?? createdAt,
  };
};

const normalizeReactionAggregates = (value: unknown): ReactionAggregate[] => {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => {
      if (!isRecord(item)) {
        return null;
      }

      return {
        emoji: toNullableString(item.emoji) ?? "",
        count: toNumber(item.count ?? item.total),
        reacted_by_me: Boolean(item.reacted_by_me ?? item.reactedByMe),
      } satisfies ReactionAggregate;
    })
    .filter((item): item is ReactionAggregate => item !== null);
};

const normalizeMessage = (value: unknown, fallbackConversationId?: ConversationId): Message | null => {
  if (!isRecord(value)) {
    return null;
  }

  const createdAt = toNullableString(value.created_at ?? value.createdAt) ?? new Date().toISOString();
  const metadata = isRecord(value.metadata) ? value.metadata : null;
  const reactionAggregates = normalizeReactionAggregates(value.reaction_aggregates ?? value.reactionAggregates);
  const reactionsTotalFromAggregates = reactionAggregates.reduce((sum, item) => sum + item.count, 0);
  const reactionsTotal = toNumber(value.reactions_total, reactionsTotalFromAggregates);

  const deletionState =
    metadata && (metadata.removed_for_everyone === true || metadata.removed_for_everyone === 1)
      ? {
          is_removed_for_everyone: true,
          removed_for_everyone_by: metadata.removed_for_everyone_by
            ? toNumber(metadata.removed_for_everyone_by)
            : null,
          removed_for_everyone_at: toNullableString(metadata.removed_for_everyone_at),
          tombstone_text: toNullableString(metadata.tombstone_text),
          original_message_type: toNullableString(metadata.original_message_type) as MessageType | null,
        }
      : null;

  const replyRaw = value.reply_to ?? value.replyTo;
  const reply = isRecord(replyRaw)
    ? {
        id: toIdentifier(replyRaw.id),
        conversation_id: toIdentifier(replyRaw.conversation_id ?? fallbackConversationId ?? ""),
        sender_id: toNumber(replyRaw.sender_id),
        message_type: (toNullableString(replyRaw.message_type) as MessageType) ?? "text",
        body: toNullableString(replyRaw.body),
        created_at: toNullableString(replyRaw.created_at) ?? createdAt,
        sender: normalizeChatUser(replyRaw.sender),
        reactions_total: toNumber(replyRaw.reactions_total),
        reaction_aggregates: normalizeReactionAggregates(replyRaw.reaction_aggregates ?? replyRaw.reactionAggregates),
      }
    : null;

  const attachments = Array.isArray(value.attachments)
    ? value.attachments.map(normalizeAttachment).filter((item): item is Attachment => item !== null)
    : [];

  return {
    id: toIdentifier(value.id),
    conversation_id: toIdentifier(value.conversation_id ?? value.conversationId ?? fallbackConversationId ?? ""),
    sender_id: toNumber(value.sender_id),
    message_type: (toNullableString(value.message_type ?? value.messageType) as MessageType) ?? "text",
    body: toNullableString(value.body),
    metadata,
    reply_to_message_id: toNullableIdentifier(value.reply_to_message_id ?? value.replyToMessageId),
    forwarded_from_message_id: toNullableIdentifier(value.forwarded_from_message_id ?? value.forwardedFromMessageId),
    forwarded_from_user_id:
      value.forwarded_from_user_id === null || value.forwarded_from_user_id === undefined
        ? null
        : toNumber(value.forwarded_from_user_id),
    forwarded_snapshot: isRecord(value.forwarded_snapshot ?? value.forwardedSnapshot)
      ? ((value.forwarded_snapshot ?? value.forwardedSnapshot) as Message["forwarded_snapshot"])
      : null,
    client_uid: toNullableString(value.client_uid),
    edited_at: toNullableString(value.edited_at),
    deleted_at: toNullableString(value.deleted_at),
    created_at: createdAt,
    updated_at: toNullableString(value.updated_at) ?? createdAt,
    sender: normalizeChatUser(value.sender),
    forwarded_from_user: normalizeChatUser(value.forwarded_from_user ?? value.forwardedFromUser) ?? null,
    attachments,
    reply_to: reply,
    reactions_total: reactionsTotal,
    reaction_aggregates: reactionAggregates,
    deletion_state: deletionState,
  };
};

const normalizeParticipant = (value: unknown): ConversationParticipant | null => {
  if (!isRecord(value)) {
    return null;
  }

  const createdAt = toNullableString(value.created_at) ?? new Date().toISOString();

  return {
    id: toNumber(value.id),
    conversation_id: toIdentifier(value.conversation_id),
    user_id: toNumber(value.user_id),
    role: toNullableString(value.role) ?? "member",
    participant_state: (toNullableString(value.participant_state) as ParticipantState) ?? "accepted",
    accepted_at: toNullableString(value.accepted_at),
    declined_at: toNullableString(value.declined_at),
    archived_at: toNullableString(value.archived_at),
    muted_until: toNullableString(value.muted_until),
    hidden_at: toNullableString(value.hidden_at),
    last_read_message_id: toNullableIdentifier(value.last_read_message_id),
    last_read_at: toNullableString(value.last_read_at),
    unread_count: toNumber(value.unread_count),
    created_at: createdAt,
    updated_at: toNullableString(value.updated_at) ?? createdAt,
    user: normalizeChatUser(value.user),
  };
};

const normalizeConversation = (value: unknown): Conversation | null => {
  if (!isRecord(value)) {
    return null;
  }

  const id = toIdentifier(value.id);
  const lastMessage = normalizeMessage(value.last_message ?? value.lastMessage, id);
  const createdAt = toNullableString(value.created_at) ?? new Date().toISOString();
  const participants = Array.isArray(value.participants)
    ? value.participants.map(normalizeParticipant).filter((item): item is ConversationParticipant => item !== null)
    : [];

  return {
    id,
    type: toNullableString(value.type),
    created_by: toNumber(value.created_by),
    title: toNullableString(value.title),
    description: toNullableString(value.description),
    avatar_path: toNullableString(value.avatar_path),
    direct_user_low_id:
      value.direct_user_low_id === null || value.direct_user_low_id === undefined
        ? null
        : toNumber(value.direct_user_low_id),
    direct_user_high_id:
      value.direct_user_high_id === null || value.direct_user_high_id === undefined
        ? null
        : toNumber(value.direct_user_high_id),
    last_message_id: toNullableIdentifier(value.last_message_id ?? lastMessage?.id),
    last_message_at: toNullableString(value.last_message_at) ?? lastMessage?.created_at ?? null,
    deleted_at: toNullableString(value.deleted_at),
    created_at: createdAt,
    updated_at: toNullableString(value.updated_at) ?? createdAt,
    creator: normalizeChatUser(value.creator),
    last_message: lastMessage,
    participants,
  };
};

const normalizeConversationListItem = (value: unknown): ConversationListItem | null => {
  if (!isRecord(value)) {
    return null;
  }

  const conversationId = toIdentifier(value.conversation_id ?? value.id ?? "");
  const lastMessage = normalizeMessage(value.last_message ?? value.lastMessage, conversationId);

  return {
    conversation_id: conversationId,
    type: toNullableString(value.type),
    title: toNullableString(value.title),
    description: toNullableString(value.description),
    avatar_path: toNullableString(value.avatar_path),
    last_message_at: toNullableString(value.last_message_at) ?? lastMessage?.created_at ?? null,
    participant_state: (toNullableString(value.participant_state) as ParticipantState) ?? "accepted",
    archived_at: toNullableString(value.archived_at),
    unread_count: toNumber(value.unread_count),
    counterpart: normalizeChatUser(value.counterpart) ?? null,
    last_message: lastMessage,
  };
};

const normalizePaginatedConversationList = (
  value: PaginatedResponse<ConversationListItem>
): PaginatedResponse<ConversationListItem> => {
  const normalizedData = Array.isArray(value.data)
    ? value.data
        .map((item) => normalizeConversationListItem(item))
        .filter((item): item is ConversationListItem => item !== null)
    : [];

  return {
    ...value,
    data: normalizedData,
  };
};

const normalizeConversationShowResponse = (value: ConversationShowResponse): ConversationShowResponse => {
  const conversation = normalizeConversation(value.conversation);

  return {
    conversation:
      conversation ?? {
        id: "",
        type: null,
        created_by: 0,
        title: null,
        description: null,
        avatar_path: null,
        direct_user_low_id: null,
        direct_user_high_id: null,
        last_message_id: null,
        last_message_at: null,
        deleted_at: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
    participant: {
      participant_state: (toNullableString(value.participant?.participant_state) as ParticipantState) ?? "accepted",
      archived_at: toNullableString(value.participant?.archived_at),
      unread_count: toNumber(value.participant?.unread_count),
      last_read_message_id: value.participant?.last_read_message_id ?? null,
      last_read_at: toNullableString(value.participant?.last_read_at),
    },
  };
};

const normalizeMessageListResponse = (value: MessageListResponse): MessageListResponse => {
  const conversationId = value.conversation_id;

  return {
    conversation_id: conversationId,
    data: Array.isArray(value.data)
      ? value.data
          .map((item) => normalizeMessage(item, conversationId))
          .filter((item): item is Message => item !== null)
      : [],
  };
};

const normalizeMessageResponse = <T extends { message: string; data: Message }>(value: T): T => {
  return {
    ...value,
    data: normalizeMessage(value.data) ?? value.data,
  };
};

const normalizeReactionMutationResponse = (
  value: MessageReactionMutationResponse
): MessageReactionMutationResponse => {
  return {
    ...value,
    data: {
      ...value.data,
      reactions_total: toNumber(value.data?.reactions_total),
      reaction_aggregates: normalizeReactionAggregates(value.data?.reaction_aggregates),
    },
  };
};

export const listConversations = async (
  params: ListConversationsParams = {}
): Promise<PaginatedResponse<ConversationListItem>> => {
  const { data } = await api.get<PaginatedResponse<ConversationListItem>>(CHAT_BASE, {
    params: cleanParams(params),
  });

  return normalizePaginatedConversationList(data);
};

export const showConversation = async (conversationId: ConversationId): Promise<ConversationShowResponse> => {
  const { data } = await api.get<ConversationShowResponse>(conversationPath(conversationId));
  return normalizeConversationShowResponse(data);
};

export const startConversation = async (
  payload: StartConversationPayload
): Promise<StartConversationResponse> => {
  const { data } = await api.post<StartConversationResponse>(CHAT_BASE, payload);
  return data;
};

export const listMessages = async (
  conversationId: ConversationId,
  params: ListMessagesParams = {}
): Promise<MessageListResponse> => {
  const { data } = await api.get<MessageListResponse>(`${conversationPath(conversationId)}/messages`, {
    params: cleanParams(params),
  });

  return normalizeMessageListResponse(data);
};

export const sendMessage = async (
  conversationId: ConversationId,
  payload: SendMessagePayload
): Promise<SendMessageResponse> => {
  const { data } = await api.post<SendMessageResponse>(`${conversationPath(conversationId)}/messages`, payload);
  return normalizeMessageResponse(data);
};

export const updateMessage = async (
  messageId: MessageId,
  payload: UpdateMessagePayload
): Promise<UpdateMessageResponse> => {
  const { data } = await api.put<UpdateMessageResponse>(messagePath(messageId), payload);
  return normalizeMessageResponse(data);
};

export const uploadChatAttachment = async (
  conversationId: ConversationId,
  file: File
): Promise<UploadAttachmentResponse> => {
  const formData = new FormData();
  formData.append("conversation_id", String(conversationId));
  formData.append("file", file);

  const { data } = await api.post<UploadAttachmentResponse>("/chat/attachments", formData, {
    headers: {
      "Content-Type": "multipart/form-data",
    },
  });

  return data;
};

export const forwardMessage = async (
  messageId: MessageId,
  payload: ForwardMessagePayload
): Promise<ForwardMessageResponse> => {
  const { data } = await api.post<ForwardMessageResponse>(`${messagePath(messageId)}/forward`, payload);
  return normalizeMessageResponse(data);
};

export const toggleMessageReaction = async (
  messageId: MessageId,
  payload: ToggleMessageReactionPayload
): Promise<MessageReactionMutationResponse> => {
  const { data } = await api.post<MessageReactionMutationResponse>(`${messagePath(messageId)}/reactions`, payload);
  return normalizeReactionMutationResponse(data);
};

export const removeMessageReaction = async (
  messageId: MessageId,
  payload: ToggleMessageReactionPayload
): Promise<MessageReactionMutationResponse> => {
  const { data } = await api.delete<MessageReactionMutationResponse>(`${messagePath(messageId)}/reactions`, {
    data: payload,
  });
  return normalizeReactionMutationResponse(data);
};

export const removeMessageForYou = async (
  messageId: MessageId
): Promise<RemoveMessageForYouResponse> => {
  const { data } = await api.post<RemoveMessageForYouResponse>(`${messagePath(messageId)}/remove-for-you`);
  return data;
};

export const removeMessageForEverywhere = async (
  messageId: MessageId
): Promise<RemoveMessageForEverywhereResponse> => {
  const { data } = await api.post<RemoveMessageForEverywhereResponse>(`${messagePath(messageId)}/remove-for-everywhere`);

  return {
    ...data,
    data: {
      ...data.data,
      message: normalizeMessage(data.data?.message) ?? data.data?.message ?? null,
    },
  };
};

export const respondToConversationRequest = async (
  conversationId: ConversationId,
  action: RequestAction
): Promise<ConversationRequestResponse> => {
  const { data } = await api.post<ConversationRequestResponse>(
    `${conversationPath(conversationId)}/request/respond`,
    { action }
  );

  return data;
};

export const markConversationRead = async (
  conversationId: ConversationId,
  payload: MarkReadPayload = {}
): Promise<MarkReadResponse> => {
  const { data } = await api.post<MarkReadResponse>(
    `${conversationPath(conversationId)}/messages/read`,
    cleanParams(payload)
  );

  return data;
};

export const updateTyping = async (
  conversationId: ConversationId,
  isTyping: boolean
): Promise<TypingResponse> => {
  const { data } = await api.post<TypingResponse>(`${conversationPath(conversationId)}/typing`, {
    is_typing: isTyping,
  });

  return data;
};

export const archiveConversation = async (
  conversationId: ConversationId
): Promise<ConversationActionResponse> => {
  const { data } = await api.post<ConversationActionResponse>(`${conversationPath(conversationId)}/archive`);
  return data;
};

export const unarchiveConversation = async (
  conversationId: ConversationId
): Promise<ConversationActionResponse> => {
  const { data } = await api.delete<ConversationActionResponse>(`${conversationPath(conversationId)}/archive`);
  return data;
};

const chatApi = {
  startConversation,
  listConversations,
  showConversation,
  listMessages,
  sendMessage,
  updateMessage,
  uploadChatAttachment,
  forwardMessage,
  toggleMessageReaction,
  removeMessageReaction,
  removeMessageForYou,
  removeMessageForEverywhere,
  respondToConversationRequest,
  markConversationRead,
  updateTyping,
  archiveConversation,
  unarchiveConversation,
};

export default chatApi;
