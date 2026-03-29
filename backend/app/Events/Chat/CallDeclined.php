<?php

namespace App\Events\Chat;

class CallDeclined extends BaseCallEvent
{
    public function broadcastAs(): string
    {
        return 'call.declined';
    }
}
