-- Messenger Database Design (MySQL 8+)
-- Scope:
-- - Direct + Group chat
-- - Request/accept/decline flow
-- - Receiver decline -> receiver side hidden, sender side remains
-- - Archive per user
-- - Text/Image/File/Voice messages
-- - Indexes optimized for inbox, requests, message pagination

SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 1;

-- 1) Conversations
CREATE TABLE conversations (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    type ENUM('direct', 'group') NOT NULL,
    created_by BIGINT UNSIGNED NOT NULL,

    -- Group fields
    title VARCHAR(255) NULL,
    description TEXT NULL,
    avatar_path VARCHAR(1024) NULL,

    -- Direct pair fields (sorted user IDs to enforce one direct thread per pair)
    direct_user_low_id BIGINT UNSIGNED NULL,
    direct_user_high_id BIGINT UNSIGNED NULL,

    -- Denormalized last message pointers for fast inbox listing
    last_message_id BIGINT UNSIGNED NULL,
    last_message_at DATETIME NULL,

    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    deleted_at DATETIME NULL,

    CONSTRAINT fk_conversations_created_by
        FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE CASCADE,

    CONSTRAINT ck_conversation_type_shape CHECK (
        (
            type = 'direct'
            AND direct_user_low_id IS NOT NULL
            AND direct_user_high_id IS NOT NULL
            AND direct_user_low_id < direct_user_high_id
        )
        OR
        (
            type = 'group'
            AND direct_user_low_id IS NULL
            AND direct_user_high_id IS NULL
        )
    ),

    CONSTRAINT uq_direct_pair UNIQUE (type, direct_user_low_id, direct_user_high_id),
    INDEX idx_conversations_last_message (last_message_at DESC, id DESC),
    INDEX idx_conversations_created_by (created_by)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- 2) Conversation participants (membership + per-user state)
CREATE TABLE conversation_participants (
    conversation_id BIGINT UNSIGNED NOT NULL,
    user_id BIGINT UNSIGNED NOT NULL,

    role ENUM('owner', 'admin', 'member') NOT NULL DEFAULT 'member',

    -- participant_state drives request/inbox logic
    -- accepted: active inbox chat
    -- pending: request waiting for this user
    -- declined: hidden from this user (sender still keeps conversation)
    -- left/removed: group membership exits
    participant_state ENUM('accepted', 'pending', 'declined', 'left', 'removed') NOT NULL DEFAULT 'accepted',

    accepted_at DATETIME NULL,
    declined_at DATETIME NULL,
    archived_at DATETIME NULL,
    muted_until DATETIME NULL,

    -- Hide thread for this participant (used on decline flow)
    hidden_at DATETIME NULL,

    -- Fast unread support
    last_read_message_id BIGINT UNSIGNED NULL,
    last_read_at DATETIME NULL,
    unread_count INT UNSIGNED NOT NULL DEFAULT 0,

    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

    PRIMARY KEY (conversation_id, user_id),

    CONSTRAINT fk_cp_conversation
        FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE,
    CONSTRAINT fk_cp_user
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,

    INDEX idx_cp_user_inbox (user_id, participant_state, archived_at, hidden_at, updated_at DESC),
    INDEX idx_cp_user_requests (user_id, participant_state, hidden_at, updated_at DESC),
    INDEX idx_cp_conversation_state (conversation_id, participant_state),
    INDEX idx_cp_user_unread (user_id, unread_count DESC)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- 3) Messages
CREATE TABLE messages (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    conversation_id BIGINT UNSIGNED NOT NULL,
    sender_id BIGINT UNSIGNED NULL,

    message_type ENUM('text', 'image', 'file', 'voice', 'system') NOT NULL DEFAULT 'text',
    body LONGTEXT NULL,
    metadata JSON NULL,

    reply_to_message_id BIGINT UNSIGNED NULL,

    -- Client generated UUID for idempotent send
    client_uid CHAR(36) NULL,

    edited_at DATETIME NULL,
    deleted_at DATETIME NULL,

    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

    CONSTRAINT fk_messages_conversation
        FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE,
    CONSTRAINT fk_messages_sender
        FOREIGN KEY (sender_id) REFERENCES users(id) ON DELETE SET NULL,
    CONSTRAINT fk_messages_reply_to
        FOREIGN KEY (reply_to_message_id) REFERENCES messages(id) ON DELETE SET NULL,

    UNIQUE KEY uq_messages_sender_client_uid (sender_id, client_uid),
    INDEX idx_messages_conversation_id_desc (conversation_id, id DESC),
    INDEX idx_messages_conversation_visible_desc (conversation_id, deleted_at, id DESC),
    INDEX idx_messages_sender_created_desc (sender_id, created_at DESC),
    FULLTEXT INDEX ft_messages_body (body)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- 4) Message attachments (image/file/voice)
