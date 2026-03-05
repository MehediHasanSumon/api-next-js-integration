<?php

namespace App\Http\Controllers\Api\Chat;

use App\Events\Chat\ConversationTyping;
use App\Http\Controllers\Controller;
use App\Http\Requests\Chat\TypingRequest;
use App\Models\Conversation;
use App\Services\Chat\ConversationAccessService;
use Illuminate\Http\JsonResponse;

class TypingController extends Controller
{
    public function update(
        TypingRequest $request,
        Conversation $conversation,
        ConversationAccessService $accessService
    ): JsonResponse {
        $accessService->requireAcceptedParticipant($conversation, $request->user());

        broadcast(new ConversationTyping(
            (int) $conversation->id,
            (int) $request->user()->id,
            (bool) $request->validated('is_typing')
        ))->toOthers();

        return response()->json([
            'message' => 'Typing status updated.',
            'conversation_id' => $conversation->id,
            'is_typing' => (bool) $request->validated('is_typing'),
        ]);
    }
}
