<?php

namespace App\Services\Chat;

use App\Events\Chat\ConversationRead;
use App\Events\Chat\MessageSent;
use App\Models\Conversation;
use App\Models\ConversationParticipant;
use App\Models\Message;
use App\Models\MessageReceipt;
use App\Models\User;
use Illuminate\Support\Arr;
use Illuminate\Support\Facades\DB;

class ChatMessagingService
{
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

            $conversation->update([
                'last_message_id' => $message->id,
                'last_message_at' => $message->created_at,
            ]);

            $conversation->participants()
                ->where('user_id', '!=', $sender->id)
                ->whereNull('hidden_at')
                ->whereIn('participant_state', ['accepted', 'pending'])
                ->increment('unread_count');

            $senderParticipant->update([
                'last_read_message_id' => $message->id,
                'last_read_at' => now(),
            ]);

            return $message->fresh(['sender:id,name,email', 'attachments']);
        });

        broadcast(new MessageSent($conversation->id, $message->toArray()))->toOthers();

        return $message;
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
}