CREATE TABLE message_attachments (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    message_id BIGINT UNSIGNED NOT NULL,
    uploader_id BIGINT UNSIGNED NULL,

    attachment_type ENUM('image', 'file', 'voice') NOT NULL,
    storage_disk VARCHAR(50) NOT NULL DEFAULT 'public',
    storage_path VARCHAR(1024) NOT NULL,
    original_name VARCHAR(255) NULL,
    mime_type VARCHAR(191) NOT NULL,
    extension VARCHAR(20) NULL,
    size_bytes BIGINT UNSIGNED NOT NULL,

    -- image/voice metadata
    width INT UNSIGNED NULL,
    height INT UNSIGNED NULL,
    duration_ms INT UNSIGNED NULL,

    checksum_sha256 CHAR(64) NULL,
    metadata JSON NULL,

    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

    CONSTRAINT fk_ma_message
        FOREIGN KEY (message_id) REFERENCES messages(id) ON DELETE CASCADE,
    CONSTRAINT fk_ma_uploader
        FOREIGN KEY (uploader_id) REFERENCES users(id) ON DELETE SET NULL,

    INDEX idx_ma_message (message_id, id),
    INDEX idx_ma_uploader_created (uploader_id, created_at DESC),
    INDEX idx_ma_checksum (checksum_sha256)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- 5) Message receipts (for seen status, especially group chat)
CREATE TABLE message_receipts (
    message_id BIGINT UNSIGNED NOT NULL,
    user_id BIGINT UNSIGNED NOT NULL,
    status ENUM('delivered', 'seen') NOT NULL DEFAULT 'delivered',
    delivered_at DATETIME NULL,
    seen_at DATETIME NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

    PRIMARY KEY (message_id, user_id),

    CONSTRAINT fk_mr_message
        FOREIGN KEY (message_id) REFERENCES messages(id) ON DELETE CASCADE,
    CONSTRAINT fk_mr_user
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,

    INDEX idx_mr_user_status_message (user_id, status, message_id DESC)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- Add FK after messages table exists
ALTER TABLE conversations
    ADD CONSTRAINT fk_conversations_last_message
        FOREIGN KEY (last_message_id) REFERENCES messages(id) ON DELETE SET NULL;


-- -------------------------------------------------------------------------
-- FAST QUERY PATTERNS (reference)
-- -------------------------------------------------------------------------

-- A) Inbox list (accepted + not archived + not hidden), latest first
-- SELECT c.id, c.type, c.title, c.last_message_at, cp.unread_count, m.body AS last_message_body
-- FROM conversation_participants cp
-- JOIN conversations c ON c.id = cp.conversation_id
-- LEFT JOIN messages m ON m.id = c.last_message_id
-- WHERE cp.user_id = :user_id
--   AND cp.participant_state = 'accepted'
--   AND cp.archived_at IS NULL
--   AND cp.hidden_at IS NULL
-- ORDER BY c.last_message_at DESC, c.id DESC
-- LIMIT :limit OFFSET :offset;

-- B) Requests list (pending + visible)
-- SELECT c.id, c.type, c.title, c.last_message_at
-- FROM conversation_participants cp
-- JOIN conversations c ON c.id = cp.conversation_id
-- WHERE cp.user_id = :user_id
--   AND cp.participant_state = 'pending'
--   AND cp.hidden_at IS NULL
-- ORDER BY cp.updated_at DESC
-- LIMIT :limit OFFSET :offset;

-- C) Message pagination (cursor-based)
-- SELECT *
-- FROM messages
-- WHERE conversation_id = :conversation_id
--   AND deleted_at IS NULL
--   AND id < :cursor_id
-- ORDER BY id DESC
-- LIMIT :limit;

-- D) Unread count aggregate for sidebar badge
-- SELECT COALESCE(SUM(unread_count), 0) AS total_unread
-- FROM conversation_participants
-- WHERE user_id = :user_id
--   AND participant_state = 'accepted'
--   AND archived_at IS NULL
--   AND hidden_at IS NULL;

-- -------------------------------------------------------------------------
-- REQUEST FLOW STATE TRANSITIONS (reference)
-- -------------------------------------------------------------------------
-- Unknown sender -> receiver request:
--   sender row:   participant_state = 'accepted'
--   receiver row: participant_state = 'pending'
--
-- Receiver accepts:
--   receiver row -> participant_state='accepted', accepted_at=NOW(), hidden_at=NULL
--
-- Receiver declines (your requirement):
--   receiver row -> participant_state='declined', declined_at=NOW(), hidden_at=NOW()
--   sender row remains unchanged (sender keeps chat/history)
--
-- Later re-request by sender:
--   receiver row can be moved from declined -> pending and hidden_at=NULL
