<?php

namespace App\Events\Chat;

use Illuminate\Broadcasting\InteractsWithSockets;
use Illuminate\Broadcasting\PrivateChannel;
use Illuminate\Contracts\Broadcasting\ShouldBroadcastNow;
use Illuminate\Foundation\Events\Dispatchable;
use Illuminate\Queue\SerializesModels;

class ConversationThreadUpdated implements ShouldBroadcastNow
{
    use Dispatchable, InteractsWithSockets, SerializesModels;

    /**
     * @param array<int> $recipientUserIds
     */
    public function __construct(
        public int $conversationId,
        public array $message,
        public array $recipientUserIds = []
    ) {}

    public function broadcastOn(): array
    {
        return array_map(
            fn (int $userId) => new PrivateChannel("user.{$userId}"),
            $this->recipientUserIds
        );
    }

    public function broadcastAs(): string
    {
        return 'chat.thread.updated';
    }

    public function broadcastWith(): array
    {
        return [
            'conversation_id' => $this->conversationId,
            'message' => $this->message,
            'sent_at' => now()->toISOString(),
        ];
    }
}
