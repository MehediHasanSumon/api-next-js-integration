<?php

namespace App\Services\Chat;

use App\Events\Chat\ConversationRead;
use App\Events\Chat\ConversationThreadUpdated;
use App\Events\Chat\MessageEdited;
use App\Events\Chat\MessageReactionUpdated;
use App\Events\Chat\MessageRemovedEverywhere;
use App\Events\Chat\MessageRemovedForUser;
use App\Events\Chat\MessageSent;
use App\Models\Conversation;
use App\Models\ConversationParticipant;
use App\Models\Message;
use App\Models\MessageEdit;
use App\Models\MessageReaction;
use App\Models\MessageReceipt;
use App\Models\User;
use Illuminate\Auth\Access\AuthorizationException;
use Illuminate\Validation\ValidationException;
use Illuminate\Support\Arr;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

class ChatMessagingService
{
    private const REMOVE_EVERYWHERE_WINDOW_MINUTES = 15;
    private const EDIT_WINDOW_MINUTES = 20;
    private const REMOVE_EVERYWHERE_TOMBSTONE_TEXT = 'This message was removed.';

    public function sendMessage(
        Conversation $conversation,
        User $sender,
        ConversationParticipant $senderParticipant,
        array $payload
    ): Message {
        $message = DB::transaction(function () use ($conversation, $sender, $senderParticipant, $payload) {
            $message = Message::query()->create([
                'conversation_id' => $conversation->id,
                'sender_id' => $sender->id,
                'message_type' => Arr::get($payload, 'message_type', 'text'),
                'body' => Arr::get($payload, 'body'),
                'metadata' => Arr::get($payload, 'metadata'),
                'reply_to_message_id' => Arr::get($payload, 'reply_to_message_id'),
                'client_uid' => Arr::get($payload, 'client_uid'),
            ]);

            foreach (Arr::get($payload, 'attachments', []) as $attachment) {
                $message->attachments()->create([
                    'uploader_id' => $sender->id,
                    'attachment_type' => $attachment['attachment_type'],
                    'storage_disk' => $attachment['storage_disk'] ?? 'public',
                    'storage_path' => $attachment['storage_path'],
                    'original_name' => $attachment['original_name'] ?? null,
                    'mime_type' => $attachment['mime_type'],
                    'extension' => $attachment['extension'] ?? null,
                    'size_bytes' => $attachment['size_bytes'],
                    'width' => $attachment['width'] ?? null,
                    'height' => $attachment['height'] ?? null,
                    'duration_ms' => $attachment['duration_ms'] ?? null,
                    'checksum_sha256' => $attachment['checksum_sha256'] ?? null,
                    'metadata' => $attachment['metadata'] ?? null,
                ]);
            }

            $this->syncConversationAfterMessageMutation($conversation, $sender, $senderParticipant, $message);

            return $this->freshMessagePayload($message, (int) $sender->id);
        });

        broadcast(new MessageSent($conversation->id, $message->toArray()))->toOthers();
        $recipientIds = $conversation->participants()
            ->where('user_id', '!=', $sender->id)
            ->whereNull('hidden_at')
            ->pluck('user_id')
            ->map(fn ($id) => (int) $id)
            ->values()
            ->all();
        if ($recipientIds !== []) {
            broadcast(new ConversationThreadUpdated(
                (int) $conversation->id,
                $message->toArray(),
                $recipientIds
            ))->toOthers();
        }

        return $message;
    }

