<?php

namespace App\Events\Chat;

class CallEnded extends BaseCallEvent
{
    public function broadcastAs(): string
    {
        return 'call.ended';
    }
}
