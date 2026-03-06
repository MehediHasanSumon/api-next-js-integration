<?php

namespace App\Http\Controllers\Api;

use App\Events\Chat\UserPresenceUpdated;
use App\Http\Controllers\Controller;
use App\Models\ConversationParticipant;
use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Collection;
use Illuminate\Validation\ValidationException;

class PresenceController extends Controller
{
    private const ONLINE_WINDOW_SECONDS = 90;
    private const PRESENCE_STATE_CACHE_TTL_SECONDS = 604800; // 7 days

    public function ping(Request $request): JsonResponse
    {
        $user = $request->user();
        $userId = (int) $user->id;
        $now = now();

        $user->forceFill([
            'last_seen_at' => $now,
            'last_active_at' => $now,
        ])->save();

        $this->broadcastPresenceOnlineIfNeeded($userId, $now->toISOString());

        return response()->json([
            'message' => 'Presence heartbeat received.',
            'server_time' => $now->toISOString(),
            'data' => [
                'user_id' => $userId,
                'is_online' => true,
                'last_seen_at' => $now->toISOString(),
                'last_active_at' => $now->toISOString(),
                'online_window_seconds' => self::ONLINE_WINDOW_SECONDS,
            ],
        ]);
    }

    public function status(Request $request): JsonResponse
    {
        $requestedIds = $this->normalizeRequestedIds($request->query('ids'));

        if ($requestedIds->isEmpty()) {
            throw ValidationException::withMessages([
                'ids' => ['The ids query parameter is required.'],
            ]);
        }

        if ($requestedIds->count() > 100) {
            throw ValidationException::withMessages([
                'ids' => ['You can request status for up to 100 users at a time.'],
            ]);
        }

        $existingIds = User::query()
            ->whereIn('id', $requestedIds->all())
            ->pluck('id')
            ->map(fn ($id) => (int) $id)
            ->all();

        $missingIds = array_values(array_diff($requestedIds->all(), $existingIds));
        if (!empty($missingIds)) {
            throw ValidationException::withMessages([
                'ids' => ['One or more requested user ids are invalid.'],
            ]);
        }

        $authUserId = (int) $request->user()->id;

        $visiblePeerIds = ConversationParticipant::query()
            ->from('conversation_participants as cp_self')
            ->join('conversation_participants as cp_other', function ($join): void {
                $join->on('cp_self.conversation_id', '=', 'cp_other.conversation_id');
            })
            ->where('cp_self.user_id', $authUserId)
            ->whereNull('cp_self.hidden_at')
            ->whereNull('cp_other.hidden_at')
            ->whereIn('cp_other.user_id', $requestedIds->all())
            ->pluck('cp_other.user_id')
            ->map(fn ($id) => (int) $id)
            ->unique()
            ->values();

        $allowedIds = $requestedIds
            ->filter(fn (int $userId): bool => $userId === $authUserId || $visiblePeerIds->contains($userId))
            ->values();

        $usersById = User::query()
            ->select(['id', 'last_seen_at'])
            ->whereIn('id', $allowedIds->all())
            ->get()
            ->keyBy('id');

        $now = now();
        $onlineThreshold = $now->copy()->subSeconds(self::ONLINE_WINDOW_SECONDS);

        $usersById->each(function (User $statusUser) use ($onlineThreshold): void {
            $this->broadcastPresenceOfflineIfInferred($statusUser, $onlineThreshold);
        });

        $data = $allowedIds
            ->map(function (int $userId) use ($onlineThreshold, $usersById): array {
                /** @var User|null $statusUser */
                $statusUser = $usersById->get($userId);
                $lastSeenAt = $statusUser?->last_seen_at;

                return [
                    'user_id' => $userId,
                    'is_online' => $lastSeenAt !== null && $lastSeenAt->greaterThanOrEqualTo($onlineThreshold),
                    'last_seen_at' => $lastSeenAt?->toISOString(),
                ];
            })
            ->values();

        return response()->json([
            'message' => 'Presence status fetched.',
            'server_time' => $now->toISOString(),
            'online_window_seconds' => self::ONLINE_WINDOW_SECONDS,
            'data' => $data,
        ]);
    }

