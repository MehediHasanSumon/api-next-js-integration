<?php

namespace App\Events\Chat;

use Illuminate\Broadcasting\InteractsWithSockets;
use Illuminate\Broadcasting\PrivateChannel;
use Illuminate\Contracts\Broadcasting\ShouldBroadcastNow;
use Illuminate\Foundation\Events\Dispatchable;
use Illuminate\Queue\SerializesModels;

abstract class BaseCallEvent implements ShouldBroadcastNow
{
    use Dispatchable, InteractsWithSockets, SerializesModels;

    /**
     * @param array<string, mixed> $call
     * @param array<int> $recipientUserIds
     */
    public function __construct(
        public int $conversationId,
        public array $call,
        public array $recipientUserIds = []
    ) {}

    public function broadcastOn(): array
    {
        $channels = [new PrivateChannel("conversation.{$this->conversationId}")];

        foreach (array_values(array_unique($this->recipientUserIds)) as $recipientUserId) {
            $channels[] = new PrivateChannel("user.{$recipientUserId}");
        }

        return $channels;
    }

    public function broadcastWith(): array
    {
        return [
            'conversation_id' => $this->conversationId,
            'call' => $this->call,
            'sent_at' => now()->toISOString(),
        ];
    }
}