    public function forwardMessage(
        Message $sourceMessage,
        Conversation $targetConversation,
        User $actor,
        ConversationParticipant $actorParticipant,
        array $payload
    ): Message {
        $forwardedMessage = DB::transaction(function () use ($sourceMessage, $targetConversation, $actor, $actorParticipant, $payload) {
            $forwardedBody = Arr::get($payload, 'body');
            if (is_string($forwardedBody)) {
                $forwardedBody = trim($forwardedBody);
            }

            $forwardClientUid = Arr::get($payload, 'client_uid');
            if (!is_string($forwardClientUid) || trim($forwardClientUid) === '') {
                $forwardClientUid = (string) Str::uuid();
            }

            $message = Message::query()->create([
                'conversation_id' => $targetConversation->id,
                'sender_id' => $actor->id,
                'message_type' => $sourceMessage->message_type,
                'body' => $forwardedBody !== '' ? $forwardedBody : null,
                'metadata' => Arr::get($payload, 'metadata'),
                'reply_to_message_id' => null,
                'forwarded_from_message_id' => $sourceMessage->id,
                'forwarded_from_user_id' => $sourceMessage->sender_id,
                'forwarded_snapshot' => $this->buildForwardedSnapshot($sourceMessage),
                'client_uid' => $forwardClientUid,
            ]);

            $sourceMessage->loadMissing('attachments');

            foreach ($sourceMessage->attachments as $attachment) {
                $message->attachments()->create([
                    'uploader_id' => $actor->id,
                    'attachment_type' => $attachment->attachment_type,
                    'storage_disk' => $attachment->storage_disk ?? 'public',
                    'storage_path' => $attachment->storage_path,
                    'original_name' => $attachment->original_name,
                    'mime_type' => $attachment->mime_type,
                    'extension' => $attachment->extension,
                    'size_bytes' => $attachment->size_bytes,
                    'width' => $attachment->width,
                    'height' => $attachment->height,
                    'duration_ms' => $attachment->duration_ms,
                    'checksum_sha256' => $attachment->checksum_sha256,
                    'metadata' => $attachment->metadata,
                ]);
            }

            $this->syncConversationAfterMessageMutation($targetConversation, $actor, $actorParticipant, $message);

            return $message->fresh([
                'sender:id,name,email',
                'attachments',
                'forwardedFromUser:id,name,email',
            ]);
        });

        broadcast(new MessageSent(
            (int) $targetConversation->id,
            $forwardedMessage->toArray(),
            'forwarded',
            [
                'forwarded_from_message_id' => (int) $forwardedMessage->forwarded_from_message_id,
                'forwarded_from_user_id' => (int) $forwardedMessage->forwarded_from_user_id,
                'forwarded_snapshot' => $forwardedMessage->forwarded_snapshot,
                'client_uid' => $forwardedMessage->client_uid,
            ]
        ))->toOthers();
        $recipientIds = $targetConversation->participants()
            ->where('user_id', '!=', $actor->id)
            ->whereNull('hidden_at')
            ->pluck('user_id')
            ->map(fn ($id) => (int) $id)
            ->values()
            ->all();
        if ($recipientIds !== []) {
            broadcast(new ConversationThreadUpdated(
                (int) $targetConversation->id,
                $forwardedMessage->toArray(),
                $recipientIds
            ))->toOthers();
        }

        return $forwardedMessage;
    }

    public function markAsRead(
        Conversation $conversation,
        User $reader,
        ConversationParticipant $participant,
        ?int $lastReadMessageId = null
    ): array {
        $finalLastReadMessageId = $lastReadMessageId ?? (int) ($conversation->last_message_id ?? 0);

        DB::transaction(function () use ($conversation, $reader, $participant, $finalLastReadMessageId) {
            $participant->update([
                'last_read_message_id' => $finalLastReadMessageId > 0 ? $finalLastReadMessageId : $participant->last_read_message_id,
                'last_read_at' => now(),
                'unread_count' => 0,
            ]);

            if ($finalLastReadMessageId > 0) {
                MessageReceipt::query()->updateOrCreate(
                    [
                        'message_id' => $finalLastReadMessageId,
                        'user_id' => $reader->id,
                    ],
                    [
                        'status' => 'seen',
                        'delivered_at' => now(),
                        'seen_at' => now(),
                    ]
                );
            }
        });

        broadcast(new ConversationRead($conversation->id, $reader->id, $finalLastReadMessageId))->toOthers();

        return [
            'conversation_id' => $conversation->id,
            'user_id' => $reader->id,
            'last_read_message_id' => $finalLastReadMessageId,
            'read_at' => now()->toISOString(),
        ];
    }

