<?php

namespace App\Events\Chat;

use Illuminate\Broadcasting\InteractsWithSockets;
use Illuminate\Broadcasting\PrivateChannel;
use Illuminate\Contracts\Broadcasting\ShouldBroadcastNow;
use Illuminate\Foundation\Events\Dispatchable;
use Illuminate\Queue\SerializesModels;

class ConversationUpdated implements ShouldBroadcastNow
{
    use Dispatchable, InteractsWithSockets, SerializesModels;

    /**
     * @param array<int> $recipientUserIds
     */
    public function __construct(
        public int $conversationId,
        public array $changes,
        public array $recipientUserIds = []
    ) {}

    public function broadcastOn(): array
    {
        $channels = [new PrivateChannel("conversation.{$this->conversationId}")];

        foreach ($this->recipientUserIds as $recipientUserId) {
            $channels[] = new PrivateChannel("user.{$recipientUserId}");
        }

        return $channels;
    }

    public function broadcastAs(): string
    {
        return 'chat.conversation.updated';
    }

    public function broadcastWith(): array
    {
        return [
            'conversation_id' => $this->conversationId,
            'changes' => $this->changes,
            'sent_at' => now()->toISOString(),
        ];
    }
}
