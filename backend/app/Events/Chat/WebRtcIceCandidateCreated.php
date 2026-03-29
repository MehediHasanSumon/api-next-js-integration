<?php

namespace App\Events\Chat;

class WebRtcIceCandidateCreated extends BaseCallEvent
{
    /**
     * @param array<string, mixed> $call
     * @param array<string, mixed> $signal
     * @param array<int> $recipientUserIds
     */
    public function __construct(
        int $conversationId,
        array $call,
        public array $signal,
        array $recipientUserIds = []
    ) {
        parent::__construct($conversationId, $call, $recipientUserIds);
    }

    public function broadcastAs(): string
    {
        return 'webrtc.ice-candidate';
    }

    public function broadcastWith(): array
    {
        return [
            ...parent::broadcastWith(),
            'signal' => $this->signal,
        ];
    }
}