    public function toggleReaction(Message $message, User $actor, string $emoji): array
    {
        $payload = DB::transaction(function () use ($message, $actor, $emoji): array {
            $existing = MessageReaction::query()
                ->where('message_id', $message->id)
                ->where('user_id', $actor->id)
                ->where('emoji', $emoji)
                ->lockForUpdate()
                ->first();

            $action = 'added';
            if ($existing) {
                $existing->delete();
                $action = 'removed';
            } else {
                MessageReaction::query()->create([
                    'message_id' => $message->id,
                    'user_id' => $actor->id,
                    'emoji' => $emoji,
                ]);
            }

            return $this->buildReactionMutationPayload($message, $actor, $emoji, $action);
        });

        $this->broadcastReactionUpdated($payload);

        return $payload;
    }

    public function removeReaction(Message $message, User $actor, string $emoji): array
    {
        $payload = DB::transaction(function () use ($message, $actor, $emoji): array {
            MessageReaction::query()
                ->where('message_id', $message->id)
                ->where('user_id', $actor->id)
                ->where('emoji', $emoji)
                ->delete();

            return $this->buildReactionMutationPayload($message, $actor, $emoji, 'removed');
        });

        $this->broadcastReactionUpdated($payload);

        return $payload;
    }

    public function removeMessageForUser(Message $message, User $actor): array
    {
        $hiddenAtIso = DB::transaction(function () use ($message, $actor): string {
            $hiddenAt = now();

            MessageReceipt::query()->updateOrCreate(
                [
                    'message_id' => $message->id,
                    'user_id' => $actor->id,
                ],
                [
                    'status' => 'delivered',
                    'delivered_at' => now(),
                    'hidden_at' => $hiddenAt,
                ]
            );

            $participant = ConversationParticipant::query()
                ->where('conversation_id', (int) $message->conversation_id)
                ->where('user_id', (int) $actor->id)
                ->lockForUpdate()
                ->first();

            if ($participant) {
                $this->refreshUnreadCountForParticipant($participant);
            }

            return $hiddenAt->toISOString();
        });

        broadcast(new MessageRemovedForUser(
            (int) $message->conversation_id,
            (int) $message->id,
            (int) $actor->id,
            $hiddenAtIso
        ))->toOthers();

        return [
            'conversation_id' => (int) $message->conversation_id,
            'message_id' => (int) $message->id,
            'mode' => 'for_you',
            'actor_user_id' => (int) $actor->id,
            'removed_at' => $hiddenAtIso,
        ];
    }

