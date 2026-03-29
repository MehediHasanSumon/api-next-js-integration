<?php

namespace App\Events\Chat;

class IncomingCall extends BaseCallEvent
{
    public function broadcastAs(): string
    {
        return 'call.invite';
    }
}
