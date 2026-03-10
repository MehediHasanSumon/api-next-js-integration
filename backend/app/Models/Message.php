<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\SoftDeletes;

class Message extends Model
{
    use HasFactory, SoftDeletes;

    protected $fillable = [
        'conversation_id',
        'sender_id',
        'message_type',
        'body',
        'metadata',
        'reply_to_message_id',
        'forwarded_from_message_id',
        'forwarded_from_user_id',
        'forwarded_snapshot',
        'client_uid',
        'edited_at',
    ];

    protected function casts(): array
    {
        return [
            'metadata' => 'array',
            'forwarded_snapshot' => 'array',
            'edited_at' => 'datetime',
            'deleted_at' => 'datetime',
        ];
    }

    public function conversation(): BelongsTo
    {
        return $this->belongsTo(Conversation::class);
    }

    public function sender(): BelongsTo
    {
        return $this->belongsTo(User::class, 'sender_id');
    }

    public function replyTo(): BelongsTo
    {
        return $this->belongsTo(self::class, 'reply_to_message_id');
    }

    public function replies(): HasMany
    {
        return $this->hasMany(self::class, 'reply_to_message_id');
    }

    public function forwardedFromMessage(): BelongsTo
    {
        return $this->belongsTo(self::class, 'forwarded_from_message_id');
    }

    public function forwardedMessages(): HasMany
    {
        return $this->hasMany(self::class, 'forwarded_from_message_id');
    }

    public function forwardedFromUser(): BelongsTo
    {
        return $this->belongsTo(User::class, 'forwarded_from_user_id');
    }

    public function attachments(): HasMany
    {
        return $this->hasMany(MessageAttachment::class);
    }

    public function receipts(): HasMany
    {
        return $this->hasMany(MessageReceipt::class);
    }

    public function reactions(): HasMany
    {
        return $this->hasMany(MessageReaction::class);
    }

    public function edits(): HasMany
    {
        return $this->hasMany(MessageEdit::class);
    }

    public function reactionAggregates(): HasMany
    {
        return $this->hasMany(MessageReaction::class);
    }

    public function scopeVisibleToUser(Builder $query, int $userId): Builder
    {
        return $query
            ->whereNull('messages.deleted_at')
            ->whereDoesntHave('receipts', function (Builder $receiptQuery) use ($userId): void {
                $receiptQuery
                    ->where('user_id', $userId)
                    ->whereNotNull('hidden_at');
            });
    }

    public function scopeWithActiveReactionAggregates(Builder $query, ?int $viewerUserId = null): Builder
    {
        return $query
            ->withCount('reactions as reactions_total')
            ->with([
                'reactionAggregates' => function ($reactionQuery) use ($viewerUserId): void {
                    $reactionQuery->aggregateByMessageAndEmoji($viewerUserId);
                },
            ]);
    }
}
