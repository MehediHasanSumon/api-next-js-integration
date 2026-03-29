<?php

namespace App\Events\Chat;

class CallMissed extends BaseCallEvent
{
    public function broadcastAs(): string
    {
        return 'call.missed';
    }
}
