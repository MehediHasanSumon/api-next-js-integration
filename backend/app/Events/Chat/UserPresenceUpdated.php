<?php

namespace App\Events\Chat;

use Illuminate\Broadcasting\InteractsWithSockets;
use Illuminate\Broadcasting\PrivateChannel;
use Illuminate\Contracts\Broadcasting\ShouldBroadcastNow;
use Illuminate\Foundation\Events\Dispatchable;
use Illuminate\Queue\SerializesModels;

class UserPresenceUpdated implements ShouldBroadcastNow
{
    use Dispatchable, InteractsWithSockets, SerializesModels;

    /**
     * @param array<int> $conversationIds
     * @param array<int> $recipientUserIds
     */
    public function __construct(
        public int $userId,
        public bool $isOnline,
        public ?string $lastSeenAt,
        public array $conversationIds = [],
        public array $recipientUserIds = []
    ) {}

    public function broadcastOn(): array
    {
        $channels = [];

        foreach (array_values(array_unique($this->conversationIds)) as $conversationId) {
            $channels[] = new PrivateChannel("conversation.{$conversationId}");
        }

        $userChannels = array_values(array_unique(array_merge([$this->userId], $this->recipientUserIds)));
        foreach ($userChannels as $recipientUserId) {
            $channels[] = new PrivateChannel("user.{$recipientUserId}");
        }

        return $channels;
    }

    public function broadcastAs(): string
    {
        return 'chat.user.presence.updated';
    }

    public function broadcastWith(): array
    {
        return [
            'user_id' => $this->userId,
            'is_online' => $this->isOnline,
            'last_seen_at' => $this->lastSeenAt,
            'sent_at' => now()->toISOString(),
        ];
    }
}

