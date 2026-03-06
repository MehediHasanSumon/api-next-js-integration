<?php

namespace App\Events\Chat;

use Illuminate\Broadcasting\InteractsWithSockets;
use Illuminate\Broadcasting\PrivateChannel;
use Illuminate\Contracts\Broadcasting\ShouldBroadcastNow;
use Illuminate\Foundation\Events\Dispatchable;
use Illuminate\Queue\SerializesModels;

class MessageReactionUpdated implements ShouldBroadcastNow
{
    use Dispatchable, InteractsWithSockets, SerializesModels;

    public function __construct(
        public int $conversationId,
        public int $messageId,
        public string $emoji,
        public string $action,
        public int $userId,
        public int $reactionsTotal,
        public array $reactionAggregates
    ) {}

    public function broadcastOn(): array
    {
        return [
            new PrivateChannel("conversation.{$this->conversationId}"),
        ];
    }

    public function broadcastAs(): string
    {
        return 'chat.message.reaction.updated';
    }

    public function broadcastWith(): array
    {
        return [
            'conversation_id' => $this->conversationId,
            'message_id' => $this->messageId,
            'emoji' => $this->emoji,
            'action' => $this->action,
            'user_id' => $this->userId,
            'reactions_total' => $this->reactionsTotal,
            'reaction_aggregates' => $this->reactionAggregates,
            'sent_at' => now()->toISOString(),
        ];
    }
}
