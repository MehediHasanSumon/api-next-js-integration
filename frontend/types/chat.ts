export type ConversationId = number | string;
export type MessageId = number | string;

export type ParticipantState = "pending" | "accepted" | "declined";
export type MessageType = "text" | "image" | "file" | "voice" | "system";
export type AttachmentType = "image" | "file" | "voice";

export type ConversationFilter = "inbox" | "requests" | "archived" | "all";
export type RequestAction = "accept" | "decline";

export interface PaginatedLink {
  url: string | null;
  label: string;
  active: boolean;
}

export interface PaginatedResponse<T> {
  current_page: number;
  data: T[];
  first_page_url: string | null;
  from: number | null;
  last_page: number;
  last_page_url: string | null;
  links: PaginatedLink[];
  next_page_url: string | null;
  path: string;
  per_page: number;
  prev_page_url: string | null;
  to: number | null;
  total: number;
}

export interface ChatUser {
  id: number;
  name: string;
  email: string;
}

export interface Attachment {
  id: MessageId;
  message_id: MessageId;
  uploader_id: number | null;
  attachment_type: AttachmentType;
  storage_disk: string | null;
  storage_path: string;
  original_name: string | null;
  mime_type: string;
  extension: string | null;
  size_bytes: number;
  width: number | null;
  height: number | null;
  duration_ms: number | null;
  checksum_sha256: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
}

export interface MessageReply {
  id: MessageId;
  conversation_id: ConversationId;
  sender_id: number;
  message_type: MessageType;
  body: string | null;
  created_at: string;
  sender?: ChatUser;
}

export interface Message {
  id: MessageId;
  conversation_id: ConversationId;
  sender_id: number;
  message_type: MessageType;
  body: string | null;
  metadata: Record<string, unknown> | null;
  reply_to_message_id: MessageId | null;
  client_uid: string | null;
  edited_at: string | null;
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
  sender?: ChatUser;
  attachments?: Attachment[];
  reply_to?: MessageReply | null;
}

export interface ConversationParticipant {
  id: number;
  conversation_id: ConversationId;
  user_id: number;
  role: string;
  participant_state: ParticipantState;
  accepted_at: string | null;
  declined_at: string | null;
  archived_at: string | null;
  muted_until: string | null;
  hidden_at: string | null;
  last_read_message_id: MessageId | null;
  last_read_at: string | null;
  unread_count: number;
  created_at: string;
  updated_at: string;
  user?: ChatUser;
}

export interface Conversation {
  id: ConversationId;
  type: string | null;
  created_by: number;
  title: string | null;
  description: string | null;
  avatar_path: string | null;
  direct_user_low_id: number | null;
  direct_user_high_id: number | null;
  last_message_id: MessageId | null;
  last_message_at: string | null;
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
  creator?: ChatUser;
  last_message?: Message | null;
  participants?: ConversationParticipant[];
}

export interface ConversationListItem {
  conversation_id: ConversationId;
  type: string | null;
  title: string | null;
  description: string | null;
  avatar_path: string | null;
  last_message_at: string | null;
  participant_state: ParticipantState;
  archived_at: string | null;
  unread_count: number;
  counterpart: ChatUser | null;
  last_message: {
    id: MessageId;
    message_type: MessageType;
    body: string | null;
    created_at: string;
    sender: ChatUser | null;
  } | null;
}

export interface ConversationShowResponse {
  conversation: Conversation;
  participant: {
    participant_state: ParticipantState;
    archived_at: string | null;
    unread_count: number;
    last_read_message_id: MessageId | null;
    last_read_at: string | null;
  };
}

export interface ConversationActionResponse {
  message: string;
  conversation_id: ConversationId;
}

export interface StartConversationPayload {
  recipient_user_id?: number;
  recipient_email?: string;
}

export interface StartConversationResponse {
  message: string;
  conversation_id: ConversationId;
  created: boolean;
}

export interface ConversationRequestResponse extends ConversationActionResponse {
  participant_state: ParticipantState;
}

export interface MessageListResponse {
  conversation_id: ConversationId;
  data: Message[];
}

export interface AttachmentPayload {
  attachment_type: AttachmentType;
  storage_disk?: string;
  storage_path: string;
  original_name?: string;
  mime_type: string;
  extension?: string;
  size_bytes: number;
  width?: number;
  height?: number;
  duration_ms?: number;
  checksum_sha256?: string;
  metadata?: Record<string, unknown>;
}

export interface SendMessagePayload {
  message_type: MessageType;
  body?: string | null;
  metadata?: Record<string, unknown>;
  reply_to_message_id?: MessageId | null;
  client_uid?: string;
  attachments?: AttachmentPayload[];
}

export interface SendMessageResponse {
  message: string;
  data: Message;
}

export interface MarkReadPayload {
  last_read_message_id?: MessageId;
}

export interface MarkReadResponse {
  message: string;
  data: {
    conversation_id: ConversationId;
    user_id: number;
    last_read_message_id: MessageId;
    read_at: string;
  };
}

export interface TypingResponse {
  message: string;
  conversation_id: ConversationId;
  is_typing: boolean;
}

export interface ListConversationsParams {
  filter?: ConversationFilter;
  per_page?: number;
}

export interface ListMessagesParams {
  before_id?: MessageId;
  limit?: number;
}

export interface DemoConversationSummary {
  id: ConversationId;
  name: string;
  handle: string;
  lastMessage: string;
  lastTime: string;
  unread: number;
  participant_state: ParticipantState;
  pinned?: boolean;
  online?: boolean;
}

export interface DraftAttachment {
  id: string;
  kind: "image" | "file";
  name: string;
  size: number;
}

export type DemoThreadMessage = Pick<Message, "id"> & {
  from: "me" | "them";
  text: string;
  time: string;
  attachments?: DraftAttachment[];
};
