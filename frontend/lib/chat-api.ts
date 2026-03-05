import api from "@/lib/axios";
import type {
  ConversationActionResponse,
  ConversationId,
  ConversationRequestResponse,
  ConversationShowResponse,
  ListConversationsParams,
  ListMessagesParams,
  MarkReadPayload,
  MarkReadResponse,
  MessageListResponse,
  PaginatedResponse,
  ConversationListItem,
  RequestAction,
  SendMessagePayload,
  SendMessageResponse,
  StartConversationPayload,
  StartConversationResponse,
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
  ListConversationsParams,
  ListMessagesParams,
  MarkReadPayload,
  MarkReadResponse,
  Message,
  MessageId,
  MessageListResponse,
  MessageType,
  PaginatedResponse,
  ParticipantState,
  RequestAction,
  SendMessagePayload,
  SendMessageResponse,
  StartConversationPayload,
  StartConversationResponse,
  TypingResponse,
} from "@/types/chat";

const CHAT_BASE = "/chat/conversations";

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

export const listConversations = async (
  params: ListConversationsParams = {}
): Promise<PaginatedResponse<ConversationListItem>> => {
  const { data } = await api.get<PaginatedResponse<ConversationListItem>>(CHAT_BASE, {
    params: cleanParams(params),
  });

  return data;
};

export const showConversation = async (conversationId: ConversationId): Promise<ConversationShowResponse> => {
  const { data } = await api.get<ConversationShowResponse>(conversationPath(conversationId));
  return data;
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

  return data;
};

export const sendMessage = async (
  conversationId: ConversationId,
  payload: SendMessagePayload
): Promise<SendMessageResponse> => {
  const { data } = await api.post<SendMessageResponse>(`${conversationPath(conversationId)}/messages`, payload);
  return data;
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
  respondToConversationRequest,
  markConversationRead,
  updateTyping,
  archiveConversation,
  unarchiveConversation,
};

export default chatApi;