    public function removeMessageForEveryone(Message $message, User $actor): array
    {
        if ((bool) data_get($message->metadata, 'removed_for_everyone', false)) {
            return [
                'conversation_id' => (int) $message->conversation_id,
                'message_id' => (int) $message->id,
                'mode' => 'everywhere',
                'actor_user_id' => (int) data_get($message->metadata, 'removed_for_everyone_by', $actor->id),
                'removed_at' => (string) data_get($message->metadata, 'removed_for_everyone_at', now()->toISOString()),
                'message' => $message->loadMissing([
                    'sender:id,name,email',
                    'attachments',
                    'forwardedFromUser:id,name,email',
                ])->toArray(),
            ];
        }

        $isAdmin = method_exists($actor, 'hasRole') && $actor->hasRole('admin');
        $isOwner = (int) $message->sender_id === (int) $actor->id;

        if ($message->message_type === 'system' && !$isAdmin) {
            throw new AuthorizationException('Only admin can remove system messages for everyone.');
        }

        if (!$isAdmin) {
            if (!$isOwner) {
                throw new AuthorizationException('Only message owner can remove this message for everyone.');
            }

            $removalWindowStartedAt = now()->subMinutes(self::REMOVE_EVERYWHERE_WINDOW_MINUTES);
            if ($message->created_at === null || $message->created_at->lt($removalWindowStartedAt)) {
                throw new AuthorizationException('Remove-from-everywhere window has expired.');
            }
        }

        $payload = DB::transaction(function () use ($message, $actor): array {
            $removedAt = now();

            $metadata = is_array($message->metadata) ? $message->metadata : [];
            $metadata['removed_for_everyone'] = true;
            $metadata['removed_for_everyone_by'] = (int) $actor->id;
            $metadata['removed_for_everyone_at'] = $removedAt->toISOString();
            $metadata['tombstone_text'] = self::REMOVE_EVERYWHERE_TOMBSTONE_TEXT;
            $metadata['original_message_type'] = $message->message_type;
            $metadata['original_body'] = $message->body;

            $message->attachments()->delete();

            $message->forceFill([
                'message_type' => 'system',
                'body' => self::REMOVE_EVERYWHERE_TOMBSTONE_TEXT,
                'metadata' => $metadata,
                'edited_at' => $removedAt,
            ])->save();

            return [
                'conversation_id' => (int) $message->conversation_id,
                'message_id' => (int) $message->id,
                'mode' => 'everywhere',
                'actor_user_id' => (int) $actor->id,
                'removed_at' => $removedAt->toISOString(),
                'message' => $message->fresh([
                    'sender:id,name,email',
                    'attachments',
                    'forwardedFromUser:id,name,email',
                ])->toArray(),
            ];
        });

        broadcast(new MessageRemovedEverywhere(
            $payload['conversation_id'],
            $payload['message_id'],
            $payload['actor_user_id'],
            $payload['removed_at'],
            $payload['message']
        ))->toOthers();

        return $payload;
    }

    public function editMessage(Message $message, User $actor, string $body): Message
    {
        $trimmedBody = trim($body);

        if ($trimmedBody === '') {
            throw ValidationException::withMessages([
                'body' => ['Message body is required.'],
            ]);
        }

        if ((int) $message->sender_id !== (int) $actor->id) {
            throw new AuthorizationException('Only the message sender can edit this message.');
        }

        if ($message->message_type !== 'text') {
            throw new AuthorizationException('Only text messages can be edited.');
        }

        if ($message->attachments && $message->attachments->isNotEmpty()) {
            throw new AuthorizationException('Messages with attachments cannot be edited.');
        }

        $windowStart = now()->subMinutes(self::EDIT_WINDOW_MINUTES);
        if ($message->created_at === null || $message->created_at->lt($windowStart)) {
            throw new AuthorizationException('Edit window has expired.');
        }

        $updated = DB::transaction(function () use ($message, $actor, $trimmedBody): Message {
            MessageEdit::query()->create([
                'message_id' => $message->id,
                'editor_user_id' => $actor->id,
                'old_body' => (string) ($message->body ?? ''),
                'new_body' => $trimmedBody,
                'created_at' => now(),
            ]);

            $message->forceFill([
                'body' => $trimmedBody,
                'edited_at' => now(),
            ])->save();

            return $this->freshMessagePayload($message, (int) $actor->id);
        });

        $editedAtIso = $updated->edited_at?->toISOString() ?? now()->toISOString();
        broadcast(new MessageEdited(
            (int) $updated->conversation_id,
            (int) $updated->id,
            (string) ($updated->body ?? ''),
            $editedAtIso,
            (int) $actor->id
        ))->toOthers();

        return $updated;
    }

    private function syncConversationAfterMessageMutation(
        Conversation $conversation,
        User $actor,
        ConversationParticipant $actorParticipant,
        Message $message
    ): void {
        $conversation->update([
            'last_message_id' => $message->id,
            'last_message_at' => $message->created_at,
        ]);

        $conversation->participants()
            ->where('user_id', '!=', $actor->id)
            ->whereNull('hidden_at')
            ->whereIn('participant_state', ['accepted', 'pending'])
            ->increment('unread_count');

        $actorParticipant->update([
            'last_read_message_id' => $message->id,
            'last_read_at' => now(),
        ]);
    }

