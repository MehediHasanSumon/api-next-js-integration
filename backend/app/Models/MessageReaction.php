<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class MessageReaction extends Model
{
    use HasFactory;

    protected $fillable = [
        'message_id',
        'user_id',
        'emoji',
    ];

    public function message(): BelongsTo
    {
        return $this->belongsTo(Message::class);
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    public function scopeActive(Builder $query): Builder
    {
        return $query;
    }

    public function scopeAggregateByMessageAndEmoji(Builder $query, ?int $viewerUserId = null): Builder
    {
        $query
            ->active()
            ->select('message_id', 'emoji')
            ->selectRaw('COUNT(*) as total');

        if ($viewerUserId !== null && $viewerUserId > 0) {
            $query->selectRaw('MAX(CASE WHEN user_id = ? THEN 1 ELSE 0 END) as reacted_by_me', [$viewerUserId]);
        } else {
            $query->selectRaw('0 as reacted_by_me');
        }

        return $query
            ->groupBy('message_id', 'emoji')
            ->orderBy('emoji');
    }
}
