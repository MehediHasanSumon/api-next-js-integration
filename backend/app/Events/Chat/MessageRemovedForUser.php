<?php

namespace App\Events\Chat;

use Illuminate\Broadcasting\InteractsWithSockets;
use Illuminate\Broadcasting\PrivateChannel;
use Illuminate\Contracts\Broadcasting\ShouldBroadcastNow;
use Illuminate\Foundation\Events\Dispatchable;
use Illuminate\Queue\SerializesModels;

class MessageRemovedForUser implements ShouldBroadcastNow
{
    use Dispatchable, InteractsWithSockets, SerializesModels;

    public function __construct(
        public int $conversationId,
        public int $messageId,
        public int $actorUserId,
        public string $removedAt
    ) {}

    public function broadcastOn(): array
    {
        return [
            new PrivateChannel("user.{$this->actorUserId}"),
        ];
    }

    public function broadcastAs(): string
    {
        return 'chat.message.removed';
    }

    public function broadcastWith(): array
    {
        return [
            'conversation_id' => $this->conversationId,
            'message_id' => $this->messageId,
            'mode' => 'for_you',
            'actor_user_id' => $this->actorUserId,
            'removed_at' => $this->removedAt,
        ];
    }
}