    private function freshMessagePayload(Message $message, int $viewerUserId): Message
    {
        return $message->fresh([
            'sender:id,name,email',
            'attachments',
            'replyTo' => function ($replyQuery) use ($viewerUserId): void {
                $replyQuery
                    ->select(['id', 'conversation_id', 'sender_id', 'message_type', 'body', 'created_at', 'deleted_at'])
                    ->visibleToUser($viewerUserId)
                    ->withActiveReactionAggregates($viewerUserId)
                    ->with('sender:id,name,email');
            },
        ]);
    }

    private function buildForwardedSnapshot(Message $sourceMessage): array
    {
        $sourceMessage->loadMissing([
            'sender:id,name,email',
            'attachments:id,message_id,attachment_type,original_name,mime_type,size_bytes,width,height,duration_ms',
        ]);

        return [
            'message_id' => (int) $sourceMessage->id,
            'conversation_id' => (int) $sourceMessage->conversation_id,
            'sender' => $sourceMessage->sender ? [
                'id' => (int) $sourceMessage->sender->id,
                'name' => $sourceMessage->sender->name,
                'email' => $sourceMessage->sender->email,
            ] : null,
            'message_type' => $sourceMessage->message_type,
            'body' => $sourceMessage->body,
            'created_at' => $sourceMessage->created_at?->toISOString(),
            'attachments' => $sourceMessage->attachments
                ->map(fn ($attachment) => [
                    'id' => (int) $attachment->id,
                    'attachment_type' => $attachment->attachment_type,
                    'original_name' => $attachment->original_name,
                    'mime_type' => $attachment->mime_type,
                    'size_bytes' => (int) $attachment->size_bytes,
                    'width' => $attachment->width,
                    'height' => $attachment->height,
                    'duration_ms' => $attachment->duration_ms,
                ])
                ->values()
                ->all(),
        ];
    }

    private function buildReactionMutationPayload(Message $message, User $actor, string $emoji, string $action): array
    {
        $aggregates = MessageReaction::query()
            ->where('message_id', $message->id)
            ->aggregateByMessageAndEmoji((int) $actor->id)
            ->get();

        return [
            'conversation_id' => (int) $message->conversation_id,
            'message_id' => (int) $message->id,
            'emoji' => $emoji,
            'action' => $action,
            'user_id' => (int) $actor->id,
            'reactions_total' => (int) $aggregates->sum(fn ($item) => (int) $item->total),
            'reaction_aggregates' => $aggregates
                ->map(fn ($item) => [
                    'emoji' => (string) $item->emoji,
                    'count' => (int) $item->total,
                    'reacted_by_me' => (bool) ($item->reacted_by_me ?? 0),
                ])
                ->values()
                ->all(),
        ];
    }

    private function broadcastReactionUpdated(array $payload): void
    {
        broadcast(new MessageReactionUpdated(
            (int) $payload['conversation_id'],
            (int) $payload['message_id'],
            (string) $payload['emoji'],
            (string) $payload['action'],
            (int) $payload['user_id'],
            (int) $payload['reactions_total'],
            (array) $payload['reaction_aggregates']
        ))->toOthers();
    }

    private function refreshUnreadCountForParticipant(ConversationParticipant $participant): void
    {
        $lastReadMessageId = (int) ($participant->last_read_message_id ?? 0);

        $unreadCount = Message::query()
            ->where('conversation_id', (int) $participant->conversation_id)
            ->where('sender_id', '!=', (int) $participant->user_id)
            ->where('id', '>', $lastReadMessageId)
            ->visibleToUser((int) $participant->user_id)
            ->count();

        if ((int) $participant->unread_count === $unreadCount) {
            return;
        }

        $participant->update([
            'unread_count' => $unreadCount,
        ]);
    }
}