    private function normalizeRequestedIds(mixed $idsParam): Collection
    {
        if (is_string($idsParam)) {
            $rawIds = explode(',', $idsParam);
        } elseif (is_array($idsParam)) {
            $rawIds = $idsParam;
        } else {
            $rawIds = [];
        }

        return collect($rawIds)
            ->map(fn ($value) => is_string($value) ? trim($value) : $value)
            ->filter(fn ($value) => $value !== '' && $value !== null)
            ->map(function ($value): ?int {
                if (!is_numeric($value)) {
                    return null;
                }

                $id = (int) $value;
                return $id > 0 ? $id : null;
            })
            ->filter()
            ->unique()
            ->values();
    }

    private function visibleConversationIds(int $userId): Collection
    {
        return ConversationParticipant::query()
            ->where('user_id', $userId)
            ->whereNull('hidden_at')
            ->whereIn('participant_state', ['accepted', 'pending'])
            ->pluck('conversation_id')
            ->map(fn ($id) => (int) $id)
            ->unique()
            ->values();
    }

    private function visibleRecipientUserIds(Collection $conversationIds): Collection
    {
        if ($conversationIds->isEmpty()) {
            return collect();
        }

        return ConversationParticipant::query()
            ->whereIn('conversation_id', $conversationIds->all())
            ->whereNull('hidden_at')
            ->whereIn('participant_state', ['accepted', 'pending'])
            ->pluck('user_id')
            ->map(fn ($id) => (int) $id)
            ->unique()
            ->values();
    }

    private function broadcastPresenceOnlineIfNeeded(int $userId, string $lastSeenAtIso): void
    {
        if ($this->getBroadcastedPresenceState($userId) === 'online') {
            return;
        }

        $conversationIds = $this->visibleConversationIds($userId);
        $recipientUserIds = $this->visibleRecipientUserIds($conversationIds);

        broadcast(new UserPresenceUpdated(
            $userId,
            true,
            $lastSeenAtIso,
            $conversationIds->all(),
            $recipientUserIds->all()
        ))->toOthers();

        $this->setBroadcastedPresenceState($userId, 'online');
    }

    private function broadcastPresenceOfflineIfInferred(User $statusUser, \DateTimeInterface $onlineThreshold): void
    {
        $userId = (int) $statusUser->id;
        $lastSeenAt = $statusUser->last_seen_at;

        // Offline is inferred only after timeout and only if previously broadcast as online.
        if ($lastSeenAt === null || $lastSeenAt->greaterThanOrEqualTo($onlineThreshold)) {
            return;
        }

        if ($this->getBroadcastedPresenceState($userId) !== 'online') {
            return;
        }

        $conversationIds = $this->visibleConversationIds($userId);
        $recipientUserIds = $this->visibleRecipientUserIds($conversationIds);

        broadcast(new UserPresenceUpdated(
            $userId,
            false,
            $lastSeenAt->toISOString(),
            $conversationIds->all(),
            $recipientUserIds->all()
        ))->toOthers();

        $this->setBroadcastedPresenceState($userId, 'offline');
    }

    private function getBroadcastedPresenceState(int $userId): ?string
    {
        $value = Cache::get($this->presenceStateCacheKey($userId));
        return in_array($value, ['online', 'offline'], true) ? $value : null;
    }

    private function setBroadcastedPresenceState(int $userId, string $state): void
    {
        Cache::put(
            $this->presenceStateCacheKey($userId),
            $state,
            now()->addSeconds(self::PRESENCE_STATE_CACHE_TTL_SECONDS)
        );
    }

    private function presenceStateCacheKey(int $userId): string
    {
        return "presence:last_broadcasted_state:{$userId}";
    }
}
