<?php

namespace App\Events\Chat;

class CallAccepted extends BaseCallEvent
{
    public function broadcastAs(): string
    {
        return 'call.accepted';
    }
}
